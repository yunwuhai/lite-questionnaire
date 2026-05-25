# Questionnaire 重构需求文档 v1.0

## 1. 概述

彻底重写 questionnaire 插件，吸收 `question` 工具，统一为单一问答工具。采用面板式布局 + 现代简洁风格，按功能模块拆分代码。

---

## 2. 核心交互模型

### 2.1 按键映射

| 按键 | 行为 |
|------|------|
| `↑ ↓` | 导航选项 |
| `← →` | 切换问题（文件管理器风格） |
| `Space` | 选择/勾选当前选项（单选 = 标定，多选 = 切换勾选） |
| `Enter` | 提交当前问题 → 进入下一题 |
| `Tab` | 在"自定义"选项上进入编辑模式 |
| `Esc` | 取消整个问卷 / 退出编辑模式（放弃编辑内容） |
| `数字键 1-9` | 高亮对应选项（光标跳过去），还需 Space/Enter 确认 |

### 2.2 关键行为规则

- **Enter 仅提交**：无论单选多选，Enter 只有"提交当前问题并前进"功能
- **未选就 Enter**：照样前进到下一题，但进度点标记为**红色**，提交页禁止提交
- **Space 选择 + Enter 确认**：单选和多选统一，Space 选择，Enter 提交
- **← 撤销**：即使已回答也允许 ← 回到上一题修改，保留草稿
- **自定义选项**（"自定义"）：Space 勾选和 Tab 编辑**完全独立**
  - 编辑了但不勾选 → 提交时不会包含
  - 编辑内容临时保留，可回头勾选后生效
  - Tab 进入编辑，Enter 保存返回，Esc 丢弃返回
- **text 类型**：纯文本输入，无选项列表，进入即内联编辑
- **提交页**：汇总确认页，列出所有答案，未完成项红色标注，禁止提交
- **全局 Esc**：任意问题中 Esc 取消整个问卷

### 2.3 进度点

进度点合并显示在 Tab 标签栏，三色方案：

| 颜色 | 含义 |
|------|------|
| 🟢 绿色 | 已选择并提交（已回答） |
| 🔴 红色 | 进入过但未选择就 Enter 跳过（未回答） |
| ⚪ 空白/灰色 | 尚未进入该问题 |

---

## 3. 问题类型

| 类型 | 标识 | 说明 |
|------|------|------|
| `select` | 单选 | Space 标定一项 + Enter 提交 |
| `multiSelect` | 多选 | Space 切换多项勾选 + Enter 一次性提交 |
| `text` | 文本 | 纯文本输入，无选项列表，进入即编辑 |
| `confirm` | 确认 | 内联 Y/N，← → 选择按钮，Enter 确认 |
| `rating` | 评分 | 滑块条 + 表情量表 + 文字注释共存 |

单选/多选自动推断：通过 `maxSelect` 字段（`maxSelect=1` 即单选，`>1` 即多选）。

---

## 4. API 结构

```typescript
interface QuestionnaireParams {
  questions: Question[];
}

type Question = SelectQuestion | MultiSelectQuestion | TextQuestion | ConfirmQuestion | RatingQuestion;

// 基础字段
interface BaseQuestion {
  id: string;                        // 唯一标识
  label: string;                     // Tab 栏短标签
  prompt: string;                    // 完整问题文本
  required?: boolean;                // 默认 true，标签后缀 [必填]
  constraints?: Constraint[];        // 约束条件对象数组
  children?: Question[];             // 条件子问题（分步插入）
  showIf?: { value: string };        // 仅当父问题答案为指定值时显示
}

// 约束条件
interface Constraint {
  type: 'required' | 'minSelect' | 'maxSelect' | 'minLength' | 'maxLength' | 'pattern';
  value?: number | string;
  message: string;
}

// 选项定义
interface Option {
  value: string;                     // 返回的值
  label: string;                     // 显示标签
  description?: string;              // 可选描述
}

// 单选
interface SelectQuestion extends BaseQuestion {
  type: 'select';
  maxSelect: 1;
  options: Option[];
}

// 多选
interface MultiSelectQuestion extends BaseQuestion {
  type: 'multiSelect';
  maxSelect: number;                 // >1
  options: Option[];
}

// 文本输入
interface TextQuestion extends BaseQuestion {
  type: 'text';
  placeholder?: string;
  multiline?: boolean;
}

// 确认
interface ConfirmQuestion extends BaseQuestion {
  type: 'confirm';
  yesLabel?: string;                 // 默认 "是"
  noLabel?: string;                  // 默认 "否"
}

// 评分
interface RatingQuestion extends BaseQuestion {
  type: 'rating';
  range: { min: number; max: number };
  showEmoji?: boolean;               // 是否显示表情量表
  annotations?: Record<number, string>;  // 数值 → 文字注释
}
```

### 4.1 示例

