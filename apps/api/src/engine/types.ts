/**
 * Mini-Ansible Engine — 类型定义
 *
 * 设计目标：与 Ansible Playbook YAML 数据格式兼容，但用 TypeScript 原生执行。
 * 用户编辑的 Playbook 可以被本引擎执行，也可以离开 EnvForge 用 ansible-playbook 跑。
 */

/** 一个 Playbook 包含若干 Play */
export interface Playbook {
  name: string;
  hosts?: "all" | string;
  vars?: Record<string, unknown>;
  tasks: Task[];
}

/** 单个任务调用一个模块 */
export interface Task {
  name: string;
  module: string;
  args: Record<string, unknown>;
  /** 条件表达式，简单字符串求值（仅支持 var.changed 等基本形态） */
  when?: string;
  tags?: string[];
  /** 注册输出到变量名 */
  register?: string;
  /** 循环：迭代列表，每次替换 args 中 {{ item }} */
  loop?: unknown[];
  /** ignore_errors：失败不中断 */
  ignore_errors?: boolean;
}

/** 模块执行结果 */
export interface ModuleResult {
  /** 是否真的发生了变更（false = 已经是目标状态） */
  changed: boolean;
  /** 状态描述 */
  msg: string;
  /** 命令 stdout */
  stdout?: string;
  /** 命令 stderr */
  stderr?: string;
  /** 失败标记 */
  failed?: boolean;
  /** 模块自定义的额外数据 */
  data?: Record<string, unknown>;
}

/** SSH 执行接口（由引擎注入到模块） */
export interface SshExecutor {
  /** 执行命令，返回 stdout/stderr/exitCode */
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** 通过 SFTP 上传文件内容 */
  putFile(remotePath: string, content: string | Buffer, mode?: string): Promise<void>;
  /** 通过 SFTP 读取远程文件 */
  getFile(remotePath: string): Promise<string>;
  /** 检查远程路径是否存在 */
  pathExists(remotePath: string): Promise<boolean>;
}

/** 模块定义 */
export interface AnsibleModule<Args = Record<string, unknown>> {
  name: string;
  /** 验证参数并执行（dry-run 由引擎控制是否真正调用） */
  run(executor: SshExecutor, args: Args, dryRun: boolean): Promise<ModuleResult>;
}

/** 任务执行的完整记录（用于 Terminal Panel 展示） */
export interface TaskExecutionLog {
  taskName: string;
  moduleName: string;
  command?: string;
  status: "pending" | "running" | "ok" | "changed" | "failed" | "skipped";
  result?: ModuleResult;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}
