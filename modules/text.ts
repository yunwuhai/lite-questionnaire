/**
 * 文本输入问题模块
 *
 * 默认显示只读摘要；按 Tab 进入内联编辑。
 * 编辑态 Enter 提交并前进，Esc 退出编辑。
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import type { ThemeLike } from "./shared";

/**
 * 渲染文本输入问题（内联编辑器）
 */
export function renderTextQuestion(
  core: Core,
  width: number,
  theme: ThemeLike,
  editor: Editor,
): string[] {
  const q = core.currentQuestion();
  if (!q || q.type !== "text") return [];

  const lines: string[] = [];
  const placeholder = q.placeholder || "输入内容...";

  lines.push(" " + theme.fg("muted", "你的回答："));
  lines.push("");

  if (!core.inputMode) {
    const state = core.getUIState();
    const existing = core.answers.get(q.id);
    const text = existing && 'text' in existing ? existing.text : state.textDraft;
    lines.push(" " + theme.fg("dim", text ? `> ${text}` : `> ${placeholder}`));
    return lines;
  }

  // 编辑态渲染编辑器内容
  const editorLines = editor.render(width - 2);
  if (editorLines.length === 0) {
    lines.push(" " + theme.fg("dim", `> ${placeholder}`));
  } else {
    for (const line of editorLines) {
      lines.push(" " + line);
    }
  }

  return lines;
}

/**
 * 进入文本编辑模式 - 恢复草稿并激活编辑器
 */
export function enterTextEdit(core: Core, editor: Editor): void {
  const state = core.getUIState();
  const q = core.currentQuestion();
  const existing = q ? core.answers.get(q.id) : undefined;
  const existingText = existing && 'text' in existing ? existing.text : "";
  editor.setText(state.textDraft || existingText || "");
}

/**
 * 离开文本编辑模式 - 保存草稿
 */
export function saveTextDraft(core: Core, editor: Editor): void {
  const text = editor.getText();
  const state = core.getUIState();
  state.textDraft = text;
  core.saveUIState(state);
}
