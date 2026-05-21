/**
 * errors.test.ts — Unit tests for error classification
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../errors.js";

describe("classifyError", () => {
  test("classifies network errors", () => {
    const err = classifyError(
      "Could not resolve host: archive.ubuntu.com",
      "",
      100,
      "sudo apt-get install nginx"
    );
    assert.equal(err.category, "network");
    assert.ok(err.messageZh.includes("网络"));
  });

  test("classifies permission errors", () => {
    const err = classifyError(
      "sudo: permission denied",
      "",
      1,
      "sudo apt-get install nginx"
    );
    assert.equal(err.category, "permission");
    assert.ok(err.fixHintZh?.includes("sudo"));
  });

  test("classifies package not found", () => {
    const err = classifyError(
      "E: Unable to locate package nonexistent-pkg",
      "",
      100,
      "sudo apt-get install -y nonexistent-pkg"
    );
    assert.equal(err.category, "not_found");
    assert.ok(err.messageZh.includes("nonexistent-pkg"));
  });

  test("classifies disk space errors", () => {
    const err = classifyError(
      "No space left on device",
      "",
      1,
      "sudo apt-get install nginx"
    );
    assert.equal(err.category, "disk_space");
    assert.ok(err.messageZh.includes("磁盘"));
  });

  test("classifies timeout", () => {
    const err = classifyError("", "", -1, "sudo apt-get install nginx");
    assert.equal(err.category, "timeout");
  });

  test("returns unknown for unrecognized errors", () => {
    const err = classifyError("some random error", "", 42, "some command");
    assert.equal(err.category, "unknown");
    assert.ok(err.messageZh.includes("42"));
  });

  test("includes fix hint in message", () => {
    const err = classifyError(
      "E: Unable to locate package foo",
      "",
      100,
      "sudo apt-get install -y foo"
    );
    assert.ok(err.fixHintZh !== undefined);
    assert.ok(err.fixHintEn !== undefined);
  });
});
