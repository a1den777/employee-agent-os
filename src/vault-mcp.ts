import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createMcpHandler, McpServer, type AuthInfo } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { parseTokenConfigs, principalForToken, VaultStore, type VaultPrincipal } from "./vault-store.js";

const PORT = Number(process.env.VAULT_PORT ?? 8787);
const HOST = process.env.VAULT_HOST ?? "127.0.0.1";
const MCP_PATH = process.env.VAULT_MCP_PATH ?? "/mcp";
const ROOT = resolve(process.env.VAULT_ROOT ?? "./vault");

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function registerVaultTools(server: McpServer, store: VaultStore, principal: VaultPrincipal): void {
  server.registerTool("vault_list", {
    title: "列出 Vault 文件",
    description: "列出当前员工有权限看到的 Vault 文件和目录。",
    inputSchema: z.object({ path: z.string().max(240).optional().describe("相对 Vault 根目录的路径") }),
  }, async ({ path }) => {
    try { return textResult(await store.list(path ?? "", principal)); } catch (error) { return errorResult(error); }
  });

  server.registerTool("vault_read", {
    title: "读取 Vault 文件",
    description: "读取一个有权限访问的文本文件，并返回内容和 sha256。",
    inputSchema: z.object({ path: z.string().min(1).max(240).describe("相对 Vault 根目录的文件路径") }),
  }, async ({ path }) => {
    try { return textResult(await store.read(path, principal)); } catch (error) { return errorResult(error); }
  });

  server.registerTool("vault_search", {
    title: "搜索共享知识",
    description: "在员工有权限访问的 Vault 文本文件中搜索关键词。",
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe("要搜索的关键词"),
      path: z.string().max(240).optional().describe("限定搜索目录"),
      maxResults: z.number().int().min(1).max(100).default(20).describe("最多返回多少条匹配"),
    }),
  }, async ({ query, path, maxResults }) => {
    try { return textResult(await store.search(query, path, maxResults, principal)); } catch (error) { return errorResult(error); }
  });

  server.registerTool("vault_write", {
    title: "写入 Vault",
    description: "写入一个文本文件。普通员工只能写入 inbox/ 或 skills/drafts/，共享 active Skill 需要管理员审核。",
    inputSchema: z.object({
      path: z.string().min(1).max(240).describe("目标文件路径"),
      content: z.string().max(1024 * 1024).describe("要保存的文本内容"),
      reason: z.string().min(3).max(500).describe("写入原因，便于审计和复盘"),
      expectedSha256: z.string().regex(/^[0-9a-f]{64}$/).optional().describe("乐观锁：文件当前版本的 sha256"),
    }),
  }, async ({ path, content, reason, expectedSha256 }) => {
    try { return textResult(await store.write(path, content, reason, expectedSha256, principal)); } catch (error) { return errorResult(error); }
  });

  server.registerTool("vault_history", {
    title: "查看 Vault 历史",
    description: "查看文件变更和访问审计记录。普通员工只能看到自己的记录。",
    inputSchema: z.object({
      path: z.string().max(240).optional().describe("限定某个文件"),
      limit: z.number().int().min(1).max(100).default(50).describe("最多返回多少条记录"),
    }),
  }, async ({ path, limit }) => {
    try { return textResult(await store.history(path, limit, principal)); } catch (error) { return errorResult(error); }
  });
}

export function createVaultServer(store: VaultStore, principal: VaultPrincipal): McpServer {
  const server = new McpServer({ name: "employee-agent-os-vault", version: "0.2.0" });
  registerVaultTools(server, store, principal);
  return server;
}

function principalFromAuth(authInfo: AuthInfo | undefined): VaultPrincipal {
  const principal = authInfo?.extra?.principal;
  if (!principal || typeof principal !== "object") throw new Error("Missing Vault principal.");
  return principal as VaultPrincipal;
}

function bearerToken(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization;
  if (Array.isArray(value)) return undefined;
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

function unauthorized(res: ServerResponse, message = "Unauthorized") {
  res.writeHead(401, { "content-type": "application/json; charset=utf-8", "www-authenticate": "Bearer" });
  res.end(JSON.stringify({ error: message }));
}

export async function startVaultService(): Promise<void> {
  const store = new VaultStore(ROOT);
  await store.ensureReady();
  const registry = parseTokenConfigs(process.env.VAULT_TOKENS, process.env.VAULT_TOKEN);
  const handler = createMcpHandler((context) => createVaultServer(store, principalFromAuth(context.authInfo)));
  const nodeHandler = toNodeHandler(handler, { onerror: (error) => console.error("MCP request failed:", error) });

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "employee-agent-os-vault" }));
      return;
    }
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const token = bearerToken(req);
    const principal = principalForToken(registry, token);
    if (!principal || !token) { unauthorized(res); return; }

    const authenticatedRequest = req as IncomingMessage & { auth?: AuthInfo };
    authenticatedRequest.auth = {
      token,
      clientId: principal.id,
      scopes: principal.role === "admin" ? ["vault:read", "vault:write", "vault:admin"] : ["vault:read", "vault:write"],
      extra: { principal },
    };
    res.setHeader("cache-control", "no-store");
    await nodeHandler(authenticatedRequest, res);
  });

  server.listen(PORT, HOST, () => {
    console.error(`Vault MCP service listening at http://${HOST}:${PORT}${MCP_PATH}`);
    console.error(`Vault root: ${ROOT}`);
  });
}

if (process.argv[1]?.endsWith("vault-mcp.ts") || process.argv[1]?.endsWith("vault-mcp.js")) {
  startVaultService().catch((error) => { console.error(error); process.exitCode = 1; });
}
