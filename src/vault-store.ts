import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";

export type VaultRole = "admin" | "member";

export interface VaultPrincipal {
  id: string;
  role: VaultRole;
  readPrefixes: string[];
  writePrefixes: string[];
}

export interface VaultTokenConfig {
  token: string;
  role?: VaultRole;
  readPrefixes?: string[];
  writePrefixes?: string[];
}

export interface VaultListEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
  updatedAt?: string;
}

export interface VaultSearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface VaultAuditRecord {
  id: string;
  at: string;
  actor: string;
  action: "read" | "search" | "write" | "list" | "history";
  path?: string;
  reason?: string;
  sha256?: string;
  bytes?: number;
}

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"]);

function normalizeVaultPath(input: string): string {
  const value = input.trim();
  if (!value || value === ".") return "";
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error("Vault path must be a relative POSIX path.");
  }

  const normalized = value.replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "..")) {
    throw new Error("Vault path contains an invalid segment.");
  }
  return segments.join("/");
}

function prefixMatches(path: string, prefix: string): boolean {
  const normalizedPrefix = prefix.replace(/^\.?\//, "").replace(/\/+$/, "");
  return normalizedPrefix === "" || path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}

function isSensitivePath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";
  return /^\.env(?:\.|$)/i.test(fileName) || /(secret|credential|password|private-key|id_rsa)/i.test(fileName);
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export class VaultStore {
  private readonly root: string;
  private readonly auditPath: string;
  private auditQueue: Promise<void> = Promise.resolve();

  constructor(root: string) {
    this.root = resolve(root);
    this.auditPath = resolve(this.root, "logs", "vault-audit.jsonl");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(dirname(this.auditPath), { recursive: true });
  }

  async list(path: string, principal: VaultPrincipal): Promise<VaultListEntry[]> {
    const normalized = normalizeVaultPath(path);
    this.assertReadable(normalized, principal);
    const target = this.resolveSafe(normalized);
    const entries = await readdir(target, { withFileTypes: true });
    const result: VaultListEntry[] = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = normalized ? `${normalized}/${entry.name}` : entry.name;
      if (!this.isVisible(entryPath, principal)) continue;
      if (entry.isDirectory()) {
        result.push({ path: entryPath, type: "directory" });
        continue;
      }
      if (!entry.isFile() || entryPath === "logs/vault-audit.jsonl") continue;

      const info = await stat(resolve(target, entry.name));
      result.push({ path: entryPath, type: "file", size: info.size, updatedAt: info.mtime.toISOString() });
    }

    await this.audit({ actor: principal.id, action: "list", path: normalized });
    return result;
  }

  async read(path: string, principal: VaultPrincipal): Promise<{ path: string; content: string; sha256: string }> {
    const normalized = normalizeVaultPath(path);
    this.assertReadable(normalized, principal);
    const content = await readFile(this.resolveSafe(normalized), "utf8");
    const digest = sha256(content);
    await this.audit({ actor: principal.id, action: "read", path: normalized, sha256: digest, bytes: Buffer.byteLength(content) });
    return { path: normalized, content, sha256: digest };
  }

  async search(query: string, path: string | undefined, maxResults: number, principal: VaultPrincipal): Promise<VaultSearchMatch[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) throw new Error("Search query cannot be empty.");

    const startPath = normalizeVaultPath(path ?? "");
    this.assertReadable(startPath, principal);
    const files = await this.collectFiles(startPath, principal);
    const matches: VaultSearchMatch[] = [];

    for (const filePath of files) {
      if (matches.length >= maxResults) break;
      const file = this.resolveSafe(filePath);
      const info = await stat(file);
      if (info.size > MAX_SEARCH_FILE_BYTES) continue;

      const content = await readFile(file, "utf8");
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (!line.toLocaleLowerCase().includes(normalizedQuery)) continue;
        matches.push({ path: filePath, line: index + 1, text: line.trim().slice(0, 500) });
        if (matches.length >= maxResults) break;
      }
    }

    await this.audit({ actor: principal.id, action: "search", path: startPath, reason: query });
    return matches;
  }

  async write(
    path: string,
    content: string,
    reason: string,
    expectedSha256: string | undefined,
    principal: VaultPrincipal,
  ): Promise<{ path: string; sha256: string; bytes: number; updatedAt: string }> {
    const normalized = normalizeVaultPath(path);
    this.assertWritable(normalized, principal);
    this.assertWritableFile(normalized, content);

    const target = this.resolveSafe(normalized);
    let current: string | undefined;
    try {
      current = await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (expectedSha256 && sha256(current ?? "") !== expectedSha256) {
      throw new Error("The file changed since it was read; provide the latest expectedSha256 before writing.");
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    const digest = sha256(content);
    const bytes = Buffer.byteLength(content);
    const updatedAt = new Date().toISOString();
    await this.audit({ actor: principal.id, action: "write", path: normalized, reason, sha256: digest, bytes });
    return { path: normalized, sha256: digest, bytes, updatedAt };
  }

  async history(path: string | undefined, limit: number, principal: VaultPrincipal): Promise<VaultAuditRecord[]> {
    const normalized = path ? normalizeVaultPath(path) : undefined;
    if (normalized) this.assertReadable(normalized, principal);

    let content = "";
    try {
      content = await readFile(this.auditPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const records = content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as VaultAuditRecord)
      .filter((record) => principal.role === "admin" || record.actor === principal.id)
      .filter((record) => !normalized || record.path === normalized)
      .slice(-limit)
      .reverse();

    await this.audit({ actor: principal.id, action: "history", path: normalized });
    return records;
  }

  private resolveSafe(path: string): string {
    const target = resolve(this.root, path);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error("Vault path escapes the configured root.");
    }
    return target;
  }

  private assertReadable(path: string, principal: VaultPrincipal): void {
    if (!path || principal.readPrefixes.some((prefix) => prefixMatches(path, prefix))) return;
    throw new Error(`Principal ${principal.id} cannot read ${path}.`);
  }

  private assertWritable(path: string, principal: VaultPrincipal): void {
    if (!path || isSensitivePath(path) || !principal.writePrefixes.some((prefix) => prefixMatches(path, prefix))) {
      throw new Error(`Principal ${principal.id} cannot write ${path}.`);
    }
  }

  private assertWritableFile(path: string, content: string): void {
    const extension = extname(path).toLocaleLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Unsupported Vault file type: ${extension || "none"}.`);
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("Vault files are limited to 1 MiB.");
  }

  private isVisible(path: string, principal: VaultPrincipal): boolean {
    if (path === "logs" || path.startsWith("logs/")) return principal.role === "admin";
    return principal.readPrefixes.some((prefix) => prefixMatches(path, prefix) || prefixMatches(`${path}/placeholder`, prefix));
  }

  private async collectFiles(startPath: string, principal: VaultPrincipal): Promise<string[]> {
    const target = this.resolveSafe(startPath);
    const entries = await readdir(target, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = startPath ? `${startPath}/${entry.name}` : entry.name;
      if (!this.isVisible(entryPath, principal)) continue;
      if (entry.isDirectory()) files.push(...(await this.collectFiles(entryPath, principal)));
      else if (entry.isFile() && entryPath !== "logs/vault-audit.jsonl") files.push(entryPath);
    }
    return files;
  }

  private async audit(record: Omit<VaultAuditRecord, "id" | "at">): Promise<void> {
    const auditRecord: VaultAuditRecord = { id: randomUUID(), at: new Date().toISOString(), ...record };
    this.auditQueue = this.auditQueue.then(async () => {
      await this.ensureReady();
      await appendFile(this.auditPath, `${JSON.stringify(auditRecord)}\n`, "utf8");
    });
    await this.auditQueue;
  }
}

export function defaultPrincipal(id: string, role: VaultRole = "member"): VaultPrincipal {
  if (role === "admin") return { id, role, readPrefixes: [""], writePrefixes: [""] };
  return { id, role, readPrefixes: ["company/", "skills/", "inbox/"], writePrefixes: ["inbox/", "skills/drafts/"] };
}

export function parseTokenConfigs(raw: string | undefined, fallbackToken: string | undefined): Map<string, VaultPrincipal> {
  const registry = new Map<string, VaultPrincipal>();
  if (fallbackToken?.trim()) registry.set(fallbackToken.trim(), defaultPrincipal("admin", "admin"));
  if (!raw?.trim()) {
    if (registry.size === 0) throw new Error("Set VAULT_TOKEN or VAULT_TOKENS before starting the Vault service.");
    return registry;
  }

  const parsed = JSON.parse(raw) as Record<string, string | VaultTokenConfig>;
  for (const [id, value] of Object.entries(parsed)) {
    const config = typeof value === "string" ? { token: value } : value;
    if (!config.token?.trim()) throw new Error(`Token config for ${id} is missing token.`);
    const role = config.role ?? (id === "admin" ? "admin" : "member");
    const principal = role === "admin" ? defaultPrincipal(id, "admin") : {
      id,
      role,
      readPrefixes: config.readPrefixes ?? ["company/", "skills/", "inbox/"],
      writePrefixes: config.writePrefixes ?? ["inbox/", "skills/drafts/"],
    };
    registry.set(config.token.trim(), principal);
  }
  return registry;
}

export function principalForToken(registry: Map<string, VaultPrincipal>, token: string | undefined): VaultPrincipal | undefined {
  return token ? registry.get(token) : undefined;
}
