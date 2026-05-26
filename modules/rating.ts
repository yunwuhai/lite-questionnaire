/**
 * 评分滑块问题模块
 *
 * 数字标尺 + 表情量表 + 下置光标，编辑态 ← → 调整，Enter 确认。
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import type { ThemeLike } from "./shared";

/** 5 级表情映射 */
const EMOJI_MAP: Record<number, string> = {
  1: "😡",
  2: "😟",
  3: "😐",
  4: "😊",
  5: "😍",
};

/**
 * 根据评分值获取表情
 */
function getEmoji(value: number): string {
  return EMOJI_MAP[value];
}

/**
 * 渲染评分滑块问题
 */
export function renderRatingQuestion(
  core: Core,
  width: number,
  theme: ThemeLike,
): string[] {
  const q = core.currentQuestion();
  if (!q || q.type !== "rating") return [];

  const lines: string[] = [];
  const state = core.getUIState();
  const current = state.ratingValue;

  const indent = "    ";
  const values = [1, 2, 3, 4, 5];
  const currentIndex = current - 1;
  const numberLabels = ["1", "2", "3", "4", "5"];
  const emojiLabels = values.map((v) => getEmoji(v));
  const maxCellWidth = Math.max(
    1,
    ...numberLabels.map((label) => visibleWidth(label)),
    ...(q.showEmoji ? emojiLabels.map((label) => visibleWidth(label)) : []),
  );
  const slotWidth = Math.max(3, maxCellWidth + 1);
  const padSlot = (text: string): string => {
    const padding = Math.max(0, slotWidth - visibleWidth(text));
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return " ".repeat(left) + text + " ".repeat(right);
  };
  const buildSlotLine = (labels: string[]): string => {
    let line = "";
    labels.forEach((label, index) => {
      const cell = padSlot(label);
      line += index === currentIndex ? theme.fg("accent", cell) : cell;
    });
    return line;
  };

  // 数字标尺行
  const numberLine = buildSlotLine(numberLabels);
  lines.push(truncateToWidth(indent + numberLine, width));

  // 表情行
  if (q.showEmoji) {
    lines.push(truncateToWidth(indent + buildSlotLine(emojiLabels), width));
  }

  // 下置光标行：与数字/表情共用同一 slot 布局
  const cursorLine = buildSlotLine(values.map((_, index) => (index === currentIndex ? "▲" : "")));
  lines.push(truncateToWidth(indent + cursorLine, width));

  const barWidth = visibleWidth(numberLine);

  // 文字注释行
  if (q.annotations) {
    const minAnnot = q.annotations["1"];
    const maxAnnot = q.annotations["5"];
    const currentAnnot = q.annotations[String(current)];
    let annotLine = "";
    if (minAnnot && maxAnnot) {
      annotLine = `${indent}${theme.fg("dim", minAnnot)}${" ".repeat(Math.max(0, barWidth - visibleWidth(minAnnot) - visibleWidth(maxAnnot)))}${theme.fg("dim", maxAnnot)}`;
    }
    if (annotLine) {
      lines.push(truncateToWidth(annotLine, width));
    }
    if (currentAnnot) {
      lines.push(truncateToWidth(`  ${theme.fg("muted", "当前:")} ${theme.fg("accent", String(current))} - ${theme.fg("text", currentAnnot)}`, width));
    } else {
      lines.push(truncateToWidth(`  ${theme.fg("muted", "当前:")} ${theme.fg("accent", String(current))}`, width));
    }
  } else {
    lines.push(truncateToWidth(`  ${theme.fg("muted", "当前:")} ${theme.fg("accent", String(current))}`, width));
  }

  return lines;
}
