import os from "node:os";
import type { CollectorOutput, MachineIdentity, OperatingSystem } from "@fool/core";
import { sanitizePathSegment } from "@fool/core";

export interface SystemInfoData {
  hostname: string;
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  cpus: Array<{ model: string; speed: number }>;
  totalMemory: number;
  freeMemory: number;
  uptimeSeconds: number;
}

export function detectOperatingSystem(platform = os.platform()): OperatingSystem {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "unknown";
}

export function getMachineIdentity(): MachineIdentity {
  const hostname = os.hostname() || "unknown";

  return {
    id: sanitizePathSegment(`${hostname}-${os.platform()}-${os.arch()}`),
    hostname,
    os: detectOperatingSystem(),
    platform: os.platform(),
    arch: os.arch()
  };
}

export function collectSystemInfo(): CollectorOutput<SystemInfoData> {
  return {
    id: "system-info",
    label: "System info",
    status: "available",
    data: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().map((cpu) => ({ model: cpu.model, speed: cpu.speed })),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptimeSeconds: os.uptime()
    },
    issues: []
  };
}
