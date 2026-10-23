/**
 * Video Reference Image Builder
 * 
 * Combines line art triptych with assets into a single reference image
 * for video generation. Uses smart layout based on content.
 * 
 * Layout Modes:
 * 1. lineArtAndAssets (default): Line art + assets grid
 * 2. microMontage: Previous panel strip + triptych shots + assets
 * 
 * Layout Strategy:
 * - Vertical line art (9:16): Line art left (35%), assets right (65%)
 * - Horizontal line art (16:9): Line art top (55%), assets bottom (45%)
 * - microMontage: Prev strip (8%) + Triptych (52%) + Assets (40%)
 */

import { ScriptPanel, Project, Asset } from '../types';
import { loadAssetImage } from './fileSystem';

// ============================================================================
// Types
// ============================================================================

export interface ReferenceImageLayout {
  lineArt?: {
    position: 'left' | 'top' | 'center';
    width: number;
    height: number;
    description: string;
  };
  
  assets: {
    type: 'character' | 'scene' | 'item';
    name: string;
    position: { x: number; y: number; width: number; height: number };
    description: string;
  }[];
  
  totalWidth: number;
  totalHeight: number;
}

export interface VideoReferenceResult {
  imageBlob: Blob;
  imageUrl: string;
  layout: ReferenceImageLayout;
  layoutDescription: string;
}

export type VideoReferenceLayoutMode = 'lineArtAndAssets' | 'microMontage';

export interface MicroMontageConfig {
  prevPanelAnchorUrl?: string;  // URL of previous panel's last triptych frame
  triptychUrls: string[];       // URLs of 3 triptych shots (can have empty strings)
  useContinuity: boolean;       // Whether to show prev panel strip
  continuityReason?: string;    // Explanation for continuity decision
}

// ============================================================================
// Helper Functions
// ============================================================================

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'character': return '👤';
    case 'scene': return '🏞️';
    case 'item': return '🎒';
    default: return '📦';
  }
};

const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'character': return '角色';
    case 'scene': return '场景';
    case 'item': return '道具';
    default: return '资产';
  }
};

/**
 * Calculate optimal grid layout for assets
 */
function calculateAssetGrid(count: number, areaWidth: number, areaHeight: number): {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
} {
  if (count === 0) return { cols: 0, rows: 0, cellWidth: 0, cellHeight: 0 };
  
  // Special layouts for small counts
  if (count === 1) {
    return { cols: 1, rows: 1, cellWidth: areaWidth, cellHeight: areaHeight };
  }
  if (count === 2) {
    // Side by side if area is wide, stacked if tall
    if (areaWidth > areaHeight) {
      return { cols: 2, rows: 1, cellWidth: areaWidth / 2, cellHeight: areaHeight };
    } else {
      return { cols: 1, rows: 2, cellWidth: areaWidth, cellHeight: areaHeight / 2 };
    }
  }
  if (count === 3) {
    // 3 in a row if wide, or 1+2 layout
    if (areaWidth > areaHeight * 1.5) {
      return { cols: 3, rows: 1, cellWidth: areaWidth / 3, cellHeight: areaHeight };
    } else {
      return { cols: 2, rows: 2, cellWidth: areaWidth / 2, cellHeight: areaHeight / 2 };
    }
  }
  
  // For 4+, calculate best grid
  const aspectRatio = areaWidth / areaHeight;
  let bestCols = 1;
  let bestScore = Infinity;
  
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellWidth = areaWidth / cols;
    const cellHeight = areaHeight / rows;
    const cellRatio = cellWidth / cellHeight;
    
    // Score based on how square the cells are (ideal ratio ~1.0 for thumbnails)
    const score = Math.abs(cellRatio - 1.0);
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  
  const rows = Math.ceil(count / bestCols);
  return {
    cols: bestCols,
    rows,
    cellWidth: areaWidth / bestCols,
    cellHeight: areaHeight / rows,
  };
}

/**
 * Draw image maintaining aspect ratio with object-contain
 */
