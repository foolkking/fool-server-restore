# Python 工具链

## 安装内容

- Python
- pip
- venv
- 常用 CLI 工具

## 简单私人配置

可以配置 pip 镜像源，但不要上传包含密码的私有 index URL。

```bash
python -m venv .venv
python -m pip install --upgrade pip
```

## 隐私说明

不会同步 `.pypirc` 或包含 token 的 pip 配置。
