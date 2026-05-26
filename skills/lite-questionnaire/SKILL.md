---
name: lite-questionnaire
description: >
  Use the `questionnaire` tool to collect structured information from users via
  interactive forms. Supports select (single choice), multiSelect (checkboxes),
  text (single/multiline), confirm (Y/N), and rating (1-5 slider). Use when you
  need to ask 2+ questions together, when questions depend on previous answers
  (conditional sub-questions), when you need input validation, or when you want
  session-persisted drafts. Do NOT use for a single yes/no or trivial
  one-question prompts — ask those inline instead.
---

# lite-questionnaire — interactive form skill

## When to use

- 2+ questions that belong together (e.g., project scaffolding wizard)
- Answers affect later questions (conditional sub-questions)
- Input needs validation (min/max length, regex, min/max selections)
- You want the user to be able to navigate back and edit previous answers
- Reusable question sets (session persistence restores drafts across calls)

## When NOT to use

- Single trivial question — ask inline
- Simple yes/no — use `confirm` question type directly, or ask inline
- Purely informational prompts — no answer collection needed

## Tool name

The pi tool is registered as `questionnaire`. Invoke it with:

```
questionnaire({ questions: [...] })
```

## Quick reference — question types

| type | icon | maxSelect | key fields | default |
|------|------|-----------|------------|---------|
| `select` | ○ | 1 (fixed) | `options` | none |
| `multiSelect` | ☐ | >= 2 | `options`, `constraints` | none |
| `text` | ✎ | — | `placeholder`, `multiline` | none (required) |
| `confirm` | ✓/✗ | — | `yesLabel`, `noLabel` | yes |
| `rating` | ★ | — | `range`, `showEmoji`, `annotations` | mid-value (3) |

## Common patterns

### Project scaffolding wizard

```json
{
  "questions": [
    {
      "id": "projectName",
      "type": "text",
      "label": "名称",
      "prompt": "项目名称？",
      "placeholder": "my-app",
      "constraints": [
        { "type": "minLength", "value": 2, "message": "项目名至少 2 个字符" },
        { "type": "pattern", "value": "^[a-z0-9-]+$", "message": "仅允许小写字母、数字和连字符" }
      ]
    },
    {
      "id": "language",
      "type": "select",
      "maxSelect": 1,
      "label": "语言",
      "prompt": "使用哪种编程语言？",
      "options": [
        { "value": "ts", "label": "TypeScript" },
        { "value": "py", "label": "Python" },
        { "value": "rs", "label": "Rust" },
        { "value": "go", "label": "Go" }
      ],
      "children": [
        {
          "id": "framework",
          "type": "select",
          "maxSelect": 1,
          "label": "框架",
          "prompt": "使用哪个框架？",
          "showIf": { "value": "ts" },
          "options": [
            { "value": "react", "label": "React" },
            { "value": "vue", "label": "Vue" },
            { "value": "express", "label": "Express" }
          ]
        },
        {
          "id": "pyFramework",
          "type": "select",
          "maxSelect": 1,
          "label": "框架",
          "prompt": "使用哪个框架？",
          "showIf": { "value": "py" },
          "options": [
            { "value": "fastapi", "label": "FastAPI" },
            { "value": "django", "label": "Django" },
            { "value": "flask", "label": "Flask" }
          ]
        }
      ]
    },
    {
      "id": "features",
      "type": "multiSelect",
      "maxSelect": 5,
      "label": "功能",
      "prompt": "需要哪些功能？",
      "options": [
        { "value": "auth", "label": "用户认证" },
        { "value": "api", "label": "REST API" },
        { "value": "db", "label": "数据库" },
        { "value": "ws", "label": "WebSocket" },
        { "value": "file", "label": "文件上传" }
      ],
      "constraints": [
        { "type": "minSelect", "value": 1, "message": "至少选择一项功能" }
      ]
    },
    {
      "id": "description",
      "type": "text",
      "label": "描述",
      "prompt": "简要描述项目目标（可选）",
      "placeholder": "一个高性能的...",
      "multiline": true,
      "constraints": [
        { "type": "maxLength", "value": 500, "message": "描述不超过 500 字" }
      ]
    }
  ]
}
```

### Code review survey

