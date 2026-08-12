/**
 * Stable TypeScript contracts for an Employee Agent OS.
 *
 * The runtime is intentionally external: Claude Code is started by
 * CC-Connect. This file lets future adapters implement one small interface
 * without coupling the framework to a model vendor.
 */

export type SkillStatus = "draft" | "trial" | "active" | "deprecated";

export interface EmployeeProfile {
  id: string;
  name: string;
  role: string;
  permissions?: string[];
}

export interface VaultMatch {
  file: string;
  line: number;
  text: string;
}

export interface AgentContext {
  vaultRoot: string;
  files: string[];
  matches: VaultMatch[];
}

export interface AgentPolicy {
  allowedWrites: string[];
  externalActionsRequireApproval: boolean;
}

export interface AgentSkill {
  name: string;
  status: SkillStatus;
  owner: string;
}

export interface AgentRequest {
  member: EmployeeProfile;
  prompt: string;
  context: AgentContext;
  skills: AgentSkill[];
  policy: AgentPolicy;
}

export interface AgentResult {
  text: string;
  proposedActions?: string[];
  approvalRequired?: boolean;
  citations?: VaultMatch[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
}

/** Implement this interface when adding a non-Claude-Code runtime. */
export interface AgentHarness {
  run(request: AgentRequest): Promise<AgentResult>;
}
