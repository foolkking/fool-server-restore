/**
 * email/index.ts — public surface of the email subsystem.
 *
 * Future phases extend this barrel:
 *   - P1.5 verification code emails (handled via enqueueEmail with templateId="verify-register")
 *   - P1.12 password reset (templateId="password-reset")
 *   - P2.4 publish approved/rejected (templateId="publish-approved" / "publish-rejected")
 *   - P3.2 suggestion status (templateId="suggestion-status")
 *   - P3.5 mention aggregation (templateId="mention", batched via mention-aggregator)
 *
 * Server entry point should call `startEmailQueue()` at boot.
 */
export { enqueueEmail, startEmailQueue, stopEmailQueue, getEmailQueueStats, waitForEmailQueueDrain, resetEmailQueueForTests } from "./queue.js";
export type { EnqueueEmailInput, EmailQueueStats } from "./queue.js";

export { renderTemplate, renderString } from "./render.js";
export type { TemplateContext, RenderedEmail } from "./render.js";

export { evaluateRateLimit } from "./rate-limit.js";
export type { RateLimitDecision, RateLimitInput } from "./rate-limit.js";

export { getEmailTransport, getDefaultFromHeader, resetEmailTransportForTests } from "./smtp.js";
