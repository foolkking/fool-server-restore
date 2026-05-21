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
  /** 支持的部署模式：system = apt 安装，docker = docker compose 部署 */
  deployModes?: Array<"system" | "docker">;
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
      deployModes: ["system"],
      components: [
        { type: "software", label: "nodejs", labelEn: "Node.js", detail: "apt" },
        { type: "software", label: "npm", labelEn: "npm", detail: "apt" },
        { type: "system-command", label: "设置 npm registry", labelEn: "set npm registry", detail: "echo 'export NPM_CONFIG_REGISTRY=\"https://registry.npmmirror.com\"' >> ~/.bashrc" }
      ]
    },
    {
      id: "docker-host-profile",
      kind: "software",
      name: "Docker 容器引擎",
      nameEn: "Docker container engine",
      category: "container",
      summary: "Docker Engine 安装、compose 插件、镜像加速和服务自启动。",
      summaryEn: "Docker Engine install, compose plugin, registry mirrors, and auto-start.",
      rating: 4.7,
      installs: "8.9k",
      imageTone: "blue",
      sensitivity: "privileged",
      assets: ["docker", "compose", "service"],
      guidePath: "configs/catalog/software/docker-host-profile.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "docker.io", labelEn: "Docker Engine", detail: "apt" },
        { type: "software", label: "docker-compose-plugin", labelEn: "Docker Compose", detail: "apt" },
        { type: "system-command", label: "启动 Docker 服务", labelEn: "start Docker service", detail: "sudo systemctl enable docker" },
        { type: "system-command", label: "启动 Docker", labelEn: "start Docker", detail: "sudo systemctl start docker" }
      ]
    },
    {
      id: "ssh-hardening",
      kind: "combo",
      name: "SSH 安全加固",
      nameEn: "SSH hardening policy",
      category: "security",
      summary: "端口修改、禁用 Root 登录、公钥认证、连接限制和审计。",
      summaryEn: "Port change, disable root login, public-key auth, connection limits, and audit.",
      rating: 4.9,
      installs: "6.2k",
      imageTone: "slate",
      sensitivity: "privileged",
      assets: ["ssh", "audit", "firewall"],
      guidePath: "configs/catalog/combos/ssh-hardening.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "openssh-server", labelEn: "OpenSSH Server", detail: "apt" },
        { type: "system-command", label: "重启 sshd", labelEn: "restart sshd", detail: "sudo systemctl restart sshd" }
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
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "nginx", labelEn: "Nginx", detail: "apt" },
        { type: "system-command", label: "启动 Nginx", labelEn: "start Nginx", detail: "sudo systemctl enable nginx" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start nginx" }
      ]
    },
    {
      id: "postgres-profile",
      kind: "software",
      name: "PostgreSQL 数据库",
      nameEn: "PostgreSQL database",
      category: "database",
      summary: "PostgreSQL 安装、端口策略、备份目录、基础安全配置。",
      summaryEn: "PostgreSQL install, port policy, backup path, and baseline security.",
      rating: 4.5,
      installs: "4.8k",
      imageTone: "indigo",
      sensitivity: "privileged",
      assets: ["postgres", "backup", "service"],
      guidePath: "configs/catalog/software/postgres-profile.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "postgresql", labelEn: "PostgreSQL", detail: "apt" },
        { type: "software", label: "postgresql-contrib", labelEn: "PostgreSQL contrib", detail: "apt" },
        { type: "system-command", label: "启动 PostgreSQL", labelEn: "start PostgreSQL", detail: "sudo systemctl enable postgresql" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start postgresql" }
      ]
    },
    {
      id: "firewall-baseline",
      kind: "combo",
      name: "防火墙基线",
      nameEn: "Firewall baseline",
      category: "network",
      summary: "UFW 防火墙、常见入站端口、出站策略和服务分组。",
      summaryEn: "UFW firewall, common inbound ports, outbound rules, and service groups.",
      rating: 4.8,
      installs: "7.3k",
      imageTone: "red",
      sensitivity: "privileged",
      assets: ["firewall", "ports", "network"],
      guidePath: "configs/catalog/combos/firewall-baseline.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "ufw", labelEn: "UFW firewall", detail: "apt" },
        { type: "system-command", label: "启用 UFW", labelEn: "enable UFW", detail: "sudo ufw enable" }
      ]
    },
    {
      id: "python-toolchain",
      kind: "software",
      name: "Python 工具链",
      nameEn: "Python toolchain",
      category: "runtime",
      summary: "Python3、pip、虚拟环境、镜像源和常用 CLI 工具。",
      summaryEn: "Python3, pip, virtualenv, mirrors, and common CLI tools.",
      rating: 4.6,
      installs: "9.6k",
      imageTone: "yellow",
      sensitivity: "safe",
      assets: ["python", "pip", "venv"],
      guidePath: "configs/catalog/software/python-toolchain.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "python3", labelEn: "Python 3", detail: "apt" },
        { type: "software", label: "python3-pip", labelEn: "pip", detail: "apt" },
        { type: "software", label: "python3-venv", labelEn: "venv", detail: "apt" }
      ]
    },
    ...getNewSoftwareCatalog(),
    ...getNewComboCatalog()
  ];
}

