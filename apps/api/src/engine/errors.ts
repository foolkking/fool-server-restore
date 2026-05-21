/**
 * errors.ts — 详细错误分类和用户友好提示
 *
 * 将底层 SSH/系统错误转换为可读的、可操作的错误信息
 */

export type ErrorCategory =
  | "network"        // SSH 连接失败、超时、主机不可达
  | "auth"           // 认证失败（密码错误、密钥不匹配）
  | "permission"     // sudo 权限不足
  | "not_found"      // 包不存在、服务不存在、文件不存在
  | "conflict"       // 端口占用、文件已存在
  | "disk_space"     // 磁盘空间不足
  | "dependency"     // 依赖包缺失
  | "timeout"        // 命令执行超时
  | "unknown";       // 未分类错误

export interface ClassifiedError {
  category: ErrorCategory;
  /** 用户可读的中文提示 */
  messageZh: string;
  /** 用户可读的英文提示 */
  messageEn: string;
  /** 建议的修复操作 */
  fixHintZh?: string;
  fixHintEn?: string;
  /** 原始错误信息 */
  raw: string;
}

/**
 * 从 stderr/stdout/exitCode 分析错误类型，返回用户友好的错误信息
 */
export function classifyError(
  stderr: string,
  stdout: string,
  exitCode: number,
  command: string
): ClassifiedError {
  const combined = `${stderr}\n${stdout}`.toLowerCase();

  // 网络/连接错误
  if (
    combined.includes("could not resolve host") ||
    combined.includes("network is unreachable") ||
    combined.includes("connection refused") ||
    combined.includes("no route to host")
  ) {
    return {
      category: "network",
      messageZh: "网络连接失败，无法访问软件源",
      messageEn: "Network error: cannot reach package repository",
      fixHintZh: "请检查目标机器的网络连接，或配置国内镜像源",
      fixHintEn: "Check network connectivity or configure a local mirror",
      raw: stderr
    };
  }

  // 认证/权限错误
  if (
    combined.includes("permission denied") ||
    combined.includes("access denied") ||
    combined.includes("operation not permitted")
  ) {
    if (combined.includes("sudo") || command.startsWith("sudo")) {
      return {
        category: "permission",
        messageZh: "sudo 权限不足，无法执行此操作",
        messageEn: "Insufficient sudo privileges",
        fixHintZh: "请确保 SSH 用户有 sudo 权限，或在 /etc/sudoers 中添加 NOPASSWD 配置",
        fixHintEn: "Ensure the SSH user has sudo access, or add NOPASSWD to /etc/sudoers",
        raw: stderr
      };
    }
    return {
      category: "permission",
      messageZh: "权限不足，无法访问该文件或目录",
      messageEn: "Permission denied",
      fixHintZh: "请检查文件权限或使用 sudo",
      fixHintEn: "Check file permissions or use sudo",
      raw: stderr
    };
  }

  // 包不存在
  if (
    combined.includes("unable to locate package") ||
    combined.includes("no package") ||
    combined.includes("package not found") ||
    combined.includes("e: package") ||
    combined.includes("no match for argument")
  ) {
    const pkgMatch = command.match(/install\s+(-y\s+)?(\S+)/);
    const pkgName = pkgMatch?.[2] ?? "package";
    return {
      category: "not_found",
      messageZh: `找不到软件包 "${pkgName}"，可能包名有误或需要添加软件源`,
      messageEn: `Package "${pkgName}" not found in repositories`,
      fixHintZh: `请检查包名是否正确，或运行 apt-get update 更新软件源索引`,
      fixHintEn: `Check the package name or run apt-get update to refresh the index`,
      raw: stderr
    };
  }

  // 磁盘空间不足
  if (
    combined.includes("no space left on device") ||
    combined.includes("disk quota exceeded") ||
    combined.includes("not enough space")
  ) {
    return {
      category: "disk_space",
      messageZh: "磁盘空间不足，无法完成安装",
      messageEn: "Insufficient disk space",
      fixHintZh: "请清理磁盘空间后重试（可运行 df -h 查看磁盘使用情况）",
      fixHintEn: "Free up disk space and retry (run df -h to check usage)",
      raw: stderr
    };
  }

  // 依赖冲突
  if (
    combined.includes("dependency") ||
    combined.includes("conflicts with") ||
    combined.includes("unmet dependencies") ||
    combined.includes("broken packages")
  ) {
    return {
      category: "dependency",
      messageZh: "依赖包冲突或缺失",
      messageEn: "Dependency conflict or missing dependency",
      fixHintZh: "请尝试运行 apt-get -f install 修复依赖，或手动安装缺失的依赖包",
      fixHintEn: "Try running apt-get -f install to fix dependencies",
      raw: stderr
    };
  }

  // 服务不存在
  if (
    combined.includes("unit") && (combined.includes("not found") || combined.includes("could not be found")) ||
    combined.includes("failed to start") ||
    combined.includes("service not found")
  ) {
    const svcMatch = command.match(/systemctl\s+\w+\s+(\S+)/);
    const svcName = svcMatch?.[1] ?? "service";
    return {
      category: "not_found",
      messageZh: `服务 "${svcName}" 不存在或未安装`,
      messageEn: `Service "${svcName}" not found or not installed`,
      fixHintZh: "请先安装对应的软件包，再启动服务",
      fixHintEn: "Install the corresponding package before starting the service",
      raw: stderr
    };
  }

  // 端口占用
  if (
    combined.includes("address already in use") ||
    combined.includes("port already in use") ||
    combined.includes("bind: address already in use")
  ) {
    return {
      category: "conflict",
      messageZh: "端口已被占用",
      messageEn: "Port already in use",
      fixHintZh: "请检查是否有其他进程占用了该端口（可运行 ss -tlnp 查看）",
      fixHintEn: "Check if another process is using the port (run ss -tlnp)",
      raw: stderr
    };
  }

  // 超时
  if (exitCode === -1 || combined.includes("timed out") || combined.includes("timeout")) {
    return {
      category: "timeout",
      messageZh: "命令执行超时",
      messageEn: "Command execution timed out",
      fixHintZh: "命令执行时间过长，请检查网络连接或手动执行该命令",
      fixHintEn: "Command took too long. Check network or run manually",
      raw: stderr
    };
  }

  // 未知错误
  return {
    category: "unknown",
    messageZh: `命令执行失败（退出码 ${exitCode}）`,
    messageEn: `Command failed (exit code ${exitCode})`,
    raw: stderr || stdout || `Exit code: ${exitCode}`
  };
}

/**
 * 将 ClassifiedError 格式化为用户可读的字符串
 */
export function formatError(err: ClassifiedError, locale: "zh" | "en"): string {
  const msg = locale === "zh" ? err.messageZh : err.messageEn;
  const hint = locale === "zh" ? err.fixHintZh : err.fixHintEn;
  if (hint) return `${msg}\n💡 ${hint}`;
  return msg;
}
