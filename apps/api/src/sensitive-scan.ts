/**
 * sensitive-scan.ts — 配置文件敏感字段扫描与脱敏
 *
 * 在 capture / 上传配置文件前调用，把疑似 secret 替换为 <REDACTED-...>
 * 并返回命中清单，供前端展示给用户「这些行被脱敏了」。
 *
 * 设计原则（参考 PRIVACY_AND_RESTORE_STRATEGY.md）：
 * - 多层匹配：路径 / 关键字 / 内容形态
 * - 可读保留：脱敏后仍能看到原行结构（key 保留，value 替换）
 * - 防误杀：常见配置 KV（如 `bind 127.0.0.1`）不命中
 */

export interface RedactionHit {
  /** 配置文件路径 */
  path: string;
  /** 文件内 1-based 行号 */
  line: number;
  /** 命中的规则名 */
  rule: string;
  /** 原行（脱敏前）— 仅 key 部分保留，value 已替换为 <REDACTED> */
  preview: string;
}

export interface ScanResult {
  /** 已脱敏的内容（行级替换） */
  redactedContent: string;
  /** 命中清单 */
  hits: RedactionHit[];
}

interface Rule {
  name: string;
  /** 匹配整行的正则。group 1 = 保留前缀（如 key=），group 2 = 要脱敏的 value */
  pattern: RegExp;
  /** 脱敏标签 */
  tag: string;
}

/**
 * 规则按"先匹配最特殊"排序。每条规则尝试在一行里做替换。
 * 匹配组约定：$1 = key 前缀（保留），$2 = value（替换）。
 */
