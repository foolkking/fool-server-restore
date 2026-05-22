# Flutter SDK

Flutter 是 Google 的跨平台 UI 框架——一份 Dart 代码同时编出 iOS / Android / Web / Linux / Windows / macOS 应用。

服务器上装 Flutter 主要用途是 **CI/CD**——跑 `flutter build apk` / `flutter build web` 这种构建任务。
开发本身在桌面/笔记本上做。

## 你将得到什么

- ✅ Flutter SDK 装到 `/opt/flutter`（git 克隆 + 自动跟进 channel）
- ✅ `/opt/flutter/bin` 加入系统 PATH（重开 shell 后生效）
- ✅ Dart SDK + Linux 编译工具链已 precache

**注意**：开发 Android 还需要 Android SDK（不在本 Playbook 范围）；开发 iOS 需要 Mac。

## 用法

### 验证

```bash
flutter --version
flutter doctor
# 显示哪些功能可用：
# [✓] Flutter (Channel stable, 3.x.x)
# [!] Android toolchain - develop for Android devices
# 等
```

### 跑一个示例

```bash
flutter create my_app
cd my_app
flutter run -d linux       # 本机跑桌面版
flutter build web          # 构建 web 版（dist 在 build/web/）
```

### CI 用法（GitHub Actions / GitLab CI）

```yaml
# .github/workflows/build.yml
- uses: subosito/flutter-action@v2
  with:
    flutter-version: '3.x'
- run: flutter pub get
- run: flutter build web
```

或者在你自己的 CI 服务器上：本 Playbook 装好 Flutter，runner job 直接用。

### 升级 Flutter

```bash
cd /opt/flutter
git pull
flutter upgrade
```

或者 `flutter channel beta && flutter upgrade` 切到 beta。

### 国内镜像

```bash
echo 'export PUB_HOSTED_URL=https://pub.flutter-io.cn' >> ~/.bashrc
echo 'export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn' >> ~/.bashrc
source ~/.bashrc
```

## ⚠️ 敏感性

**safe** — 装到 `/opt/flutter`，不动其它系统组件。占用磁盘约 1-2GB（Dart SDK + 编译缓存）。

## 验证

```bash
/opt/flutter/bin/flutter --version
/opt/flutter/bin/flutter doctor
```

## 排错

- **`flutter: command not found`** — `/etc/profile.d/flutter.sh` 没生效（仅交互式 shell 加载）。CI/服务里写完整路径 `/opt/flutter/bin/flutter`，或者在 systemd unit 里加 PATH。
- **`pub get` 网络慢** — 设国内镜像（见上）。
- **`flutter doctor` 提示缺 Android toolchain** — 服务器上正常（CI 跑 web/linux 不需要 Android）。如果真要构建 Android：
  ```bash
  sudo dpkg --add-architecture i386
  sudo apt-get install android-sdk
  flutter config --android-sdk /usr/lib/android-sdk
  ```
- **跨发行版**：用 git 安装，无包管理器差异。

## 多次运行

`installMode: skip-existing`。已装就跳过 git clone（不会自动升级 Flutter 版本）。

## 隐私说明

Flutter 默认开启 analytics 上报使用统计：
```bash
flutter --disable-analytics
```
