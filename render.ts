/**
 * Questionnaire 通用渲染函数
 *
 * 面板框架、Tab 栏（含进度点）、提交汇总页、提示栏等。
 */

import type { EditorTheme } from "@earendil-works/pi-tui";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Editor } from "@earendil-works/pi-tui";
import type { Core } from "./core";
import type { Answer, FlatQuestion, ProgressColor } from "./types";

// ─── Editor 工厂 ────────────────────────────────────────

/** 创建编辑器实例 */
export function createEditor(tui: unknown, editorTheme: EditorTheme): Editor {
  // tui 参数类型为 any 以避免循环依赖
  return new Editor(tui as Parameters<typeof Editor>[0], editorTheme);
}

// ─── 面板 ──────────────────────────────────────────────

/** 面板顶部边框线 */
export function panelTop(width: number, theme: { fg: (c: string, t: string) => string }): string {
  return theme.fg("accent", "┌" + "─".repeat(width - 2) + "┐");
}

/** 面板底部边框线 */
export function panelBottom(width: number, theme: { fg: (c: string, t: string) => string }): string {
  return theme.fg("accent", "└" + "─".repeat(width - 2) + "┘");
}

/** 面板内边距行 */
export function panelLine(text: string, width: number): string {
  const innerWidth = Math.max(0, width - 4);
  const clipped = truncateToWidth(text, innerWidth, "");
  const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
  return "│ " + clipped + padding + " │";
}

// ─── 进度点 ─────────────────────────────────────────────

/** 将进度颜色映射为主题颜色 key + 显示字符 */
function progressGlyph(color: ProgressColor): string {
  switch (color) {
    case "green":
      return "●";
    case "red":
      return "●";
    case "none":
      return "○";
  }
}

/** 获取进度点的显示文本（含颜色） */
export function progressDot(
  color: ProgressColor,
  theme: { fg: (c: string, t: string) => string },
): string {
  const glyph = progressGlyph(color);
  switch (color) {
    case "green":
      return theme.fg("success", glyph);
    case "red":
      return theme.fg("error", glyph);
    case "none":
      return theme.fg("dim", glyph);
  }
}

// ─── Tab 栏 ─────────────────────────────────────────────

/** 渲染 Tab 栏（含进度点），返回行数组 */
export function renderTabBar(
  core: Core,
  width: number,
  theme: { fg: (c: string, t: string) => string; bg: (c: string, t: string) => string },
): string[] {
  const lines: string[] = [];
  const parts: string[] = ["◀"];

  // 问题 Tab
  for (let i = 0; i < core.questions.length; i++) {
    const q = core.questions[i];
    const isActive = i === core.currentIndex;
    const color = core.getProgress(i);
    const dot = progressDot(color, theme);
    let text = ` ${dot} ${q.label} `;

    if (isActive) {
      if (color === "green") {
        text = theme.fg("success", text);
      } else if (color === "red") {
        text = theme.fg("error", text);
      } else {
        text = theme.fg("text", text);
      }
      text = theme.bg("selectedBg", text);
    } else if (color === "green") {
      text = theme.fg("success", text);
    } else if (color === "red") {
      text = theme.fg("error", text);
    }
    parts.push(text);
    parts.push("│");
  }

  // 提交 Tab
  const isSubmit = core.isSubmitTab();
  const allDone = core.allAnswered();
  let submitText = " ✓ 提交 ";
  if (isSubmit) {
    submitText = theme.bg("selectedBg", allDone ? theme.fg("success", submitText) : theme.fg("text", submitText));
  } else if (allDone) {
    submitText = theme.fg("success", submitText);
  } else {
    submitText = theme.fg("dim", submitText);
  }
  parts.push(submitText);
  parts.push("▶");

  lines.push(truncateToWidth(" " + parts.join(""), width));
  return lines;
}

// ─── 问题标题 ───────────────────────────────────────────

/** 渲染问题标题行 */
export function renderPrompt(
  q: FlatQuestion,
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string },
): string {
  return ` ${q.prompt}`;
}

// ─── 提示栏 ─────────────────────────────────────────────

/** 根据问题类型和状态生成底部提示文本 */
export function renderHelpBar(
  q: FlatQuestion | undefined,
  isMultiQuestion: boolean,
  inputMode: boolean,
  theme: { fg: (c: string, t: string) => string },
): string {
  if (inputMode) {
    if (q?.type === "confirm") {
      return theme.fg("dim", " ← → 切换 · Space 选中 · Enter 确认 · Esc 退出");
    }
    return theme.fg("dim", " ← → 调整/移动 · Enter 保存 · Esc 退出编辑");
  }

  if (!q) {
    // 提交页
    return theme.fg("dim", " ← 回到问题 · Enter 提交 · Esc 取消");
  }

  switch (q.type) {
    case "select":
    case "multiSelect": {
      const base = `Space ${q.type === "multiSelect" ? "切换" : "选择"} · Tab 编辑自定义 · ↑↓ 移动 · Enter 提交`;
      const nav = isMultiQuestion ? " · ← → 切换问题" : "";
      const extra = " · Esc 取消";
      return theme.fg("dim", base + nav + extra);
    }
    case "text":
      return theme.fg("dim", " Tab 编辑 · Enter 提交 · Esc 取消" + (isMultiQuestion ? " · ← → 切换问题" : ""));
    case "confirm":
      return theme.fg("dim", " Tab 编辑 · Enter 进入下一栏 · Esc 取消" + (isMultiQuestion ? " · ← → 切换问题" : ""));
    case "rating":
      return theme.fg("dim", " Tab 调整 · Enter 确认 · Esc 取消" + (isMultiQuestion ? " · ← → 切换问题" : ""));
    default:
      return theme.fg("dim", "");
  }
}

