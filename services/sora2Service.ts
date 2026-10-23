/**
 * Sora2 Video Generation Service
 * Supports OpenAI Sora2 API via shenma proxy for image-to-video generation
 * 
 * API Endpoint: POST /v2/videos/generations
 * Query Endpoint: GET /v2/videos/generations/{task_id}
 */

import { AppSettings, VeoModel } from '../types';
import type { VeoGenerationResponse, VeoTaskQueryResponse } from './veoService';

// Sora2 API model types
type Sora2ApiModel = 'sora-2' | 'sora-2-pro';

// Model configurations for Sora2
export const SORA2_MODELS: { id: VeoModel; name: string; desc: string; apiModel: Sora2ApiModel }[] = [
  { id: 'sora2', name: 'Sora 2', desc: '高质量视频生成 (10s/15s)', apiModel: 'sora-2' },
  { id: 'sora2-turbo', name: 'Sora 2 Pro', desc: '支持HD、25s时长', apiModel: 'sora-2-pro' },
];

/**
 * Convert VeoModel to Sora2 API model string
 */
function toSora2ApiModel(model: VeoModel): Sora2ApiModel {
  if (model === 'sora2-turbo') return 'sora-2-pro';
  if (model === 'sora2') return 'sora-2';
  // Fallback to sora-2 for any other model
  return 'sora-2';
}

/**
 * Normalize base URL - handles URLs that include path like /v2/videos/generations
 * Input: https://api.whatai.cc/v2/videos/generations
 * Output: https://api.whatai.cc
 */
function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return 'https://api.whatai.cc';
  
  // Remove /v2/videos/generations if present
  let normalized = baseUrl
    .replace(/\/v2\/videos\/generations\/?$/, '')
    .replace(/\/v2\/.*$/, '')
    .replace(/\/v1\/.*$/, '')
    .replace(/\/$/, '');
  
  return normalized || 'https://api.whatai.cc';
}

/**
 * Check if a model is a Sora2 model
 */
export function isSora2Model(model: VeoModel): boolean {
  return model === 'sora2' || model === 'sora2-turbo';
}

/**
 * Sora2 generation request body
 * According to official API spec: images is an array of strings (URLs or base64)
 */
interface Sora2GenerationRequest {
  prompt: string;
  model: Sora2ApiModel;
  aspect_ratio: '16:9' | '9:16';
  hd?: boolean;
  duration?: '10' | '15' | '25';
  images: string[];  // Array of image URLs or base64 strings
  watermark?: boolean;
  private?: boolean;
  notify_hook?: string;
}

/**
 * Generate video using Sora2 API
 * POST /v2/videos/generations
 */
export async function generateSora2Video(
  prompt: string,
  imageUrls: string[],
  settings: AppSettings,
  model: VeoModel,
  aspectRatio: '16:9' | '9:16' = '16:9',
): Promise<VeoGenerationResponse> {
  // Use Sora2-specific settings, fallback to Veo/general settings
  const apiKey = settings.sora2ApiKey || settings.veoApiKey || settings.apiKey;
  const rawBaseUrl = settings.sora2ApiBaseUrl || 'https://api.whatai.cc/v2/videos/generations';
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  
  if (!apiKey) {
    throw new Error('Sora2 API Key not configured');
  }
  
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('At least one reference image is required');
  }
  
  // Build request body according to Sora2 API spec
  // images should be an array of strings (URLs or base64), not objects
  const requestBody: Sora2GenerationRequest = {
    prompt,
    model: toSora2ApiModel(model),
    aspect_ratio: aspectRatio,
    images: imageUrls,  // Direct string array (URLs or base64)
  };
  
  // Add optional parameters (only for sora-2-pro)
  const apiModel = toSora2ApiModel(model);
  if (apiModel === 'sora-2-pro') {
    if (settings.sora2Hd !== undefined) {
      requestBody.hd = settings.sora2Hd;
    }
    if (settings.sora2Duration) {
      requestBody.duration = settings.sora2Duration;
    }
  } else {
    // sora-2 only supports 10s and 15s
    if (settings.sora2Duration && settings.sora2Duration !== '25') {
      requestBody.duration = settings.sora2Duration;
    }
  }
  
  // Add watermark, private, notify_hook if set
  if (settings.sora2Watermark !== undefined) {
    requestBody.watermark = settings.sora2Watermark;
  }
  if (settings.sora2Private !== undefined) {
    requestBody.private = settings.sora2Private;
  }
  if (settings.sora2NotifyHook) {
    requestBody.notify_hook = settings.sora2NotifyHook;
  }
  
  console.log('[Sora2] Sending request to:', `${baseUrl}/v2/videos/generations`);
  console.log('[Sora2] Request body:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sora2] API Error:', response.status, errorText);
      throw new Error(`Sora2 API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Sora2] POST response:', JSON.stringify(data, null, 2));
    
    // Handle different response formats (same as Veo)
    
    // 1. If status is already SUCCESS with video output
    if (data.status === 'SUCCESS' && data.data?.output) {
      console.log('[Sora2] Direct success with video URL:', data.data.output);
      return { videoUrl: data.data.output };
    }
    
    // 2. If we have video URL directly
    if (data.video_url || data.videoUrl) {
      console.log('[Sora2] Direct video URL:', data.video_url || data.videoUrl);
      return { videoUrl: data.video_url || data.videoUrl };
    }
    
    // 3. If we got a task_id, return it for polling
    if (data.task_id || data.taskId) {
      const taskId = data.task_id || data.taskId;
      console.log('[Sora2] Got task_id for polling:', taskId, 'status:', data.status);
      return { taskId };
    }
    
    // 4. Error response
    if (data.error) {
      console.error('[Sora2] Error response:', data.error);
      return { error: data.error };
    }
    
    console.warn('[Sora2] Unknown response format:', data);
    return data;
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sora2] Generation failed:', message);
    return { error: message };
  }
}

/**
 * Query Sora2 video generation task status
 * GET /v2/videos/generations/{task_id}
 * 
 * Status enums:
 * - NOT_START: 未开始
 * - IN_PROGRESS: 正在执行
 * - SUCCESS: 执行完成
 * - FAILURE: 失败
 */
export async function querySora2Task(
  taskId: string,
  settings: AppSettings,
): Promise<VeoTaskQueryResponse> {
  const apiKey = settings.sora2ApiKey || settings.veoApiKey || settings.apiKey;
  const rawBaseUrl = settings.sora2ApiBaseUrl || 'https://api.whatai.cc/v2/videos/generations';
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  
  if (!apiKey) {
    throw new Error('Sora2 API Key not configured');
  }
  
  console.log('[Sora2] Querying task:', `${baseUrl}/v2/videos/generations/${taskId}`);
  
  const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Sora2] Query failed:', response.status, errorText);
    throw new Error(`Sora2 query failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[Sora2] Query response:', JSON.stringify(data, null, 2));
  
  return data;
}

/**
 * Get Sora2 model info by ID
 */
export function getSora2ModelInfo(modelId: VeoModel) {
  return SORA2_MODELS.find(m => m.id === modelId) || SORA2_MODELS[0];
}

