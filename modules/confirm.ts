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

  // 是否处于选择态（Tab 进入的编辑模式）
  const isEditing = core.inputMode && core.inputQuestionId === q.id;
  // 选择态下光标位置：optionIndex=0 表示在「是」，1 表示在「否」
  const cursorOnYes = isEditing && state.optionIndex === 0;
  const cursorOnNo = isEditing && state.optionIndex === 1;

  // 渲染两个按钮：● 表示已选中（基于 confirmValue），背景高亮表示光标（仅选择态可见）
  const dot = theme.fg("success", "●");
  const blank = " ";

  const yesBtn = cursorOnYes
    ? theme.bg("selectedBg", theme.fg("text", ` [${yesLabel}] `))
    : ` [${yesLabel}] `;
  const noBtn = cursorOnNo
    ? theme.bg("selectedBg", theme.fg("text", ` [${noLabel}] `))
    : ` [${noLabel}] `;

  const row = selectedYes
    ? dot + " " + yesBtn + "  " + blank + " " + noBtn
    : blank + " " + yesBtn + "  " + dot + " " + noBtn;

  lines.push(truncateToWidth(" " + row, width));
  return lines;
}
