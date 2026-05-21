# Node.js 生产部署

## 概述

Node.js + PM2 + Nginx 是 Node.js 应用生产部署的标准方案。PM2 负责进程管理和自动重启，Nginx 负责反向代理、负载均衡和静态文件服务。

## 包含组件

| 组件 | 说明 |
|------|------|
| Node.js | JavaScript 运行时 |
| npm | 包管理器 |
| PM2 | Node.js 进程管理器 |
| Nginx | 反向代理服务器 |

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y nodejs npm nginx
sudo npm install -g pm2
sudo systemctl enable nginx
sudo systemctl start nginx
```

> 推荐使用 NodeSource 仓库安装最新 LTS 版本：
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt-get install -y nodejs
> ```

## 安装后配置

### 1. PM2 基础使用

```bash
# 启动应用
pm2 start app.js --name "my-app"

# 集群模式（利用多核 CPU）
pm2 start app.js -i max --name "my-app"

# 设置开机自启
pm2 startup
pm2 save
```

### 2. PM2 生态文件

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'my-app',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

```bash
pm2 start ecosystem.config.js
```

### 3. Nginx 反向代理配置

创建 `/etc/nginx/sites-available/my-app`：

```nginx
upstream nodejs {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://nodejs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /static {
        alias /var/www/my-app/public;
        expires 30d;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/my-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 日志管理

```bash
# PM2 日志
pm2 logs
pm2 flush          # 清空日志
pm2 install pm2-logrotate  # 日志轮转
```

## 验证安装

```bash
node --version
npm --version
pm2 --version
nginx -v
pm2 list
curl http://localhost:3000
```

## 部署流程

```bash
git pull origin main
npm ci --production
npm run build
pm2 reload my-app
```

## 适用场景

- Express / Fastify / Koa API 服务
- Next.js / Nuxt.js SSR 应用
- WebSocket 实时应用
- 微服务后端
