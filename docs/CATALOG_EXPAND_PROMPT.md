# Catalog 扩展建议 Prompt

> 用途：把这份文档（连同当前 catalog 清单）整段复制给一个有调研能力的大模型，
> 让它根据 EnvForge 的产品定位 + 当前覆盖范围，**给出值得新增的 catalog 项**。
>
> 想自己用的话，复制下面三段（"项目背景" / "当前 catalog" / "你的任务"）即可。
>
> 最后更新：2026-05-24（catalog 规模 100 软件 + 15 组合 = 115 项）

---

## ▼▼▼ 复制下面整段给 LLM ▼▼▼

# 任务：为 EnvForge 这个项目推荐应该补充的 catalog 项

## 一、项目背景（5 分钟读完）

**EnvForge** 是一个自托管的 Linux 服务器配置管理平台 —— 通过 SSH 连接受管 VM，
让用户在 Web UI 里点几下就能完成"装软件 / 改配置 / 加固系统 / 备份重建"等运维操作。
本质是一个"图形化、可分享、可重复执行"的 Ansible-Compatible 引擎。

仓库：<https://github.com/foolkking/envforge>

### 1.1 关键信息

- **目标用户**：自托管玩家（VPS / 家庭服务器 / 内网工作机）、个人开发者、小团队 SRE
- **支持发行版**：Ubuntu 22+ / Debian 12+ / RHEL 9+ / Anolis 9+ / Alma 9+ / Rocky 9+
  - 跨发行版差异由内置的 PACKAGE_ALIASES 自动翻译（apt 包名 ↔ dnf 包名 ↔ 服务名）
- **执行引擎**：TypeScript 原生 mini-Ansible（13 个内置模块），**无 Python 依赖**
- **典型场景**：拿到一台空服务器 → 用 EnvForge 跑几个 Playbook → 5 分钟变成生产可用的 web 服务器 / 数据库 / VPN / 媒体服务器…

### 1.2 catalog 是什么

catalog 是一组预制的"软件 + 组合"清单。每条对应一个 Playbook（YAML 文件 + 可选的表单 schema + Markdown 用户指南）。

每条标注：
- **kind**：`software`（单个软件） / `combo`（多软件套餐）
- **category**：`runtime` / `developer` / `database` / `container` / `security` / `network` / `service`
- **sensitivity**：`safe`（无副作用） / `review`（值得过目） / `privileged`（动系统级 / 数据 / 网络栈）
- **deployModes**：`system`（apt/dnf 直装）/ `docker`（生成 docker-compose 片段）
- **installMode**：`skip-existing`（已装跳过） / `replace-existing`（每次按表单重写配置）

### 1.3 入选的判断标准

**应该入选**的项：
- ✅ 在自托管 / 中小规模生产场景**明确常用**（活跃用户 1k+ / GitHub stars 不是关键，使用频率才是）
- ✅ 装上后能**独立提供价值**（而不是某个大栈的零件）
- ✅ 有**明确的配置点**（端口 / 域名 / 数据目录 / 认证 / 资源上限），适合做 Playbook 表单
- ✅ 在 Ubuntu / Debian / RHEL 9 系**至少有官方发行版包或官方仓库**，跨发行版兼容
- ✅ 不会和 catalog 里现有项**严重重复**（如再加一个 nginx 替代品就得很有差异化）

**不该入选**的项：
- ❌ 太小众 / 太特定行业（如某物联网协议 broker、某科研工具）
- ❌ 完全云原生、自托管价值低（如只在 AWS 跑的服务）
- ❌ 商业付费为主、开源版残废
- ❌ 配置极复杂、5 分钟跑不完一次、需要分布式集群才能用
- ❌ 已被 catalog 现有项功能性覆盖（如 "ufw + 自定义规则" 不是新项）

### 1.4 风险等级判定

- `safe`：装个 CLI 工具或库，不开端口、不改系统级配置
- `review`：开端口或写系统配置，但有合理默认值
- `privileged`：动 sshd / 防火墙 / 数据库 / 内核参数 / 容器特权，配错有真实风险

---

## 二、当前 catalog（115 项 — 不要再推荐这些）

### 2.1 软件 software（100 项）

