/**
 * 全局输入分发
 *
 * 接收按键数据，根据当前问题类型分发到对应模块。
 * 处理全局按键（← → 切换问题、Esc 取消、Enter 提交/前进、Tab 编辑自定义）。
 */

import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import type { Core } from "./core";
import type { Question } from "./types";
import { getOptionsWithCustom } from "./render";
import { handleSelectInput } from "./modules/select";
import { handleMultiSelectInput } from "./modules/multiSelect";
import { enterTextEdit, saveTextDraft } from "./modules/text";
import type { ThemeLike } from "./modules/shared";

/** 提交回调类型 */
export type SubmitCallback = (cancelled: boolean) => void;

/**
 * 创建全局输入处理器。
 * 返回 handleInput 函数，供 ctx.ui.custom 使用。
 */
export function createInputHandler(
  core: Core,
  editor: Editor,
  submitFn: SubmitCallback,
  onUpdate: () => void,
  theme: ThemeLike,
  originalQuestions: Question[],
  saveFn: () => void,
) {
  /**
   * 提交当前问题的答案（答案已由各模块填充到 core）
   */
  function submitCurrentQuestion(options: { allowEmpty?: boolean } = {}): boolean {
    const q = core.currentQuestion();
    if (!q) return false;

    const state = core.getUIState();

    // 根据类型构建答案
    switch (q.type) {
      case "select": {
        const opts = getOptionsWithCustom(q);
        const selIdx = state.selectedIndices[0] ?? -1;
        const selected = opts[selIdx];
        const isCustom = selected?.isCustom === true;
        const customText = state.customText?.trim() || "";
        const hasSelection = !!selected && (!isCustom || customText.length > 0);

        if (!hasSelection) {
          core.deleteAnswer(q.id);
          return true;
        }

        const value = isCustom ? customText : selected.value;
        const label = isCustom ? customText : selected.label;
        const validation = core.validate(q.id, [value], [label]);
        if (!validation.valid) {
          core.errorMessage = validation.message || null;
          onUpdate();
          return false;
        }

        core.saveAnswer(q.id, { value, label, wasCustom: isCustom || undefined });
        return true;
      }

      case "multiSelect": {
        const opts = getOptionsWithCustom(q);
        const selIndices = state.selectedIndices;
        const customText = state.customText?.trim() || "";

        if (selIndices.length === 0) {
          core.deleteAnswer(q.id);
          return true;
        }

        const values: string[] = [];
        const labels: string[] = [];
        let hasCustom = false;

        for (const idx of selIndices) {
          const opt = opts[idx];
          if (!opt) continue;
          if (opt.isCustom) {
            if (!customText) continue;
            values.push(customText);
            labels.push(customText);
            hasCustom = true;
          } else {
            values.push(opt.value);
            labels.push(opt.label);
          }
        }

        if (values.length === 0) {
          core.deleteAnswer(q.id);
          return true;
        }

        // 约束校验
        const validation = core.validate(q.id, values, labels);
        if (!validation.valid) {
          core.errorMessage = validation.message || null;
          onUpdate();
          return false; // 校验失败，不前进
        }

        core.saveAnswer(q.id, { values, labels, wasCustom: hasCustom || undefined });
        return true;
      }

      case "text": {
        const state = core.getUIState();
        const existing = core.answers.get(q.id);
        const existingText = existing && 'text' in existing ? existing.text : "";
        const rawText = core.inputMode && core.inputQuestionId === q.id
          ? editor.getText()
          : (state.textDraft || existingText);
        const text = rawText.trim();
        state.textDraft = rawText;
        core.saveUIState(state);

        if (!text) {
          core.deleteAnswer(q.id);
          if (options.allowEmpty || q.id === "__lq_notes__") {
            return true;
          }
          core.leaveCurrentQuestion();
          core.errorMessage = "请输入内容";
          onUpdate();
          return false;
        }

        // 约束校验
        const validation = core.validate(q.id, [text], [text]);
        if (!validation.valid) {
          core.errorMessage = validation.message || null;
          onUpdate();
          return false;
        }

        core.saveAnswer(q.id, { text });
        return true;
      }

      case "confirm": {
        const label = state.confirmValue ? (q.yesLabel || "是") : (q.noLabel || "否");
        core.saveAnswer(q.id, { confirmed: state.confirmValue, label });
        return true;
      }

      case "rating": {
        const v = state.ratingValue;
        const annot = q.annotations?.[String(v)] || "";
        core.saveAnswer(q.id, { value: v, annotation: annot });
        return true;
      }

      default:
        return true;
    }
  }

  /**
   * 前进到下一个问题或提交页。提交当前问题的答案（如果尚未提交）。
   */
  function advance() {
    const q = core.currentQuestion();
    const answeredId = q?.id;
    
    if (q) {
      // 每次 Enter 都以当前草稿重新提交，允许回退修改已答问题
      const submitted = submitCurrentQuestion();
      if (!submitted) return; // 校验失败
      core.leaveCurrentQuestion();
    }

    // 重新展开子问题（根据最新答案插入/移除子问题）
    if (answeredId) {
      core.reexpand(originalQuestions);
      // 找到刚处理完的问题的新位置，前进到下一题
      const answeredNewIdx = core.questions.findIndex((q) => q.id === answeredId);
      if (answeredNewIdx >= 0) {
        core.currentIndex = Math.min(answeredNewIdx + 1, core.questions.length);
      } else {
        core.advance();
      }
    } else {
      core.advance();
    }

    // 单题问卷答完后直接返回结果；多题问卷进入提交页汇总确认
    if (core.questions.length === 1 && core.currentIndex >= core.questions.length && core.allAnswered()) {
      saveFn();
      submitFn(false);
      return;
    }

    // 标记新问题为已访问，但不自动进入编辑态；text/confirm/rating 需按 Tab 编辑
    const newQ = core.currentQuestion();
    if (newQ) {
      core.visited.add(newQ.id);
    }
    core.inputMode = false;
    core.inputQuestionId = null;
    editor.setText("");
    // 自动保存状态
    saveFn();
    onUpdate();
  }

  /**
   * 通过 Tab 栏左右切换离开当前问题。
   * 有有效草稿/默认值时保存答案；空值允许离开并标红；约束失败时阻止离开。
   */
  function switchTab(direction: "prev" | "next") {
    const submitted = submitCurrentQuestion({ allowEmpty: true });
    if (!submitted) return;
    core.leaveCurrentQuestion();
    if (direction === "prev") {
      core.prevTab();
    } else {
      core.nextTab();
    }
    core.inputMode = false;
    core.inputQuestionId = null;
    editor.setText("");
    saveFn();
    onUpdate();
  }

  /**
   * 主输入处理函数
   */
  function handleInput(data: string) {
    // ─── 编辑模式（自定义/text/confirm/rating） ───
    if (core.inputMode) {
      const q = core.currentQuestion();
      if (!q) return;

      if (matchesKey(data, Key.escape)) {
        if (q.type === "text") {
          saveTextDraft(core, editor);
        }
        core.inputMode = false;
        core.inputQuestionId = null;
        editor.setText("");
        onUpdate();
        return;
      }

      if (q.type === "confirm") {
        if (matchesKey(data, Key.left)) {
          const state = core.getUIState();
          state.optionIndex = 0; // 光标移到「是」
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.right)) {
          const state = core.getUIState();
          state.optionIndex = 1; // 光标移到「否」
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.space)) {
          const state = core.getUIState();
          state.confirmValue = state.optionIndex === 0; // ● 移到光标位置
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          const state = core.getUIState();
          state.confirmValue = state.optionIndex === 0; // 确认选中
          core.saveUIState(state);
          core.inputMode = false;
          core.inputQuestionId = null;
          saveFn();
          onUpdate();
          return;
        }
        return;
      }

      if (q.type === "rating") {
        if (matchesKey(data, Key.left)) {
          const state = core.getUIState();
          state.ratingValue = Math.max(1, state.ratingValue - 1);
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.right)) {
          const state = core.getUIState();
          state.ratingValue = Math.min(5, state.ratingValue + 1);
          core.saveUIState(state);
          onUpdate();
          return;
        }
        const numMatch = /^[1-9]$/.exec(data);
        if (numMatch) {
          const target = parseInt(numMatch[0], 10);
          if (target >= 1 && target <= 5) {
            const state = core.getUIState();
            state.ratingValue = target;
            core.saveUIState(state);
            onUpdate();
          }
          return;
        }
        if (matchesKey(data, Key.enter)) {
          core.inputMode = false;
          core.inputQuestionId = null;
          saveFn();
          onUpdate();
          return;
        }
        return;
      }

      if (q.type === "text") {
        if (matchesKey(data, Key.enter)) {
          saveTextDraft(core, editor);
          core.inputMode = false;
          core.inputQuestionId = null;
          editor.setText("");
          saveFn();
          onUpdate();
          return;
        }
        editor.handleInput(data);
        onUpdate();
        return;
      }

      if (matchesKey(data, Key.enter)) {
        // 保存自定义内容，返回选项列表
        const text = editor.getText().trim();
        const state = core.getUIState();
        state.customText = text || null;
        core.saveUIState(state);
        core.inputMode = false;
        core.inputQuestionId = null;
        editor.setText("");
        onUpdate();
        return;
      }
      editor.handleInput(data);
      onUpdate();
      return;
    }

    // ─── 提交页 ───
    if (core.isSubmitTab()) {
      if (matchesKey(data, Key.enter)) {
        if (core.allAnswered()) {
          submitFn(false);
        }
        // 未全部回答时不响应
        return;
      }
      if (matchesKey(data, Key.escape)) {
        submitFn(true);
        return;
      }
      if (matchesKey(data, Key.left)) {
        core.prevTab();
        onUpdate();
        return;
      }
      if (matchesKey(data, Key.right)) {
        core.nextTab();
        onUpdate();
        return;
      }
      return;
    }

    const q = core.currentQuestion();
    if (!q) return;

    const isMultiQuestion = core.questions.length > 1;

    // ─── 全局按键 ───

    // Esc: 取消问卷
    if (matchesKey(data, Key.escape)) {
      submitFn(true);
      return;
    }

    // ← → 切换问题（多问题模式）；题目编辑态需先按 Tab 进入
    if (isMultiQuestion) {
      if (matchesKey(data, Key.left)) {
        switchTab("prev");
        return;
      }
      if (matchesKey(data, Key.right)) {
        switchTab("next");
        return;
      }
    }

    // ─── 类型特定输入 ───

    switch (q.type) {
      case "select": {
        // 先尝试类型特定按键
        if (handleSelectInput(core, data, editor, theme)) {
          onUpdate();
          return;
        }

        // Tab: 在“自定义”选项上进入编辑模式（与 Space 选择独立）
        if (matchesKey(data, Key.tab)) {
          const state = core.getUIState();
          const opts = getOptionsWithCustom(q);
          if (opts[state.optionIndex]?.isCustom) {
            core.inputMode = true;
            core.inputQuestionId = q.id;
            editor.setText(state.customText || "");
            onUpdate();
            return;
          }
        }

        // Space: 标定/取消选项
        if (matchesKey(data, Key.space)) {
          const state = core.getUIState();
          if (state.selectedIndices.includes(state.optionIndex)) {
            state.selectedIndices = [];
          } else {
            state.selectedIndices = [state.optionIndex];
          }
          core.saveUIState(state);
          onUpdate();
          return;
        }

        // Enter: 提交
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        break;
      }

      case "multiSelect": {
        if (handleMultiSelectInput(core, data, editor, theme)) {
          onUpdate();
          return;
        }

        // Tab: 在“自定义”选项上进入编辑模式（与 Space 勾选独立）
        if (matchesKey(data, Key.tab)) {
          const state = core.getUIState();
          const opts = getOptionsWithCustom(q);
          if (opts[state.optionIndex]?.isCustom) {
            core.inputMode = true;
            core.inputQuestionId = q.id;
            editor.setText(state.customText || "");
            onUpdate();
            return;
          }
        }

        // Space: 切换勾选
        if (matchesKey(data, Key.space)) {
          const state = core.getUIState();
          const idx = state.selectedIndices.indexOf(state.optionIndex);
          if (idx >= 0) {
            state.selectedIndices.splice(idx, 1);
          } else {
            // 检查 maxSelect 限制（自定义选项也计入选择数）
            if (q.maxSelect && state.selectedIndices.length >= q.maxSelect) {
              core.errorMessage = `最多选择 ${q.maxSelect} 项`;
            } else {
              state.selectedIndices.push(state.optionIndex);
              core.errorMessage = null;
            }
          }
          core.saveUIState(state);
          onUpdate();
          return;
        }

        // Enter: 提交
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        break;
      }

      case "text": {
        if (matchesKey(data, Key.tab)) {
          core.inputMode = true;
          core.inputQuestionId = q.id;
          enterTextEdit(core, editor);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        return;
      }

      case "confirm": {
        if (matchesKey(data, Key.tab)) {
          core.inputMode = true;
          core.inputQuestionId = q.id;
          // 进入选择态时，光标初始位置与当前 ● 一致
          const state = core.getUIState();
          state.optionIndex = state.confirmValue ? 0 : 1;
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        break;
      }
      case "rating": {
        if (matchesKey(data, Key.tab)) {
          core.inputMode = true;
          core.inputQuestionId = q.id;
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        break;
      }
    }
  }

  return handleInput;
}