const RULES: Rule[] = [
  // 私钥头/尾（PEM 格式）— 整段保留为 placeholder
  {
    name: "private-key-block",
    pattern: /^()(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)$/,
    tag: "REDACTED-PRIVATE-KEY"
  },
  {
    name: "private-key-line",
    pattern: /^()(-----BEGIN [A-Z ]*PRIVATE KEY-----.*)$/,
    tag: "REDACTED-PRIVATE-KEY-LINE"
  },

  // .npmrc / .pip 风格：key=value 或 //registry.npmjs.org/:_authToken=...
  {
    name: "npm-auth-token",
    pattern: /^(\s*\/\/[^=]*:_(?:auth|authToken|password)=)(.+)$/i,
    tag: "REDACTED-NPM-TOKEN"
  },

  // GitHub / GitLab tokens (高熵字符串带前缀)
  {
    name: "github-token",
    pattern: /\b(gh[opsu]_)([A-Za-z0-9]{30,})\b/,
    tag: "REDACTED-GH-TOKEN"
  },
  {
    name: "gitlab-token",
    pattern: /\b(glpat-)([A-Za-z0-9_-]{20,})\b/,
    tag: "REDACTED-GL-TOKEN"
  },

  // AWS access keys
  {
    name: "aws-access-key",
    pattern: /\b(AKIA)([A-Z0-9]{16})\b/,
    tag: "REDACTED-AWS-KEY"
  },
  {
    name: "aws-secret-key",
    pattern: /^(\s*aws_secret_access_key\s*=\s*)(.+)$/i,
    tag: "REDACTED-AWS-SECRET"
  },

  // 通用 KV：key contains password/token/secret/api_key (case-insensitive)
  // 但要排除注释（# 开头）和明显的占位符
  {
    name: "generic-password",
    pattern: /^(\s*(?:[A-Za-z][A-Za-z0-9_-]*[._-])?(?:password|passwd|pwd)\s*[:=]\s*["']?)([^"'\s#].*?)(["']?\s*(?:#.*)?)$/i,
    tag: "REDACTED-PASSWORD"
  },
  {
    name: "generic-token",
    pattern: /^(\s*(?:[A-Za-z][A-Za-z0-9_-]*[._-])?(?:token|api[_-]?key|secret|access[_-]?key)\s*[:=]\s*["']?)([^"'\s#].*?)(["']?\s*(?:#.*)?)$/i,
    tag: "REDACTED-TOKEN"
  },

  // Bearer tokens in HTTP Authorization headers
  {
    name: "bearer-token",
    pattern: /(\bAuthorization:\s*Bearer\s+)(\S+)/i,
    tag: "REDACTED-BEARER"
  },

  // env-var style: API_KEY=..., SECRET=..., TOKEN=...
  // (only when value looks like a real token: 12+ chars, non-trivial)
  {
    name: "env-secret",
    pattern: /^((?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|API)[A-Z0-9_]*\s*=\s*["']?)([^\s"'#]{8,})(["']?\s*(?:#.*)?)$/,
    tag: "REDACTED-ENV-SECRET"
  },

  // JWT (eyJ-prefix base64 strings)
  {
    name: "jwt",
    pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.)([A-Za-z0-9_-]{10,})\b/,
    tag: "REDACTED-JWT"
  },

  // OpenAI / Anthropic API keys
  {
    name: "openai-key",
    pattern: /\b(sk-)([A-Za-z0-9]{20,})\b/,
    tag: "REDACTED-OPENAI-KEY"
  }
];

/**
 * 跳过明显是占位符的 value（如 "your-token-here"、"xxx"、"changeme"）
 */
function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.length < 6) return true;
  if (/^(your|my|the|a|some)[-_]/.test(lower)) return true;
  // exact common placeholder words
  if (/^(xxx+|yyy+|zzz+|todo|changeme|password|secret|placeholder|example|sample|fake|demo|test|admin|redacted|hidden)$/i.test(trimmed)) return true;
  // strings that are mostly repeats of one character (xxxxxx, ********)
  if (/^(.)\1{4,}$/.test(trimmed)) return true;
  if (/^[*x]+$/i.test(trimmed)) return true;
  if (/^<.*>$/.test(trimmed)) return true; // <your-token>
  if (/^\$\{[^}]+\}$/.test(trimmed)) return true; // ${VAR}
  return false;
}

/**
 * 扫描配置文件内容，返回脱敏后版本和命中详情。
 */
export function scanAndRedact(path: string, content: string): ScanResult {
  const hits: RedactionHit[] = [];
  const lines = content.split(/\r?\n/);

  // 多行规则（私钥块）先单独处理
  const redactedLines: string[] = [];
  let inPrivateKeyBlock = false;
  let privateKeyStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Private-key block handling (multi-line)
    if (inPrivateKeyBlock) {
      if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line)) {
        inPrivateKeyBlock = false;
        continue;
      }
      continue;
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
      inPrivateKeyBlock = true;
      privateKeyStartLine = i + 1;
      hits.push({
        path,
        line: privateKeyStartLine,
        rule: "private-key-block",
        preview: "-----BEGIN PRIVATE KEY-----<REDACTED-PRIVATE-KEY>-----END PRIVATE KEY-----"
      });
      redactedLines.push("# <REDACTED-PRIVATE-KEY-BLOCK>");
      continue;
    }

    // Skip comments
    if (/^\s*[#;]/.test(line)) {
      redactedLines.push(line);
      continue;
    }

    // Apply single-line rules — only one rule per line; first match wins.
    let result = line;
    for (const rule of RULES) {
      if (rule.name === "private-key-block" || rule.name === "private-key-line") continue;
      const m = rule.pattern.exec(result);
      if (!m) continue;

      // By convention, every rule's pattern has the secret-value as the SECOND
      // non-undefined capture group (group 1 = prefix, group 2 = value, group 3+ = suffix).
      // For tag-only rules where the whole match IS the secret, group 1 is empty
      // and group 2 holds the secret.
      const groups = m.slice(1);
      const nonEmpty = groups.map((v, i) => ({ v, i })).filter((g) => g.v !== undefined);
      if (nonEmpty.length < 2) continue;
      // Group 1 is the prefix to keep; group 2 is the value.
      const prefixGroup = nonEmpty[0];
      const valueGroup = nonEmpty[1];
      const value = valueGroup.v!;
      if (isPlaceholder(value)) continue;

      // Suffix = anything after the value (could be group 3, e.g. quotes/comments)
      const suffixParts = nonEmpty.slice(2).map((g) => g.v!).join("");

      // Build replacement using prefix + tag + suffix.
      // The matched substring may not be the entire line — replace just the matched span.
      const matchStart = m.index;
      const matchEnd = matchStart + m[0].length;
      const before = result.slice(0, matchStart);
      const after = result.slice(matchEnd);
      result = `${before}${prefixGroup.v ?? ""}<${rule.tag}>${suffixParts}${after}`;

      hits.push({
        path,
        line: i + 1,
        rule: rule.name,
        preview: result
      });
      break; // one rule per line
    }

    redactedLines.push(result);
  }

  return {
    redactedContent: redactedLines.join("\n"),
    hits
  };
}

/**
 * 路径黑名单：永远不应被采集 / 上传的配置文件路径前缀。
 * 即便用户明确指定也应跳过。
 */
const ABSOLUTE_BLACKLIST = [
  "/etc/shadow",
  "/etc/gshadow",
  "/etc/sudoers",       // 含密码 hash 时
  "/etc/ssl/private/",
  "/etc/pki/private/",
  "/etc/ssh/ssh_host_", // 主机私钥
  "/root/.ssh/id_",     // 私钥
  "~/.ssh/id_",
  "~/.aws/credentials",
  "~/.docker/config.json", // 含 registry auth
  "~/.kube/config",        // 含 cluster token
  "~/.netrc",
];

export function isPathBlacklisted(path: string): boolean {
  for (const prefix of ABSOLUTE_BLACKLIST) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}
