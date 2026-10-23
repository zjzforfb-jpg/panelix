import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Asset, ScriptPanel, Project, AssetType, AppSettings } from '../types';
import { 
  buildVideoPrompt,
  buildPromptConfigFromPanel,
  generateFormattedPrompt,
  CAMERA_MOVES,
  type CameraMove,
  type VideoModelProvider,
} from '../services/videoPromptBuilder';
import {
  generateCompositeReference,
  buildSketchConfigFromPanel,
} from '../services/storyboardSketchService';

// Layout mode for reference image
type LayoutMode = 'standard' | 'composite';

// ============================================================================
// Types
// ============================================================================

type ShotType = 'Wide Shot' | 'Medium Shot' | 'Close-Up' | 'Extreme Close-Up';

interface VideoReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
  onGeneratePrompt?: (prompt: string) => void; // Pass generated prompt to parent
  
  panel: ScriptPanel;
  project: Project;
  assetImages: Record<string, string>;
  shotUrls: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

const SHOT_TYPES: { value: ShotType; icon: string }[] = [
  { value: 'Wide Shot', icon: '📷' },
  { value: 'Medium Shot', icon: '🎥' },
  { value: 'Close-Up', icon: '🔍' },
  { value: 'Extreme Close-Up', icon: '👁️' },
];

const getTypeIcon = (type: AssetType): string => {
  return type === 'character' ? '👤' : type === 'scene' ? '🏞️' : '📦';
};

const getTypeBorderColor = (type: AssetType): string => {
  return type === 'character' ? '#3B82F6' : type === 'scene' ? '#10B981' : '#A855F7';
};

const inferMood = (panel: ScriptPanel): string => {
  const text = panel.script_content?.toLowerCase() || '';
  if (text.includes('紧张') || text.includes('对峙') || text.includes('惊')) return '紧张悬疑';
  if (text.includes('温馨') || text.includes('拥抱') || text.includes('笑')) return '温馨治愈';
  if (text.includes('战斗') || text.includes('攻击') || text.includes('冲突')) return '激烈动作';
  if (text.includes('悲伤') || text.includes('哭泣') || text.includes('痛')) return '悲伤沉重';
  return '日常';
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number
) => {
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
};

// ============================================================================
// Main Component
// ============================================================================

