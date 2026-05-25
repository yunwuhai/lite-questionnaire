# questionnaire

通用问卷工具。支持单问题或多问题（Tab 切换），让 AI 可以结构化地向用户收集决策信息。

## 工具参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `questions` | array | 问题列表 |

每个问题：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识 |
| `label` | string | ❌ | Tab 栏短标签（默认 Q1, Q2...） |
| `prompt` | string | ✅ | 完整问题文本 |
| `options` | array | ✅ | 选项 `{ value, label, description? }` |
| `allowOther` | boolean | ❌ | 是否允许自定义输入（默认 true） |

## 交互方式

**单问题模式：**
- ↑↓ 导航，Enter 选中，Esc 取消
- 选择 "Type something." 进入编辑器

**多问题模式：**
- **Tab / →** 下一题，**Shift+Tab / ←** 上一题
- 最后一个 Tab 是 "Submit" 汇总页
- 每个问题独立作答，互不干扰

## 示例

```json
{
  "questions": [
    {
      "id": "lang",
      "label": "语言",
      "prompt": "用哪种编程语言？",
      "options": [
        { "value": "ts", "label": "TypeScript" },
        { "value": "py", "label": "Python" }
      ]
    },
    {
      "id": "db",
      "label": "数据库",
      "prompt": "用哪个数据库？",
      "options": [
        { "value": "pg", "label": "PostgreSQL" },
        { "value": "sqlite", "label": "SQLite" }
      ]
    }
  ]
}
```

每个问题始终有一个 "Type something." 选项用于自定义回答。
