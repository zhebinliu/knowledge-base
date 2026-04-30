FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
#  - fonts-noto-cjk: matplotlib 渲染中文图表/标签必备
#  - libreoffice + libreoffice-writer: 旧版 .doc / .ppt / .xls 转 .docx 等新格式
#    (headless 模式),用于 converter_agent 把 OLE2 二进制 Office 文件转成可解析格式
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    fonts-noto-cjk \
    libreoffice \
    libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

EXPOSE 8000