#### runtime — 运行时（10 项）
- `node-runtime-profile` / `python-toolchain` / `golang-runtime` / `openjdk-runtime` / `rust-toolchain`
- `dotnet-runtime` / `php-toolchain` / `ruby-toolchain` / `nodejs-version-mgr` / `pyenv-toolchain`

#### developer — 开发者工具（16 项）
- `git-version-control` / `htop-tools` / `rust-cli-tools` / `zsh-shell` / `fish-shell`
- `neovim-editor` / `tmux-multiplex` / `code-server` / `ansible-tool` / `flutter-sdk`
- `jenkins-ci` / `gitlab-runner` / `gitlab-ce` / `terraform-iac` / `sonarqube`
- `dozzle` — Dozzle 实时 Docker 日志查看器（~30MB RAM）

#### database — 数据库 / 缓存 / 搜索（12 项）
- `postgres-profile` / `mysql-server` / `mariadb` / `sqlite` / `mongodb`
- `redis-server` / `valkey-server` / `memcached` / `elasticsearch` / `meilisearch`
- `clickhouse` / `influxdb`

#### security — 安全 / 凭据 / 证书 / SSO（7 项）
- `certbot-ssl` / `fail2ban-protection` / `firewalld` / `vault-secrets`
- `authentik` / `keycloak` / `authelia`

#### container — 容器（4 项）
- `docker-host-profile` / `portainer` / `kubernetes-tools` / `k3s`

#### network — 网络 / VPN / 代理 / DNS / 文件共享（12 项）
- `wireguard-vpn` / `tailscale` / `openvpn-server` / `traefik-proxy` / `haproxy-lb`
- `openresty` / `nethogs-bandwidth` / `samba-share` / `nfs-server` / `x-ui-panel`
- `pihole` / `adguard-home`

#### service — 服务/应用（39 项）
- Web/反代：`nginx-web-service` / `caddy-server`
- 密码：`vaultwarden`
- 文档：`wikijs` / `bookstack` / `paperless-ngx`
- 自动化/低代码：`n8n` / `nocodb`
- 分析：`umami`
- IoT：`home-assistant`
- 照片：`immich`
- Git：`forgejo`
- 邮件/Office：`docker-mailserver` / `onlyoffice-docs`
- 文件管理：`filebrowser` / `seafile`
- 监控/日志/Dashboard：`uptime-kuma` / `homepage` / `prometheus-monitoring` / `grafana-dashboard` / `loki-logging` / `netdata-monitoring` / `zabbix-monitoring` / `cockpit-panel`
- 媒体：`navidrome` / `audiobookshelf` / `jellyfin-media`
- 阅读 / 信息：`freshrss` / `linkwarden`
- 工具：`stirling-pdf` / `mealie`
- 其他：`swap-config` / `rabbitmq` / `mosquitto-mqtt` / `minio-storage` / `nodejs-pm2` / `rsync-tools` / `nextcloud` / `gitea-server`

### 2.2 组合 combo（15 项）

- 经典栈：`lamp-stack` / `lemp-stack` / `node-production-deploy` / `docker-compose-dev`
- 安全：`firewall-baseline` / `ssh-hardening` / `security-baseline` / `sso-stack`
- 监控/管理：`monitoring-stack` / `homelab-dashboard`
- 自托管套件：`selfhost-essentials` / `mail-stack` / `selfhost-media` / `selfhost-pkm` / `ai-localllm-stack`

---

## 三、你的任务

### 3.1 输出格式（默认：清单形式）

请给出**至少 12 个**值得新增的 catalog 项，按 category 分组。每条按下面的模板填写：

```
### {分类} · `{建议的 id}`

- **中文名 / 英文名**：{name} / {nameEn}
- **kind**：software / combo
- **sensitivity**：safe / review / privileged
- **deployModes**：[system] / [system, docker]
- **installMode**：skip-existing / replace-existing
- **一句话定位**（30 字内，告诉用户这是干嘛的）
- **跨发行版**：Ubuntu/Debian 包名是 `xxx`，RHEL 9 包名是 `yyy`（或"需要官方仓库"）
- **典型表单字段**：3-5 个用户在 UI 里能配置的关键参数（port / domain / 资源上限 / 等）
- **入选理由**（2-3 句）：为什么这个比 catalog 里其他项更值得加？什么场景必装？
- **被现有项部分覆盖的部分**（坦诚说出，越具体越好）：和已有的 X 在 Y 方面有重叠
```