function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  padding: number = 0
): { dx: number; dy: number; dw: number; dh: number } {
  const availW = w - padding * 2;
  const availH = h - padding * 2;
  const imgRatio = img.width / img.height;
  const boxRatio = availW / availH;
  
  let dw: number, dh: number, dx: number, dy: number;
  
  if (imgRatio > boxRatio) {
    // Image is wider - fit to width
    dw = availW;
    dh = availW / imgRatio;
    dx = x + padding;
    dy = y + padding + (availH - dh) / 2;
  } else {
    // Image is taller - fit to height
    dh = availH;
    dw = availH * imgRatio;
    dx = x + padding + (availW - dw) / 2;
    dy = y + padding;
  }
  
  ctx.drawImage(img, dx, dy, dw, dh);
  return { dx, dy, dw, dh };
}

// ============================================================================
// Main Builder
// ============================================================================

export async function buildVideoReferenceImage(
  panel: ScriptPanel,
  project: Project,
  assetImages: Record<string, string>,
  lineArtUrl?: string
): Promise<VideoReferenceResult> {
  // Get linked assets (sorted: characters first, then scene, then items)
  const linkedAssets = project.assets
    .filter(a => panel.relatedAssetIds?.includes(a.id))
    .sort((a, b) => {
      const order = { character: 0, scene: 1, item: 2 };
      return (order[a.type as keyof typeof order] ?? 3) - (order[b.type as keyof typeof order] ?? 3);
    });
  
  // Filter assets that have images
  const assetsWithImages = linkedAssets.filter(a => assetImages[a.id]);
  
  const hasLineArt = !!lineArtUrl;
  const hasAssets = assetsWithImages.length > 0;
  const assetCount = assetsWithImages.length;
  
  // Canvas dimensions (16:9 for video)
  const canvasWidth = 1920;
  const canvasHeight = 1080;
  const padding = 16;
  const gap = 12;
  
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;
  
  // Background
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  const layout: ReferenceImageLayout = {
    assets: [],
    totalWidth: canvasWidth,
    totalHeight: canvasHeight,
  };
  
  // Pre-load line art to detect its aspect ratio
  let lineArtImg: HTMLImageElement | null = null;
  let isVerticalLineArt = true;
  
  if (hasLineArt) {
    try {
      lineArtImg = await loadImage(lineArtUrl);
      isVerticalLineArt = lineArtImg.width / lineArtImg.height < 1;
    } catch (e) {
      console.warn('Failed to load line art', e);
    }
  }
  
  // =========================================================================
  // Layout Strategy
  // =========================================================================
  
  if (hasLineArt && hasAssets && lineArtImg) {
    if (isVerticalLineArt) {
      // VERTICAL LINE ART: Left side (35%), Assets right (65%)
      const lineArtAreaWidth = Math.floor(canvasWidth * 0.35);
      const assetsAreaWidth = canvasWidth - lineArtAreaWidth;
      
      // Draw line art on left
      const lineArtX = padding;
      const lineArtY = padding;
      const lineArtW = lineArtAreaWidth - padding * 2;
      const lineArtH = canvasHeight - padding * 2;
      
      // Border
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      roundRect(ctx, lineArtX - 2, lineArtY - 2, lineArtW + 4, lineArtH + 4, 10);
      ctx.stroke();
      
      ctx.save();
      roundRect(ctx, lineArtX, lineArtY, lineArtW, lineArtH, 8);
      ctx.clip();
      const lineArtDims = drawImageContain(ctx, lineArtImg, lineArtX, lineArtY, lineArtW, lineArtH);
      ctx.restore();
      
      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(lineArtX, lineArtY + lineArtH - 28, 130, 28);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText('📋 线稿三联画', lineArtX + 8, lineArtY + lineArtH - 10);
      
      layout.lineArt = {
        position: 'left',
        width: lineArtDims.dw,
        height: lineArtDims.dh,
        description: '左侧为三格连续分镜线稿（9:16竖版），从上到下：全景→中景→特写',
      };
      
      // Draw assets on right
      const assetsX = lineArtAreaWidth;
      const assetsY = padding;
      const assetsW = assetsAreaWidth - padding;
      const assetsH = canvasHeight - padding * 2;
      
      await drawAssetsGrid(ctx, assetsWithImages, assetImages, assetsX, assetsY, assetsW, assetsH, gap, layout);
      
    } else {
      // HORIZONTAL LINE ART: Top (55%), Assets bottom (45%)
      const lineArtAreaHeight = Math.floor(canvasHeight * 0.55);
      const assetsAreaHeight = canvasHeight - lineArtAreaHeight;
      
      // Draw line art on top
      const lineArtX = padding;
      const lineArtY = padding;
      const lineArtW = canvasWidth - padding * 2;
      const lineArtH = lineArtAreaHeight - padding - gap / 2;
      
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      roundRect(ctx, lineArtX - 2, lineArtY - 2, lineArtW + 4, lineArtH + 4, 10);
      ctx.stroke();
      
      ctx.save();
      roundRect(ctx, lineArtX, lineArtY, lineArtW, lineArtH, 8);
      ctx.clip();
      const lineArtDims = drawImageContain(ctx, lineArtImg, lineArtX, lineArtY, lineArtW, lineArtH);
      ctx.restore();
      
      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(lineArtX, lineArtY + lineArtH - 28, 130, 28);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText('📋 线稿三联画', lineArtX + 8, lineArtY + lineArtH - 10);
      
      layout.lineArt = {
        position: 'top',
        width: lineArtDims.dw,
        height: lineArtDims.dh,
        description: '上方为三格连续分镜线稿（16:9横版），从左到右：全景→中景→特写',
      };
      
      // Draw assets on bottom
      const assetsX = padding;
      const assetsY = lineArtAreaHeight + gap / 2;
      const assetsW = canvasWidth - padding * 2;
      const assetsH = assetsAreaHeight - padding - gap / 2;
      
      await drawAssetsGrid(ctx, assetsWithImages, assetImages, assetsX, assetsY, assetsW, assetsH, gap, layout);
    }
    
  } else if (hasLineArt && lineArtImg) {
    // ONLY LINE ART - center it
    const maxW = canvasWidth - padding * 2;
    const maxH = canvasHeight - padding * 2;
    
    ctx.save();
    roundRect(ctx, padding, padding, maxW, maxH, 12);
    ctx.clip();
    const dims = drawImageContain(ctx, lineArtImg, padding, padding, maxW, maxH);
    ctx.restore();
    
    layout.lineArt = {
      position: 'center',
      width: dims.dw,
      height: dims.dh,
      description: '画面中央为三格连续分镜线稿',
    };
    
  } else if (hasAssets) {
    // ONLY ASSETS - fill the space with smart grid
    const assetsX = padding;
    const assetsY = padding;
    const assetsW = canvasWidth - padding * 2;
    const assetsH = canvasHeight - padding * 2;
    
    await drawAssetsGrid(ctx, assetsWithImages, assetImages, assetsX, assetsY, assetsW, assetsH, gap, layout);
  }
  
  // Generate layout description
  const layoutDescription = generateLayoutDescription(layout, assetCount, isVerticalLineArt);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve({ imageBlob: blob, imageUrl: url, layout, layoutDescription });
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/png', 1.0);
  });
}

