# Terraform IaC

Terraform 是 HashiCorp 的 Infrastructure as Code 工具——用 HCL 声明你的云资源（AWS / GCP / Azure / 阿里云），
执行后自动创建/修改/删除以匹配声明。

## 你将得到什么

- 📦 **terraform**（来自 HashiCorp 官方仓库）

## 用法

### 验证

```bash
terraform --version
```

### 第一个项目（AWS 例）

`main.tf`：
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "web" {
  ami           = "ami-0abc123..."
  instance_type = "t3.micro"
  tags = {
    Name = "web-server"
  }
}
```

```bash
terraform init           # 下载 provider
terraform plan           # 看会发生什么
terraform apply          # 真正创建
terraform destroy        # 删除
```

### 阿里云 provider

```hcl
terraform {
  required_providers {
    alicloud = {
      source = "aliyun/alicloud"
    }
  }
}

provider "alicloud" {
  access_key = var.access_key
  secret_key = var.secret_key
  region     = "cn-hangzhou"
}

resource "alicloud_instance" "web" {
  instance_name = "web-1"
  image_id      = "centos_7_9_x64_20G_alibase_20240711.vhd"
  instance_type = "ecs.t6-c4m1.large"
  ...
}
```

### State 文件管理

`terraform.tfstate` 是 Terraform 的"事实之源"——记录当前实际有哪些资源。**绝不要弄丢**。
生产推荐用远程 state（不是本地文件）：

```hcl
terraform {
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "production/state.tfstate"
    region = "us-east-1"
    # 加 DynamoDB 锁防止两个人同时 apply
    dynamodb_table = "tf-state-lock"
  }
}
```

### 工作流

```bash
# 标准流程
terraform fmt              # 格式化代码
terraform validate         # 校验语法
terraform plan -out plan.tfplan
terraform apply plan.tfplan    # 用保存的 plan，避免 apply 时 plan 又算一次
```

### 国内镜像

Terraform provider 从 `releases.hashicorp.com` 下，国内可能慢。设镜像：
```bash
mkdir -p ~/.terraformrc.d
cat > ~/.terraformrc <<EOF
provider_installation {
  network_mirror {
    url = "https://mirrors.tencent.com/terraform/"
  }
  direct {
    exclude = ["*"]
  }
}
EOF
```

### 模块复用

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.x"

  cidr = "10.0.0.0/16"
  ...
}
```

社区模块在 https://registry.terraform.io/。

## 关键参数调优速查

### State 文件管理（**最关键**）

`terraform.tfstate` 是 Terraform 的"事实之源"——记录当前实际有哪些资源。**绝不要弄丢**。

| 后端 | 适用 |
|---|---|
| local（默认） | 个人 / 单人项目 |
| s3 | AWS 用户（推荐） |
| gcs | GCP |
| azurerm | Azure |
| http | 自托管（GitLab CI / etc） |
| terraform cloud | SaaS（HashiCorp 官方，免费 5 user） |

#### S3 backend + 锁

```hcl
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/state.tfstate"
    region         = "us-east-1"
    encrypt        = true                            # SSE-S3 加密
    dynamodb_table = "tf-state-lock"                  # 防并发
  }
}
```

DynamoDB 锁表（一次性创建）：

```bash
aws dynamodb create-table --table-name tf-state-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
```

### 工作流速查

```bash
# 标准流程
terraform fmt              # 格式化
terraform validate         # 校验语法
terraform plan -out plan.tfplan
terraform apply plan.tfplan    # 用保存的 plan，避免 apply 时再 plan

# 状态管理
terraform state list                       # 列资源
terraform state show aws_instance.web      # 看资源
terraform state mv module.a.aws_instance.x aws_instance.x   # 重构后挪
terraform state rm aws_instance.old         # 从 state 移除（不实际删资源）
terraform import aws_instance.web i-abc     # 把已存在资源纳入 Terraform 管理

# 输出
terraform output                            # 看 outputs
terraform output -raw web_ip > web_ip.txt   # 写到文件

# 销毁
terraform destroy
terraform destroy -target=aws_instance.web    # 仅销毁特定资源

# Workspace（多环境）
terraform workspace new production
terraform workspace new staging
terraform workspace select production
terraform workspace list
```

