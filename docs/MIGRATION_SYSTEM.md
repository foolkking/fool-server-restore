# Migration System

Last updated: 2026-05-27

This is the main design document for EnvForge's migration engine. It consolidates the previous migration-system, inventory, package-intent, plan-engine, data-migration, unknown-review, verify, and rollback notes.

EnvForge uses a six-stage model:

```text
Discover -> Classify -> Plan -> Apply -> Verify -> Rollback
```

The product rule is simple: discover broadly, migrate cautiously, and explain every high-risk decision before applying it.

## 1. Six-Stage Flow

### Discover

Discover is read-only. It creates a `HostSnapshot` from the old VM through SSH.

Collectors gather:

- OS, distro family, version, architecture, kernel, init system.
- Package managers and packages: apt/dpkg, dnf/yum/rpm, pacman, apk, snap, flatpak, npm, pip, pipx, gem, cargo, go.
- Services: systemd units, timers, cron, supervisor, init.d, enabled/running state.
- Network: listening ports, processes, firewall state.
- Configs: catalog-known paths, `/etc`, systemd drop-ins, user dotfiles, Docker compose files, env files.
- Containers: compose projects, containers, volumes, networks, bind mounts, image list as supporting evidence.
- Manual artifacts: `/opt`, `/usr/local/bin`, `/usr/local/etc`, `~/.local/bin`, custom units.
- Security: sshd, ufw/firewalld, fail2ban, sudoers metadata, authorized keys metadata.

Discover must not modify the source host, read blocked secrets, read large data files by default, or treat Docker image lists as migration plans.

### Classify

Classify turns inventory into migration candidates.

```ts
type MigrationClass =
  | "managed-software"
  | "system-baseline"
  | "user-dotfile"
  | "service-config"
  | "language-global-package"
  | "container-workload"
  | "manual-install"
  | "unknown-review"
  | "do-not-migrate";
```

Classifiers include:

- Package Intent Score.
- Config ownership.
- Default-vs-custom detector.
- Secret detector.
- Migration completeness score.
- Risk score.
- Unknown Review Queue.

### Plan

Plan builds a reviewable `MigrationPlan`.

The plan must show:

- what was detected;
- why it matters;
- what will change on the target VM;
- what is risky or incomplete;
- what requires user confirmation;
- what validation will run;
- what rollback will do.

### Apply

Apply executes only approved actions on the target VM.

Backends:

- Native SSH executor.
- EnvForge JSON plan export.
- Ansible playbook export.
- Bash script export.
- Markdown report export.

### Verify

Verify runs catalog-defined checks:

- config syntax: `nginx -t`, `sshd -t`, `apachectl configtest`, `docker compose config`;
- service state: `systemctl is-active`, `systemctl is-enabled`;
- ports: `ss -tulpn`, `curl`, `nc`;
- app checks: `redis-cli ping`, `psql -c "select 1"`, `mysqladmin ping`, `docker info`.

### Rollback

Rollback follows:

```text
Plan -> Snapshot -> Apply -> Verify -> Commit / Rollback
```

Rollback restores file backups, package state, service enabled/running state, and configuration snapshots where possible. It removes only packages installed by EnvForge during the current plan.

## 2. HostSnapshot and Inventory Model

```ts
interface HostSnapshot {
  host: HostInfo;
  os: OSInfo;
  packageManagers: PackageManagerInfo[];
  packages: PackageRecord[];
  services: ServiceRecord[];
  configs: ConfigRecord[];
  users: UserRecord[];
  runtimes: RuntimeRecord[];
  containers: ContainerRecord[];
  manualArtifacts: ManualArtifactRecord[];
  network: NetworkRecord[];
  security: SecurityRecord[];
  collectionWarnings: CollectionWarning[];
}
```

### PackageRecord

```ts
interface PackageRecord {
  name: string;
  version?: string;
  manager: "apt" | "dpkg" | "dnf" | "yum" | "rpm" | "pacman" | "apk" | "snap" | "flatpak" | "npm" | "pip" | "pipx" | "gem" | "cargo" | "go" | "unknown";
  installReason?: "manual" | "auto" | "dependency" | "unknown";
  section?: string;
  priority?: string;
  essential?: boolean;
  source?: string;
  installedAt?: string;
  relatedServices?: string[];
  relatedConfigs?: string[];
  evidence: string[];
}
```

Package records describe what exists. They do not decide migration intent.

### ConfigRecord

```ts
interface ConfigRecord {
  path: string;
  exists: boolean;
  type: "file" | "directory" | "symlink" | "glob";
  ownerPackage?: string;
  owners?: ConfigOwner[];
  sizeBytes?: number;
  mode?: string;
  user?: string;
  group?: string;
  mtime?: string;
  sensitivity: "safe" | "review" | "secret" | "blocked";
  defaultStatus?: "default" | "modified" | "user-created" | "unknown";
  readStatus: "read" | "skipped-large" | "skipped-secret" | "permission-denied" | "not-found";
  evidence: string[];
}
```