function getNewSoftwareCatalog(): CatalogItem[] {
  return [
    {
      id: "redis-server",
      kind: "software",
      name: "Redis 内存数据库",
      nameEn: "Redis in-memory database",
      category: "database",
      summary: "Redis 安装、持久化配置、内存策略和服务管理。",
      summaryEn: "Redis install, persistence config, memory policy, and service management.",
      rating: 4.8,
      installs: "11.2k",
      imageTone: "red",
      sensitivity: "review",
      assets: ["redis", "service", "config"],
      guidePath: "configs/catalog/software/redis-server.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "redis-server", labelEn: "Redis Server", detail: "apt" },
        { type: "system-command", label: "启动 Redis", labelEn: "start Redis", detail: "sudo systemctl enable redis-server" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start redis-server" }
      ]
    },
    {
      id: "mysql-server",
      kind: "software",
      name: "MySQL 数据库",
      nameEn: "MySQL database server",
      category: "database",
      summary: "MySQL Server 安装、安全初始化、字符集配置和服务管理。",
      summaryEn: "MySQL Server install, secure initialization, charset config, and service management.",
      rating: 4.6,
      installs: "9.8k",
      imageTone: "orange",
      sensitivity: "privileged",
      assets: ["mysql", "service", "backup"],
      guidePath: "configs/catalog/software/mysql-server.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "mysql-server", labelEn: "MySQL Server", detail: "apt" },
        { type: "system-command", label: "启动 MySQL", labelEn: "start MySQL", detail: "sudo systemctl enable mysql" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start mysql" }
      ]
    },
    {
      id: "golang-runtime",
      kind: "software",
      name: "Go 语言运行时",
      nameEn: "Go language runtime",
      category: "runtime",
      summary: "Go 编译器安装、GOPATH 配置、模块代理和常用工具。",
      summaryEn: "Go compiler install, GOPATH setup, module proxy, and common tools.",
      rating: 4.7,
      installs: "7.3k",
      imageTone: "cyan",
      sensitivity: "safe",
      assets: ["go", "gopath", "modules"],
      guidePath: "configs/catalog/software/golang-runtime.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "golang-go", labelEn: "Go compiler", detail: "apt" },
        { type: "system-command", label: "设置 GOPATH", labelEn: "set GOPATH", detail: "echo 'export GOPATH=\"$HOME/go\"' >> ~/.bashrc" },
        { type: "system-command", label: "设置 PATH", labelEn: "set PATH", detail: "echo 'export PATH=\"$PATH:$GOPATH/bin\"' >> ~/.bashrc" }
      ]
    },
    {
      id: "openjdk-runtime",
      kind: "software",
      name: "Java / OpenJDK 运行时",
      nameEn: "Java / OpenJDK runtime",
      category: "runtime",
      summary: "OpenJDK 安装、JAVA_HOME 配置、Maven 支持。",
      summaryEn: "OpenJDK install, JAVA_HOME setup, Maven support.",
      rating: 4.5,
      installs: "8.1k",
      imageTone: "amber",
      sensitivity: "safe",
      assets: ["java", "jdk", "maven"],
      guidePath: "configs/catalog/software/openjdk-runtime.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "default-jdk", labelEn: "OpenJDK", detail: "apt" },
        { type: "software", label: "maven", labelEn: "Maven", detail: "apt" }
      ]
    },
    {
      id: "rust-toolchain",
      kind: "software",
      name: "Rust 工具链",
      nameEn: "Rust toolchain",
      category: "runtime",
      summary: "Rust 编译器（rustup）、Cargo 包管理器和常用开发工具。",
      summaryEn: "Rust compiler (rustup), Cargo package manager, and common dev tools.",
      rating: 4.7,
      installs: "5.4k",
      imageTone: "orange",
      sensitivity: "safe",
      assets: ["rust", "cargo", "rustup"],
      guidePath: "configs/catalog/software/rust-toolchain.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "curl", labelEn: "curl (for rustup)", detail: "apt" },
        { type: "software", label: "build-essential", labelEn: "build-essential", detail: "apt" }
      ]
    },
    {
      id: "git-version-control",
      kind: "software",
      name: "Git 版本控制",
      nameEn: "Git version control",
      category: "developer",
      summary: "Git 安装、全局配置、凭据管理和常用 alias。",
      summaryEn: "Git install, global config, credential management, and common aliases.",
      rating: 4.9,
      installs: "15.6k",
      imageTone: "orange",
      sensitivity: "safe",
      assets: ["git", "config", "alias"],
      guidePath: "configs/catalog/software/git-version-control.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "git", labelEn: "Git", detail: "apt" },
        { type: "software", label: "git-lfs", labelEn: "Git LFS", detail: "apt" }
      ]
    },
    {
      id: "certbot-ssl",
      kind: "software",
      name: "Certbot / Let's Encrypt SSL",
      nameEn: "Certbot / Let's Encrypt SSL",
      category: "security",
      summary: "免费 SSL 证书自动申请、续期和 Nginx 集成。",
      summaryEn: "Free SSL certificate auto-issue, renewal, and Nginx integration.",
      rating: 4.8,
      installs: "8.7k",
      imageTone: "emerald",
      sensitivity: "review",
      assets: ["certbot", "ssl", "letsencrypt"],
      guidePath: "configs/catalog/software/certbot-ssl.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "certbot", labelEn: "Certbot", detail: "apt" },
        { type: "software", label: "python3-certbot-nginx", labelEn: "Certbot Nginx plugin", detail: "apt" }
      ]
    },
    {
      id: "fail2ban-protection",
      kind: "software",
      name: "Fail2Ban 入侵防护",
      nameEn: "Fail2Ban intrusion protection",
      category: "security",
      summary: "自动封禁暴力破解 IP、SSH 防护、自定义 jail 规则。",
      summaryEn: "Auto-ban brute-force IPs, SSH protection, custom jail rules.",
      rating: 4.7,
      installs: "7.9k",
      imageTone: "slate",
      sensitivity: "review",
      assets: ["fail2ban", "ssh", "security"],
      guidePath: "configs/catalog/software/fail2ban-protection.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "fail2ban", labelEn: "Fail2Ban", detail: "apt" },
        { type: "system-command", label: "启动 Fail2Ban", labelEn: "start Fail2Ban", detail: "sudo systemctl enable fail2ban" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start fail2ban" }
      ]
    },
    {
      id: "prometheus-monitoring",
      kind: "software",
      name: "Prometheus 监控",
      nameEn: "Prometheus monitoring",
      category: "service",
      summary: "时序数据库、指标采集、告警规则和 Node Exporter。",
      summaryEn: "Time-series DB, metrics collection, alert rules, and Node Exporter.",
      rating: 4.6,
      installs: "6.1k",
      imageTone: "orange",
      sensitivity: "review",
      assets: ["prometheus", "metrics", "alerting"],
      guidePath: "configs/catalog/software/prometheus-monitoring.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "prometheus", labelEn: "Prometheus", detail: "apt" },
        { type: "software", label: "prometheus-node-exporter", labelEn: "Node Exporter", detail: "apt" },
        { type: "system-command", label: "启动 Prometheus", labelEn: "start Prometheus", detail: "sudo systemctl enable prometheus" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start prometheus" }
      ]
    },
    {
      id: "grafana-dashboard",
      kind: "software",
      name: "Grafana 可视化面板",
      nameEn: "Grafana visualization dashboard",
      category: "service",
      summary: "数据可视化平台、仪表盘模板、数据源集成和告警通知。",
      summaryEn: "Data visualization platform, dashboard templates, datasource integration, and alerting.",
      rating: 4.7,
      installs: "5.8k",
      imageTone: "amber",
      sensitivity: "review",
      assets: ["grafana", "dashboard", "visualization"],
      guidePath: "configs/catalog/software/grafana-dashboard.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "grafana", labelEn: "Grafana", detail: "apt" },
        { type: "system-command", label: "启动 Grafana", labelEn: "start Grafana", detail: "sudo systemctl enable grafana-server" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start grafana-server" }
      ]
    }
  ];
}

