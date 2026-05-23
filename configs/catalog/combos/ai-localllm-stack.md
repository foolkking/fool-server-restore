# 本地 AI 推理栈（Ollama + Open WebUI + SearXNG）

**完全本地的 ChatGPT 替代**——无 API 费用、数据不出本机。三个组件协同：

- 📦 **Ollama** — 本地 LLM 推理引擎（Llama / Qwen / Mistral / DeepSeek 等 100+ 模型）
- 📦 **Open WebUI** — ChatGPT 风格 Web 界面（聊天 / 文档 RAG / 多模型切换）
- 📦 **SearXNG** — 元搜索引擎（给 AI 补充 web 检索能力）

**适合**：隐私敏感场景 / 试 LLM 能力 / 替代付费 ChatGPT / 离线工作 / 处理内部数据。

## 你将得到什么

- 📦 **3 个 Docker 容器**编排
- ✅ Ollama 监听 `127.0.0.1:11434`（OpenAI 兼容 API）
- ✅ Open WebUI 监听 `127.0.0.1:3030`
- ✅ SearXNG 监听 `127.0.0.1:8888`
- ✅ 默认模型**首次自动 pull**（按表单选择，2-10 GB）
- ✅ Telemetry 已禁用
- ✅ 数据持久化 `/opt/ai-stack/`
- ⚠️ 内存敏感——LLM 是大头

## 表单字段说明

### `ai_default_model`

首次启动自动下载的模型：

| 模型 | 大小 | RAM 需求 | 中文 | 用途 |
|---|---|---|---|---|
| `llama3.2:3b` | 2 GB | 4 GB | 一般 | 小机器跑得动，速度快 |
| `llama3.1:8b` | 4.7 GB | 8 GB | 一般 | 通用对话 |
| `qwen2.5:7b` | 4.4 GB | 8 GB | **优秀** | 中文场景首选 |
| `qwen2.5:14b` | 9 GB | 16 GB | **优秀** | 中文复杂任务 |
| `phi3:mini` | 2.3 GB | 4 GB | 一般 | 微软小模型，CPU 友好 |
| `deepseek-coder-v2:16b` | 9 GB | 16 GB | – | 代码生成 |

### `ai_webui_port` / `ai_ollama_port` / `ai_searxng_port`

各服务端口。

### `ai_data_dir`

数据 + 模型存储。**模型很大**（每个 2-10 GB），磁盘空间要够。

## 配置文件 / 目录速查

```
/opt/ai-stack/
├── docker-compose.yml                       # ← EnvForge 写入
├── ollama/                                    # ← 模型存储（**最大**）
│   ├── models/
│   └── ...
├── open-webui/                                 # WebUI 数据（用户 / 对话历史）
└── searxng/
    └── settings.yml                            # SearXNG 配置
```

| 项 | 跨发行版 |
|---|---|
| 安装方式 | Docker compose |
| 镜像 | `ollama/ollama` + `ghcr.io/open-webui/open-webui` + `searxng/searxng` |
| 内存 | 模型大小 + 1 GB（如 7B 模型 = 8 GB RAM） |
| 磁盘 | 模型 × 2-10 GB + WebUI 数据 |
| GPU | NVIDIA 自动检测（需 nvidia-container-toolkit） |

## 常见配置模板

### 模板 A — 首次访问

```
http://server-ip:3030
```

走引导：

1. **注册第一个账号**（自动成为 admin）
2. 选模型 → 开始聊天

### 模板 B — 装更多模型

```bash
# 在主机上
docker exec ollama ollama pull llama3.1:8b
docker exec ollama ollama pull qwen2.5:14b
docker exec ollama ollama pull deepseek-coder-v2:16b

# 看已装
docker exec ollama ollama list

# 删
docker exec ollama ollama rm old-model:tag
```

