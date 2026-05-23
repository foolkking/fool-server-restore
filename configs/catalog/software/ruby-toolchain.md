# Ruby + Bundler

系统 Ruby 3 + Bundler（Ruby 的依赖管理器，等价 npm/pip/cargo）。装的是发行版仓库版本（Ubuntu 24 = 3.2，Debian 12 = 3.1，RHEL 9/Anolis 9 默认 = 3.0/3.3）。要多版本走 `rbenv`（不在本 Playbook，见配合区）。

## 你将得到什么

- 📦 **ruby**（系统 Ruby）
- 📦 **ruby-dev**（Ubuntu/Debian）/ **ruby-devel**（RHEL/Anolis）— `mkmf.rb` 头文件
- 📦 **bundler** gem（安装后立即可用）
- 📦 编译 native gem 必备：`build-essential` `libssl-dev` `zlib1g-dev`（Ubuntu）/ `gcc` `openssl-devel` `zlib-devel` `redhat-rpm-config`（RHEL）

## 配置文件 / 目录速查

```
# 系统 Ruby
/usr/bin/ruby                                 # 命令
/usr/lib/ruby/                                # 标准库
/var/lib/gems/3.X.0/                          # 系统级 gem 安装位置（Ubuntu）
/usr/share/gems/                              # 系统级 gem（RHEL）

# 用户级（强烈推荐）
~/.gem/                                       # 用户 gem（gem install --user-install）
~/.bundle/                                    # bundler 用户配置
~/.gemrc                                      # ← gem 命令配置（镜像源）

# 项目级
<project>/
├── Gemfile                                   # 依赖声明
├── Gemfile.lock                              # 锁定版本（提交到 git）
├── vendor/bundle/                            # 项目内 gem（bundle config set --local path 'vendor/bundle' 后）
└── config/                                   # Rails 配置
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名 | `ruby` `ruby-dev` `bundler` | `ruby` `ruby-devel` `rubygem-bundler` |
| 默认版本 | Ubuntu 22 = 3.0，Ubuntu 24 = 3.2，Debian 12 = 3.1 | RHEL 9 / Anolis 9 默认 3.0 |
| 装更新版方法 | brightbox PPA / rbenv | `dnf module enable ruby:3.3` |
| native gem 工具链 | `build-essential` | `@development-tools` 组 + `redhat-rpm-config` |

升级 Ruby 版本（不动系统包）：

```bash
# RHEL/Anolis 9 — 用 dnf module 切到 3.3
sudo dnf module list ruby
sudo dnf module reset ruby
sudo dnf module enable ruby:3.3 -y
sudo dnf install ruby ruby-devel rubygem-bundler -y
ruby --version

# Ubuntu — 用 brightbox PPA 装 3.3
sudo add-apt-repository ppa:brightbox/ruby-ng
sudo apt-get update
sudo apt-get install ruby3.3 ruby3.3-dev
sudo update-alternatives --config ruby
```

或彻底用 `rbenv`（多版本管理，见下文）。

## 常见配置模板

### 模板 A — 国内镜像源（`~/.gemrc`）

```yaml
# ~/.gemrc
:sources:
- https://gems.ruby-china.com/
gem: --no-document
:concurrent_downloads: 10
```

bundle 项目级镜像：

```bash
bundle config mirror.https://rubygems.org https://gems.ruby-china.com
# 验证
bundle config | head -20
```

国内服务器 `bundle install` 速度从 ~50KB/s 提到 ~30MB/s。

### 模板 B — 装 Rails 7 完整流程

```bash
# 1. 装 Rails
gem install rails -v '~> 7.2.0'
rails --version

# 2. 创建项目（默认 sqlite，生产改 PG）
rails new myapp --database=postgresql --skip-bundle
cd myapp

# 3. 装依赖
bundle config set --local path 'vendor/bundle'   # 本地隔离
bundle install

# 4. 数据库
sudo -u postgres createuser -P myapp_dev          # 提示输入密码
rails db:create db:migrate

