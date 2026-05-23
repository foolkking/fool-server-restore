# Stirling PDF 工具箱

Stirling PDF 是**完整 PDF 工具集**——50+ 操作（合并 / 拆分 / 压缩 / OCR / 加密 / 转换 / 签名 / 加水印 / 删页 / 等），**完全本地处理**——重要文档不上传第三方。**适合**：替代付费 Adobe Acrobat / iLovePDF / SmallPDF。Java 写，500MB RAM 起步。

## 你将得到什么

- 📦 **Stirling PDF 容器**（`docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest`）
- ✅ Web UI 监听 `127.0.0.1:8089`
- ✅ **50+ PDF 操作**（合并 / 拆分 / 压缩 / 转换 / 签名 / OCR / etc）
- ✅ Tesseract OCR 集成（含语言包目录）
- ✅ 多用户模式（默认）/ 单用户模式（可选）
- ✅ 中英双语 UI
- ✅ 拖拽上传

## 表单字段说明

### `sp_data_dir`

```
{data_dir}/
├── configs/        # 主配置
├── logs/           # 日志
├── tessdata/       # Tesseract OCR 语言包
├── customFiles/    # 自定义模板 / 字体
└── extraConfigs/   # 高级配置
```

### `sp_port`

本机端口，默认 8089。生产用反代。

### `sp_single_user`

| 模式 | 用法 | 安全 |
|---|---|---|
| `false`（推荐） | 多用户 + 登录 | 默认 admin/stirling **必改** |
| `true` | 无登录直接用 | **仅内网 + IP 白名单** |

## 常见配置模板

### 模板 A — Nginx 反代 + HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name pdf.example.com;

    ssl_certificate     /etc/letsencrypt/live/pdf.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pdf.example.com/privkey.pem;

    # 大 PDF 上传
    client_max_body_size 500M;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:8089;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 模板 B — 首次登录改密码

```
1. 浏览器打开 → admin / stirling 登录
2. 右上角用户图标 → Account Settings
3. Change password → 输新密码 → Save
```

### 模板 C — 加 OCR 中文支持

```bash
# 下载 chi_sim 语言包（来自 Tesseract 官方）
sudo wget -O /opt/stirling-pdf/tessdata/chi_sim.traineddata \
  https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata

# 加繁体
sudo wget -O /opt/stirling-pdf/tessdata/chi_tra.traineddata \
  https://github.com/tesseract-ocr/tessdata/raw/main/chi_tra.traineddata

# 重启
docker restart stirling-pdf
```

之后 OCR 工具的语言下拉会有中文选项。

### 模板 D — 加用户

```
admin 登录 → 顶部菜单 → Settings → Users
+ Add User
  Username:   alice
  Password:   <密码>
  Role:       USER（普通用户）/ ADMIN
Save
```

### 模板 E — 自定义品牌

```yaml
# docker-compose.yml 改
environment:
  UI_APPNAME: "Acme PDF Tools"
  UI_HOMEDESCRIPTION: "Internal PDF processing"
```

或挂载自定义 logo：

```yaml
volumes:
  - ./mylogo.png:/customFiles/static/images/logo.png:ro
```

### 模板 F — 高级配置

`/opt/stirling-pdf/configs/settings.yml`（首次启动自动生成）：

```yaml
system:
  defaultLocale: zh_CN
  googleVisibility: false      # 不让 Google 索引
  enableAlphaFunctionality: false

ui:
  appName: "Acme PDF"
  homeDescription: "Internal tools"

endpoints:
  toRemove: []                  # 禁用某些工具
  groupsToRemove: []

security:
  enableLogin: true
  initialLogin:
    username: admin
    password: stirling
  loginAttemptCount: 5
  loginResetTimeMinutes: 120
```

### 模板 G — 备份

```bash
sudo tar -czf stirling-backup.tar.gz -C /opt stirling-pdf
```

## 关键参数调优速查

### 资源占用

| 操作 | RAM | CPU |
|---|---|---|
| Idle | 500 MB | < 1% |
| 单 PDF 处理 | +200 MB | 1 vCPU |
| OCR 大文件 | +500 MB | 1 vCPU 100% |

Java 应用——基础内存固定，操作时增量。

### Java heap 调优

```yaml
environment:
  JAVA_OPTS: "-Xms512m -Xmx2g"
```

## 跨发行版兼容

容器化跨发行版一致。

| 项 | 状态 |
|---|---|
| Ubuntu / Debian | ✅ |
| RHEL / Anolis 9 | ✅ |
| ARM64（Apple Silicon / 树莓派） | ✅ |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`paperless-ngx`** — 互补（Stirling 一次性处理工具，PNG 长期文档管理）

## 排错

### 启动失败 / OOM

```bash
docker logs stirling-pdf | tail -50
# Java OOM → 调 JVM heap（见模板）

# 或减少功能（设置 INSTALL_BOOK_AND_ADVANCED_HTML_OPS=false）
```

### OCR 中文乱码

```bash
# 1. 装语言包了？
ls /opt/stirling-pdf/tessdata/
# 应有 chi_sim.traineddata

# 2. 容器内能看到？
docker exec stirling-pdf ls /usr/share/tessdata/

# 3. 重启
docker restart stirling-pdf
```

### 大 PDF 上传失败

```bash
# 反代调大 client_max_body_size
client_max_body_size 1G;

# 容器内 Spring 也有限制
environment:
  SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE: 1GB
  SPRING_SERVLET_MULTIPART_MAX_REQUEST_SIZE: 1GB
```

### 默认密码登不进

```bash
# admin / stirling 是默认
# 反复失败可能被 brute-force lockout
# 等 2 小时或重启容器
```

## 验证

```bash
# 1. 容器跑着
docker ps --filter name=stirling-pdf

# 2. Web 响应
curl -fsS http://127.0.0.1:8089/ -o /dev/null -w '%{http_code}\n'

# 3. OCR 语言列表
docker exec stirling-pdf ls /usr/share/tessdata/
```

## 多次运行

`installMode: skip-existing`。`docker-compose.yml` 重写——配置 / OCR 语言包 / 用户都保留。

## ⚠️ 敏感性

**safe** —— Stirling PDF 仅本地处理，无外联。但 admin 默认密码必须立即改。

强制：

1. **公网必须 HTTPS**
2. 默认 admin / stirling **首次登录立即改**
3. 大量内部敏感 PDF 处理 → 加 SSO / IP 白名单

## 隐私说明

- **完全本地处理**——文件不上传任何第三方
- **零遥测**（开源）
- 所有操作在容器内完成（合并 / 压缩 / OCR / etc）
- 处理完的临时文件自动清理（默认 30 分钟）
