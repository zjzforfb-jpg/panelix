# Panelix Video Concat Service

本地 Python sidecar 服务，使用 ffmpeg 拼接多段视频。

## 安装

### 前提条件

1. **Python 3.9+**
2. **ffmpeg** - 必须在 PATH 中可用

   macOS:
   ```bash
   brew install ffmpeg
   ```

   Ubuntu/Debian:
   ```bash
   sudo apt install ffmpeg
   ```

   Windows:
   - 从 https://ffmpeg.org/download.html 下载
   - 添加到 PATH

### 安装依赖

```bash
cd python_backend
pip install -r requirements.txt
```

## 运行

```bash
# 方式 1: 直接运行
python main.py

# 方式 2: 使用 uvicorn (推荐开发时)
uvicorn main:app --host 127.0.0.1 --port 8008 --reload
```

服务默认监听 `http://127.0.0.1:8008`

## API 接口

### 健康检查

```
GET /api/health
```

响应:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "ffmpeg_available": true,
  "message": "Service running"
}
```

### 视频拼接

```
POST /api/concat
Content-Type: multipart/form-data
```

参数:
- `videos`: 视频文件数组 (至少 2 个)
- `panel_id`: 分镜 ID (用于输出文件命名)
- `transition`: 转场类型 (`none`, `fade`, `dissolve`)，默认 `none`
- `output_format`: 输出格式 (`mp4`, `webm`)，默认 `mp4`
- `resolution`: 分辨率 (`480p`, `720p`, `1080p`, `source`)，默认 `720p`

响应:
- 成功: 返回拼接后的视频文件
- 响应头:
  - `X-Video-Duration`: 视频时长（秒）
  - `Content-Disposition`: 文件名

## 前端配置

在 Panelix 设置中配置 `videoConcatBaseUrl`:

```
默认值: http://127.0.0.1:8008
```

如果后端运行在其他端口或机器，修改此配置。

## 故障排查

### ffmpeg 不可用

```
[Panelix Concat] ✗ ffmpeg NOT FOUND
```

解决: 安装 ffmpeg 并确保在 PATH 中

### 端口被占用

```
Address already in use
```

解决: 更换端口或关闭占用进程

```bash
# macOS/Linux 查找占用进程
lsof -i :8008

# 使用其他端口
uvicorn main:app --port 8009
```

