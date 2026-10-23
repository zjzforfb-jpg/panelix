/**
 * Line Art Triptych Service
 * 
 * Generates a SINGLE image containing 3 sequential storyboard panels
 * using img2img with character, scene, and prop references.
 * 
 * Key difference: ONE API call generates ONE image with THREE panels,
 * not three separate images that are merged later.
 * 
 * Features:
 * - Multi-image reference (character + scene + props)
 * - Single API call for consistent 3-panel layout
 * - Line art style (black and white, no shading)
 * - Vertical layout (9:16 video friendly)
 */

import { Asset, ScriptPanel, Project, AppSettings } from '../types';
import { 
  generateNanoBananaImage, 
  isNanoBananaModel,
  parseNanoBananaModelId,
  type NanoBananaAspectRatio 
} from './nanoBananaService';

// ============================================================================
// Types
// ============================================================================

export interface LineArtTriptychConfig {
  panel: ScriptPanel;
  project: Project;
  settings: AppSettings;
  
  // Asset images (pre-loaded URLs or blobs)
  assetImages: Record<string, string>;
  
  // Generation options
  options?: {
    aspectRatio?: NanoBananaAspectRatio;
    style?: 'manga' | 'anime' | 'sketch' | 'minimal';
  };
}

export interface LineArtTriptychResult {
  imageUrl: string;
  imageBlob: Blob;
  prompt: string;
  visualLines: [string, string, string];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract visual lines (▲ lines) from script content
 */
function extractVisualLines(scriptContent: string | undefined): [string, string, string] {
  const lines = scriptContent?.split('\n')
    .filter(l => l.trim().startsWith('▲'))
    .map(l => l.replace(/^▲/, '').trim()) || [];
  
  return [
    lines[0] || '角色登场，建立场景',
    lines[1] || '动作发展，推进剧情',
    lines[2] || '情感高潮，镜头特写',
  ];
}

/**
 * Get linked assets from panel
 */
function getLinkedAssets(panel: ScriptPanel, project: Project): {
  characters: Asset[];
  scene: Asset | null;
  props: Asset[];
} {
  const linkedAssets = project.assets.filter(a => 
    panel.relatedAssetIds?.includes(a.id)
  );
  
  return {
    characters: linkedAssets.filter(a => a.type === 'character'),
    scene: linkedAssets.find(a => a.type === 'scene') || null,
    props: linkedAssets.filter(a => a.type === 'item'),
  };
}

/**
 * Load image URL and convert to Blob
 */
async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}

/**
 * Prepare reference images as Blobs
 */
async function prepareReferenceImages(
  characters: Asset[],
  scene: Asset | null,
  props: Asset[],
  assetImages: Record<string, string>
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  
  // Add character images (max 2 for better reference)
  for (const char of characters.slice(0, 2)) {
    const imageUrl = assetImages[char.id];
    if (imageUrl) {
      try {
        const blob = await urlToBlob(imageUrl);
        blobs.push(blob);
        console.log(`[LineArt] Added character reference: ${char.name}`);
      } catch (e) {
        console.warn(`Failed to load character image: ${char.name}`, e);
      }
    }
  }
  
  // Add scene image
  if (scene && assetImages[scene.id]) {
    try {
      const blob = await urlToBlob(assetImages[scene.id]);
      blobs.push(blob);
      console.log(`[LineArt] Added scene reference: ${scene.name}`);
    } catch (e) {
      console.warn('Failed to load scene image', e);
    }
  }
  
  // Add prop images (max 1)
  for (const prop of props.slice(0, 1)) {
    if (assetImages[prop.id]) {
      try {
        const blob = await urlToBlob(assetImages[prop.id]);
        blobs.push(blob);
        console.log(`[LineArt] Added prop reference: ${prop.name}`);
      } catch (e) {
        console.warn(`Failed to load prop image: ${prop.name}`, e);
      }
    }
  }
  
  return blobs;
}

/**
 * Build the prompt for generating a single image with 3 panels
 */
