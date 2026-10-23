import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Asset } from '../types';

// ============================================================================
// Types
// ============================================================================

interface ComposerItem {
  id: string;
  type: 'shot' | 'asset';
  imageUrl: string;
  label: string;
  caption: string;
}

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
  // Initial data
  shotUrls: string[];          // Three shot URLs
  shotCaptions: string[];      // Three shot captions (from visualLines)
  assets: Asset[];             // Related assets
  assetImages: Record<string, string>;
  panelInfo?: {
    scene?: string;
    duration?: string;
  };
}

type LayoutType = 'triptych' | 'triptych-vertical' | 'grid-2x2' | 'reference';

// ============================================================================
// Composer Modal Component
// ============================================================================

export const ComposerModal: React.FC<ComposerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  shotUrls,
  shotCaptions,
  assets,
  assetImages,
  panelInfo
}) => {
  // State
  const [layout, setLayout] = useState<LayoutType>('triptych');
  const [items, setItems] = useState<ComposerItem[]>([]);
  const [showCaptions, setShowCaptions] = useState(true);
  const [background, setBackground] = useState('#000000');
  const [isExporting, setIsExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize items from props
  useEffect(() => {
    if (!isOpen) return;
    
    const shotItems: ComposerItem[] = shotUrls.map((url, idx) => ({
      id: `shot-${idx}`,
      type: 'shot',
      imageUrl: url,
      label: `Shot ${idx + 1}`,
      caption: shotCaptions[idx] || ''
    }));
    
    setItems(shotItems);
  }, [isOpen, shotUrls, shotCaptions]);

  // Update caption
  const updateCaption = useCallback((id: string, caption: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, caption } : item
    ));
  }, []);

  // Add asset to items
  const addAsset = useCallback((asset: Asset) => {
    const imageUrl = assetImages[asset.id];
    if (!imageUrl) return;
    
    const newItem: ComposerItem = {
      id: `asset-${asset.id}-${Date.now()}`,
      type: 'asset',
      imageUrl,
      label: asset.name,
      caption: asset.description || ''
    };
    
    setItems(prev => [...prev, newItem]);
  }, [assetImages]);

  // Remove item
  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  // Move item
  const moveItem = useCallback((fromIdx: number, toIdx: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const [removed] = newItems.splice(fromIdx, 1);
      newItems.splice(toIdx, 0, removed);
      return newItems;
    });
  }, []);

  // Export to canvas
  const exportCanvas = useCallback(async () => {
    if (items.length === 0) return;
    
    setIsExporting(true);
    
    try {
      const canvas = document.createElement('canvas');
      const width = 1920;
      const height = layout === 'triptych-vertical' ? 1440 : 1080;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');

      // Background
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      // Load images
      const loadImg = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = url;
        });
      };

      // Layout: Triptych with captions
      if (layout === 'triptych' && items.length >= 3) {
        const captionHeight = showCaptions ? 100 : 0;
        const imageHeight = height - captionHeight;
        const sectionWidth = width / 3;

        for (let i = 0; i < 3; i++) {
          const item = items[i];
          if (!item?.imageUrl) continue;

          try {
            const img = await loadImg(item.imageUrl);
            
            // Draw image (object-fit cover)
            const imgRatio = img.width / img.height;
            const targetRatio = sectionWidth / imageHeight;
            let dw, dh, dx, dy;
            
            if (imgRatio > targetRatio) {
              dh = imageHeight;
              dw = imageHeight * imgRatio;
              dy = 0;
              dx = (sectionWidth - dw) / 2;
            } else {
              dw = sectionWidth;
              dh = sectionWidth / imgRatio;
              dx = 0;
              dy = (imageHeight - dh) / 2;
            }

            const targetX = i * sectionWidth;
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(targetX, 0, sectionWidth, imageHeight);
            ctx.clip();
            ctx.drawImage(img, targetX + dx, dy, dw, dh);
            ctx.restore();

            // Divider
            if (i > 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.fillRect(targetX, 0, 2, imageHeight);
            }
          } catch (e) {
            console.warn(`Failed to load image ${i}`, e);
          }
        }

        // Draw captions
        if (showCaptions) {
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(0, imageHeight, width, captionHeight);
          
          ctx.font = '24px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          
          for (let i = 0; i < 3; i++) {
            const item = items[i];
            if (!item) continue;
            
            const x = (i * sectionWidth) + (sectionWidth / 2);
            const y = imageHeight + 55;
            
            // Wrap text if too long
            const maxWidth = sectionWidth - 40;
            const text = item.caption || item.label;
            
            if (ctx.measureText(text).width > maxWidth) {
              ctx.font = '18px sans-serif';
              const lines = wrapText(ctx, text, maxWidth);
              lines.slice(0, 2).forEach((line, idx) => {
                ctx.fillText(line, x, y + idx * 28);
              });
            } else {
              ctx.fillText(text, x, y);
            }
          }
        }
      }

      // Layout: Vertical triptych
      else if (layout === 'triptych-vertical' && items.length >= 3) {
        const captionWidth = showCaptions ? 400 : 0;
        const imageWidth = width - captionWidth;
        const sectionHeight = height / 3;

        for (let i = 0; i < 3; i++) {
          const item = items[i];
          if (!item?.imageUrl) continue;

          try {
            const img = await loadImg(item.imageUrl);
            const targetY = i * sectionHeight;
            
            // Draw image
            const imgRatio = img.width / img.height;
            const targetRatio = imageWidth / sectionHeight;
            let dw, dh, dx, dy;
            
            if (imgRatio > targetRatio) {
              dh = sectionHeight;
              dw = sectionHeight * imgRatio;
              dy = 0;
              dx = (imageWidth - dw) / 2;
            } else {
              dw = imageWidth;
              dh = imageWidth / imgRatio;
              dx = 0;
              dy = (sectionHeight - dh) / 2;
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, targetY, imageWidth, sectionHeight);
            ctx.clip();
            ctx.drawImage(img, dx, targetY + dy, dw, dh);
            ctx.restore();

            // Divider
            if (i > 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.fillRect(0, targetY, imageWidth, 2);
            }
          } catch (e) {
            console.warn(`Failed to load image ${i}`, e);
          }
        }

        // Draw captions sidebar
        if (showCaptions) {
          ctx.fillStyle = 'rgba(20,20,20,1)';
          ctx.fillRect(imageWidth, 0, captionWidth, height);
          
          ctx.textAlign = 'left';
          
          for (let i = 0; i < 3; i++) {
            const item = items[i];
            if (!item) continue;
            
            const y = (i * sectionHeight) + 40;
            
            // Label
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = '#60a5fa';
            ctx.fillText(`Shot ${i + 1}`, imageWidth + 20, y);
            
            // Caption
            ctx.font = '16px sans-serif';
            ctx.fillStyle = '#9ca3af';
            const lines = wrapText(ctx, item.caption || '', captionWidth - 40);
            lines.slice(0, 5).forEach((line, idx) => {
              ctx.fillText(line, imageWidth + 20, y + 30 + idx * 24);
            });
          }
        }
      }

      // Layout: 2x2 Grid
      else if (layout === 'grid-2x2') {
        const captionHeight = showCaptions ? 60 : 0;
        const gridWidth = width / 2;
        const gridHeight = (height - captionHeight * 2) / 2;

        for (let i = 0; i < Math.min(4, items.length); i++) {
          const item = items[i];
          if (!item?.imageUrl) continue;

          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = col * gridWidth;
          const y = row * (gridHeight + captionHeight);

          try {
            const img = await loadImg(item.imageUrl);
            
            // Draw image
            const imgRatio = img.width / img.height;
            const targetRatio = gridWidth / gridHeight;
            let dw, dh, dx, dy;
            
            if (imgRatio > targetRatio) {
              dh = gridHeight;
              dw = gridHeight * imgRatio;
              dy = 0;
              dx = (gridWidth - dw) / 2;
            } else {
              dw = gridWidth;
              dh = gridWidth / imgRatio;
              dx = 0;
              dy = (gridHeight - dh) / 2;
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, gridWidth, gridHeight);
            ctx.clip();
            ctx.drawImage(img, x + dx, y + dy, dw, dh);
            ctx.restore();

            // Caption
            if (showCaptions) {
              ctx.fillStyle = 'rgba(0,0,0,0.8)';
              ctx.fillRect(x, y + gridHeight, gridWidth, captionHeight);
              
              ctx.font = '18px sans-serif';
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'center';
              ctx.fillText(
                (item.caption || item.label).substring(0, 50),
                x + gridWidth / 2,
                y + gridHeight + 38
              );
            }
          } catch (e) {
            console.warn(`Failed to load image ${i}`, e);
          }
        }
      }

      // Convert to blob and save
      canvas.toBlob(async (blob) => {
        if (blob) {
          await onSave(blob);
          onClose();
        }
      }, 'image/jpeg', 0.95);

    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setIsExporting(false);
    }
  }, [items, layout, showCaptions, background, onSave, onClose]);

  // Helper: wrap text
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const chars = text.split('');
    const lines: string[] = [];
    let line = '';
    
    for (const char of chars) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  if (!isOpen) return null;

  // Use Portal to render modal at document.body level, bypassing parent transform containment
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🎨 拼图编辑器
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCanvas}
              disabled={isExporting || items.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? '导出中...' : '💾 保存拼图'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Preview */}
          <div className="flex-1 p-4 overflow-auto">
            <div 
              className="rounded-xl overflow-hidden border border-white/10"
              style={{ backgroundColor: background }}
            >
              {/* Preview based on layout */}
              {layout === 'triptych' && (
                <div className="flex flex-col">
                  <div className="flex">
                    {items.slice(0, 3).map((item, idx) => (
                      <div key={item.id} className="flex-1 relative group">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl} 
                            className="w-full aspect-video object-cover"
                            alt={item.label}
                          />
                        ) : (
                          <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-gray-500">
                            空
                          </div>
                        )}
                        {/* Actions */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {idx > 0 && (
                            <button
                              onClick={() => moveItem(idx, idx - 1)}
                              className="w-6 h-6 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                            >
                              ←
                            </button>
                          )}
                          {idx < 2 && (
                            <button
                              onClick={() => moveItem(idx, idx + 1)}
                              className="w-6 h-6 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                            >
                              →
                            </button>
                          )}
                        </div>
                        {idx > 0 && (
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white/10" />
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Captions */}
                  {showCaptions && (
                    <div className="flex bg-black/80">
                      {items.slice(0, 3).map((item, idx) => (
                        <div key={`caption-${item.id}`} className="flex-1 p-3 border-r border-white/5 last:border-r-0">
                          {editingId === item.id ? (
                            <textarea
                              autoFocus
                              value={item.caption}
                              onChange={(e) => updateCaption(item.id, e.target.value)}
                              onBlur={() => setEditingId(null)}
                              className="w-full bg-transparent text-white text-xs resize-none outline-none"
                              rows={2}
                            />
                          ) : (
                            <p 
                              onClick={() => setEditingId(item.id)}
                              className="text-xs text-gray-300 text-center cursor-pointer hover:text-white line-clamp-2"
                              title="点击编辑"
                            >
                              {item.caption || `Shot ${idx + 1} - 点击添加备注`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {layout === 'grid-2x2' && (
                <div className="grid grid-cols-2">
                  {items.slice(0, 4).map((item, idx) => (
                    <div key={item.id} className="relative group">
                      {item.imageUrl ? (
                        <img 
                          src={item.imageUrl} 
                          className="w-full aspect-video object-cover"
                          alt={item.label}
                        />
                      ) : (
                        <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-gray-500">
                          空
                        </div>
                      )}
                      {showCaptions && (
                        <div className="bg-black/80 p-2">
                          {editingId === item.id ? (
                            <textarea
                              autoFocus
                              value={item.caption}
                              onChange={(e) => updateCaption(item.id, e.target.value)}
                              onBlur={() => setEditingId(null)}
                              className="w-full bg-transparent text-white text-xs resize-none outline-none"
                              rows={1}
                            />
                          ) : (
                            <p 
                              onClick={() => setEditingId(item.id)}
                              className="text-[10px] text-gray-300 text-center cursor-pointer hover:text-white truncate"
                            >
                              {item.caption || item.label}
                            </p>
                          )}
                        </div>
                      )}
                      {/* Remove button */}
                      {item.type === 'asset' && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-64 border-l border-white/5 p-4 overflow-y-auto shrink-0 space-y-4">
            {/* Layout */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">布局模板</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'triptych', label: '三联画', icon: '▢▢▢' },
                  { id: 'grid-2x2', label: '四格网格', icon: '▢▢\n▢▢' },
                ].map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLayout(l.id as LayoutType)}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      layout === l.id 
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400' 
                        : 'border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-[10px] font-mono whitespace-pre">{l.icon}</div>
                    <div className="text-[9px] mt-1">{l.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">选项</label>
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={showCaptions}
                  onChange={(e) => setShowCaptions(e.target.checked)}
                  className="rounded"
                />
                显示文字备注
              </label>
            </div>

            {/* Background */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">背景颜色</label>
              <div className="flex gap-2">
                {['#000000', '#1a1a1a', '#0f172a'].map(color => (
                  <button
                    key={color}
                    onClick={() => setBackground(color)}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${
                      background === color ? 'border-blue-500' : 'border-white/10'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Assets */}
            {assets.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">添加资产</label>
                <div className="grid grid-cols-2 gap-2">
                  {assets.slice(0, 6).map(asset => (
                    <button
                      key={asset.id}
                      onClick={() => addAsset(asset)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-blue-500/50 transition-colors group"
                    >
                      {assetImages[asset.id] ? (
                        <img 
                          src={assetImages[asset.id]} 
                          className="w-full h-full object-cover"
                          alt={asset.name}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xl text-gray-600">
                          {asset.type === 'character' ? '👤' : asset.type === 'scene' ? '🏞️' : '📦'}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                        <span className="text-white/0 group-hover:text-white text-lg">+</span>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5">
                        <span className="text-[8px] text-white truncate block text-center px-1">
                          {asset.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ComposerModal;

