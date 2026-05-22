# Traefik 反向代理

Traefik 是云原生的反向代理（v3）。和 nginx 比，最大优势是**自动发现路由**——
你跑了一个新的 Docker 容器、加几个 label，Traefik 立刻代理它，不用改配置文件。
ACME / Let's Encrypt 内置，无需手动跑 certbot。

## 你将得到什么

- ✅ Traefik v3 二进制装到 `/usr/local/bin/traefik`
- ✅ systemd 单元 + 专用 traefik 用户
- ✅ 静态配置 `/etc/traefik/traefik.yml`：80/443 entrypoint + dashboard + ACME + file/docker provider
- ✅ ACME 证书存储 `/var/lib/traefik/acme.json` (600 权限)
- ✅ 动态配置目录 `/etc/traefik/dynamic/` 准备好（自动 watch 重载）
- ✅ 80 → 443 自动跳转

## 表单字段说明

### Let's Encrypt 邮箱 `acme_email`

ACME 协议要求注册一个邮箱，证书快过期且续签失败时会发提醒。务必真实邮箱。

### Dashboard 端口 `dashboard_port`

Traefik 自带 web 管理面板，默认 `:8080`。

### Insecure 模式 `dashboard_enable_insecure`

- ❌ **关闭（默认）**：dashboard 必须通过 HTTPS + 认证 router 访问。生产环境正确选择。
- ✅ 开启：dashboard 端口裸暴露。仅开发测试 + 防火墙限本机时用。

## 安装后

服务起来了，但**还没有任何代理规则**——Traefik 现在对所有请求返回 404。要让它代理你的服务：

### 方式 1：File provider（适合非 Docker 服务）

新建 `/etc/traefik/dynamic/myapp.yml`：

```yaml
http:
  routers:
    myapp:
      rule: "Host(`app.example.com`)"
      service: myapp
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    myapp:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3000"
```

Traefik 会自动重载，几秒后 `app.example.com` 就被代理到本机 :3000。

### 方式 2：Docker labels（适合 Docker 容器）

```yaml
# docker-compose.yml
services:
  myapp:
    image: myapp:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=3000"
```

`docker compose up`，Traefik 立刻发现并代理。

### 暴露 Dashboard（HTTPS + auth，生产推荐）

新建 `/etc/traefik/dynamic/dashboard.yml`：

```yaml
http:
  routers:
    dashboard:
      rule: "Host(`traefik.example.com`)"
      service: api@internal
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - dashboard-auth
  middlewares:
    dashboard-auth:
      basicAuth:
        users:
          - "admin:$apr1$xxx..."   # 用 htpasswd -nB admin 生成
```

### 防火墙

```bash
sudo ufw allow 80,443/tcp
sudo firewall-cmd --add-service={http,https} --permanent && sudo firewall-cmd --reload
```

## ⚠️ 敏感性

**review** — Traefik 占用 80/443 + dashboard 端口。**不要和 nginx/apache 同时跑**——会争 80/443。

## 验证

```bash
systemctl status traefik --no-pager
sudo journalctl -u traefik -n 30
curl http://localhost   # 应返回 404 (没匹配到 router)
sudo cat /var/lib/traefik/acme.json   # 应该是 {} 直到第一个域名签证书
```

## 排错

- **`bind: address already in use`** — 80/443 被 nginx/apache 占了。先停掉它们或者把 Traefik 改用别的端口。
- **ACME 证书签不下来** — 域名 DNS 没指向本机 / 80 端口防火墙没开 / `acme.json` 权限不是 600。
- **Docker provider 不工作** — Traefik 用户需要能读 docker.sock：`sudo usermod -aG docker traefik && sudo systemctl restart traefik`。
- **跨发行版**：用二进制安装，不依赖发行版包管理器。

## 多次运行

`installMode: skip-existing`。已下载的二进制不会重下；静态配置每次重写。`/etc/traefik/dynamic/` 下的用户文件不会被动。

## 隐私说明

- ACME 私钥在 `/var/lib/traefik/acme.json`（600 权限），不会被上传。
- 访问日志在 `/var/log/traefik/access.log`，含每个请求的 IP。
