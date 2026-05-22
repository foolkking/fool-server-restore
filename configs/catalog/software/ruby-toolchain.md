# Ruby + Bundler

Ruby 3 + Bundler（Ruby 的包管理器，等价于 npm/pip/cargo）。装系统 Ruby——
如果你需要多版本 Ruby，用 rbenv 或 rvm（不在本 Playbook 范围）。

## 你将得到什么

- 📦 **ruby** + **ruby-dev**（Ubuntu）/ **ruby-devel**（RHEL）
- 📦 **bundler** gem
- ✅ build 依赖（让 native gem 能编过）

## 用法

```bash
ruby --version
gem --version
bundle --version
```

### 装 Rails

```bash
gem install rails
rails --version
rails new myapp
cd myapp
bundle install
rails server -b 0.0.0.0
```

### 国内 RubyGems 镜像

```bash
gem sources --add https://gems.ruby-china.com/
gem sources --remove https://rubygems.org/
gem sources -l       # 验证

# 项目级：
bundle config mirror.https://rubygems.org https://gems.ruby-china.com
```

### 多版本 Ruby（用 rbenv）

```bash
git clone https://github.com/rbenv/rbenv.git ~/.rbenv
echo 'export PATH="$HOME/.rbenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(rbenv init -)"' >> ~/.bashrc

git clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build

rbenv install 3.3.5
rbenv global 3.3.5
```

### 部署 Rails 应用

```bash
RAILS_ENV=production bundle install --deployment
RAILS_ENV=production rails db:migrate
RAILS_ENV=production rails assets:precompile

# 用 puma + nginx 反代，systemd unit 跑
```

## ⚠️ 敏感性

**safe** — 装语言运行时。

## 验证

```bash
ruby --version
gem list bundler
```

## 排错

- **`gem install` 报 native extension 编译失败** — `ruby-dev` / `ruby-devel` 没装。
- **`Could not find gem ...`** — bundle 时找不到包：网络问题或镜像没设。
- **跨发行版**：包名差异（`ruby-dev` vs `ruby-devel`），EnvForge 已通过 PACKAGE_ALIASES 处理。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

不发遥测。RubyGems 默认源是 rubygems.org。
