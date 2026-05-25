/**
 * 确认问题模块
 *
 * 内联 Y/N 双按钮，← → 切换高亮，Enter 确认。
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import type { ThemeLike } from "./shared";

/**
 * 渲染确认问题的双按钮 UI
 */
export function renderConfirmQuestion(
  core: Core,
  width: number,
  theme: ThemeLike,
): string[] {
  const q = core.currentQuestion();
  if (!q || q.type !== "confirm") return [];

  const lines: string[] = [];
  const state = core.getUIState();
  const yesLabel = q.yesLabel || "是";
  const noLabel = q.noLabel || "否";
  const selectedYes = state.confirmValue === true;

  // 渲染两个按钮
  const yesBtn = selectedYes
    ? theme.bg("selectedBg", theme.fg("text", ` [${yesLabel}] `))
    : ` [${yesLabel}] `;
  const noBtn = !selectedYes
    ? theme.bg("selectedBg", theme.fg("text", ` [${noLabel}] `))
    : ` [${noLabel}] `;

  const arrow = selectedYes
    ? theme.fg("accent", ">") + " " + yesBtn + "  " + noBtn
    : "  " + yesBtn + "  " + theme.fg("accent", ">") + " " + noBtn;

  lines.push(truncateToWidth(" " + arrow, width));
  return lines;
}
