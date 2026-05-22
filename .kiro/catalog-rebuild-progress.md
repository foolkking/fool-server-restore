# Catalog 重建进度清单

> 把 70 个 catalog 项的 md guide / playbook YAML / vars schema 全部做扎实。
> 每个项目都基于网上权威信息（官方文档优先）生成。完成一个删一个。

## 标记说明

- `[ ]` 未开始
- `[~]` 进行中（基础有，但需要按本次标准重做）
- `[x]` 完成（md/playbook/schema 三件套都按本次标准做完）
- `[md]` 仅升级 md
- `[pb]` 仅升级 playbook
- `[s]` 加 schema
- `[no-schema]` 此项不需要 schema（命令行工具/简单包，无配置面）

## 第 1 批：高配置面服务（database / web / message broker） — 优先

每个都需要 schema：

- [x] nginx-web-service ← 已完成
- [x] x-ui-panel ← 已完成
- [x] postgres-profile (PostgreSQL) ← ✓ batch1
- [x] redis-server (Redis) ← ✓ batch1
- [x] mysql-server (MySQL) ← ✓ batch1
- [x] mariadb (MariaDB) ← ✓ batch1
- [x] mongodb (MongoDB) ← ✓ batch1
- [x] elasticsearch (Elasticsearch) ← ✓ batch1
- [x] memcached (Memcached) ← ✓ batch1
- [x] sqlite (no-schema, CLI tool) ← ✓ batch1

## 第 2 批：网络/安全（部分需要 schema）

- [x] fail2ban-protection ← ✓ batch2
- [x] certbot-ssl ← ✓ batch2
- [x] wireguard-vpn ← ✓ batch2
- [x] openvpn-server ← ✓ batch2
- [x] traefik-proxy ← ✓ batch2
- [x] haproxy-lb ← ✓ batch2
- [x] firewalld (no-schema) ← ✓ batch2
- [x] firewall-baseline (combo, no-schema) ← ✓ earlier
- [x] ssh-hardening (combo + schema) ← ✓ batch2
- [x] security-baseline (combo, no-schema) ← ✓ batch2
- [x] samba-share ← ✓ batch2
- [x] openresty ← ✓ batch2
- [x] vault-secrets ← ✓ batch2
- [x] nethogs-bandwidth (no-schema) ← ✓ batch2

## 第 3 批：服务面板/监控

- [x] grafana-dashboard (Grafana — schema: admin pw, http_port)
- [x] prometheus-monitoring (Prometheus — schema: retention, listen addr, scrape interval)
- [x] netdata-monitoring (Netdata — schema: bind addr, history)
- [x] zabbix-monitoring (Zabbix Agent — schema: server addr, hostname)
- [x] loki-logging (Loki — schema: http port, retention)
- [x] cockpit-panel (Cockpit — no-schema, just installs)
- [x] minio-storage (MinIO — schema: data dir, root user, root password, console port)
- [x] mosquitto-mqtt (Mosquitto — schema: port, password file, allow anonymous)
- [x] rabbitmq (RabbitMQ — schema: management port, default user/pass)
- [x] nextcloud (Nextcloud — schema: admin user/pw, db type, data dir)
- [x] gitea-server (Gitea — schema: domain, http port, db type)
- [x] jellyfin-media (Jellyfin — schema: server name, http port)
- [x] portainer (Portainer — schema: edition CE/BE, http port)

## 第 4 批：开发工具/运行时（多数 no-schema）

Runtime（运行时类，多数 no-schema）：
- [x] node-runtime-profile (no-schema; just installs)
- [x] python-toolchain (no-schema)
- [x] golang-runtime (no-schema)
- [x] openjdk-runtime (no-schema; perhaps schema for jdk version choice)
- [x] rust-toolchain (no-schema)
- [x] nodejs-version-mgr (NVM — schema: default node version)
- [x] pyenv-toolchain (pyenv — schema: default python version)
- [x] dotnet-runtime (no-schema)
- [x] php-toolchain (no-schema unless extension list)
- [x] ruby-toolchain (no-schema)
- [x] flutter-sdk (no-schema)

Developer tools（多数 no-schema）：
- [x] git-version-control (schema: git user.name, user.email)
- [x] htop-tools (no-schema)
- [x] zsh-shell (no-schema)
- [x] neovim-editor (no-schema)
- [x] tmux-multiplex (no-schema)
- [x] ansible-tool (no-schema)
- [x] code-server (schema: bind addr, password)
- [x] fish-shell (no-schema)
- [x] jenkins-ci (schema: http port, java memory)
- [x] gitlab-runner (schema: gitlab URL, registration token, executor)
- [x] terraform-iac (no-schema)
- [x] sonarqube (schema: http port, db, admin pw)
- [x] rust-cli-tools (no-schema)
- [x] swap-config (schema: size in GB, swappiness)
- [x] rsync-tools (no-schema)
- [x] kubernetes-tools (no-schema; client tools only)
- [x] docker-host-profile (schema: registry mirrors, data root)
- [x] nodejs-pm2 (schema: app name, app file, instances)

## 第 5 批：组合 (combo)

- [x] lamp-stack (combo)
- [x] lemp-stack (combo)
- [x] docker-compose-dev (combo)
- [x] node-production-deploy (combo)

## 验证

每批结束后跑：
- `npm run audit:catalog` 应当 0 errors / 0 warnings
- `npm run build --workspace @fool/api && node --test apps/api/dist/engine/tests/*.test.js`
- 每个新 schema 至少做一次 `buildPlaybookPreview` 通路测试（在 catalog-preview.test.ts 加）

## 备注

- 信息来源优先级：官方文档 > 包管理器仓库 > 社区共识 (最近 2 年)
- Playbook 必须支持 RHEL/Anolis 跨发行版（用 PACKAGE_ALIASES）
- verify 块至少 1 条对应主能力的健康检查
- 所有 password 类字段用 `type: password`（自动生成）
- 公网监听端口默认 bind 127.0.0.1 / 给 hint 提醒用户先认证再开放
