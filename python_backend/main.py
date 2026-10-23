"""
Panelix Video Concat Service

A local sidecar Python backend for:
1. Concatenating video segments using ffmpeg
2. Proxying VolcEngine Ark API calls (to bypass CORS)

Designed to be run alongside the Electron/browser frontend.

Usage:
    cd python_backend
    pip install -r requirements.txt
    python main.py
    # Or with uvicorn: uvicorn main:app --host 127.0.0.1 --port 8008

API Endpoints:
    GET  /api/health              - Health check
    POST /api/concat              - Concatenate videos
    POST /api/volc/video/create   - Proxy: Create VolcEngine video task
    GET  /api/volc/video/query    - Proxy: Query VolcEngine video task
    POST /api/volc/image/generate - Proxy: Generate VolcEngine image
"""

import os
import tempfile
import subprocess
import shutil
import uuid
import httpx
from pathlib import Path
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request, Header
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.background import BackgroundTask

# ============================================================================
# App Configuration
# ============================================================================

VERSION = "1.0.0"

# 调试日志写入项目内的 logs/ 目录（可通过环境变量覆盖），避免写死本机绝对路径
_BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG_LOG_PATH = os.environ.get(
    "AUTOMANJU_DEBUG_LOG",
    str(_BASE_DIR / "logs" / "backend-debug.log"),
)

