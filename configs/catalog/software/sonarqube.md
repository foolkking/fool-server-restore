# SonarQube 代码质量

SonarQube 是代码静态分析平台——扫描代码找 bug / 安全漏洞 / 代码异味（code smell），
30+ 编程语言。在 CI 流水线里跑 sonar-scanner，把结果展示到 SonarQube web UI。

此 Playbook 装 **Community Edition（开源版）**，内置 H2 数据库（开发测试用）。
生产应用必须用外接 PostgreSQL——本 Playbook 不含此步。

## 你将得到什么

- ✅ SonarQube CE 10.x 装到 `/opt/sonarqube`
- ✅ Java 17（SonarQube 必需）
- ✅ `vm.max_map_count = 524288`（Elasticsearch 启动必需）
- ✅ 专用 sonarqube 系统用户
- ✅ systemd 服务

**首次启动慢（1-3 分钟）**——要起内嵌 Elasticsearch + 创建索引。

## 安装后

### 默认登录

`http://server-ip:9000`

默认账号：`admin / admin`，**首次登录会强制要求改密码**。

### 跑你的第一次扫描

1. UI → Projects → Create Project
2. 选项目类型（manual / from GitHub / from GitLab / 等）
3. 填项目 key + name
4. 生成 token（保存好）
5. 选语言 + 构建工具，复制扫描命令到本地跑：

```bash
# Maven 项目
mvn sonar:sonar \
  -Dsonar.projectKey=myproject \
  -Dsonar.host.url=http://server:9000 \
  -Dsonar.token=...

# 通用（用 sonar-scanner CLI）
sonar-scanner \
  -Dsonar.projectKey=myproject \
  -Dsonar.sources=. \
  -Dsonar.host.url=http://server:9000 \
  -Dsonar.token=...

# Node.js（用 sonar-scanner npm 包）
npx sonar-scanner -Dsonar.host.url=http://server:9000 -Dsonar.token=...
```

扫描完成后回 UI 看结果：bugs / vulnerabilities / code smells / coverage / duplications。

### 切换到 PostgreSQL（生产必备）

H2 不适合多用户/大项目。切 PostgreSQL：

1. 创建 PostgreSQL 数据库：
```sql
CREATE DATABASE sonarqube;
CREATE USER sonarqube WITH ENCRYPTED PASSWORD 'sonarqube';
GRANT ALL ON DATABASE sonarqube TO sonarqube;
```

2. 编辑 `/opt/sonarqube/conf/sonar.properties`：
```properties
sonar.jdbc.username=sonarqube
sonar.jdbc.password=sonarqube
sonar.jdbc.url=jdbc:postgresql://localhost/sonarqube
```

3. 重启 + SonarQube 第一次启动时自动建 schema：
```bash
sudo systemctl restart sonarqube
```

### 集成到 CI

GitHub Actions 例：
```yaml
- name: SonarQube Scan
  uses: SonarSource/sonarqube-scan-action@v2
  env:
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

GitLab CI 例：
```yaml
sonarqube-check:
  image: sonarsource/sonar-scanner-cli:latest
  variables:
    SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"
  script:
    - sonar-scanner
      -Dsonar.host.url=$SONAR_HOST_URL
      -Dsonar.token=$SONAR_TOKEN
```

### 反向代理（生产必备）

```nginx
server {
    listen 443 ssl http2;
    server_name sonar.example.com;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 关键参数调优速查

### 资源占用

SonarQube 是 **JVM + Elasticsearch** 双服务，**最低要求 3 GB RAM**。

| 项目数 | RAM | CPU | 磁盘 |
|---|---|---|---|
| 个人（< 10 项目） | 4 GB | 2 vCPU | 10 GB |
| 小团队（< 50 项目） | 8 GB | 4 vCPU | 50 GB |
| 中型（< 500 项目） | 16 GB | 8 vCPU | 200 GB |

### JVM 调优 `/opt/sonarqube/conf/sonar.properties`

```properties
# Web server JVM
sonar.web.javaOpts=-Xmx2g -Xms2g -XX:+UseG1GC

# Compute Engine（分析作业）
sonar.ce.javaOpts=-Xmx4g -Xms2g -XX:+UseG1GC

# Search server (Elasticsearch)
sonar.search.javaOpts=-Xmx4g -Xms4g -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError
```

### vm.max_map_count（必设）

```bash
sudo sysctl -w vm.max_map_count=524288
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf
```

EnvForge Playbook 自动配。

### File handle limit

```bash
# /etc/security/limits.d/99-sonarqube.conf
sonarqube   -   nofile   65536
sonarqube   -   nproc    4096
```

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方式 | 二进制 zip 解压 | 同 |
| Java | OpenJDK 17 | OpenJDK 17 |
| 安装位置 | `/opt/sonarqube` | 同 |
| 服务名 | `sonarqube` | `sonarqube` |
| Anolis 9 | – | ✅（与 RHEL 9 一致） |

## 与其它 catalog 项的配合

- **`openjdk-runtime`** — Java 17 是 SonarQube 必装前提
- **`postgres-profile`** — 生产 backend（替代内嵌 H2）
- **`nginx-web-service`** + **`certbot-ssl`** — 反代 + HTTPS
- **`jenkins-ci` / `gitlab-runner`** — CI 跑 sonar-scanner

## 配置文件速查

```
/opt/sonarqube/
├── bin/                                   # 启动脚本
├── conf/
│   └── sonar.properties                    # ← 主配置
├── data/                                    # 索引 + ES 数据
│   ├── es8/                                 # Elasticsearch
│   └── h2/                                   # H2 数据库（开发用）
├── extensions/                               # 扩展 plugin
├── logs/
│   ├── sonar.log                            # 主日志
│   ├── ce.log                                # Compute Engine
│   ├── es.log                                 # Elasticsearch
│   └── web.log
└── temp/

/etc/systemd/system/sonarqube.service       # systemd unit
```

| 项 | 说明 |
|---|---|
| 端口 | 9000（默认） |
| 数据目录 | `/opt/sonarqube/data/` |
| 用户 | `sonarqube`（**不能用 root 启动**——SonarQube 拒绝） |

## 验证

```bash
systemctl status sonarqube --no-pager
sudo cat /opt/sonarqube/logs/sonar.log | tail -30
curl -I http://localhost:9000/
sysctl vm.max_map_count   # 应是 524288
```

## 排错

- **服务起来一会儿就挂** — 看 `/opt/sonarqube/logs/es.log`（内嵌 Elasticsearch 日志）。最常见：`max virtual memory areas vm.max_map_count [65530] is too low`。Playbook 已配 sysctl，如果没生效手动 `sudo sysctl -w vm.max_map_count=524288`。
- **Java 版本错** — SonarQube 10+ 要求 Java 17。Playbook 已装。
- **首次启动慢** — 正常，1-3 分钟。
- **跨发行版**：用二进制 zip 安装，无包管理器差异。但 Java 17 包名不同（已通过 PACKAGE_ALIASES 处理）。

## 多次运行

`installMode: skip-existing`。已装就跳过下载，端口配置每次重写。

## 隐私说明

- SonarQube CE 不发遥测（商业版有 telemetry 选项）。
- 扫描结果存本地数据库（H2 或 PostgreSQL），不上传。