更多模型：[ollama.com/library](https://ollama.com/library)。

### 模板 C — 启用 NVIDIA GPU 加速

#### 1. 装 nvidia-container-toolkit

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# RHEL/Anolis
curl -s -L https://nvidia.github.io/libnvidia-container/rhel9.0/libnvidia-container.repo | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
sudo dnf install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

#### 2. 改 docker-compose.yml

取消 ollama 服务下的 GPU 注释：

```yaml
services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

```bash
docker compose up -d --force-recreate ollama
```

#### 3. 验证 GPU 工作

```bash
docker exec ollama nvidia-smi
docker exec ollama ollama run llama3.1:8b "Hi"      # 看 GPU 使用率
```

### 模板 D — Ollama API（OpenAI 兼容）

Ollama 暴露 OpenAI 兼容 API——任何用 OpenAI SDK 的代码改 base URL 即可：

```python
from openai import OpenAI

client = OpenAI(
    base_url='http://127.0.0.1:11434/v1',
    api_key='ollama'                              # 任意值
)

response = client.chat.completions.create(
    model='llama3.2',
    messages=[{"role": "user", "content": "Hi"}]
)
print(response.choices[0].message.content)
```

或原生 Ollama API：

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

### 模板 E — Open WebUI 高级用法

UI 主要功能：

| Tab | 用途 |
|---|---|
| Chat | 对话（多模型切换 / RAG / Web search） |
| Documents | 上传 PDF / docx / txt 做 RAG（基于上下文回答） |
| Workspaces | 团队共享对话 / 模型 / 工具 |
| Admin | 用户管理 / 模型管理 / API key |

启用 RAG 文档：Settings → Documents → 配 chunk size + embedding model。

### 模板 F — SearXNG 配置（增强）

SearXNG 默认配置基本够用。要加更多搜索引擎：

```yaml
# /opt/ai-stack/searxng/settings.yml
engines:
  - name: brave
    engine: brave
    shortcut: br
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg

search:
  default_lang: zh                                  # 中文优先
```

```bash
docker compose restart searxng
```

### 模板 G — 反代 + HTTPS（远程访问）

```nginx
server {
    listen 443 ssl http2;
    server_name ai.example.com;
    ssl_certificate /etc/letsencrypt/live/ai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.example.com/privkey.pem;

    client_max_body_size 100M;                       # 上传文档 RAG

    # WebSocket（流式输出必须）
    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;                       # LLM 长响应
        proxy_buffering off;                            # 流式
    }
}
```

### 模板 H — 备份

```bash
# 模型自己重新 pull 即可（不必备份）
# 关键备份：用户数据 + 对话历史
docker stop open-webui
sudo tar czf /backup/ai-webui-$(date +%F).tar.gz -C /opt/ai-stack/open-webui .
docker start open-webui
```

## 关键参数调优速查

### 资源占用

| 模型 | RAM（CPU 推理） | RAM（GPU） | VRAM | 吞吐 |
|---|---|---|---|---|
| llama3.2:3b | 4 GB | – | 2 GB | CPU 慢 / GPU 快 |
| llama3.1:8b | 8 GB | – | 5 GB | CPU 极慢 / GPU 中 |
| qwen2.5:14b | 16 GB | – | 9 GB | 仅 GPU 实用 |
| llama3.1:70b | 64 GB+ | 80 GB+ | 40 GB+ | 仅 GPU |

CPU 推理很慢（每 token 0.5-2s），仅适合**实验**或**小模型 < 7B**。

### Context window（上下文长度）

```bash
# Modelfile 自定义
docker exec -it ollama bash
echo 'FROM llama3.1
PARAMETER num_ctx 8192' > /tmp/Modelfile
ollama create my-model -f /tmp/Modelfile
```

### 量化（节省 RAM）

模型 tag 后缀控制量化：

```bash
ollama pull llama3.1:8b           # 默认 Q4_K_M（4-bit，平衡）
ollama pull llama3.1:8b-q3_K_S    # 3-bit（更小，质量略差）
ollama pull llama3.1:8b-fp16       # 16-bit 全精度（质量最佳，2× 内存）
```

## 跨发行版兼容

容器化跨发行版一致。GPU 加速：

| 平台 | NVIDIA GPU | AMD GPU | Intel GPU |
|---|---|---|---|
| Ubuntu / Debian | ✅（nvidia-container-toolkit） | ✅（ROCm） | ❌ |
| RHEL / Anolis 9 | ✅ | ⚠️ | ❌ |

CPU 模式所有发行版都能跑。

## 与其它 catalog 项的配合

- **`docker-host-profile`** — 必装前提
- **`nginx-web-service`** + **`certbot-ssl`** — 反代（远程访问）
- **`postgres-profile`** — Open WebUI 可改用 PG backend（默认 SQLite）
- **`vault-secrets`** — 存 API key 等机密

## 排错

### 模型 pull 失败

```bash
# 网络问题
docker exec ollama ollama pull llama3.2:3b

# 国内 ollama.com 偶尔慢——重试或手动下载 GGUF 后导入
# https://huggingface.co/QuantFactory/Llama-3.2-3B-Instruct-GGUF
```

### 推理极慢

```bash
# CPU 模式 7B+ 模型本来就慢（每 token 1-2s）
# 解决：
# 1. 用更小模型（3b / phi3:mini）
# 2. 启用 GPU（模板 C）
# 3. 用云 API（OpenRouter / Together）
```

### Open WebUI 连不上 Ollama

```bash
# 容器互相通
docker exec open-webui curl -s http://ollama:11434/api/version

# 如不通，检查 docker-compose.yml networks 配置（同一 default network 应该自动可达）
docker network inspect ai-stack_default
```

### Out of memory

```bash
free -h

# 模型超内存——换小模型或加 swap（catalog swap-config）
docker exec ollama ollama list           # 看哪些已装
docker exec ollama ollama rm <large-model>
```

### GPU 未识别

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
# 失败 = nvidia-container-toolkit 没装好

# 看 ollama 是否用 GPU
docker exec ollama ollama run llama3.1:8b "test"
# 同时另一终端
nvidia-smi          # 看 ollama 进程是否在 GPU 上
```

### SearXNG search 失败

```bash
docker logs searxng
# 偶发：rate limit / 上游搜索引擎 block
# 等待 + 加更多 engine（模板 F）
```

## 验证

```bash
docker ps | grep -E '(ollama|open-webui|searxng)'

# Ollama API
curl http://127.0.0.1:11434/api/version

# 看已装模型
docker exec ollama ollama list

# Open WebUI
curl -I http://127.0.0.1:3030/

# SearXNG
curl 'http://127.0.0.1:8888/search?q=test&format=json' | jq
```

## 多次运行

`installMode: skip-existing`。compose 重写。**模型保留**（在 ollama volume 里）。

## ⚠️ 敏感性

**review** —

强制：

1. 公网必须 HTTPS + auth
2. Ollama API（11434）默认仅 127.0.0.1，不暴露
3. WebUI 注册控制——首个用户成 admin，关闭 signup
4. 上传文档做 RAG = **业务数据进容器**，按合规

## 隐私说明

- **完全本地推理**——对话内容 / 文档 RAG 不出本机
- Telemetry 已全禁
- Ollama 模型从 ollama.com 拉（首次下载暴露你的 IP，之后离线运行）
- Open WebUI 不发遥测（已设 `ANONYMIZED_TELEMETRY=false`）
- SearXNG 是元搜索——查询发给上游引擎（Brave / DuckDuckGo），但 SearXNG 本身不记录用户搜索历史
- 加密通信：Ollama 内部 HTTP（容器间），公网走反代 HTTPS