# 5. 启动 dev server
rails server -b 0.0.0.0 -p 3000
```

### 模板 C — 多版本 Ruby（rbenv）

不要用系统 Ruby 装 Rails 等大依赖，长期会冲突。生产推荐 rbenv：

```bash
# 装 rbenv
git clone https://github.com/rbenv/rbenv.git ~/.rbenv
echo 'export PATH="$HOME/.rbenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(rbenv init -)"' >> ~/.bashrc

# 装 ruby-build 插件
git clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build

# 重开 shell
exec $SHELL

# 列可装版本
rbenv install --list-all | grep '^3\.[23]\.' | tail -10

# 装具体版本（编译 5-10 分钟）
rbenv install 3.3.5
rbenv global 3.3.5

# 验证
rbenv versions
ruby --version
```

项目根目录 `.ruby-version` 文件：

```
3.3.5
```

进目录后 rbenv 自动切换。

### 模板 D — Puma + nginx 反代生产部署

`config/puma.rb`：

```ruby
workers ENV.fetch('WEB_CONCURRENCY', 2)
threads_count = ENV.fetch('RAILS_MAX_THREADS', 5)
threads threads_count, threads_count

preload_app!

rackup      DefaultRackup
port        ENV.fetch('PORT', 3000)
environment ENV.fetch('RAILS_ENV', 'production')

bind "unix:///var/run/myapp/puma.sock"
pidfile "/var/run/myapp/puma.pid"
state_path "/var/run/myapp/puma.state"

stdout_redirect "/var/log/myapp/puma.log", "/var/log/myapp/puma.err.log", true
```

systemd unit：

```ini
# /etc/systemd/system/myapp-puma.service
[Unit]
Description=Puma for myapp
After=network.target

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
Environment="RAILS_ENV=production"
Environment="RACK_ENV=production"
ExecStart=/usr/bin/bundle exec puma -C /opt/myapp/config/puma.rb
Restart=on-failure
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

nginx 反代：

```nginx
upstream puma_myapp { server unix:///var/run/myapp/puma.sock fail_timeout=0; }

server {
    listen 80;
    server_name myapp.example.com;
    root /opt/myapp/public;

    location ~ ^/(assets|packs)/ {
        expires 1y;
        add_header Cache-Control public;
    }

    try_files $uri/index.html $uri @app;
    location @app {
        proxy_pass http://puma_myapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 关键参数调优速查

### Puma 并发模型

| 参数 | 推荐 | 说明 |
|---|---|---|
| `workers` | CPU 核数 | fork 数；每个独立内存空间 |
| `threads` | 5（min=max） | 每个 worker 内的线程数 |
| `RAILS_MAX_THREADS` | 5 | 数据库连接池大小 ≥ 此值 |
| 总并发 | workers × threads | 4 核 × 5 线程 = 20 并发 |

### Ruby GC（减少内存抖动）

```bash
# 提升 Ruby 启动后初始 heap，减少早期 GC
RUBY_GC_HEAP_INIT_SLOTS=600000
RUBY_GC_HEAP_FREE_SLOTS=600000
RUBY_GC_HEAP_GROWTH_FACTOR=1.25
RUBY_GC_HEAP_GROWTH_MAX_SLOTS=300000

