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
    },
    {
      id: "mongodb",
      kind: "software",
      name: "MongoDB 文档数据库",
      nameEn: "MongoDB document database",
      category: "database",
      summary: "MongoDB 7.0 社区版，NoSQL 文档数据库。",
      summaryEn: "MongoDB 7.0 Community Edition, NoSQL document database.",
      rating: 4.6,
      installs: "5.2k",
      imageTone: "emerald",
      sensitivity: "review",
      assets: ["mongodb", "mongosh"],
      guidePath: "configs/catalog/software/mongodb.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "mongodb-org", labelEn: "MongoDB", detail: "apt" }
      ]
    },
    {
      id: "rabbitmq",
      kind: "software",
      name: "RabbitMQ 消息队列",
      nameEn: "RabbitMQ message broker",
      category: "service",
      summary: "RabbitMQ 消息代理，支持 AMQP 协议，含管理面板。",
      summaryEn: "RabbitMQ message broker with AMQP support and management UI.",
      rating: 4.5,
      installs: "3.8k",
      imageTone: "orange",
      sensitivity: "review",
      assets: ["rabbitmq", "erlang", "management-ui"],
      guidePath: "configs/catalog/software/rabbitmq.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "rabbitmq-server", labelEn: "RabbitMQ", detail: "apt" }
      ]
    },
    {
      id: "wireguard-vpn",
      kind: "software",
      name: "WireGuard VPN",
      nameEn: "WireGuard VPN server",
      category: "network",
      summary: "WireGuard 高性能 VPN，内核级加密隧道。",
      summaryEn: "WireGuard high-performance VPN with kernel-level encryption.",
      rating: 4.9,
      installs: "7.1k",
      imageTone: "indigo",
      sensitivity: "privileged",
      assets: ["wireguard", "wg-tools", "ip-forward"],
      guidePath: "configs/catalog/software/wireguard-vpn.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "wireguard", labelEn: "WireGuard", detail: "apt" }
      ]
    },
    {
      id: "netdata-monitoring",
      kind: "software",
      name: "Netdata 实时监控",
      nameEn: "Netdata real-time monitoring",
      category: "service",
      summary: "Netdata 实时系统监控面板，零配置开箱即用。",
      summaryEn: "Netdata real-time monitoring dashboard, zero-config out of the box.",
      rating: 4.7,
      installs: "6.3k",
      imageTone: "emerald",
      sensitivity: "safe",
      assets: ["netdata", "dashboard", "alerts"],
      guidePath: "configs/catalog/software/netdata-monitoring.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "system-command", label: "安装 Netdata", labelEn: "Install Netdata", detail: "curl script" }
      ]
    },
    {
      id: "minio-storage",
      kind: "software",
      name: "MinIO 对象存储",
      nameEn: "MinIO S3-compatible storage",
      category: "service",
      summary: "MinIO S3 兼容对象存储，适合自托管文件/备份。",
      summaryEn: "MinIO S3-compatible object storage for self-hosted files and backups.",
      rating: 4.6,
      installs: "4.1k",
      imageTone: "red",
      sensitivity: "review",
      assets: ["minio", "s3-api", "console"],
      guidePath: "configs/catalog/software/minio-storage.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "system-command", label: "安装 MinIO", labelEn: "Install MinIO", detail: "binary download" }
      ]
    },
    {
      id: "traefik-proxy",
      kind: "software",
      name: "Traefik 反向代理",
      nameEn: "Traefik reverse proxy",
      category: "network",
      summary: "Traefik 现代反向代理，自动 SSL 证书，支持 Docker 服务发现。",
      summaryEn: "Traefik modern reverse proxy with auto-SSL and Docker service discovery.",
      rating: 4.7,
      installs: "5.5k",
      imageTone: "cyan",
      sensitivity: "review",
      assets: ["traefik", "auto-ssl", "dashboard"],
      guidePath: "configs/catalog/software/traefik-proxy.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "system-command", label: "安装 Traefik", labelEn: "Install Traefik", detail: "binary download" }
      ]
    },
    {
      id: "elasticsearch",
      kind: "software",
      name: "Elasticsearch 搜索引擎",
      nameEn: "Elasticsearch search engine",
      category: "database",
      summary: "Elasticsearch 8.x 分布式搜索和分析引擎。",
      summaryEn: "Elasticsearch 8.x distributed search and analytics engine.",
      rating: 4.5,
      installs: "4.8k",
      imageTone: "yellow",
      sensitivity: "review",
      assets: ["elasticsearch", "rest-api"],
      guidePath: "configs/catalog/software/elasticsearch.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system", "docker"],
      components: [
        { type: "software", label: "elasticsearch", labelEn: "Elasticsearch", detail: "apt" }
      ]
    },
    {
      id: "cockpit-panel",
      kind: "software",
      name: "Cockpit Web 管理面板",
      nameEn: "Cockpit web management panel",
      category: "service",
      summary: "Cockpit 浏览器管理面板，可视化管理服务器。",
      summaryEn: "Cockpit browser-based server management panel.",
      rating: 4.4,
      installs: "3.2k",
      imageTone: "blue",
      sensitivity: "safe",
      assets: ["cockpit", "web-ui", "storage"],
      guidePath: "configs/catalog/software/cockpit-panel.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "cockpit", labelEn: "Cockpit", detail: "apt" }
      ]
    },
    {
      id: "htop-tools",
      kind: "software",
      name: "系统监控工具集",
      nameEn: "System monitoring tools",
      category: "developer",
      summary: "htop、btop、iotop、ncdu 等系统诊断和监控工具。",
      summaryEn: "htop, btop, iotop, ncdu and other system diagnostic tools.",
      rating: 4.8,
      installs: "9.7k",
      imageTone: "slate",
      sensitivity: "safe",
      assets: ["htop", "btop", "iotop", "ncdu", "sysstat"],
      guidePath: "configs/catalog/software/htop-tools.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "software", label: "htop", labelEn: "htop", detail: "apt" },
        { type: "software", label: "btop", labelEn: "btop", detail: "apt" },
        { type: "software", label: "ncdu", labelEn: "ncdu", detail: "apt" }
      ]
    },
    {
      id: "swap-config",
      kind: "software",
      name: "Swap 交换空间",
      nameEn: "Swap space configuration",
      category: "service",
      summary: "配置 2GB swap 交换空间，适合小内存 VPS。",
      summaryEn: "Configure 2GB swap space, ideal for low-memory VPS.",
      rating: 4.3,
      installs: "6.8k",
      imageTone: "slate",
      sensitivity: "safe",
      assets: ["swap", "sysctl"],
      guidePath: "configs/catalog/software/swap-config.md",
      guideAuthor: "admin",
      installMode: "skip-existing",
      deployModes: ["system"],
      components: [
        { type: "system-command", label: "创建 Swap", labelEn: "Create swap", detail: "fallocate + mkswap" }
      ]
    },
    {
      id: "mariadb",
      kind: "software",
      name: "MariaDB 数据库",
      nameEn: "MariaDB database",
      category: "database",
      summary: "MySQL 兼容的开源数据库分支。",
      summaryEn: "Open-source MySQL-compatible database fork.",
      rating: 4.6, installs: "4.5k", imageTone: "blue", sensitivity: "review",
      assets: ["mariadb", "mysql-client"],
      guidePath: "configs/catalog/software/mariadb.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "mariadb-server", labelEn: "MariaDB", detail: "apt" }]
    },
    {
      id: "sqlite",
      kind: "software",
      name: "SQLite3 嵌入式数据库",
      nameEn: "SQLite3 embedded database",
      category: "database",
      summary: "轻量级嵌入式 SQL 数据库，零配置。",
      summaryEn: "Lightweight embedded SQL database, zero-config.",
      rating: 4.9, installs: "12.5k", imageTone: "teal", sensitivity: "safe",
      assets: ["sqlite3", "cli"],
      guidePath: "configs/catalog/software/sqlite.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "sqlite3", labelEn: "SQLite3", detail: "apt" }]
    },
    {
      id: "nodejs-version-mgr",
      kind: "software",
      name: "NVM Node 版本管理",
      nameEn: "NVM Node version manager",
      category: "runtime",
      summary: "Node.js 多版本管理工具，自动安装最新 LTS。",
      summaryEn: "Node.js multi-version manager with latest LTS.",
      rating: 4.8, installs: "8.7k", imageTone: "emerald", sensitivity: "safe",
      assets: ["nvm", "node-lts"],
      guidePath: "configs/catalog/software/nodejs-version-mgr.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "system-command", label: "安装 NVM", labelEn: "Install NVM", detail: "curl script" }]
    },
    {
      id: "pyenv-toolchain",
      kind: "software",
      name: "pyenv Python 版本管理",
      nameEn: "pyenv Python version manager",
      category: "runtime",
      summary: "Python 多版本管理工具，含编译依赖。",
      summaryEn: "Python multi-version manager with build deps.",
      rating: 4.7, installs: "6.2k", imageTone: "yellow", sensitivity: "safe",
      assets: ["pyenv", "build-deps"],
      guidePath: "configs/catalog/software/pyenv-toolchain.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "system-command", label: "安装 pyenv", labelEn: "Install pyenv", detail: "curl script" }]
    },
    {
      id: "zsh-shell",
      kind: "software",
      name: "Zsh + Oh My Zsh",
      nameEn: "Zsh with Oh My Zsh",
      category: "developer",
      summary: "Zsh 增强 Shell + Oh My Zsh 框架 + 常用插件。",
      summaryEn: "Zsh enhanced shell + Oh My Zsh + plugins.",
      rating: 4.9, installs: "10.3k", imageTone: "indigo", sensitivity: "safe",
      assets: ["zsh", "oh-my-zsh", "plugins"],
      guidePath: "configs/catalog/software/zsh-shell.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "zsh", labelEn: "Zsh", detail: "apt" }]
    },
    {
      id: "neovim-editor",
      kind: "software",
      name: "Neovim 编辑器",
      nameEn: "Neovim editor",
      category: "developer",
      summary: "现代化 Vim 分支，支持 Lua 配置和 LSP。",
      summaryEn: "Modern Vim fork with Lua config and LSP support.",
      rating: 4.8, installs: "9.4k", imageTone: "emerald", sensitivity: "safe",
      assets: ["neovim", "vim"],
      guidePath: "configs/catalog/software/neovim-editor.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "neovim", labelEn: "Neovim", detail: "apt" }]
    },
    {
      id: "tmux-multiplex",
      kind: "software",
      name: "tmux 终端复用器",
      nameEn: "tmux terminal multiplexer",
      category: "developer",
      summary: "持久化会话、分屏，含合理默认配置。",
      summaryEn: "Persistent sessions, split panes, sane defaults.",
      rating: 4.8, installs: "8.9k", imageTone: "slate", sensitivity: "safe",
      assets: ["tmux"],
      guidePath: "configs/catalog/software/tmux-multiplex.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "tmux", labelEn: "tmux", detail: "apt" }]
    },
    {
      id: "ansible-tool",
      kind: "software",
      name: "Ansible 自动化工具",
      nameEn: "Ansible automation tool",
      category: "developer",
      summary: "IT 自动化配置管理工具。",
      summaryEn: "IT automation and configuration management.",
      rating: 4.7, installs: "5.6k", imageTone: "red", sensitivity: "safe",
      assets: ["ansible", "python"],
      guidePath: "configs/catalog/software/ansible-tool.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "ansible", labelEn: "Ansible", detail: "apt" }]
    },
    {
      id: "nextcloud",
      kind: "software",
      name: "Nextcloud 私有云盘",
      nameEn: "Nextcloud private cloud",
      category: "service",
      summary: "自托管文件同步和协作平台（snap 安装）。",
      summaryEn: "Self-hosted file sync and collaboration (via snap).",
      rating: 4.6, installs: "7.2k", imageTone: "blue", sensitivity: "review",
      assets: ["nextcloud", "snap"],
      guidePath: "configs/catalog/software/nextcloud.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "system-command", label: "snap install nextcloud", labelEn: "snap install nextcloud", detail: "snap" }]
    },
    {
      id: "gitea-server",
      kind: "software",
      name: "Gitea Git 服务器",
      nameEn: "Gitea Git server",
      category: "service",
      summary: "轻量级自托管 Git 服务，含 Web UI、Issue、PR。",
      summaryEn: "Lightweight self-hosted Git service with Web UI, Issues, PRs.",
      rating: 4.7, installs: "5.8k", imageTone: "teal", sensitivity: "review",
      assets: ["gitea", "systemd"],
      guidePath: "configs/catalog/software/gitea-server.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "system-command", label: "安装 Gitea", labelEn: "Install Gitea", detail: "binary download" }]
    },
    {
      id: "portainer",
      kind: "software",
      name: "Portainer Docker 管理",
      nameEn: "Portainer Docker UI",
      category: "container",
      summary: "Docker 可视化管理面板（Web UI），支持容器/镜像/网络管理。",
      summaryEn: "Docker management UI with container/image/network management.",
      rating: 4.8, installs: "8.1k", imageTone: "blue", sensitivity: "review",
      assets: ["portainer", "docker"],
      guidePath: "configs/catalog/software/portainer.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["docker"],
      components: [{ type: "system-command", label: "Portainer 容器", labelEn: "Portainer container", detail: "docker run" }]
    },
    {
      id: "jellyfin-media",
      kind: "software",
      name: "Jellyfin 媒体服务器",
      nameEn: "Jellyfin media server",
      category: "service",
      summary: "开源媒体流媒体服务器，自托管 Netflix 替代品。",
      summaryEn: "Open-source media streaming server, self-hosted Netflix alternative.",
      rating: 4.7, installs: "6.5k", imageTone: "indigo", sensitivity: "review",
      assets: ["jellyfin", "media"],
      guidePath: "configs/catalog/software/jellyfin-media.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "jellyfin", labelEn: "Jellyfin", detail: "apt" }]
    },
    {
      id: "samba-share",
      kind: "software",
      name: "Samba 文件共享",
      nameEn: "Samba file sharing",
      category: "network",
      summary: "SMB/CIFS 文件共享服务，跨平台文件共享。",
      summaryEn: "SMB/CIFS file sharing for cross-platform access.",
      rating: 4.4, installs: "4.7k", imageTone: "slate", sensitivity: "review",
      assets: ["samba", "smbd"],
      guidePath: "configs/catalog/software/samba-share.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "samba", labelEn: "Samba", detail: "apt" }]
    },
    {
      id: "rsync-tools",
      kind: "software",
      name: "备份同步工具集",
      nameEn: "Backup sync tools",
      category: "service",
      summary: "rsync、rclone、borgbackup、restic 等备份工具。",
      summaryEn: "rsync, rclone, borgbackup, restic backup tools.",
      rating: 4.8, installs: "9.3k", imageTone: "emerald", sensitivity: "safe",
      assets: ["rsync", "rclone", "borg", "restic"],
      guidePath: "configs/catalog/software/rsync-tools.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [
        { type: "software", label: "rsync", labelEn: "rsync", detail: "apt" },
        { type: "software", label: "rclone", labelEn: "rclone", detail: "apt" }
      ]
    },
    {
      id: "mosquitto-mqtt",
      kind: "software",
      name: "Mosquitto MQTT 代理",
      nameEn: "Mosquitto MQTT broker",
      category: "service",
      summary: "轻量级 MQTT 消息代理，IoT 标配。",
      summaryEn: "Lightweight MQTT broker for IoT.",
      rating: 4.6, installs: "3.9k", imageTone: "cyan", sensitivity: "review",
      assets: ["mosquitto", "mqtt"],
      guidePath: "configs/catalog/software/mosquitto-mqtt.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "mosquitto", labelEn: "Mosquitto", detail: "apt" }]
    },
    {
      id: "zabbix-monitoring",
      kind: "software",
      name: "Zabbix Agent",
      nameEn: "Zabbix monitoring agent",
      category: "service",
      summary: "Zabbix 企业级监控 Agent。",
      summaryEn: "Zabbix enterprise monitoring agent.",
      rating: 4.5, installs: "3.4k", imageTone: "red", sensitivity: "review",
      assets: ["zabbix-agent"],
      guidePath: "configs/catalog/software/zabbix-monitoring.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "zabbix-agent", labelEn: "Zabbix Agent", detail: "apt" }]
    },
    {
      id: "dotnet-runtime",
      kind: "software",
      name: ".NET 8 SDK",
      nameEn: ".NET 8 SDK",
      category: "runtime",
      summary: "Microsoft .NET 8 SDK，C#/F#/VB.NET 开发。",
      summaryEn: "Microsoft .NET 8 SDK for C#/F#/VB.NET.",
      rating: 4.6, installs: "5.1k", imageTone: "indigo", sensitivity: "safe",
      assets: ["dotnet", "csharp"],
      guidePath: "configs/catalog/software/dotnet-runtime.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "dotnet-sdk-8.0", labelEn: ".NET SDK 8", detail: "apt" }]
    },
    {
      id: "php-toolchain",
      kind: "software",
      name: "PHP 8 工具链",
      nameEn: "PHP 8 toolchain",
      category: "runtime",
      summary: "PHP 8 + 常用扩展 + Composer。",
      summaryEn: "PHP 8 + common extensions + Composer.",
      rating: 4.6, installs: "6.8k", imageTone: "indigo", sensitivity: "safe",
      assets: ["php", "composer"],
      guidePath: "configs/catalog/software/php-toolchain.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "php", labelEn: "PHP", detail: "apt" }]
    },
    {
      id: "ruby-toolchain",
      kind: "software",
      name: "Ruby + Bundler",
      nameEn: "Ruby with Bundler",
      category: "runtime",
      summary: "Ruby 解释器 + Bundler 包管理。",
      summaryEn: "Ruby interpreter + Bundler package manager.",
      rating: 4.5, installs: "3.7k", imageTone: "red", sensitivity: "safe",
      assets: ["ruby", "bundler", "gem"],
      guidePath: "configs/catalog/software/ruby-toolchain.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "ruby-full", labelEn: "Ruby", detail: "apt" }]
    },
    {
      id: "code-server",
      kind: "software",
      name: "code-server (Web VSCode)",
      nameEn: "code-server (browser VSCode)",
      category: "developer",
      summary: "在浏览器中运行的 VSCode，支持远程开发。",
      summaryEn: "VSCode in browser, supports remote development.",
      rating: 4.7, installs: "5.4k", imageTone: "blue", sensitivity: "review",
      assets: ["code-server", "vscode"],
      guidePath: "configs/catalog/software/code-server.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "system-command", label: "安装 code-server", labelEn: "Install code-server", detail: "curl script" }]
    },
    {
      id: "fish-shell",
      kind: "software",
      name: "Fish Shell + Starship",
      nameEn: "Fish Shell with Starship",
      category: "developer",
      summary: "Fish 友好 Shell + Starship 跨 Shell 提示符。",
      summaryEn: "Fish friendly shell + Starship cross-shell prompt.",
      rating: 4.7, installs: "4.2k", imageTone: "cyan", sensitivity: "safe",
      assets: ["fish", "starship"],
      guidePath: "configs/catalog/software/fish-shell.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "fish", labelEn: "Fish", detail: "apt" }]
    },
    {
      id: "jenkins-ci", kind: "software", name: "Jenkins CI/CD", nameEn: "Jenkins CI/CD server",
      category: "developer", summary: "经典 CI/CD 服务器，含 Java 17。", summaryEn: "Classic CI/CD server with Java 17.",
      rating: 4.5, installs: "7.3k", imageTone: "blue", sensitivity: "review",
      assets: ["jenkins", "java"], guidePath: "configs/catalog/software/jenkins-ci.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "jenkins", labelEn: "Jenkins", detail: "apt" }]
    },
    {
      id: "gitlab-runner", kind: "software", name: "GitLab Runner", nameEn: "GitLab CI runner",
      category: "developer", summary: "GitLab CI 执行代理。", summaryEn: "GitLab CI executor agent.",
      rating: 4.6, installs: "4.4k", imageTone: "orange", sensitivity: "review",
      assets: ["gitlab-runner"], guidePath: "configs/catalog/software/gitlab-runner.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "gitlab-runner", labelEn: "GitLab Runner", detail: "apt" }]
    },
    {
      id: "vault-secrets", kind: "software", name: "HashiCorp Vault", nameEn: "HashiCorp Vault secrets",
      category: "security", summary: "密钥/凭据管理系统。", summaryEn: "Secrets and credentials management.",
      rating: 4.7, installs: "3.8k", imageTone: "indigo", sensitivity: "privileged",
      assets: ["vault"], guidePath: "configs/catalog/software/vault-secrets.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "vault", labelEn: "Vault", detail: "apt" }]
    },
    {
      id: "terraform-iac", kind: "software", name: "Terraform IaC", nameEn: "Terraform infrastructure",
      category: "developer", summary: "基础设施即代码工具。", summaryEn: "Infrastructure as Code tool.",
      rating: 4.8, installs: "8.2k", imageTone: "indigo", sensitivity: "review",
      assets: ["terraform"], guidePath: "configs/catalog/software/terraform-iac.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "terraform", labelEn: "Terraform", detail: "apt" }]
    },
    {
      id: "kubernetes-tools", kind: "software", name: "Kubernetes 工具集", nameEn: "Kubernetes tools",
      category: "container", summary: "kubectl + Helm 容器编排工具。", summaryEn: "kubectl + Helm orchestration tools.",
      rating: 4.8, installs: "9.5k", imageTone: "blue", sensitivity: "review",
      assets: ["kubectl", "helm"], guidePath: "configs/catalog/software/kubernetes-tools.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [
        { type: "software", label: "kubectl", labelEn: "kubectl", detail: "apt" },
        { type: "system-command", label: "Helm", labelEn: "Helm", detail: "curl script" }
      ]
    },
    {
      id: "loki-logging", kind: "software", name: "Grafana Loki 日志", nameEn: "Grafana Loki logs",
      category: "service", summary: "Loki + Promtail 日志聚合。", summaryEn: "Loki + Promtail log aggregation.",
      rating: 4.6, installs: "3.6k", imageTone: "amber", sensitivity: "review",
      assets: ["loki", "promtail"], guidePath: "configs/catalog/software/loki-logging.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "loki", labelEn: "Loki", detail: "apt" }]
    },
    {
      id: "openvpn-server", kind: "software", name: "OpenVPN 服务器", nameEn: "OpenVPN server",
      category: "network", summary: "经典 SSL VPN 服务器。", summaryEn: "Classic SSL VPN server.",
      rating: 4.4, installs: "5.2k", imageTone: "indigo", sensitivity: "privileged",
      assets: ["openvpn", "easy-rsa"], guidePath: "configs/catalog/software/openvpn-server.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "openvpn", labelEn: "OpenVPN", detail: "apt" }]
    },
    {
      id: "haproxy-lb", kind: "software", name: "HAProxy 负载均衡", nameEn: "HAProxy load balancer",
      category: "network", summary: "高性能 TCP/HTTP 负载均衡。", summaryEn: "High-performance TCP/HTTP load balancer.",
      rating: 4.7, installs: "5.7k", imageTone: "cyan", sensitivity: "review",
      assets: ["haproxy"], guidePath: "configs/catalog/software/haproxy-lb.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "haproxy", labelEn: "HAProxy", detail: "apt" }]
    },
    {
      id: "sonarqube", kind: "software", name: "SonarQube 代码质量", nameEn: "SonarQube code quality",
      category: "developer", summary: "代码质量和漏洞检查（Docker 部署）。", summaryEn: "Code quality and vuln scanner (Docker).",
      rating: 4.5, installs: "3.1k", imageTone: "blue", sensitivity: "review",
      assets: ["sonarqube", "docker"], guidePath: "configs/catalog/software/sonarqube.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["docker"],
      components: [{ type: "system-command", label: "SonarQube 容器", labelEn: "SonarQube container", detail: "docker run" }]
    },
    {
      id: "rust-cli-tools", kind: "software", name: "现代 CLI 工具集", nameEn: "Modern CLI tools",
      category: "developer", summary: "bat、ripgrep、fd、exa、zoxide、fzf、tldr 等现代工具。", summaryEn: "bat, ripgrep, fd, exa, zoxide, fzf, tldr.",
      rating: 4.9, installs: "11.2k", imageTone: "orange", sensitivity: "safe",
      assets: ["bat", "ripgrep", "fd", "exa", "zoxide", "fzf", "tldr"],
      guidePath: "configs/catalog/software/rust-cli-tools.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [
        { type: "software", label: "bat", labelEn: "bat", detail: "apt" },
        { type: "software", label: "ripgrep", labelEn: "ripgrep", detail: "apt" },
        { type: "software", label: "fd-find", labelEn: "fd", detail: "apt" }
      ]
    },
    {
      id: "memcached", kind: "software", name: "Memcached 缓存", nameEn: "Memcached cache",
      category: "database", summary: "高性能内存缓存系统。", summaryEn: "High-performance in-memory cache.",
      rating: 4.5, installs: "4.3k", imageTone: "yellow", sensitivity: "review",
      assets: ["memcached"], guidePath: "configs/catalog/software/memcached.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system", "docker"],
      components: [{ type: "software", label: "memcached", labelEn: "Memcached", detail: "apt" }]
    },
    {
      id: "flutter-sdk", kind: "software", name: "Flutter SDK", nameEn: "Flutter SDK",
      category: "developer", summary: "Google 跨平台 UI 框架。", summaryEn: "Google cross-platform UI framework.",
      rating: 4.7, installs: "4.1k", imageTone: "blue", sensitivity: "safe",
      assets: ["flutter", "dart"], guidePath: "configs/catalog/software/flutter-sdk.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "system-command", label: "克隆 Flutter", labelEn: "Clone Flutter", detail: "git clone" }]
    },
    {
      id: "nodejs-pm2", kind: "software", name: "PM2 进程管理", nameEn: "PM2 process manager",
      category: "service", summary: "Node.js 应用进程管理器。", summaryEn: "Node.js application process manager.",
      rating: 4.8, installs: "6.7k", imageTone: "emerald", sensitivity: "safe",
      assets: ["pm2"], guidePath: "configs/catalog/software/nodejs-pm2.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "system-command", label: "npm install -g pm2", labelEn: "Install PM2", detail: "npm" }]
    },
    {
      id: "openresty", kind: "software", name: "OpenResty (Nginx+Lua)", nameEn: "OpenResty (Nginx+Lua)",
      category: "network", summary: "Nginx + Lua 高性能 Web 平台。", summaryEn: "Nginx + Lua high-performance web platform.",
      rating: 4.6, installs: "3.4k", imageTone: "red", sensitivity: "review",
      assets: ["openresty", "nginx", "lua"], guidePath: "configs/catalog/software/openresty.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "openresty", labelEn: "OpenResty", detail: "apt" }]
    },
    {
      id: "nethogs-bandwidth", kind: "software", name: "网络流量监控", nameEn: "Network bandwidth tools",
      category: "network", summary: "nethogs、iftop、vnstat、tcpdump、nmap 等网络工具。", summaryEn: "nethogs, iftop, vnstat, tcpdump, nmap.",
      rating: 4.7, installs: "7.6k", imageTone: "cyan", sensitivity: "safe",
      assets: ["nethogs", "iftop", "vnstat", "tcpdump", "nmap"],
      guidePath: "configs/catalog/software/nethogs-bandwidth.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [
        { type: "software", label: "nethogs", labelEn: "nethogs", detail: "apt" },
        { type: "software", label: "vnstat", labelEn: "vnstat", detail: "apt" }
      ]
    },
    {
      id: "firewalld", kind: "software", name: "firewalld 防火墙", nameEn: "firewalld dynamic firewall",
      category: "security", summary: "动态防火墙管理器，UFW 替代品。", summaryEn: "Dynamic firewall, UFW alternative.",
      rating: 4.5, installs: "3.9k", imageTone: "red", sensitivity: "privileged",
      assets: ["firewalld"], guidePath: "configs/catalog/software/firewalld.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [{ type: "software", label: "firewalld", labelEn: "firewalld", detail: "apt" }]
    },
    {
      id: "x-ui-panel", kind: "software", name: "3x-ui 面板", nameEn: "3x-ui panel",
      category: "network",
      summary: "3x-ui 面板（Xray + 多协议代理）一键安装，含端口、用户名、密码配置。",
      summaryEn: "3x-ui panel (Xray multi-protocol proxy) one-click install with port + admin password setup.",
      rating: 4.6, installs: "0", imageTone: "indigo", sensitivity: "privileged",
      assets: ["3x-ui", "xray", "panel"],
      guidePath: "configs/catalog/software/x-ui-panel.md",
      guideAuthor: "admin", installMode: "skip-existing", deployModes: ["system"],
      components: [
        { type: "system-command", label: "下载并运行 install.sh", labelEn: "fetch install.sh", detail: "curl + bash" },
        { type: "system-command", label: "设置面板端口与口令", labelEn: "set panel port + admin", detail: "x-ui setting" }
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
