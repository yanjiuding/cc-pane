# 双写记忆

启用本 Skill 后：对值得长期记忆的内容（用户偏好/决策/教训/反馈纠正），调用 `cc-memory` MCP 的 `memory_add` 写入 {{app_name}} 共享池，让 Claude/Codex 跨实例共享。

## 触发时机

- 用户说"记住"、"以后都这样"、"别忘了"
- 用户纠正你（feedback 类）
- 稳定的用户偏好、角色、项目背景
- 值得未来会话参考的设计决定

## 上下文环境变量

`CC_PANES_PROJECT_PATH`、`CC_PANES_WORKSPACE_NAME`、`CC_PANES_CLI_TOOL`

## 写入

```
cc-memory.memory_add(
  title: "<一句话摘要 ≤200 字>",
  content: "<完整内容>",
  project_path: "<$CC_PANES_PROJECT_PATH>",
  scope: "project" | "workspace" | "global",
  category: "decision" | "lesson" | "preference" | "pattern" | "fact" | "plan",
  importance: 1-5,
  tags: ["..."]
)
```

- **importance ≥ 4 才会在下次会话自动召回**（写到值得跨会话用的内容请打 4-5）
- `scope=workspace` 时附 `workspace_name`
- 跨项目通用的偏好/角色信息用 `scope=global`（不传 path/name）

## 检索

`cc-memory.memory_search(query, scope, min_importance, limit)` 默认按当前 project 过滤。

## 失败兜底

写入失败不打断主任务，简短告知用户即可。CLI 内置记忆机制照常工作。
