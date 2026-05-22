# Jenkins CI/CD

Jenkins 是开源 CI/CD 系统的"老大哥"——20 年历史，几千个插件。功能强大但配置复杂，
适合大型企业。简单场景建议看 GitLab Runner / GitHub Actions / Drone。

## 你将得到什么

- 📦 **jenkins** + **OpenJDK 17**
- ✅ HTTP 端口 8080（按表单可改）
- ✅ JVM 堆按表单值
- ✅ 服务自动启动并设开机自启

## 第一次访问

打开 `http://server-ip:8080`，会要求**初始管理员密码**：

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

复制密码，粘贴到 web 里。

接着会引导你：
1. 装推荐插件（5-10 分钟）
2. 创建管理员账号

## 安装后

### 装常用插件

UI → Manage Jenkins → Plugins → Available。常用：
- **Pipeline** — declarative pipeline 支持（写 Jenkinsfile）
- **Git** — git 集成
- **GitHub Integration** — webhook + status check
- **Credentials Binding** — 安全管理 secret
- **Docker Pipeline** — 在 Docker 里跑构建步骤
- **SSH Agent** — 用 SSH key clone 私有仓库
- **Build Timeout** — 防止 hang 住的任务
- **Slack/Email Extension** — 告警通知

### 反向代理 + HTTPS（生产推荐）

```nginx
server {
    listen 443 ssl http2;
    server_name jenkins.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
}
```

Jenkins 配 → Configure System → Jenkins URL 改成 `https://jenkins.example.com`。

### 第一个 Pipeline 示例

`Jenkinsfile`（放在你的 git 仓库根目录）：
```groovy
pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps {
                git url: 'https://github.com/me/myapp.git', branch: 'main'
            }
        }
        stage('Build') {
            steps {
                sh 'npm install'
                sh 'npm run build'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
        stage('Deploy') {
            when { branch 'main' }
            steps {
                sh 'rsync -avz dist/ deploy@server:/var/www/app/'
            }
        }
    }
    post {
        failure {
            mail to: 'team@example.com', subject: 'Build failed', body: '...'
        }
    }
}
```

UI → New Item → Pipeline → 配 Git 仓库 + Jenkinsfile path。

### 部署到远程机器（SSH）

UI → Manage Jenkins → Credentials → Add → SSH Username with private key。

Jenkinsfile 里：
```groovy
withCredentials([sshUserPrivateKey(credentialsId: 'deploy-key', keyFileVariable: 'KEY')]) {
    sh 'rsync -avz -e "ssh -i $KEY -o StrictHostKeyChecking=no" dist/ deploy@server:/var/www/app/'
}
```

### Jenkins Agent（多机构建）

Jenkins master 跑 web UI + 调度，agent 跑实际构建。Master 单独一台，agent 多台分担负载。

UI → Manage Jenkins → Nodes → New Node。配 SSH 连接到 agent 机器。

### 备份

`/var/lib/jenkins/` 包含所有任务配置、构建历史、凭据：
```bash
sudo tar czf jenkins-$(date +%F).tar.gz /var/lib/jenkins
```

或者用 ThinBackup 插件（UI 里配置）。

## ⚠️ 敏感性

**privileged** — Jenkins 可能跑你所有项目的构建脚本，里面有部署凭据。**Jenkins 攻陷 = 所有部署目标攻陷**。
1. 不要 8080 直接暴露公网
2. 反向代理 + HTTPS + IP 白名单
3. 启用 Jenkins 的 Authorization Strategy（Matrix-based 推荐）
4. 用 Credentials Plugin 而不是把密码写到 Jenkinsfile 里

## 验证

```bash
systemctl status jenkins --no-pager
curl -I http://localhost:8080/
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

## 排错

- **服务起不来 + Java 版本错** — Jenkins 现版本要求 Java 11/17/21。Playbook 已装 Java 17。
- **首次启动很慢** — 是正常的，30-60 秒。
- **`Jenkins is fully up and running` 但 web 还是 503** — Java OOM。调大 `java_max_heap`。
- **跨发行版**：Jenkins 官方仓库覆盖 Ubuntu / Debian / RHEL / Anolis。

## 多次运行

`installMode: skip-existing`。已装就跳过；端口和堆设置每次会按表单值更新。

## 隐私说明

- initial admin 密码在 `/var/lib/jenkins/secrets/initialAdminPassword`，仅 jenkins 用户可读。
- Jenkins 自身不发遥测，但很多插件会（如 Adobe Analytics 插件）。

## 关键配置文件 / 路径

```
/etc/default/jenkins (Ubuntu)        # 启动参数：JVM 选项、HTTP 端口、JENKINS_HOME
/etc/sysconfig/jenkins (RHEL)        # 同上
/lib/systemd/system/jenkins.service  # systemd 单元（不要直接改，用 override）
/var/lib/jenkins/                    # JENKINS_HOME（核心数据目录）
├── config.xml                       # 全局配置
├── jenkins.model.JenkinsLocationConfiguration.xml   # Jenkins URL 等
├── credentials.xml                  # 全局凭据（加密存储）
├── secrets/                         # SECRET key + 加密 token
├── jobs/                            # 每个 Job 一个目录（含构建历史 build/）
├── plugins/                         # 已装插件 .hpi/.jpi
├── workspace/                       # 各 Job 的工作区（构建产物）
├── nodes/                           # Agent 节点定义
└── users/                           # 本地认证用户
/var/log/jenkins/jenkins.log         # 主日志
```

> **JENKINS_HOME (`/var/lib/jenkins`) = Jenkins 的全部状态**。备份/迁移的全部就是这一个目录。

### `/etc/default/jenkins`（Ubuntu）/ `/etc/sysconfig/jenkins`（RHEL）

控制 systemd 启动 Jenkins 时的 Java 参数 + 监听端口：

```bash
# 端口
HTTP_PORT=8080
HTTPS_PORT=-1                          # -1 = 不开 HTTPS（推荐通过反代上 HTTPS）

