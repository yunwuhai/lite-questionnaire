# questionnaire

通用问卷工具。支持单问题或多问题（Tab 切换），支持单选和多选，让 AI 可以结构化地向用户收集决策信息。

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
| `multiSelect` | boolean | ❌ | 多选模式（默认 false） |

## 交互方式

**单选模式（默认）：**
- ↑↓ 导航，Enter 选中，Esc 取消
- 选择 "Type something." 进入编辑器

**多选模式（`multiSelect: true`）：**
```
 > [x] 1. TypeScript
   [ ] 2. Python
 > [x] 3. Rust
   [ ] 4. Type something...

 Space toggle · ↑↓ move · Enter confirm · Esc cancel
```
- **Space** 勾选/取消选项
- **↑↓** 移动光标
- **Enter** 确认所有勾选项
- "Type something." 只能独占（勾选任何项后选它会清空复选框进入编辑模式）

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
      "id": "features",
      "label": "功能",
      "prompt": "需要哪些功能？（多选）",
      "multiSelect": true,
      "options": [
        { "value": "auth", "label": "用户认证" },
        { "value": "api", "label": "REST API" },
        { "value": "ws", "label": "WebSocket" },
        { "value": "cache", "label": "缓存层" }
      ]
    }
  ]
}
```

每个问题始终有一个 "Type something." 选项用于自定义回答。
