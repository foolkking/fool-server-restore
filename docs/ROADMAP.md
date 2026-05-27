# Roadmap

Last updated: 2026-05-27

This roadmap aligns implementation work with EnvForge's new positioning as a Linux VM environment migration and rebuild platform.

## Phase 1: Documentation and Models

Status: in progress

Goals:

- Define product positioning.
- Consolidate documentation.
- Define HostSnapshot.
- Define Package Intent Score.
- Define Catalog Schema V2.
- Define MigrationPlan.

Deliverables:

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `MIGRATION_SYSTEM.md`
- `CATALOG_SYSTEM.md`
- `CONFIG_AND_SECURITY.md`
- `ROADMAP.md`

## Phase 2: Ten Deep Catalog Rules

Prioritize depth before breadth:

1. nginx
2. docker
3. postgresql
4. mysql/mariadb
5. redis
6. nodejs/npm
7. python/pip/pipx
8. ssh
9. ufw
10. fail2ban

Each should support:

- detect;
- intent signals;
- config ownership;
- default/custom detection;
- secret scan;
- data dependency;
- validate;
- rollback.

## Phase 3: Package Intent Score MVP

Implement:

- manual/auto package recognition;
- service association;
- config association;
- port association;
- catalog association;
- base/dependency downranking;
- high/medium/low/ignore UI grouping.

## Phase 4: Config Governance MVP

Implement:

- config ownership;
- default-vs-custom detector;
- secret scanner;
- safe read;
- diff;
- backup;
- validate hook;
- rollback preview.

Special handling:

- SSH config guardrails;
- blocked secret paths;
- max file size;
- redacted previews.

## Phase 5: Migration Plan Engine

Implement:

- Plan JSON;
- action graph;
- dependency graph;
- risk score;
- completeness score;
- user approval;
- dry run;
- export formats.

Exports:

- EnvForge plan;
- Ansible playbook;
- Bash script;
- Markdown report.

## Phase 6: Apply, Verify, Rollback

Implement:

- SSH executor;
- safe sudo write;
- file backup;
- package install;
- service enable/restart;
- validate hooks;
- rollback actions;
- execution result report.

## Phase 7: Review Queue and Catalog Feedback Loop

Implement:

- Unknown Review Queue UI.
- Unknown service/custom binary/manual install detection.
- Create catalog suggestion from unknown item.
- Admin review of contributed rules.
- Support-level audit for all catalog items.

## Phase 8: Long-Term Scaling

The current SQLite hybrid engine should remain the default for self-hosted single-node deployments. Long-term scaling should be enabled through interface boundaries rather than rewrites.

Subsystem interfaces:

- `CommentRepository`
- `NotificationQueueProvider`
- `SearchProvider`
- `ModerationProvider`
- core runtime repository

Potential future backends:

| Domain | Current | Future |
| :-- | :-- | :-- |
| Core runtime state | SQLite `system_kv` | PostgreSQL |
| Comments/reports | SQLite relational tables | PostgreSQL partitioned tables |
| Queues | SQLite/background worker | Redis/BullMQ or PostgreSQL queue |
| Search | SQLite/basic search | Meilisearch |
| Analytics/audit reporting | SQLite | ClickHouse |

Scaling triggers:

| Indicator | SQLite target limit | Future action |
| :-- | :-- | :-- |
| Market comments | 1,000,000 records | move comments to PostgreSQL |
| Daily writes | 50,000/day | move queue/comments to PG/Redis |
| Write concurrency | 50 writes/sec | introduce external lock/queue backend |
| Queue backlog | 100,000 pending | move queue to Redis |

## Operational SOPs

### WAL Bloat

Cause: long-running transaction or heavy write load.

Action:

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

Then inspect active workers and SSH tasks.

### Search Index Drift

Cause: indexing worker crash or interrupted FTS sync.

Action:

```sql
UPDATE fts_sync_queue SET status = 'pending', attempts = 0 WHERE status = 'failed';
```

Then trigger re-index through scheduler.

### Queue Backlog

Cause: SMTP outage, external provider timeout, traffic flood, or dead-letter accumulation.

Action:

```sql
SELECT status, COUNT(*) FROM notification_queue GROUP BY status;
```

Resolve provider issue before retrying dead-letter items.

## Definition of Done

EnvForge reaches the new product target when it can:

- show high/medium/low/ignored migration candidates;
- explain why each candidate exists;
- generate a migration plan;
- identify incomplete migration risks;
- protect secrets by default;
- validate applied changes;
- roll back failed changes;
- export useful artifacts.
