# 员工 Agent OS

一个面向组织的、通用的员工 Agent 工作区模板。

<p align="center">
  <img src="assets/employee-agent-os-architecture.png" alt="Employee Agent OS 架构图" width="100%" />
</p>

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

## 面向 FDE 的定位

本项目将员工 Agent OS 作为一个 **Forward Deployed Engineer（前向部署工程师）** 的交付框架。FDE 不只是写代码或配置 Prompt，而是进入真实业务现场，把一个模糊的“想用 AI”变成可验证、可交付、可持续改进的工作流。

FDE 的核心闭环是 **Echo + Delta**：

- **Echo：摸清现场**：观察一线员工的真实工作，识别高频任务、输入资料、判断规则、失败条件、权限边界和验收标准；不把管理者的想象直接当成需求。
- **Delta：做出变化**：使用现有 Agent Runtime、消息平台和工具，完成一个足够小但能真实运行的端到端切片，让一线用户当天可以试用并反馈。
- **Feedback：沉淀组织能力**：将纠错、成功案例和边界条件记录到 Vault，经过审核后形成可复用 Skill，推动下一次部署更快、更稳定。

```text
真实业务现场
      ↓ Echo：观察 / 访谈 / 拆解任务
工作流、资料、权限、验收标准
      ↓ Delta：配置 Agent + 工作区 + 工具
可运行的业务切片 / 人工确认
      ↓ Feedback：记录结果 / 纠错 / 衡量指标
Vault + Skill 草稿 → 审核 → active Skill
```

因此，仓库中的 `agents/`、`vault/`、`CLAUDE.md`、Skills 和人工确认机制，不只是目录约定，也是 FDE 进行现场调研、快速交付、灰度试用和持续迭代的最小交付面。

FDE 交付时应至少留下这些可审计产物：

- 现场问题与当前工作流：谁在什么场景下，用什么资料完成什么任务。
- 端到端切片：输入、Agent 处理、输出、人工确认和失败回退路径。
- 员工 Agent 工作区：身份、上下文、权限和可访问资料。
- Skill 草稿与验收标准：适用范围、禁止使用的场景、失败条件和示例。
- 试点反馈与结果：真实用户反馈、节省的步骤或时间、错误类型和下一轮改动。

详细的 FDE 现场工作流见 [`docs/FDE-PLAYBOOK.md`](docs/FDE-PLAYBOOK.md)。

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

> 设计并开源面向 FDE 交付的员工 Agent OS：基于 Claude Code + CC-Connect 构建“一人一 Agent”的组织工作区框架，将现场需求拆解（Echo）、端到端业务切片交付（Delta）与反馈沉淀 Skill 串成闭环；以 Git 管理员工上下文、共享 Vault 与 Skill 生命周期，通过 CLAUDE.md、权限边界和人工确认机制实现可审计的 Agent 部署；使用 TypeScript 定义与模型供应商无关的 Agent 接口。

## 参考

- [真实 AI 接入](docs/REAL-AI.md)：安装 Claude Code、配置 CC-Connect 和接入飞书。
- [CC-Connect](https://github.com/chenhg5/cc-connect)：连接 Claude Code 与飞书、Telegram、Slack 等消息平台。
- [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)：为 Claude Code 接入外部工具和数据源。
