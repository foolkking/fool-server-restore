/**
 * distro-compat.ts — 跨发行版兼容性框架
 *
 * 核心思路：每个 Playbook 都声明它"经过测试支持哪些发行版"。当用户要把 Playbook
 * 应用到某台目标机器时，系统先做一次发行版探测，如果目标机器的发行版不在 Playbook
 * 的 compatible_distros 列表里，就给一个明确警告（而不是默默失败）。
 *
 * 与 engine/modules/package.ts 的 detectDistro 关系：
 *   - package.ts 是运行时（per-task）探测，用来选包名翻译
 *   - distro-compat.ts 是部署前（per-Playbook）声明，用来给用户预警
 *
 * 当前支持的发行版家族：
 *   - debian-family    (Debian / Ubuntu / Linux Mint，包管理器 apt)
 *   - rhel-family      (RHEL / CentOS / Rocky / Alma / Anolis / Fedora，包管理器 dnf/yum)
 *   - suse-family      (openSUSE / SLES，包管理器 zypper) — 计划支持
 *   - arch-family      (Arch / Manjaro，包管理器 pacman) — 暂不支持
 *   - alpine           (Alpine Linux，包管理器 apk) — 暂不支持，体积小但 musl libc 兼容性差
 */

import type { SshExecutor } from "./engine/types.js";

export type DistroFamily =
  | "debian-family"
  | "rhel-family"
  | "suse-family"
  | "arch-family"
  | "alpine"
  | "unknown";

/** 完整探测结果。比 package.ts 里的轻量探测更详细。 */
export interface DistroInfo {
  /** /etc/os-release 的 ID 字段（如 "ubuntu" / "anolis" / "rocky") */
  id: string;
  /** ID_LIKE（继承关系，如 anolis 的 ID_LIKE 是 "rhel centos fedora"） */
  idLike: string[];
  /** ID 显示名，如 "Anolis OS" */
  prettyName: string;
  /** 主版本号，如 9 (anolis 9 / ubuntu 22) */
  major: number;
  /** 完整版本号，如 "9.0" / "22.04" */
  versionId: string;
  /** 推断出的发行版家族 */
  family: DistroFamily;
  /** 探测到的包管理器命令 */
  packageManager: "apt" | "dnf" | "yum" | "zypper" | "apk" | "pacman" | "unknown";
}

/**
 * 探测目标机器的发行版信息。需要 SSH 连通后调用。
 *
 * 探测策略：
 *   1. cat /etc/os-release → 解出 ID / VERSION_ID / ID_LIKE / PRETTY_NAME
 *   2. 探测系统上有哪个包管理器命令（apt-get / dnf / yum / zypper / apk / pacman）
 *   3. 基于 ID 和 ID_LIKE 推断出 family
 *
 * 失败时返回所有字段为 "unknown"——上层通过 family === "unknown" 判断。
 */
export async function detectDistroInfo(executor: SshExecutor): Promise<DistroInfo> {
  // 1. /etc/os-release
  const r = await executor.exec("cat /etc/os-release 2>/dev/null");
  let id = "", idLike = "", prettyName = "", versionId = "";
  if (r.exitCode === 0) {
    const text = r.stdout;
    id = text.match(/^ID=("?)([^"\n]+)\1/m)?.[2]?.toLowerCase() ?? "";
    idLike = text.match(/^ID_LIKE=("?)([^"\n]+)\1/m)?.[2]?.toLowerCase() ?? "";
    prettyName = text.match(/^PRETTY_NAME=("?)([^"\n]+)\1/m)?.[2] ?? "";
    versionId = text.match(/^VERSION_ID=("?)([^"\n]+)\1/m)?.[2] ?? "";
  }

  const major = versionId ? parseInt(versionId.split(".")[0], 10) || 0 : 0;
  const idLikeArr = idLike.split(/\s+/).filter(Boolean);

  // 2. 检测包管理器
  let packageManager: DistroInfo["packageManager"] = "unknown";
  for (const [cmd, pm] of [
    ["apt-get", "apt"],
    ["dnf", "dnf"],
    ["yum", "yum"],
    ["zypper", "zypper"],
    ["apk", "apk"],
    ["pacman", "pacman"]
  ] as const) {
    const c = await executor.exec(`command -v ${cmd} >/dev/null 2>&1`);
    if (c.exitCode === 0) { packageManager = pm; break; }
  }

  // 3. 推断 family
  const family = inferFamily(id, idLikeArr);

  return {
    id,
    idLike: idLikeArr,
    prettyName: prettyName || (id ? `${id} ${versionId}`.trim() : "Unknown Linux"),
    major,
    versionId,
    family,
    packageManager
  };
}

function inferFamily(id: string, idLike: string[]): DistroFamily {
  const all = [id, ...idLike];

  if (all.some((x) => ["debian", "ubuntu", "linuxmint", "raspbian", "kali"].includes(x))) {
    return "debian-family";
  }
  if (all.some((x) => ["rhel", "centos", "fedora", "rocky", "almalinux", "alma", "anolis", "openeuler", "amzn"].includes(x))) {
    return "rhel-family";
  }
  if (all.some((x) => ["opensuse", "sles", "suse", "opensuse-leap", "opensuse-tumbleweed"].includes(x))) {
    return "suse-family";
  }
  if (all.some((x) => ["arch", "manjaro", "endeavouros"].includes(x))) {
    return "arch-family";
  }
  if (all.some((x) => x === "alpine")) return "alpine";
  return "unknown";
}

