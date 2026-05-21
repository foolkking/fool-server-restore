/**
 * module-docs.ts — Self-describing engine module catalog for the UI
 *
 * Each entry has:
 *   - name, summary
 *   - args schema (name, type, required, default, description)
 *   - example YAML snippet
 */

export interface ArgSpec {
  name: string;
  type: "string" | "boolean" | "number" | "string[]" | "object";
  required: boolean;
  default?: string;
  description?: string;
  example?: string;
}

export interface ModuleDoc {
  name: string;
  summary: string;
  category: "package" | "service" | "file" | "user" | "network" | "system" | "shell" | "tls";
  args: ArgSpec[];
  example: string;
  notes?: string;
}

export const MODULE_DOCS: ModuleDoc[] = [
  {
    name: "package",
    category: "package",
    summary: "Install or remove apt/yum/dnf packages (idempotent).",
    args: [
      { name: "name", type: "string", required: true, description: "Package name or list of names." },
      { name: "state", type: "string", required: false, default: "present", description: "present | absent" }
    ],
    example: `- name: Install nginx
  module: package
  args:
    name: nginx
    state: present`
  },
  {
    name: "service",
    category: "service",
    summary: "Manage systemd services (start, stop, enable, disable).",
    args: [
      { name: "name", type: "string", required: true, description: "Service unit name (with or without .service)." },
      { name: "state", type: "string", required: false, description: "started | stopped | restarted | reloaded" },
      { name: "enabled", type: "boolean", required: false, description: "Enable/disable on boot." }
    ],
    example: `- name: Enable and start nginx
  module: service
  args:
    name: nginx
    state: started
    enabled: true`
  },
  {
    name: "lineinfile",
    category: "file",
    summary: "Idempotently edit a single line in a config file.",
    args: [
      { name: "path", type: "string", required: true, description: "Target file path. ~ is expanded." },
      { name: "line", type: "string", required: false, description: "Target line content. Required when state=present." },
      { name: "regexp", type: "string", required: false, description: "Regex to match an existing line for replacement." },
      { name: "state", type: "string", required: false, default: "present", description: "present | absent" },
      { name: "create", type: "boolean", required: false, description: "Create the file if missing (state=present)." },
      { name: "backup", type: "boolean", required: false, default: "true", description: "Save .envforge.bak on first write." }
    ],
    example: `- name: Set max log size in journald
  module: lineinfile
  args:
    path: /etc/systemd/journald.conf
    regexp: '^#?SystemMaxUse='
    line: 'SystemMaxUse=200M'`
  },
  {
    name: "copy",
    category: "file",
    summary: "Upload file content (also handles sudo for /etc paths).",
    args: [
      { name: "content", type: "string", required: true, description: "File content (string)." },
      { name: "dest", type: "string", required: true, description: "Destination path on remote." },
      { name: "mode", type: "string", required: false, description: "Octal mode like \"0644\"." },
      { name: "backup", type: "boolean", required: false, default: "true", description: "Save .envforge.bak on first write." }
    ],
    example: `- name: Drop a small notice file
  module: copy
  args:
    content: "Managed by EnvForge\\n"
    dest: /etc/motd
    mode: "0644"`
  },
  {
    name: "template",
    category: "file",
    summary: "Render a Jinja2-lite template with vars and write to remote.",
    args: [
      { name: "src", type: "string", required: true, description: "Local template content (use {{ var }} placeholders)." },
      { name: "dest", type: "string", required: true, description: "Destination path." },
      { name: "vars", type: "object", required: false, description: "Variable map." }
    ],
    example: `- name: Render nginx vhost
  module: template
  args:
    src: |
      server {
        server_name {{ domain }};
        listen 80;
      }
    dest: /etc/nginx/sites-enabled/example
    vars:
      domain: example.com`
  },
  {
    name: "user",
    category: "user",
    summary: "Manage system users (create / delete / set shell).",
    args: [
      { name: "name", type: "string", required: true, description: "Username." },
      { name: "state", type: "string", required: false, default: "present", description: "present | absent" },
      { name: "shell", type: "string", required: false, description: "Login shell." },
      { name: "groups", type: "string[]", required: false, description: "Supplementary groups." }
    ],
    example: `- name: Create deploy user
  module: user
  args:
    name: deploy
    shell: /bin/bash
    groups: [docker, sudo]`
  },
  {
    name: "file",
    category: "file",
    summary: "Manage file/directory presence, mode, ownership.",
    args: [
      { name: "path", type: "string", required: true, description: "Path to file or directory." },
      { name: "state", type: "string", required: false, description: "directory | file | absent" },
      { name: "mode", type: "string", required: false, description: "Octal mode." },
      { name: "owner", type: "string", required: false, description: "Owner user." }
    ],
    example: `- name: Ensure log dir exists
  module: file
  args:
    path: /var/log/myapp
    state: directory
    owner: deploy
    mode: "0755"`
  },
  {
    name: "ufw",
    category: "network",
    summary: "Manage UFW firewall rules.",
    args: [
      { name: "rule", type: "string", required: true, description: "allow | deny" },
      { name: "port", type: "number", required: true, description: "Port number." },
      { name: "proto", type: "string", required: false, default: "tcp", description: "tcp | udp" }
    ],
    example: `- name: Allow HTTPS
  module: ufw
  args:
    rule: allow
    port: 443
    proto: tcp`
  },
  {
    name: "shell",
    category: "shell",
    summary: "Run an arbitrary shell command. Provide creates/removes for idempotency.",
    args: [
      { name: "cmd", type: "string", required: true, description: "Shell command." },
      { name: "creates", type: "string", required: false, description: "Skip if this path exists." },
      { name: "removes", type: "string", required: false, description: "Skip if this path does NOT exist." }
    ],
    example: `- name: Initialize an env file once
  module: shell
  args:
    cmd: "echo INITIALIZED > /etc/myapp/.installed"
    creates: /etc/myapp/.installed`,
    notes: "Use as a last resort. Native modules are preferred because they're idempotent by design."
  },
  {
    name: "cron",
    category: "system",
    summary: "Manage user crontab entries (idempotent).",
    args: [
      { name: "name", type: "string", required: true, description: "Identifier (becomes a marker comment)." },
      { name: "minute", type: "string", required: false, default: "*", description: "Minute field." },
      { name: "hour", type: "string", required: false, default: "*", description: "Hour field." },
      { name: "day", type: "string", required: false, default: "*", description: "Day-of-month field." },
      { name: "month", type: "string", required: false, default: "*", description: "Month field." },
      { name: "weekday", type: "string", required: false, default: "*", description: "Day-of-week field." },
      { name: "job", type: "string", required: false, description: "Command to schedule (state=present)." },
      { name: "user", type: "string", required: false, description: "Run for a specific user." },
      { name: "state", type: "string", required: false, default: "present", description: "present | absent" }
    ],
    example: `- name: Backup database nightly
  module: cron
  args:
    name: nightly db backup
    hour: "3"
    minute: "30"
    job: "/usr/local/bin/backup-db.sh"`
  },
  {
    name: "systemd_unit",
    category: "service",
    summary: "Create or remove a systemd .service unit file.",
    args: [
      { name: "name", type: "string", required: true, description: "Service name (no .service)." },
      { name: "description", type: "string", required: false, description: "Unit description." },
      { name: "exec_start", type: "string", required: true, description: "ExecStart command (state=present)." },
      { name: "user", type: "string", required: false, description: "User to run as." },
      { name: "working_directory", type: "string", required: false },
      { name: "environment", type: "object", required: false, description: "Map of Environment= entries." },
      { name: "restart", type: "string", required: false, default: "on-failure", description: "always | on-failure | no" },
      { name: "wanted_by", type: "string", required: false, default: "multi-user.target" },
      { name: "state", type: "string", required: false, default: "present" },
      { name: "daemon_reload", type: "boolean", required: false, default: "true" }
    ],
    example: `- name: Install my-app service
  module: systemd_unit
  args:
    name: my-app
    description: My App
    exec_start: /usr/local/bin/my-app
    user: deploy
    working_directory: /opt/my-app
    restart: always`
  },
  {
    name: "sysctl",
    category: "system",
    summary: "Manage kernel parameters (live + persisted).",
    args: [
      { name: "name", type: "string", required: true, description: "Parameter name (e.g. net.ipv4.ip_forward)." },
      { name: "value", type: "string", required: true, description: "Value (state=present)." },
      { name: "state", type: "string", required: false, default: "present" },
      { name: "reload", type: "boolean", required: false, default: "true" }
    ],
    example: `- name: Enable IP forwarding
  module: sysctl
  args:
    name: net.ipv4.ip_forward
    value: "1"`
  },
  {
    name: "acme",
    category: "tls",
    summary: "Issue a Let's Encrypt certificate via certbot.",
    args: [
      { name: "domain", type: "string", required: true, description: "Domain or comma-separated list." },
      { name: "email", type: "string", required: true, description: "Email for ACME registration." },
      { name: "webroot", type: "string", required: false, default: "/var/www/html", description: "Webroot path (HTTP-01)." },
      { name: "plugin", type: "string", required: false, default: "webroot", description: "webroot | nginx | standalone" },
      { name: "staging", type: "boolean", required: false, description: "Use staging API." }
    ],
    example: `- name: Issue cert for example.com
  module: acme
  args:
    domain: example.com,www.example.com
    email: admin@example.com
    plugin: nginx`,
    notes: "certbot must be installed first. See the 'package' module."
  }
];