```json
{
  "questions": [
    {
      "id": "lang",
      "type": "select",
      "maxSelect": 1,
      "label": "语言",
      "prompt": "用哪种编程语言？",
      "required": true,
      "options": [
        { "value": "ts", "label": "TypeScript" },
        { "value": "py", "label": "Python" },
        { "value": "rs", "label": "Rust" }
      ],
      "children": [
        {
          "id": "framework",
          "type": "select",
          "maxSelect": 1,
          "label": "框架",
          "prompt": "用哪个框架？",
          "showIf": { "value": "ts" },
          "options": [
            { "value": "react", "label": "React" },
            { "value": "vue", "label": "Vue" }
          ]
        }
      ]
    },
    {
      "id": "features",
      "type": "multiSelect",
      "maxSelect": 3,
      "label": "功能",
      "prompt": "需要哪些功能？",
      "options": [
        { "value": "auth", "label": "用户认证" },
        { "value": "api", "label": "REST API" },
        { "value": "ws", "label": "WebSocket" }
      ],
      "constraints": [
        { "type": "minSelect", "value": 1, "message": "至少选择一项" }
      ]
    },
    {
      "id": "description",
      "type": "text",
      "label": "描述",
      "prompt": "项目描述",
      "multiline": true
    },
    {
      "id": "confirm",
      "type": "confirm",
      "label": "确认",
      "prompt": "确定要创建项目？",
      "yesLabel": "创建",
      "noLabel": "取消"
    },
    {
      "id": "rating",
      "type": "rating",
      "label": "评价",
      "prompt": "对代码质量的满意度？",
      "range": { "min": 1, "max": 5 },
      "showEmoji": true,
      "annotations": { "1": "非常差", "5": "非常好" }
    }
  ]
}
```

---

## 5. 视觉设计

- **布局**：面板式，带边框包裹
- **风格**：现代简洁，适当间距，圆角边框
- **进度**：步骤点 `● ● ○ ○ ○` 合并显示在 Tab 栏
- **必填标记**：prompt 后缀 `[必填]` 彩色标签（theme.accent 或 theme.warning）
- **Tab 栏**：`◀ 标签1 | 标签2 | 标签3 ▶` 风格，含 Submit 标签
- **汇总页**：表格式列出所有 Q&A，← 可回退修改
- **约束错误**：当前问题底部显示红色错误提示
- **自定义选项**：选项列表最后一项，标签为"自定义"

---

## 6. 代码架构

```
extensions/questionnaire/
├── index.ts            # 入口，注册工具 + API 定义
├── core.ts             # 共享状态管理、导航、Tab 切换
├── types.ts            # TypeScript 类型定义
├── render.ts           # 渲染引擎（面板、Tab 栏、进度点、汇总页）
├── input.ts            # 按键分发与处理
├── state.ts            # 会话持久化
├── modules/
│   ├── select.ts       # 单选逻辑
│   ├── multiSelect.ts  # 多选逻辑
│   ├── text.ts         # 文本输入
│   ├── confirm.ts      # 确认弹窗
│   └── rating.ts       # 评分滑块
└── README.md
```

### 6.1 模块职责

| 模块 | 职责 |
|------|------|
| `index.ts` | 工具注册、参数 Schema、execute 入口、renderCall/renderResult |
| `core.ts` | 问题列表管理、Tab 导航状态、答案 Map、进度点计算、提交校验 |
| `types.ts` | 所有 TypeScript 接口和类型导出 |
| `render.ts` | 通用渲染函数（面板框架、Tab 栏、汇总页）、布局计算 |
| `input.ts` | 全局按键监听、事件分发到各问题模块 |
| `modules/select.ts` | 单选 UI 渲染 + Space 标定 + Enter 提交 + 箭头导航 |
| `modules/multiSelect.ts` | 多选 UI 渲染 + Space 切换 + Enter 批量提交 |
| `modules/text.ts` | 文本编辑 UI（复用 Editor）+ Enter 提交 |
| `modules/confirm.ts` | Y/N 双按钮 UI + ← → 切换 + Enter 确认 |
| `modules/rating.ts` | 滑块条 UI + 表情渲染 + ← → 调整 + Enter 确认 |
| `state.ts` | 序列化/反序列化、会话存储/恢复 |

---

## 7. 功能清单

| 功能 | 状态 |
|------|------|
| 条件/依赖问题（嵌套子问题，分步插入） | ✅ |
| 约束校验（声明式 Constraint 对象） | ✅ |
| 可选/必答标记（`[必填]` 标签后缀） | ✅ |
| 数字键快捷高亮（1-9 跳到对应选项） | ✅ |
| 评分/滑块（滑块条 + 表情量表 + 文字注释） | ✅ |
| 确认弹窗（内联 Y/N 按钮） | ✅ |
| 撤销/回退（← 回到上一题，保留草稿） | ✅ |
| 进度点（三色：绿/红/空白） | ✅ |
| 会话持久化（暂停/恢复，跨 TUI 会话） | ✅ |
| 自定义选项（Space 勾选 + Tab 编辑，操作独立） | ✅ |
| 汇总确认页（禁止未完成提交） | ✅ |
| 选项搜索/过滤 | ❌ |
| 默认值/预选 | ❌ |

---

## 8. 与现有实现的差异

| 方面 | 现有实现 | 重构后 |
|------|---------|--------|
| 工具数量 | question + questionnaire 两个工具 | 单一 questionnaire 工具 |
| 交互模型 | Space 选 + Enter 确认（两步） | Space 选择，Enter 仅提交 |
| 自定义选项 | "Type something." Enter 进入编辑 | "自定义" Tab 进入编辑，Space/Tab 独立 |
| 进度标记 | 仅 □/■ 标记是否回答 | 三色步骤点：绿/红/空白 |
| 问题类型 | 仅 select/multiSelect（隐式） | select/multiSelect/text/confirm/rating |
| 条件问题 | 不支持 | 嵌套 children + showIf |
| 约束校验 | 仅多选"至少选一项" | 声明式 Constraint 数组 |
| 代码组织 | 单文件 ~400 行 | 按功能拆分为 10+ 文件 |
| 会话持久化 | 不支持 | 完整会话支持 |
| 导航 | Tab/← → 混合 | ← → 切换问题，↑ ↓ 导航选项 |
