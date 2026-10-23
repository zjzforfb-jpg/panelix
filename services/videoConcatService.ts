/**
 * Video Concat Service
 * 
 * Frontend client for the local Python sidecar backend that handles
 * video concatenation using ffmpeg.
 * 
 * Communication protocol:
 * - POST /api/concat: Upload multiple video files → returns concatenated video
 * - GET /api/health: Check backend availability
 */

import { AppSettings } from '../types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONCAT_BASE_URL = 'http://127.0.0.1:8008';

// ============================================================================
// Types
// ============================================================================

export interface ConcatRequest {
  /** Panel ID for naming the output */
  panelId: number;
  /** Array of video file Blobs to concatenate (in order) */
  videos: Blob[];
  /** Transition type between segments (default: none for seamless concat) */
  transition?: 'none' | 'fade' | 'dissolve';
  /** Output format (default: mp4) */
  outputFormat?: 'mp4' | 'webm';
  /** Target resolution (default: 720p, or 'source' to keep original) */
  resolution?: '480p' | '720p' | '1080p' | 'source';
}

export interface ConcatResponse {
  success: boolean;
  /** Concatenated video as Blob (if success) */
  video?: Blob;
  /** Output filename hint */
  filename?: string;
  /** Total duration of concatenated video in seconds */
  durationSec?: number;
  /** Error message (if not success) */
  error?: string;
}

export interface ConcatUrlsRequest {
  /** Panel ID for naming the output */
  panelId: number;
  /** Remote video URLs (in order) */
  videoUrls: string[];
  transition?: 'none' | 'fade' | 'dissolve';
  outputFormat?: 'mp4' | 'webm';
  resolution?: '480p' | '720p' | '1080p' | 'source';
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  version?: string;
  ffmpegAvailable?: boolean;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getBaseUrl(settings: AppSettings): string {
  return settings.videoConcatBaseUrl || DEFAULT_CONCAT_BASE_URL;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Check if the Python concat backend is available
 */
export async function checkConcatHealth(settings: AppSettings): Promise<HealthCheckResponse> {
  const baseUrl = getBaseUrl(settings);
  
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return {
        status: 'error',
        error: `Health check failed: ${response.status} ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    return {
      status: 'ok',
      version: data.version,
      ffmpegAvailable: data.ffmpeg_available,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Concatenate multiple video files using the Python backend
 * 
 * @param request Concat request with video Blobs
 * @param settings App settings with backend URL
 * @returns Concatenated video Blob or error
 */
export async function concatenateVideos(
  request: ConcatRequest,
  settings: AppSettings
): Promise<ConcatResponse> {
  const baseUrl = getBaseUrl(settings);
  
  if (request.videos.length < 2) {
    return {
      success: false,
      error: 'At least 2 videos required for concatenation',
    };
  }
  
  try {
    // Build multipart/form-data
    const formData = new FormData();
    formData.append('panel_id', String(request.panelId));
    formData.append('transition', request.transition || 'none');
    formData.append('output_format', request.outputFormat || 'mp4');
    formData.append('resolution', request.resolution || '720p');
    
    // Append videos in order
    request.videos.forEach((videoBlob, index) => {
      const filename = `segment_${index}.${videoBlob.type.includes('webm') ? 'webm' : 'mp4'}`;
      formData.append('videos', videoBlob, filename);
    });
    
    const response = await fetch(`${baseUrl}/api/concat`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `Concat failed: ${response.status} ${response.statusText}`,
      };
    }
    
    // Parse response headers for metadata
    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ? contentDisposition.match(/filename="?([^"]+)"?/)?.[1]
      : `panel_${request.panelId}_concat.mp4`;
    
    const durationHeader = response.headers.get('X-Video-Duration');
    const durationSec = durationHeader ? parseFloat(durationHeader) : undefined;
    
    const videoBlob = await response.blob();
    
    return {
      success: true,
      video: videoBlob,
      filename: filename || `panel_${request.panelId}_concat.mp4`,
      durationSec,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Concatenation failed',
    };
  }
}

/**
 * Concatenate remote video URLs using the Python backend (server-side download).
 * This avoids browser CORS issues for TOS URLs.
 */
export async function concatenateVideoUrls(
  request: ConcatUrlsRequest,
  settings: AppSettings
): Promise<ConcatResponse> {
  const baseUrl = getBaseUrl(settings);

  if (request.videoUrls.length < 2) {
    return { success: false, error: 'At least 2 videos required for concatenation' };
  }

  try {
    const response = await fetch(`${baseUrl}/api/concat_urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        panel_id: request.panelId,
        video_urls: request.videoUrls,
        transition: request.transition || 'none',
        output_format: request.outputFormat || 'mp4',
        resolution: request.resolution || '720p',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `Concat failed: ${response.status} ${response.statusText}`,
      };
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ? contentDisposition.match(/filename="?([^"]+)"?/)?.[1]
      : `panel_${request.panelId}_concat.mp4`;

    const durationHeader = response.headers.get('X-Video-Duration');
    const durationSec = durationHeader ? parseFloat(durationHeader) : undefined;

    const videoBlob = await response.blob();

    return {
      success: true,
      video: videoBlob,
      filename: filename || `panel_${request.panelId}_concat.mp4`,
      durationSec,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Concatenation failed',
    };
  }
}

/**
 * Download video segments from URLs and return as Blobs
 * Used to convert remote video URLs to Blobs before concat
 */
export async function downloadVideosAsBlobs(urls: string[]): Promise<Blob[]> {
  const blobs: Blob[] = [];
  
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download video from ${url}: ${response.status}`);
    }
    const blob = await response.blob();
    blobs.push(blob);
  }
  
  return blobs;
}

/**
 * Full workflow: download segments → concat → return result
 */
export async function downloadAndConcatenate(
  urls: string[],
  panelId: number,
  settings: AppSettings
): Promise<ConcatResponse> {
  try {
    // Step 1: Download all videos
    const blobs = await downloadVideosAsBlobs(urls);
    
    // Step 2: Concatenate
    return await concatenateVideos({
      panelId,
      videos: blobs,
      transition: 'none',
      outputFormat: 'mp4',
      resolution: '720p',
    }, settings);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download and concat failed',
    };
  }
}

export default {
  checkConcatHealth,
  concatenateVideos,
  concatenateVideoUrls,
  downloadVideosAsBlobs,
  downloadAndConcatenate,
};

