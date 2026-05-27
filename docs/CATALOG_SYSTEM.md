# Catalog System

Last updated: 2026-05-27

EnvForge's catalog is a Capability Catalog: a migration rule library, not a simple app market.

Catalog items describe how to detect, classify, migrate, validate, and roll back a software capability or profile.

## 1. Catalog Positioning

The catalog answers:

- How is this capability detected?
- Which evidence means the user actually uses it?
- Which config files matter?
- Which configs are default or custom?
- Which paths may contain secrets?
- Which data directories matter?
- Which references must be resolved?
- How is the migration verified?
- How can failure be rolled back?
- How does it map across distros?

## 2. Support Levels

| supportLevel | Meaning |
| :-- | :-- |
| detect-only | EnvForge can detect it but does not plan migration automatically |
| basic-migration | EnvForge can reinstall/recreate a package or runtime |
| managed-config | EnvForge understands config paths, validation, backup, and security notes |
| full-migration | EnvForge covers detect, intent, config, references, data strategy, validation, rollback, and cross-distro rules |

Recommended catalog split:

```text
10 full-migration
30 managed-config
75 detect-only/basic-migration
```

Prioritize deep support for nginx, docker, postgresql, mysql/mariadb, redis, nodejs/npm, python/pip/pipx, ssh, ufw, and fail2ban.

## 3. Catalog Schema V2

```yaml
id: nginx
kind: software
name: Nginx
capability: web-server.reverse-proxy
supportLevel: full-migration

detect: {}
intentSignals: {}
configs: {}
references: {}
data: {}
migrationCompleteness: {}
install: {}
validate: {}
rollback: {}
security: {}
crossDistro: {}
```

Required fields increase with support level:

| Field | detect-only | basic-migration | managed-config | full-migration |
| :-- | :--: | :--: | :--: | :--: |
| id/name/kind/capability | yes | yes | yes | yes |
| detect | yes | yes | yes | yes |
| install | no | yes | yes | yes |
| configs | no | optional | yes | yes |
| validate | no | optional | yes | yes |
| rollback | no | optional | yes | yes |
| data | no | no | optional | yes |
| references | no | no | optional | yes |
| migrationCompleteness | no | optional | yes | yes |
| security | yes | yes | yes | yes |
| crossDistro | optional | yes | yes | yes |

## 4. Example Rule

```yaml
id: nginx
kind: software
name: Nginx
capability: web-server.reverse-proxy
supportLevel: full-migration

detect:
  packages:
    apt: [nginx, nginx-full, nginx-extras]
    dnf: [nginx]
    pacman: [nginx]
    apk: [nginx]
  binaries: [nginx]
  systemd: [nginx.service]
  ports: [80, 443]

intentSignals:
  high: [serviceRunning, serviceEnabled, listeningPort, customConfig]
  medium: [packageMarkedManual, binaryExists]
  low: [packageInstalledOnly]

configs:
  files:
    - /etc/nginx/nginx.conf
    - /etc/nginx/mime.types
  globs:
    - /etc/nginx/conf.d/*.conf
    - /etc/nginx/sites-available/*
    - /etc/nginx/sites-enabled/*
  exclude:
    - "*.default"
  maxSizeKB: 512
  sensitivity: review
  secretPatterns:
    - ssl_certificate_key

references:
  parse:
    - directive: include
      type: configInclude
    - directive: root
      type: filesystemPath
    - directive: ssl_certificate_key
      type: secretFile
    - directive: proxy_pass
      type: serviceDependency

data:
  paths:
    - path: /var/www
      requiredForFunctionality: optional
      strategy: rsync-review

validate:
  preApply:
    - command: nginx -t
  postApply:
    - command: systemctl is-active nginx
    - command: curl -I http://localhost
      allowFailure: true

rollback:
  backupPaths: [/etc/nginx]
  restartServices: [nginx]

security:
  risk: review
  notes:
    - Nginx configs may reference TLS private keys.
```

## 5. Profiles

Profiles group capabilities:

```yaml
id: lemp-stack
kind: profile
name: LEMP Stack
includes:
  - nginx
  - mysql
  - php-fpm
supportLevel: managed-config
```

## 6. Authoring Rules

Catalog authors should include:

- detection through packages, binaries, services, ports, configs;
- intent signals;
- config files, globs, excludes, max size, sensitivity;
- reference parsing;
- data strategy;
- config-only completeness;
- validation commands;
- rollback rules;
- security risks;
- cross-distro mappings.

Do not mark stateful services as `full-migration` without data strategy. Do not recommend copying database data directories or `/var/lib/docker` by default.

## 7. LLM Expansion Prompt

When using an LLM to expand catalog rules, ask it to produce:

1. capability description;
2. cross-distro package names;
3. detection signals;
4. intent signals;
5. service names;
6. default config paths;
7. user-modified config paths;
8. data directories;
9. secret risks;
10. config references and dependencies;
11. config-only viability;
12. validate commands;
13. rollback guidance;
14. risk level;
15. support level.

Reject LLM output that only lists package names or install commands.

## 8. Cross-Distro Capability Mapping

Migrate capabilities, not package names:

```text
capability: web-server.nginx
Ubuntu/Debian -> apt install nginx
Rocky/Fedora -> dnf install nginx
Arch -> pacman -S nginx
Alpine -> apk add nginx
Docker mode -> generate compose/service
```

Compatibility levels:

| Level | Meaning |
| :-- | :-- |
| Level 1 | Same distro and same major version |
| Level 2 | Same distro, different version |
| Level 3 | Same distro family |
| Level 4 | Cross-family |
| Level 5 | Convert to containerized deployment |

Cross-distro mappings must cover package names, service names, init system, config paths, users/groups, data paths, firewall differences, SELinux/AppArmor, and validation commands.

## 9. Review Checklist

- Support level is honest.
- Detection has multiple signals.
- Manual package marker is not the only intent signal.
- Secret risks are documented.
- Data strategy exists for stateful software.
- Validation commands exist.
- Rollback behavior exists.
- Cross-distro package/service mappings exist.
