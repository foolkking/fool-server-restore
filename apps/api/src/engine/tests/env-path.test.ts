/**
 * Tests for env_path module — adds PATH / env vars to user shell config files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { envPathModule } from "../modules/env_path.js";
import type { SshExecutor } from "../types.js";

/** Trace executor: 记录每个 exec 的 cmd，按前缀返回脚本化的应答。 */
function makeExec(answers: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>) {
  const calls: string[] = [];
  const exec: SshExecutor = {
    async exec(cmd: string) {
      calls.push(cmd);
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
  };
  return { exec, calls };
}

test("env_path: append PATH 到 system → /etc/profile.d/<id>.sh", async () => {
  const { exec, calls } = makeExec({
    "sudo test -f /etc/profile.d/golang.sh": { exitCode: 1 } // 文件不存在
  });
  const result = await envPathModule.run(exec, {
    name: "PATH",
    value: "/usr/local/go/bin",
    mode: "append",
    scope: "system",
    id: "golang"
  }, false);

  assert.equal(result.failed, undefined, `不期望失败: ${result.msg}`);
  assert.equal(result.changed, true);
  assert.match(result.msg, /\/etc\/profile\.d\/golang\.sh/);

  // 应该有 sudo tee 写到 /etc/profile.d/golang.sh
  const writeCmd = calls.find((c) => c.includes("base64 -d | sudo tee /etc/profile.d/golang.sh"));
  assert.ok(writeCmd, "expected sudo tee write to /etc/profile.d/golang.sh");
});

test("env_path: append PATH 到 user → ~/.bashrc + 检测 zsh/fish", async () => {
  const { exec, calls } = makeExec({
    "test -f $HOME/.bashrc": { exitCode: 1 },        // 还不存在
    "command -v zsh": { exitCode: 1 },               // 没装 zsh
    "command -v fish": { exitCode: 1 }               // 没装 fish
  });
  const result = await envPathModule.run(exec, {
    name: "PATH",
    value: "$HOME/.cargo/bin",
    mode: "append",
    scope: "user",
    id: "rust-cargo"
  }, false);

  assert.equal(result.failed, undefined);
  assert.equal(result.changed, true);

  // 写到 .bashrc
  const writeCmd = calls.find((c) => c.includes("$HOME/.bashrc") && c.includes("base64 -d"));
  assert.ok(writeCmd, "expected write to $HOME/.bashrc");

  // 没写 zsh / fish（不在 calls 里）
  const zshWrite = calls.find((c) => c.includes(".zshenv"));
  const fishWrite = calls.find((c) => c.includes("fish/config.fish"));
  assert.equal(zshWrite, undefined);
  assert.equal(fishWrite, undefined);
});

test("env_path: 装了 zsh/fish 时也写", async () => {
  const { exec, calls } = makeExec({
    "command -v zsh": { exitCode: 0 },
    "command -v fish": { exitCode: 0 },
    "test -f": { exitCode: 1 } // 三个文件都不存在
  });
  const result = await envPathModule.run(exec, {
    name: "PATH",
    value: "$HOME/.cargo/bin",
    mode: "append",
    scope: "user",
    id: "rust-cargo"
  }, false);

  assert.equal(result.changed, true);
  assert.ok(calls.find((c) => c.includes("$HOME/.bashrc")), "should write bashrc");
  assert.ok(calls.find((c) => c.includes("$HOME/.zshenv")), "should write zshenv");
  assert.ok(calls.find((c) => c.includes("config.fish")), "should write fish config");
});

test("env_path: set 模式（普通环境变量，非 PATH）", async () => {
  const { exec, calls } = makeExec({
    "test -f": { exitCode: 1 },
    "command -v zsh": { exitCode: 1 },
    "command -v fish": { exitCode: 1 }
  });
  const result = await envPathModule.run(exec, {
    name: "NPM_CONFIG_REGISTRY",
    value: "https://registry.npmmirror.com",
    mode: "set",
    scope: "user",
    id: "npm-mirror"
  }, false);

  assert.equal(result.changed, true);
  // 写入的内容应该是 export NPM_CONFIG_REGISTRY='...'
  const writeCmd = calls.find((c) => c.includes("base64 -d") && c.includes("$HOME/.bashrc"));
  assert.ok(writeCmd);
  // 解 base64 看内容
  const m = writeCmd!.match(/echo '([A-Za-z0-9+/=]+)'/);
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    assert.match(decoded, /export NPM_CONFIG_REGISTRY='https:\/\/registry\.npmmirror\.com'/);
    assert.match(decoded, />>> envforge: npm-mirror >>>/);
    assert.match(decoded, /<<< envforge: npm-mirror <<</);
  }
});