# 写到 systemd unit Environment 或 ~/.bashrc
```

### Bundler

| 命令 | 用途 |
|---|---|
| `bundle install` | 装依赖 |
| `bundle install --deployment` | 生产模式（严格按 lockfile） |
| `bundle update <gem>` | 升级特定包 |
| `bundle exec <cmd>` | 用项目锁定的 gem 跑命令 |
| `bundle config set --local path 'vendor/bundle'` | 装到项目 vendor 而非全局 |

## 跨发行版兼容

EnvForge 通过 PACKAGE_ALIASES 自动翻译：

| 包目的 | Ubuntu/Debian | RHEL/Anolis |
|---|---|---|
| Ruby 主包 | `ruby` | `ruby` |
| 头文件（编译 C 扩展用） | `ruby-dev` | `ruby-devel` |
| Bundler | `bundler` | `rubygem-bundler` |
| 编译工具链 | `build-essential` | `@development-tools` 组 |

**RHEL 9 / Anolis 9 注**：默认 Ruby 是 3.0（即将 EOL）。生产建议切到 3.3：

```bash
sudo dnf module reset ruby
sudo dnf module enable ruby:3.3 -y
sudo dnf install ruby ruby-devel rubygem-bundler -y
```

## 与其它 catalog 项的配合

- **`postgres-profile`** — Rails 默认推荐 PG；`pg` gem 编译需要 `libpq-dev` / `postgresql-devel`
- **`redis-server`** — Sidekiq / ActionCable 标准依赖
- **`nginx-web-service`** — Puma + nginx 是 Rails 生产部署事实标准（模板 D）
- **`certbot-ssl`** — HTTPS 终结在 nginx
- **`docker-host-profile`** — 用 `ruby:3.3-slim` 多阶段构建 Rails 镜像

## 排错

### `gem install <name>` 报 native extension 失败

```
ERROR: Failed to build gem native extension.
mkmf.rb can't find header files for ruby
```

`ruby-dev` / `ruby-devel` 没装。重跑 Playbook 即可。

### 编译 `pg` / `mysql2` / `sqlite3` 失败

数据库 client 头文件缺：

```bash
# Ubuntu/Debian
sudo apt-get install libpq-dev libmysqlclient-dev libsqlite3-dev

# RHEL/Anolis
sudo dnf install postgresql-devel mariadb-connector-c-devel sqlite-devel
```

### 编译 `nokogiri` 失败 / 极慢

老版 nokogiri 编译 libxml2/libxslt 极慢（5-10 分钟）。新版（1.16+）默认下载预编译 native gem：

```bash
gem install nokogiri --version '~> 1.16'
```

如非要从源码编译：

```bash
sudo apt-get install libxml2-dev libxslt1-dev      # Ubuntu
sudo dnf install libxml2-devel libxslt-devel       # RHEL
```

### `Could not find ... in any of the sources`

bundle 找不到包，通常网络问题或镜像没生效：

```bash
bundle config get mirror.https://rubygems.org      # 看用的镜像
bundle config set mirror.https://rubygems.org https://gems.ruby-china.com
```

或用 `bundle install --verbose` 看具体哪个包卡住。

### `gem` 装的命令找不到

`gem install --user-install` 装到 `~/.gem`，需 PATH。

```bash
echo 'export PATH=$(ruby -e "puts Gem.user_dir")/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Rails 启动报 `cannot load such file -- bcrypt`

bcrypt 是 native gem，编译失败常见。先装编译依赖（见上），再重新 bundle：

```bash
gem uninstall bcrypt
bundle install
```

## 验证

```bash
# 1. 命令存在
ruby --version                       # ruby 3.x.x
gem --version

# 2. bundler 可用
bundle --version

# 3. native gem 能编（最常坑）
gem install --user-install bcrypt --no-document
gem list --local | grep bcrypt

# 4. 跑 hello world
ruby -e 'puts "Ruby OK at #{RUBY_VERSION}"'
```

## 多次运行

`installMode: skip-existing`。各包用 apt/dnf 幂等行为。要升级到下一 major（如 RHEL 9 切 3.3）：先用 `dnf module reset` + `enable` 切上下文，再重跑 Playbook。

## ⚠️ 敏感性

**safe** — 装语言运行时和编译依赖。不开端口、不动数据。

## 隐私说明

- 不发遥测
- `gem install` 时 User-Agent 含 Ruby 版本和 OS 类型（不含个人信息）
- 镜像源会看到你装了什么 gem
- `~/.gemrc` 如配私有源 token，权限自动 0644，建议手动 `chmod 600`
- Rails 应用启动后是否发遥测取决于具体业务代码（如 New Relic / Datadog SDK）
