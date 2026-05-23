# Mealie 食谱管理器

Mealie 是**自托管食谱库**——网页 URL **一键导入**（支持 1000+ 烹饪网站）+ 食材自动汇总采购清单 + 周菜单计划 + 移动 App。**适合**：家庭厨房、烹饪爱好者、餐厅备菜规划。FastAPI + Vue 写，**~200 MB RAM**。

## 你将得到什么

- 📦 **Mealie 容器**（`ghcr.io/mealie-recipes/mealie:latest`）+ **PostgreSQL 16**
- ✅ Web UI 监听 `127.0.0.1:9000`
- ✅ URL 抓取（粘贴食谱网站 URL → 自动解析食材 / 步骤 / 图）
- ✅ 周菜单计划 + 自动生成购物清单
- ✅ 多用户 + Group（家庭共享）
- ✅ 食谱评分 / 评论 / 标签
- ✅ 营养信息估算
- ✅ iOS / Android App

## 表单字段说明

### `ml_data_dir`

```
{data_dir}/
├── data/                 # 食谱图片 + 备份
└── postgres-data/         # PG（食谱 / 用户 / 评分）
```

### `ml_port` / `ml_admin_email` / `ml_admin_password`

⚠️ admin **仅首次启动**写入。后续改：

```bash
docker exec -it mealie /bin/sh
# 容器内：
cd /app
mealie reset-password admin@example.com
```

或 Web UI → User profile → Change password。

## 常见配置模板

### 模板 A — Nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name recipes.example.com;
    ssl_certificate     /etc/letsencrypt/live/recipes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recipes.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

容器加：

```yaml
environment:
  BASE_URL: "https://recipes.example.com"
```

### 模板 B — URL 导入食谱

```
+ Recipe → From URL
URL: https://www.allrecipes.com/recipe/...
（或下厨房 / 美食天下 / 等中文站）

→ 自动抓取标题 / 食材 / 步骤 / 图 / 营养 / 烹饪时间
```

### 模板 C — 周菜单 + 购物清单

```
1. Meal Plan → + Add → 周一晚餐 = 红烧肉
2. 一周配满
3. Shopping List → Generate from Meal Plan
   → 自动汇总所有食材去重
4. 打勾确认有 / 没有 → 去超市
```

### 模板 D — 加家庭成员

```
Settings → Users → + New User
  Email:  alice@example.com
  Password: ...
  Group:  家庭                (同 group 共享食谱)
  Admin:  false
```

### 模板 E — iOS App

应用商店搜 **Mealie** —— 官方 App。

```
Server URL:  https://recipes.example.com
Email:       admin@example.com
Password:    <密码>
```

### 模板 F — 备份

```bash
# Web UI 内置备份
# Admin → Site Settings → Backups → Create Backup
# 自动 zip 含所有食谱 / 图片 / 用户 → 下载

# 或 docker 层备份
sudo tar -czf mealie-$(date +%F).tar.gz -C /opt mealie
```

## 关键参数调优速查

| 食谱数 | RAM |
|---|---|
| < 500 | 200 MB |
| < 5000 | 400 MB |

## 跨发行版兼容

容器化跨发行版一致，ARM64 ✅。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`paperless-ngx`** — 互补（PNG 存账单 / 合同，Mealie 存食谱）

## 排错

### URL 导入失败

```bash
# 1. URL 真有效？容器能访问？
docker exec mealie curl -fsS https://recipe-site.com/recipe-xxx | head

# 2. 该网站 Mealie 不支持解析？
# Mealie 用 https://github.com/hhursev/recipe-scrapers
# 看支持列表

# 3. 手动添加：+ Recipe → Manual Entry
```

### 中文食谱图片不显示

```bash
# 部分网站防盗链 → 图片直接抓取失败
# 解：手动上传图片
# Recipe → Edit → 替换 Hero Image
```

### 数据库连接失败

```bash
# 1. PG 真起来？
docker exec mealie-db pg_isready -U mealie

# 2. 密码对？
# docker-compose.yml 里 POSTGRES_PASSWORD 应与 mealie env 里一致
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=mealie

# 2. Web 响应
curl -fsS http://127.0.0.1:9000/ -o /dev/null -w '%{http_code}\n'

# 3. PG 健康
docker exec mealie-db pg_isready -U mealie
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——PG 数据 / 食谱 / 用户全部保留。

## ⚠️ 敏感性

**safe** —— 食谱本身不敏感。但 admin 账号能管所有用户。

强制：

1. **公网必须 HTTPS**
2. admin 强密码
3. `ALLOW_SIGNUP: false`（默认，避免陌生人注册）

## 隐私说明

- **完全本地**——食谱 / 用户 / 计划在你服务器
- **零遥测**（开源）
- URL 导入主动连源食谱网站（暴露你的服务器 IP）
- 营养信息从 USDA 数据库本地查
