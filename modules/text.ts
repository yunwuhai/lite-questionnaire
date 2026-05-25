/**
 * 文本输入问题模块
 *
 * 进入即内联编辑。Enter 提交并前进，Esc 取消问卷。
 * ← → 切换问题前保存草稿（通过 editor.getText()）。
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

  // 渲染编辑器内容
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
  editor.setText(state.textDraft || "");
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
