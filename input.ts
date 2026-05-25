/**
 * 全局输入分发
 *
 * 接收按键数据，根据当前问题类型分发到对应模块。
 * 处理全局按键（← → 切换问题、Esc 取消、Enter 提交/前进、Tab 编辑自定义）。
 */

import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import type { Question } from "../types";
import { getOptionsWithCustom } from "../render";
import { handleSelectInput } from "../modules/select";
import { handleMultiSelectInput } from "../modules/multiSelect";
import { enterTextEdit, saveTextDraft } from "../modules/text";
import type { ThemeLike } from "../modules/shared";

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
) {
  /**
   * 提交当前问题的答案（答案已由各模块填充到 core）
   */
  function submitCurrentQuestion(): boolean {
    const q = core.currentQuestion();
    if (!q) return false;

    const state = core.getUIState();
    const isMultiQuestion = core.questions.length > 1;

    // 根据类型构建答案
    switch (q.type) {
      case "select": {
        const opts = getOptionsWithCustom(q);
        const hasCustomText = state.customText !== null;
        const hasSelection = state.selectedIndices.length > 0 || hasCustomText;

        if (!hasSelection) {
          // 没有选择：标记为访问过，继续前进（进度点红色）
          core.markVisited();
          return true;
        }

        const selIdx = state.selectedIndices[0] ?? -1;
        const isCustom = state.selectedIndices.length === 0 && hasCustomText;
        const value = isCustom ? (state.customText!) : opts[selIdx].value;
        const label = isCustom ? (state.customText!) : opts[selIdx].label;

        core.saveAnswer(q.id, [value], [label], isCustom, isCustom ? undefined : [selIdx + 1]);
        return true;
      }

      case "multiSelect": {
        const opts = getOptionsWithCustom(q);
        const selIndices = state.selectedIndices;
        const hasCustomText = state.customText !== null;
        const hasSelection = selIndices.length > 0 || hasCustomText;

        if (!hasSelection) {
          // 多选没有选择
          core.markVisited();
          return true;
        }

        const values: string[] = [];
        const labels: string[] = [];
        const indices: number[] = [];

        for (const idx of selIndices) {
          values.push(opts[idx].value);
          labels.push(opts[idx].label);
          indices.push(idx + 1);
        }

        if (hasCustomText) {
          values.push(state.customText!);
          labels.push(state.customText!);
        }

        // 约束校验
        const validation = core.validate(q.id, values, labels);
        if (!validation.valid) {
          core.errorMessage = validation.message || null;
          onUpdate();
          return false; // 校验失败，不前进
        }

        core.saveAnswer(q.id, values, labels, hasCustomText, indices.length > 0 ? indices : undefined);
        return true;
      }

      case "text": {
        const text = editor.getText().trim();
        if (!text) {
          // 文本为空，标记访问
          core.markVisited();
          return true;
        }

        // 约束校验
        const validation = core.validate(q.id, [text], [text]);
        if (!validation.valid) {
          core.errorMessage = validation.message || null;
          onUpdate();
          return false;
        }

        core.saveAnswer(q.id, [text], [text], false);
        return true;
      }

      case "confirm": {
        const value = state.confirmValue ? (q.yesLabel || "是") : (q.noLabel || "否");
        core.saveAnswer(q.id, [String(state.confirmValue)], [value], false);
        return true;
      }

      case "rating": {
        const value = state.ratingValue;
        const annot = q.annotations?.[value] || "";
        core.saveAnswer(q.id, [String(value)], [annot || String(value)], false);
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
    
    if (q && !core.hasAnswer(q.id)) {
      // 尝试提交当前问题
      const submitted = submitCurrentQuestion();
      if (!submitted) return; // 校验失败
    }

    // 重新展开子问题（根据最新答案插入/移除子问题）
    if (answeredId) {
      core.reexpand(originalQuestions);
      // 找到刚答完的问题的新位置，前进到下一题
      const answeredNewIdx = core.questions.findIndex((q) => q.id === answeredId);
      if (answeredNewIdx >= 0) {
        core.currentIndex = answeredNewIdx + 1;
      } else {
        core.advance();
      }
    } else {
      core.advance();
    }

    // 如果新问题是 text 类型，进入编辑模式
    const newQ = core.currentQuestion();
    if (newQ) {
      core.visited.add(newQ.id);
      if (newQ.type === "text") {
        enterTextEdit(core, editor);
      }
    }
    // 自动保存状态
    saveFn();
    onUpdate();
  }

  /**
   * 主输入处理函数
   */
  function handleInput(data: string) {
    // ─── 编辑模式（自定义选项编辑） ───
    if (core.inputMode) {
      if (matchesKey(data, Key.escape)) {
        // 放弃编辑，返回选项列表
        const state = core.getUIState();
        state.customText = null;
        core.saveUIState(state);
        core.inputMode = false;
        core.inputQuestionId = null;
        editor.setText("");
        onUpdate();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        // 保存编辑内容，返回选项列表
        const text = editor.getText().trim();
        const state = core.getUIState();
        if (text) {
          state.customText = text;
        } else {
          state.customText = null;
        }
        core.saveUIState(state);
        core.inputMode = false;
        core.inputQuestionId = null;
        editor.setText("");
        onUpdate();
        return;
      }
      // 其他按键交给编辑器
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
      if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
        core.prevTab();
        onUpdate();
        return;
      }
      if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
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

    // ← → 切换问题（多问题模式）
    if (isMultiQuestion) {
      if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
        // 保存当前问题的草稿
        if (q.type === "text") {
          saveTextDraft(core, editor);
        }
        // 标记当前问题为已访问
        core.markVisited();
        core.prevTab();
        // 如果新问题是 text 类型，恢复编辑器
        const newQ = core.currentQuestion();
        if (newQ && newQ.type === "text") {
          enterTextEdit(core, editor);
        }
        onUpdate();
        return;
      }
      if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
        if (q.type === "text") {
          saveTextDraft(core, editor);
        }
        core.markVisited();
        core.nextTab();
        const newQ = core.currentQuestion();
        if (newQ && newQ.type === "text") {
          enterTextEdit(core, editor);
        }
        onUpdate();
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

        // Space: 标定/取消选项
        if (matchesKey(data, Key.space)) {
          const state = core.getUIState();
          const opts = getOptionsWithCustom(q);
          const curOpt = opts[state.optionIndex];

          if (curOpt?.isCustom) {
            // 自定义选项：进入编辑模式
            core.inputMode = true;
            core.inputQuestionId = q.id;
            editor.setText(state.customText || "");
          } else {
            // 普通选项：切换选择
            if (state.selectedIndices.includes(state.optionIndex)) {
              state.selectedIndices = [];
            } else {
              state.selectedIndices = [state.optionIndex];
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

      case "multiSelect": {
        if (handleMultiSelectInput(core, data, editor, theme)) {
          onUpdate();
          return;
        }

        // Space: 切换勾选
        if (matchesKey(data, Key.space)) {
          const state = core.getUIState();
          const opts = getOptionsWithCustom(q);
          const curOpt = opts[state.optionIndex];

          if (curOpt?.isCustom) {
            // 自定义选项：进入编辑模式
            core.inputMode = true;
            core.inputQuestionId = q.id;
            editor.setText(state.customText || "");
          } else {
            // 切换勾选
            const idx = state.selectedIndices.indexOf(state.optionIndex);
            if (idx >= 0) {
              state.selectedIndices.splice(idx, 1);
            } else {
              // 检查 maxSelect 限制
              if (q.maxSelect && state.selectedIndices.length >= q.maxSelect) {
                core.errorMessage = `最多选择 ${q.maxSelect} 项`;
              } else {
                state.selectedIndices.push(state.optionIndex);
                core.errorMessage = null;
              }
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
        // Enter: 提交
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        // 其他按键交给编辑器
        editor.handleInput(data);
        onUpdate();
        return;
      }

      case "confirm": {
        // ← 选择是，→ 选择否
        if (matchesKey(data, Key.left)) {
          const state = core.getUIState();
          state.confirmValue = true;
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.right)) {
          const state = core.getUIState();
          state.confirmValue = false;
          core.saveUIState(state);
          onUpdate();
          return;
        }
        // Enter: 确认
        if (matchesKey(data, Key.enter)) {
          advance();
          return;
        }
        break;
      }

      case "rating": {
        // ← 减小值，→ 增大值
        if (matchesKey(data, Key.left)) {
          const state = core.getUIState();
          state.ratingValue = Math.max(q.range.min, state.ratingValue - 1);
          core.saveUIState(state);
          onUpdate();
          return;
        }
        if (matchesKey(data, Key.right)) {
          const state = core.getUIState();
          state.ratingValue = Math.min(q.range.max, state.ratingValue + 1);
          core.saveUIState(state);
          onUpdate();
          return;
        }
        // 数字键 1-9 快捷跳转
        const numMatch = /^[1-9]$/.exec(data);
        if (numMatch) {
          const target = parseInt(numMatch[0], 10);
          if (target >= q.range.min && target <= q.range.max) {
            const state = core.getUIState();
            state.ratingValue = target;
            core.saveUIState(state);
            onUpdate();
          }
          return;
        }
        // Enter: 确认
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
