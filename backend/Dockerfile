FROM python:3.11-slim

# 国内源(可选,2026-09):生产机在腾讯云南京,官方源 apt 拉 libreoffice 卡死、pip 只有几十 KB/s。
# deploy-prod 在服务器上 build 时传 APT_MIRROR / PIP_MIRROR;不传(本地 / CI)就用官方源,行为不变。
# 注意 ARG 名不能叫 PIP_INDEX_URL —— ARG 会以环境变量暴露给 RUN,空值会让 pip 找不到索引。
ARG APT_MIRROR=
ARG PIP_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i -e "s|http://deb.debian.org|$APT_MIRROR|g" -e "s|http://security.debian.org|$APT_MIRROR|g" \
        /etc/apt/sources.list.d/debian.sources; \
    fi && \
    if [ -n "$PIP_MIRROR" ]; then pip config set global.index-url "$PIP_MIRROR"; fi

WORKDIR /app

# 安装系统依赖
#  - fonts-noto-cjk: matplotlib 渲染中文图表/标签必备
#  - libreoffice + libreoffice-writer: 旧版 .doc / .ppt / .xls 转 .docx 等新格式
#    (headless 模式),用于 converter_agent 把 OLE2 二进制 Office 文件转成可解析格式
#  - ffmpeg(2026-05-12):pydub 转 mp3/m4a/webm → 16kHz PCM 用,会议切片 ASR 依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    fonts-noto-cjk \
    libreoffice \
    libreoffice-writer \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
# 注意:2026-05-19 起 build context 改为仓库根(为了让 COPY 能看到 meeting/ submodule),
# 所有路径都从仓库根算起。
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码 —— 先 backend 再 meeting/backend 做 overlay,让 submodule 文件落到原位
# meeting/backend/api/meeting.py → /app/api/meeting.py(对应 main.py 里的 from api import meeting)
# meeting/backend/services/meeting/* → /app/services/meeting/*(对应 from services.meeting import ...)
COPY backend/ /app/
COPY meeting/backend/ /app/

# 语法闸门(2026-07-31,见 LEARNING §25):overlay 之后把全部源码编译一遍,
# 有 SyntaxError 直接 build 失败 —— 别再让"3.12-only 语法 + handler 内 lazy import"
# 的死代码一路推到 ghcr、部署 healthy,等用户点按钮才 500。
# 注意必须放在两条 COPY 之后,校验的是 overlay 后的最终形态。
RUN python -m compileall -q /app && echo "syntax ok"

EXPOSE 8000
