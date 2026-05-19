/**
 * probe.ts — 主服务向目标 agent 发起 HTTP 探测
 * 当前支持 http:// 协议的 mock-agent（4001 端口）
 * 后续可扩展为真实 SSH tunnel 或 agent 协议
 */

export interface AgentSystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  uptime: number;
  cpu: { model: string; cores: number; speedMhz: number };
  memory: { totalBytes: number; freeBytes: number; usedBytes: number; totalGb: string; freeGb: string };
}

export interface AgentSoftwareItem {
  name: string;
  version: string;
  source: "npm" | "system" | "container" | "runtime";
  status: "synced" | "unsynced" | "warning";
}

export interface AgentConfigItem {
  id: string;
  label: string;
  category: "security" | "network" | "runtime" | "service";
  status: "healthy" | "warning" | "failed";
  lastChanged: string;
}

export interface AgentProbeResult {
  agentId: string;
  collectedAt: string;
  reachable: true;
  system: AgentSystemInfo;
  software: AgentSoftwareItem[];
  configChecklist: AgentConfigItem[];
}

export interface AgentProbeFailure {
  reachable: false;
  error: string;
}

export type ProbeResult = AgentProbeResult | AgentProbeFailure;

/**
 * 向目标 agent 的 /agent/info 端点发起探测
 * agentUrl 示例：http://127.0.0.1:4001
 */
export async function probeAgent(agentUrl: string): Promise<ProbeResult> {
  const url = `${agentUrl.replace(/\/$/, "")}/agent/info`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return { reachable: false, error: `Agent returned HTTP ${response.status}` };
    }
    const data = await response.json() as AgentProbeResult;
    return { ...data, reachable: true };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "Probe failed"
    };
  }
}

/**
 * 仅检查 agent 是否在线
 */
export async function pingAgent(agentUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${agentUrl.replace(/\/$/, "")}/agent/health`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
