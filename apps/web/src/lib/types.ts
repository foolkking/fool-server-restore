import type { LucideIcon } from "lucide-react";
import type { CatalogItem } from "../api";
import {
  Box,
  Cpu,
  Database,
  MonitorCog,
  PackagePlus,
  Server,
  Settings2,
  ShieldCheck,
  UserRound,
  Wifi
} from "lucide-react";

export type Locale = "zh" | "en";
export type Page = "machine" | "market" | "me" | "playbooks" | "settings";
export type ConnectionMethod = "ssh-password" | "ssh-key";

export const text = {
  zh: {
    appName: "EnvForge",
    subtitle: "虚拟机软件与配置管理",
    machine: "虚拟机管理",
    market: "配置市场",
    me: "我的空间",
    playbooks: "Playbook",
    settings: "高级设置",
    search: "搜索可加入虚拟机的软件、配置和系统策略",
    filter: "筛选",
    connectTitle: "连接到远程服务器",
    connectHint: "成功连接后展示完整系统信息；未连接时仅可选择连接方式和凭据。",
    runScan: "扫描当前虚拟机",
    upload: "上传当前虚拟机配置",
    selected: "已选择",
    software: "软件信息",
    configs: "系统配置清单",
    addToVm: "加入虚拟机",
    guest: "游客",
    login: "登录",
    register: "注册",
    logout: "登出",
    editProfile: "编辑资料",
    profile: "个人信息",
    uploads: "我上传的虚拟机配置",
    language: "中文",
    locked: "连接成功后显示",
    connection: "连接状态",
    connected: "已连接",
    disconnected: "未连接",
    connectBtn: "连接",
    privacyNote: "未登录或未解锁时，只能安装公开软件；私有配置和应用数据保持锁定。",
    installCommand: "安装命令",
    packageAlias: "包与 alias 偏好",
    agentUrl: "Agent URL（可选）",
    agentProbe: "探测真实数据",
    agentOnline: "SSH 在线",
    agentOffline: "Agent 离线",
    probing: "探测中...",
    realData: "真实数据"
  },
  en: {
    appName: "EnvForge",
    subtitle: "VM software and configuration manager",
    machine: "VM Manager",
    market: "Config Market",
    me: "My Space",
    playbooks: "Playbooks",
    settings: "Settings",
    search: "Search software, configs, and system policies",
    filter: "Filter",
    connectTitle: "Connect remote server",
    connectHint: "Full system information is visible only after a successful connection.",
    runScan: "Scan current VM",
    upload: "Upload current VM profile",
    selected: "Selected",
    software: "Software",
    configs: "System configs",
    addToVm: "Add to VM",
    guest: "Guest",
    login: "Login",
    register: "Register",
    logout: "Logout",
    editProfile: "Edit profile",
    profile: "Profile",
    uploads: "My uploaded VM profiles",
    language: "English",
    locked: "Visible after connection",
    connection: "Connection",
    connected: "Connected",
    disconnected: "Disconnected",
    connectBtn: "Connect",
    privacyNote: "Without login or unlock, only public software can be installed; private configs and app data stay locked.",
    installCommand: "Install command",
    packageAlias: "Packages and alias preferences",
    agentUrl: "Agent URL (optional)",
    agentProbe: "Probe real data",
    agentOnline: "SSH online",
    agentOffline: "Agent offline",
    probing: "Probing...",
    realData: "Live data"
  }
} as const;

export type TextDict = typeof text.zh;

export const navItems: Array<{ id: Page; icon: LucideIcon }> = [
  { id: "machine", icon: MonitorCog },
  { id: "market", icon: PackagePlus },
  { id: "playbooks", icon: Server },
  { id: "settings", icon: Settings2 },
  { id: "me", icon: UserRound }
];

export const categoryIcons: Record<CatalogItem["category"], LucideIcon> = {
  runtime: Cpu,
  developer: Settings2,
  database: Database,
  container: Box,
  security: ShieldCheck,
  network: Wifi,
  service: Server
};

export const connectionFields: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["Host", "Port", "Username", "Password"],
  "ssh-key": ["Host", "Port", "Username", "Private key path", "Passphrase"]
};

export const connectionFieldKeys: Record<ConnectionMethod, string[]> = {
  "ssh-password": ["host", "port", "username", "password"],
  "ssh-key": ["host", "port", "username", "privateKeyPath", "passphrase"]
};

export const installCommands: Record<string, string> = {
  node: "sudo apt-get install -y nodejs npm",
  docker: "sudo apt-get install -y docker.io",
  pm2: "sudo npm install -g pm2",
  nginx: "sudo apt-get install -y nginx",
  git: "sudo apt-get install -y git"
};
