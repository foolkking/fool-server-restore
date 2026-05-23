# Flutter SDK

Flutter 是 Google 的跨平台 UI 框架——一份 Dart 代码同时编出 iOS / Android / Web / Linux / Windows / macOS 应用。**服务器场景**主要是 CI/CD ——跑 `flutter build apk` / `flutter build web` 这种构建任务。开发本身在桌面/笔记本上做（用 Android Studio / VS Code）。

## 你将得到什么

- ✅ Flutter SDK 装到 `/opt/flutter`（git 浅克隆 stable channel）
- ✅ `/opt/flutter/bin` 加入系统 PATH（`/etc/profile.d/flutter.sh`）
- ✅ Dart SDK（捆绑在 Flutter 内）
- ✅ Linux 桌面构建的工具链（cmake / ninja / clang / gtk3-dev）
- ✅ `flutter precache` 已跑一次（缓存常用 artifacts）
- ⚠️ **不含 Android SDK / Xcode** —— 仅能构建 web / linux 目标。要构建 Android 见模板 D

## 配置文件 / 目录速查

```
/opt/flutter/                                # SDK 根目录（git 仓库）
├── bin/
│   ├── flutter                              # 主命令
│   ├── dart                                 # Dart CLI
│   └── cache/                               # Dart SDK + 预编译 artifacts
├── packages/                                # framework 源码（Flutter 是开源的）
└── examples/

/etc/profile.d/flutter.sh                    # 全局 PATH（EnvForge 写入）

# 用户级（构建产物 / 缓存）
~/.pub-cache/                                # Dart pub 包缓存（GB 级）
├── bin/                                     # 全局 dart pub global 装的工具
└── hosted/

~/snap/flutter/                              # 如用 snap 装会在这里（本 Playbook 不用 snap）

# 项目级
<project>/
├── pubspec.yaml                             # 依赖声明（类似 package.json）
├── pubspec.lock                             # 锁定版本
├── .dart_tool/                              # Dart 工具临时
└── build/                                   # 构建产物
    ├── web/                                 # web 版输出
    ├── app/outputs/flutter-apk/             # Android APK 输出
    └── linux/x64/release/                   # Linux 桌面输出
```

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 安装方法 | git 克隆到 /opt/flutter | 相同（不依赖发行版包） |
| 桌面构建依赖 | `clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev` | `clang cmake ninja-build pkgconfig gtk3-devel xz-devel`（PACKAGE_ALIASES） |
| 仓库源 | `github.com/flutter/flutter` | 相同 |

## 表单字段说明

### `channel` — Flutter channel

| 值 | 适用 |
|---|---|
| `stable`（**默认**） | 生产用 |
| `beta` | 提前尝试新特性 |
| `master` | 最新 dev，**不要在 CI 用** |

### `precache_targets` — precache 哪些目标

| 选项 | 含义 |
|---|---|
| `web` | 默认开（CI 最常用） |
| `linux-desktop` | 桌面构建 |
| `android` | Android 构建 artifacts（不含 Android SDK 本身） |
| `ios` | iOS（macOS 才有意义） |

precache 越多越占磁盘（每个目标 ~500MB）。

## 常见配置模板

### 模板 A — 国内镜像（强烈推荐）

`flutter pub get` / SDK 升级会从 `pub.dev` 拉包；国内服务器极慢。设镜像：

```bash
# /etc/profile.d/flutter.sh 末尾追加（系统级）
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn

# 或仅当前用户
echo 'export PUB_HOSTED_URL=https://pub.flutter-io.cn' >> ~/.bashrc
echo 'export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn' >> ~/.bashrc
```

国内服务器 `flutter pub get` 速度从 ~50KB/s 提到 ~30MB/s。

### 模板 B — 构建 Web 版（最常见 CI 用法）

```bash
cd myapp
flutter pub get
flutter config --enable-web
flutter build web --release \
  --base-href /myapp/ \                 # 部署到子路径时
  --pwa-strategy offline-first \         # PWA 策略
  --dart-define=API_URL=https://api.example.com    # 编译期注入环境变量

# 输出在 build/web/
ls build/web/                           # index.html / main.dart.js / canvaskit/
```

部署到 nginx：

```nginx
location /myapp/ {
    alias /var/www/myapp/web/;
    try_files $uri $uri/ /myapp/index.html;
    add_header Cache-Control "public, max-age=31536000, immutable";
    location ~* \.(html)$ {
        add_header Cache-Control "no-cache";
    }
}
```

### 模板 C — 构建 Linux 桌面（自托管 desktop app）

