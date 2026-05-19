# 隐私与还原策略调研结论

更新时间：2026-05-19

## 调研参考

- chezmoi 支持用 age、git-crypt、gpg、transcrypt 等方式加密文件，而不是把 secret 明文放入配置资料：https://chezmoi.io/user-guide/encryption/
- Ansible Vault 的定位是加密密码、token 等敏感变量和文件；执行时需要提供密码解密：https://docs.ansible.com/projects/ansible/latest/vault_guide/vault_using_encrypted_content.html
- Ansible 社区实践还强调敏感输出不能进入日志，例如用 `no_log` 避免密码、API key、token、证书出现在输出中：https://www.ansiblebyexample.com/articles/protecting-sensitive-information-with-the-nolog-statement-in-ansible
- Nix Home Manager 更偏声明式管理用户环境、用户级包和 dotfiles，适合表达“安装哪些软件、写入哪些偏好设置”：https://github.com/nix-community/home-manager

## 对本项目的产品规则

本项目应把“可还原内容”分为四层：

1. 软件安装层
   - 软件名、版本、安装命令、包管理器来源、依赖关系。
   - 未登录、未解锁时也可以展示。
   - 可以直接加入当前虚拟机的安装计划。

2. 用户偏好配置层
   - alias、shell profile、编辑器设置、包管理器 registry、服务启动偏好。
   - 默认可上传，但需要用户逐项选择。
   - 上传前做敏感字段扫描。

3. 应用数据层
   - 数据库数据、应用工作目录、用户文件、缓存、浏览器数据等。
   - 默认不上传、不共享。
   - 只有用户登录并输入资料密码/解锁密钥后才能查看和导出。
   - 应优先用应用自身的备份/导出机制，而不是盲目复制目录。

4. 密钥与凭据层
   - SSH 私钥、API token、密码、Cookie、云厂商凭证。
   - 默认禁止明文上传。
   - 如确需保存，只允许加密保存。
   - 未输入密码或未解锁时，只能显示“存在 secret”，不能显示 secret 值。

## 推荐交互规则

- 未连接虚拟机时：所有系统信息区域模糊，只显示连接面板。
- 未登录时：可以浏览软件和配置模板，可以安装公开软件，但不能查看或应用私有配置。
- 已登录但未输入资料密码时：可以看自己的资料列表，但敏感配置和应用数据仍保持锁定。
- 已登录且已解锁时：可以查看和应用自己的私有配置。
- 引入他人上传的配置时：默认只允许软件安装层和用户明确公开的偏好配置层。
- 应用任何配置前：必须展示影响范围，包括安装命令、写入路径、服务变更、是否需要管理员权限。

## 当前 UI 决策

- 当前阶段“系统配置清单”先只包含包管理器清单、alias、Shell profile、registry/proxy、服务启动偏好。
- 软件信息必须展示安装命令。
- 应用数据和 secret 暂不进入普通配置市场。
- 未来如果支持应用数据，应设计为单独的加密数据包，并要求登录、资料密码和二次确认。

## 系统配置清单建议

当前阶段“系统配置清单”应以包和个人偏好为主，不做深层应用数据还原：

- 包管理器清单：npm、pip、apt、dnf、brew、winget、scoop、choco。
- Shell 偏好：alias、PATH 片段、profile 中的函数。
- 开发工具偏好：Git config、编辑器 settings、插件列表。
- 服务偏好：服务名、启动方式、端口、环境变量名。
- 网络偏好：hosts 片段、代理设置、registry/mirror 设置。

后续再把应用数据作为单独的“加密数据包”能力设计，而不是混在系统配置清单中。
