# OpenJDK + Maven

装 OpenJDK 17 LTS + Maven。Java 17 是当前最广泛使用的 LTS（兼容大多数现代框架）。

## 你将得到什么

- 📦 **openjdk-17-jdk**（Ubuntu）/ **java-17-openjdk-devel**（RHEL）
- 📦 **maven**
- ✅ JAVA_HOME 由 OpenJDK 包自动管理（多版本时用 update-alternatives）

## Java 版本选择

Java 8 / 11 / 17 / 21 都是 LTS。**当前默认 17**（兼容性 + 性能 + 现代特性的最佳平衡）。

如果你的项目要求老版本：
- Java 8：`openjdk-8-jdk` (Ubuntu) / `java-1.8.0-openjdk-devel` (RHEL)。**不推荐**——已 EOL。
- Java 11：`openjdk-11-jdk` / `java-11-openjdk-devel`。仍 LTS 但 17 更值得用。
- Java 21：`openjdk-21-jdk` / `java-21-openjdk-devel`。最新 LTS，virtual threads 等新特性。

修改本 Playbook 里的 `java_version` 字段切换。

## 用法

### 验证

```bash
java --version
javac --version
mvn --version
```

### Maven 国内镜像（重要）

`~/.m2/settings.xml`：
```xml
<settings>
  <mirrors>
    <mirror>
      <id>aliyun</id>
      <name>aliyun maven</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
  </mirrors>
</settings>
```

国内服务器 `mvn install` 速度从 ~1MB/s 提到 ~30MB/s。

### 多 Java 版本

如果同机器要多版本：
```bash
sudo apt-get install openjdk-11-jdk openjdk-17-jdk    # Ubuntu
sudo update-alternatives --config java                # 选默认版本
sudo update-alternatives --config javac
```

或用 `sdkman` (`https://sdkman.io/`)，类似 nvm 但管 Java。

### 用 Gradle 而不是 Maven

```bash
sudo apt-get install gradle    # Ubuntu
sudo dnf install gradle        # 一些 RHEL 系
# 或 sdkman 装最新版
```

## ⚠️ 敏感性

**safe** — 只装语言运行时。

## 验证

```bash
java --version
javac --version
mvn --version
```

## 排错

- **`java -version` 显示 GraalVM / Oracle JDK 而不是 OpenJDK** — 系统已经有别的 Java，本 Playbook 装的 OpenJDK 不是默认。`sudo update-alternatives --config java` 切回。
- **`mvn` 找不到** — Maven 没装上（一些精简发行版 maven 包名不一样），手动 `apt install maven` / `dnf install maven`。
- **跨发行版**：包名差异大（Ubuntu `openjdk-17-jdk` vs RHEL `java-17-openjdk-devel`），EnvForge 同时尝试两个，正确的那个生效。

## 多次运行

`installMode: skip-existing`。已装就跳过。

## 隐私说明

不发遥测。