```bash
cd myapp
flutter config --enable-linux-desktop
flutter build linux --release

# 输出
ls build/linux/x64/release/bundle/
# 含 myapp 可执行 + data/ + lib/ libflutter_linux_gtk.so
# 整个 bundle 复制到目标机器即可跑（前提是 GTK3 已装）
```

打包 .deb：

```bash
sudo apt-get install dpkg-dev
mkdir -p myapp_1.0_amd64/{DEBIAN,opt/myapp,usr/share/applications}
cp -r build/linux/x64/release/bundle/* myapp_1.0_amd64/opt/myapp/
cat > myapp_1.0_amd64/DEBIAN/control <<EOF
Package: myapp
Version: 1.0
Section: base
Priority: optional
Architecture: amd64
Maintainer: You <you@example.com>
Description: My Flutter App
EOF
dpkg-deb --build myapp_1.0_amd64
```

### 模板 D — CI 跑 Android 构建（需 Android SDK）

```bash
# 装 Android SDK（command-line tools 版，无 GUI）
sudo mkdir -p /opt/android-sdk/cmdline-tools
sudo chown -R $USER:$USER /opt/android-sdk

curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdline-tools.zip
unzip /tmp/cmdline-tools.zip -d /opt/android-sdk/cmdline-tools/
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest

# 设环境
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# 接受许可
yes | sdkmanager --licenses

# 装 SDK / build-tools / platforms
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 告诉 Flutter 用这个 SDK
flutter config --android-sdk /opt/android-sdk

# 检查
flutter doctor

# 构建
cd myapp
flutter build apk --release            # debug APK 也能跑：build apk
flutter build appbundle --release      # 上架 Google Play 用
```

输出：

```
build/app/outputs/flutter-apk/app-release.apk
build/app/outputs/bundle/release/app-release.aab
```

### 模板 E — GitHub Actions / GitLab CI 用法

`.github/workflows/build.yml`：

```yaml
name: Build Flutter
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: 'stable'
          cache: true
      - run: flutter pub get
      - run: flutter test
      - run: flutter build web --release
      - uses: actions/upload-artifact@v4
        with:
          name: web-build
          path: build/web/
```

或在自建 GitLab CI runner 上：本 Playbook 装好 Flutter，runner 直接用。

### 模板 F — 升级 Flutter

```bash
sudo /opt/flutter/bin/flutter channel stable        # 确认在 stable
sudo /opt/flutter/bin/flutter upgrade

# 或直接更新 git
cd /opt/flutter
sudo git pull
sudo flutter precache
```

## 关键参数调优速查

### 构建优化

| 参数 | 作用 |
|---|---|
| `--release` | 启用 AOT 编译 + tree shaking + 压缩 |
| `--profile` | profile 模式（性能分析用，介于 debug/release） |
| `--dart-define=KEY=VALUE` | 编译期注入常量（替代环境变量） |
| `--obfuscate --split-debug-info=symbols/` | 混淆 Dart 代码 + 拆分 debug 符号 |
| `--tree-shake-icons` | 仅打包用到的 Material/Cupertino icons（减小 ~1MB） |
| `--no-sound-null-safety` | 关闭空安全（**只有老项目需要**） |

### Web 构建

```bash
# Skia (canvaskit) 渲染 vs HTML 渲染
flutter build web --web-renderer canvaskit         # 默认；保真度高，~2MB 启动开销
flutter build web --web-renderer html              # 体积小，文本渲染更原生
flutter build web --web-renderer auto              # 桌面 canvaskit，移动 html
```

### 磁盘占用

| 项 | 大小 |
|---|---|
| Flutter SDK 本体（克隆后） | ~1.5 GB |
| precache web | +500 MB |
| precache android | +1 GB |
| precache linux-desktop | +200 MB |
| `~/.pub-cache`（多项目共享） | 1-3 GB |
| 单项目 `build/` | 100 MB - 1 GB |

低配 CI runner（< 20 GB 磁盘）建议只 precache 实际目标。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 | Alpine |
|---|---|---|---|
| Flutter SDK | git 克隆，全平台一致 | 同 | ⚠️ glibc 二进制不能在 musl 上跑 |
| 桌面构建依赖（gtk3） | `libgtk-3-dev` | `gtk3-devel` | apk gtk+3.0-dev |
| Android 构建（需 Java） | `openjdk-17-jdk` | `java-17-openjdk-devel` | apk openjdk17 |

EnvForge 自动安装桌面构建依赖。Alpine 不被本 Playbook 支持（用 `cirrusci/flutter` Docker 镜像）。