# JVM 参数（堆 + GC + 字符集）
JAVA_ARGS="-Djava.awt.headless=true \
  -Xms2g -Xmx2g \
  -XX:+UseG1GC \
  -XX:+ExplicitGCInvokesConcurrent \
  -XX:+ParallelRefProcEnabled \
  -XX:+UseStringDeduplication \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -Djenkins.install.runSetupWizard=false"  # 已经初始化过的实例可跳过向导

# Jenkins 自带参数
JENKINS_ARGS="--httpPort=$HTTP_PORT \
  --httpListenAddress=127.0.0.1 \        # 仅本机监听，挂反代时用
  --prefix=/jenkins"                     # URL 前缀，挂在 /jenkins/ 路径下时填
```

> Ubuntu 22+ 上 jenkins.service 不再读 `/etc/default/jenkins`，要用 systemd override：
> ```bash
> sudo systemctl edit jenkins
> ```
> 在打开的编辑器里写：
> ```
> [Service]
> Environment="JAVA_OPTS=-Xms2g -Xmx2g -Duser.timezone=Asia/Shanghai"
> Environment="JENKINS_OPTS=--httpListenAddress=127.0.0.1"
> ```

改完：
```bash
sudo systemctl daemon-reload
sudo systemctl restart jenkins
```

### Reverse-proxy（必备）：禁用 jenkins 直接 HTTPS，全部托给 nginx

`Manage Jenkins` → `Configure System` → `Jenkins URL` 填 `https://jenkins.example.com/`
（让生成的链接是 https）。

nginx 配置：
```nginx
upstream jenkins {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name jenkins.example.com;

    ssl_certificate     /etc/letsencrypt/live/jenkins.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jenkins.example.com/privkey.pem;

    # Jenkins 文件上传 / 大产物下载需要大 buffer
    client_max_body_size 200m;
    sendfile             on;

    location / {
        proxy_pass         http://jenkins;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";

        proxy_read_timeout 600s;            # 长跑的 console 流式输出需要

        # WebSocket（agent ↔ master 通信、blue ocean 实时面板）
        proxy_set_header Upgrade             $http_upgrade;
        proxy_set_header Connection          $http_connection;
    }
}
```

### CSP（Content Security Policy）放宽（HTML report 显示问题）

Jenkins 默认 CSP 很严格——很多 HTML report（test report、coverage）样式/JS 不显示。
方法 1（推荐，每个用户都生效）：`Manage Jenkins` → `Script Console`：
```groovy
System.setProperty("hudson.model.DirectoryBrowserSupport.CSP",
    "sandbox allow-scripts; default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';")
```
但**重启 Jenkins 后失效**。要持久化，改 `JAVA_ARGS` 加：
```
-Dhudson.model.DirectoryBrowserSupport.CSP="sandbox allow-scripts; default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
```

### Jenkins-as-Code（JCasC）— 配置可重复

UI 点配置改的所有内容都是 `JENKINS_HOME/*.xml` 文件。直接改 XML 容易出错——
推荐用 **JCasC 插件** 把配置写成 yaml：

```bash
# 装插件 configuration-as-code
# Manage Jenkins → Plugins → Available → "Configuration as Code"
```

`/var/lib/jenkins/casc.yaml`：
```yaml
jenkins:
  systemMessage: "Welcome to EnvForge-managed Jenkins"
  numExecutors: 4
  mode: NORMAL

  securityRealm:
    local:
      allowsSignup: false
      users:
        - id: admin
          password: ${ADMIN_PASS}        # 从环境变量读

  authorizationStrategy:
    loggedInUsersCanDoAnything:
      allowAnonymousRead: false

unclassified:
  location:
    url: https://jenkins.example.com/

  gitHubPluginConfig:
    configs:
      - name: github.com
        apiUrl: https://api.github.com
        credentialsId: github-token
```

设环境变量 `CASC_JENKINS_CONFIG=/var/lib/jenkins/casc.yaml`，下次启动应用。

### 备份 JENKINS_HOME（每天必做）

```bash
sudo systemctl stop jenkins
sudo tar czf /backup/jenkins-$(date +%F).tar.gz \
    --exclude='/var/lib/jenkins/workspace' \
    --exclude='/var/lib/jenkins/caches' \
    --exclude='/var/lib/jenkins/.cache' \
    /var/lib/jenkins
sudo systemctl start jenkins
```

`workspace/` 和 `caches/` 可以从源码 + 缓存重建，不用备份。

### 升级 Jenkins

```bash
sudo apt-get update && sudo apt-get install --only-upgrade jenkins   # Ubuntu
sudo dnf upgrade jenkins                                              # RHEL
sudo systemctl restart jenkins
```

升级前**务必先备份 JENKINS_HOME**——大版本升级偶尔有不向后兼容的插件。
