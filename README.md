# EnvForge

EnvForge is a visual Linux VM environment migration and rebuild tool.

It analyzes an existing server over SSH, extracts the software capabilities, configuration files, service state, language runtimes, container workloads, and data dependencies that matter, then generates a reviewable, replayable, verifiable, and rollback-safe migration plan for rebuilding the environment on a new VM.

```text
Old VM -> Environment Snapshot -> Migration Plan -> New VM
```

EnvForge is not a general-purpose server control panel in the style of BaoTa, 1Panel, Cockpit, or a hosting dashboard. Its core job is not to install random software on a live server. Its core job is to understand an old Linux VM well enough to help a human rebuild it safely somewhere else.

## Product Principles

- Automatic discovery, cautious migration, human confirmation.
- Installed packages are not treated as user intent. EnvForge scores migration intent from multiple signals.
- The catalog is a migration rule library, not a simple app store.
- Every risky operation should be represented in a plan before it is applied.
- Secrets are not migrated by default; they must be redacted, reviewed, or explicitly confirmed.
- Data directories are not blindly copied; databases prefer logical dump and restore.
- Unknown software is not ignored and not automatically migrated. It enters a review queue.
- SSH configuration changes require special validation and rollback protection.

## Core Capabilities

- **SSH discovery**: read-only source host collection through a shell collector.
- **Inventory model**: packages, services, configs, users, runtimes, containers, network, security, and manual artifacts.
- **Package Intent Score**: distinguishes real migration candidates from base packages, dependencies, and image noise.
- **Config governance**: ownership, default-vs-custom detection, secret scanning, safe read, diff, backup, and validation hooks.
- **Capability Catalog**: software/profile migration rules with detect, config, data, validate, rollback, and cross-distro metadata.
- **Migration planning**: action graph, risk score, migration completeness score, dry run, and review decisions.
- **Apply / Verify / Rollback**: SSH executor, safe sudo writes, file backups, service state capture, validation checks, and rollback plans.
- **Community ecosystem**: comments, suggestions, moderation, in-app inbox, and email notification preferences for catalog evolution.

## Documentation Map

| Document | Purpose |
| :-- | :-- |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Product positioning, scope, users, non-goals, and roadmap |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Six-stage architecture and module boundaries |
| [docs/MIGRATION_SYSTEM.md](./docs/MIGRATION_SYSTEM.md) | Inventory, package intent, review queue, plan engine, data strategy, verify, rollback |
| [docs/CATALOG_SYSTEM.md](./docs/CATALOG_SYSTEM.md) | Capability Catalog, support levels, schema v2, authoring, LLM prompt, cross-distro mapping |
| [docs/CONFIG_AND_SECURITY.md](./docs/CONFIG_AND_SECURITY.md) | Config ownership, default detection, secrets, safe editing, audit, SSH protection |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phased implementation plan and long-term scaling |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Deployment guide |
| [docs/DEPLOY_SELF.md](./docs/DEPLOY_SELF.md) | Self-hosting and bootstrap deployment notes |

## Technology

- Frontend: React 18, TypeScript, Vite, lucide-react
- Backend: Fastify, TypeScript, ssh2
- Storage: SQLite hybrid document/relational persistence
- Execution: TypeScript-native playbook and SSH execution modules
- Security: scrypt password hashing, AES-256-GCM credential encryption

## Build

```bash
npm run build:server
npm run build --workspace @fool/web
```

## License

MIT