test("env_path: 幂等 — 块已存在且内容相同时不写", async () => {
  // 现有内容里已有完整且相同的块
  const existingBlock = `# >>> envforge: golang >>>
case ":$PATH:" in
  *":/usr/local/go/bin:"*) ;;
  *) export PATH="$PATH:/usr/local/go/bin" ;;
esac
# <<< envforge: golang <<<`;
  const { exec, calls } = makeExec({
    "sudo test -f /etc/profile.d/golang.sh": { exitCode: 0 },
    "sudo cat /etc/profile.d/golang.sh": { exitCode: 0, stdout: existingBlock }
  });
  const result = await envPathModule.run(exec, {
    name: "PATH",
    value: "/usr/local/go/bin",
    mode: "append",
    scope: "system",
    id: "golang"
  }, false);

  assert.equal(result.changed, false, `期望未变更, got: ${result.msg}`);
  // 不应该有写命令
  const writeCmd = calls.find((c) => c.includes("sudo tee /etc/profile.d/golang.sh"));
  assert.equal(writeCmd, undefined, "should not write when block is already up to date");
});

test("env_path: 块存在但内容不同 → 替换块", async () => {
  // 现有内容里块的 PATH value 不一样，应该被替换
  const existingBlock = `# managed pre-existing
some other line
# >>> envforge: golang >>>
export PATH="$PATH:/old/path"
# <<< envforge: golang <<<
trailing line`;
  const { exec, calls } = makeExec({
    "sudo test -f /etc/profile.d/golang.sh": { exitCode: 0 },
    "sudo cat /etc/profile.d/golang.sh": { exitCode: 0, stdout: existingBlock }
  });
  const result = await envPathModule.run(exec, {
    name: "PATH",
    value: "/usr/local/go/bin",
    mode: "append",
    scope: "system",
    id: "golang"
  }, false);
  assert.equal(result.changed, true);
  // 写入的新内容应该保留 "some other line" 和 "trailing line"
  const writeCmd = calls.find((c) => c.includes("base64 -d | sudo tee /etc/profile.d/golang.sh"));
  assert.ok(writeCmd);
  const m = writeCmd!.match(/echo '([A-Za-z0-9+/=]+)'/);
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    assert.match(decoded, /some other line/);
    assert.match(decoded, /trailing line/);
    assert.match(decoded, /\/usr\/local\/go\/bin/);
    // 旧 path 不应再出现
    assert.equal(decoded.includes("/old/path"), false);
  }
});

test("env_path: 拒绝危险 name", async () => {
  const { exec } = makeExec({});
  const r = await envPathModule.run(exec, {
    name: "BAD; rm -rf /",
    value: "x",
    scope: "user",
    id: "test"
  }, false);
  assert.equal(r.failed, true);
  assert.match(r.msg, /Invalid env name/);
});

test("env_path: 拒绝 value 含换行（破坏块结构）", async () => {
  const { exec } = makeExec({});
  const r = await envPathModule.run(exec, {
    name: "FOO",
    value: "line1\nmalicious",
    scope: "user",
    id: "test"
  }, false);
  assert.equal(r.failed, true);
});

test("env_path: dry-run 不动文件", async () => {
  const { exec, calls } = makeExec({});
  const r = await envPathModule.run(exec, {
    name: "PATH",
    value: "/test",
    mode: "append",
    scope: "system",
    id: "test"
  }, true);
  assert.equal(r.changed, true);
  assert.match(r.msg, /\[dry-run\]/);
  // dry-run 时根本不该调任何 exec
  assert.equal(calls.length, 0);
});

test("env_path: fish 用 fish_add_path 不是 export", async () => {
  const { exec, calls } = makeExec({
    "command -v zsh": { exitCode: 1 },
    "command -v fish": { exitCode: 0 },
    "test -f": { exitCode: 1 }
  });
  await envPathModule.run(exec, {
    name: "PATH",
    value: "$HOME/.cargo/bin",
    mode: "append",
    scope: "user",
    id: "rust-cargo"
  }, false);

  const fishWrite = calls.find((c) => c.includes("fish/config.fish") && c.includes("base64"));
  assert.ok(fishWrite, "should have written fish config");
  const m = fishWrite!.match(/echo '([A-Za-z0-9+/=]+)'/);
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    // fish 用 fish_add_path 而不是 export PATH
    assert.match(decoded, /fish_add_path/);
    assert.equal(decoded.includes("export PATH"), false);
  }
});