// ─── 提交汇总页 ─────────────────────────────────────────

/** 渲染提交汇总页 */
export function renderSubmitPage(
  core: Core,
  theme: {
    fg: (c: string, t: string) => string;
    bold: (t: string) => string;
  },
): string[] {
  const lines: string[] = [];

  lines.push(theme.fg("accent", theme.bold(" 确认你的选择：")));
  lines.push("");

  for (const q of core.questions) {
    const answer = core.answers.get(q.id);
    if (q.id === "__lq_notes__" && !answer) continue;
    if (!answer) {
      lines.push(` ⚠ ${theme.fg("error", q.label)}: ${theme.fg("dim", "(未回答)")}`);
    } else if ('text' in answer) {
      const display = answer.text.length > 0 ? answer.text : theme.fg("dim", "(未回答)");
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${display}`);
    } else if ('confirmed' in answer) {
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${answer.label}`);
    } else if ('value' in answer && typeof answer.value === 'number') {
      const annot = answer.annotation ? ` (${answer.annotation})` : '';
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${answer.value}${annot}`);
    } else if ('value' in answer && typeof answer.value === 'string') {
      if (answer.value.length === 0) {
        lines.push(` ⚠ ${theme.fg("error", q.label)}: ${theme.fg("dim", "(未回答)")}`);
      } else if (answer.wasCustom) {
        lines.push(` ✓ ${theme.fg("success", q.label)}: ${theme.fg("muted", "(自定义) ")}${answer.label}`);
      } else {
        lines.push(` ✓ ${theme.fg("success", q.label)}: ${answer.label}`);
      }
    } else if ('values' in answer) {
      if (answer.values.length === 0) {
        lines.push(` ⚠ ${theme.fg("error", q.label)}: ${theme.fg("dim", "(未回答)")}`);
      } else {
        const parts = answer.labels.join(', ');
        if (answer.wasCustom) {
          lines.push(` ✓ ${theme.fg("success", q.label)}: ${parts} ${theme.fg("muted", "· 自定义")}`);
        } else {
          lines.push(` ✓ ${theme.fg("success", q.label)}: ${parts}`);
        }
      }
    }
  }

  lines.push("");

  const incomplete = core.incompleteQuestions();
  if (incomplete.length > 0) {
    const missing = core.questions
      .filter((q) => incomplete.includes(q.id))
      .map((q) => q.label)
      .join(", ");
    lines.push(` ⚠ ${theme.fg("error", "未完成:")} ${theme.fg("dim", missing)} → ${theme.fg("error", "无法提交")}`);
    lines.push(` ${theme.fg("dim", "← 回到问题修改")}`);
  } else {
    lines.push(` ${theme.fg("success", "全部完成，按 Enter 提交")}`);
  }

  return lines;
}

// ─── 帮助函数：获取当前问题的选项列表 ──────────────────

/** 获取带"自定义"选项的完整选项列表 */
export function getOptionsWithCustom(q: FlatQuestion): Array<{
  value: string;
  label: string;
  description?: string;
  isCustom: boolean;
}> {
  if (q.type !== "select" && q.type !== "multiSelect") return [];
  const opts = q.options.map((o) => ({ ...o, isCustom: false }));
  opts.push({ value: "__custom__", label: "自定义", description: undefined, isCustom: true });
  return opts;
}

// ─── renderCall / renderResult 辅助 ────────────────────

/** renderCall：显示问题数量和标签 */
export function renderCallText(
  args: { questions?: Array<{ label?: string; id: string }> },
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string },
): Text {
  const qs = args.questions || [];
  const count = qs.length;
  const labels = qs.map((q) => q.label || q.id).join(", ");
  let text = theme.fg("toolTitle", theme.bold("questionnaire "));
  text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
  if (labels) {
    text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
  }
  return new Text(text, 0, 0);
}

/** renderResult：显示答案汇总 */
export function renderResultText(
  result: { content: Array<{ type: string; text: string }>; details: unknown },
  theme: { fg: (c: string, t: string) => string },
): Text {
  const details = result.details as
    | { cancelled?: boolean; message?: string; answers?: Record<string, Answer>; submittedAt?: string }
    | undefined;

  if (!details) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? text.text : "", 0, 0);
  }

  if (details.cancelled) {
    return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
  }

  const answerMap = details.answers || {};
  const entries = Object.entries(answerMap);
  const lines = entries.flatMap(([id, a]) => {
    const prefix = `${theme.fg("success", "✓ ")}${theme.fg("accent", id)}: `;
    if ('text' in a) {
      return [prefix + a.text];
    }
    if ('confirmed' in a) {
      return [prefix + a.label];
    }
    if ('value' in a && typeof a.value === 'number') {
      const annot = a.annotation ? ` (${a.annotation})` : '';
      return [prefix + `${a.value}${annot}`];
    }
    if ('value' in a && typeof a.value === 'string') {
      if (a.value.length === 0) return [prefix + theme.fg("dim", "(none)")];
      if (a.wasCustom) return [prefix + theme.fg("muted", "(wrote) ") + a.label];
      return [prefix + a.label];
    }
    if ('values' in a) {
      if (a.values.length === 0) return [prefix + theme.fg("dim", "(none)")];
      const parts = a.labels.join(', ');
      if (a.wasCustom) return [prefix + parts + ' ' + theme.fg("muted", "· (wrote)")];
      return [prefix + parts];
    }
    return [prefix + theme.fg("dim", "(none)")];
  });

  return new Text(lines.join("\n"), 0, 0);
}
