# Node.js 运行时配置

## 安装内容

- Node.js LTS
- npm 全局工具：pnpm、typescript、tsx
- npm registry 基础配置

## 简单私人配置

建议用户根据自己的网络环境选择 registry。私有 token 不应写入市场配置，应该在目标虚拟机本地通过登录命令重新授权。

```bash
npm config set registry https://registry.npmmirror.com
npm install -g pnpm typescript tsx
```

## 隐私说明

不会收集 npm token、私有 registry 密码或 `.npmrc` 中的敏感值。
