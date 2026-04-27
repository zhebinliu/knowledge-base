FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（fonts-noto-cjk: matplotlib 渲染中文图表/标签必备）
RUN apt-get update && apt-get install -y \
    curl \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

EXPOSE 8000
