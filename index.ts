/**
 * Questionnaire 工具入口
 *
 * 注册统一的 questionnaire 工具，支持：
 * - 5 种问题类型：select / multiSelect / text / confirm / rating
 * - 条件子问题（children + showIf）
 * - 声明式约束校验
 * - 三色进度点
 * - 会话持久化
 * - 自定义选项
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Editor, type EditorTheme, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Core } from "./core";
import type { QuestionnaireParams, QuestionnaireResult } from "./types";
import {
  panelTop,
  panelBottom,
  panelLine,
  renderTabBar,
  renderPrompt,
  renderHelpBar,
  renderSubmitPage,
  renderCallText,
  renderResultText,
} from "./render";
import { createInputHandler } from "./input";
import { renderSelectOptions } from "./modules/select";
import { renderMultiSelectOptions } from "./modules/multiSelect";
import { renderTextQuestion, enterTextEdit } from "./modules/text";
import { renderConfirmQuestion } from "./modules/confirm";
import { renderRatingQuestion } from "./modules/rating";
import { saveSnapshot } from "./state";

// ─── TypeBox Schema ────────────────────────────────────

const ConstraintSchema = Type.Object({
  type: Type.Union([
    Type.Literal("required"),
    Type.Literal("minSelect"),
    Type.Literal("maxSelect"),
    Type.Literal("minLength"),
    Type.Literal("maxLength"),
    Type.Literal("pattern"),
  ]),
  value: Type.Optional(Type.Union([Type.Number(), Type.String()])),
  message: Type.String(),
});

const OptionSchema = Type.Object({
  value: Type.String({ description: "选项的唯一值，作为答案返回" }),
  label: Type.String({ description: "选项的显示文本" }),
  description: Type.Optional(Type.String({ description: "选项的可选描述" })),
});

const ShowIfSchema = Type.Object({
  value: Type.String({ description: "父问题答案匹配值，匹配时显示当前子问题" }),
});

const BaseQuestionProps = {
  id: Type.String({ description: "问题唯一标识" }),
  label: Type.String({ description: "Tab 栏短标签" }),
  prompt: Type.String({ description: "完整问题文本" }),
  required: Type.Optional(Type.Boolean({ description: "是否必答，默认 true" })),
  constraints: Type.Optional(Type.Array(ConstraintSchema)),
  showIf: Type.Optional(ShowIfSchema),
};

const QuestionSchema = Type.Cyclic(
  {
    Question: Type.Union([
      Type.Object({
        ...BaseQuestionProps,
        type: Type.Literal("select"),
        maxSelect: Type.Literal(1),
        options: Type.Array(OptionSchema, { minItems: 1 }),
        children: Type.Optional(Type.Array(Type.Ref("Question"))),
      }),
      Type.Object({
        ...BaseQuestionProps,
        type: Type.Literal("multiSelect"),
        maxSelect: Type.Number({ minimum: 2 }),
        options: Type.Array(OptionSchema, { minItems: 1 }),
        children: Type.Optional(Type.Array(Type.Ref("Question"))),
      }),
      Type.Object({
        ...BaseQuestionProps,
        type: Type.Literal("text"),
        placeholder: Type.Optional(Type.String()),
        multiline: Type.Optional(Type.Boolean({ default: false })),
        children: Type.Optional(Type.Array(Type.Ref("Question"))),
      }),
      Type.Object({
        ...BaseQuestionProps,
        type: Type.Literal("confirm"),
        yesLabel: Type.Optional(Type.String()),
        noLabel: Type.Optional(Type.String()),
        children: Type.Optional(Type.Array(Type.Ref("Question"))),
      }),
      Type.Object({
        ...BaseQuestionProps,
        type: Type.Literal("rating"),
        range: Type.Object({ min: Type.Number(), max: Type.Number() }),
        showEmoji: Type.Optional(Type.Boolean({ default: false })),
        annotations: Type.Optional(Type.Record(Type.Number(), Type.String())),
        children: Type.Optional(Type.Array(Type.Ref("Question"))),
      }),
    ]),
  },
  "Question",
);

const QuestionnaireParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, { minItems: 1 }),
});

// ─── 入口 ──────────────────────────────────────────────

export default function questionnaire(pi: ExtensionAPI) {
  pi.registerTool({
    name: "questionnaire",
    label: "Questionnaire",
    description:
      "向用户展示交互式问卷。支持单选、多选、文本输入、确认、评分五种问题类型。" +
      "支持条件子问题、约束校验、自定义选项和会话持久化。",
    promptSnippet:
      "向用户展示交互式问卷（单选/多选/文本/确认/评分），支持条件子问题和约束校验",
    promptGuidelines: [
      "使用 questionnaire 工具向用户收集结构化信息。支持 select(单选)、multiSelect(多选)、text(文本)、confirm(确认)、rating(评分) 五种类型。",
      "使用 children + showIf 定义条件子问题：当父问题答案为指定值时，子问题动态插入到问卷中。",
      "使用 constraints 数组定义校验规则：required/minSelect/maxSelect/minLength/maxLength/pattern。",
    ],
    parameters: QuestionnaireParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = params as QuestionnaireParams;

      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: "Error: UI not available (running in non-interactive mode)",
            },
          ],
          details: { questions: input.questions, answers: [], cancelled: true },
        };
      }

      if (!input.questions || input.questions.length === 0) {
        return {
          content: [{ type: "text", text: "Error: No questions provided" }],
          details: { questions: [], answers: [], cancelled: true },
        };
      }

      const core = new Core();
      core.init(input.questions);
      const originalQuestions = input.questions;

      const result = await ctx.ui.custom<QuestionnaireResult>(
        (tui, theme, _kb, done) => {
          const editorTheme: EditorTheme = {
            borderColor: (s) => theme.fg("accent", s),
            selectList: {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          };
          const editor = new Editor(tui, editorTheme);

          let cachedLines: string[] | undefined;

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          const handleSubmit = (cancelled: boolean) => {
            saveSnapshot(pi, core);
            done(core.toResult(cancelled));
          };

          const handleSave = () => {
            saveSnapshot(pi, core);
          };

          const handleInput = createInputHandler(
            core,
            editor,
            handleSubmit,
            refresh,
            theme,
            originalQuestions,
            handleSave,
          );

          const firstQ = core.currentQuestion();
          if (firstQ && firstQ.type === "text") {
            enterTextEdit(core, editor);
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const q = core.currentQuestion();
            const isMultiQuestion = core.questions.length > 1;

            lines.push(panelTop(width, theme));

            if (isMultiQuestion) {
              lines.push(...renderTabBar(core, width, theme));
              lines.push(panelLine("", width));
            }

            if (core.isSubmitTab()) {
              lines.push(
                panelLine(theme.fg("accent", theme.bold(" 确认提交")), width),
              );
              lines.push(panelLine("", width));
              const submitLines = renderSubmitPage(core, theme);
              for (const line of submitLines) {
                lines.push(panelLine(line, width));
              }
            } else if (core.inputMode && q) {
              lines.push(panelLine(renderPrompt(q, theme), width));
              lines.push(panelLine("", width));

              if (q.type === "select") {
                for (const line of renderSelectOptions(core, width, theme, true)) {
                  lines.push(panelLine(line, width));
                }
              } else if (q.type === "multiSelect") {
                for (const line of renderMultiSelectOptions(core, width, theme)) {
                  lines.push(panelLine(line, width));
                }
              }

              lines.push(panelLine("", width));
              lines.push(panelLine(theme.fg("muted", " 自定义内容："), width));

              for (const line of editor.render(width - 4)) {
                lines.push(panelLine(" " + line, width));
              }
              lines.push(panelLine("", width));
            } else if (q) {
              lines.push(panelLine(renderPrompt(q, theme), width));
              lines.push(panelLine("", width));

              switch (q.type) {
                case "select":
                  for (const line of renderSelectOptions(core, width, theme, false)) {
                    lines.push(panelLine(line, width));
                  }
                  break;
                case "multiSelect":
                  for (const line of renderMultiSelectOptions(core, width, theme)) {
                    lines.push(panelLine(line, width));
                  }
                  break;
                case "text":
                  for (const line of renderTextQuestion(core, width, theme, editor)) {
                    lines.push(panelLine(line, width));
                  }
                  break;
                case "confirm":
                  for (const line of renderConfirmQuestion(core, width, theme)) {
                    lines.push(panelLine(line, width));
                  }
                  break;
                case "rating":
                  for (const line of renderRatingQuestion(core, width, theme)) {
                    lines.push(panelLine(line, width));
                  }
                  break;
              }

              lines.push(panelLine("", width));

              if (core.errorMessage) {
                lines.push(
                  panelLine(
                    theme.fg("warning", ` ⚠ ${core.errorMessage}`),
                    width,
                  ),
                );
              }
            }

            const help = renderHelpBar(q, isMultiQuestion, core.inputMode, theme);
            lines.push(panelLine(help, width));

            lines.push(panelBottom(width, theme));

            cachedLines = lines;
            return lines;
          }

          return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
        },
      );

      if (result.cancelled) {
        return {
          content: [{ type: "text", text: "User cancelled the questionnaire" }],
          details: result,
        };
      }

      const answerLines = result.answers.flatMap((a) => {
        const q = result.questions.find((q) => q.id === a.id);
        const qLabel = q?.label || a.id;
        if (a.labels.length === 0) return [`${qLabel}: (未回答)`];
        if (q?.type === "multiSelect" && a.labels.length > 1 && a.wasCustom) {
          const checkboxLabels = a.labels
            .slice(0, -1)
            .map((l, i) => {
              const idx = a.indices?.[i];
              return idx ? `${idx}. ${l}` : l;
            })
            .join(", ");
          return [
            `${qLabel}: ${checkboxLabels} · (自定义) ${a.labels[a.labels.length - 1]}`,
          ];
        }
        if (a.wasCustom) return [`${qLabel}: (自定义) ${a.labels[0]}`];
        if (q?.type === "multiSelect" && a.labels.length > 1) {
          const parts = a.labels
            .map((l, i) => {
              const idx = a.indices?.[i];
              return idx ? `${idx}. ${l}` : l;
            })
            .join(", ");
          return [`${qLabel}: ${parts}`];
        }
        if (q?.type === "confirm") return [`${qLabel}: ${a.labels[0]}`];
        const idx = a.indices?.[0];
        return [
          `${qLabel}: ${idx ? `${idx}. ${a.labels[0]}` : a.labels[0]}`,
        ];
      });

      return {
        content: [{ type: "text", text: answerLines.join("\n") }],
        details: result,
      };
    },

    renderCall(args, theme, _context) {
      return renderCallText(
        args as { questions?: Array<{ label?: string; id: string }> },
        theme,
      );
    },

    renderResult(result, _options, theme, _context) {
      return renderResultText(
        result as {
          content: Array<{ type: string; text: string }>;
          details: unknown;
        },
        theme,
      );
    },
  });
}
