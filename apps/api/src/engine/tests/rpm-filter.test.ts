/**
 * Tests for RPM-side system package filter (RHEL/CentOS/Anolis cloud images)
 */
import test from "node:test";
import assert from "node:assert/strict";
// We import the helper through the public surface; isSystemRpmPackage is internal
// to remote-collector.ts. To keep the test simple, we assert on the public mergeCatalog
// behavior indirectly by invoking the parseFullOutput-equivalent path is too heavy.
// Instead we just test the whitelist behavior with isKnownUserPackage which matters
// most for the user-facing UI.
import { isKnownUserPackage } from "../../collectors/known-packages.js";

test("rpm-cloud-bloat: typical RHEL system packages are NOT in user whitelist", () => {
  // From user's screenshot
  assert.equal(isKnownUserPackage("libgcc"), false);
  assert.equal(isKnownUserPackage("python3-pip-wheel"), false);
  assert.equal(isKnownUserPackage("libreport-filesystem"), false);
  assert.equal(isKnownUserPackage("hwdata"), false);
  assert.equal(isKnownUserPackage("setup"), false);
  assert.equal(isKnownUserPackage("filesystem"), false);
  // Other typical RHEL system packages
  assert.equal(isKnownUserPackage("dnf-data"), false);
  assert.equal(isKnownUserPackage("kernel-core"), false);
  assert.equal(isKnownUserPackage("systemd-libs"), false);
  assert.equal(isKnownUserPackage("WALinuxAgent"), false);
});

test("rpm-user-software: real user installs ARE in whitelist", () => {
  assert.equal(isKnownUserPackage("nginx"), true);
  assert.equal(isKnownUserPackage("docker-ce"), true);
  assert.equal(isKnownUserPackage("git"), true);
  assert.equal(isKnownUserPackage("redis"), true); // RHEL name (no -server suffix)
  assert.equal(isKnownUserPackage("postgresql"), true);
  assert.equal(isKnownUserPackage("podman"), true);
  assert.equal(isKnownUserPackage("htop"), true);
});
