/**
 * Tests for distro-compat.ts — distro detection + per-Playbook compatibility evaluation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { detectDistroInfo, evaluateCompatibility, type PlaybookCompatibility } from "../../distro-compat.js";
import type { SshExecutor } from "../types.js";

function mockExec(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>): SshExecutor {
  return {
    async exec(cmd: string) {
      const keys = Object.keys(answers).sort((a, b) => b.length - a.length);
      for (const k of keys) {
        if (cmd.includes(k)) {
          const a = answers[k];
          return { stdout: a.stdout ?? "", stderr: a.stderr ?? "", exitCode: a.exitCode ?? 0 };
        }
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    putFile: async () => undefined,
    getFile: async () => "",
    pathExists: async () => false
  } as unknown as SshExecutor;
}

// ─── detectDistroInfo ──────────────────────────────────────────────────────

test("detectDistroInfo: Ubuntu 24.04 → debian-family + apt", async () => {
  const exec = mockExec({
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n'
    },
    "command -v apt-get": { exitCode: 0 },
    "command -v dnf": { exitCode: 1 },
    "command -v yum": { exitCode: 1 },
    "command -v zypper": { exitCode: 1 },
    "command -v apk": { exitCode: 1 },
    "command -v pacman": { exitCode: 1 }
  });
  const d = await detectDistroInfo(exec);
  assert.equal(d.id, "ubuntu");
  assert.equal(d.major, 24);
  assert.equal(d.versionId, "24.04");
  assert.equal(d.family, "debian-family");
  assert.equal(d.packageManager, "apt");
  assert.ok(d.idLike.includes("debian"));
});

test("detectDistroInfo: Anolis 9 → rhel-family + dnf", async () => {
  const exec = mockExec({
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'NAME="Anolis OS"\nVERSION="9.0"\nID="anolis"\nVERSION_ID="9.0"\nPRETTY_NAME="Anolis OS 9.0"\nID_LIKE="rhel centos fedora"\n'
    },
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 0 }
  });
  const d = await detectDistroInfo(exec);
  assert.equal(d.id, "anolis");
  assert.equal(d.major, 9);
  assert.equal(d.family, "rhel-family");
  assert.equal(d.packageManager, "dnf");
});

test("detectDistroInfo: Alpine → alpine + apk", async () => {
  const exec = mockExec({
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.0\nPRETTY_NAME="Alpine Linux v3.20"\n'
    },
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 1 },
    "command -v yum": { exitCode: 1 },
    "command -v zypper": { exitCode: 1 },
    "command -v apk": { exitCode: 0 }
  });
  const d = await detectDistroInfo(exec);
  assert.equal(d.family, "alpine");
  assert.equal(d.packageManager, "apk");
});

test("detectDistroInfo: openSUSE → suse-family + zypper", async () => {
  const exec = mockExec({
    "cat /etc/os-release": {
      exitCode: 0,
      stdout: 'NAME="openSUSE Leap"\nID="opensuse-leap"\nVERSION_ID="15.5"\nID_LIKE="suse opensuse"\n'
    },
    "command -v apt-get": { exitCode: 1 },
    "command -v dnf": { exitCode: 1 },
    "command -v yum": { exitCode: 1 },
    "command -v zypper": { exitCode: 0 }
  });
  const d = await detectDistroInfo(exec);
  assert.equal(d.family, "suse-family");
  assert.equal(d.packageManager, "zypper");
});

test("detectDistroInfo: 无 os-release → unknown", async () => {
  const exec = mockExec({
    "cat /etc/os-release": { exitCode: 1 },
    "command -v": { exitCode: 1 }  // 默认所有 command -v 都返回 1（不存在）
  });
  const d = await detectDistroInfo(exec);
  assert.equal(d.family, "unknown");
  assert.equal(d.packageManager, "unknown");
});

// ─── evaluateCompatibility ─────────────────────────────────────────────────

const ubuntu24 = {
  id: "ubuntu", idLike: ["debian"], prettyName: "Ubuntu 24.04",
  major: 24, versionId: "24.04", family: "debian-family" as const, packageManager: "apt" as const
};
const anolis9 = {
  id: "anolis", idLike: ["rhel", "centos", "fedora"], prettyName: "Anolis OS 9.0",
  major: 9, versionId: "9.0", family: "rhel-family" as const, packageManager: "dnf" as const
};
const alpine320 = {
  id: "alpine", idLike: [], prettyName: "Alpine Linux v3.20",
  major: 3, versionId: "3.20.0", family: "alpine" as const, packageManager: "apk" as const
};

test("evaluateCompatibility: verified hit", () => {
  const declared: PlaybookCompatibility = {
    verified: ["ubuntu-24", "anolis-9"],
    families: ["debian-family", "rhel-family"]
  };
  const r = evaluateCompatibility(declared, ubuntu24);
  assert.equal(r.level, "verified");
  assert.match(r.reasonZh, /已在.*验证/);
});

test("evaluateCompatibility: family compatible (verified miss but family match)", () => {
  const declared: PlaybookCompatibility = {
    verified: ["ubuntu-22"],  // 注意是 22，不是 24
    families: ["debian-family"]
  };
  const r = evaluateCompatibility(declared, ubuntu24);
  assert.equal(r.level, "compatible");
  assert.match(r.reasonZh, /声明支持/);
});

test("evaluateCompatibility: untested when no declaration but PM supported", () => {
  const r = evaluateCompatibility(undefined, anolis9);
  assert.equal(r.level, "untested");
});

test("evaluateCompatibility: unsupported package manager → unsupported", () => {
  const declared: PlaybookCompatibility = {
    families: ["debian-family", "rhel-family", "alpine"]  // 即使 Playbook 声明支持 alpine，包管理器不支持也是 unsupported
  };
  const r = evaluateCompatibility(declared, alpine320);
  assert.equal(r.level, "unsupported");
  assert.match(r.reasonZh, /apk/);
});

test("evaluateCompatibility: known incompatible 优先级最高", () => {
  const declared: PlaybookCompatibility = {
    families: ["debian-family"],
    knownIncompatible: ["ubuntu-24"]  // 声明明确不支持
  };
  const r = evaluateCompatibility(declared, ubuntu24);
  assert.equal(r.level, "unsupported");
  assert.match(r.reasonZh, /明确声明.*不工作/);
});

test("evaluateCompatibility: 通配符 known_incompatible (alpine-*)", () => {
  const declared: PlaybookCompatibility = {
    families: ["debian-family"],
    knownIncompatible: ["alpine-*"]
  };
  const r = evaluateCompatibility(declared, alpine320);
  // 包管理器先被卡掉了（apk 不支持），所以是 unsupported（即使没 wildcard 也会）
  assert.equal(r.level, "unsupported");
});

test("evaluateCompatibility: family 不匹配且未 verified → unsupported", () => {
  const declared: PlaybookCompatibility = {
    verified: ["ubuntu-22"],
    families: ["debian-family"]  // 只支持 debian-family
  };
  const r = evaluateCompatibility(declared, anolis9);  // anolis 是 rhel-family
  assert.equal(r.level, "unsupported");
  assert.match(r.reasonZh, /未声明支持/);
});

test("evaluateCompatibility: 无法识别 distro → unsupported", () => {
  const unknownDistro = {
    id: "", idLike: [], prettyName: "Unknown Linux",
    major: 0, versionId: "", family: "unknown" as const, packageManager: "unknown" as const
  };
  const r = evaluateCompatibility(undefined, unknownDistro);
  assert.equal(r.level, "unsupported");
  assert.match(r.reasonZh, /无法识别/);
});
