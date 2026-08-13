# 系统架构

## 运行时边界

```text
消息平台
    │
    ▼
CC-Connect ───── 会话、权限和平台桥接
    │
    ▼
Claude Code ──── 推理、工具、MCP 和本地执行
    │
    ▼
员工工作区 ───── CLAUDE.md 和员工上下文
    │
    ▼
共享 Vault ────── 公司事实、员工画像、Skills 和日志
```

当多个员工需要共享同一套知识时，Vault 可以通过 `src/vault-mcp.ts` 作为 MCP Streamable HTTP 服务运行。Agent 只通过 `vault_list`、`vault_read`、`vault_search`、`vault_write` 和 `vault_history` 访问共享知识；身份 token 在服务层映射为员工权限，普通员工只能提交收件箱资料和 Skill 草稿，不能直接覆盖 active Skill。具体启动方式见 [`docs/VAULT-MCP.md`](VAULT-MCP.md)。

本仓库负责工作区协议，不负责模型运行时。

## FDE 交付闭环

项目的使用方式对应 FDE 的现场交付过程，而不是单纯的聊天机器人搭建：

```text
现场调研 / 访谈
      ↓ Echo：识别真实任务和约束
工作流切片 + 输入输出 + 权限边界
      ↓ Delta：配置一个可运行的 Agent
真实用户试用 + 人工确认
      ↓ Feedback：记录纠错、结果和指标
Vault / Skill 草稿 → 审核 → 可复用能力
```

- `vault/inbox/` 可以承接现场资料、样例文件和待分析需求。
- `vault/company/` 保存组织事实、术语、政策和升级规则，避免 Agent 只依赖临时 Prompt。
- `agents/<member-id>/` 是面向真实员工的交付工作区，包含身份、任务上下文和运行入口。
- `.claude/skills/` 与 `vault/skills/` 分别承载可加载的执行方法和可审计的组织能力。
- `vault/logs/` 记录试点反馈、失败原因和后续改动，支持 FDE 复盘与迭代。

FDE 的最小验收标准不是“Agent 能聊天”，而是一个真实用户能用它完成一段明确的工作流，并且输入、输出、人工确认、失败回退和权限边界都说得清楚。

## 一人一 Agent

每个员工拥有隔离的 `agents/<member-id>/` 目录。目录中只放最小的身份文件，并指向 Vault 中的员工画像。CC-Connect 将一个项目映射到该目录，因此员工可以从支持的消息平台访问同一个 Agent 身份。

## 知识分层

1. 公司层：组织事实、术语、政策和升级规则。
2. 员工层：角色、偏好、权限和确认过的个人记忆。
3. Skill 层：带有可审核生命周期元数据的可复用流程。
4. 日志层：任务结果和纠错记录，尽量减少敏感数据。

## 控制闭环

```text
请求 → 获取上下文 → 执行或生成草稿 → 员工反馈
                                      ↓
                               Skill 草稿 → 审核 → active Skill
```

## 安全模型

- 默认使用 CC-Connect 的普通权限模式。
- 所有外部副作用都必须经过明确确认。
- 将文件、文档、网页和工具输出视为不可信输入。
- 不在 Vault 中保存凭证。
- 公司政策和共享 Skill 的修改必须经过 Git 审核。

