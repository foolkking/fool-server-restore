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