## 与其它 catalog 项的配合

- **`openjdk-runtime`** — 构建 Android 需 Java 17（Flutter 3.16+ 强制）
- **`git-version-control`** — Flutter SDK 通过 git 安装；用 git CLI 升级
- **`docker-host-profile`** — 用 `cirrusci/flutter:stable` 容器做 CI 是 Docker 化方案；本 Playbook 是裸金属方案
- **`nginx-web-service`** — 部署 Flutter web 到 nginx（模板 B）

## 排错

### `flutter: command not found`（重开 shell 后）

```bash
# 检查文件
ls /opt/flutter/bin/flutter

# 检查 profile 加载
cat /etc/profile.d/flutter.sh
echo $PATH | tr ':' '\n' | grep flutter

# 临时
export PATH=$PATH:/opt/flutter/bin

# 永久
source /etc/profile.d/flutter.sh
```

systemd 服务里同 Go 一样：`/etc/profile.d/` 不被 systemd 加载，写完整路径或 unit Environment。

### `flutter doctor` 报 `Android toolchain` 缺失

服务器上**正常**——构建 web 不需要 Android SDK。如果真要构建 Android，按模板 D 装 SDK。

### `flutter doctor` 报 `Flutter requires Git for development`

```bash
sudo apt-get install git
sudo dnf install git
```

### `pub get` 网络超时

设国内镜像（模板 A）。或临时：

```bash
PUB_HOSTED_URL=https://pub.flutter-io.cn flutter pub get
```

### `Failed to lock pub cache`

多个 flutter 进程并发跑会冲突。删 lock 文件：

```bash
rm -rf ~/.pub-cache/_cache/_pub_cache.lock
```

### 构建 Android 报 `License for package Android SDK Build-Tools 34 not accepted`

```bash
yes | sdkmanager --licenses
flutter doctor --android-licenses
```

### Linux 桌面构建报 `CMake Error: ... pkg-config not found`

```bash
sudo apt-get install pkg-config
sudo dnf install pkgconfig
```

模板 D 已含。

### Web 构建首次启动慢（白屏 1-2 秒）

正常——canvaskit 启动需下载 ~2MB wasm。优化：

```bash
flutter build web --pwa-strategy offline-first       # 服务工作者预缓存
flutter build web --web-renderer html                # 改用 html 渲染（无 wasm）
```

### `Flutter assets directory ... does not exist`

```bash
cd /opt/flutter
sudo flutter precache
```

### 升级 SDK 后旧项目编不过

API 破坏性变更。看 release notes 或锁定老版本：

```bash
flutter version v3.16.0
# 或在项目 pubspec.yaml 加：
# environment:
#   sdk: ^3.2.0
#   flutter: ">=3.16.0 <3.17.0"
```

## 验证

```bash
# 1. 命令存在
/opt/flutter/bin/flutter --version

# 2. PATH 全局生效（重开 shell）
bash -lc 'flutter --version'

# 3. doctor（服务器上 Android/Chrome 可缺）
flutter doctor

# 4. 创建并构建一个测试项目
cd /tmp
/opt/flutter/bin/flutter create -t console-full hello_test
cd hello_test
/opt/flutter/bin/flutter pub get
/opt/flutter/bin/dart run         # 应输出 Hello world!
cd / && rm -rf /tmp/hello_test

# 5. 构建 web 测试
cd /tmp
/opt/flutter/bin/flutter create web_test
cd web_test
/opt/flutter/bin/flutter build web --release
ls build/web/index.html
cd / && rm -rf /tmp/web_test
```

## 多次运行

`installMode: skip-existing`。Playbook 用 `creates: /opt/flutter/bin/flutter` 守卫——已装跳过。**不会自动升级 SDK 版本**。要升级：

```bash
cd /opt/flutter
sudo git pull
sudo flutter precache
```

## ⚠️ 敏感性

**safe** — 装到 `/opt/flutter`，不开端口、不动系统服务。占用磁盘 1.5-3 GB（含 precache）。

## 隐私说明

- **Flutter 默认开启 analytics**，每次 `flutter` 命令会发匿名使用统计给 Google
- 关闭：
    ```bash
    flutter --disable-analytics
    flutter config --no-analytics
    ```
- Dart Pub 默认从 `pub.dev`（Google 运营）拉包；用国内镜像后请求会发到镜像方
- `flutter doctor` 会扫本机已装的 IDE / Java / Chrome 等，不上传
- 编译生成的 web/android 应用本身是否发遥测取决于业务代码（如 firebase_analytics 包）
