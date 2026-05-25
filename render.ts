/**
 * Questionnaire 通用渲染函数
 *
 * 面板框架、Tab 栏（含进度点）、提交汇总页、提示栏等。
 */

import type { EditorTheme } from "@earendil-works/pi-tui";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Editor } from "@earendil-works/pi-tui";
import type { Core } from "./core";
import type { FlatQuestion, ProgressColor } from "./types";

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
  return "│ " + text.padEnd(width - 4) + " │";
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
      return theme.fg("warning", glyph);
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
      text = theme.bg("selectedBg", theme.fg("text", text));
    } else if (color === "green") {
      text = theme.fg("success", text);
    } else if (color === "red") {
      text = theme.fg("warning", text);
    }
    parts.push(text);
    parts.push("│");
  }

  // 提交 Tab
  const isSubmit = core.isSubmitTab();
  const allDone = core.allAnswered();
  let submitText = " ✓ Submit ";
  if (isSubmit) {
    submitText = theme.bg("selectedBg", theme.fg("text", submitText));
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

/** 渲染问题标题行（含 [必填] 标签） */
export function renderPrompt(
  q: FlatQuestion,
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string },
): string {
  const required = q.required !== false; // 默认必填
  let text = ` ${q.prompt}`;
  if (required) {
    text += ` ${theme.fg("warning", "[必填]")}`;
  }
  return text;
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
    return theme.fg("dim", " Enter 保存 · Esc 放弃编辑");
  }

  if (!q) {
    // 提交页
    return theme.fg("dim", " ← 回到问题 · Enter 提交 · Esc 取消");
  }

  switch (q.type) {
    case "select":
    case "multiSelect": {
      const base = `Space ${q.type === "multiSelect" ? "切换" : "选择"} · ↑↓ 移动 · Enter 提交`;
      const nav = isMultiQuestion ? " · ← → 切换问题" : "";
      const extra = " · Esc 取消";
      return theme.fg("dim", base + nav + extra);
    }
    case "text":
      return theme.fg("dim", " Enter 提交 · Esc 取消" + (isMultiQuestion ? " · ← → 切换问题" : ""));
    case "confirm":
      return theme.fg("dim", " ← → 选择 · Enter 确认 · Esc 取消");
    case "rating":
      return theme.fg("dim", " ← → 调整 · Enter 确认 · Esc 取消");
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
    if (!answer || answer.values.length === 0) {
      lines.push(` ⚠ ${theme.fg("warning", q.label)}: ${theme.fg("dim", "(未回答)")}`);
    } else if (answer.wasCustom && answer.labels.length === 1) {
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${theme.fg("muted", "(自定义) ")}${answer.labels[0]}`);
    } else if (answer.wasCustom) {
      // 多选 + 自定义
      const checkboxLabels = answer.labels.slice(0, -1).map((l, i) => {
        const idx = answer.indices?.[i];
        return idx ? `${idx}. ${l}` : l;
      }).join(", ");
      const customLabel = answer.labels[answer.labels.length - 1];
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${checkboxLabels} ${theme.fg("muted", "· 自定义: ")}${customLabel}`);
    } else if (answer.labels.length > 1) {
      const parts = answer.labels.map((l, i) => {
        const idx = answer.indices?.[i];
        return idx ? `${idx}. ${l}` : l;
      }).join(", ");
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${parts}`);
    } else {
      const idx = answer.indices?.[0];
      const display = idx ? `${idx}. ${answer.labels[0]}` : answer.labels[0];
      lines.push(` ✓ ${theme.fg("success", q.label)}: ${display}`);
    }
  }

  lines.push("");

  const incomplete = core.incompleteQuestions();
  if (incomplete.length > 0) {
    const missing = core.questions
      .filter((q) => incomplete.includes(q.id))
      .map((q) => q.label)
      .join(", ");
    lines.push(` ⚠ ${theme.fg("warning", "未完成:")} ${theme.fg("dim", missing)} → ${theme.fg("warning", "无法提交")}`);
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
  const details = result.details as { cancelled?: boolean; answers?: Array<{
    id: string;
    labels: string[];
    wasCustom?: boolean;
    indices?: number[];
  }> } | undefined;

  if (!details) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? text.text : "", 0, 0);
  }

  if (details.cancelled) {
    return new Text(theme.fg("warning", "Cancelled"), 0, 0);
  }

  const answers = details.answers || [];
  const lines = answers.flatMap((a) => {
    if (a.labels.length === 0) {
      return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${theme.fg("dim", "(none)")}`];
    }
    if (a.labels.length > 1 && a.wasCustom) {
      const checkboxLabels = a.labels.slice(0, -1).map((l, i) => {
        const idx = a.indices?.[i];
        return idx ? `${idx}. ${l}` : l;
      }).join(", ");
      return [
        `${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${checkboxLabels} ${theme.fg("muted", "· (wrote) ")}${a.labels[a.labels.length - 1]}`,
      ];
    }
    if (a.wasCustom) {
      return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${theme.fg("muted", "(wrote) ")}${a.labels[0]}`];
    }
    if (a.labels.length > 1) {
      const parts = a.labels.map((l, i) => {
        const idx = a.indices?.[i];
        return idx ? `${idx}. ${l}` : l;
      }).join(", ");
      return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${parts}`];
    }
    const idx = a.indices?.[0];
    const display = idx ? `${idx}. ${a.labels[0]}` : a.labels[0];
    return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${display}`];
  });

  return new Text(lines.join("\n"), 0, 0);
}
