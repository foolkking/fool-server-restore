# OpenResty (Nginx + LuaJIT)

OpenResty 把 LuaJIT 嵌入 nginx，让你能在 nginx 配置里写 Lua 脚本——动态生成响应、复杂鉴权、限流、AB 测试、API 网关、WAF。**用得最多的场景是 API 网关**——比写一个独立的网关服务轻量得多。

## 你将得到什么

- 📦 **openresty**（来自 openresty.org 官方仓库）
- ✅ 二进制装到 `/usr/local/openresty/`
- ✅ nginx.conf 含一个 `/lua` 演示 endpoint
- ✅ openresty systemd 服务（已设开机自启）
- ✅ 内置：ngx.lua / lua-resty-core / lua-resty-redis / lua-resty-mysql 等核心库

## 何时选 OpenResty 而非 nginx

| 需求 | 选 |
|---|---|
| 仅静态文件 / 简单反代 | **nginx** |
| 需在配置里跑动态逻辑（鉴权 / 路由 / 计算） | OpenResty |
| API 网关（限流 / API key / 签名校验） | OpenResty |
| WAF（按 OWASP Top 10 写规则） | OpenResty |
| 多协议代理（gRPC + HTTP + WebSocket） | nginx 也行 |
| 高性能 lua 业务逻辑替代后端 | OpenResty |

## 配置文件 / 目录速查