/**
 * Draw assets in a smart grid layout
 */
async function drawAssetsGrid(
  ctx: CanvasRenderingContext2D,
  assets: Asset[],
  assetImages: Record<string, string>,
  startX: number,
  startY: number,
  areaWidth: number,
  areaHeight: number,
  gap: number,
  layout: ReferenceImageLayout
): Promise<void> {
  const count = assets.length;
  if (count === 0) return;
  
  const grid = calculateAssetGrid(count, areaWidth, areaHeight);
  const cellPadding = 8;
  
  // Adjust cell size for gaps
  const effectiveWidth = areaWidth - (grid.cols - 1) * gap;
  const effectiveHeight = areaHeight - (grid.rows - 1) * gap;
  const cellW = effectiveWidth / grid.cols;
  const cellH = effectiveHeight / grid.rows;
  
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    
    const cellX = startX + col * (cellW + gap);
    const cellY = startY + row * (cellH + gap);
    
    // Card background
    ctx.fillStyle = '#1A1A1A';
    roundRect(ctx, cellX, cellY, cellW, cellH, 10);
    ctx.fill();
    
    // Border with type color
    const borderColor = asset.type === 'character' ? '#3B82F6' : 
                        asset.type === 'scene' ? '#10B981' : '#F59E0B';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    roundRect(ctx, cellX, cellY, cellW, cellH, 10);
    ctx.stroke();
    
    // Asset image
    const imgUrl = assetImages[asset.id];
    if (imgUrl) {
      try {
        const img = await loadImage(imgUrl);
        const imgAreaH = cellH - 36; // Leave space for label
        
        ctx.save();
        roundRect(ctx, cellX + cellPadding, cellY + cellPadding, cellW - cellPadding * 2, imgAreaH - cellPadding, 6);
        ctx.clip();
        drawImageContain(ctx, img, cellX + cellPadding, cellY + cellPadding, cellW - cellPadding * 2, imgAreaH - cellPadding);
        ctx.restore();
      } catch (e) {
        console.warn('Failed to load asset image', e);
      }
    }
    
    // Asset name label at bottom
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(cellX, cellY + cellH - 32, cellW, 32);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Inter, sans-serif';
    const nameText = `${getTypeIcon(asset.type)} ${asset.name}`;
    const textWidth = ctx.measureText(nameText).width;
    const textX = cellX + Math.max(8, (cellW - textWidth) / 2);
    ctx.fillText(nameText, textX, cellY + cellH - 12);
    
    // Type badge
    ctx.fillStyle = borderColor;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(getTypeLabel(asset.type), cellX + cellW - 36, cellY + 18);
    
    layout.assets.push({
      type: asset.type as 'character' | 'scene' | 'item',
      name: asset.name,
      position: { x: cellX, y: cellY, width: cellW, height: cellH },
      description: asset.prompt || asset.description || asset.name,
    });
  }
}

