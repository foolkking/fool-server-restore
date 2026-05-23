# Java / OpenJDK 运行时

OpenJDK 17 LTS（默认）+ Maven 3。Java 17 是当前最广泛使用的 LTS——兼容 Spring Boot 3 / Quarkus 3 / Micronaut 4，性能比 11 强 10-15%，生态成熟。要 21 LTS 改 `java_version` 即可。

## 你将得到什么

- 📦 **OpenJDK 17 JDK**（含 java + javac + jar + jlink 等开发工具）
- 📦 **Maven 3.x**
- ✅ JAVA_HOME 由系统 `update-alternatives` / `alternatives` 自动管理（多版本时切换简单）
- ✅ `java`、`javac`、`mvn` 命令全局可用

## 配置文件 / 目录速查

```
# JDK 安装位置（不同发行版差异最大的）
/usr/lib/jvm/                                # 主目录（Ubuntu/Debian + RHEL 都用）
├── default-java -> java-1.17.0-openjdk-amd64    # Ubuntu/Debian 软链
├── java-17-openjdk-amd64/                       # Ubuntu/Debian 实际目录
└── java-17-openjdk-17.X.X.X-X.elX.x86_64/       # RHEL/Anolis 实际目录
    ├── bin/                                     # java / javac / jar / 等
    ├── conf/security/                           # cacerts (CA 信任库)
    ├── lib/                                     # 标准库 jar
    └── jmods/                                   # JDK 模块

# Maven
/usr/bin/mvn                                 # 命令
/usr/share/maven/                            # 安装目录
/etc/maven/                                  # 系统配置（settings.xml）

# 用户级 Maven
~/.m2/
├── settings.xml                             # ← 镜像源 / 私服凭据
├── settings-security.xml                    # 加密凭据存这里
└── repository/                              # 本地依赖缓存（GB 级别）
```

| 路径 / 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 包名（JDK 17） | `openjdk-17-jdk` | `java-17-openjdk-devel` |
| 包名（仅 JRE） | `openjdk-17-jre` | `java-17-openjdk` |
| Maven 包名 | `maven` | `maven`（在 AppStream） |
| JAVA_HOME 默认 | `/usr/lib/jvm/default-java`（软链） | `/usr/lib/jvm/jre`（软链） |
| `update-alternatives` 名 | `update-alternatives` | `alternatives` |

不知道当前 JAVA_HOME：

```bash
readlink -f $(which java) | sed 's:/bin/java::'
# 或
java -XshowSettings:properties -version 2>&1 | grep 'java.home'
```

## 常见配置模板

### 模板 A — Maven 国内镜像（`~/.m2/settings.xml`）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                              http://maven.apache.org/xsd/settings-1.0.0.xsd">

  <localRepository>${user.home}/.m2/repository</localRepository>

  <mirrors>
    <mirror>
      <id>aliyun-public</id>
      <name>aliyun maven public</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
    <mirror>
      <id>aliyun-spring</id>
      <url>https://maven.aliyun.com/repository/spring</url>
      <mirrorOf>spring</mirrorOf>
    </mirror>
  </mirrors>

  <profiles>
    <profile>
      <id>jdk17</id>
      <activation>
        <activeByDefault>true</activeByDefault>
        <jdk>17</jdk>
      </activation>
      <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
      </properties>
    </profile>
  </profiles>
</settings>
```

国内服务器 `mvn install` 速度从 ~500KB/s 提到 ~30MB/s。

### 模板 B — systemd 跑 Spring Boot fat jar

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Spring Boot App
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/java \
  -Xms512m -Xmx2g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=100 \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/myapp/heap.hprof \
  -Dspring.profiles.active=prod \
  -Dfile.encoding=UTF-8 \
  -jar /opt/myapp/myapp.jar
Restart=on-failure
RestartSec=10
SuccessExitStatus=143

# JVM 写日志要权限
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### 模板 C — 多 Java 版本切换

```bash
# 装多个版本
sudo apt-get install openjdk-11-jdk openjdk-17-jdk openjdk-21-jdk    # Ubuntu
sudo dnf install java-11-openjdk-devel java-17-openjdk-devel java-21-openjdk-devel  # RHEL

