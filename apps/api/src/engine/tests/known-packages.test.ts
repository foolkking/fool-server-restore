/**
 * Tests for known-packages.ts whitelist
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isKnownUserPackage } from "../../collectors/known-packages.js";

test("known-packages: well-known server software is whitelisted", () => {
  // Web servers / databases / runtimes / DevOps
  assert.equal(isKnownUserPackage("nginx"), true);
  assert.equal(isKnownUserPackage("redis-server"), true);
  assert.equal(isKnownUserPackage("mysql-server"), true);
  assert.equal(isKnownUserPackage("postgresql"), true);
  assert.equal(isKnownUserPackage("docker.io"), true);
  assert.equal(isKnownUserPackage("docker-ce"), true);
  assert.equal(isKnownUserPackage("nodejs"), true);
  assert.equal(isKnownUserPackage("git"), true);
  assert.equal(isKnownUserPackage("certbot"), true);
  assert.equal(isKnownUserPackage("fail2ban"), true);
  assert.equal(isKnownUserPackage("ufw"), true);
  assert.equal(isKnownUserPackage("wireguard"), true);
});

test("known-packages: prefix-matched variants are accepted", () => {
  assert.equal(isKnownUserPackage("nginx-extras"), true);
  assert.equal(isKnownUserPackage("postgresql-15"), true);
  assert.equal(isKnownUserPackage("postgresql-client-15"), true);
  assert.equal(isKnownUserPackage("openjdk-17-jdk"), true);
  assert.equal(isKnownUserPackage("php-cli"), true);
  assert.equal(isKnownUserPackage("php8.1-fpm"), true);
  assert.equal(isKnownUserPackage("docker-buildx-plugin"), true);
  assert.equal(isKnownUserPackage("kubernetes-cni"), true);
  assert.equal(isKnownUserPackage("ansible-lint"), true);
  assert.equal(isKnownUserPackage("grafana-enterprise"), true);
});

test("known-packages: cloud bloat / system packages are NOT whitelisted", () => {
  // Aliyun-specific
  assert.equal(isKnownUserPackage("aliyun-assist"), false);
  assert.equal(isKnownUserPackage("alibaba-cloud-cli"), false);
  // System libraries
  assert.equal(isKnownUserPackage("libc6"), false);
  assert.equal(isKnownUserPackage("libssl3"), false);
  assert.equal(isKnownUserPackage("python3-yaml"), false);
  assert.equal(isKnownUserPackage("perl-base"), false);
  // Cloud-init artifacts
  assert.equal(isKnownUserPackage("cloud-init"), false);
  assert.equal(isKnownUserPackage("walinuxagent"), false);
  // Random packages that aren't whitelisted
  assert.equal(isKnownUserPackage("some-random-package"), false);
  assert.equal(isKnownUserPackage("foobar"), false);
});

test("known-packages: case-sensitive match", () => {
  assert.equal(isKnownUserPackage("Nginx"), false); // wrong case
  assert.equal(isKnownUserPackage("NGINX"), false);
});
