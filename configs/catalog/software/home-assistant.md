# Home Assistant 智能家居中枢

Home Assistant 是**自托管智能家居自动化平台**——集成 5000+ 设备 / Z-Wave / Zigbee / Wi-Fi / 蓝牙 / MQTT。**最受欢迎的开源家居系统**（GitHub 70k+ stars）。本 Playbook 装的是 **HA Container**（Docker），区别于 HAOS（裸金属操作系统）。

## 你将得到什么

- 📦 **homeassistant** Docker 容器（`ghcr.io/home-assistant/home-assistant:stable`）
- ✅ Web UI 监听 `8123`
- ✅ Host network 模式（推荐——mDNS/SSDP 自动发现 IoT 设备）
- ✅ 数据持久化 `/opt/home-assistant/`
- ✅ DBus 集成（蓝牙 / Avahi）
- ✅ Privileged 容器（**必须**——访问 USB / 蓝牙 / Z-Wave dongle）
- ✅ SELinux 自动配（RHEL 系）
- ⚠️ 首次启动 1-2 分钟（生成默认配置 + 数据库初始化）

## 表单字段说明

### `ha_port`

Web UI 端口。host network 模式下直接暴露在所有网卡。

### `ha_data_dir`

数据目录。**最关键备份目标**——含：

- 所有配置 / 集成 / 自动化 / 仪表盘
- 用户账号 / token
- 设备状态历史（SQLite）
- 媒体文件 / 音视频通知

### `ha_timezone`

时区。影响自动化触发时间。

### `ha_use_host_network`

| 值 | 适用 |
|---|---|
| `true`（**推荐**） | host network——自动发现 mDNS / SSDP / Avahi 设备（HomeKit / Sonos / Roku / Hue 等） |
| `false` | bridge 模式——更安全但**自动发现失效**，需手动 IP 配集成 |

## 配置文件 / 目录速查

```
/opt/home-assistant/                          # = 容器内 /config
├── configuration.yaml                          # ← 主配置（YAML）
├── secrets.yaml                                 # 敏感值（密钥 / token）—— 引用为 !secret
├── automations.yaml                             # 自动化（UI 也会生成）
├── scripts.yaml                                  # 脚本
├── scenes.yaml                                    # 场景
├── customize.yaml                                  # 实体定制
├── ui-lovelace.yaml                                 # （可选）Lovelace UI YAML
├── home-assistant_v2.db                              # ← SQLite 数据库（状态历史）
├── home-assistant.log                                  # 主日志
├── .storage/                                          # 各集成的 JSON 配置（**核心**）
├── custom_components/                                  # HACS 装的自定义集成
├── www/                                                  # 静态资源
├── packages/                                              # 模块化配置（按业务拆分）
└── blueprints/                                             # 自动化模板
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker（host network 推荐） |
| 镜像 | `ghcr.io/home-assistant/home-assistant:stable`（多架构） |
| 端口 | 8123（默认） |
| Privileged | **必须**（访问硬件） |

## 常见配置模板

### 模板 A — 首次访问 + onboarding

```
http://server-ip:8123
```

引导：

1. 创建 Owner 账号（用户名 + 密码）
2. 选位置（GPS 坐标）/ 时区 / 单位 / 国家 / 货币
3. HA 自动扫描局域网 IoT 设备
4. 选要集成的设备 → Setup
5. （可选）配 Cloud connection（Nabu Casa 付费 SaaS——不用）

### 模板 B — 推荐 `configuration.yaml` 起手式

```yaml
default_config:                                      # 启用所有默认集成（强烈保留）

frontend:
  themes: !include_dir_merge_named themes

http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
  cors_allowed_origins:
    - https://ha.example.com

automation: !include automations.yaml
script: !include scripts.yaml
scene: !include scenes.yaml
sensor: !include_dir_merge_list sensors/
binary_sensor: !include_dir_merge_list binary_sensors/

# 录音 / 历史保留（默认 10 天，调长更占磁盘）
recorder:
  purge_keep_days: 30
  commit_interval: 30
  exclude:
    domains:
      - automation
      - updater
      - sun
    entity_globs:
      - sensor.*_uptime

