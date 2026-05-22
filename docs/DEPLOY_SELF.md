# 用 EnvForge 部署 EnvForge（Self-Hosted）

> 本文回答一个有趣的问题：**EnvForge 既然是配置 Linux 主机的工具，能不能用来配置它自己跑的那台主机？**
> 答案是 **能，且能省一半以上的工作**。

适合：
- 已经粗略读过 [DEPLOY.md](./DEPLOY.md)，对完整流程心里有数
- 想把"一次性的、容易写错的"加固步骤交给 catalog Playbook
- 准备**一个 EnvForge 实例长期管多台机器**，且其中一台就是 EnvForge 自己的宿主

不适合：
- 第一次接触本项目——先按 [DEPLOY.md](./DEPLOY.md) 走通"纯手动"，再回来用本文优化
- 一次性试用——值不值得为了省 5 分钟手工活折腾这个流程？看你

---

## 工作量对比

| 阶段 | 纯手动（DEPLOY.md） | 本文（自管） | 差额 |
|---|---|---|---|
| Phase 1：把 EnvForge 跑起来 | 10-15 分钟 + 大约 30 行命令 | 同样 10-15 分钟 | **0**（鸡生蛋，没法省） |
| Phase 2：HTTPS / 反代 / 防火墙 / SSH 加固 / swap / 自动更新 / fail2ban | 60-90 分钟 + 大约 80 行配置 + 容易写错 | 5-10 分钟 + 点几下 UI | **省 80%** |
| 后续 N 台机器 | 每台都重复 Phase 2 | 每台 1-2 分钟（同一 EnvForge 跑 Playbook） | **省 95%** |

直白结论：**头 10 分钟逃不掉**（必须有个跑着的 EnvForge 才能让它"自管"）；**之后所有事都能在 UI 里点完**。

---

## 一、Phase 1：先把 EnvForge 最小化跑起来

跟 [DEPLOY.md](./DEPLOY.md) 第一到第五节一样，但**只到能登录的程度就行**——不做反代、不做 HTTPS、不改防火墙、不调系统参数。这些都留给 Phase 2。

精简版命令清单：

```bash
# 1. 装 Docker（如果还没装。Ubuntu/Debian 例）
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker

# 2. 拉代码
sudo mkdir -p /opt/envforge && sudo chown $USER /opt/envforge && cd /opt/envforge
git clone https://github.com/your-org/EnvForge.git .

# 3. 配置 master key + admin 邮箱
cp .env.example .env
KEY=$(openssl rand -base64 32)
echo "ENVFORGE_MASTER_KEY=$KEY" >> .env
echo "ENVFORGE_ADMIN_EMAILS=your-email@example.com" >> .env
echo "🔑 Master key (please save offline): $KEY"

# 4. 启动
docker compose up -d

# 5. 检查
curl http://localhost:5173/api/health    # 应返回 {"status":"ok",...}
```

打开浏览器 → `http://server-ip:5173/` → 注册（用 step 3 里 `ENVFORGE_ADMIN_EMAILS` 填的邮箱，自动有 admin 角色）→ 登录。

> ⚠️ 此时你还**没有 HTTPS、防火墙没规则、SSH 没加固、可能没 swap**——下面 Phase 2 用 EnvForge 自己来做这些事。
>
> 在公网 IP 上裸跑这 10 分钟有点风险（HTTP 明文、Docker 5173 暴露）。能限制只有你的 IP 访问最好（云防火墙安全组），等 Phase 2 跑完再放开。

---

## 二、Phase 2：让 EnvForge 配置自己的宿主机

### 2.1 添加宿主机为受管目标（5 步）

EnvForge 容器内通过 SSH 连**它的宿主机**——把宿主当成一台普通的"远程 VM"。

#### 在宿主机上准备 SSH

```bash
# 1. 确认 sshd 在跑
sudo systemctl status ssh        # Ubuntu/Debian
sudo systemctl status sshd       # RHEL/Anolis
# 没起来：sudo systemctl enable --now ssh

# 2. 创建一个有 sudo 权限的账号（如果你还没有，或者想专门给 EnvForge 用）
sudo useradd -m -s /bin/bash envforge-mgr
sudo passwd envforge-mgr                                       # 设个强密码
sudo usermod -aG sudo envforge-mgr                             # Ubuntu/Debian
# RHEL/Anolis: sudo usermod -aG wheel envforge-mgr

# 3. 让此账号 NOPASSWD sudo（catalog Playbook 都需要 sudo，否则中途会卡输入密码）
echo "envforge-mgr ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/envforge-mgr
sudo chmod 0440 /etc/sudoers.d/envforge-mgr

# 4. 测试本机能 ssh 上本机（鸡生蛋之前先验证 sshd 工作正常）
ssh envforge-mgr@127.0.0.1 -o StrictHostKeyChecking=no echo OK
```

> 如果你不想为 EnvForge 单建账号，复用你现有的 sudo 账号也行。但**建议单建**：日后想撤销 EnvForge 对宿主机的访问，只要 `userdel envforge-mgr` 一行命令就够了。

