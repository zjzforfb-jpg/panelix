/**
 * VolcEngine Ark Service
 * Supports VolcEngine Ark API for image and video generation
 * 
 * Image API: POST /api/v3/images/generations
 * Video API: POST /api/v3/contents/generations/tasks
 * Query API: GET /api/v3/contents/generations/tasks/{id}
 * Delete API: DELETE /api/v3/contents/generations/tasks/{id}
 */

import { AppSettings, VeoModel } from '../types';
import type { VeoGenerationResponse, VeoTaskQueryResponse } from './veoService';

// VolcEngine Ark Base URL (fixed, but we use proxy to bypass CORS)
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com';

// Local proxy server URL (Python sidecar)
const PROXY_BASE_URL = 'http://127.0.0.1:8008';

/**
 * Get the proxy URL for VolcEngine Ark API calls.
 * The proxy server handles CORS issues by forwarding requests server-side.
 */
function getProxyUrl(settings: AppSettings): string {
  return settings.videoConcatBaseUrl || PROXY_BASE_URL;
}

/**
 * Check if proxy server is available
 */
async function isProxyAvailable(settings: AppSettings): Promise<boolean> {
  try {
    const response = await fetch(`${getProxyUrl(settings)}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Model configurations for VolcEngine Ark
// Model IDs from official documentation: https://www.volcengine.com/docs/82379/1330310
export const VOLC_ARK_IMAGE_MODELS = [
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5 (推荐)', desc: '最新款，支持组图/单图，多图融合，文生图/图生图' },
  { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', desc: '支持组图/单图，多图融合，文生图/图生图' },
  { id: 'doubao-seedream-3-0-t2i-250415', name: 'Seedream 3.0 T2I', desc: '文生图专用' },
  { id: 'doubao-seededit-3-0-i2i-250628', name: 'Seededit 3.0 I2I', desc: '图生图专用（待下线）' },
];

export const VOLC_ARK_VIDEO_MODELS = [
  { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro (推荐)', desc: '最新款，支持有声视频，首尾帧/首帧/文生视频，4-12秒' },
  { id: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro', desc: '高质量，支持首尾帧/首帧/文生视频，2-12秒' },
  { id: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', desc: '快速模式，支持首帧/文生视频' },
  { id: 'doubao-seedance-1-0-lite-t2v-250428', name: 'Seedance 1.0 Lite T2V', desc: '文生视频专用' },
  { id: 'doubao-seedance-1-0-lite-i2v-250428', name: 'Seedance 1.0 Lite I2V', desc: '图生视频专用，支持参考图/首尾帧/首帧' },
];

/**
 * Check if a model is a VolcEngine Ark image model
 */
export function isVolcArkImageModel(modelId: string): boolean {
  return VOLC_ARK_IMAGE_MODELS.some(m => m.id === modelId) ||
         modelId.startsWith('doubao-seedream-') ||
         modelId.startsWith('doubao-seededit-');
}

/**
 * Check if a model is a VolcEngine Ark video model
 */
export function isVolcArkVideoModel(model: VeoModel): boolean {
  return VOLC_ARK_VIDEO_MODELS.some(m => m.id === model) ||
         model.startsWith('doubao-seedance-');
}

// ============================================================================
// Image Generation
// ============================================================================

export interface VolcImageGenerationRequest {
  model: string;
  prompt: string;
  image?: string | string[];  // URL or base64, single or array (for multi-image)
  size?: string;              // e.g., '2048x2048', '2K', '4K', 'adaptive'
  seed?: number;              // -1 to 2147483647
  sequential_image_generation?: 'auto' | 'disabled';  // For group images
  sequential_image_generation_options?: {
    max_images?: number;      // 1-15
  };
  stream?: boolean;
  guidance_scale?: number;    // 1-10
  response_format?: 'url' | 'b64_json';
  watermark?: boolean;
  optimize_prompt_options?: {
    mode?: 'standard' | 'fast';
  };
}

export interface VolcImageGenerationResponse {
  model: string;
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    size?: string;
    error?: {
      code: string;
      message: string;
    };
  }>;
  usage?: {
    generated_images: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Convert aspect ratio to size string for VolcEngine Ark
 * Maps common aspect ratios to recommended pixel sizes
 */
function aspectRatioToSize(aspectRatio: string, defaultSize?: string): string {
  if (defaultSize) {
    // If user specified a size, use it (e.g., '2K', '4K', '2048x2048')
    return defaultSize;
  }
  
  // Map aspect ratios to recommended sizes (for Seedream 4.5/4.0)
  const sizeMap: Record<string, string> = {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3024x1296',
  };
  
  return sizeMap[aspectRatio] || '2048x2048';
}

/**
 * Convert image blob to base64 data URL
 */
async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Ensure it's in the format: data:image/png;base64,...
      if (!base64.startsWith('data:')) {
        // Determine MIME type from blob
        const mimeType = blob.type || 'image/png';
        resolve(`data:${mimeType};base64,${base64.split(',')[1] || base64}`);
      } else {
        resolve(base64);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate image using VolcEngine Ark API
 * POST /api/v3/images/generations
 */
export async function generateVolcImage(
  request: {
    model: string;
    prompt: string;
    referenceImages?: Blob[];  // For img2img
    aspectRatio?: string;
    size?: string;
    responseFormat?: 'url' | 'b64_json';
    watermark?: boolean;
  },
  settings: AppSettings
): Promise<string> {
  const apiKey = settings.volcArkApiKey;
  
  if (!apiKey) {
    throw new Error('VolcEngine Ark API Key not configured. Please set volcArkApiKey in Settings.');
  }
  
  // Build request body
  const requestBody: VolcImageGenerationRequest = {
    model: request.model,
    prompt: request.prompt,
    response_format: request.responseFormat || 'url',
    watermark: request.watermark !== undefined ? request.watermark : (settings.volcImageWatermark !== false), // Default: true
  };
  
  // Add image(s) for img2img
  if (request.referenceImages && request.referenceImages.length > 0) {
    // Convert blobs to base64 data URLs
    const imageDataUrls = await Promise.all(
      request.referenceImages.map(blob => blobToBase64DataUrl(blob))
    );
    
    if (imageDataUrls.length === 1) {
      requestBody.image = imageDataUrls[0];
    } else {
      // Multi-image (for Seedream 4.5/4.0)
      requestBody.image = imageDataUrls;
    }
  }
  
  // Add size
  if (request.size || request.aspectRatio) {
    requestBody.size = aspectRatioToSize(request.aspectRatio || '1:1', request.size || settings.volcImageDefaultSize);
  }
  
  try {
    const response = await fetch(`${ARK_BASE_URL}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VolcArk] Image API Error:', response.status, errorText);
      throw new Error(`VolcEngine Ark Image API Error: ${response.status} - ${errorText}`);
    }
    
    const data: VolcImageGenerationResponse = await response.json();
    
    // Check for errors
    if (data.error) {
      throw new Error(`VolcEngine Ark Error: ${data.error.code} - ${data.error.message}`);
    }
    
    // Check for image errors
    if (data.data && data.data.length > 0 && data.data[0].error) {
      const imgError = data.data[0].error;
      throw new Error(`Image Generation Error: ${imgError.code} - ${imgError.message}`);
    }
    
    // Return first image URL or base64
    // CRITICAL: If we requested b64_json format, prioritize b64_json to avoid CORS issues with TOS URLs
    if (data.data && data.data.length > 0) {
      // If b64_json was requested and present, use it first (avoids CORS with TOS URLs)
      if (request.responseFormat === 'b64_json' && data.data[0].b64_json) {
        // Convert base64 to blob URL (temporary, caller should save to assets)
        const base64Data = data.data[0].b64_json;
        const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(r => r.blob());
        return URL.createObjectURL(blob);
      }
      // Fallback to URL if no b64_json or URL was explicitly requested
      if (data.data[0].url) {
        return data.data[0].url;
      }
      // Final fallback to b64_json if present
      if (data.data[0].b64_json) {
        const base64Data = data.data[0].b64_json;
        const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(r => r.blob());
        return URL.createObjectURL(blob);
      }
    }
    
    throw new Error('No image data returned from VolcEngine Ark');
  } catch (error) {
    console.error('[VolcArk] Image generation failed:', error);
    throw error;
  }
}