### 3.2 进阶输出格式（可选 — 如果用户索取"完整骨架"）

如果用户要求"直接给我能合入仓库的骨架"，则按 EnvForge 的编写规范输出**完整 4 件套**：

1. **`apps/api/src/catalog.ts` 片段**：完整的 `CatalogItem` 对象（id / kind / category / sensitivity / components / compatibility / installMode / deployModes / guidePath）
2. **`configs/catalog/playbooks/<id>.yaml`**：包含 vars + tasks + verify 块；端口预检 / 跨发行版分支 / SELinux 处理 / `.envforge.bak` 备份等环节齐全；每个 verify 配多行 `hint`
3. **`configs/catalog/playbooks/<id>.vars.json`**：所有字段中英双语 label + help；password 字段 `generate_length` + `reveal_after_run`；高危选项 help 里有警告
4. **`configs/catalog/software/<id>.md`**：严格按 11 个区块（开篇 / 你将得到 / 表单字段 / **配置文件路径速查（含跨发行版表）** / **可复制的配置模板** / **关键参数调优速查** / 跨发行版 / 配合 / 排错 / 验证 / 隐私+敏感性）

完整的字段规范、必填项清单、verify hint 写法、PR 自检清单见 EnvForge 仓库的
**`docs/CATALOG_AUTHORING.md`**（推荐先读完再生成骨架）。

### 3.3 已知缺口（剩余优先候选）

下列 4 项是上一轮自查发现的明显空白——下次扩展应优先考虑：

| 缺口 | 类型 | 已有 catalog 没有的能力 | 建议候选 |
|---|---|---|---|
| **现代权威 DNS 服务器** | software · network | `pihole` / `adguard-home` 都是递归 DNS + 广告屏蔽。缺**权威 DNS**（自管 DNS 区域） | `powerdns-authoritative` / `coredns`（独立部署） |
| **分布式 / Geo 数据库** | software · database | 单机 PG / MySQL 已有，缺 CockroachDB（PG 兼容分布式）/ TimescaleDB（PG 时序扩展） | `cockroachdb` / `timescaledb` |
| **GitOps / K8s 部署工具** | software · container | `k3s` 装集群，但缺 ArgoCD / Flux 做 GitOps 自动同步 | `argocd` / `fluxcd` |
| **Mesh VPN 自托管协调端** | software · network | `tailscale` 已有但用 SaaS 协调端。缺 Headscale 让完全自托管 | `headscale` |

### 3.4 其他可考虑的方向（按"覆盖度差距"排序）

填完已知缺口后，可继续往下挖：

1. **可观测性深化**：Alertmanager 独立 Playbook / VictoriaMetrics（Prometheus 长期存储）/ Tempo（分布式 trace）/ Grafana Mimir
2. **CI/CD 替代**：Drone CI / Woodpecker CI（轻量 GitLab Runner 替代）
3. **存储 / 备份**：SeaweedFS（分布式存储）/ Restic-rest-server / Duplicati（图形化增量备份）
4. **媒体 / 个人云**：Calibre-Web（图书）/ Komga（漫画）/ Lidarr-Sonarr-Radarr（媒体自动追剧三件套）
5. **AI 工具增量**：vLLM（高吞吐推理）/ ComfyUI（Stable Diffusion）/ Whisper-server（语音转录）/ Faster Whisper
6. **安全增量**：Wazuh（开源 SIEM）/ CrowdSec（替代 fail2ban，含云端威胁情报）
7. **工作流 / 协作**：Outline / HedgeDoc（实时协作笔记）/ Vikunja（任务管理）/ Plane（Jira 替代）
8. **数据库工具**：pgBackRest（PG 增量备份）/ pgBouncer（PG 连接池）/ AdminerEvo
9. **下载工具**：qBittorrent（BT 下载）/ Aria2（多协议）
10. **游戏服务器**：Crafty Controller（Minecraft 多实例 panel）/ Pterodactyl（通用游戏服务器面板）

