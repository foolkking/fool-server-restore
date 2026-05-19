export interface TargetVirtualMachine {
  id: string;
  name: string;
  provider: string;
  address: string;
  status: "healthy" | "warning" | "failed" | "unsynced";
  os: string;
  region: string;
  lastSeen: string;
  software: TargetSoftware[];
  configChecklist: SystemConfigItem[];
}

export interface TargetSoftware {
  name: string;
  version: string;
  source: "npm" | "system" | "container" | "runtime";
  status: "synced" | "unsynced" | "warning";
}

export interface SystemConfigItem {
  id: string;
  label: string;
  category: "security" | "network" | "runtime" | "service";
  status: "healthy" | "warning" | "failed";
  lastChanged: string;
}

export function listTargetVirtualMachines(): TargetVirtualMachine[] {
  return [
    {
      id: "vm-prod-01",
      name: "prod-api-01",
      provider: "Local Hyper-V",
      address: "10.0.2.14",
      status: "healthy",
      os: "Ubuntu 24.04 LTS",
      region: "lab-east",
      lastSeen: "2 min ago",
      software: [
        { name: "node", version: "20.13.1", source: "runtime", status: "synced" },
        { name: "docker", version: "26.1.4", source: "system", status: "synced" },
        { name: "pm2", version: "5.3.1", source: "npm", status: "warning" }
      ],
      configChecklist: [
        { id: "ssh", label: "SSH hardening", category: "security", status: "healthy", lastChanged: "2026-05-17" },
        { id: "firewall", label: "Firewall profile", category: "network", status: "healthy", lastChanged: "2026-05-15" },
        { id: "services", label: "Systemd services", category: "service", status: "warning", lastChanged: "2026-05-19" }
      ]
    },
    {
      id: "vm-stage-02",
      name: "stage-worker-02",
      provider: "VMware",
      address: "10.0.3.22",
      status: "unsynced",
      os: "Windows Server 2022",
      region: "lab-west",
      lastSeen: "18 min ago",
      software: [
        { name: "node", version: "20.13.1", source: "runtime", status: "synced" },
        { name: "git", version: "2.45.1", source: "system", status: "synced" },
        { name: "iis", version: "10.0", source: "system", status: "unsynced" }
      ],
      configChecklist: [
        { id: "winrm", label: "WinRM access policy", category: "network", status: "warning", lastChanged: "2026-05-18" },
        { id: "env", label: "Environment variables", category: "runtime", status: "failed", lastChanged: "2026-05-19" },
        { id: "audit", label: "Audit policy", category: "security", status: "healthy", lastChanged: "2026-05-13" }
      ]
    }
  ];
}