```
/usr/local/openresty/                                # 安装根（独立树，不影响系统 nginx）
├── nginx/
│   ├── sbin/nginx                                    # OpenResty 的 nginx 二进制
│   ├── conf/
│   │   ├── nginx.conf                                # ← 主配置
│   │   ├── conf.d/                                   # 用户自定义 server 块（需 include）
│   │   ├── mime.types
│   │   └── fastcgi_params
│   ├── html/                                         # 默认静态根
│   └── logs/
│       ├── access.log
│       └── error.log
├── luajit/                                            # LuaJIT 引擎
├── lualib/                                             # 内置 Lua 库
│   ├── resty/                                          # lua-resty-* 标准库
│   │   ├── core.lua
│   │   ├── redis.lua
│   │   ├── mysql.lua
│   │   ├── http.lua                                    # 需单独装：opm install ledgetech/lua-resty-http
│   │   ├── jwt.lua                                     # opm install SkyLothar/lua-resty-jwt
│   │   └── limit/                                       # 限流原语
│   └── ngx/
└── bin/
    ├── openresty                                       # = /usr/local/openresty/nginx/sbin/nginx
    ├── opm                                              # OpenResty Package Manager
    └── resty                                            # 命令行 Lua REPL（调试用）

# systemd
/usr/lib/systemd/system/openresty.service
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `openresty.org/package/ubuntu` | `openresty.org/package/centos` |
| GPG 密钥 | `openresty.org/package/pubkey.gpg` | rpm 自带签名 |
| 二进制 | `/usr/local/openresty/bin/openresty` | 相同 |
| 服务名 | `openresty` | `openresty` |

## 常见配置模板

### 模板 A — 基础 `/usr/local/openresty/nginx/conf/nginx.conf`

```nginx
worker_processes auto;
error_log logs/error.log notice;
events {
    worker_connections 4096;
    multi_accept on;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    tcp_nopush      on;
    keepalive_timeout 65;
    client_max_body_size 100m;

    # ====== Lua 共享字典（worker 间共享内存）======
    lua_shared_dict ratelimit       10m;
    lua_shared_dict cache_dict      50m;
    lua_shared_dict locks            1m;
    lua_shared_dict prom_metrics    10m;

    # ====== Lua 包路径（找 lua-resty-*）======
    lua_package_path "/usr/local/openresty/lualib/?.lua;/etc/openresty/lua/?.lua;;";
    lua_package_cpath "/usr/local/openresty/lualib/?.so;;";

    # ====== 启动时初始化（懒加载常用库）======
    init_by_lua_block {
        cjson = require "cjson"
        redis = require "resty.redis"
    }

    # ====== 日志格式 ======
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" rt=$request_time';
    access_log logs/access.log main;

    # 子配置
    include conf.d/*.conf;
}
```

### 模板 B — Lua 鉴权中间件（API key / Bearer Token）

`/usr/local/openresty/nginx/conf/conf.d/api-gateway.conf`:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location /api/ {
        # ====== 鉴权 ======
        access_by_lua_block {
            local token = ngx.var.http_authorization
            if not token then
                ngx.status = 401
                ngx.header.content_type = "application/json"
                ngx.say('{"error": "missing authorization header"}')
                return ngx.exit(401)
            end

            -- 简单白名单（生产用 redis / db 查）
            local valid_tokens = {
                ["Bearer prod-key-aaaa"] = "service-a",
                ["Bearer prod-key-bbbb"] = "service-b",
            }

            local user = valid_tokens[token]
            if not user then
                ngx.status = 403
                ngx.header.content_type = "application/json"
                ngx.say('{"error": "invalid token"}')
                return ngx.exit(403)
            end

            ngx.req.set_header("X-User", user)
        }

        proxy_pass http://upstream-backend/;
        proxy_set_header X-User $http_x_user;
    }
}
```

### 模板 C — 限流（per-IP + per-API key）

```nginx
server {
    listen 80;

    location /api/ {
        access_by_lua_block {
            local limit_req = require "resty.limit.req"
            local limit_count = require "resty.limit.count"

            -- 每 IP 100 req/s，burst 200
            local lim_ip, err = limit_req.new("ratelimit", 100, 200)
            local key = ngx.var.binary_remote_addr
            local delay, err = lim_ip:incoming(key, true)
            if not delay then
                if err == "rejected" then
                    ngx.status = 429
                    ngx.header["Retry-After"] = "1"
                    ngx.say("Too Many Requests")
                    return ngx.exit(429)
                end
                ngx.log(ngx.ERR, "ratelimit error: ", err)
            end
            if delay >= 0.001 then
                ngx.sleep(delay)
            end

            -- 每 API key 1000 req / 小时
            local token = ngx.var.http_authorization
            if token then
                local lim_token, err = limit_count.new("ratelimit", 1000, 3600)
                local _, err = lim_token:incoming(token, true)
                if err == "rejected" then
                    ngx.status = 429
                    ngx.say("API quota exceeded")
                    return ngx.exit(429)
                end
            end
        }

        proxy_pass http://upstream-backend/;
    }
}
```

### 模板 D — Redis 缓存（cache-aside）

```nginx
location /api/expensive/ {
    content_by_lua_block {
        local redis = require "resty.redis"
        local cjson = require "cjson"
        local r = redis:new()
        r:set_timeout(1000)

        local ok, err = r:connect("127.0.0.1", 6379)
        if not ok then
            ngx.log(ngx.ERR, "redis connect failed: ", err)
            return ngx.exit(500)
        end
        r:auth("redis-password")

        local cache_key = "api:expensive:" .. ngx.var.uri
        local cached, err = r:get(cache_key)

        if cached and cached ~= ngx.null then
            ngx.header["X-Cache"] = "HIT"
            ngx.header.content_type = "application/json"
            ngx.say(cached)
            r:set_keepalive(10000, 100)        -- 连接池
            return
        end

        -- Cache miss：查后端
        local res = ngx.location.capture("/internal/expensive")
        if res.status ~= 200 then
            ngx.exit(res.status)
        end

        -- 写缓存（5 分钟）
        r:setex(cache_key, 300, res.body)
        r:set_keepalive(10000, 100)

        ngx.header["X-Cache"] = "MISS"
        ngx.header.content_type = "application/json"
        ngx.say(res.body)
    }
}

location /internal/expensive {
    internal;                       # 仅内部访问
    proxy_pass http://upstream-backend;
}
```

### 模板 E — Prometheus 指标（用 lua-resty-prometheus）

```bash
# 装库
/usr/local/openresty/bin/opm install knyar/nginx-lua-prometheus
```

```nginx
http {
    lua_shared_dict prom_metrics 10m;

    init_worker_by_lua_block {
        prometheus = require "prometheus".init("prom_metrics")
        metric_requests = prometheus:counter(
            "http_requests_total", "HTTP requests", {"host", "status"})
        metric_latency = prometheus:histogram(
            "http_request_duration_seconds", "HTTP latency", {"host"})
    }

    log_by_lua_block {
        metric_requests:inc(1, {ngx.var.host, ngx.var.status})
        metric_latency:observe(tonumber(ngx.var.request_time), {ngx.var.host})
    }

    server {
        listen 9145;
        location /metrics {
            content_by_lua_block { prometheus:collect() }
        }
    }
}
```

Prometheus scrape `http://server:9145/metrics`。

## 关键参数调优速查

### LuaJIT 性能

LuaJIT 比标准 Lua 快 10-100×。最佳实践：

- 用 `local` 引用所有库（避免全局查找）
- `ngx.shared.*` dict 跨 worker 共享，但**写竞争**——高并发用 `lock`
- `init_by_lua` 加载库一次，`init_worker_by_lua` 每 worker 一次
- 长连接用 `set_keepalive`（redis/mysql/http）

### Worker 配置

```nginx
worker_processes auto;                  # = CPU 核数
worker_rlimit_nofile 65535;             # ulimit -n
events {
    worker_connections 65535;            # 单 worker 最大连接
    multi_accept on;                      # 一次 accept 多个
    use epoll;                             # Linux 默认
}
```

### Lua dict 大小

```nginx
lua_shared_dict ratelimit 10m;           # 限流，按 key 数估算
lua_shared_dict cache 200m;               # 业务缓存
lua_shared_dict locks 1m;                 # 锁（轻量）
```

`shared_dict` 是 nginx 启动时一次性分配的——不要太大也不要太小。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `https://openresty.org/package/ubuntu` | `https://openresty.org/package/centos` |
| GPG 公钥 | `https://openresty.org/package/pubkey.gpg` | rpm 自带 |
| 包名 | `openresty` | `openresty` |
| 服务名 | `openresty` | `openresty` |

EnvForge 自动添加官方仓库。

## 与其它 catalog 项的配合

- **`nginx-web-service`** — **互斥**！都占 80/443，二选一
- **`certbot-ssl`** — 给 OpenResty 启用 HTTPS（同 nginx 配置）
- **`redis-server`** — 模板 D 的后端
- **`prometheus-monitoring`** — 模板 E 集成
- **`docker-host-profile`** — 用 `openresty/openresty:alpine` 容器

## 排错

### `bind: 80 address already in use`

nginx / apache / Traefik 占了 80：

```bash
sudo systemctl stop nginx                   # 或 apache2 / httpd / traefik
sudo systemctl start openresty
```

OpenResty 和 nginx 是两个独立 nginx 二进制，**不能同时跑**——选一个。

### Lua 报 `module 'resty.http' not found`

`lua-resty-http` 不是 OpenResty 内置，要装：

```bash
sudo /usr/local/openresty/bin/opm install ledgetech/lua-resty-http
```

或手动：

```bash
sudo git clone https://github.com/ledgetech/lua-resty-http /usr/local/openresty/lualib/resty/http
```

### `attempt to call global 'ngx.shared.xxx' (a nil value)`

`shared_dict` 没声明：

```nginx
http {
    lua_shared_dict xxx 10m;       # ← 必须在 http 段声明
    ...
}
```

### Lua 错误日志在哪

```bash
sudo tail -f /usr/local/openresty/nginx/logs/error.log

# 在 Lua 里输出
ngx.log(ngx.ERR, "this is error: ", err)
ngx.log(ngx.NOTICE, "info")
```

### 内存泄漏

LuaJIT 用 GC，但 `ngx.shared.*` 是 C 实现的，长字符串可能碎片化：

```nginx
lua_shared_dict cache 200m;
```

定期重启 worker（`-s reload`）回收。

### `worker_connections are not enough`

```bash
# 系统层
sudo sysctl -w net.core.somaxconn=65535
# nginx 层
worker_rlimit_nofile 65535;
events { worker_connections 65535; }

# systemd unit override
sudo systemctl edit openresty
# [Service]
# LimitNOFILE=65535
```

### 性能比 nginx 略低

OpenResty 默认开了 lua 上下文初始化，少量开销。极致性能场景用 `lua_code_cache on`（默认）+ 减少 init_by_lua 的全局变量。

## 验证

```bash
# 1. 二进制存在
/usr/local/openresty/bin/openresty -V

# 2. 服务在跑
systemctl is-active openresty

# 3. 端口
sudo ss -tlnp | grep nginx

# 4. Lua 工作
curl http://localhost/lua
# Hello from OpenResty + LuaJIT
# Time: ...

# 5. 配置语法
sudo /usr/local/openresty/bin/openresty -t

# 6. 看编译进去的模块
/usr/local/openresty/bin/openresty -V 2>&1 | tr ' ' '\n' | grep with-

# 7. opm 装包
sudo /usr/local/openresty/bin/opm list
```

## 多次运行

`installMode: skip-existing`。包安装幂等。**`nginx.conf` 每次重写**——大量定制配置请放 `conf.d/*.conf`。

## ⚠️ 敏感性

**review** — 占用 80/443，**不能与 nginx / apache / Traefik 同机**。Lua 代码运行在 nginx worker 进程内，**rce 风险等同 nginx**。

## 隐私说明

- 配置和 Lua 代码本地存储，不上传
- access.log 记录每个请求（包括来自 Lua 的请求）
- Lua 在 worker 里能访问环境变量 / 文件 / 网络——慎对开发者授权写 Lua
- OpenResty 本身不发遥测；`opm` 装包从 `opm.openresty.org` 拉
