#!/bin/bash

# Panelix Python Backend Starter
# 一键启动视频拼接 + 火山API代理服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 虚拟环境路径
VENV_PATH="$PROJECT_ROOT/.env_py_AIComicDramas4"
PYTHON="$VENV_PATH/bin/python"
PIP="$VENV_PATH/bin/pip"

echo "=========================================="
echo "  🎬 Panelix Backend Service"
echo "=========================================="
echo ""

# 检查虚拟环境
if [ ! -f "$PYTHON" ]; then
    echo "❌ 虚拟环境未找到: $VENV_PATH"
    echo "   请先创建虚拟环境:"
    echo "   python3 -m venv $VENV_PATH"
    exit 1
fi

echo "✓ 虚拟环境: $VENV_PATH"

# 切换到脚本目录
cd "$SCRIPT_DIR"

# 检查并安装依赖
echo "📦 检查依赖..."
"$PIP" install -q -r requirements.txt 2>/dev/null

# 检查 ffmpeg
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg 已安装"
else
    echo "⚠️ ffmpeg 未安装（视频拼接功能将不可用）"
    echo "   安装命令: brew install ffmpeg"
fi

echo ""
echo "🚀 启动服务..."
echo "   端口: 8008"
echo "   API 端点:"
echo "     - GET  /api/health              健康检查"
echo "     - POST /api/concat              视频拼接"
echo "     - POST /api/volc/video/create   火山视频生成"
echo "     - GET  /api/volc/video/query/*  火山任务查询"
echo ""
echo "按 Ctrl+C 停止服务"
echo "=========================================="
echo ""

# 启动服务
"$PYTHON" main.py

