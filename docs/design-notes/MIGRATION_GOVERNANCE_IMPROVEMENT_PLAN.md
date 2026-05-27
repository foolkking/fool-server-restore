# EnvForge Migration & Configuration Governance Improvement Plan

Last updated: 2026-05-27

## 1. Product Positioning

EnvForge should evolve from "scan Linux packages and edit remote config files" into:

> A visual Linux VM migration and configuration governance platform. EnvForge discovers the real state of a source machine over SSH, classifies software intent, configuration ownership, service usage, runtime packages, containers, and user dotfiles, then builds an auditable, replayable, exportable, and rollback-aware migration plan for a target VM.

The key shift is:

- Old model: installed packages = migration list.
- New model: discovered host state -> intent scoring -> migration candidates -> reviewed plan -> apply -> verify.

## 2. Core Problem

`apt-mark showmanual`, `dpkg-query`, and `rpm -qa` are inventory signals, not user-intent signals.

Manual package marks are dependency-management metadata. They can be polluted by cloud images, metapackages, distribution defaults, and base-image choices. EnvForge must therefore stop treating a raw installed package list as the migration truth.

## 3. Package Intent Score

Every discovered package or artifact gets a `Package Intent Score`.

| Signal | Meaning | Weight |
|---|---|---:|
| Catalog managed software match | EnvForge knows how to manage it | High |
| Service package + systemd enabled/running | Probably actively used | High |
| Non-default config exists or changed | User invested configuration effort | High |
| Data directory, socket, or listening port | Runtime evidence | Medium-high |
| `apt-mark showmanual` / manual package mark | Possible user action | Medium |
| Raw `dpkg` / `rpm` package only | Inventory fact only | Low |
| Base image / cloud-init / `linux-*` / `lib*` / firmware | Low migration value | Downrank |
| Language ecosystem global package | Separate runtime intent | Medium |

The UI should group candidates as:

- High confidence migration.
- Medium confidence migration.
- Low confidence / review.
- Do not migrate.

## 4. Three-Layer Detection Model

### Layer 1: Known Managed Software

Known software lives in catalog detection rules. Example:

```yaml
id: nginx
detect:
  packages:
    apt: [nginx, nginx-full, nginx-extras]
    rpm: [nginx]
  binaries: [nginx]
  systemd: [nginx.service]
  ports: [80, 443]
config:
  files:
    - /etc/nginx/nginx.conf
    - /etc/nginx/mime.types
  globs:
    - /etc/nginx/conf.d/*.conf
    - /etc/nginx/sites-available/*
    - /etc/nginx/sites-enabled/*
  exclude:
    - /etc/nginx/*.default
  maxSizeKB: 256
  secretPatterns:
    - ssl_certificate_key
    - password
    - token
migrate:
  strategy: template-or-copy
  restartServices: [nginx]
  validate:
    - nginx -t
```

This layer is responsible for precise migration.

### Layer 2: Generic Detectors

Generic detectors catch software outside the catalog:

- `/usr/local/bin/*`
- `~/.local/bin/*`
- `/opt/*`
- custom systemd units
- Docker compose files
- npm / pipx / pip user / cargo global packages
- cron jobs and user timers

This layer is responsible for recall.

### Layer 3: Unknown Review Queue

Unknown artifacts should not be silently migrated. They become review items:

- Unknown service: `caddy-custom.service`
- Unknown binary: `/usr/local/bin/frp`
- Suspected config directory: `/etc/frp`

The user must confirm config paths, data paths, and migration strategy.

## 5. Configuration Rule Schema

Config file discovery must move away from TypeScript hardcoded maps and into catalog-style rules. TypeScript executes rules; catalog describes software.

Rule fields:

- `detect.packages`
- `detect.binaries`
- `detect.systemd`
- `detect.ports`
- `config.files`
- `config.globs`
- `config.exclude`
- `config.maxSizeKB`
- `config.secretPatterns`
- `data.paths`
- `migrate.strategy`
- `migrate.restartServices`
- `migrate.validate`

