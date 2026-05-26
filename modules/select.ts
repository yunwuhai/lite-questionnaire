/**
 * 单选问题模块
 *
 * Space 标定一项 + Enter 提交。
 * 也处理 ← → 切换问题、↑ ↓ 导航选项的数字键快捷跳转。
 */

import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { Editor } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import { getOptionsWithCustom } from "../render";
import type { ThemeLike } from "./shared";

/**
 * 渲染单选问题的选项列表
 */
export function renderSelectOptions(
  core: Core,
  width: number,
  theme: ThemeLike,
  inputMode: boolean,
): string[] {
  const q = core.currentQuestion();
  if (!q || (q.type !== "select" && q.type !== "multiSelect")) return [];

  const lines: string[] = [];
  const state = core.getUIState();
  const opts = getOptionsWithCustom(q);

  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const isCursor = i === state.optionIndex;
    const hasCustomText = opt.isCustom && state.customText !== null;
    const isSelected = state.selectedIndices.includes(i);

    // 前缀：两列独立 — 列0: >, 列1: ●
    const col0 = isCursor ? theme.fg("accent", ">") : " ";
    const col1 = isSelected ? theme.fg("success", "●") : " ";
    const prefix = col0 + col1 + " ";

    // 颜色
    const color = isCursor ? "accent" : isSelected ? "success" : "text";

    // 标签
    let displayLabel = opt.label;
    if (hasCustomText) {
      displayLabel = `"${state.customText}"`;
    }

    // 编辑标记
    let suffix = "";
    if (opt.isCustom && inputMode && isCursor) {
      suffix = theme.fg("accent", " ✎");
    } else if (opt.isCustom && isSelected) {
      suffix = theme.fg("success", " ✎");
    }

    const num = `${i + 1}`;
    let line = prefix + theme.fg(color, `${num}. ${displayLabel}`) + suffix;

    lines.push(truncateToWidth(" " + line, width));

    if (opt.description) {
      lines.push(truncateToWidth("     " + theme.fg("muted", opt.description), width));
    }
  }

  return lines;
}

/**
 * 单选输入处理。
 * 返回 true 表示输入被处理，false 表示需要上游继续处理。
 */
export function handleSelectInput(
  core: Core,
  data: string,
  _editor: Editor,
  _theme: ThemeLike,
): boolean {
  const q = core.currentQuestion();
  if (!q) return false;
  if (q.type !== "select") return false;

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