### 模块复用

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.x"

  cidr            = "10.0.0.0/16"
  azs             = ["us-east-1a", "us-east-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.20.0/24"]
}
```

社区模块在 [registry.terraform.io](https://registry.terraform.io/)。

### 国内镜像

```bash
mkdir -p ~/.terraform.d
cat > ~/.terraformrc <<EOF
provider_installation {
  network_mirror {
    url = "https://mirrors.tencent.com/terraform/"
  }
  direct {
    exclude = ["*"]
  }
}
EOF
```

或用 `tencentcloudcs/terraform-mirror` 等。

## 跨发行版兼容

| 项 | Ubuntu/Debian | RHEL/Anolis 9 |
|---|---|---|
| 仓库 | `apt.releases.hashicorp.com` | `rpm.releases.hashicorp.com` |
| 包 | `terraform` | `terraform` |
| 二进制 | `/usr/bin/terraform` | 同 |

## 与其它 catalog 项的配合

- **`vault-secrets`** — Terraform 用 Vault provider 拿动态凭据（避免 access_key 写代码）
- **`docker-host-profile`** — Docker provider 管本机容器（声明式）
- **`gitlab-runner` / `jenkins-ci`** — CI 里跑 `terraform plan / apply`（GitOps）
- **`minio-storage`** — 作为 state backend（S3 兼容）

## 排错

### `Error: Failed to install provider`

网络问题。配镜像（见上）或检查 firewall：

```bash
terraform init -upgrade
```

### `state lock failed` / `Error acquiring the state lock`

有别人在 apply（DynamoDB 锁）。等他完成或：

```bash
terraform force-unlock LOCK_ID                 # 强制解锁（**小心**：可能 state 损坏）
```

### `provider produced inconsistent final plan`

provider bug。试：

```bash
terraform refresh                              # 同步状态
terraform plan
```

### `state file already exists`

切 backend 后老 state 在本地：

```bash
terraform init -migrate-state                  # 迁移到新 backend
```

### `resource not found in state`

```bash
terraform state list | grep my-resource
terraform import aws_instance.web i-abc123     # 把现有资源纳入管理
```

## 验证

```bash
# 1. 命令存在
terraform --version

# 2. providers 可用
terraform providers

# 3. 仓库工作
mkdir /tmp/tf-test && cd /tmp/tf-test
cat > main.tf <<'EOF'
terraform {
  required_providers {
    null = { source = "hashicorp/null" }
  }
}
resource "null_resource" "test" {}
EOF
terraform init
terraform apply -auto-approve
terraform destroy -auto-approve
cd / && rm -rf /tmp/tf-test
```

## 配置文件速查

```
~/.terraformrc                              # 全局配置（镜像 / 凭据缓存）
~/.terraform.d/                              # 全局插件 / credential
├── plugins/
└── credentials.tfrc.json                    # Terraform Cloud token

# 项目级
<project>/
├── *.tf                                     # HCL 资源定义
├── *.tfvars                                  # 变量值
├── .terraform/                                # init 后下载的 provider
├── .terraform.lock.hcl                         # provider 版本锁定（**提交到 git**）
├── terraform.tfstate                          # state（local backend；不要提交！）
└── terraform.tfstate.backup
```

| 项 | 推荐 |
|---|---|
| `.terraform.lock.hcl` | 提交到 git（保版本一致） |
| `terraform.tfstate*` | **绝不**提交（含 secret） |
| `*.tfvars`（含 secret） | **绝不**提交，加 `.gitignore` |

## 验证

```bash
terraform --version
terraform providers
```

## 排错

- **`Error: Failed to install provider`** — 网络问题，配镜像或检查 firewall。
- **`state lock failed`** — 有别人在 apply（用 DynamoDB 锁），等他完成。或者强制解锁 `terraform force-unlock LOCK_ID`（小心！）。
- **跨发行版**：HashiCorp 仓库覆盖 Ubuntu / Debian / RHEL / Fedora。Anolis 走 RHEL 仓库。

## 多次运行

`installMode: skip-existing`。

## 隐私说明

- Terraform 默认开启 telemetry（向 HashiCorp 上报使用统计）。可关：
  ```bash
  export CHECKPOINT_DISABLE=1
  ```
- state 文件含敏感信息，本地存务必磁盘加密；远程存务必 S3 SSE。