/**
 * Generate layout description for prompt
 */
function generateLayoutDescription(
  layout: ReferenceImageLayout,
  assetCount: number,
  isVertical: boolean
): string {
  const parts: string[] = [];
  
  parts.push('【参考图布局说明】');
  
  if (layout.lineArt) {
    if (layout.lineArt.position === 'left') {
      parts.push('画面左侧（约35%）是三格连续分镜线稿（9:16竖版）：');
      parts.push('  - 上部：全景镜头（Wide Shot）');
      parts.push('  - 中部：中景镜头（Medium Shot）');
      parts.push('  - 下部：特写镜头（Close-Up）');
    } else if (layout.lineArt.position === 'top') {
      parts.push('画面上方（约55%）是三格连续分镜线稿（16:9横版）：');
      parts.push('  - 从左到右依次是：全景→中景→特写');
    } else {
      parts.push('画面中央是三格连续分镜线稿');
    }
  }
  
  if (layout.assets.length > 0) {
    const position = layout.lineArt?.position === 'left' ? '画面右侧（约65%）' :
                     layout.lineArt?.position === 'top' ? '画面下方（约45%）' : '画面中';
    parts.push(`${position}展示了 ${assetCount} 个参考资产：`);
    
    const characters = layout.assets.filter(a => a.type === 'character');
    const scenes = layout.assets.filter(a => a.type === 'scene');
    const items = layout.assets.filter(a => a.type === 'item');
    
    if (characters.length > 0) {
      parts.push(`  - 角色(${characters.length}): ${characters.map(c => c.name).join('、')}`);
    }
    if (scenes.length > 0) {
      parts.push(`  - 场景(${scenes.length}): ${scenes.map(s => s.name).join('、')}`);
    }
    if (items.length > 0) {
      parts.push(`  - 道具(${items.length}): ${items.map(p => p.name).join('、')}`);
    }
  }
  
  parts.push('');
  parts.push('生成视频时请：');
  parts.push('1. 保持角色外观与参考图一致');
  parts.push('2. 场景氛围与参考图匹配');
  if (layout.lineArt) {
    parts.push('3. 动作流程参照线稿的三个镜头依次呈现');
  }
  
  return parts.join('\n');
}

/**
 * Check if reference image can be built
 */
export function canBuildReferenceImage(
  panel: ScriptPanel,
  project: Project,
  assetImages: Record<string, string>
): { canBuild: boolean; reason?: string } {
  const hasLineArt = !!panel.lineArt;
  const linkedAssets = project.assets.filter(a => panel.relatedAssetIds?.includes(a.id));
  const hasAssetImages = linkedAssets.some(a => assetImages[a.id]);
  
  if (!hasLineArt && !hasAssetImages) {
    return { canBuild: false, reason: '需要至少一个线稿三联画或关联资产图片' };
  }
  
  return { canBuild: true };
}

