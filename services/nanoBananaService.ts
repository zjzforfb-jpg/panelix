/**
 * Nano-Banana Image Generation Service
 * 
 * Supports text-to-image and image-to-image with multipart/form-data
 * API Endpoint: https://api.whatai.cc/v1/images/edits
 * 
 * Models:
 * - nano-banana: Basic model
 * - nano-banana-2: Supports image_size (1K/2K/4K)
 * - nano-banana-hd: High quality 4K
 * 
 * Features:
 * - Text-to-image (no reference image)
 * - Image-to-image (with reference images)
 * - Multiple aspect ratios
 * - Variable resolution (nano-banana-2 only)
 */

import { AppSettings } from '../types';

// ============================================================================
// Types
// ============================================================================

export type NanoBananaModel = 'nano-banana' | 'nano-banana-2' | 'nano-banana-hd';

export type NanoBananaAspectRatio = 
  | '1:1' | '2:3' | '3:2' | '3:4' | '4:3' 
  | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export type NanoBananaImageSize = '1K' | '2K' | '4K';

export interface NanoBananaConfig {
  prompt: string;
  model?: NanoBananaModel;
  referenceImages?: Blob[];  // Optional reference images for img2img
  aspectRatio?: NanoBananaAspectRatio;
  imageSize?: NanoBananaImageSize;  // Only for nano-banana-2
  responseFormat?: 'url' | 'b64_json';
}

export interface NanoBananaResponse {
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

// Image-to-image endpoint (multipart/form-data with reference images)
const NANO_BANANA_IMG2IMG_URL = 'https://api.whatai.cc/v1/images/edits';

// Text-to-image endpoint (JSON body, no reference images required)
const NANO_BANANA_TXT2IMG_URL = 'https://api.whatai.cc/v1/images/generations';

// Model presets for settings
export const NANO_BANANA_MODELS = [
  { id: 'nano-banana', name: 'Nano-Banana', desc: '🍌 基础版，支持图生图' },
  { id: 'nano-banana-2-1k', name: 'Nano-Banana 2 (1K)', desc: '🍌 1K分辨率' },
  { id: 'nano-banana-2-2k', name: 'Nano-Banana 2 (2K)', desc: '🍌 2K分辨率，推荐' },
  { id: 'nano-banana-2-4k', name: 'Nano-Banana 2 (4K)', desc: '🍌 4K超高清' },
  { id: 'nano-banana-hd', name: 'Nano-Banana HD', desc: '🍌 高清版4K画质' },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if model is a nano-banana variant
 */
export function isNanoBananaModel(model: string): boolean {
  return model.startsWith('nano-banana');
}

/**
 * Parse model ID to get actual model name and config
 */
export function parseNanoBananaModelId(modelId: string): {
  model: NanoBananaModel;
  imageSize?: NanoBananaImageSize;
} {
  switch (modelId) {
    case 'nano-banana-2-4k':
      return { model: 'nano-banana-2', imageSize: '4K' };
    case 'nano-banana-2-2k':
      return { model: 'nano-banana-2', imageSize: '2K' };
    case 'nano-banana-2-1k':
      return { model: 'nano-banana-2', imageSize: '1K' };
    case 'nano-banana-hd':
      return { model: 'nano-banana-hd' };
    case 'nano-banana':
    default:
      return { model: 'nano-banana' };
  }
}

/**
 * Convert aspect ratio string to nano-banana format
 */
export function convertAspectRatio(ratio: string): NanoBananaAspectRatio {
  // Handle common formats
  const ratioMap: Record<string, NanoBananaAspectRatio> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '1:1': '1:1',
    '4:3': '4:3',
    '3:4': '3:4',
    '3:2': '3:2',
    '2:3': '2:3',
  };
  return ratioMap[ratio] || '16:9';
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate image using Nano-Banana API (Image-to-Image)
 * Uses multipart/form-data with reference images
 * Endpoint: /v1/images/edits
 * 
 * @param config Generation config
 * @param settings App settings (for API key)
 * @returns Image URL
 */
export async function generateNanoBananaImage(
  config: NanoBananaConfig,
  settings: AppSettings
): Promise<string> {
  const apiKey = settings.apiKey;
  
  if (!apiKey) {
    throw new Error('请在设置中配置 API Key');
  }
  
  // If no reference images, use text-to-image endpoint
  const hasReferenceImages = config.referenceImages && config.referenceImages.length > 0;
  
  if (!hasReferenceImages) {
    return generateNanoBananaTextToImage(config, settings);
  }
  
  // Build FormData (multipart/form-data) for img2img
  const formData = new FormData();
  formData.append('model', config.model || 'nano-banana-2');
  formData.append('prompt', config.prompt);
  formData.append('response_format', config.responseFormat || 'url');
  
  // Add aspect ratio if specified
  if (config.aspectRatio) {
    formData.append('aspect_ratio', config.aspectRatio);
  }
  
  // Add image size for nano-banana-2
  if (config.imageSize && config.model === 'nano-banana-2') {
    formData.append('image_size', config.imageSize);
  }
  
  // Add reference images for img2img
  for (const blob of config.referenceImages!) {
    formData.append('image', blob);
  }
  
  console.log('[NanoBanana] Generating img2img:', {
    model: config.model,
    promptLength: config.prompt.length,
    aspectRatio: config.aspectRatio,
    imageSize: config.imageSize,
    refImageCount: config.referenceImages?.length || 0,
    endpoint: 'edits',
  });
  
  try {
    const response = await fetch(NANO_BANANA_IMG2IMG_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Note: Don't set Content-Type for FormData, browser will set it with boundary
      },
      body: formData,
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Nano-Banana API Error: ${response.status} - ${err}`);
    }
    
    const data: NanoBananaResponse = await response.json();
    
    // Parse response - expect DALL-E compatible format
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0];
      if (item.url) {
        console.log('[NanoBanana] Generated image URL:', item.url.substring(0, 50) + '...');
        return item.url;
      }
      if (item.b64_json) {
        console.log('[NanoBanana] Generated base64 image');
        return `data:image/png;base64,${item.b64_json}`;
      }
    }
    
    throw new Error('Could not parse image URL from Nano-Banana response');
  } catch (e: unknown) {
    const error = e as Error;
    console.error('[NanoBanana] Img2Img generation failed:', error);
    throw new Error(`Nano-Banana Generation Failed: ${error.message}`);
  }
}

/**
 * Generate image using Nano-Banana API (Text-to-Image)
 * Uses JSON body without reference images
 * Endpoint: /v1/images/generations
 * 
 * @param config Generation config (referenceImages will be ignored)
 * @param settings App settings (for API key)
 * @returns Image URL
 */
export async function generateNanoBananaTextToImage(
  config: NanoBananaConfig,
  settings: AppSettings
): Promise<string> {
  const apiKey = settings.apiKey;
  
  if (!apiKey) {
    throw new Error('请在设置中配置 API Key');
  }
  
  // Build JSON body for text-to-image
  const requestBody: Record<string, string | string[]> = {
    model: config.model || 'nano-banana-2',
    prompt: config.prompt,
    response_format: config.responseFormat || 'url',
  };
  
  // Add aspect ratio if specified
  if (config.aspectRatio) {
    requestBody.aspect_ratio = config.aspectRatio;
  }
  
  // Add image size for nano-banana-2
  if (config.imageSize && config.model === 'nano-banana-2') {
    requestBody.image_size = config.imageSize;
  }
  
  console.log('[NanoBanana] Generating txt2img:', {
    model: config.model,
    promptLength: config.prompt.length,
    aspectRatio: config.aspectRatio,
    imageSize: config.imageSize,
    endpoint: 'generations',
  });
  
  try {
    const response = await fetch(NANO_BANANA_TXT2IMG_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Nano-Banana API Error: ${response.status} - ${err}`);
    }
    
    const data: NanoBananaResponse = await response.json();
    
    // Parse response - expect DALL-E compatible format
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0];
      if (item.url) {
        console.log('[NanoBanana] Generated image URL:', item.url.substring(0, 50) + '...');
        return item.url;
      }
      if (item.b64_json) {
        console.log('[NanoBanana] Generated base64 image');
        return `data:image/png;base64,${item.b64_json}`;
      }
    }
    
    throw new Error('Could not parse image URL from Nano-Banana response');
  } catch (e: unknown) {
    const error = e as Error;
    console.error('[NanoBanana] Txt2Img generation failed:', error);
    throw new Error(`Nano-Banana Generation Failed: ${error.message}`);
  }
}

