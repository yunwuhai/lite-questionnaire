/**
 * Questionnaire 类型定义
 *
 * 定义所有问题类型、约束条件、答案结构和状态接口。
 */

// ─── 选项 ────────────────────────────────────────────

export interface Option {
  value: string; // 返回的值
  label: string; // 显示标签
  description?: string; // 可选描述
}

// ─── 约束条件 ──────────────────────────────────────────

export interface Constraint {
  type: "required" | "minSelect" | "maxSelect" | "minLength" | "maxLength" | "pattern";
  value?: number | string; // 约束参数值
  message: string; // 校验失败时的错误提示
}

// ─── 基础问题 ─────────────────────────────────────────

export interface BaseQuestion {
  id: string; // 唯一标识
  label: string; // Tab 栏短标签
  prompt: string; // 完整问题文本
  required?: boolean; // 默认 true，标签后缀 [必填]
  constraints?: Constraint[]; // 约束条件对象数组
  children?: Question[]; // 条件子问题（分步插入）
  showIf?: { value: string }; // 仅当父问题答案为指定值时显示
}

// ─── 具体问题类型 ─────────────────────────────────────

export interface SelectQuestion extends BaseQuestion {
  type: "select";
  maxSelect: 1;
  options: Option[];
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: "multiSelect";
  maxSelect: number; // >1
  options: Option[];
}

export interface TextQuestion extends BaseQuestion {
  type: "text";
  placeholder?: string; // 输入框占位符
  multiline?: boolean; // 是否多行文本编辑
}

export interface ConfirmQuestion extends BaseQuestion {
  type: "confirm";
  yesLabel?: string; // 默认 "是"
  noLabel?: string; // 默认 "否"
}

export interface RatingQuestion extends BaseQuestion {
  type: "rating";
  range: { min: number; max: number };
  showEmoji?: boolean; // 是否显示表情量表
  annotations?: Record<number, string>; // 数值 → 文字注释
}

export type Question = SelectQuestion | MultiSelectQuestion | TextQuestion | ConfirmQuestion | RatingQuestion;

// ─── 扁平化问题（含展开子问题后的元数据） ──────────────

export interface FlatQuestion extends Question {
  _depth: number; // 嵌套深度（0 = 顶层）
  _parentId: string | null; // 父问题 id
}

// ─── 每个问题的 UI 瞬时状态 ───────────────────────────

export interface QuestionUIState {
  optionIndex: number; // 光标在选项列表中的位置
  selectedIndices: number[]; // Space 勾选的选项索引
  customText: string | null; // 自定义选项的编辑内容（临时保留）
  confirmValue: boolean; // confirm 类型当前高亮的按钮（true=是）
  ratingValue: number; // rating 类型当前滑块值
  textDraft: string; // text 类型当前编辑内容
}

// ─── 答案 ─────────────────────────────────────────────

export interface Answer {
  id: string; // 对应问题 id
  values: string[]; // 用户选择的值列表
  labels: string[]; // 用户选择的标签列表
  wasCustom: boolean; // 是否包含自定义输入
  indices?: number[]; // 1-based 选项索引
}

// ─── 问卷参数（顶层输入） ─────────────────────────────

export interface QuestionnaireParams {
  questions: Question[];
}

// ─── 结果 ─────────────────────────────────────────────

export interface QuestionnaireResult {
  questions: FlatQuestion[];
  answers: Answer[];
  cancelled: boolean;
}

// ─── 进度点颜色 ───────────────────────────────────────

export type ProgressColor = "green" | "red" | "none";