# Logger
logger:
  default: warning
  logs:
    custom_components.hacs: info
```

### 模板 C — 接 MQTT broker（与 mosquitto-mqtt 配套）

```yaml
# configuration.yaml
mqtt:
  broker: 127.0.0.1
  port: 1883
  username: ha_user
  password: !secret mqtt_password
  discovery: true                                     # 自动发现 MQTT 设备
```

UI → Settings → Devices & Services → MQTT → 配 broker。详见 `mosquitto-mqtt.md`。

### 模板 D — 安装 HACS（社区集成商店）

```bash
# 1. 进容器
docker exec -it homeassistant /bin/bash

# 2. 装 HACS
wget -O - https://get.hacs.xyz | bash -

# 3. 退出 + 重启 HA
exit
docker restart homeassistant

# 4. UI → Settings → Devices & Services → Add → HACS → 跟向导
# 5. 之后 HACS 在侧边栏，可装 1000+ 社区集成 / 主题 / 自动化模板
```

### 模板 E — Z-Wave / Zigbee USB 配置

USB 棒（如 Zooz / ConBee II / SkyConnect）：

```bash
# 看 USB 路径
ls -la /dev/tty*USB* /dev/serial/by-id/

# /opt/home-assistant/configuration.yaml 加（具体按集成文档）
# UI Settings → Add Integration → Z-Wave JS → USB path: /dev/serial/by-id/usb-XXX
```

容器需 privileged 才能访问 `/dev/`（本 Playbook 已开）。

### 模板 F — 反向代理（生产推荐）

```nginx
upstream homeassistant {
    server 127.0.0.1:8123;
}

