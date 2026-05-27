# EnvForge Architecture

Last updated: 2026-05-27

EnvForge is organized around a six-stage migration architecture:

```text
Discover -> Classify -> Plan -> Apply -> Verify -> Rollback
```

This architecture replaces the older mental model of "server management panel + package installer." The system is built to extract an old Linux VM into a normalized model, classify what matters, and produce a safe migration plan for rebuilding a target VM.

## System Boundaries

EnvForge owns:

- SSH-based host collection.
- Normalized inventory modeling.
- Package intent scoring.
- Configuration ownership and secret-aware governance.
- Capability catalog rules.
- Migration plan generation.
- SSH execution and artifact export.
- Validation and rollback orchestration.

EnvForge does not own:

- Full disk image backup.
- Secret vault lifecycle.
- Kubernetes cluster management.
- Cloud provider VM provisioning.
- Arbitrary database replication.

## High-Level Modules

```text
apps/api/src/
  collector/
    shell-collector.ts
    os-detector.ts
    package-collector.ts
    service-collector.ts
    config-collector.ts
    container-collector.ts
    language-runtime-collector.ts
    manual-artifact-collector.ts

  inventory/
    inventory-model.ts
    normalize-packages.ts
    normalize-services.ts
    normalize-configs.ts
    normalize-containers.ts

  catalog/
    software/
    profiles/
    schemas/
    catalog-loader.ts
    capability-resolver.ts

  classifier/
    package-intent-score.ts
    config-ownership.ts
    default-config-detector.ts
    secret-detector.ts
    migration-completeness.ts
    risk-score.ts

  planner/
    migration-plan-builder.ts
    action-graph.ts
    dependency-graph.ts
    target-diff.ts
    dry-run.ts

  executor/
    ssh-executor.ts
    file-transfer.ts
    sudo-safe-write.ts
    service-manager.ts
    package-manager.ts

  verifier/
    validate-hooks.ts
    service-checks.ts
    port-checks.ts
    config-syntax-checks.ts
    health-checks.ts

  rollback/
    snapshot-manager.ts
    file-backup.ts
    package-rollback.ts
    service-state-rollback.ts
    rollback-plan.ts
```

Some of these modules already exist in earlier or partial form under current files such as `config-files.ts`, `migration-classifier.ts`, `migration-dry-run.ts`, `migration-exporter.ts`, `migration-verify.ts`, `runtime-store.ts`, and `routes.ts`. The target architecture should gradually split large files into these boundaries.

## Stage 1: Discover

Discover is a read-only source-host collection stage.

Collectors produce raw observations:

- OS and kernel information.
- Package manager state.
- Installed packages and install reasons.
- Services, timers, cron, open ports, and listening processes.
- Known catalog config paths.
- Common `/etc`, dotfile, systemd, Docker, and language runtime config paths.
- Container images, containers, compose files, volumes, networks, bind mounts.
- Manual artifacts in `/opt`, `/usr/local`, `~/.local/bin`, custom unit files.
- Security-relevant state such as sshd, ufw/firewalld, fail2ban, sudoers, authorized keys.

Discover must not:

- modify the source host;
- read blocked secret files;
- read large data directories by default;
- treat Docker image lists as migration plans;
- copy database data directories.

Output: `HostSnapshot`.

## Stage 2: Classify

Classify turns raw inventory into migration candidates.

Main classifiers:

- `PackageIntentScore`: scores whether a package is likely user-intended.
- `ConfigOwnership`: maps config paths to software/profile owners.
- `DefaultConfigDetector`: detects default, modified, user-created, or unknown configs.
- `SecretDetector`: classifies safe, review, secret, and blocked files.
- `MigrationCompleteness`: determines whether package/config/data/users/certs/env/service state are sufficient.
- `RiskScore`: assigns operation and compatibility risk.

Output: migration candidates with confidence, evidence, risks, and default decisions.

## Stage 3: Plan

Plan builds a user-reviewable migration plan.

A plan contains:

- source host and target host metadata;
- selected migration candidates;
- action graph;
- dependencies;
- risk score;
- migration completeness score;
- validation hooks;
- rollback hooks;
- user decisions;
- export artifacts.

