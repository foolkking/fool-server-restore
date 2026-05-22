/**
 * known-packages.ts — Curated whitelist of well-known user-installed Linux server packages.
 *
 * Why this exists:
 *   Cloud images (Aliyun / AWS / Azure / GCP) preinstall hundreds of packages and mark
 *   them all as "manual" via apt. Distinguishing user-installed from vendor-preinstalled
 *   via timestamps or installer baseline is unreliable across providers (cloud-init runs
 *   upgrades, image layers span days, no /var/log/installer/initial-status.gz on most clouds).
 *
 *   This is the simplest universal filter: only surface packages that match a known piece
 *   of server software. The UI provides a "show all" toggle and "add custom" input as
 *   escape hatches for the rare case where the whitelist misses something.
 *
 *   Note: this is an *include* list, applied AFTER the existing system blacklist as a
 *   precision filter. A package shown to the user must be:
 *     - NOT in the system blacklist (lib*, linux-*, python3-*, gnome-*, ...)
 *     - AND in this whitelist OR matching a known user-prefix
 */

/** Exact package names */
export const KNOWN_USER_PACKAGES = new Set<string>([
  // ── Web servers / reverse proxies / load balancers ──
  "nginx", "apache2", "httpd", "caddy", "haproxy", "traefik",
  "openresty", "varnish", "lighttpd", "tomcat9", "tomcat10",

  // ── Databases ──
  "mysql-server", "mysql-client", "mysql-common",
  "mariadb-server", "mariadb-client",
  "postgresql", "postgresql-client", "postgresql-contrib", "pgadmin4",
  "redis-server", "redis-tools", "redis",
  "mongodb", "mongodb-server", "mongodb-org", "mongodb-clients", "mongodb-mongosh",
  "memcached", "etcd", "etcd-server",
  "elasticsearch", "kibana", "logstash", "opensearch",
  "rabbitmq-server", "kafka",
  "influxdb", "influxdb2", "telegraf",
  "cassandra", "neo4j", "couchdb",
  "sqlite3",

  // ── Programming languages / runtimes ──
  "nodejs", "npm", "yarn", "pnpm", "node",
  "python3-pip", "python3-venv", "python3-dev", "python3-full", "ipython3",
  "golang", "golang-go", "go",
  "default-jdk", "default-jre", "default-jdk-headless", "default-jre-headless",
  "openjdk-8-jdk", "openjdk-11-jdk", "openjdk-17-jdk", "openjdk-21-jdk",
  "openjdk-8-jre", "openjdk-11-jre", "openjdk-17-jre", "openjdk-21-jre",
  "maven", "gradle", "ant", "sbt",
  "rustc", "cargo",
  "ruby", "ruby-full", "rubygems-integration",
  "php", "php-cli", "php-fpm", "php-mysql", "php-pgsql", "php-curl", "php-gd",
  "php-mbstring", "php-xml", "php-zip", "php-imagick", "php-redis",
  "perl", "lua5.3", "lua5.4",
  "erlang", "elixir",
  "dotnet-sdk-6.0", "dotnet-sdk-7.0", "dotnet-sdk-8.0",

  // ── Container / orchestration ──
  "docker.io", "docker-ce", "docker-ce-cli", "docker-compose-plugin",
  "docker-compose", "docker-buildx-plugin", "containerd", "containerd.io",
  "podman", "buildah", "skopeo", "runc",
  "kubectl", "kubeadm", "kubelet", "helm", "k3s", "minikube", "kind",

  // ── Security / firewall / VPN ──
  "fail2ban", "ufw", "firewalld",
  "openvpn", "wireguard", "wireguard-tools", "strongswan",
  "certbot", "python3-certbot-nginx", "python3-certbot-apache",
  "knockd", "denyhosts",
  "rkhunter", "chkrootkit", "lynis", "aide",

  // ── Monitoring / metrics ──
  "prometheus", "prometheus-node-exporter", "node-exporter",
  "grafana", "alertmanager", "blackbox-exporter",
  "netdata", "collectd", "nagios", "zabbix-agent", "zabbix-server",
  "datadog-agent", "newrelic-infra", "filebeat", "metricbeat",

  // ── Mail ──
  "postfix", "exim4", "sendmail", "dovecot-core", "dovecot-imapd", "dovecot-pop3d",
  "spamassassin", "amavisd-new", "opendkim", "opendmarc",
  "mailutils", "msmtp", "ssmtp",

  // ── FTP / SFTP ──
  "vsftpd", "proftpd-basic", "proftpd-core", "pure-ftpd", "lftp",

  // ── DNS / network services ──
  "bind9", "dnsmasq", "unbound",
  "isc-dhcp-server", "openvswitch-switch",

  // ── Backup ──
  "rsync", "rclone", "restic", "borgbackup", "duplicity", "rdiff-backup",
  "borgmatic", "kopia",

  // ── Build tools ──
  "build-essential", "make", "cmake", "ninja-build", "autoconf", "automake",
  "libtool", "pkg-config", "gcc", "g++", "clang",

  // ── VCS ──
  "git", "git-lfs", "git-flow", "subversion", "mercurial",

  // ── Editors / shells / multiplexers ──
  "vim", "vim-gtk3", "neovim", "emacs", "emacs-nox", "nano", "micro",
  "zsh", "fish", "tmux", "screen", "byobu",

  // ── CLI productivity ──
  "jq", "yq", "ripgrep", "fd-find", "bat", "exa", "eza", "zoxide", "tldr",
  "fzf", "ncdu", "tree", "htop", "btop", "iotop", "atop",
  "tmate", "asciinema",
  "gh", "glab",
  "ranger", "mc", "nnn",

  // ── Networking utilities ──
  "nmap", "tcpdump", "tshark", "mtr", "iperf3", "iperf",
  "iftop", "nethogs", "vnstat", "bmon",
  "socat", "netcat-openbsd", "ngrep",
  "openssh-server", "mosh", "sshpass",

  // ── Compression / archives ──
  "p7zip", "p7zip-full", "p7zip-rar", "rar", "unrar", "zip",
  "lz4", "zstd",

  // ── Misc useful ──
  "supervisor", "systemd-resolved", "chrony", "ntp", "ntpdate",
  "anacron", "incron",
  "stress", "stress-ng", "fio",
  "iptables-persistent", "nftables",
  "pwgen", "uuid-runtime", "openssl",
  "graphviz", "imagemagick", "ffmpeg",
  "pandoc", "texlive-base",

  // ── Self-hosted apps ──
  "nextcloud", "owncloud", "gitea", "gitlab-runner",
  "mosquitto", "mosquitto-clients",
  "samba", "nfs-kernel-server", "cifs-utils",
  "jellyfin", "plex-media-server", "syncthing",
  "portainer-ce", "cockpit",
  "vault", "consul", "nomad",
  "terraform", "ansible", "puppet", "chef-workstation",
  "jenkins", "sonarqube",

  // ── Hardware / storage ──
  "nvidia-driver-535", "nvidia-driver-545", "nvidia-cuda-toolkit",
  "smartmontools", "hdparm", "ssm",
  "lvm2", "btrfs-progs", "zfsutils-linux", "xfsprogs",

  // ── Common tools that appear in playbooks ──
  "swap-utils", "tzdata"
]);

