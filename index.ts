/**
 * Questionnaire Tool - Unified tool for asking single or multiple questions
 *
 * Single question: simple options list
 * Multiple questions: tab bar navigation between questions
 * Multi-select: Space to toggle checkboxes, Enter to confirm all selections
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// Types
interface QuestionOption {
	value: string;
	label: string;
	description?: string;
}

type RenderOption = QuestionOption & { isOther?: boolean };

interface Question {
	id: string;
	label: string;
	prompt: string;
	options: QuestionOption[];
	allowOther: boolean;
	multiSelect: boolean;
}

interface Answer {
	id: string;
	values: string[];
	labels: string[];
	wasCustom: boolean;
	indices?: number[];
}

interface QuestionnaireResult {
	questions: Question[];
	answers: Answer[];
	cancelled: boolean;
}

// Schema
const QuestionOptionSchema = Type.Object({
	value: Type.String({ description: "The value returned when selected" }),
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({ description: "Unique identifier for this question" }),
	label: Type.Optional(
		Type.String({
			description: "Short contextual label for tab bar, e.g. 'Scope', 'Priority' (defaults to Q1, Q2)",
		}),
	),
	prompt: Type.String({ description: "The full question text to display" }),
	options: Type.Array(QuestionOptionSchema, { description: "Available options to choose from" }),
	allowOther: Type.Optional(Type.Boolean({ description: "Allow 'Type something' option (default: true)" })),
	multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple options (default: false)" })),
});

const QuestionnaireParams = Type.Object({
	questions: Type.Array(QuestionSchema, { description: "Questions to ask the user" }),
});

function errorResult(
	message: string,
	questions: Question[] = [],
): { content: { type: "text"; text: string }[]; details: QuestionnaireResult } {
	return {
		content: [{ type: "text", text: message }],
		details: { questions, answers: [], cancelled: true },
	};
}

export default function questionnaire(pi: ExtensionAPI) {
	pi.registerTool({
		name: "questionnaire",
		label: "Questionnaire",
		description:
			"Ask the user one or more questions. Use for clarifying requirements, getting preferences, or confirming decisions. For single questions, shows a simple option list. For multiple questions, shows a tab-based interface. Use multiSelect: true on a question to allow selecting multiple options at once.",
		parameters: QuestionnaireParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return errorResult("Error: UI not available (running in non-interactive mode)");
			}
			if (params.questions.length === 0) {
				return errorResult("Error: No questions provided");
			}

			// Normalize questions with defaults
			const questions: Question[] = params.questions.map((q, i) => ({
				...q,
				label: q.label || `Q${i + 1}`,
				allowOther: q.allowOther !== false,
				multiSelect: q.multiSelect === true,
			}));

			const isMulti = questions.length > 1;
			const totalTabs = questions.length + 1; // questions + Submit

			const result = await ctx.ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
				// State
				let currentTab = 0;
				let optionIndex = 0;
				let inputMode = false;
				let inputQuestionId: string | null = null;
				let cachedLines: string[] | undefined;
				const answers = new Map<string, Answer>();
				const selectedIndices = new Set<number>();
				let customText: string | null = null;

				// Editor for "Type something" option
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

				// Helpers
				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function submit(cancelled: boolean) {
					done({ questions, answers: Array.from(answers.values()), cancelled });
				}

				function isMultiSelect(): boolean {
					const q = currentQuestion();
					return q?.multiSelect === true;
				}

				function currentQuestion(): Question | undefined {
					return questions[currentTab];
				}

				function currentOptions(): RenderOption[] {
					const q = currentQuestion();
					if (!q) return [];
					const opts: RenderOption[] = [...q.options];
					if (q.allowOther) {
						opts.push({ value: "__other__", label: "Type something.", isOther: true });
					}
					return opts;
				}

				function allAnswered(): boolean {
					return questions.every((q) => answers.has(q.id));
				}

				function resetSelection() {
					selectedIndices.clear();
					customText = null;
				}

				function restoreSelection() {
					const q = currentQuestion();
					selectedIndices.clear();
					customText = null;
					if (!q) return;
					const answer = answers.get(q.id);
					if (!answer) return;
					// Restore checkbox selections (1-based → 0-based)
					if (answer.indices) {
						for (const idx of answer.indices) {
							selectedIndices.add(idx - 1);
						}
					}
					// Restore custom text
					if (answer.wasCustom && answer.labels.length > 0) {
						if (q.multiSelect) {
							customText = answer.labels[answer.labels.length - 1];
						} else {
							customText = answer.labels[0];
						}
					}
				}

				function advanceAfterAnswer() {
					resetSelection();
					if (!isMulti) {
						submit(false);
						return;
					}
					if (currentTab < questions.length - 1) {
						currentTab++;
					} else {
						currentTab = questions.length; // Submit tab
					}
					optionIndex = 0;
					refresh();
				}

				function saveSingleAnswer(questionId: string, value: string, label: string, wasCustom: boolean, index?: number) {
					answers.set(questionId, {
						id: questionId,
						values: [value],
						labels: [label],
						wasCustom,
						indices: index !== undefined ? [index] : undefined,
					});
				}

				function saveMultiAnswer(questionId: string) {
					const opts = currentOptions();
					const selIndices = [...selectedIndices].sort();
					if (selIndices.length === 0 && !customText) {
						// Nothing selected — stay on page
						return;
					}
					const selValues = selIndices.map((i) => opts[i].value);
					const selLabels = selIndices.map((i) => opts[i].label);
					const allValues = [...selValues];
					const allLabels = [...selLabels];
					if (customText) {
						allValues.push(customText);
						allLabels.push(customText);
					}
					answers.set(questionId, {
						id: questionId,
						values: allValues,
						labels: allLabels,
						wasCustom: customText !== null,
						indices: selIndices.length > 0 ? selIndices.map((i) => i + 1) : undefined,
					});
					advanceAfterAnswer();
				}

				// Editor submit callback
				editor.onSubmit = (value) => {
					if (!inputQuestionId) return;
					const trimmed = value.trim();
					// Multi-select: save custom text, return to options
					if (currentQuestion()?.multiSelect) {
						if (trimmed) customText = trimmed;
						inputMode = false;
						inputQuestionId = null;
						editor.setText("");
						refresh();
						return;
					}
					// Single-select: submit immediately
					saveSingleAnswer(inputQuestionId, trimmed || "(no response)", trimmed || "(no response)", true);
					inputMode = false;
					inputQuestionId = null;
					editor.setText("");
					advanceAfterAnswer();
				};

				function handleInput(data: string) {
					// Input mode: route to editor
					if (inputMode) {
						if (matchesKey(data, Key.escape)) {
							customText = null;
							inputMode = false;
							inputQuestionId = null;
							editor.setText("");
							refresh();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					const q = currentQuestion();
					const opts = currentOptions();
					const multi = isMultiSelect();

					// Tab navigation (multi-question only)
					if (isMulti) {
						if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
							currentTab = (currentTab + 1) % totalTabs;
							optionIndex = 0;
							restoreSelection();
							refresh();
							return;
						}
						if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
							currentTab = (currentTab - 1 + totalTabs) % totalTabs;
							optionIndex = 0;
							restoreSelection();
							refresh();
							return;
						}
					}

					// Submit tab
					if (currentTab === questions.length) {
						if (matchesKey(data, Key.enter) && allAnswered()) {
							submit(false);
						} else if (matchesKey(data, Key.escape)) {
							submit(true);
						}
						return;
					}

					// Option navigation
					if (matchesKey(data, Key.up)) {
						optionIndex = Math.max(0, optionIndex - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						optionIndex = Math.min(opts.length - 1, optionIndex + 1);
						refresh();
						return;
					}

					// Space: toggle selection or enter edit mode on "Type something."
					if (matchesKey(data, Key.space) && q) {
						const spaceOpt = opts[optionIndex];
						if (spaceOpt?.isOther) {
							// Enter freeform input (preserves existing selections)
							inputMode = true;
							inputQuestionId = q.id;
							editor.setText(customText || "");
							refresh();
							return;
						}
						if (multi) {
							// Multi-select: toggle checkbox
							if (selectedIndices.has(optionIndex)) {
								selectedIndices.delete(optionIndex);
							} else {
								selectedIndices.add(optionIndex);
							}
						} else {
							// Single-select: radio-style toggle
							if (selectedIndices.has(optionIndex)) {
								selectedIndices.clear();
							} else {
								selectedIndices.clear();
								selectedIndices.add(optionIndex);
							}
						}
						refresh();
						return;
					}

					// Enter: confirm selection(s)
					if (matchesKey(data, Key.enter) && q) {
						// Multi-select: Enter always submits all toggled items + custom text
						if (multi) {
							saveMultiAnswer(q.id);
							return;
						}

						// Single-select: confirm Space-selected option
						if (selectedIndices.size === 0) return;
						const selIdx = [...selectedIndices][0];
						const selOpt = opts[selIdx];
						saveSingleAnswer(q.id, selOpt.value, selOpt.label, false, selIdx + 1);
						advanceAfterAnswer();
						return;
					}

					// Cancel
					if (matchesKey(data, Key.escape)) {
						submit(true);
					}
				}

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					const q = currentQuestion();
					const opts = currentOptions();
					const multi = isMultiSelect();

					// Helper to add truncated line
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(theme.fg("accent", "─".repeat(width)));

					// Tab bar (multi-question only)
					if (isMulti) {
						const tabs: string[] = ["← "];
						for (let i = 0; i < questions.length; i++) {
							const isActive = i === currentTab;
							const isAnswered = answers.has(questions[i].id);
							const lbl = questions[i].label;
							const box = isAnswered ? "■" : "□";
							const color = isAnswered ? "success" : "muted";
							const text = ` ${box} ${lbl} `;
							const styled = isActive ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(color, text);
							tabs.push(`${styled} `);
						}
						const canSubmit = allAnswered();
						const isSubmitTab = currentTab === questions.length;
						const submitText = " ✓ Submit ";
						const submitStyled = isSubmitTab
							? theme.bg("selectedBg", theme.fg("text", submitText))
							: theme.fg(canSubmit ? "success" : "dim", submitText);
						tabs.push(`${submitStyled} →`);
						add(` ${tabs.join("")}`);
						lines.push("");
					}

					// Render options list
					function renderOptions() {
						for (let i = 0; i < opts.length; i++) {
							const opt = opts[i];
							const isCursor = i === optionIndex;
							const isOther = opt.isOther === true;

							if (multi) {
								// Multi-select: checkbox style
								const hasCustom = isOther && customText !== null;
								const checked = selectedIndices.has(i) || hasCustom;
								const box = isCursor
									? theme.fg("accent", `> [${checked ? "x" : " "}]`)
									: `  [${checked ? theme.fg("success", "x") : " "}]`;
								const labelColor = isCursor ? "accent" : checked ? "success" : "text";
								const displayLabel = hasCustom ? `"${customText}"` : opt.label;
								add(` ${box} ${theme.fg(labelColor, `${i + 1}. ${displayLabel}`)}`);
							} else {
								// Single-select: Space selects, Enter confirms
								const hasCustom = isOther && customText !== null;
								const isSelected = selectedIndices.has(i) || hasCustom;
								const prefix = isCursor
									? theme.fg("accent", "> ")
									: isSelected
										? theme.fg("success", "• ")
										: "  ";
								const color = isCursor ? "accent" : isSelected ? "success" : "text";
								const displayLabel = hasCustom ? `"${customText}"` : opt.label;
								if (isOther && inputMode) {
									add(prefix + theme.fg("accent", `${i + 1}. ${displayLabel} ✎`));
								} else if (isOther && isSelected) {
									add(prefix + theme.fg("success", `${i + 1}. ${displayLabel} ✎`));
								} else {
									add(prefix + theme.fg(color, `${i + 1}. ${displayLabel}`));
								}
							}
							if (opt.description) {
								add(`     ${theme.fg("muted", opt.description)}`);
							}
						}
					}

					// Content
					if (inputMode && q) {
						add(theme.fg("text", ` ${q.prompt}`));
						lines.push("");
						// Show options for reference
						renderOptions();
						lines.push("");
						add(theme.fg("muted", " Your answer:"));
						for (const line of editor.render(width - 2)) {
							add(` ${line}`);
						}
						lines.push("");
						if (q?.multiSelect) {
						add(theme.fg("dim", " Enter to confirm • Esc to go back"));
					} else {
						add(theme.fg("dim", " Enter to submit • Esc to cancel"));
					}
					} else if (currentTab === questions.length) {
						add(theme.fg("accent", theme.bold(" Ready to submit")));
						lines.push("");
						for (const question of questions) {
							const answer = answers.get(question.id);
							if (answer) {
								if (answer.labels.length === 0) {
									add(`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("dim", "(none)")}`);
								} else if (answer.wasCustom) {
									add(`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("text", "(wrote) " + answer.labels[0])}`);
								} else if (question.multiSelect && answer.labels.length > 1) {
									const joined = answer.labels.map((l, i) => {
										const idx = answer.indices?.[i];
										return idx ? `${idx}. ${l}` : l;
									}).join(", ");
									add(`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("text", joined)}`);
								} else {
									const idx = answer.indices?.[0];
									const display = idx ? `${idx}. ${answer.labels[0]}` : answer.labels[0];
									add(`${theme.fg("muted", ` ${question.label}: `)}${theme.fg("text", display)}`);
								}
							}
						}
						lines.push("");
						if (allAnswered()) {
							add(theme.fg("success", " Press Enter to submit"));
						} else {
							const missing = questions
								.filter((q) => !answers.has(q.id))
								.map((q) => q.label)
								.join(", ");
							add(theme.fg("warning", ` Unanswered: ${missing}`));
						}
					} else if (q) {
						add(theme.fg("text", ` ${q.prompt}`));
						lines.push("");
						renderOptions();
					}

					lines.push("");
					if (!inputMode) {
						let help: string;
						if (multi && isMulti) {
							help = " Tab/←→ navigate • Space toggle • ↑↓ move • Enter confirm • Esc cancel";
						} else if (multi) {
							help = " Space toggle • ↑↓ move • Enter confirm • Esc cancel";
						} else if (isMulti) {
							help = " Tab/←→ navigate • Space select • ↑↓ move • Enter confirm • Esc cancel";
						} else {
							help = " Space select • ↑↓ move • Enter confirm • Esc cancel";
						}
						add(theme.fg("dim", help));
					}
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => {
						cachedLines = undefined;
					},
					handleInput,
				};
			});

			if (result.cancelled) {
				return {
					content: [{ type: "text", text: "User cancelled the questionnaire" }],
					details: result,
				};
			}

			const answerLines = result.answers.flatMap((a) => {
				const qLabel = questions.find((q) => q.id === a.id)?.label || a.id;
				const q = questions.find((q) => q.id === a.id);
				if (a.labels.length === 0) {
					return [`${qLabel}: user selected: (none)`];
				}
				// Multi-select + custom: show both checkboxes and custom text
				if (q?.multiSelect && a.labels.length > 1 && a.wasCustom) {
					const checkboxLabels = a.labels.slice(0, -1).map((l, i) => {
						const idx = a.indices?.[i];
						return idx ? `${idx}. ${l}` : l;
					}).join(", ");
					const customLabel = a.labels[a.labels.length - 1];
					return [`${qLabel}: user selected: ${checkboxLabels} • wrote: ${customLabel}`];
				}
				if (a.wasCustom) {
					return [`${qLabel}: user wrote: ${a.labels[0]}`];
				}
				if (q?.multiSelect) {
					const parts = a.labels.map((l, i) => {
						const idx = a.indices?.[i];
						return idx ? `${idx}. ${l}` : l;
					}).join(", ");
					return [`${qLabel}: user selected: ${parts}`];
				}
				const idx = a.indices?.[0];
				return [`${qLabel}: user selected: ${idx ? `${idx}. ${a.labels[0]}` : a.labels[0]}`];
			});

			return {
				content: [{ type: "text", text: answerLines.join("\n") }],
				details: result,
			};
		},

		renderCall(args, theme, _context) {
			const qs = (args.questions as Question[]) || [];
			const count = qs.length;
			const labels = qs.map((q) => q.label || q.id).join(", ");
			let text = theme.fg("toolTitle", theme.bold("questionnaire "));
			text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
			if (labels) {
				text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as QuestionnaireResult | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}
			const lines = details.answers.flatMap((a) => {
				if (a.labels.length === 0) {
					return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${theme.fg("dim", "(none)")}`];
				}
				// Multi-select + custom: show both checkboxes and custom text
				if (a.labels.length > 1 && a.wasCustom) {
					const checkboxLabels = a.labels.slice(0, -1).map((l, i) => {
						const idx = a.indices?.[i];
						return idx ? `${idx}. ${l}` : l;
					}).join(", ");
					const customLabel = a.labels[a.labels.length - 1];
					return [`${theme.fg("success", "✓ ")}${theme.fg("accent", a.id)}: ${checkboxLabels} ${theme.fg("muted", "• (wrote) ")}${customLabel}`];
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
		},
	});
}