#### 在 EnvForge UI 里加这台连接

浏览器登录 → 顶栏 "VM Manager" → "Add connection"：

| 字段 | 填什么 | 备注 |
|---|---|---|
| Name | `Self host` | 任取 |
| Host | `172.17.0.1` | Linux 上 Docker 默认网桥的网关 = 宿主机内网地址。验证：`docker network inspect bridge \| grep Gateway` |
| Port | `22` | 宿主机 sshd 端口；如果你改过，填实际端口 |
| User | `envforge-mgr` | 上面建的账号 |
| Auth | Password | 填刚才设的密码 |
| Sudo password | （空） | NOPASSWD 已配，留空 |

点 "Test & Save"。约 3-5 秒后状态变 ✅（绿色，"probed"），表示 EnvForge 已经通过 SSH 跑了一次系统采集，能看到宿主机的发行版 / 内核 / 已装包了。

> 🔧 如果 `172.17.0.1` 连不上：
> - 防火墙挡了 sshd？`sudo ss -tlnp | grep :22` 确认监听，宿主机 ufw/firewalld 放行 22
> - 不是 Linux 桥接？查实际网关：在容器内 `docker compose exec envforge sh -c 'ip route | grep default'`
> - 用宿主机的内网 IP（`hostname -I` 看）也行，只要容器能路由到

### 2.2 用配置市场跑加固 Playbook（按顺序）

回到主页 → "Market" → 选 "Self host" 作为目标 VM → 依次跑下面 5 个 Playbook。

每个都是 catalog 里现成的（id 列在表头），**不需要自己写 yaml**。安装时按表单填表 → 预览 → 确认 → 看实时日志即可。

| 顺序 | Catalog 项 (id) | 替代 DEPLOY.md 里哪段 | 表单怎么填 | 预计时间 |
|---|---|---|---|---|
| 1 | **Swap 交换空间** (`swap-config`) | DEPLOY.md 七.1（手动 fallocate） | size: 2G, swappiness: 10 | 30 秒 |
| 2 | **SSH 安全加固** (`ssh-hardening`) | DEPLOY.md 六（散落各处的 SSH 建议） | 端口可改成非标如 22222；保持 PermitRootLogin no | 20 秒 |
| 3 | **防火墙基线** (`firewall-baseline`) | DEPLOY.md 六.1（关 5173 + 开 80/443） | 放行 SSH 新端口 + 80 + 443，**入站默认 deny** | 30 秒 |
| 4 | **Nginx Web 服务** (`nginx-web-service`) | DEPLOY.md 六.1（手写 nginx 配置） | domain: 你的域名；listen_port: 443；反向代理: ✅；upstream: `http://127.0.0.1:5173` | 1 分钟 |
| 5 | **Certbot SSL** (`certbot-ssl`) | DEPLOY.md 六.1（手跑 certbot） | domain: 同上；email: 你的邮箱；challenge: nginx | 1-2 分钟（含 Let's Encrypt API 往返） |
| 6（可选） | **Fail2Ban 入侵防护** (`fail2ban-protection`) | DEPLOY.md 六（没专门讲，但生产必装） | bantime: 1h；maxretry: 5；ssh_port: 同上面新端口；ignoreip: **务必加你自己 IP**！ | 30 秒 |
| 7（可选） | **Netdata 实时监控** (`netdata-monitoring`) | DEPLOY.md 没讲；监控自己 | bind: 127.0.0.1；history: 1h | 1 分钟 |

完成后访问 `https://envforge.example.com/`（你的域名）验证——绿色锁、自动 HTTPS 跳转、5173 端口外部不可达。

### 2.3 关掉 5173 直接暴露（最后一步收尾）

跑完上面 5 个之后，5173 端口已经在 firewalld/ufw 默认 deny 名单里（防火墙基线没主动放行）。但 docker-compose.yml 仍然把 5173 绑到 0.0.0.0——挺多公有云的安全组在 docker 之上还是能直接打到。

修一下：

```bash
cd /opt/envforge
nano docker-compose.yml
# 找到 ports 段，改成：
#   ports:
#     - "127.0.0.1:5173:5173"
docker compose up -d           # 重建 envforge 容器，应用新端口绑定
```

现在 EnvForge 只有通过你刚才装好的 nginx 反代才能访问。

> 上面这步**不能**让 EnvForge 自己做——它没法在自己跑着的时候改自己的 docker-compose 然后重启自己。这个属于 Phase 1 的"鸡生蛋"残留。

---

## 三、对照清单：哪些工作 EnvForge 替你做了

✅ **EnvForge 自己完成的（占总工作量约 70%）：**