// ─── Compatibility declaration & checking ──────────────────────────────────

/**
 * 兼容性级别。当 Playbook 指定它经过测试支持哪些发行版后，部署前可对照实际目标机器：
 *   - "verified"      用户的目标 = Playbook 明确声明 verified
 *   - "compatible"    Playbook 声明的 family 包含目标 family（虽然未具名验证）
 *   - "untested"      未在 Playbook 中明确声明，但包管理器属于 EnvForge 已支持的（apt / dnf / yum）
 *   - "unsupported"   目标的包管理器 EnvForge 完全不支持（apk / pacman / zypper 当前），或 Playbook 明确排除
 */
export type CompatibilityLevel = "verified" | "compatible" | "untested" | "unsupported";

/**
 * Playbook 的兼容性声明。读自 catalog item 的可选 compatibility 字段。
 *
 * 例：
 *   {
 *     verified: ["ubuntu-22", "ubuntu-24", "debian-12", "anolis-9", "rocky-9"],
 *     known_incompatible: ["alpine-*"],
 *     families: ["debian-family", "rhel-family"]
 *   }
 */
export interface PlaybookCompatibility {
  /** 明确测试通过的 distro-major 组合，如 "ubuntu-22"、"anolis-9" */
  verified?: string[];
  /** 明确不支持的（如 "alpine-*"、"arch-*"） */
  knownIncompatible?: string[];
  /** 支持的家族（粗粒度，作为 verified 的兜底） */
  families?: DistroFamily[];
}

/**
 * 检查 Playbook 是否在目标机器上可执行。返回 level + 给用户的解释。
 */
export function evaluateCompatibility(
  declared: PlaybookCompatibility | undefined,
  target: DistroInfo
): { level: CompatibilityLevel; reasonZh: string; reasonEn: string } {
  // 完全未知：目标的发行版连 /etc/os-release 都读不出来
  if (target.family === "unknown") {
    return {
      level: "unsupported",
      reasonZh: "无法识别目标机器的发行版（/etc/os-release 读取失败）。Playbook 大概率运行失败。",
      reasonEn: "Could not detect target distro (/etc/os-release read failed). Playbook will likely fail."
    };
  }

  // EnvForge 当前完全不支持的包管理器（apk / pacman / zypper 还没适配 PACKAGE_ALIASES）
  const nativelySupported = ["apt", "dnf", "yum"].includes(target.packageManager);
  if (!nativelySupported) {
    return {
      level: "unsupported",
      reasonZh: `EnvForge 当前不支持包管理器 ${target.packageManager}。Playbook 中的包安装步骤会失败。`,
      reasonEn: `EnvForge does not currently support package manager ${target.packageManager}. Package installation steps will fail.`
    };
  }

  // Playbook 没有声明 compatibility = 视为通用，level 仅看包管理器
  if (!declared) {
    return {
      level: "untested",
      reasonZh: `Playbook 没有声明兼容性。EnvForge 支持你的包管理器 ${target.packageManager}，但 Playbook 没在 ${target.prettyName} 上明确测试过。`,
      reasonEn: `Playbook has no compatibility declaration. EnvForge supports your ${target.packageManager} but the Playbook hasn't been verified on ${target.prettyName}.`
    };
  }

  // Known incompatible: 高优先级阻断
  const distroKey = `${target.id}-${target.major}`;
  const distroFamilyWildcard = `${target.id}-*`;
  if (declared.knownIncompatible?.some((p) => p === distroKey || p === distroFamilyWildcard)) {
    return {
      level: "unsupported",
      reasonZh: `Playbook 明确声明在 ${target.prettyName} 上不工作。建议换发行版或自己改 Playbook。`,
      reasonEn: `Playbook explicitly declares it does not work on ${target.prettyName}. Use another distro or modify the Playbook.`
    };
  }

  // Verified hit: 用户的目标在 verified 列表里
  if (declared.verified?.includes(distroKey)) {
    return {
      level: "verified",
      reasonZh: `已在 ${target.prettyName} 上验证。`,
      reasonEn: `Verified on ${target.prettyName}.`
    };
  }

  // Family compatible: family 在 families 里（同家族）
  if (declared.families?.includes(target.family)) {
    return {
      level: "compatible",
      reasonZh: `Playbook 声明支持 ${target.family}（包含 ${target.prettyName}），但未对此具体版本验证。一般能跑通。`,
      reasonEn: `Playbook declares support for ${target.family} (includes ${target.prettyName}) but this specific version isn't verified. Usually works.`
    };
  }

  // 完全不在声明的范围里
  return {
    level: "unsupported",
    reasonZh: `Playbook 未声明支持 ${target.prettyName}（family: ${target.family}）。建议先 dry-run 看看会不会失败。`,
    reasonEn: `Playbook does not declare support for ${target.prettyName} (family: ${target.family}). Try dry-run first.`
  };
}