// ============================================================================
// Micro-Montage Layout Builder
// ============================================================================

/**
 * Build video reference image with micro-montage layout
 * 
 * Layout (16:9 canvas):
 * ┌────────────────────────────────────────────────────────────┐
 * │  [Prev Panel Strip] (optional, 8% height when enabled)    │
 * ├────────────────────────────────────────────────────────────┤
 * │                      │                                     │
 * │  Triptych Shots      │         Asset Cards                 │
 * │  (52% width)         │         (48% width)                 │
 * │  ┌─────────────┐     │  ┌───────┐ ┌───────┐ ┌───────┐     │
 * │  │ Shot 1 (WS) │     │  │ Char1 │ │ Scene │ │ Prop  │     │
 * │  ├─────────────┤     │  └───────┘ └───────┘ └───────┘     │
 * │  │ Shot 2 (MS) │     │                                     │
 * │  ├─────────────┤     │                                     │
 * │  │ Shot 3 (CU) │     │                                     │
 * │  └─────────────┘     │                                     │
 * │                      │                                     │
 * └────────────────────────────────────────────────────────────┘
 */
export async function buildMicroMontageReferenceImage(
  panel: ScriptPanel,
  project: Project,
  assetImages: Record<string, string>,
  config: MicroMontageConfig
): Promise<VideoReferenceResult> {
  const { prevPanelAnchorUrl, triptychUrls, useContinuity } = config;
  
  // Get linked assets (sorted: characters first, then scene, then items)
  const linkedAssets = project.assets
    .filter(a => panel.relatedAssetIds?.includes(a.id))
    .sort((a, b) => {
      const order = { character: 0, scene: 1, item: 2 };
      return (order[a.type as keyof typeof order] ?? 3) - (order[b.type as keyof typeof order] ?? 3);
    });
  
  const assetsWithImages = linkedAssets.filter(a => assetImages[a.id]);
  const hasTriptych = triptychUrls.some(u => u);
  const hasAssets = assetsWithImages.length > 0;
  const hasPrevStrip = useContinuity && prevPanelAnchorUrl;
  
  // Canvas dimensions (16:9 for video)
  const canvasWidth = 1920;
  const canvasHeight = 1080;
  const padding = 12;
  const gap = 8;
  
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;
  
  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Dark background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  bgGradient.addColorStop(0, '#0D0D0D');
  bgGradient.addColorStop(1, '#1A1A1A');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  const layout: ReferenceImageLayout = {
    assets: [],
    totalWidth: canvasWidth,
    totalHeight: canvasHeight,
  };
  
  // Calculate layout zones
  const prevStripHeight = hasPrevStrip ? Math.floor(canvasHeight * 0.08) : 0;
  const mainAreaY = prevStripHeight + (hasPrevStrip ? gap : 0);
  const mainAreaHeight = canvasHeight - mainAreaY - padding;
  
  const triptychWidth = Math.floor((canvasWidth - padding * 2 - gap) * 0.52);
  const assetsWidth = canvasWidth - padding * 2 - gap - triptychWidth;
  
  // =========================================================================
  // 1. Draw Previous Panel Strip (if continuity enabled)
  // =========================================================================
  
  if (hasPrevStrip && prevPanelAnchorUrl) {
    try {
      const prevImg = await loadImage(prevPanelAnchorUrl);
      
      // Strip background
      ctx.fillStyle = '#111';
      roundRect(ctx, padding, padding, canvasWidth - padding * 2, prevStripHeight - gap, 6);
      ctx.fill();
      
      // Border
      ctx.strokeStyle = '#8B5CF6'; // Purple for continuity
      ctx.lineWidth = 2;
      roundRect(ctx, padding, padding, canvasWidth - padding * 2, prevStripHeight - gap, 6);
      ctx.stroke();
      
      // Draw prev image (left side of strip)
      const prevImgWidth = Math.min(prevStripHeight * 1.5 * (prevImg.width / prevImg.height), canvasWidth * 0.2);
      ctx.save();
      roundRect(ctx, padding + 4, padding + 4, prevImgWidth - 8, prevStripHeight - gap - 8, 4);
      ctx.clip();
      drawImageContain(ctx, prevImg, padding + 4, padding + 4, prevImgWidth - 8, prevStripHeight - gap - 8);
      ctx.restore();
      
      // Label
      ctx.fillStyle = '#A78BFA';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText('⬆️ 上一分镜末帧 (连续性锚点)', padding + prevImgWidth + 12, padding + prevStripHeight / 2 + 4);
      
      // Continuity reason (if provided)
      if (config.continuityReason) {
        ctx.fillStyle = '#6B7280';
        ctx.font = '11px Inter, sans-serif';
        const reasonText = config.continuityReason.length > 50 
          ? config.continuityReason.substring(0, 50) + '...'
          : config.continuityReason;
        ctx.fillText(reasonText, padding + prevImgWidth + 12, padding + prevStripHeight / 2 + 20);
      }
      
    } catch (e) {
      console.warn('[MicroMontage] Failed to load prev panel anchor:', e);
    }
  }
  
  // =========================================================================
  // 2. Draw Triptych Shots (left side)
  // =========================================================================
  
  const triptychX = padding;
  const triptychY = mainAreaY + padding;
  const triptychH = mainAreaHeight - padding;
  const shotH = (triptychH - gap * 2) / 3;
  
  const shotLabels = ['Shot 1: Wide Shot (WS) - 建立', 'Shot 2: Medium Shot (MS) - 发展', 'Shot 3: Close-Up (CU) - 高潮'];
  
  for (let i = 0; i < 3; i++) {
    const shotY = triptychY + i * (shotH + gap);
    const shotUrl = triptychUrls[i];
    
    // Shot card background
    ctx.fillStyle = '#1A1A1A';
    roundRect(ctx, triptychX, shotY, triptychWidth, shotH, 8);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = i === 0 ? '#3B82F6' : i === 1 ? '#10B981' : '#F59E0B';
    ctx.lineWidth = 2;
    roundRect(ctx, triptychX, shotY, triptychWidth, shotH, 8);
    ctx.stroke();
    
    // Draw shot image if available
    if (shotUrl) {
      try {
        const shotImg = await loadImage(shotUrl);
        ctx.save();
        roundRect(ctx, triptychX + 4, shotY + 4, triptychWidth - 8, shotH - 32, 6);
        ctx.clip();
        drawImageContain(ctx, shotImg, triptychX + 4, shotY + 4, triptychWidth - 8, shotH - 32);
        ctx.restore();
      } catch (e) {
        // Draw placeholder
        ctx.fillStyle = '#0A0A0A';
        roundRect(ctx, triptychX + 4, shotY + 4, triptychWidth - 8, shotH - 32, 6);
        ctx.fill();
        
        ctx.fillStyle = '#4B5563';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('未生成', triptychX + triptychWidth / 2, shotY + (shotH - 32) / 2 + 10);
        ctx.textAlign = 'left';
      }
    } else {
      // Empty slot placeholder
      ctx.fillStyle = '#0A0A0A';
      roundRect(ctx, triptychX + 4, shotY + 4, triptychWidth - 8, shotH - 32, 6);
      ctx.fill();
      
      ctx.fillStyle = '#4B5563';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('待生成', triptychX + triptychWidth / 2, shotY + (shotH - 32) / 2 + 10);
      ctx.textAlign = 'left';
    }
    
    // Shot label
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(triptychX, shotY + shotH - 28, triptychWidth, 28);
    
    ctx.fillStyle = i === 0 ? '#60A5FA' : i === 1 ? '#34D399' : '#FBBF24';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(`🎬 ${shotLabels[i]}`, triptychX + 10, shotY + shotH - 10);
  }
  
  // Add triptych to layout
  layout.lineArt = {
    position: 'left',
    width: triptychWidth,
    height: triptychH,
    description: '左侧三格为动作分解三连拍（WS→MS→CU），呈现微蒙太奇叙事结构',
  };
  
  // =========================================================================
  // 3. Draw Asset Cards (right side)
  // =========================================================================
  
  const assetsX = padding + triptychWidth + gap;
  const assetsY = mainAreaY + padding;
  const assetsH = mainAreaHeight - padding;
  
  if (hasAssets) {
    await drawAssetsGrid(ctx, assetsWithImages, assetImages, assetsX, assetsY, assetsWidth, assetsH, gap, layout);
  } else {
    // No assets placeholder
    ctx.fillStyle = '#1A1A1A';
    roundRect(ctx, assetsX, assetsY, assetsWidth, assetsH, 8);
    ctx.fill();
    
    ctx.fillStyle = '#4B5563';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('请关联资产以显示参考', assetsX + assetsWidth / 2, assetsY + assetsH / 2);
    ctx.textAlign = 'left';
  }
  
  // Generate layout description for micro-montage
  const layoutDescription = generateMicroMontageLayoutDescription(
    layout,
    hasPrevStrip,
    triptychUrls.filter(Boolean).length,
    assetsWithImages.length,
    config.continuityReason
  );
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve({ imageBlob: blob, imageUrl: url, layout, layoutDescription });
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/png', 1.0);
  });
}