// ============================================================================
// Video Generation
// ============================================================================

export interface VolcVideoContentItem {
  type: 'text' | 'image_url';
  text?: string;
  // Role should be at content item level, not inside image_url
  role?: 'first_frame' | 'last_frame' | 'reference_image';
  image_url?: {
    url: string;
  };
}

export interface VolcVideoGenerationRequest {
  model: string;
  content: VolcVideoContentItem[];
  callback_url?: string;
  return_last_frame?: boolean;
  service_tier?: 'default' | 'flex';
  execution_expires_after?: number;  // seconds, default 172800 (48h)
  generate_audio?: boolean;           // Only for Seedance 1.5 pro
}

export interface VolcVideoTaskResponse {
  id: string;
  model?: string;
  status?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Build video prompt with parameters as text commands
 * According to Seedance docs, parameters should be appended as --rt/--dur/--wm/--seed/...
 */
function buildVideoPromptWithParams(
  prompt: string,
  options: {
    aspectRatio?: string;
    duration?: number;
    resolution?: string;
    fps?: number;
    seed?: number;
    watermark?: boolean;
    cameraFixed?: boolean;
  }
): string {
  const parts: string[] = [prompt];
  
  // Aspect ratio (--rt)
  if (options.aspectRatio) {
    parts.push(`--rt ${options.aspectRatio}`);
  }
  
  // Duration (--dur)
  if (options.duration) {
    parts.push(`--dur ${options.duration}`);
  }
  
  // Resolution (--rs)
  if (options.resolution) {
    parts.push(`--rs ${options.resolution}`);
  }
  
  // FPS (--fps)
  if (options.fps) {
    parts.push(`--fps ${options.fps}`);
  }
  
  // Seed (--seed)
  if (options.seed !== undefined && options.seed !== -1) {
    parts.push(`--seed ${options.seed}`);
  }
  
  // Watermark (--wm)
  if (options.watermark !== undefined) {
    parts.push(`--wm ${options.watermark}`);
  }
  
  // Camera fixed (--cf)
  if (options.cameraFixed !== undefined) {
    parts.push(`--cf ${options.cameraFixed}`);
  }
  
  return parts.join(' ');
}

function isDurationParamError(errorText: string): boolean {
  // Typical VolcEngine error:
  // "param":"contents[0].text.duration"
  return /contents\[0\]\.text\.duration/i.test(errorText) || /text\.duration/i.test(errorText);
}

function isGenerateAudioParamError(errorText: string): boolean {
  return /generate_audio/i.test(errorText);
}

/**
 * Create video generation task
 * POST /api/v3/contents/generations/tasks
 */
export async function createVolcVideoTask(
  request: {
    model: string;
    prompt: string;
    images?: string[];  // Image URLs or base64
    imageRoles?: ('first_frame' | 'last_frame' | 'reference_image')[];  // Role for each image
    aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1' | '3:4' | '21:9' | 'adaptive';
    duration?: number;
    resolution?: '480p' | '720p' | '1080p';
    returnLastFrame?: boolean;
    generateAudio?: boolean;
  },
  settings: AppSettings
): Promise<VeoGenerationResponse> {
  const apiKey = settings.volcArkApiKey;
  
  if (!apiKey) {
    throw new Error('VolcEngine Ark API Key not configured. Please set volcArkApiKey in Settings.');
  }
  
  // Build content array
  const content: VolcVideoContentItem[] = [];
  
  const requestedDuration = request.duration || settings.volcVideoDuration || 5;
  const basePromptOptions = {
    aspectRatio: request.aspectRatio,
    resolution: request.resolution || settings.volcVideoResolution || '720p',
    fps: 24,  // Default
    watermark: false,  // Default
  } as const;

  // Add text prompt with parameters (attempt #1 with duration)
  const promptWithParams = buildVideoPromptWithParams(request.prompt, {
    ...basePromptOptions,
    duration: requestedDuration,
  });
  
  content.push({
    type: 'text',
    text: promptWithParams,
  });
  
  // Add images if provided
  // IMPORTANT: role should be at content item level, not inside image_url
  if (request.images && request.images.length > 0) {
    for (let i = 0; i < request.images.length; i++) {
      const imageUrl = request.images[i];
      const role = request.imageRoles?.[i] || (i === 0 ? 'first_frame' : i === 1 ? 'last_frame' : 'reference_image');
      
      content.push({
        type: 'image_url',
        role: role,  // Role at content item level
        image_url: {
          url: imageUrl,
        },
      });
    }
  }
  
  // Build request body
  // IMPORTANT:
  // VolcEngine Ark docs & runtime errors indicate `generate_audio` is ONLY supported by Seedance 1.5 Pro.
  // For other Seedance models, sending `generate_audio` triggers 400 InvalidParameter.
  const supportsGenerateAudio = request.model.startsWith('doubao-seedance-1-5-pro');
  const requestedGenerateAudio =
    request.generateAudio !== undefined
      ? request.generateAudio
      : (settings.volcVideoGenerateAudio !== false); // Default: true (if model supports)

  const requestBody: VolcVideoGenerationRequest = {
    model: request.model,
    content,
    return_last_frame: request.returnLastFrame || false,
    ...(supportsGenerateAudio ? { generate_audio: requestedGenerateAudio } : {}),
  };
  
  try {
    // Use proxy server to bypass CORS
    const proxyUrl = getProxyUrl(settings);
    const useProxy = await isProxyAvailable(settings);
    
    let response: Response;
    
    const doFetch = async (body: VolcVideoGenerationRequest): Promise<Response> => {
      if (useProxy) {
        return fetch(`${proxyUrl}/api/volc/video/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      }

      return fetch(`${ARK_BASE_URL}/api/v3/contents/generations/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    };

    if (useProxy) {
      response = await doFetch(requestBody);
    } else {
      // Direct call (will fail with CORS in browser, but works in Node.js)
      console.warn('[VolcArk] Proxy not available, attempting direct call (may fail due to CORS)');
      response = await doFetch(requestBody);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      // Retry strategy (only once): if duration is rejected, retry without --dur
      if (response.status === 400 && isDurationParamError(errorText)) {
        const promptNoDur = buildVideoPromptWithParams(request.prompt, {
          ...basePromptOptions,
          duration: undefined,
        });
        const contentNoDur: VolcVideoContentItem[] = [];
        contentNoDur.push({ type: 'text', text: promptNoDur });
        // Re-add images with same roles
        if (request.images && request.images.length > 0) {
          for (let i = 0; i < request.images.length; i++) {
            const imageUrl = request.images[i];
            const role = request.imageRoles?.[i] || (i === 0 ? 'first_frame' : i === 1 ? 'last_frame' : 'reference_image');
            contentNoDur.push({ type: 'image_url', role, image_url: { url: imageUrl } });
          }
        }

        const bodyNoDur: VolcVideoGenerationRequest = {
          model: request.model,
          content: contentNoDur,
          return_last_frame: request.returnLastFrame || false,
          ...(supportsGenerateAudio ? { generate_audio: requestedGenerateAudio } : {}),
        };

        const retryResp = await doFetch(bodyNoDur);
        if (!retryResp.ok) {
          const retryText = await retryResp.text();
          console.error('[VolcArk] Video API Error (retry):', retryResp.status, retryText);
          throw new Error(`VolcEngine Ark Video API Error: ${retryResp.status} - ${retryText}`);
        }
        const retryData: VolcVideoTaskResponse = await retryResp.json();
        if (retryData.error) {
          throw new Error(`VolcEngine Ark Error: ${retryData.error.code} - ${retryData.error.message}`);
        }
        if (!retryData.id) {
          throw new Error('No task ID returned from VolcEngine Ark (retry)');
        }
        return { taskId: retryData.id };
      }

      console.error('[VolcArk] Video API Error:', response.status, errorText);
      throw new Error(`VolcEngine Ark Video API Error: ${response.status} - ${errorText}`);
    }
    
    const data: VolcVideoTaskResponse = await response.json();
    
    // Check for errors
    if (data.error) {
      throw new Error(`VolcEngine Ark Error: ${data.error.code} - ${data.error.message}`);
    }
    
    if (!data.id) {
      throw new Error('No task ID returned from VolcEngine Ark');
    }
    
    return {
      taskId: data.id,
    };
  } catch (error) {
    console.error('[VolcArk] Video task creation failed:', error);
    throw error;
  }
}

/**
 * Query video generation task status
 * GET /api/v3/contents/generations/tasks/{id}
 */
export async function queryVolcVideoTask(
  taskId: string,
  settings: AppSettings
): Promise<VeoTaskQueryResponse> {
  const apiKey = settings.volcArkApiKey;
  
  if (!apiKey) {
    throw new Error('VolcEngine Ark API Key not configured');
  }
  
  try {
    // Use proxy server to bypass CORS
    const proxyUrl = getProxyUrl(settings);
    const useProxy = await isProxyAvailable(settings);
    
    let response: Response;
    
    if (useProxy) {
      response = await fetch(`${proxyUrl}/api/volc/video/query/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    } else {
      response = await fetch(`${ARK_BASE_URL}/api/v3/contents/generations/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Query failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Map VolcEngine Ark status to VeoTaskStatus
    const statusMap: Record<string, VeoTaskQueryResponse['status']> = {
      'queued': 'NOT_START',
      'running': 'IN_PROGRESS',
      'succeeded': 'SUCCESS',
      'failed': 'FAILURE',
      'expired': 'FAILURE',
      'cancelled': 'FAILURE',
    };
    
    const mappedStatus = statusMap[data.status] || 'NOT_START';
    
    return {
      task_id: data.id || taskId,
      platform: 'volcengine-ark',
      action: 'video_generation',
      status: mappedStatus,
      fail_reason: data.error?.message || data.error?.code,
      submit_time: data.created_at,
      start_time: data.created_at,
      finish_time: data.updated_at,
      progress: data.status === 'running' ? '50%' : undefined,  // VolcEngine doesn't provide exact progress
      data: data.content?.video_url ? {
        output: data.content.video_url,
      } : undefined,
    };
  } catch (error) {
    console.error('[VolcArk] Query task failed:', error);
    throw error;
  }
}

/**
 * Delete or cancel video generation task
 * DELETE /api/v3/contents/generations/tasks/{id}
 */
export async function deleteVolcVideoTask(
  taskId: string,
  settings: AppSettings
): Promise<void> {
  const apiKey = settings.volcArkApiKey;
  
  if (!apiKey) {
    throw new Error('VolcEngine Ark API Key not configured');
  }
  
  try {
    const response = await fetch(`${ARK_BASE_URL}/api/v3/contents/generations/tasks/${taskId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Delete failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('[VolcArk] Delete task failed:', error);
    throw error;
  }
}

