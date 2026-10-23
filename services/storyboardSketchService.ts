/**
 * Storyboard Sketch Service
 * 
 * Generates action flow sketches from storyboard frames
 * and composes them with asset references for video generation.
 * 
 * Layout: Assets (top) + Action Sketch (middle) + Info (bottom)
 */

import { Asset, ScriptPanel, Project, AppSettings, AssetType } from '../types';
import { CameraMove, CAMERA_MOVES, inferMood } from './videoPromptBuilder';

// ============================================================================
// Types
// ============================================================================

export interface SketchConfig {
  // Shot info
  shots: Array<{
    imageUrl: string;
    shotType: string;
    duration: number;
    description: string;
  }>;
  
  // Camera movement between shots
  cameraMoves: CameraMove[];
  
  // Assets
  assets: Array<{
    asset: Asset;
    imageUrl?: string;
  }>;
  
  // Style and context
  style?: string;
  mood?: string;
  totalDuration: number;
}

export interface CompositeReferenceConfig {
  width: number;
  height: number;
  
  // Layout ratios
  assetZoneHeight: number;    // e.g., 0.25 (25%)
  sketchZoneHeight: number;   // e.g., 0.55 (55%)
  infoZoneHeight: number;     // e.g., 0.20 (20%)
  
  // Style
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: CompositeReferenceConfig = {
  width: 1920,
  height: 1080,
  assetZoneHeight: 0.25,
  sketchZoneHeight: 0.55,
  infoZoneHeight: 0.20,
  backgroundColor: '#0A0A0A',
  borderColor: '#333333',
  textColor: '#E5E7EB',
  accentColor: '#3B82F6',
};

const TYPE_COLORS: Record<AssetType, string> = {
  character: '#3B82F6', // blue
  scene: '#10B981',     // green
  item: '#A855F7',      // purple
};

const TYPE_ICONS: Record<AssetType, string> = {
  character: '👤',
  scene: '🏞️',
  item: '📦',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, 
  width: number, height: number, 
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw image with cover fit
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number,
  width: number, height: number
) {
  const imgRatio = img.width / img.height;
  const targetRatio = width / height;
  
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  
  if (imgRatio > targetRatio) {
    // Image is wider, crop sides
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    // Image is taller, crop top/bottom
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  
  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
}

/**
 * Get camera move arrow symbol
 */
function getCameraMoveArrow(move: CameraMove): string {
  const arrows: Record<string, string> = {
    'static': '●',
    'pan_left': '←',
    'pan_right': '→',
    'pan_up': '↑',
    'pan_down': '↓',
    'zoom_in': '⊕',
    'zoom_out': '⊖',
    'dolly_in': '⇢',
    'dolly_out': '⇠',
    'orbit_left': '↺',
    'orbit_right': '↻',
    'crane_up': '⤴',
    'crane_down': '⤵',
    'follow': '➤',
    'handheld': '〰',
  };
  return arrows[move] || '→';
}

/**
 * Get camera move label in Chinese
 */
function getCameraMoveLabelCN(move: CameraMove): string {
  const cam = CAMERA_MOVES.find(c => c.value === move);
  return cam?.labelCN || move;
}

// ============================================================================
// Main Composition Function
// ============================================================================

/**
 * Generate composite reference image with assets + action sketch + info
 */
export async function generateCompositeReference(
  sketchConfig: SketchConfig,
  config: Partial<CompositeReferenceConfig> = {}
): Promise<Blob> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { width, height } = cfg;
  
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  
  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Fill background
  ctx.fillStyle = cfg.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Calculate zone heights
  const assetZoneH = height * cfg.assetZoneHeight;
  const sketchZoneH = height * cfg.sketchZoneHeight;
  const infoZoneH = height * cfg.infoZoneHeight;
  
  // Draw zones
  await drawAssetZone(ctx, sketchConfig.assets, 0, 0, width, assetZoneH, cfg);
  await drawSketchZone(ctx, sketchConfig, 0, assetZoneH, width, sketchZoneH, cfg);
  drawInfoZone(ctx, sketchConfig, 0, assetZoneH + sketchZoneH, width, infoZoneH, cfg);
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Draw asset reference zone (top)
 */
async function drawAssetZone(
  ctx: CanvasRenderingContext2D,
  assets: SketchConfig['assets'],
  x: number, y: number,
  width: number, height: number,
  cfg: CompositeReferenceConfig
) {
  const padding = 20;
  const labelHeight = 30;
  
  // Zone label
  ctx.fillStyle = '#6B7280';
  ctx.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx.fillText('🎨 资产参考 ASSET REFERENCES', x + padding, y + 25);
  
  // Calculate card layout
  const availableWidth = width - padding * 2;
  const cardCount = Math.min(assets.length, 6);
  const cardWidth = Math.min(150, (availableWidth - (cardCount - 1) * 15) / cardCount);
  const cardHeight = height - labelHeight - padding * 2;
  const startX = x + (width - (cardCount * cardWidth + (cardCount - 1) * 15)) / 2;
  
  // Draw asset cards
  for (let i = 0; i < cardCount; i++) {
    const { asset, imageUrl } = assets[i];
    const cardX = startX + i * (cardWidth + 15);
    const cardY = y + labelHeight + padding;
    
    // Card background
    ctx.fillStyle = '#1A1A1A';
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 8);
    ctx.fill();
    
    // Type-colored border
    ctx.strokeStyle = TYPE_COLORS[asset.type];
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Image
    const imgHeight = cardHeight - 35;
    if (imageUrl) {
      try {
        const img = await loadImage(imageUrl);
        ctx.save();
        roundRect(ctx, cardX + 5, cardY + 5, cardWidth - 10, imgHeight - 5, 6);
        ctx.clip();
        drawImageCover(ctx, img, cardX + 5, cardY + 5, cardWidth - 10, imgHeight - 5);
        ctx.restore();
      } catch (e) {
        // Draw placeholder
        ctx.fillStyle = '#2A2A2A';
        roundRect(ctx, cardX + 5, cardY + 5, cardWidth - 10, imgHeight - 5, 6);
        ctx.fill();
        ctx.fillStyle = '#555';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(TYPE_ICONS[asset.type], cardX + cardWidth / 2, cardY + imgHeight / 2);
        ctx.textAlign = 'left';
      }
    }
    
    // Name label
    ctx.fillStyle = cfg.textColor;
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = `${TYPE_ICONS[asset.type]} ${asset.name}`;
    ctx.fillText(label, cardX + cardWidth / 2, cardY + cardHeight - 10);
    ctx.textAlign = 'left';
  }
}

/**
 * Draw action sketch zone (middle) - shows shot sequence with camera movement arrows
 */
async function drawSketchZone(
  ctx: CanvasRenderingContext2D,
  sketchConfig: SketchConfig,
  x: number, y: number,
  width: number, height: number,
  cfg: CompositeReferenceConfig
) {
  const padding = 20;
  const labelHeight = 30;
  
  // Zone label
  ctx.fillStyle = '#6B7280';
  ctx.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx.fillText('🎬 动作流程 ACTION FLOW', x + padding, y + 25);
  
  // Calculate frame layout
  const shots = sketchConfig.shots;
  const frameCount = Math.min(shots.length, 3);
  const arrowCount = frameCount - 1;
  const arrowWidth = 80;
  const availableWidth = width - padding * 2 - arrowWidth * arrowCount;
  const frameWidth = Math.min(450, availableWidth / frameCount);
  const frameHeight = height - labelHeight - padding * 2 - 60; // Leave space for labels
  
  const totalFramesWidth = frameCount * frameWidth + arrowCount * arrowWidth;
  const startX = x + (width - totalFramesWidth) / 2;
  const frameY = y + labelHeight + padding;
  
  // Draw frames and arrows
  for (let i = 0; i < frameCount; i++) {
    const shot = shots[i];
    const frameX = startX + i * (frameWidth + arrowWidth);
    
    // Frame border with gradient effect
    const gradient = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameHeight);
    gradient.addColorStop(0, '#2A2A2A');
    gradient.addColorStop(1, '#1A1A1A');
    ctx.fillStyle = gradient;
    roundRect(ctx, frameX, frameY, frameWidth, frameHeight, 12);
    ctx.fill();
    
    // Frame border
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Shot image
    if (shot.imageUrl) {
      try {
        const img = await loadImage(shot.imageUrl);
        ctx.save();
        roundRect(ctx, frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16, 8);
        ctx.clip();
        drawImageCover(ctx, img, frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16);
        ctx.restore();
        
        // Semi-transparent overlay for sketch effect (optional)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        roundRect(ctx, frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16, 8);
        ctx.fill();
      } catch (e) {
        // Placeholder
        ctx.fillStyle = '#2A2A2A';
        roundRect(ctx, frameX + 8, frameY + 8, frameWidth - 16, frameHeight - 16, 8);
        ctx.fill();
      }
    }
    
    // Shot number badge
    ctx.fillStyle = cfg.accentColor;
    roundRect(ctx, frameX + 15, frameY + 15, 32, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, frameX + 31, frameY + 37);
    ctx.textAlign = 'left';
    
    // Shot type label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    roundRect(ctx, frameX + 8, frameY + frameHeight - 40, frameWidth - 16, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${shot.shotType} · ${shot.duration}s`, frameX + frameWidth / 2, frameY + frameHeight - 18);
    ctx.textAlign = 'left';
    
    // Camera movement arrow (between frames)
    if (i < frameCount - 1) {
      const arrowX = frameX + frameWidth + arrowWidth / 2;
      const arrowY = frameY + frameHeight / 2;
      const cameraMove = sketchConfig.cameraMoves[i] || 'static';
      
      // Arrow background circle
      ctx.fillStyle = '#252525';
      ctx.beginPath();
      ctx.arc(arrowX, arrowY, 30, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = cfg.accentColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Arrow symbol
      ctx.fillStyle = cfg.accentColor;
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getCameraMoveArrow(cameraMove), arrowX, arrowY);
      
      // Camera move label
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(getCameraMoveLabelCN(cameraMove), arrowX, arrowY + 45);
      
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
  
  // Shot descriptions at bottom
  const descY = frameY + frameHeight + 15;
  ctx.fillStyle = '#6B7280';
  ctx.font = '11px Inter, system-ui, sans-serif';
  
  for (let i = 0; i < Math.min(frameCount, 3); i++) {
    const shot = shots[i];
    const frameX = startX + i * (frameWidth + arrowWidth);
    const desc = shot.description.length > 40 
      ? shot.description.substring(0, 40) + '...' 
      : shot.description;
    
    ctx.textAlign = 'center';
    ctx.fillText(desc, frameX + frameWidth / 2, descY);
  }
  ctx.textAlign = 'left';
}

/**
 * Draw info zone (bottom)
 */
function drawInfoZone(
  ctx: CanvasRenderingContext2D,
  sketchConfig: SketchConfig,
  x: number, y: number,
  width: number, height: number,
  cfg: CompositeReferenceConfig
) {
  const padding = 20;
  
  // Zone background
  ctx.fillStyle = '#111111';
  ctx.fillRect(x, y, width, height);
  
  // Top border
  ctx.strokeStyle = cfg.borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  
  // Zone label
  ctx.fillStyle = '#6B7280';
  ctx.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx.fillText('📝 场景信息 SCENE INFO', x + padding, y + 25);
  
  // Info tags
  const tagY = y + 55;
  const tags = [
    { icon: '🎨', label: '风格', value: sketchConfig.style || '默认' },
    { icon: '🎭', label: '氛围', value: sketchConfig.mood || '日常' },
    { icon: '⏱️', label: '时长', value: `${sketchConfig.totalDuration.toFixed(1)}s` },
    { icon: '🎬', label: '镜头', value: `${sketchConfig.shots.length} 个` },
  ];
  
  let tagX = padding;
  tags.forEach(tag => {
    // Tag background
    ctx.fillStyle = '#1A1A1A';
    const tagWidth = ctx.measureText(`${tag.icon} ${tag.label}: ${tag.value}`).width + 24;
    roundRect(ctx, x + tagX, tagY, tagWidth, 28, 14);
    ctx.fill();
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Tag text
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText(`${tag.icon} ${tag.label}: `, x + tagX + 12, tagY + 18);
    
    ctx.fillStyle = cfg.textColor;
    const labelWidth = ctx.measureText(`${tag.icon} ${tag.label}: `).width;
    ctx.fillText(tag.value, x + tagX + 12 + labelWidth, tagY + 18);
    
    tagX += tagWidth + 15;
  });
  
  // Camera movement summary
  const moves = sketchConfig.cameraMoves.filter(m => m !== 'static');
  if (moves.length > 0) {
    const moveLabels = moves.map(m => getCameraMoveLabelCN(m)).join(' → ');
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(`📹 运镜: ${moveLabels}`, x + padding, tagY + 60);
  }
  
  // Tips at bottom right
  ctx.fillStyle = '#4B5563';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('适用于 Veo 3.1 / Sora 2 / 可灵等图生视频模型', x + width - padding, y + height - 15);
  ctx.textAlign = 'left';
}

// ============================================================================
// Build Config Helper
// ============================================================================

/**
 * Build sketch config from panel and project data
 */
export function buildSketchConfigFromPanel(
  panel: ScriptPanel,
  project: Project,
  shotUrls: string[],
  cameraMoves: CameraMove[],
  assetImages: Record<string, string>
): SketchConfig {
  // Extract visual descriptions
  const visualLines = panel.script_content
    ?.split('\n')
    .filter(l => l.trim().startsWith('▲'))
    .map(l => l.replace(/^▲/, '').trim()) || [];
  
  // Build shots
  const shotTypes = panel.shotTypes || ['Wide Shot', 'Medium Shot', 'Close-Up'];
  const shotDurations = panel.shotDurations || [3, 2.5, 2];
  
  const shots = shotUrls.map((url, idx) => ({
    imageUrl: url,
    shotType: shotTypes[idx] || 'Medium Shot',
    duration: shotDurations[idx] || 2,
    description: visualLines[idx] || '',
  }));
  
  // Get linked assets
  const linkedAssets = project.assets
    .filter(a => panel.relatedAssetIds?.includes(a.id))
    .sort((a, b) => {
      const order: Record<AssetType, number> = { character: 0, scene: 1, item: 2 };
      return order[a.type] - order[b.type];
    });
  
  const assets = linkedAssets.map(asset => ({
    asset,
    imageUrl: assetImages[asset.id],
  }));
  
  // Calculate total duration
  const totalDuration = shotDurations.reduce((sum, d) => sum + d, 0);
  
  return {
    shots,
    cameraMoves,
    assets,
    style: project.activeStyle?.name,
    mood: inferMood(panel.script_content || ''),
    totalDuration,
  };
}

export default {
  generateCompositeReference,
  buildSketchConfigFromPanel,
};

