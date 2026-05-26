# Questionnaire 已知 UI 问题

## ISSUE-1：进度点未答题显示黄色，应为红色

**影响版本**：当前

**严重程度**：低（功能正常，颜色语义错误）

**描述**：
必答题未选择就跳过后，进度点和 Tab 标签显示为黄色（`warning`），与设计文档规定
的三色方案（🟢绿色 / 🔴红色 / ⚪空白）不符。

**涉及文件**：`render.ts`

**现状代码**：
```typescript
// progressDot() — 进度点圆点
case "red":
  return theme.fg("warning", glyph);

// renderTabBar() — Tab 栏标签
} else if (color === "red") {
  text = theme.fg("warning", text);
```

**期望行为**：
将 `"warning"` 改为 `"error"`，使未完成的必答题进度点和 Tab 标签显示为红色。

**设计依据**：
- 需求文档 §2.3：红色 = 进入过但未选择就 Enter 跳过
- 场景文档 §5、§14：红色标注未答题

---

## ISSUE-2：评分滑块数字、表情、滑块条不对齐

**影响版本**：当前

**严重程度**：低（功能正常，视觉不佳）

**描述**：
`rating` 类型问题的三行（数字标尺、表情量表、滑块条）各自的列宽不一致，
圆点位置不与对应数字居中对齐。

**涉及文件**：`modules/rating.ts`

**现状代码**：
```typescript
// 数字行 — 每个数字后 3 空格拼接
const numLabels: string[] = [];
for (let v = min; v <= max; v++) {
  numLabels.push(/* 数字文本 */);
}
lines.push("    " + numLabels.join("   "));

// 表情行 — 每个表情后 2 空格拼接
lines.push("    " + emojiLabels.join("  "));

// 滑块条 — barWidth = max(totalSteps * 2, 8)，与上方列宽无关
const barWidth = Math.max(totalSteps * 2, 8);
// 圆点位置 = round((pos / totalSteps) * barWidth)
```

**期望行为**：
数字、表情、滑块三条使用统一的列宽布局，圆点位于对应数值/表情的正下方。

**设计依据**：
- 场景文档 §10：数字/表情/滑块/注释纵向对齐

---

## ISSUE-3：提交页缺失的问题警告色语义不统一

**影响版本**：当前

**严重程度**：极低

**描述**：
提交汇总页中未完成的问题标签使用 `"warning"`（黄色），与进度点期望的 `"error"`（红色）
不一致。若 ISSUE-1 修复后，提交页应统一使用红色或保持黄色需明确。

**涉及文件**：`render.ts` `renderSubmitPage()`

```typescript
lines.push(` ⚠ ${theme.fg("warning", q.label)}: ${theme.fg("dim", "(未回答)")}`);
```

---

*最后更新：2026-05-26*