/**
 * Generate layout description for micro-montage prompt
 */
function generateMicroMontageLayoutDescription(
  layout: ReferenceImageLayout,
  hasPrevStrip: boolean,
  triptychCount: number,
  assetCount: number,
  continuityReason?: string
): string {
  const parts: string[] = [];
  
  parts.push('【微蒙太奇参考图布局说明】');
  parts.push('');
  
  if (hasPrevStrip) {
    parts.push('🔗 [顶部窄条 - 连续性锚点]');
    parts.push('  - 显示上一分镜的最后一帧，用于保持跨分镜的视觉连续性');
    if (continuityReason) {
      parts.push(`  - 连续性判定：${continuityReason}`);
    }
    parts.push('');
  }
  
  parts.push('🎬 [左侧 - 动作分解三连拍]');
  parts.push('  - Shot 1 (Wide Shot): 全景建立镜头 - Ki（起）');
  parts.push('  - Shot 2 (Medium Shot): 中景动作镜头 - Sho（承）');
  parts.push('  - Shot 3 (Close-Up): 特写情感镜头 - Ten（转）');
  parts.push(`  - 已生成 ${triptychCount}/3 个镜头`);
  parts.push('');
  
  if (layout.assets.length > 0) {
    parts.push('📦 [右侧 - 参考资产]');
    
    const characters = layout.assets.filter(a => a.type === 'character');
    const scenes = layout.assets.filter(a => a.type === 'scene');
    const items = layout.assets.filter(a => a.type === 'item');
    
    if (characters.length > 0) {
      parts.push(`  - 角色(${characters.length}): ${characters.map(c => c.name).join('、')}`);
    }
    if (scenes.length > 0) {
      parts.push(`  - 场景(${scenes.length}): ${scenes.map(s => s.name).join('、')}`);
    }
    if (items.length > 0) {
      parts.push(`  - 道具(${items.length}): ${items.map(p => p.name).join('、')}`);
    }
    parts.push('');
  }
  
  parts.push('【视频生成指导】');
  parts.push('1. 按 Shot1→Shot2→Shot3 的顺序呈现动作流程');
  parts.push('2. 保持角色外观与右侧资产参考一致');
  parts.push('3. 场景氛围与资产参考匹配');
  if (hasPrevStrip) {
    parts.push('4. Shot1 开头与顶部锚点帧保持视觉连续（动作衔接）');
  }
  
  return parts.join('\n');
}

/**
 * Check if micro-montage can be built
 */
export function canBuildMicroMontage(
  panel: ScriptPanel,
  project: Project,
  triptychUrls: string[]
): { canBuild: boolean; reason?: string } {
  const hasTriptych = triptychUrls.some(u => u);
  const linkedAssets = project.assets.filter(a => panel.relatedAssetIds?.includes(a.id));
  const hasAssets = linkedAssets.length > 0;
  
  if (!hasTriptych && !hasAssets) {
    return { canBuild: false, reason: '需要至少一个动作分解镜头或关联资产' };
  }
  
  return { canBuild: true };
}