app = FastAPI(
    title="Panelix Video Concat Service",
    version=VERSION,
    description="Local sidecar for video concatenation using ffmpeg"
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Local sidecar allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Utility Functions
# ============================================================================

def check_ffmpeg_available() -> bool:
    """Check if ffmpeg is available in PATH"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def get_video_duration(filepath: str) -> Optional[float]:
    """Get duration of a video file using ffprobe"""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                filepath
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
    except (subprocess.SubprocessError, ValueError):
        pass
    return None


def create_concat_list(video_paths: List[str], list_file: str) -> None:
    """Create ffmpeg concat demuxer list file"""
    with open(list_file, "w") as f:
        for path in video_paths:
            # Escape special chars in path
            escaped = path.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")


def concatenate_with_ffmpeg(
    input_paths: List[str],
    output_path: str,
    transition: str = "none",
    resolution: str = "720p"
) -> bool:
    """
    Concatenate videos using ffmpeg concat demuxer.
    
    Args:
        input_paths: List of input video file paths
        output_path: Output file path
        transition: Transition type (none, fade, dissolve)
        resolution: Target resolution (480p, 720p, 1080p, source)
    
    Returns:
        True if successful, raises exception otherwise
    """
    temp_dir = tempfile.mkdtemp(prefix="concat_")
    list_file = os.path.join(temp_dir, "input.txt")
    
    try:
        # Create concat list file
        create_concat_list(input_paths, list_file)
        
        # Build ffmpeg command
        cmd = ["ffmpeg", "-y"]
        
        # Input: concat demuxer
        cmd.extend(["-f", "concat", "-safe", "0", "-i", list_file])
        
        # Video filter for resolution
        vf_filters = []
        
        if resolution != "source":
            res_map = {
                "480p": "scale=-2:480",
                "720p": "scale=-2:720",
                "1080p": "scale=-2:1080",
            }
            if resolution in res_map:
                vf_filters.append(res_map[resolution])
        
        # Add fade transitions if requested
        if transition == "fade":
            # Note: Simple implementation - fade in/out at boundaries
            vf_filters.append("fade=t=in:st=0:d=0.3")
        
        if vf_filters:
            cmd.extend(["-vf", ",".join(vf_filters)])
        
        # Output settings
        cmd.extend([
            "-c:v", "libx264",      # H.264 codec
            "-preset", "fast",      # Encoding speed
            "-crf", "23",           # Quality (lower = better)
            "-c:a", "aac",          # Audio codec
            "-b:a", "192k",         # Audio bitrate
            "-movflags", "+faststart",  # Web-friendly
            output_path
        ])
        
        # Run ffmpeg
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr}")
        
        return True
        
    finally:
        # Cleanup temp dir
        shutil.rmtree(temp_dir, ignore_errors=True)

def append_debug_log(payload: Dict[str, Any]) -> None:
    """Append one NDJSON line to the debug log (best-effort)."""
    if os.environ.get("AUTO_MANJU_DEBUG_LOG") != "1":
        return
    try:
        os.makedirs(os.path.dirname(DEBUG_LOG_PATH), exist_ok=True)
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{payload}\n")
    except Exception:
        pass


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    ffmpeg_ok = check_ffmpeg_available()
    return JSONResponse({
        "status": "ok" if ffmpeg_ok else "warning",
        "version": VERSION,
        "ffmpeg_available": ffmpeg_ok,
        "message": "Service running" if ffmpeg_ok else "ffmpeg not found in PATH"
    })


@app.post("/api/concat")
async def concat_videos(
    videos: List[UploadFile] = File(..., description="Video files to concatenate"),
    panel_id: int = Form(..., description="Panel ID for output naming"),
    transition: str = Form("none", description="Transition type: none, fade, dissolve"),
    output_format: str = Form("mp4", description="Output format: mp4, webm"),
    resolution: str = Form("720p", description="Resolution: 480p, 720p, 1080p, source")
):
    """
    Concatenate multiple video files.
    
    Upload multiple video files in order. Returns the concatenated video.
    """
    if len(videos) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 video files required"
        )
    
    if not check_ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail="ffmpeg not available on server"
        )
    
    if transition not in ("none", "fade", "dissolve"):
        transition = "none"
    
    if output_format not in ("mp4", "webm"):
        output_format = "mp4"
    
    if resolution not in ("480p", "720p", "1080p", "source"):
        resolution = "720p"
    
    # Create temp directory for processing
    temp_dir = tempfile.mkdtemp(prefix="video_concat_")
    input_paths = []
    
    try:
        # Save uploaded files to temp directory
        for i, video in enumerate(videos):
            # Determine extension from content type
            ext = ".mp4"
            if video.content_type and "webm" in video.content_type:
                ext = ".webm"
            
            input_path = os.path.join(temp_dir, f"input_{i:02d}{ext}")
            
            with open(input_path, "wb") as f:
                content = await video.read()
                f.write(content)
            
            input_paths.append(input_path)
        
        # Output path
        output_filename = f"panel_{panel_id}_concat_{uuid.uuid4().hex[:8]}.{output_format}"
        output_path = os.path.join(temp_dir, output_filename)
        
        # Concatenate
        concatenate_with_ffmpeg(
            input_paths,
            output_path,
            transition=transition,
            resolution=resolution
        )
        
        # Get duration of output
        duration = get_video_duration(output_path)
        
        # Return file response with custom headers
        headers = {
            "X-Video-Duration": str(duration) if duration else "0",
            "Content-Disposition": f'attachment; filename="{output_filename}"'
        }
        
        return FileResponse(
            output_path,
            media_type=f"video/{output_format}",
            filename=output_filename,
            headers=headers,
            background=None  # Don't delete file until response sent
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Concatenation failed: {str(e)}"
        )
    finally:
        # Schedule cleanup (will run after response)
        # Note: In production, use background tasks for cleanup
        pass

class ConcatUrlsBody(BaseModel):
    panel_id: int
    video_urls: List[str]
    transition: str = "none"
    output_format: str = "mp4"
    resolution: str = "720p"


@app.post("/api/concat_urls")
async def concat_videos_by_urls(body: ConcatUrlsBody):
    """
    Concatenate multiple remote video URLs server-side (avoids browser CORS).
    """
    if len(body.video_urls) < 2:
        raise HTTPException(status_code=400, detail="At least 2 video URLs required")

    if not check_ffmpeg_available():
        raise HTTPException(status_code=503, detail="ffmpeg not available on server")

    transition = body.transition if body.transition in ("none", "fade", "dissolve") else "none"
    output_format = body.output_format if body.output_format in ("mp4", "webm") else "mp4"
    resolution = body.resolution if body.resolution in ("480p", "720p", "1080p", "source") else "720p"

    temp_dir = tempfile.mkdtemp(prefix="video_concat_urls_")
    input_paths: List[str] = []

    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            for i, url in enumerate(body.video_urls):
                # Keep extension mp4 by default (TOS links are mp4)
                input_path = os.path.join(temp_dir, f"input_{i:02d}.mp4")
                with open(input_path, "wb") as f:
                    async with client.stream("GET", url) as resp:
                        resp.raise_for_status()
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
                input_paths.append(input_path)

        output_filename = f"panel_{body.panel_id}_concat_{uuid.uuid4().hex[:8]}.{output_format}"
        output_path = os.path.join(temp_dir, output_filename)

        concatenate_with_ffmpeg(
            input_paths,
            output_path,
            transition=transition,
            resolution=resolution
        )

        duration = get_video_duration(output_path)

        headers = {
            "X-Video-Duration": str(duration) if duration else "0",
            "Content-Disposition": f'attachment; filename="{output_filename}"'
        }

        # IMPORTANT:
        # Do NOT delete temp_dir before FileResponse finishes sending the file,
        # otherwise Starlette will raise "File at path ... does not exist."
        def _cleanup() -> None:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

        return FileResponse(
            output_path,
            media_type=f"video/{output_format}",
            filename=output_filename,
            headers=headers,
            background=BackgroundTask(_cleanup),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Concatenation failed: {str(e)}")
    finally:
        # NOTE:
        # Cleanup is handled by FileResponse(background=...) on success.
        # On error paths, we can still clean up here safely.
        pass


# ============================================================================
# VolcEngine Ark API Proxy
# ============================================================================

VOLC_ARK_BASE_URL = "https://ark.cn-beijing.volces.com"


@app.post("/api/volc/video/create")
async def proxy_volc_video_create(
    request: Request,
    authorization: str = Header(..., description="Bearer token for VolcEngine Ark API")
):
    """
    Proxy endpoint for VolcEngine Ark video generation.
    Creates a video generation task.
    
    POST /api/v3/contents/generations/tasks
    """
    try:
        # Get request body
        body = await request.json()
        
        print(f"[VolcProxy] Creating video task, model: {body.get('model', 'unknown')}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{VOLC_ARK_BASE_URL}/api/v3/contents/generations/tasks",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": authorization,
                }
            )
            
            print(f"[VolcProxy] Video task response: {response.status_code}")
            
            # Return the response as-is
            return JSONResponse(
                content=response.json(),
                status_code=response.status_code
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="VolcEngine API timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"VolcEngine API error: {str(e)}")
    except Exception as e:
        print(f"[VolcProxy] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/volc/video/query/{task_id}")
async def proxy_volc_video_query(
    task_id: str,
    authorization: str = Header(..., description="Bearer token for VolcEngine Ark API")
):
    """
    Proxy endpoint for querying VolcEngine Ark video task status.
    
    GET /api/v3/contents/generations/tasks/{id}
    """
    try:
        print(f"[VolcProxy] Querying video task: {task_id}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{VOLC_ARK_BASE_URL}/api/v3/contents/generations/tasks/{task_id}",
                headers={
                    "Authorization": authorization,
                }
            )
            
            print(f"[VolcProxy] Query response: {response.status_code}")
            
            return JSONResponse(
                content=response.json(),
                status_code=response.status_code
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="VolcEngine API timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"VolcEngine API error: {str(e)}")
    except Exception as e:
        print(f"[VolcProxy] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/volc/image/generate")
async def proxy_volc_image_generate(
    request: Request,
    authorization: str = Header(..., description="Bearer token for VolcEngine Ark API")
):
    """
    Proxy endpoint for VolcEngine Ark image generation.
    
    POST /api/v3/images/generations
    """
    try:
        body = await request.json()
        
        print(f"[VolcProxy] Generating image, model: {body.get('model', 'unknown')}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{VOLC_ARK_BASE_URL}/api/v3/images/generations",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": authorization,
                }
            )
            
            print(f"[VolcProxy] Image response: {response.status_code}")
            
            return JSONResponse(
                content=response.json(),
                status_code=response.status_code
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="VolcEngine API timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"VolcEngine API error: {str(e)}")
    except Exception as e:
        print(f"[VolcProxy] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Startup
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Log startup info"""
    print(f"[Panelix] Starting v{VERSION}")
    if check_ffmpeg_available():
        print("[Panelix] ✓ ffmpeg available")
    else:
        print("[Panelix] ✗ ffmpeg NOT FOUND - concat will fail!")
    print("[Panelix] ✓ VolcEngine Ark proxy enabled")
    print("[Panelix] Listening on http://127.0.0.1:8008")


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8008,
        reload=False,
        log_level="info"
    )