function buildTriptychPrompt(
  visualLines: [string, string, string],
  characters: Asset[],
  scene: Asset | null,
  props: Asset[],
  style: string = 'manga'
): string {
  const parts: string[] = [];
  
  // 1. Main instruction - generate 3-panel storyboard in ONE image
  parts.push('Generate a vertical 3-panel manga storyboard in a single image');
  parts.push('Three sequential comic panels stacked vertically');
  
  // 2. Character description for consistency
  if (characters.length > 0) {
    const charDescs = characters.map(c => {
      const desc = c.prompt || c.description || '';
      return `${c.name}: ${desc.substring(0, 80)}`;
    }).join('; ');
    parts.push(`[CHARACTERS: ${charDescs}]`);
    parts.push('Same character design in ALL three panels');
    parts.push('Consistent appearance, outfit, hairstyle across panels');
  }
  
  // 3. Scene description
  if (scene) {
    const sceneDesc = scene.prompt || scene.description || scene.name;
    parts.push(`[SCENE: ${sceneDesc}]`);
    parts.push('Same background setting in all panels');
  }
  
  // 4. Props
  if (props.length > 0) {
    parts.push(`[PROPS: ${props.map(p => p.name).join(', ')}]`);
  }
  
  // 5. THREE PANELS content - this is the key part
  parts.push('[THREE PANELS - TOP TO BOTTOM]');
  parts.push(`Panel 1 (Top - Wide Shot): ${visualLines[0]}`);
  parts.push(`Panel 2 (Middle - Medium Shot): ${visualLines[1]}`);
  parts.push(`Panel 3 (Bottom - Close-Up): ${visualLines[2]}`);
  
  // 6. Style modifiers
  const styleModifiers: Record<string, string[]> = {
    manga: [
      'manga storyboard style',
      'Japanese comic panel layout',
      'dynamic composition',
      'expressive linework',
    ],
    anime: [
      'anime keyframe style',
      'Japanese animation layout',
      'clean cel-shading lines',
    ],
    sketch: [
      'rough storyboard sketch',
      'loose pencil lines',
      'conceptual thumbnails',
    ],
    minimal: [
      'minimalist storyboard',
      'simple clean lines',
      'iconic style',
    ],
  };
  parts.push(...(styleModifiers[style] || styleModifiers.manga));
  
  // 7. Technical requirements for line art
  parts.push('black and white lineart only');
  parts.push('no color, no shading, no gradients');
  parts.push('clean precise lines');
  parts.push('white background');
  parts.push('clear panel borders/dividers between the three panels');
  parts.push('professional storyboard quality');
  
  // 8. CRITICAL: No text elements
  parts.push('NO TEXT, NO LETTERS, NO WORDS, NO DIALOGUE');
  parts.push('NO speech bubbles, NO captions, NO labels');
  parts.push('NO numbers, NO symbols, NO writing of any kind');
  parts.push('Pure visual storytelling without any text elements');
  parts.push('Silent manga style - images only');
  
  // 9. Layout emphasis
  parts.push('IMPORTANT: Single vertical image containing all 3 panels');
  parts.push('Panel 1 at top, Panel 2 in middle, Panel 3 at bottom');
  parts.push('Show clear action progression from top to bottom');
  parts.push('Character must look IDENTICAL in all three panels');
  
  return parts.join('. ') + '.';
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a single line art image containing 3 storyboard panels
 */
export async function generateLineArtTriptych(
  config: LineArtTriptychConfig,
  onProgress?: (status: string) => void
): Promise<LineArtTriptychResult> {
  const { panel, project, settings, assetImages, options = {} } = config;
  const { style = 'manga' } = options;
  
  // Check if model supports img2img
  if (!isNanoBananaModel(settings.imageModel)) {
    throw new Error('线稿生成需要使用 Nano-Banana 模型，请在设置中切换图像模型');
  }
  
  onProgress?.('提取剧本内容...');
  
  // Extract visual lines from script
  const visualLines = extractVisualLines(panel.script_content);
  console.log('[LineArt] Visual lines:', visualLines);
  
  // Get linked assets
  const { characters, scene, props } = getLinkedAssets(panel, project);
  console.log('[LineArt] Assets:', { 
    characters: characters.map(c => c.name), 
    scene: scene?.name, 
    props: props.map(p => p.name) 
  });
  
  // Prepare reference images
  onProgress?.('准备参考图...');
  const referenceImages = await prepareReferenceImages(
    characters, scene, props, assetImages
  );
  console.log(`[LineArt] Prepared ${referenceImages.length} reference images`);
  
  if (referenceImages.length === 0) {
    console.warn('[LineArt] No reference images available');
  }
  
  // Build the prompt for 3-panel generation
  const prompt = buildTriptychPrompt(
    visualLines,
    characters,
    scene,
    props,
    style
  );
  console.log('[LineArt] Prompt:', prompt.substring(0, 200) + '...');
  
  // Generate single image with 3 panels
  onProgress?.('生成三格分镜线稿...');
  
  const { model, imageSize } = parseNanoBananaModelId(settings.imageModel);
  
  try {
    const imageUrl = await generateNanoBananaImage({
      prompt,
      model,
      imageSize,
      referenceImages,
      aspectRatio: '9:16',  // Vertical for 3 stacked panels
      responseFormat: 'url',
    }, settings);
    
    console.log('[LineArt] Generated image URL:', imageUrl.substring(0, 50) + '...');
    
    // Fetch the image as blob
    onProgress?.('处理生成结果...');
    const response = await fetch(imageUrl);
    const imageBlob = await response.blob();
    
    onProgress?.('线稿三联画生成完成！');
    
    return {
      imageUrl,
      imageBlob,
      prompt,
      visualLines,
    };
  } catch (e: unknown) {
    const error = e as Error;
    console.error('[LineArt] Generation failed:', error);
    throw new Error(`线稿生成失败: ${error.message}`);
  }
}

/**
 * Check if line art generation is available
 */
export function isLineArtAvailable(settings: AppSettings): boolean {
  return isNanoBananaModel(settings.imageModel);
}

/**
 * Get line art availability message
 */
export function getLineArtAvailabilityMessage(settings: AppSettings): string {
  if (isLineArtAvailable(settings)) {
    return '✅ 可使用线稿生成（当前模型支持图生图）';
  }
  return '⚠️ 需要切换到 Nano-Banana 模型才能使用线稿生成';
}