# 切换默认（Ubuntu/Debian）
sudo update-alternatives --config java
sudo update-alternatives --config javac

# 切换默认（RHEL/Anolis）
sudo alternatives --config java

# 项目级（Maven）：pom.xml 里
# <maven.compiler.release>21</maven.compiler.release>

# 用 SDKMAN 管多版本（更灵活）
curl -s https://get.sdkman.io | bash
sdk list java
sdk install java 21.0.5-tem
sdk use java 21.0.5-tem
```

### 模板 D — JVM 通用调优起手式

```bash
# 4 vCPU + 8 GB RAM 的应用服务器，跑单个 fat jar
java \
  -server \
  -Xms2g -Xmx4g \                                         # heap 固定到 4GB（避开动态扩缩）
  -XX:+UseG1GC \                                          # G1 GC（默认，这里显式）
  -XX:MaxGCPauseMillis=200 \                              # 目标 GC 暂停 200ms
  -XX:+ParallelRefProcEnabled \                           # 并行引用处理
  -XX:+HeapDumpOnOutOfMemoryError \                       # OOM 自动 dump
  -XX:HeapDumpPath=/var/log/app/heap-$(date +%s).hprof \
  -XX:+ExitOnOutOfMemoryError \                           # OOM 直接退（让 systemd 拉起）
  -Djava.security.egd=file:/dev/./urandom \               # 启动加速（容器里别用 /dev/random）
  -Duser.timezone=Asia/Shanghai \
  -Dfile.encoding=UTF-8 \
  -jar app.jar
```

## 关键参数调优速查

### Heap 大小

| 应用类型 | 物理内存 | 推荐 Xmx |
|---|---|---|
| 小型 web 服务 | 1 GB | 512m |
| 标准 Spring Boot | 2 GB | 1g |
| 中型业务系统 | 4 GB | 2g |
| 大型业务系统 | 8 GB | 4g |
| 数据处理 | 16 GB | 8g |
| **永远不要** | 任何 | > 32g（失去 compressed oops，性能下降 30%） |

经验法则：**`-Xms` 等于 `-Xmx`**（避免动态扩缩造成的 GC 抖动）。容器里建议 `-XX:MaxRAMPercentage=75.0`。

### Garbage Collector 选择

| GC | Java | 场景 |
|---|---|---|
| G1 | 8+（默认 9+） | 默认，4-32GB heap，平衡 |
| ZGC | 15+（生产推荐 17+） | > 32GB heap，要求 < 10ms 暂停 |
| Shenandoah | 12+ | 类似 ZGC，对小 heap 也好 |
| Parallel | 老 | 批处理，关注吞吐量不在乎暂停 |
| Serial | 老 | 单核 / < 100MB heap |

### GC 日志（生产必开）

```bash
# Java 9+
-Xlog:gc*:file=/var/log/app/gc.log:time,level,tags:filecount=10,filesize=100M

# 看 GC 报告
# 上传到 https://gceasy.io/ 在线分析
```

## 跨发行版兼容

EnvForge 同时尝试 Ubuntu 和 RHEL 两种包名，正确的那个生效。

| 包目的 | Ubuntu/Debian | RHEL/Anolis | 注 |
|---|---|---|---|
| JDK 17 | `openjdk-17-jdk` | `java-17-openjdk-devel` | 含 javac |
| JRE 17 | `openjdk-17-jre` | `java-17-openjdk` | 仅 java |
| JDK 21 | `openjdk-21-jdk` | `java-21-openjdk-devel` | RHEL 9 默认仓库已有 |
| Maven | `maven` | `maven` | 都从 AppStream |
| Gradle | `gradle` | （EPEL）`gradle` | RHEL 系建议手动装 |

**Anolis 9 / RHEL 9 默认仓库的 OpenJDK**：包含 8 / 11 / 17 / 21（AppStream）。Java 17 是当前推荐。

## 与其它 catalog 项的配合

- **`jenkins-ci`** — Jenkins LTS 需要 Java 17+（自带依赖会装，但本 Playbook 装的版本兼容）
- **`elasticsearch`** — ES 8.x 自带 OpenJDK，**不用**本 Playbook 提供 Java
- **`sonarqube`** — SonarQube 9.9 LTS 要 Java 17，本 Playbook 装的版本可直接用
- **`gitlab-runner`** — Gitea/GitLab 的 Java executor 需要本 Playbook
- **`docker-host-profile`** — 多阶段 Dockerfile 用 `eclipse-temurin:17-jre-alpine` 替代系统包

## 排错

### `java -version` 显示 GraalVM / Oracle JDK 而不是 OpenJDK

机器上原本装过别的 Java。切换：

```bash
sudo update-alternatives --config java        # Ubuntu/Debian
sudo alternatives --config java               # RHEL/Anolis