/**
 * Generate image with reference images (image-to-image)
 * Convenience wrapper for img2img generation
 * Uses settings.imageModel for model selection
 */
export async function generateNanoBananaImg2Img(
  prompt: string,
  referenceImages: Blob[],
  settings: AppSettings,
  options?: {
    modelId?: string;
    aspectRatio?: NanoBananaAspectRatio;
  }
): Promise<string> {
  // Use imageModel for img2img (图生图)
  const { model, imageSize } = parseNanoBananaModelId(options?.modelId || settings.imageModel);
  
  return generateNanoBananaImage({
    prompt,
    model,
    imageSize,
    referenceImages,
    aspectRatio: options?.aspectRatio || '16:9',
    responseFormat: 'url',
  }, settings);
}

/**
 * Generate image without reference (text-to-image)
 * Convenience wrapper for txt2img generation
 * Uses settings.txt2imgModel for model selection (falls back to imageModel)
 */
export async function generateNanoBananaTxt2Img(
  prompt: string,
  settings: AppSettings,
  options?: {
    modelId?: string;
    aspectRatio?: NanoBananaAspectRatio;
  }
): Promise<string> {
  // Use txt2imgModel for txt2img (文生图), fallback to imageModel
  const selectedModel = options?.modelId || settings.txt2imgModel || settings.imageModel;
  const { model, imageSize } = parseNanoBananaModelId(selectedModel);
  
  return generateNanoBananaTextToImage({
    prompt,
    model,
    imageSize,
    aspectRatio: options?.aspectRatio || '16:9',
    responseFormat: 'url',
  }, settings);
}