```json
{
  "questions": [
    {
      "id": "quality",
      "type": "rating",
      "label": "质量",
      "prompt": "代码整体质量评分",
      "range": { "min": 1, "max": 5 },
      "showEmoji": true,
      "annotations": { "1": "需要重写", "3": "可接受", "5": "非常优秀" }
    },
    {
      "id": "issues",
      "type": "multiSelect",
      "maxSelect": 4,
      "label": "问题",
      "prompt": "发现哪些问题？",
      "options": [
        { "value": "perf", "label": "性能问题" },
        { "value": "security", "label": "安全隐患" },
        { "value": "style", "label": "代码风格" },
        { "value": "tests", "label": "测试覆盖不足" }
      ]
    },
    {
      "id": "approve",
      "type": "confirm",
      "label": "审批",
      "prompt": "是否批准合并？",
      "yesLabel": "批准",
      "noLabel": "拒绝"
    }
  ]
}
```

### User preference picker

```json
{
  "questions": [
    {
      "id": "theme",
      "type": "select",
      "maxSelect": 1,
      "label": "主题",
      "prompt": "选择编辑器主题",
      "options": [
        { "value": "dark", "label": "暗色", "description": "护眼，适合夜间 coding" },
        { "value": "light", "label": "亮色", "description": "清晰，适合白天工作" },
        { "value": "high-contrast", "label": "高对比度", "description": "无障碍友好" }
      ]
    },
    {
      "id": "fontSize",
      "type": "rating",
      "label": "字号",
      "prompt": "编辑器字号偏好",
      "range": { "min": 1, "max": 5 },
      "annotations": { "1": "很小 (10px)", "3": "适中 (14px)", "5": "很大 (20px)" }
    }
  ]
}
```

## Conditional sub-questions

Use `children` + `showIf` to branch questions based on previous answers:

- `children` goes on the parent question
- Each child question has `showIf: { "value": "<parent answer value>" }`
- When the parent answer matches `showIf.value`, the child is inserted right after the parent in the tab sequence
- Children can nest their own `children` arbitrarily deep
- Sub-questions automatically expand into the flat tab sequence — the user navigates them with ←/→

## Constraints

Available validation rules:

| type | applies to | value | example message |
|------|-----------|-------|-----------------|
| `required` | all | — | "此问题必须回答" |
| `minSelect` | multiSelect | number | "至少选择 1 项" |
| `maxSelect` | multiSelect | number | "最多选择 3 项" |
| `minLength` | text | number | "至少输入 10 个字符" |
| `maxLength` | text | number | "不超过 500 个字符" |
| `pattern` | text | regex string | "仅允许字母和数字" |

- Constraints are validated on submission; invalid answers block progress.
- `maxSelect` for `select` is always 1 (single choice).
- `maxSelect` for `multiSelect` must be >= 2.
- `rating` `range` is locked to `{ min: 1, max: 5 }`.

## Result handling

The tool returns `QuestionnaireResult`:

```json
// Normal submission
{
  "answers": {
    "projectName": { "text": "my-app" },
    "language": { "value": "ts", "label": "TypeScript", "wasCustom": false },
    "features": { "values": ["auth","api"], "labels": ["用户认证","REST API"], "wasCustom": false },
    "quality": { "value": 4, "annotation": "" },
    "approve": { "confirmed": true, "label": "批准" }
  },
  "submittedAt": "2026-05-26T12:00:00.000Z"
}

// User pressed Esc
{
  "cancelled": true,
  "message": "User cancelled the questionnaire"
}
```

After receiving results, extract answers by `result.answers.<questionId>` and proceed with the next step. If `cancelled` is true, stop and inform the user.

## Session persistence

- Questionnaire state persists across TUI sessions automatically.
- Calling the tool again with the **same `questions` list** restores previous answers and progress.
- Esc cancels but does NOT clear drafts — next call restores them.
- Submission clears state — next call with same questions starts fresh.
- You (the AI) don't need to handle this — just call `questionnaire` normally.

## Tips

1. **Labels matter**: Tab bar is narrow; keep `label` to 2–4 Chinese characters or 6–8 ASCII characters.
2. **Add descriptions to options**: `description` helps users understand nuanced choices.
3. **Always validate text**: Use `constraints` with `minLength`/`maxLength`/`pattern` for text fields.
4. **Emoji for satisfaction**: Set `showEmoji: true` on rating questions for satisfaction surveys — 😡😟😐😊😍 gives better UX.
5. **Custom option is automatic**: Select/multiSelect always have a trailing "custom" option — users can type free-form answers.
6. **Single-question form**: When there's only 1 question, there's no submit page — the answer is returned immediately.
7. **Reuse question sets**: Because of session persistence, identical `questions` arrays will restore drafts. Use consistent `id` values for recurring forms.
