/**
 * 多选问题模块
 *
 * Space 切换勾选 + Enter 批量提交。
 */

import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import { getOptionsWithCustom } from "../render";
import type { ThemeLike } from "./shared";

/**
 * 渲染多选问题的选项列表（checkbox 风格）
 */
export function renderMultiSelectOptions(
  core: Core,
  width: number,
  theme: ThemeLike,
): string[] {
  const q = core.currentQuestion();
  if (!q || q.type !== "multiSelect") return [];

  const lines: string[] = [];
  const state = core.getUIState();
  const opts = getOptionsWithCustom(q);

  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const isCursor = i === state.optionIndex;
    const hasCustomText = opt.isCustom && state.customText !== null;
    const checked = state.selectedIndices.includes(i);

    // checkbox
    let box: string;
    if (isCursor) {
      box = theme.fg("accent", `> [${checked ? "x" : " "}]`);
    } else {
      box = `  [${checked ? theme.fg("success", "x") : " "}]`;
    }

    const labelColor = isCursor ? "accent" : checked ? "success" : "text";
    let displayLabel = opt.label;
    if (hasCustomText) {
      displayLabel = `"${state.customText}"`;
    }

    const num = `${i + 1}`;
    lines.push(truncateToWidth(" " + box + " " + theme.fg(labelColor, `${num}. ${displayLabel}`), width));

    if (opt.description) {
      lines.push(truncateToWidth("     " + theme.fg("muted", opt.description), width));
    }
  }

  return lines;
}

/**
 * 多选输入处理。
 * 返回 true 表示输入被处理。
 */
export function handleMultiSelectInput(
  core: Core,
  data: string,
  _editor: Editor,
  _theme: ThemeLike,
): boolean {
  const q = core.currentQuestion();
  if (!q || q.type !== "multiSelect") return false;

  const state = core.getUIState();
  const opts = getOptionsWithCustom(q);

  // ↑ ↓ 导航
  if (matchesKey(data, Key.up)) {
    state.optionIndex = Math.max(0, state.optionIndex - 1);
    core.saveUIState(state);
    return true;
  }
  if (matchesKey(data, Key.down)) {
    state.optionIndex = Math.min(opts.length - 1, state.optionIndex + 1);
    core.saveUIState(state);
    return true;
  }

  // 数字键 1-9 快捷跳转
  const numMatch = /^[1-9]$/.exec(data);
  if (numMatch) {
    const target = parseInt(numMatch[0], 10) - 1;
    if (target < opts.length) {
      state.optionIndex = target;
      core.saveUIState(state);
      return true;
    }
    return true;
  }

  return false;
}
