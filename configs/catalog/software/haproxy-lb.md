# HAProxy 负载均衡器

HAProxy 是高性能 TCP/HTTP 负载均衡器，生产环境用了 20 年。比 nginx 在纯转发场景
性能更好，监控面板更详细，但配置语法更陡（不是 nginx 的 `server { }` 风格）。

## 你将得到什么

- 📦 **haproxy** 包
- ✅ `/etc/haproxy/haproxy.cfg` 写好基础结构（global / defaults / stats / frontend / backend）
- ✅ Stats 监控页（账号密码访问）
- ✅ 一个 backend 占位（指向 `127.0.0.1:3000` 或你填的地址），用户在此基础上加更多 server
- ✅ 服务启动并设开机自启

## 表单字段说明

### 前端监听端口 `frontend_port`

客户端请求的入口。HTTP 用 80，HTTPS 用 443（HTTPS 还要在 cfg 里加 `bind *:443 ssl crt ...`）。

### 首个后端地址 `backend_addresses`

第一个上游服务器的 `IP:port`。**这只是起点**——真实的多机负载均衡需要在 cfg 里手动追加：

```cfg
backend backend_servers
    balance roundrobin
    server srv1 10.0.0.10:3000 check
    server srv2 10.0.0.11:3000 check
    server srv3 10.0.0.12:3000 check
```

### Stats 页 (端口/账号/密码)

HAProxy 自带的实时监控面板：每个 frontend/backend/server 的连接数、错误率、健康状态。
**默认端口 8404 不要直接公网暴露**——防火墙限制只允许本机或运维 IP 访问。

## 安装后

### 添加更多后端

编辑 `/etc/haproxy/haproxy.cfg`，找到 `backend backend_servers` 段，加 server 行：

```cfg
backend backend_servers
    balance roundrobin    # 或 leastconn / source（IP hash）
    option httpchk GET /health
    server srv1 10.0.0.10:3000 check inter 2000 rise 2 fall 3
    server srv2 10.0.0.11:3000 check
    server srv3 10.0.0.12:3000 check backup    # 仅其它都挂时才启用
```

参数说明：
- `check` — 启用健康检查
- `inter 2000` — 每 2 秒检查一次
- `rise 2 fall 3` — 连续 2 次成功标记 healthy，连续 3 次失败标记 down
- `backup` — 备用机，主机都挂了才用

改完：
```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg     # 先校验语法
sudo systemctl reload haproxy                   # 平滑重载，不断连接
```

### 启用 HTTPS

```cfg
frontend https_in
    bind *:443 ssl crt /etc/haproxy/certs/example.com.pem
    default_backend backend_servers

frontend http_redirect
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }
```

证书 pem 文件需要 `cat fullchain.pem privkey.pem > example.com.pem` 合并。
和 Certbot 配合：写一个 deploy hook，certbot 续签后自动合并 + reload haproxy。

### 看 Stats 页

打开 `http://server-ip:8404/`，输入表单设的用户名密码即可。

### ACL 路由（按域名/路径分流）

```cfg
frontend http_in
    bind *:80
    acl is_api path_beg /api/
    acl is_admin hdr(host) -i admin.example.com
    use_backend api_servers if is_api
    use_backend admin_servers if is_admin
    default_backend frontend_servers
```

## ⚠️ 敏感性

**review** — HAProxy 占用 80/443 端口，不要和 nginx/apache/Traefik 同时跑。stats 页含敏感运维信息，必须密码保护 + 防火墙限制来源。

## 验证

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg    # 语法检查
systemctl status haproxy --no-pager
curl -u admin:你的密码 http://127.0.0.1:8404/   # stats 页
sudo ss -tlnp | grep haproxy
```

## 排错

- **服务起不来** — 99% 是 cfg 语法错误。运行 `sudo haproxy -c -f /etc/haproxy/haproxy.cfg` 看具体哪行。
- **后端显示 DOWN** — `backend_addresses` 不可达，或 `option httpchk GET /` 不返回 200（很多后端没有 / 路由），改成 `option httpchk` 不带具体 URL 走 TCP-level 检查。
- **`option forwardfor` 没添加 X-Forwarded-For 头** — 后端应用要信任 HAProxy 的 IP 才会读这个头。
- **跨发行版**：`haproxy` 在 Ubuntu/Debian 和 RHEL/Anolis 都是默认仓库提供，不需要 EPEL。

## 多次运行

`installMode: skip-existing`。haproxy 包不重装，cfg 文件每次重写（覆盖手动改的内容）。如果你大量定制了 cfg，建议从 EnvForge 之外管理（比如 git 仓库 + 自己的部署脚本）。

## 隐私说明

- stats 页密码会出现在任务日志。
- 访问日志默认走 syslog，看 `/var/log/haproxy.log`。
