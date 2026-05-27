import type { ConfigFileInfo } from "./config-files.js";

export type PackageManager = "apt" | "rpm" | "snap" | "flatpak" | "npm" | "pip" | "gem" | "cargo" | "docker";
export type ConfigSensitivity = "safe" | "review" | "secret";
export type MigrationStrategy = "package-only" | "template-or-copy" | "copy-with-review" | "manual-review";

export interface CatalogDetectionRule {
  id: string;
  displayName: string;
  category: "runtime" | "developer" | "database" | "container" | "security" | "network" | "service";
  detect: {
    packages?: Partial<Record<PackageManager, string[]>>;
    binaries?: string[];
    systemd?: string[];
    ports?: number[];
  };
  config?: {
    files?: string[];
    globs?: string[];
    exclude?: string[];
    maxSizeKB?: number;
    secretPatterns?: string[];
  };
  data?: {
    paths?: string[];
  };
  migrate: {
    package: boolean;
    config: boolean;
    data: "none" | "optional" | "recommended";
    strategy: MigrationStrategy;
    restartServices?: string[];
    validate?: string[];
  };
}

const commonSecretPatterns = [
  "password",
  "passwd",
  "token",
  "secret",
  "private_key",
  "BEGIN PRIVATE KEY",
  "AWS_ACCESS_KEY_ID",
  "DATABASE_URL"
];

export const catalogDetectionRules: CatalogDetectionRule[] = [
  {
    id: "nginx",
    displayName: "Nginx",
    category: "service",
    detect: {
      packages: { apt: ["nginx", "nginx-full", "nginx-extras"], rpm: ["nginx"] },
      binaries: ["nginx"],
      systemd: ["nginx.service"],
      ports: [80, 443]
    },
    config: {
      files: ["/etc/nginx/nginx.conf", "/etc/nginx/mime.types"],
      globs: ["/etc/nginx/conf.d/*.conf", "/etc/nginx/sites-available/*", "/etc/nginx/sites-enabled/*"],
      exclude: ["/etc/nginx/*.default"],
      maxSizeKB: 256,
      secretPatterns: ["ssl_certificate_key", ...commonSecretPatterns]
    },
    data: { paths: ["/var/www", "/usr/share/nginx/html"] },
    migrate: { package: true, config: true, data: "optional", strategy: "template-or-copy", restartServices: ["nginx"], validate: ["nginx -t"] }
  },
  {
    id: "docker",
    displayName: "Docker",
    category: "container",
    detect: {
      packages: { apt: ["docker.io", "docker-ce", "docker-compose-plugin"], rpm: ["docker-ce", "moby-engine"] },
      binaries: ["docker", "docker-compose"],
      systemd: ["docker.service"],
      ports: []
    },
    config: {
      files: ["/etc/docker/daemon.json"],
      globs: ["/opt/*/docker-compose.yml", "/opt/*/compose.yaml", "/srv/*/docker-compose.yml", "/srv/*/compose.yaml"],
      maxSizeKB: 256,
      secretPatterns: commonSecretPatterns
    },
    data: { paths: ["/var/lib/docker"] },
    migrate: { package: true, config: true, data: "optional", strategy: "copy-with-review", restartServices: ["docker"], validate: ["docker version", "docker compose version"] }
  },
  {
    id: "postgresql",
    displayName: "PostgreSQL",
    category: "database",
    detect: {
      packages: { apt: ["postgresql", "postgresql-16", "postgresql-client"], rpm: ["postgresql", "postgresql-server"] },
      binaries: ["psql"],
      systemd: ["postgresql.service"],
      ports: [5432]
    },
    config: {
      globs: ["/etc/postgresql/*/main/postgresql.conf", "/etc/postgresql/*/main/pg_hba.conf"],
      maxSizeKB: 256,
      secretPatterns: commonSecretPatterns
    },
    data: { paths: ["/var/lib/postgresql"] },
    migrate: { package: true, config: true, data: "optional", strategy: "copy-with-review", restartServices: ["postgresql"], validate: ["systemctl is-active postgresql"] }
  },
  {
    id: "mysql",
    displayName: "MySQL / MariaDB",
    category: "database",
    detect: {
      packages: { apt: ["mysql-server", "mariadb-server"], rpm: ["mysql-server", "mariadb-server"] },
      binaries: ["mysql"],
      systemd: ["mysql.service", "mariadb.service"],
      ports: [3306]
    },
    config: {
      files: ["/etc/mysql/my.cnf"],
      globs: ["/etc/mysql/mysql.conf.d/*.cnf", "/etc/mysql/mariadb.conf.d/*.cnf"],
      maxSizeKB: 256,
      secretPatterns: commonSecretPatterns
    },
    data: { paths: ["/var/lib/mysql"] },
    migrate: { package: true, config: true, data: "optional", strategy: "copy-with-review", restartServices: ["mysql", "mariadb"], validate: ["mysql --version"] }
  },
  {
    id: "redis",
    displayName: "Redis",
    category: "database",
    detect: {
      packages: { apt: ["redis", "redis-server"], rpm: ["redis", "redis6"] },
      binaries: ["redis-server", "redis-cli"],
      systemd: ["redis.service", "redis-server.service"],
      ports: [6379]
    },
    config: {
      files: ["/etc/redis/redis.conf"],
      maxSizeKB: 256,
      secretPatterns: ["requirepass", ...commonSecretPatterns]
    },
    data: { paths: ["/var/lib/redis"] },
    migrate: { package: true, config: true, data: "optional", strategy: "copy-with-review", restartServices: ["redis", "redis-server"], validate: ["redis-cli ping"] }
  },
  {
    id: "nodejs",
    displayName: "Node.js / npm",
    category: "runtime",
    detect: {
      packages: { apt: ["nodejs", "npm"], rpm: ["nodejs", "npm"], npm: ["npm"] },
      binaries: ["node", "npm"]
    },
    config: {
      files: ["~/.npmrc"],
      maxSizeKB: 64,
      secretPatterns: ["_authToken", ...commonSecretPatterns]
    },
    migrate: { package: true, config: true, data: "none", strategy: "template-or-copy", validate: ["node --version", "npm --version"] }
  },
  {
    id: "python",
    displayName: "Python / pip",
    category: "runtime",
    detect: {
      packages: { apt: ["python3", "python3-pip", "pipx"], rpm: ["python3", "python3-pip", "pipx"], pip: ["pip", "pipx"] },
      binaries: ["python3", "pip3", "pipx"]
    },
    config: {
      files: ["~/.config/pip/pip.conf", "/etc/pip.conf"],
      maxSizeKB: 64,
      secretPatterns: commonSecretPatterns
    },
    migrate: { package: true, config: true, data: "none", strategy: "template-or-copy", validate: ["python3 --version", "pip3 --version"] }
  },
  {
    id: "ssh",
    displayName: "OpenSSH",
    category: "security",
    detect: {
      packages: { apt: ["openssh-server", "ssh"], rpm: ["openssh-server", "openssh-clients"] },
      binaries: ["ssh", "sshd"],
      systemd: ["ssh.service", "sshd.service"],
      ports: [22]
    },
    config: {
      files: ["/etc/ssh/sshd_config", "~/.ssh/config"],
      globs: ["/etc/ssh/sshd_config.d/*.conf"],
      maxSizeKB: 128,
      secretPatterns: ["IdentityFile", ...commonSecretPatterns]
    },
    migrate: { package: true, config: true, data: "none", strategy: "copy-with-review", restartServices: ["ssh", "sshd"], validate: ["sshd -t"] }
  },
  {
    id: "ufw",
    displayName: "UFW firewall",
    category: "security",
    detect: {
      packages: { apt: ["ufw"] },
      binaries: ["ufw"],
      systemd: ["ufw.service"]
    },
    config: {
      files: ["/etc/ufw/user.rules", "/etc/ufw/user6.rules", "/etc/default/ufw"],
      maxSizeKB: 256,
      secretPatterns: commonSecretPatterns
    },
    migrate: { package: true, config: true, data: "none", strategy: "copy-with-review", restartServices: ["ufw"], validate: ["ufw status"] }
  },
  {
    id: "fail2ban",
    displayName: "Fail2Ban",
    category: "security",
    detect: {
      packages: { apt: ["fail2ban"], rpm: ["fail2ban"] },
      binaries: ["fail2ban-client"],
      systemd: ["fail2ban.service"]
    },
    config: {
      files: ["/etc/fail2ban/jail.local", "/etc/fail2ban/jail.conf"],
      globs: ["/etc/fail2ban/jail.d/*.conf"],
      maxSizeKB: 256,
      secretPatterns: commonSecretPatterns
    },
    migrate: { package: true, config: true, data: "none", strategy: "copy-with-review", restartServices: ["fail2ban"], validate: ["fail2ban-client status"] }
  }
];

