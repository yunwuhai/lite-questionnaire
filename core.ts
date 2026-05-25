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

  /** 已访问过的问题 id 集合（用于进度点红色标记） */
  visited = new Set<string>();

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
          if (answer && answer.values.length > 0) {
            const parentValue = answer.values[0];
            const matching = q.children.filter(
              (c) => !c.showIf || c.showIf.value === parentValue,
            );
            if (matching.length > 0) {
              walk(matching, depth + 1, q.id);
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
      ? Math.round((q.range.min + q.range.max) / 2)
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

  /** 问题是否已有有效答案 */
  hasAnswer(questionId: string): boolean {
    const a = this.answers.get(questionId);
    return a !== undefined && a.values.length > 0;
  }

  /** 保存答案 */
  saveAnswer(
    questionId: string,
    values: string[],
    labels: string[],
    wasCustom: boolean,
    indices?: number[],
  ) {
    this.answers.set(questionId, {
      id: questionId,
      values,
      labels,
      wasCustom,
      indices: indices && indices.length > 0 ? indices : undefined,
    });
  }

  /** 所有问题的答案是否已全部提交 */
  allAnswered(): boolean {
    return this.questions.every((q) => this.hasAnswer(q.id));
  }

  /** 获取所有未完成的问题 id */
  incompleteQuestions(): string[] {
    return this.questions.filter((q) => !this.hasAnswer(q.id)).map((q) => q.id);
  }

  // ─── 进度点 ───────────────────────────────────────────

  /** 获取指定索引问题的进度点颜色 */
  getProgress(index: number): ProgressColor {
    const q = this.questions[index];
    if (!q) return "none";
    if (this.hasAnswer(q.id)) return "green";
    if (this.visited.has(q.id)) return "red";
    return "none";
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
    this.uiStates = new Map(
      snapshot.uiStates.map(([id, s]) => [id, { ...s, selectedIndices: [...(s.selectedIndices ?? [])] }]),
    );
  }

  // ─── 导出结果 ─────────────────────────────────────────

  toResult(cancelled: boolean): QuestionnaireResult {
    return {
      questions: this.questions,
      answers: Array.from(this.answers.values()),
      cancelled,
    };
  }
}

/** 快照，用于会话持久化 */
export interface QuestionnaireSnapshot {
  currentIndex: number;
  answers: [string, Answer][];
  visited: string[];
  uiStates: [string, QuestionUIState][];
}
