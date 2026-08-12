# Agent Harness 接口

本框架不要求使用某个模型 SDK。如果未来的运行时需要直接调用框架，可以实现 `src/contracts.ts` 中的接口：

```ts
import type { AgentHarness, AgentRequest, AgentResult } from "./contracts.js";

export class MyHarness implements AgentHarness {
  async run(request: AgentRequest): Promise<AgentResult> {
    // 将请求转换成你的 Agent Runtime 可以理解的格式。
    // 涉及外部副作用时返回 approvalRequired。
    return { text: "...", approvalRequired: true };
  }
}
```

默认部署路径是 Claude Code + CC-Connect，因此大多数用户不需要实现此接口。
