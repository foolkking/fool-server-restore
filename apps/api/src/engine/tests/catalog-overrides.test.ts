/**
 * Tests for catalog-overrides.ts — admin overlay merging logic
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCatalog, annotateOverrides, isValidCatalogId } from "../../catalog-overrides.js";
import type { CatalogItem } from "../../catalog.js";
import type { CatalogOverride } from "../../runtime-store.js";

const baseline: CatalogItem[] = [
  {
    id: "node-runtime-profile",
    kind: "software",
    name: "Node.js 运行时配置",
    nameEn: "Node.js runtime",
    category: "runtime",
    summary: "Install Node.js",
    summaryEn: "Install Node.js",
    rating: 4.8,
    installs: "12k",
    imageTone: "teal",
    sensitivity: "review",
    assets: [],
    guidePath: "configs/catalog/software/node-runtime-profile.md",
    guideAuthor: "admin",
    installMode: "skip-existing",
    components: []
  },
  {
    id: "redis-server",
    kind: "software",
    name: "Redis",
    nameEn: "Redis",
    category: "database",
    summary: "Install Redis",
    summaryEn: "Install Redis",
    rating: 4.7,
    installs: "10k",
    imageTone: "red",
    sensitivity: "review",
    assets: [],
    guidePath: "configs/catalog/software/redis-server.md",
    guideAuthor: "admin",
    installMode: "skip-existing",
    components: []
  }
];

test("mergeCatalog: no overrides → baseline unchanged", () => {
  const merged = mergeCatalog(baseline, undefined);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, "Node.js 运行时配置");
});

test("mergeCatalog: hidden override removes baseline item", () => {
  const overrides: CatalogOverride[] = [{
    id: "redis-server",
    baseId: "redis-server",
    hidden: true,
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
    modifiedBy: "u1"
  }];
  const merged = mergeCatalog(baseline, overrides);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "node-runtime-profile");
});

test("mergeCatalog: field override modifies baseline", () => {
  const overrides: CatalogOverride[] = [{
    id: "node-runtime-profile",
    baseId: "node-runtime-profile",
    overrides: { name: "Node.js 自定义版本", summary: "Modified" },
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
    modifiedBy: "u1"
  }];
  const merged = mergeCatalog(baseline, overrides);
  assert.equal(merged.length, 2);
  const node = merged.find((m) => m.id === "node-runtime-profile")!;
  assert.equal(node.name, "Node.js 自定义版本");
  assert.equal(node.summary, "Modified");
  // Other fields preserved
  assert.equal(node.category, "runtime");
  assert.equal(node.rating, 4.8);
});

test("mergeCatalog: user-added items appear at the end", () => {
  const overrides: CatalogOverride[] = [{
    id: "my-custom-app",
    overrides: {
      kind: "software",
      name: "My Custom App",
      nameEn: "My Custom App",
      category: "service",
      summary: "Custom",
      summaryEn: "Custom"
    },
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
    modifiedBy: "u1"
  }];
  const merged = mergeCatalog(baseline, overrides);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, "my-custom-app");
  assert.equal(merged[2].name, "My Custom App");
});

test("mergeCatalog: orphan baseId override is ignored", () => {
  const overrides: CatalogOverride[] = [{
    id: "does-not-exist",
    baseId: "does-not-exist",
    hidden: true,
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
    modifiedBy: "u1"
  }];
  const merged = mergeCatalog(baseline, overrides);
  // Both baseline items remain; override on non-existent baseline is silently ignored
  assert.equal(merged.length, 2);
});

test("annotateOverrides: classifies each item correctly", () => {
  const overrides: CatalogOverride[] = [
    { id: "node-runtime-profile", baseId: "node-runtime-profile", overrides: { name: "x" }, createdAt: "", updatedAt: "", modifiedBy: "u" },
    { id: "redis-server", baseId: "redis-server", hidden: true, createdAt: "", updatedAt: "", modifiedBy: "u" },
    { id: "my-app", overrides: { name: "My App" }, createdAt: "", updatedAt: "", modifiedBy: "u" }
  ];
  const map = annotateOverrides(baseline, overrides);
  assert.equal(map.get("node-runtime-profile"), "modified");
  assert.equal(map.get("redis-server"), "hidden");
  assert.equal(map.get("my-app"), "added");
});

test("isValidCatalogId: enforces strict pattern", () => {
  assert.equal(isValidCatalogId("my-app"), true);
  assert.equal(isValidCatalogId("a"), true);
  assert.equal(isValidCatalogId("a1-b2-c3"), true);
  assert.equal(isValidCatalogId("My-App"), false); // uppercase
  assert.equal(isValidCatalogId("../etc/shadow"), false);
  assert.equal(isValidCatalogId("app/../escape"), false);
  assert.equal(isValidCatalogId("-leading-dash"), false);
  assert.equal(isValidCatalogId(""), false);
  assert.equal(isValidCatalogId("a".repeat(61)), false);
  assert.equal(isValidCatalogId("a".repeat(60)), true);
  assert.equal(isValidCatalogId("app.with.dots"), false);
});