server {
    listen 443 ssl http2;
    server_name ha.example.com;
    ssl_certificate /etc/letsencrypt/live/ha.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ha.example.com/privkey.pem;

    location / {
        proxy_pass http://homeassistant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket（实时更新必须）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
}
```

`configuration.yaml` 加：

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
```

### 模板 G — 自动化示例（YAML）

```yaml
# automations.yaml
- alias: "回家自动开灯"
  trigger:
    - platform: state
      entity_id: device_tracker.alice_phone
      from: 'not_home'
      to: 'home'
  condition:
    - condition: state
      entity_id: sun.sun
      state: 'below_horizon'
  action:
    - service: light.turn_on
      target:
        entity_id: light.living_room
      data:
        brightness_pct: 80
        color_temp: 350
    - service: notify.mobile_app_alice
      data:
        message: "欢迎回家"
```

UI 也可视化拖拽编排 → 生成 YAML。

### 模板 H — 备份策略

```bash
# 1. 配置文件 + 数据库
docker stop homeassistant
sudo tar czf /backup/ha-$(date +%F).tar.gz -C /opt home-assistant
docker start homeassistant

# 2. 加密
gpg -c /backup/ha-$(date +%F).tar.gz

# 或用 HA 内置 Backup 集成
# Settings → System → Backups → Create
```

### 模板 I — 升级

```bash
cd /opt/home-assistant
docker compose pull
docker compose up -d                              # 自动 schema migration
```

升级前**强烈建议备份**——HA 平均每月 1 次升级，偶有 breaking change。

## 关键参数调优速查

### 资源占用

| 设备数 | RAM | CPU | 磁盘（30 天历史） |
|---|---|---|---|
| 个人（< 50 设备） | 600 MB | 0.5 vCPU | 2 GB |
| 家庭（< 500 设备） | 2 GB | 1 vCPU | 10 GB |
| 大型（< 5k 设备） | 8 GB | 2 vCPU | 50 GB |

### Recorder 数据库优化

```yaml
recorder:
  purge_keep_days: 14                              # 保留 14 天（默认 10）

  # 只录关键 entity
  include:
    domains:
      - climate
      - switch
      - light
      - lock
    entity_globs:
      - sensor.electric_*

  exclude:
    entity_globs:
      - sensor.*_uptime
      - sensor.*_signal_strength
      - sensor.*_linkquality
```

不录的 entity 历史不存——大量减少 DB 大小。

### MariaDB / PG backend（大型部署）

默认 SQLite < 1k 设备够用。要换：

```yaml
recorder:
  db_url: postgresql://ha:pass@db:5432/ha
```

需在 docker-compose 加 PG 服务。

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu 22 / 24 | ✅ |
| Debian 12 | ✅ |
| RHEL 9 / Anolis 9 | ✅（**SELinux 必配**：`setsebool -P container_use_devices on`） |
| ARM64（树莓派 / Oracle Ampere） | ✅（多架构镜像） |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`mosquitto-mqtt`** — IoT 协议中枢（模板 C）
- **`influxdb`** — 长期历史数据存储（替代 Recorder SQLite）
- **`grafana-dashboard`** — 通过 InfluxDB 看 HA 历史数据
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS（模板 F）
- **`pihole`** — DNS 广告屏蔽

## 排错

### 启动慢 / 卡 onboarding

正常——HA 首次启动生成默认配置 + Python 依赖安装。**1-2 分钟**：

```bash
docker logs -f homeassistant
# 等 "[homeassistant.components.frontend] Setting up frontend"
```

### USB 设备容器内看不到

```bash
# 容器需 privileged + 挂 /dev
docker inspect homeassistant | grep -A3 Privileged

# 看路径
ls -la /dev/tty*USB* /dev/ttyACM*

# SELinux（RHEL）
sudo setsebool -P container_use_devices on
```

### mDNS / 自动发现不工作

bridge 模式不发现 mDNS。改 host network：

```yaml
# docker-compose.yml
network_mode: host
```

或用 mDNS 反射器（避免：复杂且不稳）。

### 反代后 WebSocket 断

nginx 配置缺 Upgrade header（模板 F 已含）：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### `400 Bad Request: Invalid host header`

`configuration.yaml` 缺 trusted_proxies：

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - 10.0.0.0/8
```

### 找回 admin 密码

```bash
docker exec -it homeassistant /bin/bash
cd /config
nano .storage/auth                               # 找到用户 → 改密码 hash
# 或删账号重建：删 .storage/auth + onboarding 走一遍
```

### 升级后某集成挂了

```bash
# 看错误日志
docker logs homeassistant | grep -i error

# 回滚（image 锁老版本）
# docker-compose.yml: image: ghcr.io/home-assistant/home-assistant:2024.5.0
docker compose up -d
```

### Recorder DB 损坏

```bash
docker stop homeassistant
sudo cp /opt/home-assistant/home-assistant_v2.db{,.bak}
sudo rm /opt/home-assistant/home-assistant_v2.db
docker start homeassistant                       # 自动新建（丢历史）
```

## 验证

```bash
docker ps | grep homeassistant
curl -I http://127.0.0.1:8123/                       # 200 OK
curl http://127.0.0.1:8123/manifest.json | head
docker logs --tail 30 homeassistant
```

## 多次运行

`installMode: skip-existing`。docker-compose.yml 重写。**数据保留**——所有集成 / 自动化 / 用户不丢。

## ⚠️ 敏感性

**review** — Home Assistant 控制**家里所有 IoT 设备**——灯 / 门锁 / 摄像头 / 安全系统。攻陷 = 物理风险。

强制：

1. **公网必须 HTTPS**——Web UI 默认 HTTP
2. **强密码 + 启用 2FA**（Settings → People → Profile → Two-Factor）
3. 反代加 IP 白名单（公网时）
4. Privileged 容器 = 等同 root，确保镜像来自官方
5. HACS 自定义集成审查（社区开发可能不安全）

## 隐私说明

- **HA 完全本地运行**——除非主动开 Nabu Casa Cloud（付费 SaaS），否则数据不出本机
- 不发遥测（默认）
- 集成设备的云组件（如 Tuya / Aqara）会和厂商云通信
- Bluetooth / Zigbee / Z-Wave 全部本地
- 备份文件含**全部凭据 + 历史数据**——加密存
