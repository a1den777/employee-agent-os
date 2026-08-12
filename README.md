# 员工 Agent OS

一个面向组织的、通用的员工 Agent 工作区模板。

<img width="1672" height="941" alt="image" src="https://github.com/user-attachments/assets/3f0520ee-e367-4e36-aa50-eeb1bdeede4a" />


本项目不实现自己的大模型调用层，也不重复实现消息平台接入。项目将 Claude Code 作为 Agent Runtime，将 CC-Connect 作为“聊天平台 ↔ Agent 会话”的桥接层，将每个员工的工作区、Vault、CLAUDE.md 和 Skills 作为可版本控制的组织操作系统。

## 核心思想

```text
员工
  ↓
CC-Connect 会话
  ↓
Claude Code Agent
  ↓
员工工作区 CLAUDE.md
  ↓
共享 Vault + 员工记忆 + Skills
  ↓
任务执行 / 反馈 / Skill 草稿 / 人工审核
```

- 一人一 Agent：每个员工对应一个 `agents/<member-id>/` 工作区。
- Vault 是共享事实层：公司规则、员工画像、Skills、收件箱和审计记录均可审阅、版本控制。
- Skill 是组织能力：员工纠正一个可复用的方法后，先沉淀为 `draft`，经人工审核后再变成 `active`。
- 人在回路：发送消息、删除数据、修改权限、付款或修改外部系统前，Agent 只生成方案并等待确认。
- 与模型供应商无关：TypeScript 只保留稳定的 `AgentHarness` 接口，未来可以接入 Claude Code、Codex、WorkBuddy、桌面 Agent 或自定义运行时。

## 为什么代码很少

本项目刻意不做以下事情：

- 不在仓库内封装 Anthropic 或 OpenAI API。
- 不自行维护聊天机器人 WebSocket、会话池和消息路由。
- 不把员工知识塞进不可审计的向量数据库作为唯一事实源。
- 不用一个巨型 prompt 代替员工身份、权限、Skills 和审核流程。

这些能力由 Claude Code、CC-Connect 和 Git/文件系统提供；仓库只定义组织 Agent 的工作区协议。

## 快速开始

### 1. 准备员工工作区

复制模板并替换员工 ID：

```text
agents/member-template/ → agents/member-001/
vault/members/member-template/ → vault/members/member-001/
```

然后编辑：

- `agents/member-001/CLAUDE.md`：该员工 Agent 的上下文入口。
- `vault/members/member-001/member.md`：员工角色、权限和偏好。
- `vault/company/`：公司事实、术语和政策。
- `vault/skills/`：组织共享 Skills。

### 2. 使用 CC-Connect 启动

复制 `cc-connect.example.toml`，将 `work_dir` 指向对应员工工作区，并填入飞书或其他平台配置。CC-Connect 的项目配置使用 Claude Code 作为 Agent 类型；每个员工可以配置一个独立的项目和工作目录。

```toml
[[projects]]
name = "member-001"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/absolute/path/to/employee-agent-os/agents/member-001"
mode = "default"
```

建议从 `mode = "default"` 开始，让外部动作保留确认环节。员工需要更多自动化时，再按照组织策略调整权限。

### 3. 验证 TypeScript 接口

```bash
npm install
npm run typecheck
npm run build
```

代码只位于 `src/contracts.ts`，用于约束未来的 Agent 适配器，不是启动 Agent 的必需依赖。

## 目录

```text
.
├── .claude/skills/       Claude Code 可加载的通用 Skills
├── agents/               每个员工一个 Agent 工作区模板
├── vault/
│   ├── company/          公司事实和政策
│   ├── members/          员工画像和记忆
│   ├── skills/           共享 Skill 事实源
│   ├── inbox/            待处理资料
│   └── logs/             可选的任务/纠错记录
├── src/contracts.ts      最小 TypeScript Agent 接口
├── cc-connect.example.toml
├── CLAUDE.md             仓库级 Agent 规则
└── docs/
```

## Skill 生命周期

```text
draft → trial → active → deprecated
```

任何员工纠错都不能直接修改共享能力。先由 `skill-capture` 生成草稿，再由负责人检查来源、适用范围、失败条件和验收标准。

## 适合作品集或简历的表述

> 设计并开源员工 Agent OS：基于 Claude Code + CC-Connect 构建“一人一 Agent”的组织工作区框架，以 Git 管理员工上下文、共享 Vault 与 Skill 生命周期，通过 CLAUDE.md、权限边界和人工确认机制实现可审计的 Agent 部署；使用 TypeScript 定义与模型供应商无关的 Agent 接口，避免与单一模型厂商耦合。

## 参考

- [真实 AI 接入](docs/REAL-AI.md)：安装 Claude Code、配置 CC-Connect 和接入飞书。
- [CC-Connect](https://github.com/chenhg5/cc-connect)：连接 Claude Code 与飞书、Telegram、Slack 等消息平台。
- [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)：为 Claude Code 接入外部工具和数据源。
