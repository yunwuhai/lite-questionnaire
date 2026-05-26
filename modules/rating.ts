/**
 * 评分滑块问题模块
 *
 * 滑块条 + 表情量表 + 文字注释，← → 调整，Enter 确认。
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Core } from "../core";
import type { ThemeLike } from "./shared";

/** 5 级表情映射（用于 1-5 范围，其他范围插值） */
const EMOJI_MAP: Record<number, string> = {
  1: "😡",
  2: "😟",
  3: "😐",
  4: "😊",
  5: "😍",
};

/** 表情列表（用于任意范围插值） */
const EMOJI_LIST = ["😡", "😟", "😐", "😊", "😍"];

/**
 * 根据评分值和范围插值获取表情
 */
function getEmoji(value: number, min: number, max: number): string {
  if (min === 1 && max === 5) {
    return EMOJI_MAP[value] || "😐";
  }
  // 插值到 0-4 索引
  const ratio = (value - min) / (max - min);
  const idx = Math.round(ratio * (EMOJI_LIST.length - 1));
  return EMOJI_LIST[Math.max(0, Math.min(EMOJI_LIST.length - 1, idx))];
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
  const { min, max } = q.range;
  const current = state.ratingValue;

  // 数字标尺行
  const numLabels: string[] = [];
  for (let v = min; v <= max; v++) {
    let label = String(v);
    if (v === current) {
      label = theme.fg("accent", label);
    }
    numLabels.push(label);
  }
  lines.push(truncateToWidth("    " + numLabels.join("   "), width));

  // 表情行
  if (q.showEmoji) {
    const emojiLabels: string[] = [];
    for (let v = min; v <= max; v++) {
      const emoji = getEmoji(v, min, max);
      const highlighted = v === current;
      emojiLabels.push(highlighted ? theme.fg("accent", emoji) : emoji);
    }
    lines.push(truncateToWidth("    " + emojiLabels.join("  "), width));
  }

  // 滑块条
  const totalSteps = Math.max(1, max - min);
  const pos = current - min;
  const barWidth = Math.max(totalSteps * 2, 8);

  let bar = "";
  for (let i = 0; i <= barWidth; i++) {
    if (i === Math.round((pos / totalSteps) * barWidth)) {
      bar += theme.fg("accent", "●");
    } else {
      bar += "─";
    }
  }
  lines.push(truncateToWidth("    " + bar, width));

  // 文字注释行
  if (q.annotations) {
    const minAnnot = q.annotations[String(min)];
    const maxAnnot = q.annotations[String(max)];
    const currentAnnot = q.annotations[String(current)];
    let annotLine = "";
    if (minAnnot && maxAnnot) {
      annotLine = `    ${theme.fg("dim", minAnnot)}${" ".repeat(Math.max(0, barWidth - minAnnot.length - maxAnnot.length))}${theme.fg("dim", maxAnnot)}`;
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