export function findRuleForPackage(name: string, source?: string): CatalogDetectionRule | undefined {
  const normalized = normalizeName(name);
  return catalogDetectionRules.find((rule) => {
    if (normalizeName(rule.id) === normalized) return true;
    if (rule.displayName.toLowerCase().includes(normalized)) return true;
    const packageSets = rule.detect.packages ?? {};
    for (const [manager, names] of Object.entries(packageSets)) {
      if (source && source !== manager && !(source === "apt-manual" && manager === "apt")) continue;
      if (names?.some((pkg) => normalizeName(pkg) === normalized)) return true;
    }
    return rule.detect.binaries?.some((bin) => normalizeName(bin) === normalized) ?? false;
  });
}

export function getConfigDiscoveryRules(installedSoftware: string[]): Array<{
  rule: CatalogDetectionRule;
  path: string;
  category: ConfigFileInfo["category"];
  isGlob: boolean;
}> {
  const names = new Set(installedSoftware.map(normalizeName));
  const matched = catalogDetectionRules.filter((rule) => {
    const packageNames = Object.values(rule.detect.packages ?? {}).flat().map(normalizeName);
    const binaries = (rule.detect.binaries ?? []).map(normalizeName);
    return [...packageNames, ...binaries, normalizeName(rule.id)].some((name) => names.has(name));
  });

  return matched.flatMap((rule) => {
    const files = (rule.config?.files ?? []).map((path) => ({ rule, path, category: "app" as const, isGlob: false }));
    const globs = (rule.config?.globs ?? []).map((path) => ({ rule, path, category: "app" as const, isGlob: true }));
    return [...files, ...globs];
  });
}

export function ruleSecretPatterns(rule?: CatalogDetectionRule): string[] {
  return [...new Set([...(rule?.config?.secretPatterns ?? []), ...commonSecretPatterns])];
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.service$/, "").replace(/^docker\.io$/, "docker").trim();
}