function getNewComboCatalog(): CatalogItem[] {
  return [
    {
      id: "lamp-stack",
      kind: "combo",
      name: "LAMP 全栈环境",
      nameEn: "LAMP full stack",
      category: "service",
      summary: "Apache + MySQL + PHP 经典 Web 服务器组合，一键部署。",
      summaryEn: "Apache + MySQL + PHP classic web server stack, one-click deploy.",
      rating: 4.5,
      installs: "13.2k",
      imageTone: "amber",
      sensitivity: "review",
      assets: ["apache", "mysql", "php"],
      guidePath: "configs/catalog/combos/lamp-stack.md",
      guideAuthor: "user",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "apache2", labelEn: "Apache2", detail: "apt" },
        { type: "software", label: "mysql-server", labelEn: "MySQL Server", detail: "apt" },
        { type: "software", label: "php", labelEn: "PHP", detail: "apt" },
        { type: "software", label: "libapache2-mod-php", labelEn: "Apache PHP module", detail: "apt" },
        { type: "software", label: "php-mysql", labelEn: "PHP MySQL extension", detail: "apt" },
        { type: "system-command", label: "启动 Apache", labelEn: "start Apache", detail: "sudo systemctl enable apache2" },
        { type: "system-command", label: "启动 MySQL", labelEn: "start MySQL", detail: "sudo systemctl enable mysql" }
      ]
    },
    {
      id: "lemp-stack",
      kind: "combo",
      name: "LEMP 全栈环境",
      nameEn: "LEMP full stack",
      category: "service",
      summary: "Nginx + MySQL + PHP-FPM 高性能 Web 服务器组合。",
      summaryEn: "Nginx + MySQL + PHP-FPM high-performance web server stack.",
      rating: 4.7,
      installs: "11.8k",
      imageTone: "emerald",
      sensitivity: "review",
      assets: ["nginx", "mysql", "php-fpm"],
      guidePath: "configs/catalog/combos/lemp-stack.md",
      guideAuthor: "user",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "nginx", labelEn: "Nginx", detail: "apt" },
        { type: "software", label: "mysql-server", labelEn: "MySQL Server", detail: "apt" },
        { type: "software", label: "php-fpm", labelEn: "PHP-FPM", detail: "apt" },
        { type: "software", label: "php-mysql", labelEn: "PHP MySQL extension", detail: "apt" },
        { type: "system-command", label: "启动 Nginx", labelEn: "start Nginx", detail: "sudo systemctl enable nginx" },
        { type: "system-command", label: "启动 MySQL", labelEn: "start MySQL", detail: "sudo systemctl enable mysql" }
      ]
    },
    {
      id: "node-production-deploy",
      kind: "combo",
      name: "Node.js 生产部署",
      nameEn: "Node.js production deploy",
      category: "runtime",
      summary: "Node.js + PM2 进程管理 + Nginx 反向代理，生产级部署方案。",
      summaryEn: "Node.js + PM2 process manager + Nginx reverse proxy, production-grade deploy.",
      rating: 4.8,
      installs: "9.4k",
      imageTone: "teal",
      sensitivity: "review",
      assets: ["node", "pm2", "nginx", "proxy"],
      guidePath: "configs/catalog/combos/node-production-deploy.md",
      guideAuthor: "user",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "nodejs", labelEn: "Node.js", detail: "apt" },
        { type: "software", label: "npm", labelEn: "npm", detail: "apt" },
        { type: "software", label: "pm2", labelEn: "PM2", detail: "npm" },
        { type: "software", label: "nginx", labelEn: "Nginx", detail: "apt" },
        { type: "system-command", label: "启动 Nginx", labelEn: "start Nginx", detail: "sudo systemctl enable nginx" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start nginx" }
      ]
    },
    {
      id: "docker-compose-dev",
      kind: "combo",
      name: "Docker + Compose 开发环境",
      nameEn: "Docker + Compose dev environment",
      category: "container",
      summary: "Docker Engine + Docker Compose + 常用开发镜像配置。",
      summaryEn: "Docker Engine + Docker Compose + common dev image configurations.",
      rating: 4.7,
      installs: "10.5k",
      imageTone: "blue",
      sensitivity: "review",
      assets: ["docker", "compose", "dev"],
      guidePath: "configs/catalog/combos/docker-compose-dev.md",
      guideAuthor: "user",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "docker.io", labelEn: "Docker Engine", detail: "apt" },
        { type: "software", label: "docker-compose-plugin", labelEn: "Docker Compose", detail: "apt" },
        { type: "software", label: "docker-buildx-plugin", labelEn: "Docker Buildx", detail: "apt" },
        { type: "system-command", label: "启动 Docker", labelEn: "start Docker", detail: "sudo systemctl enable docker" },
        { type: "system-command", label: "启动服务", labelEn: "start service", detail: "sudo systemctl start docker" }
      ]
    },
    {
      id: "security-baseline",
      kind: "combo",
      name: "安全基线（UFW + Fail2Ban + SSH 加固 + 自动更新）",
      nameEn: "Security baseline (UFW + Fail2Ban + SSH hardening + auto-update)",
      category: "security",
      summary: "服务器安全加固一站式方案：防火墙、入侵防护、SSH 加固和自动安全更新。",
      summaryEn: "One-stop server hardening: firewall, intrusion protection, SSH hardening, and auto security updates.",
      rating: 4.9,
      installs: "8.6k",
      imageTone: "slate",
      sensitivity: "privileged",
      assets: ["ufw", "fail2ban", "ssh", "unattended-upgrades"],
      guidePath: "configs/catalog/combos/security-baseline.md",
      guideAuthor: "user",
      installMode: "replace-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "ufw", labelEn: "UFW firewall", detail: "apt" },
        { type: "software", label: "fail2ban", labelEn: "Fail2Ban", detail: "apt" },
        { type: "software", label: "unattended-upgrades", labelEn: "Unattended Upgrades", detail: "apt" },
        { type: "system-command", label: "启动 Fail2Ban", labelEn: "start Fail2Ban", detail: "sudo systemctl enable fail2ban" },
        { type: "system-command", label: "启动服务", labelEn: "start services", detail: "sudo systemctl start fail2ban" }
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