### ServiceRecord

```ts
interface ServiceRecord {
  name: string;
  manager: "systemd" | "openrc" | "sysvinit" | "supervisor" | "cron" | "unknown";
  enabled?: boolean;
  running?: boolean;
  state?: string;
  unitPath?: string;
  dropIns?: string[];
  execStart?: string[];
  environmentFiles?: string[];
  ports?: number[];
  packageName?: string;
  evidence: string[];
}
```

## 3. Package Intent Score

Installed package list is not a migration list. Manual packages are signals, not user intent.

### Output Buckets

| Bucket | Meaning | Default behavior |
| :-- | :-- | :-- |
| high | Strong migration intent | recommend/include |
| medium | Likely useful | user review |
| low | Weak signal | collapsed |
| ignore | dependency/base package | hidden unless expanded |

### High Signals

- Catalog match.
- Service enabled or running.
- Listening port.
- Custom config.
- Data directory.
- Referenced by systemd, cron, Docker Compose, or config.

### Medium Signals

- `apt-mark showmanual`, dnf user-installed, or equivalent.
- Binary exists.
- Appears in PATH, alias, cron, or shell history.
- Language global package.

### Downranking

- `lib*`, `libc*`, `linux-image*`, `linux-headers*`, `firmware*`.
- Base image packages such as `base-files`, `ubuntu-minimal`, `cloud-init`.
- Essential packages.
- Auto-installed dependencies.

Dependencies should be resolved by the target package manager. If the user migrates nginx, EnvForge should plan `install nginx`, not separately migrate `libssl`, `zlib`, and `libpcre`.

## 4. Unknown Review Queue

Unknown items are neither ignored nor auto-migrated.

Sources:

- `/opt/*`;
- `/usr/local/bin/*`;
- `/usr/local/etc/*`;
- `~/.local/bin/*`;
- custom systemd units;
- unknown listening ports;
- cron scripts;
- unknown config directories;
- compose files outside known projects.

Decisions:

| Decision | Meaning |
| :-- | :-- |
| include | Add with generic or manual actions |
| exclude | Do not migrate |
| needs-rule | Create/request catalog rule |
| pending | Keep unresolved |

## 5. Migration Plan Engine

```ts
interface MigrationPlan {
  id: string;
  sourceHost: HostRef;
  targetHost?: HostRef;
  createdAt: string;
  compatibility: CompatibilityAssessment;
  items: MigrationPlanItem[];
  actions: MigrationAction[];
  risks: Risk[];
  completeness: MigrationCompletenessSummary;
  validation: ValidationPlan;
  rollback: RollbackPlan;
  exports: PlanExport[];
}
```

Action types:

- `installPackage`
- `copyFile`
- `editFile`
- `createDirectory`
- `enableService`
- `startService`
- `restartService`
- `runCommand`
- `transferData`
- `validate`
- `snapshot`

Every high-risk action must define dry-run, apply, verify, and rollback behavior.

## 6. Migration Completeness

Completeness asks whether the rebuilt item will actually work.

Components:

- package;
- config;
- data;
- users/roles;
- env files;
- certificates;
- external dependencies;
- service state;
- ports;
- validation.

Example:

```text
Nginx completeness: 70%
Missing:
- /var/www/app
- /etc/letsencrypt/live/example.com
- upstream service on 127.0.0.1:3000
```

## 7. Data Migration Strategy

Data is classified as:

- required;
- optional;
- rebuildable;
- not-recommended;
- unknown.

Database strategy:

- PostgreSQL: prefer `pg_dumpall`, `pg_dump`, `pg_restore`; do not rsync `/var/lib/postgresql` by default.
- MySQL/MariaDB: prefer `mysqldump` or `mariadb-dump`; do not copy live InnoDB files by default.
- Redis: inspect RDB/AOF usage and decide whether cache or primary data.
- SQLite: use backup API or copy only with app stopped and WAL awareness.

Docker strategy:

1. Prefer compose files.
2. Include `.env` files with secret review.
3. Track bind mounts.
4. Inventory named volumes.
5. Use image list only as supporting evidence.
6. Do not copy `/var/lib/docker` by default.

## 8. Verification and Rollback

Verification results:

```ts
interface VerificationResult {
  itemId: string;
  status: "passed" | "warning" | "failed" | "skipped";
  checks: VerificationCheckResult[];
}
```

Rollback rules:

- Files: restore backups.
- Packages: remove only packages EnvForge installed and that were absent before.
- Services: restore enabled/running state.
- Data: do not delete existing target data by default.
- SSH: validate with `sshd -t`, reload instead of restart, keep current session, use rollback timer, confirm reconnect.

## 9. Plan Invariants

- No high-risk operation without a plan.
- No secret copy by default.
- No database data directory copy by default.
- No unknown custom software auto-migration.
- No cross-distro conversion without capability mapping and risk labeling.
- No SSH daemon change without validation and rollback protection.
