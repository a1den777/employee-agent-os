# Vault 服务 + MCP

这个项目的 Vault 现在可以作为一个共享服务运行。员工的 Agent 不直接读写其他人的工作目录，而是通过 MCP 调用统一的 Vault 工具。

## 架构

```text
员工 Agent / Claude Code / CC-Connect
                │ MCP Streamable HTTP
                ▼
        src/vault-mcp.ts
        身份认证 + 权限边界
                │
                ▼
          VaultStore
      共享 Markdown 文件目录
                │
                ├── company/       公司事实和政策
                ├── skills/        已审核的共享 Skill
                ├── skills/drafts/ 员工提交的 Skill 草稿
                ├── inbox/         新资料和待处理输入
                └── logs/          访问与写入审计
```

MCP 服务暴露五个工具：

- `vault_list`：列出当前身份可见的文件和目录。
- `vault_read`：读取共享知识，并返回文件的 `sha256`。
- `vault_search`：按关键词搜索共享知识。
- `vault_write`：写入文本文件，要求填写 `reason`，并支持 `expectedSha256` 乐观锁。
- `vault_history`：查看审计记录；普通成员只能查看自己的记录。

## 本地启动

要求 Node.js 20 或更高版本：

```bash
npm install
$env:VAULT_TOKEN="local-admin-token"
npm run vault:start
```

服务默认地址是 `http://127.0.0.1:8787/mcp`，健康检查地址是 `http://127.0.0.1:8787/healthz`。

## 配置多个员工

不要把真实 token 提交到 Git。可以通过环境变量传入 JSON：

```powershell
$env:VAULT_TOKENS='{"admin":"admin-token","member-001":{"token":"member-001-token","role":"member"},"member-002":{"token":"member-002-token","role":"member"}}'
npm run vault:start
```

成员默认拥有以下权限：

- 可读：`company/`、`skills/`、`inbox/`。
- 可写：`inbox/`、`skills/drafts/`。
- 不可直接修改 `skills/` 下已生效的 Skill。
- 不可读取或写入 `logs/`，只能通过 `vault_history` 看到自己的审计记录。

管理员可以读写整个 Vault。生产环境应该把 token 换成正式的身份系统或反向代理认证，不要把这个 JSON token 配置当成完整的企业 SSO。

## Agent 如何接入

把以下信息提供给支持远程 MCP 的 Agent 客户端：

```text
MCP URL: http://<vault-host>:8787/mcp
Authorization: Bearer <员工自己的 token>
```

如果客户端使用配置文件，核心配置等价于：

```json
{
  "mcpServers": {
    "employee-agent-os-vault": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": {
        "Authorization": "Bearer ${VAULT_TOKEN}"
      }
    }
  }
}
```

## Skill 自进化闭环

员工 Agent 发现一个可复用方法时，不直接覆盖共享 Skill，而是：

1. 把经验写入 `inbox/` 或 `skills/drafts/`。
2. 通过 `vault_history` 留下来源和原因。
3. 负责人审阅适用范围、失败条件和验收标准。
4. 负责人将草稿合并为 `vault/skills/<skill-name>/SKILL.md`。
5. 其他员工通过 MCP 的 `vault_search` 和 `vault_read` 立即使用新 Skill。

这就是“每个员工可以沉淀能力，但共享能力必须经过审核”的控制面。

## 安全边界

- 路径只能是 Vault 根目录下的相对 POSIX 路径，阻止路径穿越。
- 只允许写入 Markdown、纯文本、JSON、YAML 和 TOML。
- 单文件最大 1 MiB；搜索会跳过超过 2 MiB 的文件。
- 默认阻止 `.env`、私钥、密码、credential、secret 等敏感文件名。
- 每次读、搜、写、查历史都会记录到 `vault/logs/vault-audit.jsonl`。
- `vault/logs/` 在 Git 中默认忽略，便于保留运行时审计而不把成员行为日志提交到公开仓库。
