/**
 * Questionnaire 核心状态管理
 *
 * 管理问题列表、Tab 导航、答案 Map、进度点计算和状态持久化。
 */

import type {
  Answer,
  Constraint,
  FlatQuestion,
  ProgressColor,
  Question,
  QuestionnaireResult,
  QuestionUIState,
} from "./types";

// ─── 核心类 ────────────────────────────────────────────

export class Core {
  /** 扁平化问题列表（子问题已展开插入） */
  questions: FlatQuestion[] = [];

  /** 当前问题在 flat list 中的索引 */
  currentIndex = 0;

  /** 持久化答案（已提交的） */
  answers = new Map<string, Answer>();

  /** 已访问过的问题 id 集合（仅保留访问历史，不再直接决定进度颜色） */
  visited = new Set<string>();

  /** 每个问题的进度点状态：none=未访问/未判定，red=已访问无值，green=已完成 */
  private progress = new Map<string, ProgressColor>();

  /** 每个问题的 UI 瞬时状态 */
  private uiStates = new Map<string, QuestionUIState>();

  /** 是否处于文本编辑模式（自定义选项编辑） */
  inputMode = false;

  /** 当前编辑对应的问题 id */
  inputQuestionId: string | null = null;

  /** 当前校验错误消息（显示在问题底部） */
  errorMessage: string | null = null;

  // ─── 构建方法 ──────────────────────────────────────────

  /**
   * 从原始问题列表 + 已有答案构建扁平化列表。
   * 根据父问题答案展开条件子问题，插入到父问题之后。
   */
  static expand(questions: Question[], answers: Map<string, Answer>): FlatQuestion[] {
    const result: FlatQuestion[] = [];

    function walk(qs: Question[], depth: number, parentId: string | null) {
      for (const q of qs) {
        result.push({ ...q, _depth: depth, _parentId: parentId });

        // 检查条件子问题是否应展开
        if (q.children && q.children.length > 0) {
          const answer = answers.get(q.id);
          if (answer) {
            const parentValues: string[] = [];
            if ('value' in answer && typeof answer.value === 'string') {
              parentValues.push(answer.value);
            } else if ('values' in answer) {
              parentValues.push(...answer.values);
            }
            if (parentValues.length > 0) {
              const matching = q.children.filter(
                (c) => !c.showIf || parentValues.includes(c.showIf.value),
              );
              if (matching.length > 0) {
                walk(matching, depth + 1, q.id);
              }
            }
          }
        }
      }
    }

    walk(questions, 0, null);
    return result;
  }

  /**
   * 初始化：从原始问题列表构建扁平列表
   */
  init(questions: Question[]) {
    this.questions = Core.expand(questions, this.answers);
    this.currentIndex = 0;
    this.visited.clear();
    this.progress.clear();
    this.answers.clear();
    this.uiStates.clear();
    this.inputMode = false;
    this.inputQuestionId = null;
    this.errorMessage = null;
  }

  /**
   * 在父问题提交后重新展开子问题。
   * 返回 true 表示列表有变化（需要刷新 UI）。
   */
  reexpand(originalQuestions: Question[]): boolean {
    const before = this.questions.map((q) => q.id).join(",");
    this.questions = Core.expand(originalQuestions, this.answers);
    this.pruneInactiveState();
    const after = this.questions.map((q) => q.id).join(",");
    return before !== after;
  }

  // ─── 当前问题访问 ──────────────────────────────────────

  /** 获取当前问题 */
  currentQuestion(): FlatQuestion | undefined {
    return this.questions[this.currentIndex];
  }

  /** 是否在提交页 */
  isSubmitTab(): boolean {
    return this.currentIndex >= this.questions.length;
  }

  /** 总 Tab 数（问题 + 提交页） */
  totalTabs(): number {
    return this.questions.length + 1;
  }

  // ─── UI 状态管理 ──────────────────────────────────────

  /** 获取或创建当前问题的 UI 状态 */
  getUIState(): QuestionUIState {
    const q = this.currentQuestion();
    if (!q) return this.defaultUIState();
    let state = this.uiStates.get(q.id);
    if (!state) {
      state = this.defaultUIState(q);
      this.uiStates.set(q.id, state);
    }
    return state;
  }

  /** 保存当前问题的 UI 状态 */
  saveUIState(state: QuestionUIState) {
    const q = this.currentQuestion();
    if (q) this.uiStates.set(q.id, { ...state });
  }

  private defaultUIState(q?: FlatQuestion): QuestionUIState {
    const ratingMiddle = q && q.type === "rating"
      ? 3
      : 0;
    return {
      optionIndex: 0,
      selectedIndices: [],
      customText: null,
      confirmValue: true,
      ratingValue: ratingMiddle,
      textDraft: "",
    };
  }

  // ─── 答案管理 ─────────────────────────────────────────

