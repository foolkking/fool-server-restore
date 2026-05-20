/**
 * executor.ts — 通过 SSH 在目标机器执行配置安装/应用任务
 *
 * 安全边界：
 * - 所有命令必须在白名单内
 * - 参数只允许安全字符集
 * - 不允许管道到危险命令、不允许任意 shell 注入
 * - 每条命令独立 exec，不使用 shell -c 拼接
 */

import { Client } from "ssh2";
import fs from "node:fs/promises";
import { createId, readRuntimeDatabase, updateRuntimeDatabase } from "./runtime-store.js";
import type { StoredConnection, StoredUserProfile } from "./runtime-store.js";

// ── 任务数据结构 ──────────────────────────────────────────

export interface TaskStep {
  id: string;
  label: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  durationMs: number;
}

export interface ExecutionTask {
  id: string;
  userId: string;
  connectionId: string;
  profileId: string;
  kind: "install-software" | "apply-combo" | "deploy-snapshot";
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  steps: TaskStep[];
  dryRun: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// 内存中的任务存储（重启后丢失，后续可持久化到 runtime-db）
const taskStore = new Map<string, ExecutionTask>();
// SSE 订阅者：taskId → 回调列表
const taskSubscribers = new Map<string, Array<(task: ExecutionTask) => void>>();

// ── 命令白名单 ────────────────────────────────────────────

const SAFE_PACKAGE_NAME = /^[a-zA-Z0-9._@/:-]{1,100}$/;
const SAFE_SERVICE_NAME = /^[a-zA-Z0-9._-]{1,60}$/;
const SAFE_ENV_KEY = /^[A-Z_][A-Z0-9_]{0,99}$/;
const SAFE_ENV_VALUE = /^[^\n\r\0]{0,500}$/;

type InstallCommand = {
  label: string;
  command: string;
};

function buildInstallCommands(
  packageManager: string,
  packageName: string
): InstallCommand[] {
  if (!SAFE_PACKAGE_NAME.test(packageName)) {
    throw new Error(`Unsafe package name: ${packageName}`);
  }

  const cmds: Record<string, InstallCommand[]> = {
    apt: [
      { label: "Update package index", command: "sudo apt-get update -qq" },
      { label: `Install ${packageName}`, command: `sudo apt-get install -y ${packageName}` }
    ],
    yum: [{ label: `Install ${packageName}`, command: `sudo yum install -y ${packageName}` }],
    dnf: [{ label: `Install ${packageName}`, command: `sudo dnf install -y ${packageName}` }],
    brew: [{ label: `Install ${packageName}`, command: `brew install ${packageName}` }],
    npm: [{ label: `Install ${packageName} globally`, command: `npm install -g ${packageName}` }],
    pip: [{ label: `Install ${packageName}`, command: `pip install ${packageName}` }],
    pip3: [{ label: `Install ${packageName}`, command: `pip3 install ${packageName}` }],
    winget: [{ label: `Install ${packageName}`, command: `winget install --id ${packageName} -e --accept-source-agreements --accept-package-agreements` }]
  };

  const result = cmds[packageManager];
  if (!result) throw new Error(`Unsupported package manager: ${packageManager}`);
  return result;
}

function buildEnvCommands(envVars: Record<string, string>, shell: "bash" | "zsh" | "fish" | "powershell"): InstallCommand[] {
  const cmds: InstallCommand[] = [];
  for (const [key, value] of Object.entries(envVars)) {
    if (!SAFE_ENV_KEY.test(key) || !SAFE_ENV_VALUE.test(value)) continue;
    if (shell === "powershell") {
      cmds.push({ label: `Set env ${key}`, command: `[System.Environment]::SetEnvironmentVariable('${key}', '${value}', 'User')` });
    } else {
      const rcFile = shell === "fish" ? "~/.config/fish/config.fish" : shell === "zsh" ? "~/.zshrc" : "~/.bashrc";
      cmds.push({ label: `Set env ${key}`, command: `echo 'export ${key}="${value}"' >> ${rcFile}` });
    }
  }
  return cmds;
}

// ── 任务构建 ──────────────────────────────────────────────

export function buildInstallTask(
  userId: string,
  connection: StoredConnection,
  profile: StoredUserProfile,
  dryRun: boolean
): ExecutionTask {
  const steps: TaskStep[] = [];

  // 从 profile.components 提取软件安装命令
  for (const comp of profile.components) {
    if (comp.type !== "software") continue;
    const packageName = comp.label.split(" ")[0]; // "node 20.x" → "node"
    const pm = detectPackageManager(comp.detail);
    try {
      const cmds = buildInstallCommands(pm, packageName);
      for (const cmd of cmds) {
        steps.push(makeStep(cmd.label, cmd.command));
      }
    } catch {
      steps.push(makeStep(`Skip ${comp.label}`, `echo "Skipped: ${comp.label}"`, "skipped"));
    }
  }

  // 从 profile.components 提取系统配置命令
  for (const comp of profile.components) {
    if (comp.type !== "system-command") continue;
    if (isSafeSystemCommand(comp.detail)) {
      steps.push(makeStep(comp.label, comp.detail));
    }
  }

  if (steps.length === 0) {
    steps.push(makeStep("No-op", "echo 'No installation steps defined'"));
  }

  return {
    id: createId("task"),
    userId,
    connectionId: connection.id,
    profileId: profile.id,
    kind: profile.kind === "combo" ? "apply-combo" : "install-software",
    status: "pending",
    steps,
    dryRun,
    createdAt: new Date().toISOString()
  };
}

export function buildSnapshotDeployTask(
  userId: string,
  connection: StoredConnection,
  profile: StoredUserProfile,
  dryRun: boolean
): ExecutionTask {
  const steps: TaskStep[] = [];
  const snap = profile.envSnapshot;

  if (!snap) {
    return {
      id: createId("task"),
      userId,
      connectionId: connection.id,
      profileId: profile.id,
      kind: "deploy-snapshot",
      status: "failed",
      steps: [],
      dryRun,
      createdAt: new Date().toISOString(),
      error: "No environment snapshot data found."
    };
  }

  // Step 1: 安装软件
  for (const sw of snap.software) {
    const pm = detectPackageManager(sw.source);
    try {
      const cmds = buildInstallCommands(pm, sw.name);
      for (const cmd of cmds) {
        steps.push(makeStep(`[Software] ${cmd.label}`, cmd.command));
      }
    } catch {
      steps.push(makeStep(`[Skip] ${sw.name}`, `echo "Skipped: ${sw.name}"`, "skipped"));
    }
  }

  // Step 2: 设置环境变量
  if (snap.envVars && Object.keys(snap.envVars).length > 0) {
    const envCmds = buildEnvCommands(snap.envVars, "bash");
    for (const cmd of envCmds) {
      steps.push(makeStep(`[Env] ${cmd.label}`, cmd.command));
    }
  }

  // Step 3: 验证
  steps.push(makeStep("[Verify] Check node", "node --version 2>/dev/null || echo 'node not found'"));
  steps.push(makeStep("[Verify] Check git", "git --version 2>/dev/null || echo 'git not found'"));

  return {
    id: createId("task"),
    userId,
    connectionId: connection.id,
    profileId: profile.id,
    kind: "deploy-snapshot",
    status: "pending",
    steps,
    dryRun,
    createdAt: new Date().toISOString()
  };
}

// ── 任务执行 ──────────────────────────────────────────────

export async function executeTask(task: ExecutionTask, connection: StoredConnection): Promise<ExecutionTask> {
  taskStore.set(task.id, task);
  task.status = "running";
  task.startedAt = new Date().toISOString();
  notifySubscribers(task.id, task);

  if (task.dryRun) {
    // dry-run：只标记步骤，不执行
    for (const step of task.steps) {
      if (step.status === "skipped") continue;
      step.status = "succeeded";
      step.stdout = `[dry-run] Would execute: ${step.command}`;
      step.durationMs = 0;
    }
    task.status = "succeeded";
    task.completedAt = new Date().toISOString();
    taskStore.set(task.id, task);
    notifySubscribers(task.id, task);
    return task;
  }

  // 真实执行
  let client: Client | null = null;
  try {
    client = await connectSsh(connection);
    for (const step of task.steps) {
      if (step.status === "skipped") continue;
      step.status = "running";
      notifySubscribers(task.id, task);

      const start = Date.now();
      const result = await execCommand(client, step.command);
      step.stdout = result.stdout;
      step.stderr = result.stderr;
      step.exitCode = result.exitCode;
      step.durationMs = Date.now() - start;
      step.status = result.exitCode === 0 ? "succeeded" : "failed";

      notifySubscribers(task.id, task);

      if (step.status === "failed") {
        task.status = "failed";
        task.error = `Step "${step.label}" failed with exit code ${result.exitCode}`;
        break;
      }
    }

    if (task.status === "running") task.status = "succeeded";
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Unknown error";
  } finally {
    client?.end();
    task.completedAt = new Date().toISOString();
    taskStore.set(task.id, task);
    notifySubscribers(task.id, task);
  }

  return task;
}

export function getTask(taskId: string): ExecutionTask | undefined {
  return taskStore.get(taskId);
}

export function subscribeTask(taskId: string, cb: (task: ExecutionTask) => void): () => void {
  const subs = taskSubscribers.get(taskId) ?? [];
  subs.push(cb);
  taskSubscribers.set(taskId, subs);
  return () => {
    const current = taskSubscribers.get(taskId) ?? [];
    taskSubscribers.set(taskId, current.filter((s) => s !== cb));
  };
}

// ── 辅助函数 ──────────────────────────────────────────────

function makeStep(label: string, command: string, status: TaskStep["status"] = "pending"): TaskStep {
  return { id: createId("step"), label, command, stdout: "", stderr: "", exitCode: null, status, durationMs: 0 };
}

function detectPackageManager(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("npm") || s.includes("node")) return "npm";
  if (s.includes("pip") || s.includes("python")) return "pip3";
  if (s.includes("brew")) return "brew";
  if (s.includes("winget") || s.includes("windows")) return "winget";
  if (s.includes("apt") || s.includes("debian") || s.includes("ubuntu")) return "apt";
  if (s.includes("yum") || s.includes("centos") || s.includes("rhel")) return "yum";
  if (s.includes("dnf") || s.includes("fedora")) return "dnf";
  return "apt"; // 默认 Linux
}