注意：**别推荐已经在已有 115 项里的东西**。filebrowser / uptime-kuma / homepage / dozzle / paperless-ngx / immich / linkwarden / mealie / freshrss / navidrome / audiobookshelf / stirling-pdf 等都已经有了。

### 3.5 输出最后请补充

- **遗漏诊断**：你看完现有清单 + 已知缺口表，最让你意外的"还缺的"是什么？为什么自托管社区会觉得没它不行？
- **过度覆盖**：你觉得现有 115 项里哪些**重复度高 / 可以合并 / 可以删减**？已知重叠：
    - `gitea-server` + `forgejo`（Forgejo 是 Gitea 社区 fork，二选一）
    - `pihole` + `adguard-home`（同 DNS 广告屏蔽，二选一）
    - `authelia` + `keycloak` + `authentik`（三个 SSO 方案）
    - `nextcloud` + `seafile` + `filebrowser`（三个文件方案）
    - `redis-server` + `valkey-server`（Redis 与其 BSD fork）
    - `lamp-stack` + `lemp-stack`（仅 web server 不同）
- **跨发行版坑预警**：你推荐的项里哪些在 RHEL/Anolis 上特别难装、需要写 fallback 的？

### 3.6 调研来源建议（可选，给你做参考）

- awesome-selfhosted: <https://github.com/awesome-selfhosted/awesome-selfhosted>
- awesome-sysadmin: <https://github.com/awesome-foss/awesome-sysadmin>
- r/selfhosted 讨论度高的项目
- DigitalOcean / Linode 的 marketplace 装机率高的项目
- 各发行版 default repo 里被打包的应用集（说明被认为足够主流）
- selfh.st 周报的"new self-hosted projects"区
- HackerNews 中"Show HN: I built a self-hosted X"高赞贴

---

## 输出风格要求

- 中文为主，技术名词保留英文（"反向代理"而不是"反向 proxy"）
- 直接给清单，不要写"以下是我的建议..."这种开场白
- 不要建议"开发未来版本支持的功能"——只推荐**当前能立刻做成 Playbook 的、稳定的开源服务**
- 如果某项你觉得边界模糊（比如可能太小众），明确说出"这项不太确定值不值得"并给理由
- 推荐的项**必须具体到软件名**（如 "Authelia"），不要给"建议加一个 SSO 网关"这种宽泛建议

## ▲▲▲ 复制结束 ▲▲▲

---

## 给维护者的备注（不复制给 LLM）

### 已落地批次

| 批次 | 日期 | 项数 | 主要新增 |
|---|---|---|---|
| Batch 9-12 | 2026-05-23 | 8 | vaultwarden / caddy-server / pihole / authentik / meilisearch / wikijs / n8n / monitoring-stack |
| Batch 13 | 2026-05-23 | 10 | valkey-server / clickhouse / influxdb / bookstack / home-assistant / gitlab-ce / umami / nocodb / selfhost-essentials / ai-localllm-stack |
| Batch 14 | 2026-05-24 | 12 | nfs-server / adguard-home / tailscale / keycloak / authelia / docker-mailserver / onlyoffice-docs / immich / forgejo / k3s / mail-stack / sso-stack |
| Batch 15 | 2026-05-24 | 15 | filebrowser / uptime-kuma / homepage / dozzle / paperless-ngx / navidrome / audiobookshelf / freshrss / stirling-pdf / mealie / linkwarden / seafile / homelab-dashboard / selfhost-media / selfhost-pkm |

### 下一轮工作流建议

1. 把上面整段（"▼▼▼ 复制下面整段给 LLM ▼▼▼" 到 "▲▲▲ 复制结束 ▲▲▲"）+ 当前 `docs/CATALOG.md` 一起喂给一个有调研能力的 LLM
2. 拿到候选清单后，按 `docs/CATALOG_AUTHORING.md` 的 11 区块标准为每项产出 4 件套
3. 同步更新 `apps/api/src/catalog.ts` + `docs/CATALOG.md`
4. **必须**跑 `npm run build --workspace @fool/api` 重新生成 dist（前端读编译产物，不重 build 看不到新增项）
5. 跑 `npm run audit:catalog` 校验一致性

### 当前规模真相之源

- `apps/api/src/catalog.ts`（115 项）
- `docs/CATALOG.md`（用户可见的完整清单 + 统计）
