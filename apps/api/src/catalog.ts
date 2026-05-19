export interface CatalogItem {
  id: string;
  kind: "software" | "combo";
  name: string;
  nameEn: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  summary: string;
  summaryEn: string;
  rating: number;
  installs: string;
  imageTone: string;
  sensitivity: "safe" | "review" | "privileged";
  assets: string[];
  guidePath: string;
  guideAuthor: "admin" | "user";
  installMode: "skip-existing" | "replace-existing";
  components: CatalogComponent[];
}

export interface CatalogComponent {
  type: "software" | "system-command" | "system-config";
  label: string;
  labelEn: string;
  detail: string;
}

export function listCatalogItems(): CatalogItem[] {
  return [
    {
      id: "node-runtime-profile",
      kind: "software",
      name: "Node.js 运行时配置",
      nameEn: "Node.js runtime profile",
      category: "runtime",
      summary: "安装 Node.js、npm 全局工具、registry 和常见环境变量模板。",
      summaryEn: "Install Node.js, npm globals, registry settings, and environment templates.",
      rating: 4.8,
      installs: "12.4k",
      imageTone: "teal",
      sensitivity: "review",
      assets: ["node", "npm", "registry", "env"],
      guidePath: "configs/catalog/software/node-runtime-profile.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      components: [
        { type: "software", label: "Node.js / npm", labelEn: "Node.js / npm", detail: "runtime" },
        { type: "system-config", label: "registry 镜像", labelEn: "registry mirror", detail: "npm config" }
      ]
    },
    {
      id: "docker-host-profile",
      kind: "software",
      name: "Docker 主机配置",
      nameEn: "Docker host profile",
      category: "container",
      summary: "容器运行时、compose 插件、镜像源和服务启动策略。",
      summaryEn: "Container runtime, compose plugin, registry mirrors, and startup policy.",
      rating: 4.7,
      installs: "8.9k",
      imageTone: "blue",
      sensitivity: "privileged",
      assets: ["docker", "compose", "service"],
      guidePath: "configs/catalog/software/docker-host-profile.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      components: [
        { type: "software", label: "Docker Engine", labelEn: "Docker Engine", detail: "container runtime" },
        { type: "system-command", label: "服务启动", labelEn: "service startup", detail: "system service" }
      ]
    },
    {
      id: "ssh-hardening",
      kind: "combo",
      name: "SSH 安全策略",
      nameEn: "SSH hardening policy",
      category: "security",
      summary: "端口、登录策略、公钥认证、Root 登录限制和审计建议。",
      summaryEn: "Port, login policy, public-key auth, root login restrictions, and audit hints.",
      rating: 4.9,
      installs: "6.2k",
      imageTone: "slate",
      sensitivity: "privileged",
      assets: ["ssh", "audit", "firewall"],
      guidePath: "configs/catalog/combos/ssh-hardening.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      components: [
        { type: "software", label: "OpenSSH Server", labelEn: "OpenSSH Server", detail: "package" },
        { type: "system-command", label: "sshd reload", labelEn: "sshd reload", detail: "service command" },
        { type: "system-config", label: "禁用 Root 登录", labelEn: "disable root login", detail: "sshd_config" },
        { type: "system-config", label: "防火墙端口", labelEn: "firewall port", detail: "network rule" }
      ]
    },
    {
      id: "nginx-web-service",
      kind: "software",
      name: "Nginx Web 服务",
      nameEn: "Nginx web service",
      category: "service",
      summary: "Nginx 安装、反向代理模板、日志目录和服务管理。",
      summaryEn: "Nginx install, reverse proxy templates, logs, and service management.",
      rating: 4.6,
      installs: "10.1k",
      imageTone: "emerald",
      sensitivity: "review",
      assets: ["nginx", "systemd", "logs"],
      guidePath: "configs/catalog/software/nginx-web-service.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      components: [
        { type: "software", label: "Nginx", labelEn: "Nginx", detail: "web server" },
        { type: "system-config", label: "反向代理模板", labelEn: "reverse proxy template", detail: "site config" }
      ]
    },
    {
      id: "postgres-profile",
      kind: "software",
      name: "PostgreSQL 数据库配置",
      nameEn: "PostgreSQL database profile",
      category: "database",
      summary: "数据库软件、端口策略、备份目录、基础安全配置。",
      summaryEn: "Database package, port policy, backup path, and baseline security settings.",
      rating: 4.5,
      installs: "4.8k",
      imageTone: "indigo",
      sensitivity: "privileged",
      assets: ["postgres", "backup", "service"],
      guidePath: "configs/catalog/software/postgres-profile.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      components: [
        { type: "software", label: "PostgreSQL", labelEn: "PostgreSQL", detail: "database" },
        { type: "system-config", label: "备份目录", labelEn: "backup path", detail: "storage policy" }
      ]
    },
    {
      id: "powershell-dev-profile",
      kind: "combo",
      name: "PowerShell 开发配置",
      nameEn: "PowerShell developer profile",
      category: "developer",
      summary: "Profile、常用模块、执行策略、Git 与终端工具整合。",
      summaryEn: "Profile, common modules, execution policy, Git, and terminal integrations.",
      rating: 4.4,
      installs: "3.7k",
      imageTone: "amber",
      sensitivity: "review",
      assets: ["powershell", "modules", "terminal"],
      guidePath: "configs/catalog/combos/powershell-dev-profile.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      components: [
        { type: "software", label: "PowerShell 7", labelEn: "PowerShell 7", detail: "runtime" },
        { type: "software", label: "Git / Terminal", labelEn: "Git / Terminal", detail: "developer tools" },
        { type: "system-command", label: "安装常用模块", labelEn: "install modules", detail: "Install-Module" },
        { type: "system-config", label: "Profile alias", labelEn: "profile aliases", detail: "$PROFILE" }
      ]
    },
    {
      id: "firewall-baseline",
      kind: "combo",
      name: "防火墙基线",
      nameEn: "Firewall baseline",
      category: "network",
      summary: "常见入站端口、出站策略、服务分组和风险提示。",
      summaryEn: "Common inbound ports, outbound rules, service groups, and risk hints.",
      rating: 4.8,
      installs: "7.3k",
      imageTone: "red",
      sensitivity: "privileged",
      assets: ["firewall", "ports", "network"],
      guidePath: "configs/catalog/combos/firewall-baseline.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      components: [
        { type: "software", label: "ufw / firewalld", labelEn: "ufw / firewalld", detail: "firewall package" },
        { type: "system-command", label: "启用规则", labelEn: "enable rules", detail: "firewall command" },
        { type: "system-config", label: "入站端口组", labelEn: "inbound port group", detail: "network policy" },
        { type: "system-config", label: "服务分组", labelEn: "service groups", detail: "risk profile" }
      ]
    },
    {
      id: "python-toolchain",
      kind: "software",
      name: "Python 工具链",
      nameEn: "Python toolchain",
      category: "runtime",
      summary: "Python、pip、虚拟环境、镜像源和常用 CLI 工具。",
      summaryEn: "Python, pip, virtualenv, mirrors, and common CLI tools.",
      rating: 4.6,
      installs: "9.6k",
      imageTone: "yellow",
      sensitivity: "safe",
      assets: ["python", "pip", "venv"],
      guidePath: "configs/catalog/software/python-toolchain.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      components: [
        { type: "software", label: "Python / pip", labelEn: "Python / pip", detail: "runtime" },
        { type: "system-config", label: "pip 镜像", labelEn: "pip mirror", detail: "package source" }
      ]
    }
  ];
}

export function listCurrentUser() {
  return {
    id: "guest",
    name: "游客",
    nameEn: "Guest",
    authenticated: false,
    uploadedProfiles: [
      {
        id: "local-fool-win32",
        name: "fool-win32-x64 本机配置",
        nameEn: "fool-win32-x64 local profile",
        items: 4,
        updatedAt: "2026-05-19"
      }
    ]
  };
}
