/**
 * P0.1 smoke test — confirm the new dependencies (otpauth/qrcode/nodemailer/marked/dompurify)
 * actually import and expose the symbols we plan to use. Catches install issues
 * before we wire them into real auth/email logic.
 */
import test from "node:test";
import assert from "node:assert/strict";

test("new-deps: otpauth exposes TOTP class", async () => {
  const { TOTP, Secret } = await import("otpauth");
  assert.equal(typeof TOTP, "function");
  assert.equal(typeof Secret, "function");
  // Round-trip a TOTP generation just to confirm it doesn't throw at runtime.
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "EnvForge-test",
    label: "smoke@test",
    secret,
    algorithm: "SHA1",
    digits: 6,
    period: 30
  });
  const code = totp.generate();
  assert.match(code, /^\d{6}$/);
  // The just-generated code must validate at delta 0
  const delta = totp.validate({ token: code, window: 1 });
  assert.equal(delta, 0);
});

test("new-deps: qrcode generates a data URL", async () => {
  const QRCode = await import("qrcode");
  const dataUrl = await QRCode.toDataURL("otpauth://totp/EnvForge:smoke?secret=ABCD");
  assert.ok(dataUrl.startsWith("data:image/png;base64,"));
});

test("new-deps: nodemailer createTransport works", async () => {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const info = await transport.sendMail({
    from: "test@envforge.local",
    to: "user@envforge.local",
    subject: "smoke",
    text: "hi"
  });
  assert.ok(info.messageId);
});

test("new-deps: marked + dompurify sanitize XSS", async () => {
  const { marked } = await import("marked");
  const DOMPurify = (await import("dompurify")).default;
  const { JSDOM } = await import("jsdom");
  const window = new JSDOM("").window;
  // dompurify's WindowLike type expects a structural subset of jsdom Window.
  // Cast through unknown — at runtime jsdom satisfies what dompurify needs.
  const purify = DOMPurify(window as unknown as Parameters<typeof DOMPurify>[0]);

  // Disable async by setting marked to sync mode (default); render then sanitize.
  const md = "Hello **world** <script>alert('xss')</script>";
  const html = await marked.parse(md, { async: false }) as string;
  const clean = purify.sanitize(html);
  assert.ok(clean.includes("<strong>world</strong>"));
  assert.ok(!clean.includes("<script>"));
  assert.ok(!clean.includes("alert"));
});
