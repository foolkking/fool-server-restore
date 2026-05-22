# OpenResty (Nginx + LuaJIT)

OpenResty 把 LuaJIT 嵌入 nginx，让你能在 nginx 配置里写 Lua 脚本——动态生成响应、
做复杂鉴权、限流、AB 测试、API 网关、WAF。

## 你将得到什么

- 📦 **openresty**（来自 openresty 官方源）
- ✅ 二进制装在 `/usr/local/openresty/`
- ✅ nginx.conf 包含一个 `/lua` 演示 endpoint
- ✅ openresty systemd 服务

## 何时选 OpenResty 而非 nginx

- ✅ 需要在 nginx 配置里跑动态逻辑（鉴权、路由决策、计算）
- ✅ 想做 API 网关（限流、API key 校验、签名）
- ✅ 写 WAF 规则
- ❌ 仅需静态文件 / 简单反向代理 → 用普通 nginx

## 安装后

### 验证 Lua 工作

```bash
curl http://localhost/lua
# Hello from OpenResty + LuaJIT
# Time: 2024-...
```

### 写一个鉴权中间件

```nginx
location /api/ {
    access_by_lua_block {
        local token = ngx.var.http_authorization
        if not token or token ~= "Bearer my-secret" then
            ngx.status = 401
            ngx.say("unauthorized")
            ngx.exit(401)
        end
    }
    proxy_pass http://backend;
}
```

### 限流

```nginx
http {
    lua_shared_dict ratelimit 10m;

    server {
        location / {
            access_by_lua_block {
                local limit = require "resty.limit.req"
                local lim, _ = limit.new("ratelimit", 100, 200)  -- 100 req/s, burst 200
                local key = ngx.var.binary_remote_addr
                local delay, err = lim:incoming(key, true)
                if not delay then
                    if err == "rejected" then
                        ngx.exit(429)
                    end
                end
            }
            proxy_pass http://backend;
        }
    }
}
```

### 配置文件

主配置：`/usr/local/openresty/nginx/conf/nginx.conf`

业务子配置目录：`/usr/local/openresty/nginx/conf/conf.d/*.conf`（取消 nginx.conf 里 include 注释后启用）。

### 测试 + reload

```bash
sudo /usr/local/openresty/bin/openresty -t                     # 语法检查
sudo systemctl reload openresty                                # 平滑重载
```

## ⚠️ 敏感性

**review** — OpenResty 占用 80 端口，**不能和普通 nginx 共存**。在已有 nginx 的机器上要先 `systemctl stop nginx` 再装 OpenResty，或者改 OpenResty 监听别的端口。

## 验证

```bash
systemctl status openresty --no-pager
curl http://localhost/lua
sudo /usr/local/openresty/bin/openresty -V    # 看编译进去的模块
```

## 排错

- **`80 端口被占`** — 关掉 nginx 或改端口。
- **Lua 报 `undefined symbol`** — 漏装某个 lua 库。OpenResty 包自带主流 lua-resty-* 库，但偶尔特殊场景需要 luarocks 装更多。
- **跨发行版**：包不在默认仓库，需要 OpenResty 官方源（Playbook 已自动添加）。

## 多次运行

`installMode: skip-existing`。包不重装，nginx.conf 每次重写——如果你大量定制配置请放到 `conf.d/` 子目录。

## 隐私说明

- 配置不上传不同步。
- 访问/错误日志在 `/usr/local/openresty/nginx/logs/`。
