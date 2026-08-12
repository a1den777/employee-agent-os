# 真实 AI 接入

本项目默认通过 **CC-Connect 启动 Claude Code**，而不是在 TypeScript 中重新调用模型 API。

```text
飞书 / Telegram
      ↓
  CC-Connect
      ↓ 启动
  Claude Code
      ↓ 读取
员工工作区 + Vault + Skills
```

这是当前项目最省代码、最接近真实部署的方式。

## 一、安装 Claude Code

Windows PowerShell 可以使用：

```powershell
winget install Anthropic.ClaudeCode
```

安装后确认：

```powershell
claude --version
claude doctor
```

如果没有使用 API Key，直接运行：

```powershell
claude
```

然后按照浏览器提示登录 Claude 账号。

如果使用 Anthropic Console 计费，可以运行：

```powershell
claude auth login --console
```

也可以使用 `ANTHROPIC_API_KEY`，但不要把 Key 写入 Git 仓库、`CLAUDE.md`、Vault 或 `cc-connect.toml`。

检查登录状态：

```powershell
claude auth status
```

Claude Code 的账号认证和 API 认证由 Claude Code 自己管理，本项目不保存凭证。

## 二、先单独测试一个员工 Agent

先复制模板，生成一个员工工作区：

```powershell
Copy-Item -Recurse agents/member-template agents/member-001
Copy-Item -Recurse vault/members/member-template vault/members/member-001
```

编辑：

```text
agents/member-001/CLAUDE.md
vault/members/member-001/member.md
```

进入员工工作区：

```powershell
Set-Location agents/member-001
claude
```

发送一个只读测试请求：

```text
请先读取当前工作区的 CLAUDE.md、公司政策和员工画像。
只总结当前 Agent 的身份、可读取的资料和外部动作确认规则，不要修改文件。
```

如果 Claude 能读取这些文件并遵守规则，说明真实 AI 已经接入成功。

## 三、通过 CC-Connect 接入飞书

### 安装 CC-Connect

```powershell
npm install -g cc-connect
```

### 创建配置文件

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cc-connect"
Copy-Item .\cc-connect.example.toml "$env:USERPROFILE\.cc-connect\config.toml"
```

编辑配置文件，将 `work_dir` 改成员工工作区的绝对路径：

```toml
[[projects]]
name = "member-001"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = 'C:/path/to/employee-agent-os/agents/member-001'
mode = "default"

[[projects.platforms]]
type = "feishu"

[projects.platforms.options]
app_id = "${FEISHU_APP_ID}"
app_secret = "${FEISHU_APP_SECRET}"
```

### 配置飞书应用

在飞书开放平台创建企业自建应用，然后：

1. 开启机器人能力。
2. 配置接收和发送消息所需权限。
3. 开启事件订阅。
4. 选择 WebSocket 长连接模式。
5. 订阅 `im.message.receive_v1` 事件。
6. 发布应用版本。
7. 将 App ID 和 App Secret 放入环境变量或 CC-Connect 管理界面。

不要将真实 App Secret 提交到 GitHub。

### 启动 CC-Connect

建议在独立的 PowerShell 窗口运行：

```powershell
cc-connect -config "$env:USERPROFILE\.cc-connect\config.toml"
```

也可以先打开配置界面：

```powershell
cc-connect web
```

然后按照界面配置项目、Claude Code 和飞书平台，再在另一个窗口运行 `cc-connect`。

如果当前终端继承了 Claude Code 的 `CLAUDECODE` 环境变量，CC-Connect 可能拒绝再次启动 Claude Code。最简单的处理方式是使用独立终端；也可以运行：

```powershell
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
cc-connect -config "$env:USERPROFILE\.cc-connect\config.toml"
```

## 四、验证完整链路

在飞书中给机器人发送：

```text
请读取当前员工画像和公司政策，告诉我你是谁、可以使用哪些资料，以及哪些动作需要人工确认。
```

预期链路：

```text
飞书消息
  → CC-Connect 收到消息
  → 找到 member-001 项目
  → 启动或恢复 Claude Code 会话
  → Claude Code 读取 CLAUDE.md、Vault 和 Skills
  → 回复飞书
```

## 五、如何实现多个员工

每个员工复制一份工作区，并在 CC-Connect 中配置独立项目：

```toml
[[projects]]
name = "member-001"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = 'C:/path/to/employee-agent-os/agents/member-001'
mode = "default"

[[projects]]
name = "member-002"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = 'C:/path/to/employee-agent-os/agents/member-002'
mode = "default"
```

不同员工至少要有不同的：

- `work_dir`
- 员工画像
- Agent 会话
- 可访问的资料和权限配置

`mode = "default"` 会保留工具确认。不要一开始就使用 `bypassPermissions`。

## 六、TypeScript 接口什么时候使用

只有在你要绕过 Claude Code，自己做一个 Web 服务、桌面应用或新的 Agent Runtime 时，才实现 `src/contracts.ts` 中的 `AgentHarness`：

```ts
export interface AgentHarness {
  run(request: AgentRequest): Promise<AgentResult>;
}
```

这时才需要增加 Anthropic、OpenAI 或其他模型 SDK，并编写一个适配器。

当前项目的第一版不需要这部分代码，因为 CC-Connect 已经负责会话和 Claude Code 启动。

## 常见问题

### 机器人能回复，但没有读取员工资料

检查 `work_dir` 是否指向 `agents/member-001`，而不是仓库父目录或错误员工目录。

### Claude Code 能运行，但 CC-Connect 启动失败

确认 `claude` 在 PATH 中可用，并在独立终端启动 CC-Connect。

### Agent 自动执行了外部动作

检查项目配置是否误用了 `bypassPermissions`，恢复为 `default`，同时保留仓库中的人工确认规则。

### 多个员工看到同一份个人记忆

检查每个项目的 `work_dir`、员工画像和资料权限，不要让所有员工共用同一个员工工作区。