  private answerHasValue(a: Answer | undefined): boolean {
    if (!a) return false;
    if ('values' in a) return a.values.length > 0;               // MultiSelectAnswer
    if ('value' in a && typeof a.value === 'string') return a.value.trim().length > 0; // SelectAnswer
    if ('text' in a) return a.text.trim().length > 0;            // TextAnswer
    // ConfirmAnswer (confirmed) / RatingAnswer (value: number) — 始终有值
    return true;
  }

  /** 问题是否已有有效的持久化答案 */
  hasAnswer(questionId: string): boolean {
    return this.answerHasValue(this.answers.get(questionId));
  }

  /**
   * 统一的值存在性判定。
   * 优先检查持久化答案；没有答案时再检查当前 UI 草稿/默认值。
   */
  hasAnyValue(q: FlatQuestion, state?: QuestionUIState): boolean {
    if (q.id === "__lq_notes__") return true;
    const answer = this.answers.get(q.id);
    if (this.answerHasValue(answer)) return true;

    const s = state || this.uiStates.get(q.id) || this.defaultUIState(q);
    switch (q.type) {
      case "confirm":
      case "rating":
        return true;
      case "text":
        return (s.textDraft || "").trim().length > 0;
      case "select": {
        const idx = s.selectedIndices[0];
        if (idx === undefined) return false;
        if (idx >= 0 && idx < q.options.length) return true;
        return idx === q.options.length && (s.customText || "").trim().length > 0;
      }
      case "multiSelect":
        return s.selectedIndices.some((idx) => {
          if (idx >= 0 && idx < q.options.length) return true;
          return idx === q.options.length && (s.customText || "").trim().length > 0;
        });
    }
    return false;
  }

  /** 问题是否已完成：状态机判定为绿色，或已有有效持久化答案 */
  isComplete(q: FlatQuestion): boolean {
    return this.progress.get(q.id) === "green" || this.hasAnswer(q.id);
  }

  /** 保存答案 */
  saveAnswer(questionId: string, answer: Answer) {
    this.answers.set(questionId, answer);
    if (this.answerHasValue(answer)) {
      this.progress.set(questionId, "green");
    }
  }

  /** 删除答案（回退修改后跳过时使用） */
  deleteAnswer(questionId: string) {
    this.answers.delete(questionId);
    this.progress.delete(questionId);
  }

  /** 移除当前展开列表中已经不可见的问题状态，避免隐藏子问题污染结果 */
  pruneInactiveState() {
    const activeIds = new Set(this.questions.map((q) => q.id));
    for (const id of Array.from(this.answers.keys())) {
      if (!activeIds.has(id)) this.answers.delete(id);
    }
    for (const id of Array.from(this.visited)) {
      if (!activeIds.has(id)) this.visited.delete(id);
    }
    for (const id of Array.from(this.progress.keys())) {
      if (!activeIds.has(id)) this.progress.delete(id);
    }
    for (const id of Array.from(this.uiStates.keys())) {
      if (!activeIds.has(id)) this.uiStates.delete(id);
    }
    if (this.currentIndex > this.questions.length) {
      this.currentIndex = this.questions.length;
    }
  }

  /** 所有问题是否均可提交 */
  allAnswered(): boolean {
    return this.questions.every((q) => this.isComplete(q));
  }

  /** 获取所有未完成的问题 id */
  incompleteQuestions(): string[] {
    return this.questions.filter((q) => !this.isComplete(q)).map((q) => q.id);
  }

  // ─── 进度点 ───────────────────────────────────────────

  /** 离开当前问题时，根据是否有值统一更新进度点颜色 */
  leaveCurrentQuestion() {
    const q = this.currentQuestion();
    if (!q) return;
    const state = this.getUIState();
    this.visited.add(q.id);
    this.progress.set(q.id, this.hasAnyValue(q, state) ? "green" : "red");
  }

  /** 获取指定索引问题的进度点颜色 */
  getProgress(index: number): ProgressColor {
    const q = this.questions[index];
    if (!q) return "none";
    return this.progress.get(q.id) || "none";
  }

  // ─── 导航 ─────────────────────────────────────────────

  /** 标记当前问题为已访问 */
  markVisited() {
    const q = this.currentQuestion();
    if (q) this.visited.add(q.id);
  }

