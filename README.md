# questionnaire

通用交互式问卷工具，支持单选、多选、文本输入、确认、评分五种问题类型，提供条件子问题、约束校验、会话持久化等高级特性。

## 问题类型

| 类型 | 标识 | 说明 | Enter 行为 |
|------|------|------|-----------|
| `select` | 单选 | Space 标定一项，Enter 提交 | 提交并前进 |
| `multiSelect` | 多选 | Space 切换勾选多项，Enter 批量提交 | 提交并前进 |
| `text` | 文本 | 进入即内联编辑，无选项列表 | 提交并前进 |
| `confirm` | 确认 | Y/N 双按钮，← → 切换 | 确认并前进 |
| `rating` | 评分 | 滑块条 + 表情量表 + 文字注释 | 确认并前进 |

## 工具参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `questions` | `Question[]` | 问题列表（至少 1 个） |

### 基础字段（所有类型共用）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `id` | string | ✅ | - | 唯一标识 |
| `label` | string | ✅ | - | Tab 栏短标签 |
| `prompt` | string | ✅ | - | 完整问题文本 |
| `type` | enum | ✅ | - | select / multiSelect / text / confirm / rating |
| `required` | boolean | ❌ | true | 是否必答，标签后缀 `[必填]` |
| `constraints` | Constraint[] | ❌ | [] | 声明式约束校验 |
| `children` | Question[] | ❌ | [] | 条件子问题 |
| `showIf` | { value } | ❌ | - | 子问题条件（仅 children 中使用） |

### select / multiSelect 特有字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `options` | Option[] | 选项列表 `{ value, label, description? }` |
| `maxSelect` | number | 单选 = 1，多选 >= 2 |

### text 特有字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `placeholder` | string | - | 输入框占位符 |
| `multiline` | boolean | false | 多行文本编辑 |

### confirm 特有字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `yesLabel` | string | "是" | 确认按钮文本 |
| `noLabel` | string | "否" | 否认按钮文本 |

### rating 特有字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `range` | { min, max } | - | 评分范围 |
| `showEmoji` | boolean | false | 显示表情量表 |
| `annotations` | Record<number, string> | - | 数值→文字注释 |

## 约束条件

```json
{
  "constraints": [
    { "type": "minSelect", "value": 1, "message": "至少选择一项" },
    { "type": "minLength", "value": 10, "message": "至少 10 个字符" }
  ]
}
```

| type | 适用问题 | value | 说明 |
|------|---------|-------|------|
| `required` | 全部 | - | 必填校验 |
| `minSelect` | multiSelect | number | 最少选择项数 |
| `maxSelect` | multiSelect | number | 最多选择项数 |
| `minLength` | text | number | 最小文本长度 |
| `maxLength` | text | number | 最大文本长度 |
| `pattern` | text | string | 正则匹配 |

## 条件子问题

```json
{
  "id": "lang",
  "type": "select",
  "maxSelect": 1,
  "label": "语言",
  "prompt": "用哪种编程语言？",
  "options": [
    { "value": "ts", "label": "TypeScript" },
    { "value": "py", "label": "Python" }
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
}
```

当用户选择 "TypeScript" 时，子问题"框架"自动插入 Tab 序列。

## 交互方式

| 按键 | 单选 | 多选 | 文本 | 确认 | 评分 |
|------|------|------|------|------|------|
| ↑ ↓ | 导航选项 | 导航选项 | — | — | — |
| ← → | 切换问题 | 切换问题 | 切换问题 | 切换按钮 | 调整滑块 |
| Space | 标定选项 | 切换勾选 | — | — | — |
| Enter | 提交+前进 | 提交+前进 | 提交+前进 | 确认+前进 | 确认+前进 |
| Tab | 编辑自定义 | 编辑自定义 | — | — | — |
| 1-9 | 跳转选项 | 跳转选项 | — | — | 跳到对应值 |
| Esc | 取消问卷 | 取消问卷 | 取消问卷 | 取消问卷 | 取消问卷 |

- **自定义选项**：选项列表末尾始终有"自定义"，Space 勾选 + Tab 编辑独立操作
- **进度点**：🟢 已答 / 🔴 进过未答 / ⚪ 未进入
- **← 回退**：随时回到上一题修改，草稿保留
- **提交页**：汇总所有答案，未完成项禁止提交

## 示例

```json
{
  "questions": [
    {
      "id": "lang",
      "type": "select",
      "maxSelect": 1,
      "label": "语言",
      "prompt": "用哪种编程语言？",
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
      "id": "satisfaction",
      "type": "rating",
      "label": "满意度",
      "prompt": "对代码质量的满意度？",
      "range": { "min": 1, "max": 5 },
      "showEmoji": true,
      "annotations": { "1": "非常差", "5": "非常好" }
    }
  ]
}
```

## 代码架构

```
questionnaire/
├── index.ts            # 入口，注册工具 + TypeBox Schema + 渲染回调
├── core.ts             # 状态管理、子问题展开、进度计算、约束校验
├── types.ts            # TypeScript 类型定义
├── render.ts           # 通用渲染（面板框架、Tab 栏、提交页、提示栏）
├── input.ts            # 全局按键分发（← → Space Enter Esc Tab 1-9）
├── state.ts            # 会话持久化（pi.appendEntry）
├── modules/
│   ├── shared.ts       # 模块间共享类型
│   ├── select.ts       # 单选渲染 + 输入处理
│   ├── multiSelect.ts  # 多选渲染 + 输入处理
│   ├── text.ts         # 文本编辑渲染 + 草稿保存
│   ├── confirm.ts      # 确认双按钮渲染
│   └── rating.ts       # 评分滑块 + 表情渲染
└── README.md
```