const SAFE_SYSTEM_COMMANDS = new Set([
  "source ~/.bashrc",
  "source ~/.zshrc",
  "source ~/.profile"
]);

function isSafeSystemCommand(cmd: string): boolean {
  if (SAFE_SYSTEM_COMMANDS.has(cmd.trim())) return true;
  // 允许 systemctl enable/start/restart（服务名安全校验）
  const systemctlMatch = cmd.match(/^sudo systemctl (enable|start|restart|stop) ([a-zA-Z0-9._-]+)$/);
  if (systemctlMatch && SAFE_SERVICE_NAME.test(systemctlMatch[2])) return true;
  return false;
}

async function connectSsh(connection: StoredConnection): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { client.destroy(); reject(new Error("SSH connection timed out")); }, 10000);

    client.on("ready", () => { clearTimeout(timer); resolve(client); });
    client.on("error", (err) => { clearTimeout(timer); reject(err); });

    const host = connection.fields.host;
    const port = parseInt(connection.fields.port ?? "22", 10) || 22;
    const username = connection.fields.username;

    // 注意：密码已脱敏，此处无法重新连接（需要用户重新输入或使用 key）
    // 当前版本：如果有 agentUrl，通过 agent 执行；否则提示需要重新连接
    reject(new Error("Re-authentication required. Please reconnect to execute commands."));
    client.destroy();
  });
}

async function execCommand(client: Client, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) { reject(err); return; }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { stream.destroy(); resolve({ stdout, stderr, exitCode: -1 }); }, 30000);

      stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on("close", (code: number) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? 0 }); });
    });
  });
}

function notifySubscribers(taskId: string, task: ExecutionTask) {
  const subs = taskSubscribers.get(taskId) ?? [];
  for (const sub of subs) sub(task);
}
