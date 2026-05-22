# GitLab Runner

GitLab Runner 是 GitLab CI/CD 的执行端——你的 GitLab 项目的 `.gitlab-ci.yml` 定义了流水线，
Runner 接到任务后实际跑命令。GitLab.com SaaS 自带共享 runner（每月 400 分钟免费），
跑得多就要自建 runner。

## 你将得到什么

- 📦 **gitlab-runner**（来自 GitLab 官方仓库）
- ✅ 可选：自动向 GitLab 注册（需 registration_token）
- ✅ 服务自动启动并设开机自启

## 表单字段说明

### GitLab URL

- **gitlab.com SaaS**：`https://gitlab.com`
- **自建实例**：`https://gitlab.example.com`

### Registration Token

在 GitLab UI 拿：

- **项目级 runner**（推荐）：项目 → Settings → CI/CD → Runners → 复制 registration token
- **Group runner**：group → CI/CD → Runners
- **Instance runner**（仅 admin）：Admin → CI/CD → Runners

留空就只装不注册，后续手动 `sudo gitlab-runner register`。

### Executor

- **shell** — 直接在本机跑命令。最简单，但每次构建可能污染主机环境。适合：单一项目的部署机器。
- **docker** — 每个 job 起一个独立 Docker 容器。最干净，每次构建从全新环境开始。前置：装 docker。**推荐**。
- **ssh** — Runner 在 A 机器，实际构建跑在 B 机器。

## 安装后

### 看 runner 状态

GitLab UI → Settings → CI/CD → Runners 应该看到此 runner。绿色 = 在线接活。

```bash
sudo gitlab-runner list                # 看本机所有 runner 配置
sudo gitlab-runner verify              # 验证能连 GitLab
sudo gitlab-runner --debug run         # 前台跑看日志
```

### 修改配置

`/etc/gitlab-runner/config.toml`：
```toml
concurrent = 4   # 同时跑几个 job

[[runners]]
  name = "production-deploy"
  url = "https://gitlab.com"
  token = "..."
  executor = "shell"

  # docker executor 例：
  # executor = "docker"
  # [runners.docker]
  #   image = "alpine:latest"
  #   privileged = false
  #   pull_policy = "if-not-present"
```

改完 `sudo systemctl restart gitlab-runner`。

### 注册多个 runner

```bash
sudo gitlab-runner register
# 跟着向导走（或者重跑此 Playbook 但每次只能注册一个）
```

### 用 tag 限定 job 跑在哪个 runner

`.gitlab-ci.yml`：
```yaml
deploy:
  stage: deploy
  tags:
    - production       # 只在带 production tag 的 runner 上跑
  script:
    - rsync ...
```

GitLab UI 里给 runner 编辑 tag。

### Docker executor + Docker-in-Docker

如果你的 CI 任务需要构建 Docker 镜像：

```yaml
build:
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t myimage .
```

需要 runner 配置 privileged：
```toml
[runners.docker]
  privileged = true     # 警告：privileged 容器有 root 权限
```

更安全的选择：用 [kaniko](https://github.com/GoogleContainerTools/kaniko) 不需要 privileged。

### 取消注册

```bash
sudo gitlab-runner unregister --all-runners
# 或单个
sudo gitlab-runner unregister --name "production-deploy"
```

## ⚠️ 敏感性

**privileged** — Runner 跑你 CI 里所有 script，里面通常有部署凭据。**Runner 攻陷 = 你所有项目的部署目标攻陷**。
1. shell executor 务必专机专用，不要 shell executor + 共享 runner
2. docker executor 不要 privileged（除非真要 dind）
3. 用 GitLab 的 protected variable，敏感凭据只在 protected branch 暴露

## 验证

```bash
systemctl status gitlab-runner --no-pager
sudo gitlab-runner list
sudo gitlab-runner verify
```

## 排错

- **`couldn't execute POST against https://gitlab.com/api/v4/runners`** — token 不对，或者 GitLab 自建实例 URL 写错。
- **`Job failed: prepare environment: dial tcp ... i/o timeout`** — Runner 连不到 GitLab。检查防火墙和 DNS。
- **跨发行版**：用 GitLab 官方仓库，覆盖 Ubuntu / Debian / RHEL / Anolis。

## 多次运行

`installMode: skip-existing`。包不重装，但**注册一次后再次填 token 重跑会创建第二个 runner**——这往往不是你想要的。要么重跑前 unregister 旧的，要么 token 留空不重新注册。

## 隐私说明

- registration_token 会在任务日志里出现一次（敏感！）。完成后建议在 GitLab 重新生成 token。
- 注册后 runner 用 runner-specific token（不再是 registration_token）和 GitLab 通信，存在 `/etc/gitlab-runner/config.toml`。