Benefits:

- Software knowledge becomes extensible.
- Community suggestions can include detection/config rules.
- Migration and config editor can explain file ownership.
- Validation and restart behavior becomes software-specific.

## 6. Five-Stage Migration Flow

### 6.1 Discover

Collect host state:

```ts
interface HostSnapshot {
  os: OSInfo;
  packages: PackageInventory;
  services: ServiceInventory;
  configs: ConfigInventory;
  users: UserInventory;
  languageRuntimes: RuntimeInventory;
  containers: ContainerInventory;
  network: NetworkInventory;
  security: SecurityInventory;
  manualArtifacts: ManualArtifactInventory;
}
```

Default backend remains SSH shell collection. Optional future backend: osquery when the user permits it.

### 6.2 Classify

Convert inventory into migration candidates:

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

Docker policy:

1. Prefer `docker-compose.yml` / `compose.yaml`.
2. Then systemd services invoking Docker.
3. Then container inspect metadata.
4. Treat image lists as weak evidence only.

### 6.3 Plan

Build an auditable plan:

```yaml
items:
  - id: nginx
    type: managed-software
    confidence: 0.94
    actions:
      - installPackage: { manager: apt, name: nginx }
      - copyConfig: { from: /etc/nginx/nginx.conf, to: /etc/nginx/nginx.conf, backup: true }
      - validate: { command: nginx -t }
      - restart: { service: nginx }
    risks:
      - May overwrite existing Nginx configuration
    userDecision: pending
```

### 6.4 Apply

Execution backends:

- Native SSH Executor.
- Ansible export.
- Bash script export.
- Markdown report export.

### 6.5 Verify

Each capability has validation hooks:

- Nginx: `nginx -t`, `systemctl is-active nginx`, optional `curl -I`.
- PostgreSQL: `systemctl is-active postgresql`, `psql -c "select version();"`.
- Docker: `docker version`, `docker compose version`.

## 7. Configuration Governance

The config editor should become a governance system:

- Explain why a file was discovered.
- Show owner software/profile and confidence.
- Detect secrets by content patterns, not only path.
- Generate diff before save.
- Validate edited config before final write.
- Backup and rollback every write.
- Store operator, command, timestamp, and diff.

SSH config writes require special handling:

1. Backup.
2. `sshd -t`.
3. Reload, not restart.
4. Keep current session open.
5. Future: optional automatic rollback timer.

## 8. Capability Market

The catalog should be understood as a Capability Market:

- `software`: single software capability.
- `profile`: composed capability bundle.
- `migration-rule`: discovery/config/validation rules for migration.

Users want outcomes: Docker environment, LEMP stack, SSH hardening, PostgreSQL database, monitoring stack. They do not primarily want raw package names.

## 9. MVP Priority

Deep support first:

1. nginx
2. docker
3. postgresql
4. mysql / mariadb
5. redis
6. nodejs / npm
7. python / pip / pipx / pyenv
8. ssh / ufw / fail2ban

For each:

- detect
- config paths
- default config detection
- secret scan
- migration plan
- apply
- validate
- rollback

## 10. Implementation Phases

### Phase A: Foundation

- Add catalog rule schema.
- Add MVP software rules.
- Add package intent classifier.
- Add migration candidate API.
- Change config discovery to use rules.

### Phase B: Plan Builder

- Generate reviewed migration plans.
- Group high/medium/low/do-not-migrate.
- Add reasons and risks.

### Phase C: Governance Editor

- Source explanation.
- Secret detection.
- Validate hooks.
- Versioned config writes.

### Phase D: Exporters

- EnvForge plan JSON.
- Ansible playbook.
- Bash script.
- Markdown report.

### Phase E: UI

- Machine snapshot page.
- Migration candidates page.
- Config ownership page.
- Migration plan view.
- Execution result and rollback view.
