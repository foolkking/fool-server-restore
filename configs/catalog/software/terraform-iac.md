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

## ⚠️ 敏感性

**review** — Terraform 需要 cloud provider 的凭据（access_key / secret_key），这些等于你云账户的密码：
1. **绝不要**把 access_key 写进 .tf 文件 commit 到 git
2. 用环境变量 / aws cli profile / IAM role 注入
3. state 文件可能含 secret（数据库密码等），存到加密的 S3 bucket

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