- [x] 装 nginx + 自动检测发行版（Ubuntu 装 `nginx`，RHEL 装 `nginx`，包名差异内部翻译）
- [x] 写反向代理 server 块、自动检测端口冲突、自动禁用发行版自带 default vhost
- [x] 在 RHEL 上设 SELinux `httpd_can_network_connect`（Ubuntu 不需要）
- [x] 装 certbot + 自动签发 LE 证书 + 改写 nginx 配置开 HTTPS + 配置定时续签
- [x] 装 ufw / firewalld（自动按发行版选）+ 默认 deny incoming + 放行 SSH/HTTP/HTTPS + log denied
- [x] 加 swap 文件 + 持久化到 /etc/fstab + 设 vm.swappiness
- [x] 改 sshd_config（禁 root 登录、改端口、限失败次数、闲置超时、AllowUsers 白名单）+ reload sshd 时不切断现有连接
- [x] 装 fail2ban + 写 jail.local + 配 SSH jail（自动监控你刚改的非标端口）+ 加你 IP 到白名单
- [x] 装 netdata + 关 telemetry + 限制只本机访问

❌ **必须你自己做的（Phase 1 那 10 分钟，无法省）：**

- [ ] 买 / 拿到一台空 Linux 服务器
- [ ] 买域名 + 配 DNS A 记录指向服务器
- [ ] 装 Docker（鸡生蛋——EnvForge 还没跑起来）
- [ ] 生成并保管 master key
- [ ] git clone + 配 .env
- [ ] 第一次 `docker compose up -d`
- [ ] 注册第一个 admin 账号
- [ ] 改 ports 段把 5173 收回 127.0.0.1（自管完成后的收尾）

---

## 四、之后的好处

一旦 Phase 2 跑完，你就有了**一个"管理多台机器"的中央控制台**——它本身也是被管理的目标之一。从此：

- **新增受管 VM**：UI 添加连接 → 同样跑那 5 个加固 Playbook → 1-2 分钟
- **统一升级**：所有受管 VM 在 Market 选 "swap-config / fail2ban / nginx ..."  时表单填同样的值，跑 N 次
- **审计**：哪台机器跑过什么 Playbook、什么时候跑、谁跑的，全在任务历史里
- **漂移检测**：受管 VM 配置被人手动改了？设个基线 + 定时 diff，发现差异自动 webhook
- **集中备份**：用 catalog 的 `rsync-tools` + cron 模块写定时备份任务，把 `envforge_data` volume 备到对象存储

也就是说：**Phase 2 不仅省了"这一次"的功夫，还把"以后所有同类活"都拉平了**。

---

## 五、升级时的特殊处理

升级 EnvForge 自己（git pull + rebuild）有个尴尬点：升级期间它自己**不在线**，所以无法用自己跑"升级我自己"的 Playbook。建议流程：

```bash
# 1. 在 UI 里给所有受管 VM 加上 "停止接受新任务" 标记（如果你有这功能）或通知管理员暂时不要跑任务

# 2. 备份
cd /opt/envforge
docker run --rm -v envforge_data:/d:ro -v $(pwd)/backups:/b alpine \
  tar czf /b/pre-upgrade-$(date +%F-%H%M).tar.gz -C /d .

# 3. 升级
git fetch origin && git checkout v0.2.0
docker compose build && docker compose up -d

# 4. 验证
curl https://envforge.example.com/api/health     # 走 nginx 反代过去，验证整条路径还好
docker compose logs -f envforge | head -50

# 5. 升级失败回滚
git checkout v0.1.0 && docker compose build && docker compose up -d
docker run --rm -v envforge_data:/d -v $(pwd)/backups:/b:ro alpine \
  sh -c 'rm -rf /d/* && tar xzf /b/pre-upgrade-*.tar.gz -C /d'
```

整个升级过程**不影响**外面 nginx + 防火墙 + fail2ban——它们由宿主机的 systemd 管理，跟容器解耦。这也是 Phase 2 用 EnvForge 配置完成的另一个好处：**控制台和被管对象的故障域分离**。

---

## 六、对比 [DEPLOY.md](./DEPLOY.md) 你能省哪几节

| DEPLOY.md 章节 | 本文是否替代 |
|---|---|
| 一、系统要求 | 不替代（前置条件） |
| 二、安装前置依赖（Docker） | 不替代（鸡生蛋） |
| 三、生成 Master Key | 不替代（人需要保管） |
| 四、拉代码 + .env | 不替代（鸡生蛋） |
| 五、启动 | 不替代（鸡生蛋） |
| **六、生产环境加固** | ✅ **完全替代**——本文 2.2 |
| 七、备份恢复 | 部分替代——可以用 catalog 的 `rsync-tools` + cron 模块写定时备份 |
| 八、升级 | 不完全替代（升级期间自己不能在线，需要走容器外流程） |
| 九、卸载 | 不替代（自己不能拆自己） |
| 十、排错 | 不替代（参考性内容） |

也就是 **DEPLOY.md 第六节那一大段最容易写错的 nginx + certbot + ufw 手工活，本文用 5 次 UI 点击完成**。

---

## 七、参考链接

- [DEPLOY.md](./DEPLOY.md) — 纯手动从零部署完整流程
- [README.md](../README.md) — 项目总览
- [docs/PRODUCT.md](./PRODUCT.md) — 产品定位 / 角色 / 隐私模型
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — 引擎和模块设计
