# Config and Security Governance

Last updated: 2026-05-27

EnvForge treats configuration migration and editing as a governed change system, not a raw remote file browser.

The user should know where a file came from, who owns it, whether it is default or custom, whether it contains secrets, how to validate it, and how to roll it back.

## 1. Config Ownership

One config can have multiple owners:

```text
/etc/nginx/sites-available/app.conf
```

Potential owners:

- nginx;
- web-server profile;
- certbot;
- unknown app deployment.

```ts
interface ConfigOwnership {
  path: string;
  owners: Array<{
    id: string;
    type: "software" | "profile" | "unknown";
    confidence: number;
    reasons: string[];
  }>;
}
```

Ownership signals:

- catalog path/glob;
- package ownership (`dpkg -S`, `rpm -qf`);
- service unit references;
- `EnvironmentFile`;
- include directives;
- enabled symlinks;
- process command-line flags;
- common app directory conventions.

## 2. Default vs Custom Detection

```ts
type DefaultStatus = "default" | "modified" | "user-created" | "unknown";
```

Detection layers:

1. Package manager verification: `dpkg` conffile hashes, `debsums`, `rpm -V`.
2. File ownership: `dpkg -S`, `rpm -qf`.
3. Time comparison: mtime later than package install time.
4. Semantic normalized diff: ignore comments, blank lines, and harmless formatting where safe.

## 3. User Modification Evidence

Signals:

- package verification reports changed file;
- file is not owned by any package;
- file is in `conf.d`, `sites-available`, systemd drop-in, or include directory;
- mtime is later than package install time;
- file contains custom domain, path, port, upstream, or env reference;
- file is enabled by symlink;
- file is referenced by systemd or another config.

## 4. Secret Detection

Blocked paths:

- `/etc/shadow`
- `/etc/gshadow`
- `/etc/ssl/private/*`
- `/etc/machine-id`
- `~/.ssh/id_*`
- `~/.gnupg/*`
- private TLS keys

Content patterns:

- `PRIVATE KEY`
- `BEGIN OPENSSH PRIVATE KEY`
- `password=`
- `passwd=`
- `secret=`
- `token=`
- `api_key=`
- `access_key`
- `DATABASE_URL`
- `AWS_SECRET_ACCESS_KEY`

Catalog semantic risks:

- nginx `ssl_certificate_key`;
- Docker `auths`;
- npm token;
- pip index credentials;
- database URLs;
- SSH private keys.

Sensitivity:

| Level | Behavior |
| :-- | :-- |
| safe | can read and migrate |
| review | warn and require confirmation |
| secret | redact preview; do not migrate by default |
| blocked | do not read; do not migrate |

## 5. Safe Read and Preview

Rules:

- enforce catalog `maxSizeKB`;
- do not follow unsafe symlinks without review;
- return metadata even when content is skipped;
- redact secrets before preview;
- record read status: `read`, `skipped-large`, `skipped-secret`, `permission-denied`, `not-found`.

## 6. Editing Workflow

```text
Read -> Diff -> Backup -> Validate temporary file -> Write -> Verify -> Audit -> Rollback available
```

Validation examples:

- Nginx: `nginx -t`;
- SSH: `sshd -t`;
- Apache: `apachectl configtest`;
- Docker Compose: `docker compose config`.

## 7. SSH Safety

SSH config changes require special protection:

1. Backup existing file.
2. Write candidate to temporary path.
3. Run `sshd -t`.
4. Reload instead of restart when possible.
5. Keep current SSH session open.
6. Start optional rollback timer.
7. Confirm a new SSH connection works.
8. Commit only after reconnect succeeds.

## 8. Lightweight /etc Versioning

EnvForge should provide an etckeeper-inspired lightweight history:

- save snapshot before each write;
- record diff;
- record actor;
- record validation command;
- record service reload/restart;
- support rollback.

## 9. Audit and Immutability

Administrative audit logs should be append-only. Database-level triggers should reject updates and deletes. Audit entries should include:

- actor;
- action;
- target;
- old value hash or redacted diff;
- new value hash or redacted diff;
- timestamp;
- validation command;
- rollback reference.

## 10. UI Requirements

When opening a config file, show:

```text
/etc/nginx/nginx.conf

Source:
- discovered by nginx catalog rule
- nginx package installed
- nginx.service running
- file modified after package install

Risk:
- syntax errors can prevent nginx reload
- config may reference TLS private keys

Recommended validation:
- nginx -t
```

The UI should make dangerous choices explicit and reversible.
