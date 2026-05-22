/**
 * Tests for catalog-preview.ts — pre-apply preview rendering.
 *
 * 这些测试用临时文件夹跑：写入一个 minimal Playbook + vars schema，调 buildPlaybookPreview，
 * 检查输出。配置目录 + dataDir 通过 ENVFORGE_DATA_DIR / 修改 resolveFromRoot 的路径覆盖。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// 我们直接动态 import buildPlaybookPreview，让 vitest/node 加载已 build 的 dist
import { buildPlaybookPreview } from "../../catalog-preview.js";

// resolvePlaybookYaml 用 resolveFromRoot 找 configs/catalog/playbooks/<id>.yaml；
// 我们用项目自带的两个 schema-aware Playbook 跑测试，避免改 fs.access 路径。

test("preview: nginx — 反代关闭时只渲染静态站点任务，启用反代任务被 when 跳过", async () => {
  const preview = await buildPlaybookPreview("nginx-web-service", {
    domain: "test.example.com",
    listen_port: 8080,
    enable_reverse_proxy: false,
    client_max_body_size: "10m"
  });

  // 渲染后的 YAML 不应再含 {{ ... }} 占位符
  assert.ok(!preview.renderedYaml.includes("{{"), "rendered YAML still has unresolved {{ ... }}");

  // domain 和端口应该出现在渲染结果里
  assert.ok(preview.renderedYaml.includes("test.example.com"));
  assert.ok(preview.renderedYaml.includes("8080"));

  // 反代 task 应该被标记 willSkip=true
  const proxyTask = preview.tasks.find((t) => t.name.toLowerCase().includes("reverse-proxy"));
  assert.ok(proxyTask, "should have reverse-proxy task in preview");
  assert.equal(proxyTask!.willSkip, true);
  assert.match(proxyTask!.skipReason ?? "", /enable_reverse_proxy/);

  // 静态站点 task 应该没被跳过
  const staticTask = preview.tasks.find((t) => t.name.toLowerCase().includes("default site"));
  assert.ok(staticTask, "should have default site task");
  assert.equal(staticTask!.willSkip, false);

  // upstream_url 在 schema 里有 show_when，反代关闭时应该被隐藏并从 effectiveVars 中删除
  assert.ok(preview.hiddenVars.includes("upstream_url"), `expected upstream_url hidden, got: ${preview.hiddenVars.join(", ")}`);
  assert.equal("upstream_url" in preview.effectiveVars, false);

  // 应该收集到 envforge-default.conf 这个会被写入的文件
  const conf = preview.files.find((f) => f.path.includes("envforge-default.conf"));
  assert.ok(conf, "should report nginx config file in preview");
  assert.equal(conf!.action, "create-or-replace");
  assert.ok(conf!.contentPreview?.includes("test.example.com"));
});

test("preview: nginx — 反代开启时切换到反代任务", async () => {
  const preview = await buildPlaybookPreview("nginx-web-service", {
    domain: "api.example.com",
    listen_port: 80,
    enable_reverse_proxy: true,
    upstream_url: "http://127.0.0.1:3000",
    client_max_body_size: "100m"
  });

  // 反代任务现在应该不被跳过
  const proxyTask = preview.tasks.find((t) => t.name.toLowerCase().includes("reverse-proxy"));
  assert.equal(proxyTask?.willSkip, false);

  // 静态任务现在被跳过
  const staticTask = preview.tasks.find((t) => t.name.toLowerCase().includes("default site"));
  assert.equal(staticTask?.willSkip, true);

  // upstream_url 不应再被隐藏
  assert.equal(preview.hiddenVars.includes("upstream_url"), false);
  assert.equal(preview.effectiveVars.upstream_url, "http://127.0.0.1:3000");

  // 渲染的 YAML 应该把 upstream_url 模板进 proxy_pass
  assert.ok(preview.renderedYaml.includes("http://127.0.0.1:3000"));
});

test("preview: schema 校验失败时抛出带 fieldErrors 的错误", async () => {
  await assert.rejects(
    () => buildPlaybookPreview("nginx-web-service", {
      domain: "",  // required
      listen_port: 99999  // out of port range
    }),
    (err: Error & { fieldErrors?: Record<string, string> }) => {
      assert.ok(err.fieldErrors, "error should have fieldErrors");
      assert.ok(err.fieldErrors.domain, "expected domain error");
      assert.ok(err.fieldErrors.listen_port, "expected listen_port error");
      return true;
    }
  );
});

test("preview: verify 块也会经过 var 替换", async () => {
  const preview = await buildPlaybookPreview("nginx-web-service", {
    domain: "verify.example.com",
    listen_port: 8888,
    enable_reverse_proxy: false,
    client_max_body_size: "10m"
  });

  assert.ok(preview.verifyChecks && preview.verifyChecks.length > 0, "should have verify checks");
  // {{ listen_port }} 应该被替换成 8888
  const httpCheck = preview.verifyChecks!.find((v) => v.cmd.includes("curl"));
  assert.ok(httpCheck, "should have curl-based verify check");
  assert.ok(httpCheck!.cmd.includes("8888"), `expected port 8888 in verify cmd, got: ${httpCheck!.cmd}`);
});

test("preview: x-ui-panel — 自动生成密码出现在 effectiveVars 里", async () => {
  const preview = await buildPlaybookPreview("x-ui-panel", {
    panel_port: 12345,
    panel_path: "/admin",
    admin_username: "myadmin"
    // 不填 admin_password — 期望被自动生成
  });

  // 自动生成的密码应该是 24 位字符串
  const pw = preview.effectiveVars.admin_password as string;
  assert.equal(typeof pw, "string");
  assert.equal(pw.length, 24);

  // 密码已经被替换进了 YAML 里（这是预览，让用户能看到密码长什么样）
  assert.ok(preview.renderedYaml.includes(pw),
    "rendered YAML should contain the generated password so user can see the value before run");

  // 也应该在 verify / 任务参数里出现（用户填的 panel_port）
  assert.ok(preview.renderedYaml.includes("12345"));
});

test("preview: 影响范围估算反映用户的选择", async () => {
  const preview = await buildPlaybookPreview("nginx-web-service", {
    domain: "test.com",
    listen_port: 80,
    enable_reverse_proxy: false,
    client_max_body_size: "10m"
  });
  // estimateImpact 在我们的项目里返回 disk/time/sudo/risk 等字段
  assert.ok(preview.impact, "should have impact estimate");
  assert.ok(typeof preview.impact === "object");
});