  /** 前进到下一个问题（或提交页） */
  advance() {
    this.errorMessage = null;
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
    } else {
      this.currentIndex = this.questions.length; // 提交页
    }
    // 重置新问题的 UI 状态（内部标记 visited）
    this.resetUIStateForCurrent();
  }

  /** 回退到上一个问题 */
  goBack() {
    this.errorMessage = null;
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.resetUIStateForCurrent();
    }
  }

  /** 跳转到指定问题索引 */
  goTo(index: number) {
    if (index >= 0 && index <= this.questions.length) {
      this.currentIndex = index;
      this.resetUIStateForCurrent();
    }
  }

  /** ← 方向切换问题（含提交页） */
  prevTab() {
    const total = this.totalTabs();
    this.currentIndex = (this.currentIndex - 1 + total) % total;
    this.errorMessage = null;
    this.resetUIStateForCurrent();
  }

  /** → 方向切换问题（含提交页） */
  nextTab() {
    const total = this.totalTabs();
    this.currentIndex = (this.currentIndex + 1) % total;
    this.errorMessage = null;
    this.resetUIStateForCurrent();
  }


  private resetUIStateForCurrent() {
    const q = this.currentQuestion();
    if (q) {
      this.visited.add(q.id);
      const fresh = this.defaultUIState(q);
      // 保留之前的 draft，以便回头继续编辑
      const prev = this.uiStates.get(q.id);
      if (prev) {
        fresh.textDraft = prev.textDraft;
        fresh.customText = prev.customText;
        fresh.selectedIndices = [...prev.selectedIndices];
        fresh.ratingValue = prev.ratingValue;
        fresh.confirmValue = prev.confirmValue;
        fresh.optionIndex = prev.optionIndex;
      }
      this.uiStates.set(q.id, fresh);
    }
  }

  // ─── 约束校验 ─────────────────────────────────────────

  /**
   * 对当前问题的答案进行约束校验。
   * 返回 { valid, message }。
   */
  validate(questionId: string, values: string[], labels: string[]): { valid: boolean; message?: string } {
    const q = this.questions.find((q) => q.id === questionId);
    if (!q) return { valid: true };
    if (!q.constraints || q.constraints.length === 0) return { valid: true };

    for (const c of q.constraints) {
      const result = this.checkConstraint(c, values, labels, q);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  private checkConstraint(
    c: Constraint,
    values: string[],
    labels: string[],
    _q: FlatQuestion,
  ): { valid: boolean; message?: string } {
    switch (c.type) {
      case "required":
        if (values.length === 0 || values.every((v) => v.trim() === "")) {
          return { valid: false, message: c.message };
        }
        break;
      case "minSelect":
        if (values.length < (c.value as number)) {
          return { valid: false, message: c.message };
        }
        break;
      case "maxSelect":
        if (values.length > (c.value as number)) {
          return { valid: false, message: c.message };
        }
        break;
      case "minLength": {
        const text = values.join(" ").trim();
        if (text.length < (c.value as number)) {
          return { valid: false, message: c.message };
        }
        break;
      }
      case "maxLength": {
        const text = values.join(" ").trim();
        if (text.length > (c.value as number)) {
          return { valid: false, message: c.message };
        }
        break;
      }
      case "pattern": {
        const text = values.join(" ").trim();
        const regex = new RegExp(c.value as string);
        if (!regex.test(text)) {
          return { valid: false, message: c.message };
        }
        break;
      }
    }
    return { valid: true };
  }

  // ─── 序列化（用于会话持久化） ─────────────────────────

  serialize(): QuestionnaireSnapshot {
    return {
      currentIndex: this.currentIndex,
      answers: Array.from(this.answers.entries()).map(([id, a]) => [id, a]),
      visited: Array.from(this.visited),
      progress: Array.from(this.progress.entries()),
      uiStates: Array.from(this.uiStates.entries()).map(([id, s]) => [
        id,
        {
          ...s,
          selectedIndices: [...s.selectedIndices],
        },
      ]),
    };
  }

  restore(snapshot: QuestionnaireSnapshot) {
    this.currentIndex = snapshot.currentIndex;
    this.answers = new Map(snapshot.answers);
    this.visited = new Set(snapshot.visited);
    this.progress = new Map(snapshot.progress || []);
    for (const [id, answer] of this.answers) {
      if (this.answerHasValue(answer)) {
        this.progress.set(id, "green");
      }
    }
    for (const id of this.visited) {
      if (!this.progress.has(id) && !this.hasAnswer(id)) {
        this.progress.set(id, "red");
      }
    }
    this.uiStates = new Map(
      snapshot.uiStates.map(([id, s]) => [id, { ...s, selectedIndices: [...(s.selectedIndices ?? [])] }]),
    );
  }

  // ─── 导出结果 ─────────────────────────────────────────

  toResult(): QuestionnaireResult {
    const answers: Record<string, Answer> = {};
    for (const [id, answer] of this.answers) {
      answers[id] = answer;
    }
    return {
      answers,
      submittedAt: new Date().toISOString(),
    };
  }
}

/** 快照，用于会话持久化 */
export interface QuestionnaireSnapshot {
  key?: string;
  currentIndex: number;
  answers: [string, Answer][];
  visited: string[];
  progress?: [string, ProgressColor][];
  uiStates: [string, QuestionUIState][];
}
