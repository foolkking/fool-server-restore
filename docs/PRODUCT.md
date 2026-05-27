# EnvForge Product Positioning

Last updated: 2026-05-27

EnvForge is a Linux VM environment migration, rebuild, and configuration governance platform.

It connects to an old Linux VM over SSH, collects a read-only environment snapshot, identifies the software capabilities and configuration changes that matter, and generates a migration plan that can be reviewed, replayed, verified, and rolled back before rebuilding the environment on a new VM.

```text
Old Linux VM
  -> Discover host state
  -> Classify real migration intent
  -> Build reviewable migration plan
  -> Apply to new VM
  -> Verify
  -> Rollback if needed
```

## What EnvForge Is

EnvForge is a tool for turning an existing Linux VM into a safe, explainable, rebuildable migration plan.

The user problem is usually not "install nginx". The user problem is:

- Which packages on this old VM are actually part of the environment?
- Which packages are just base image noise or dependencies?
- Which configuration files were changed by the user?
- Which files contain secrets and cannot be copied blindly?
- Which services need data migration, not just config migration?
- Which parts of the environment can be rebuilt on a different distro?
- How do we verify the new VM behaves like the old one?
- How do we roll back safely if the migration fails?

EnvForge solves this through inventory modeling, intent scoring, configuration governance, catalog rules, migration planning, verification, and rollback.

## What EnvForge Is Not

EnvForge is not a generic server control panel.

It should not be positioned as a replacement for BaoTa, 1Panel, Cockpit, cPanel, Webmin, or a hosting dashboard. Those products focus on day-to-day server administration, app installation, file browsing, databases, websites, and runtime operations. EnvForge focuses on environment extraction and rebuild.

EnvForge also does not promise 100% fully automatic migration of every Linux machine. Linux hosts can contain hand-built binaries, undocumented scripts, secrets, external databases, local state, custom kernels, and hidden operational knowledge. EnvForge's promise is human-assisted migration:

- discover as much as possible automatically;
- explain what was found;
- score confidence and risk;
- ask for confirmation where the system is uncertain;
- produce artifacts that can be reviewed and replayed.

## Core Scenario

The primary scenario is old VM to new VM migration:

1. The user connects EnvForge to an old source VM.
2. EnvForge collects a read-only HostSnapshot.
3. EnvForge classifies packages, services, configs, runtimes, containers, data paths, and unknown artifacts.
4. EnvForge generates migration candidates with confidence levels.
5. The user reviews high, medium, low, ignored, and unknown items.
6. EnvForge builds a migration plan for a target VM.
7. The user confirms plan items and risks.
8. EnvForge applies the plan through SSH or exports it as an EnvForge plan, Ansible playbook, Bash script, or Markdown report.
9. EnvForge runs validation hooks.
10. If verification fails, EnvForge rolls back files, packages, and service state where possible.

## Product Philosophy

### Automatic Discovery, Cautious Migration

EnvForge should collect broadly but migrate conservatively. It is acceptable to discover 900 packages, but not acceptable to present 900 packages as "things the user wants to migrate."

### Installed Does Not Mean Intended

`apt-mark showmanual`, `dpkg-query`, `rpm -qa`, `pacman -Q`, and language package managers are signals, not final decisions. EnvForge uses Package Intent Score to infer likely user intent.

### Catalog as Capability Rules

The catalog is not an app store. It is a rule library describing capabilities:

- how to detect software;
- how to decide whether it is migration-worthy;
- where its configs live;
- which configs are default or custom;
- which data paths matter;
- which references must be resolved;
- how to validate and roll back.

### Human-in-the-Loop by Design

Unknown software, custom scripts, `/opt` installs, private binaries, suspicious secrets, and cross-distro uncertainty should enter Review Queue. EnvForge should not silently ignore them or migrate them without confirmation.

## User Roles

| Role | Need |
| :-- | :-- |
| Individual developer | Rebuild a personal VPS or dev server on a new VM |
| Homelab operator | Understand what matters on an old server before replacing it |
| Small team admin | Standardize migration reports and reduce undocumented manual work |
| Platform engineer | Export reproducible migration plans and review risky changes |
| Catalog contributor | Add high-quality capability rules for software and profiles |

## Primary UI Areas

| Area | Purpose |
| :-- | :-- |
| Machine Snapshot | OS, package managers, services, ports, containers, runtimes, security, and warnings |
| Migration Candidates | High, medium, low, ignored, and review-queue items |
| Configuration Governance | Config ownership, default/custom status, secret status, diff, edit, validate, backup |
| Migration Plan | Actions, risk, completeness, dependencies, target compatibility, user decisions |
| Execution Result | Apply logs, validation checks, failed items, rollback availability, export report |
| Capability Catalog | Software/profile rules, support level, comments, suggestions, admin review |
| Account / Inbox | User identity, notification preferences, suggestion feedback, moderation notices |

## Non-Goals

- Full disk image backup and restore. Use Restic, Borg, snapshots, or cloud image tools.
- Secret vault replacement. EnvForge may integrate with secret managers later, but does not store arbitrary production secrets by default.
- Kubernetes platform management. EnvForge may detect Kubernetes tools, but is not Argo CD, Flux, Rancher, or a cluster control plane.
- Browser password, desktop app, or personal device migration.
- Blind copying of database data directories.
- Blind copying of `/var/lib/docker`.
- Direct shell terminal replacement. Logs and controlled commands are preferred over a raw shell-first UX.

## Success Metrics

EnvForge is successful when a user can answer:

- What is actually worth migrating from this VM?
- Why does EnvForge think this item matters?
- What will be changed on the target VM?
- What is risky or incomplete?
- Which secrets or data paths need manual handling?
- How can I verify the rebuilt environment?
- How can I roll back if something breaks?

## Product Roadmap Themes

1. Deep catalog support for 10 core capabilities: nginx, docker, postgresql, mysql/mariadb, redis, nodejs/npm, python/pip/pipx, ssh, ufw, fail2ban.
2. Package Intent Score MVP.
3. Config Ownership Graph and Default-vs-Custom Detector.
4. Secret-aware safe read, preview, edit, and migration.
5. Migration Completeness Score and Review Queue.
6. Plan / Apply / Verify / Rollback engine.
7. Exportable artifacts: EnvForge plan, Ansible playbook, Bash script, Markdown report.