# 看所有备选项
update-alternatives --list java
```

### `mvn` 找不到（包装好了但命令不在 PATH）

```bash
which mvn || ls /usr/share/maven/bin/mvn
# 如果文件存在但 PATH 没含
echo 'export PATH=$PATH:/usr/share/maven/bin' >> ~/.bashrc
```

### Spring Boot 启动报 `Unsupported class file major version 61`

major version 61 = Java 17 编译。解决：

```bash
# 当前 Java 版本太老
java -version
# 切换到 17
sudo update-alternatives --config java
```

### 编译报 `error: invalid target release: 17` (Maven)

`pom.xml` 写的 target 是 17，但运行时 Java 是 11。在 settings.xml 里 profile 强制 17（见模板 A），或检查环境 JAVA_HOME。

### Maven 下载依赖极慢 / `Could not transfer artifact ... timed out`

国内服务器到 Maven Central 慢。配阿里云镜像（模板 A）。

### `Could not initialize class sun.security.ssl.SSLContextImpl$DefaultSSLContext`

cacerts 损坏或缺。重装 ca-certificates-java：

```bash
sudo apt-get install --reinstall ca-certificates-java
sudo update-ca-certificates -f
```

### 启动慢（特别是容器里）

`/dev/random` 阻塞。加 `-Djava.security.egd=file:/dev/./urandom`（注意是 `./urandom` 不是 `/urandom`，前者绕过 JVM 的限制）。

### OOM Killed（kernel 杀 Java 进程）

通常是 `-Xmx` 设得比容器内存还大。把 `-Xmx` 设为容器内存的 75%：

```bash
# 容器内存 2GB
java -Xmx1500m -Xms1500m ...
# 或自动
java -XX:MaxRAMPercentage=75.0 ...
```

## 验证

```bash
# 1. java 命令存在且版本对
java --version                     # 应输出 openjdk 17.x.x

# 2. javac（开发工具）
javac --version                     # 应输出 javac 17.x.x

# 3. JAVA_HOME 软链对
readlink -f $(which java) | sed 's:/bin/java::'

# 4. Maven
mvn --version                       # 应同时显示 Java 版本

# 5. 跑 hello world
mkdir /tmp/jtest && cd /tmp/jtest
cat > Hello.java <<'EOF'
public class Hello {
    public static void main(String[] args) { System.out.println("Java OK"); }
}
EOF
javac Hello.java && java Hello      # 输出 Java OK
cd / && rm -rf /tmp/jtest
```

## 多次运行

`installMode: skip-existing`。已装就跳过。要切到不同 LTS 版本：删表单值再跑，或手动 `apt-get install openjdk-21-jdk` + `update-alternatives --config java`。

## ⚠️ 敏感性

**safe** — 装语言运行时。不开端口、不动数据。

## 隐私说明

- OpenJDK 不发遥测
- Maven 默认从 Maven Central（公开仓库）下依赖；走第三方镜像后，镜像方能看到你的依赖列表
- `~/.m2/settings.xml` 如果配了私服凭据，建议用 `mvn --encrypt-master-password` 加密，避免明文
- 应用运行时如果用 OpenTelemetry / Micrometer 等指标 SDK 才会发送数据，与 JDK 本身无关