export const VideoReferenceModal: React.FC<VideoReferenceModalProps> = ({
  isOpen, onClose, onSave, onGeneratePrompt, panel, project, assetImages, shotUrls
}) => {
  const [shotTypes, setShotTypes] = useState<ShotType[]>(
    panel.shotTypes as ShotType[] || ['Wide Shot', 'Medium Shot', 'Close-Up']
  );
  const [shotDurations, setShotDurations] = useState<number[]>(
    panel.shotDurations || [3, 2.5, 2]
  );
  const [showAssets, setShowAssets] = useState(true);
  const [showScript, setShowScript] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Camera movements between shots (used in composite mode and for prompt generation)
  const [cameraMoves, setCameraMoves] = useState<CameraMove[]>(['zoom_in', 'zoom_in']); // Between shots
  const [modelProvider, setModelProvider] = useState<VideoModelProvider>('veo');
  
  // Layout mode: standard (original) or composite (assets + action flow)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('composite');

  const linkedAssets = project.assets
    .filter(a => panel.relatedAssetIds?.includes(a.id))
    .sort((a, b) => {
      const order: Record<AssetType, number> = { character: 0, scene: 1, item: 2 };
      return order[a.type] - order[b.type];
    })
    .slice(0, 6);

  const visualLines = panel.script_content
    ?.split('\n')
    .filter(l => l.trim().startsWith('▲'))
    .map(l => l.replace(/^▲/, '').trim()) || [];

  const scriptText = panel.script_content
    ?.split('\n')
    .filter(l => !l.startsWith('▲') && l.trim())
    .join(' ')
    .substring(0, 150) || '';

  const totalDuration = shotDurations.reduce((sum, d) => sum + d, 0);

  // Generate AI prompt for video generation using new builder
  const generateAIPrompt = useCallback(() => {
    // Build config for prompt generation
    const config = {
      modelProvider,
      characters: linkedAssets
        .filter(a => a.type === 'character')
        .map(a => ({
          name: a.name,
          description: a.description,
        })),
      scene: linkedAssets.find(a => a.type === 'scene') 
        ? {
            name: linkedAssets.find(a => a.type === 'scene')!.name,
            description: linkedAssets.find(a => a.type === 'scene')!.description,
          }
        : panel.scene_name 
          ? { name: panel.scene_name }
          : undefined,
      props: linkedAssets
        .filter(a => a.type === 'item')
        .map(a => a.name),
      visualActions: visualLines,
      style: project.activeStyle 
        ? { name: project.activeStyle.name, prompt: project.activeStyle.prompt }
        : undefined,
      aspectRatio: '16:9' as const,
      duration: totalDuration,
      cameraMove: cameraMoves[0] || 'static', // Use first camera move from sequence
      mood: inferMood(panel),
    };
    
    return buildVideoPrompt(config);
  }, [linkedAssets, visualLines, project.activeStyle, panel, totalDuration, cameraMoves, modelProvider]);
  
  // Generate formatted prompt for display
  const generateFormattedPromptDisplay = useCallback(() => {
    const config = {
      modelProvider,
      characters: linkedAssets
        .filter(a => a.type === 'character')
        .map(a => ({
          name: a.name,
          description: a.description,
        })),
      scene: linkedAssets.find(a => a.type === 'scene') 
        ? {
            name: linkedAssets.find(a => a.type === 'scene')!.name,
            description: linkedAssets.find(a => a.type === 'scene')!.description,
          }
        : panel.scene_name 
          ? { name: panel.scene_name }
          : undefined,
      props: linkedAssets
        .filter(a => a.type === 'item')
        .map(a => a.name),
      visualActions: visualLines,
      style: project.activeStyle 
        ? { name: project.activeStyle.name, prompt: project.activeStyle.prompt }
        : undefined,
      aspectRatio: '16:9' as const,
      duration: totalDuration,
      cameraMove: cameraMoves[0] || 'static', // Use first camera move from sequence
      mood: inferMood(panel),
    };
    
    return generateFormattedPrompt(config);
  }, [linkedAssets, visualLines, project.activeStyle, panel, totalDuration, cameraMoves, modelProvider]);

  // Update parent with generated prompt
  useEffect(() => {
    if (isOpen && onGeneratePrompt) {
      onGeneratePrompt(generateAIPrompt());
    }
  }, [isOpen, onGeneratePrompt, generateAIPrompt]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(generateAIPrompt());
  }, [generateAIPrompt]);

  // Export using composite mode (new layout with action flow)
  const exportComposite = useCallback(async () => {
    setIsExporting(true);
    try {
      const sketchConfig = buildSketchConfigFromPanel(
        panel,
        project,
        shotUrls,
        cameraMoves,
        assetImages
      );
      
      const blob = await generateCompositeReference(sketchConfig);
      await onSave(blob);
      onClose();
    } catch (e) {
      console.error('Composite export failed', e);
    } finally {
      setIsExporting(false);
    }
  }, [panel, project, shotUrls, cameraMoves, assetImages, onSave, onClose]);

  // Export Canvas - SIMPLIFIED: Asset only shows name (standard mode)
  const exportToCanvas = useCallback(async () => {
    // If composite mode, use new export
    if (layoutMode === 'composite') {
      return exportComposite();
    }
    
    setIsExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');

      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, 1920, 1080);

      let yOffset = 0;

      // Assets zone - SIMPLIFIED: only name label
      if (showAssets && linkedAssets.length > 0) {
        await drawAssetZoneSimplified(ctx, linkedAssets, assetImages, 0, yOffset);
        yOffset += 260;
      }

      // Shots zone
      await drawShotZone(ctx, shotUrls, shotTypes, shotDurations, visualLines, 0, yOffset);
      yOffset += 580;

      // Script zone
      if (showScript) {
        drawScriptZone(ctx, scriptText, project.activeStyle?.name || '默认风格', inferMood(panel), totalDuration, 0, yOffset);
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          await onSave(blob);
          onClose();
        }
      }, 'image/png', 1.0);

    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setIsExporting(false);
    }
  }, [showAssets, showScript, linkedAssets, assetImages, shotUrls, shotTypes, shotDurations, visualLines, scriptText, project.activeStyle, totalDuration, panel, onSave, onClose]);

  // SIMPLIFIED: Asset zone only shows name, no prompt annotations
  const drawAssetZoneSimplified = async (ctx: CanvasRenderingContext2D, assets: Asset[], images: Record<string, string>, x: number, y: number) => {
    const cardWidth = 180, cardHeight = 200, gap = 20, startX = 80;
    
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText('🎨 ASSET REFERENCES', startX, y + 25);

    for (let i = 0; i < Math.min(assets.length, 6); i++) {
      const asset = assets[i];
      const cardX = startX + i * (cardWidth + gap);
      const cardY = y + 40;
      
      // Card background
      ctx.fillStyle = '#1A1A1A';
      roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 8);
      ctx.fill();
      
      // Type-colored border
      ctx.strokeStyle = getTypeBorderColor(asset.type);
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Image
      if (images[asset.id]) {
        try {
          const img = await loadImage(images[asset.id]);
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, cardX + 8, cardY + 8, cardWidth - 16, cardWidth - 16, 4);
          ctx.clip();
          
          const imgSize = cardWidth - 16;
          const imgRatio = img.width / img.height;
          let dw, dh, dx, dy;
          if (imgRatio > 1) { dh = imgSize; dw = imgSize * imgRatio; dy = 0; dx = (imgSize - dw) / 2; }
          else { dw = imgSize; dh = imgSize / imgRatio; dx = 0; dy = (imgSize - dh) / 2; }
          
          ctx.drawImage(img, cardX + 8 + dx, cardY + 8 + dy, dw, dh);
          ctx.restore();
        } catch (e) { console.warn('Failed to load asset image', e); }
      }
      
      // Name only (no description/prompt)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Inter, sans-serif';
      const nameText = `${getTypeIcon(asset.type)} ${asset.name}`;
      const nameWidth = ctx.measureText(nameText).width;
      ctx.fillText(nameText, cardX + (cardWidth - nameWidth) / 2, cardY + cardHeight - 12);
    }
  };

  const drawShotZone = async (ctx: CanvasRenderingContext2D, urls: string[], types: ShotType[], durations: number[], captions: string[], x: number, y: number) => {
    const shotWidth = 560, shotHeight = 480, gap = 30, startX = 80;
    
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText('🎬 SHOT SEQUENCE', startX, y + 25);

    for (let i = 0; i < Math.min(urls.length, 3); i++) {
      const shotX = startX + i * (shotWidth + gap);
      const shotY = y + 40;
      
      // Image
      if (urls[i]) {
        try {
          const img = await loadImage(urls[i]);
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, shotX, shotY, shotWidth, shotHeight, 8);
          ctx.clip();
          
          const imgRatio = img.width / img.height;
          const targetRatio = shotWidth / shotHeight;
          let dw, dh, dx, dy;
          if (imgRatio > targetRatio) { dh = shotHeight; dw = shotHeight * imgRatio; dy = 0; dx = (shotWidth - dw) / 2; }
          else { dw = shotWidth; dh = shotWidth / imgRatio; dx = 0; dy = (shotHeight - dh) / 2; }
          
          ctx.drawImage(img, shotX + dx, shotY + dy, dw, dh);
          ctx.restore();
        } catch (e) { console.warn('Failed to load shot image', e); }
      }
      
      // Shot border
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      roundRect(ctx, shotX, shotY, shotWidth, shotHeight, 8);
      ctx.stroke();
      
      // Metadata overlay at bottom
      const metaY = shotY + shotHeight - 50;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      roundRect(ctx, shotX, metaY, shotWidth, 50, 0);
      ctx.fill();
      
      // Shot number and type
      ctx.fillStyle = '#60A5FA';
      ctx.font = 'bold 14px Inter, sans-serif';
      const icon = SHOT_TYPES.find(t => t.value === types[i])?.icon || '📷';
      ctx.fillText(`#${i + 1} ${icon} ${types[i]}`, shotX + 12, metaY + 22);
      
      // Duration
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText(`⏱️ ${durations[i]}s`, shotX + 12, metaY + 42);
    }
  };

  const drawScriptZone = (ctx: CanvasRenderingContext2D, text: string, style: string, mood: string, duration: number, x: number, y: number) => {
    const startX = 80, width = 1760;
    
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText('📝 CONTEXT', startX, y + 25);
    
    // Script text
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '15px Inter, sans-serif';
    const maxWidth = width - 40;
    const words = text.split(' ');
    let line = '', lineY = y + 55;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth) {
        ctx.fillText(line, startX, lineY);
        line = word + ' ';
        lineY += 24;
        if (lineY > y + 120) break;
      } else { line = testLine; }
    }
    if (line && lineY <= y + 120) ctx.fillText(line, startX, lineY);
    
    // Tags
    const tagsY = y + 145;
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText(`🎨 ${style}`, startX, tagsY);
    ctx.fillText(`🎭 ${mood}`, startX + 300, tagsY);
    ctx.fillText(`⏱️ ${duration.toFixed(1)}s`, startX + 500, tagsY);
  };

  if (!isOpen) return null;

  // Dynamic container class based on fullscreen mode
  // Use z-[100] to ensure modal is above all other elements (sidebar z-50, statusbar z-60)
  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[100]'
    : 'fixed inset-0 z-[100] flex items-center justify-center p-6';

  const modalClass = isFullscreen
    ? 'bg-[#0f0f0f] w-full h-full overflow-hidden flex flex-col'
    : 'bg-[#0f0f0f] rounded-2xl border border-white/10 w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col';

  // Use Portal to render modal at document.body level, bypassing parent transform containment
  return createPortal(
    <div className={`${containerClass} bg-black/85 backdrop-blur-md`}>
      <div className={modalClass}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#151515]">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <span className="w-9 h-9 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center text-sm">🎬</span>
            视频参考帧生成器
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              {isFullscreen ? '↙️ 退出全屏' : '↗️ 全屏'}
            </button>
            <button 
              onClick={copyPrompt} 
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              📋 复制 Prompt
            </button>
            <button 
              onClick={exportToCanvas} 
              disabled={isExporting} 
              className="px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
            >
              {isExporting ? '⏳ 导出中...' : '💾 导出 PNG'}
            </button>
            <button 
              onClick={onClose} 
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview Area */}
          <div className="flex-1 p-6 overflow-auto">
            <div className="bg-[#0A0A0A] rounded-xl border border-white/10 p-8 space-y-8 min-h-full">
              
              {/* Assets - SIMPLIFIED: Only name label */}
              {showAssets && linkedAssets.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">🎨 资产参考 (仅名称)</h3>
                  <div className="flex flex-wrap gap-4">
                    {linkedAssets.slice(0, 6).map(asset => (
                      <div 
                        key={asset.id} 
                        className="w-36 bg-[#1A1A1A] rounded-xl border-2 overflow-hidden transition-transform hover:scale-105" 
                        style={{ borderColor: getTypeBorderColor(asset.type) }}
                      >
                        {assetImages[asset.id] ? (
                          <img src={assetImages[asset.id]} className="w-full h-36 object-cover" alt={asset.name} />
                        ) : (
                          <div className="w-full h-36 bg-gray-800 flex items-center justify-center text-3xl">
                            {getTypeIcon(asset.type)}
                          </div>
                        )}
                        <div className="px-2 py-2 text-center bg-black/50">
                          <p className="text-xs font-bold text-white truncate">
                            {getTypeIcon(asset.type)} {asset.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shots */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">🎬 镜头序列</h3>
                <div className={`grid gap-4 ${isFullscreen ? 'grid-cols-3' : 'grid-cols-3'}`}>
                  {shotUrls.map((url, idx) => (
                    <div key={idx} className="space-y-3">
                      <div className={`${isFullscreen ? 'aspect-[16/10]' : 'aspect-video'} bg-[#0A0A0A] rounded-xl border border-white/10 overflow-hidden relative group`}>
                        {url ? (
                          <img src={url} className="w-full h-full object-cover" alt={`Shot ${idx + 1}`} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-700 text-xl">空</div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-400">#{idx + 1}</span>
                            <span className="text-[10px] text-gray-400">⏱️ {shotDurations[idx]}s</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <select 
                          value={shotTypes[idx]} 
                          onChange={(e) => { const n = [...shotTypes]; n[idx] = e.target.value as ShotType; setShotTypes(n); }} 
                          className="flex-1 bg-[#1A1A1A] text-white text-xs px-2 py-2 rounded-lg border border-white/10 focus:border-blue-500/50 outline-none"
                        >
                          {SHOT_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.icon} {type.value}</option>
                          ))}
                        </select>
                        <input 
                          type="number" 
                          value={shotDurations[idx]} 
                          onChange={(e) => { const n = [...shotDurations]; n[idx] = parseFloat(e.target.value) || 0; setShotDurations(n); }} 
                          step="0.5" min="0.5" max="10" 
                          className="w-16 bg-[#1A1A1A] text-white text-xs px-2 py-2 rounded-lg border border-white/10 text-center focus:border-blue-500/50 outline-none" 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Script Context */}
              {showScript && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">📝 剧情说明</h3>
                  <p className="text-sm text-gray-300 leading-relaxed bg-[#151515] rounded-lg p-4 border border-white/5">{scriptText}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span className="px-3 py-1 bg-white/5 rounded-full">🎨 {project.activeStyle?.name || '默认风格'}</span>
                    <span className="px-3 py-1 bg-white/5 rounded-full">🎭 {inferMood(panel)}</span>
                    <span className="px-3 py-1 bg-white/5 rounded-full">⏱️ 总时长 {totalDuration.toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-72 border-l border-white/5 p-5 overflow-y-auto shrink-0 space-y-6 bg-[#121212]">
            {/* Layout Mode Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">布局模式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLayoutMode('composite')}
                  className={`p-3 rounded-lg text-center transition-all ${
                    layoutMode === 'composite'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#1A1A1A] text-gray-400 hover:bg-[#252525]'
                  }`}
                >
                  <span className="text-lg">🎬</span>
                  <span className="block text-[10px] mt-1">动作流程图</span>
                </button>
                <button
                  onClick={() => setLayoutMode('standard')}
                  className={`p-3 rounded-lg text-center transition-all ${
                    layoutMode === 'standard'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#1A1A1A] text-gray-400 hover:bg-[#252525]'
                  }`}
                >
                  <span className="text-lg">🖼️</span>
                  <span className="block text-[10px] mt-1">标准模式</span>
                </button>
              </div>
              <p className="text-[9px] text-gray-600">
                {layoutMode === 'composite' 
                  ? '资产参考 + 动作流程 + 运镜箭头' 
                  : '资产参考 + 分镜序列 + 剧情说明'}
              </p>
            </div>

            {/* Camera Movement Sequence (for composite mode) */}
            {layoutMode === 'composite' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">镜头间运镜</label>
                <div className="space-y-2">
                  {[0, 1].map(idx => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-16">镜头{idx + 1}→{idx + 2}</span>
                      <select
                        value={cameraMoves[idx]}
                        onChange={(e) => {
                          const newMoves = [...cameraMoves];
                          newMoves[idx] = e.target.value as CameraMove;
                          setCameraMoves(newMoves);
                        }}
                        className="flex-1 bg-[#1A1A1A] text-white text-[10px] px-2 py-1.5 rounded border border-white/10 focus:border-blue-500/50 outline-none"
                      >
                        {CAMERA_MOVES.map(cam => (
                          <option key={cam.value} value={cam.value}>
                            {cam.icon} {cam.labelCN}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Standard mode options */}
            {layoutMode === 'standard' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">显示选项</label>
                <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                  <input 
                    type="checkbox" 
                    checked={showAssets} 
                    onChange={(e) => setShowAssets(e.target.checked)} 
                    className="w-4 h-4 rounded bg-white/10 border-white/20" 
                  />
                  显示资产参考
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                  <input 
                    type="checkbox" 
                    checked={showScript} 
                    onChange={(e) => setShowScript(e.target.checked)} 
                    className="w-4 h-4 rounded bg-white/10 border-white/20" 
                  />
                  显示剧情说明
                </label>
              </div>
            )}

            {/* Model Provider Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">目标模型</label>
              <select
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value as VideoModelProvider)}
                className="w-full bg-[#1A1A1A] text-white text-xs px-3 py-2 rounded-lg border border-white/10 focus:border-blue-500/50 outline-none"
              >
                <option value="veo">Veo 3.1 (Google)</option>
                <option value="sora">Sora 2 (OpenAI)</option>
                <option value="kling">可灵 (快手)</option>
                <option value="volcengine">火山引擎 (字节)</option>
                <option value="generic">通用格式</option>
              </select>
              <p className="text-[9px] text-gray-600">
                提示词格式将针对所选模型优化
              </p>
            </div>

            {/* Note: Camera movement is set via "镜头间运镜" above for composite mode */}

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">导出规格</label>
              <div className="text-sm text-gray-400 space-y-2 bg-white/5 rounded-lg p-3">
                <p>📐 尺寸: 1920 × 1080</p>
                <p>🖼️ 格式: PNG</p>
                <p>✨ 质量: 100%</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">使用说明</label>
              <div className="text-xs text-gray-500 leading-relaxed space-y-2">
                <p>1. 选择目标视频模型</p>
                <p>2. 选择运镜方式</p>
                <p>3. 复制优化后的 Prompt</p>
                <p>4. 导出 PNG 作为参考图</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">生成的 Prompt</label>
              <div className="bg-black/50 rounded-lg p-3 border border-white/5 max-h-48 overflow-y-auto">
                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap font-mono">{generateAIPrompt()}</pre>
              </div>
              <details className="text-[9px]">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-400">📝 详细解析</summary>
                <pre className="mt-2 p-2 bg-black/50 rounded-lg text-gray-500 whitespace-pre-wrap overflow-auto max-h-32">
                  {generateFormattedPromptDisplay()}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VideoReferenceModal;