Actions include:

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
- `rollback`

Output: `MigrationPlan`.

## Stage 4: Apply

Apply executes user-approved plan actions against the target VM.

Execution backends:

- Native SSH executor.
- EnvForge plan export.
- Ansible playbook export.
- Bash script export.
- Markdown report export.

Apply must record:

- files changed;
- packages installed by EnvForge;
- service state before changes;
- backups and snapshots;
- command output;
- failures and retry state.

## Stage 5: Verify

Verify runs catalog-defined checks:

- config syntax checks such as `nginx -t`, `sshd -t`, `apachectl configtest`;
- service state checks such as `systemctl is-active`;
- port checks such as `ss -tulpn`;
- app checks such as `redis-cli ping`, `psql -c "select 1"`, `docker compose config`;
- HTTP checks such as `curl -I http://localhost`.

Verification should distinguish:

- passed;
- warning;
- failed;
- skipped;
- manual-review-required.

## Stage 6: Rollback

Rollback restores the target VM to its pre-apply state as far as safely possible.

Rules:

- Restore file backups for modified files.
- Remove only packages installed by EnvForge during this plan.
- Restore service enabled/running state.
- Restore config snapshots.
- Do not automatically delete data unless it is clearly temporary and created by this plan.
- SSH config changes require extra protection: pre-validate with `sshd -t`, reload instead of restart where possible, keep current session, and use an auto-rollback timer.

## Storage Architecture

EnvForge uses a SQLite hybrid persistence model:

- Document-style `system_kv` for core runtime state and backward compatibility.
- Relational tables for comments, suggestions, inbox messages, audit logs, queues, reports, and background task metadata.

This model supports ACID updates while keeping the earlier runtime document shape manageable.

## Frontend Architecture

Frontend UI should map to the migration workflow:

- Machine Snapshot
- Migration Candidates
- Config Governance
- Migration Plan
- Execution Result
- Capability Catalog
- Account and Inbox

The UI should make evidence visible. A user should see why EnvForge thinks an item matters, what will happen, what is risky, and how rollback works.

## Testing Strategy

Core test groups:

- collector parsing tests;
- inventory normalization tests;
- package intent scoring tests;
- config ownership and secret detection tests;
- migration plan builder tests;
- dry-run and exporter tests;
- verifier tests;
- rollback tests;
- SQLite persistence and queue tests.

Build verification:

```bash
npm run build:server
npm run build --workspace @fool/web
```

## Long-Term Scaling

The default deployment remains a single-node self-hosted server backed by SQLite. Scaling should be achieved through strict subsystem boundaries, not through business-logic rewrites.

Long-term provider interfaces:

```ts
interface CommentRepository {
  getComments(catalogId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<unknown>;
  addComment(userId: string, catalogId: string, content: string): Promise<unknown>;
  toggleLike(commentId: string, userId: string): Promise<boolean>;
  reportComment(commentId: string, userId: string, reason: string): Promise<void>;
}

interface NotificationQueueProvider {
  push(userId: string, type: "email" | "inbox", payload: unknown): Promise<void>;
  processNext(): Promise<boolean>;
  getQueueMetrics(): Promise<{ pending: number; failed: number }>;
}

interface SearchProvider {
  indexComment(commentId: string, content: string): Promise<void>;
  deindexComment(commentId: string): Promise<void>;
  searchComments(query: string, limit: number): Promise<string[]>;
  searchCatalog(query: string): Promise<string[]>;
}
```

Future backend targets:

| Domain | Current | Future |
| :-- | :-- | :-- |
| Core runtime state | SQLite `system_kv` | PostgreSQL |
| Comments and reports | SQLite relational tables | PostgreSQL partitioned tables |
| Queue processing | SQLite/background worker | Redis or PostgreSQL queue |
| Search | SQLite/basic indexes | Meilisearch |
| Analytics and audits | SQLite | ClickHouse |

Scaling triggers and operational SOPs are tracked in [ROADMAP.md](./ROADMAP.md).