/** Prefix patterns — match if package name starts with any of these */
export const KNOWN_USER_PREFIXES = [
  "nginx-",            // nginx-extras, nginx-full, etc.
  "apache2-",
  "mysql-",
  "mariadb-",
  "postgresql-",       // postgresql-15, postgresql-client-15
  "mongodb-",
  "redis-",
  "elasticsearch-",
  "kafka-",
  "rabbitmq-",
  "openjdk-",
  "default-jdk-",
  "default-jre-",
  "dotnet-",
  "ruby-",             // ruby-dev, ruby-bundler
  "golang-1.",         // golang-1.20, 1.21, 1.22 explicit versions
  "php-",              // php-cli, php-fpm-*, php-mysql, etc.
  "php8.",             // php8.0, php8.1, php8.2, ...
  "php7.",
  "docker-",
  "containerd-",
  "kubernetes-",
  "helm-",
  "ansible-",
  "puppet-",
  "chef-",
  "salt-",
  "terraform-",
  "vault-",
  "grafana-",
  "prometheus-",
  "telegraf-",
  "filebeat-",
  "metricbeat-",
  "auditbeat-",
  "logstash-",
  "elastic-",
  "icinga2-",
  "zabbix-",
  "wireguard-",
  "openvpn-",
  "strongswan-",
  "certbot-",
  "fail2ban-",
];

export function isKnownUserPackage(name: string): boolean {
  if (KNOWN_USER_PACKAGES.has(name)) return true;
  for (const prefix of KNOWN_USER_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}
