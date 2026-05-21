# Java / OpenJDK 运行时

## 概述

OpenJDK 是 Java 平台的开源实现，是运行 Java 应用程序的标准运行时环境。配合 Maven 构建工具，可以满足大多数 Java 开发和部署需求。

## 安装内容

- `default-jdk` — OpenJDK 开发工具包（含 JRE）
- `maven` — Apache Maven 构建工具
- JAVA_HOME 环境变量

## 安装命令

```bash
sudo apt-get update -qq
sudo apt-get install -y default-jdk maven
```

## 安装后配置

### 1. 设置 JAVA_HOME

```bash
# 查找 Java 安装路径
JAVA_PATH=$(dirname $(dirname $(readlink -f $(which java))))
echo "export JAVA_HOME=$JAVA_PATH" >> ~/.bashrc
source ~/.bashrc
```

### 2. 验证版本

```bash
java -version
javac -version
mvn -version
```

### 3. Maven 镜像配置（中国用户推荐）

编辑 `~/.m2/settings.xml`：

```xml
<settings>
  <mirrors>
    <mirror>
      <id>aliyun</id>
      <mirrorOf>central</mirrorOf>
      <url>https://maven.aliyun.com/repository/central</url>
    </mirror>
  </mirrors>
</settings>
```

### 4. 安装特定版本（可选）

```bash
# 安装 OpenJDK 17
sudo apt-get install -y openjdk-17-jdk

# 安装 OpenJDK 21
sudo apt-get install -y openjdk-21-jdk

# 切换默认版本
sudo update-alternatives --config java
```

## 常用命令

```bash
java -jar app.jar              # 运行 JAR
mvn clean package              # Maven 构建
mvn spring-boot:run            # Spring Boot 启动
javac Main.java && java Main   # 编译运行
```

## 隐私说明

Java 运行时配置不包含敏感信息。Maven settings.xml 中的私有仓库凭据属于敏感数据。
