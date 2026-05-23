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

## 关键参数调优速查

### Concurrent jobs

```toml
# /etc/gitlab-runner/config.toml
concurrent = 4                              # 全机最多 4 个 job 并发
```

每个 job 独立资源——总 CPU / RAM 按 `concurrent × 单 job 占用` 估算。

### Cache 加速（避免每次重复下载依赖）

```toml
[[runners]]
  [runners.cache]
    Type = "s3"
    Path = "ci-cache"
    Shared = true
    [runners.cache.s3]
      ServerAddress = "minio.example.com:9000"
      AccessKey = "..."
      SecretKey = "..."
      BucketName = "ci-cache"
      Insecure = true
```

`.gitlab-ci.yml`:

```yaml
build:
  cache:
    key: "${CI_COMMIT_REF_SLUG}"
    paths:
      - node_modules/
      - .yarn/
  script:
    - yarn install --frozen-lockfile
    - yarn build
```

### Docker executor 优化

```toml
[runners.docker]
  pull_policy = ["if-not-present"]          # 避免每次拉镜像
  helper_image_flavor = "alpine"
  privileged = false
  shm_size = 268435456                       # 256MB（chrome / 测试需要）
```

### 资源占用

| 模式 | 单 job RAM | 单 job CPU |
|---|---|---|
| shell | 视项目 | 视项目 |
| docker | 200 MB+（无限制） | 视项目 |
| docker + 限制 | `mem_limit = "2g"` `cpus = 1.5` | 同 |

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `packages.gitlab.com/runner/gitlab-runner/{ubuntu,debian}` | `packages.gitlab.com/runner/gitlab-runner/el/9` |
| 包名 | `gitlab-runner` | `gitlab-runner` |
| 服务 | `gitlab-runner` | `gitlab-runner` |
| 用户 | `gitlab-runner` | `gitlab-runner` |

## 与其它 catalog 项的配合

- **`docker-host-profile`** — docker executor 必装前提
- **`gitea-server`** — Gitea 兼容 GitLab Runner（API 兼容）
- **`minio-storage`** — Cache 后端（模板 cache）
- **`vault-secrets`** — 通过 Vault 拿动态凭据，避免 CI variable 长期 secret

## 排错

### `couldn't execute POST against ... /api/v4/runners`

token 不对 / GitLab URL 错。重新拿 token：

```bash
sudo gitlab-runner unregister --all-runners
sudo gitlab-runner register      # 重新走向导
```

### Runner 显示 offline

```bash
sudo systemctl status gitlab-runner
sudo gitlab-runner verify
sudo journalctl -u gitlab-runner -n 50
```

常见：网络断、token 失效、机器时间偏差。

### Docker executor: `Cannot connect to Docker daemon`

```bash
sudo usermod -aG docker gitlab-runner
sudo systemctl restart gitlab-runner
```

### Job 超时

```yaml
# .gitlab-ci.yml
job:
  timeout: 2 hours                            # 默认 1 小时
```

或 `/etc/gitlab-runner/config.toml`:

```toml
[[runners]]
  build_dir = "/cache"
  cache_dir = "/cache"
  output_limit = 4096                         # KB
```

## 验证

```bash
# 1. 服务在跑
systemctl is-active gitlab-runner

# 2. Runner 注册了
sudo gitlab-runner list

# 3. 能连 GitLab
sudo gitlab-runner verify

# 4. 看版本
gitlab-runner --version

# 5. UI 上 runner 状态绿
# GitLab UI → Settings → CI/CD → Runners
```

## 配置文件速查

```
/etc/gitlab-runner/
├── config.toml                              # ← 主配置
├── certs/                                    # 自签 GitLab 用
└── builds/

/var/log/gitlab-runner/                      # 日志（按 job）
/home/gitlab-runner/                          # gitlab-runner 用户家目录
└── builds/                                    # 默认 build 目录

/usr/lib/gitlab-runner/                       # 二进制
/usr/bin/gitlab-runner                         # 主命令链接
```

| 项 | 说明 |
|---|---|
| 包名 | `gitlab-runner` |
| 服务 | `gitlab-runner` |
| 用户 | `gitlab-runner`（普通用户，shell executor 时构建以此身份跑） |
| 默认 build dir | `/home/gitlab-runner/builds/` |

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
