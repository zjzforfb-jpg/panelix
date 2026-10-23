/**
 * Veo Video Generation Service
 * Supports Google Veo API for image-to-video generation
 */

import { AppSettings, VeoModel } from '../types';

// Model configurations
export const VEO_MODELS: { id: VeoModel; name: string; desc: string; maxImages: number }[] = [
  { id: 'veo3.1', name: 'Veo 3.1', desc: '最新款，支持首尾帧，自带音频生成，性价比最高', maxImages: 2 },
  { id: 'veo3.1-pro', name: 'Veo 3.1 Pro', desc: '高质量模式，支持首尾帧，质量超高', maxImages: 2 },
  { id: 'veo3.1-components', name: 'Veo 3.1 Components', desc: '多图参考（1-3张）', maxImages: 3 },
  { id: 'veo3-pro-frames', name: 'Veo 3 Pro Frames', desc: '支持图生视频，最多1张首帧', maxImages: 1 },
  { id: 'veo3-fast-frames', name: 'Veo 3 Fast Frames', desc: '快速模式', maxImages: 2 },
  { id: 'veo2-fast-frames', name: 'Veo 2 Fast Frames', desc: '最多支持首尾帧2张', maxImages: 2 },
  { id: 'veo2-fast-components', name: 'Veo 2 Components', desc: '图片为视频中的元素（最多3张）', maxImages: 3 },
];

export interface VeoGenerationRequest {
  prompt: string;
  model: VeoModel;
  images: string[]; // URLs or base64
  aspectRatio?: '9:16' | '16:9';
  enhancePrompt?: boolean;
}

export interface VeoGenerationResponse {
  videoUrl?: string;
  error?: string;
  taskId?: string;
}

// Task status types from API
export type VeoTaskStatus = 'NOT_START' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

export interface VeoTaskQueryResponse {
  task_id: string;
  platform: string;
  action: string;
  status: VeoTaskStatus;
  fail_reason?: string;
  submit_time?: number;
  start_time?: number;
  finish_time?: number;
  progress?: string; // e.g. "100%"
  data?: {
    output?: string; // Video URL
  };
}

/**
 * Clean base URL - remove path suffixes like /v1/chat/completions
 */
function cleanBaseUrl(url: string): string {
  return url
    .replace(/\/v1\/.*$/, '')   // Remove /v1/... paths
    .replace(/\/v2\/.*$/, '')   // Remove /v2/... paths
    .replace(/\/$/, '');        // Remove trailing slash
}

/**
 * Generate video using Veo API
 */
export async function generateVideo(
  request: VeoGenerationRequest,
  settings: AppSettings
): Promise<VeoGenerationResponse> {
  const apiKey = settings.veoApiKey || settings.apiKey;
  const rawBaseUrl = settings.veoApiBaseUrl || settings.apiBaseUrl || 'https://api.shenma.ai';
  const baseUrl = cleanBaseUrl(rawBaseUrl);
  
  if (!apiKey) {
    throw new Error('Video API Key not configured');
  }
  
  if (!request.images || request.images.length === 0) {
    throw new Error('At least one reference image is required');
  }
  
  try {
    const response = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model,
        images: request.images,
        aspect_ratio: request.aspectRatio,
        enhance_prompt: request.enhancePrompt ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Veo API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log('[Veo] POST response:', JSON.stringify(data, null, 2));
    
    // Handle different response formats
    
    // 1. If status is already SUCCESS with video output (some APIs return complete result)
    if (data.status === 'SUCCESS' && data.data?.output) {
      console.log('[Veo] Direct success with video URL:', data.data.output);
      return { videoUrl: data.data.output };
    }
    
    // 2. If we have video URL directly
    if (data.video_url || data.videoUrl) {
      console.log('[Veo] Direct video URL:', data.video_url || data.videoUrl);
      return { videoUrl: data.video_url || data.videoUrl };
    }
    
    // 3. If we got a task_id, return it for polling (status could be NOT_START, IN_PROGRESS)
    if (data.task_id || data.taskId) {
      const taskId = data.task_id || data.taskId;
      console.log('[Veo] Got task_id for polling:', taskId, 'status:', data.status);
      return { taskId };
    }
    
    // 4. Error response
    if (data.error) {
      console.error('[Veo] Error response:', data.error);
      return { error: data.error };
    }
    
    console.warn('[Veo] Unknown response format:', data);
    return data;
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Veo generation failed:', message);
    return { error: message };
  }
}

/**
 * Build video generation prompt from panel context
 */
export function buildVideoPrompt(
  scriptContext: string,
  shotDescriptions: string[],
  shotTypes: string[],
  shotDurations: number[],
  characterNames: string[],
  sceneName: string,
  mood: string
): string {
  const parts: string[] = [];
  
  // Scene and character context
  if (sceneName) {
    parts.push(`Scene: ${sceneName}`);
  }
  if (characterNames.length > 0) {
    parts.push(`Characters: ${characterNames.join(', ')}`);
  }
  if (mood) {
    parts.push(`Mood: ${mood}`);
  }
  
  // Shot sequence
  const shotSequence = shotDescriptions.map((desc, idx) => {
    const type = shotTypes[idx] || 'medium shot';
    const duration = shotDurations[idx] || 2;
    return `Shot ${idx + 1} (${type}, ${duration}s): ${desc}`;
  }).join(' → ');
  
  if (shotSequence) {
    parts.push(`Action Sequence: ${shotSequence}`);
  }
  
  // Script context (abbreviated)
  if (scriptContext && scriptContext.length > 0) {
    const abbreviated = scriptContext.substring(0, 200);
    parts.push(`Context: ${abbreviated}${scriptContext.length > 200 ? '...' : ''}`);
  }
  
  return parts.join('\n');
}

/**
 * Convert image blob to base64 for API
 */
export async function imageToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get model info by ID
 */
export function getModelInfo(modelId: VeoModel) {
  return VEO_MODELS.find(m => m.id === modelId) || VEO_MODELS[0];
}

/**
 * Query video generation task status
 * GET /v2/videos/generations/{task_id}
 */
export async function queryVideoTask(
  taskId: string,
  settings: AppSettings
): Promise<VeoTaskQueryResponse> {
  const apiKey = settings.veoApiKey || settings.apiKey;
  const rawBaseUrl = settings.veoApiBaseUrl || settings.apiBaseUrl || 'https://api.shenma.ai';
  const baseUrl = cleanBaseUrl(rawBaseUrl);
  
  if (!apiKey) {
    throw new Error('Video API Key not configured');
  }
  
  const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}
