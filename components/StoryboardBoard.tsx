import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Project, Volume, WebtoonScript, ScriptPanel, Asset, AppSettings, PipelineStatus, PanelShot, ShotSize } from '../types';
import { loadAssetImage, saveImageToAssets } from '../services/fileSystem';
import { VideoGeneratorPanel } from './VideoGeneratorPanel';
import { generateImage, getVisualDescription, translateVisualToEnglish, isPrimarilyChinese } from '../services/geminiService';
import { useStoryboardMerger } from '../hooks/useStoryboardMerger';
import { ComposerModal } from './ComposerModal';
import { VideoReferenceModal } from './VideoReferenceModal';
import {
  generateLineArtTriptych,
  isLineArtAvailable,
  getLineArtAvailabilityMessage,
} from '../services/lineArtTriptychService';
import {
  shouldUseCrossPanelContinuity,
  buildContinuityContract,
  buildShotPrompt,
  buildSingleFrameOutputContract,
  SHOT_PLAN,
  ContinuityAnalysisResult,
} from '../services/microMontageContinuity';
import { getAssetById, getAssetsByIds } from '../services/panelShotResolver';
import type { ContinuityMode } from '../types';
import { playSuccessSound, playSound } from '../services/soundService';

// ============================================================================
// Types
// ============================================================================

interface StoryboardBoardProps {
  project: Project;
  settings: AppSettings;
  onGeneratePanelImage: (panelId: number, prompt: string, episodeNum: number, volId: string) => void;
  onUpdatePanelAssets: (volId: string, episodeNum: number, panelId: number, assetIds: string[], itemIds: string[]) => void;
  onGenerateAssetImage: (assetId: string) => void;
  onUpdateAsset: (asset: Asset) => void;
  onSavePanelImage: (panelId: number, imageBlob: Blob | string, episodeNum: number, volId: string) => Promise<void>;
  onUpdatePanels: (volId: string, episodeNum: number, newPanels: ScriptPanel[]) => void;
  onSelectHistoryImage: (panelId: number, path: string, episodeNum: number, volId: string) => void;
  onSelectAssetHistoryImage: (assetId: string, url: string) => void;
  onRelinkAllPanels?: () => void;
  status: PipelineStatus;
  generatingItemIds: Set<string>;
  onTaskStart: (desc: string, type?: string, model?: string) => string;
  onTaskFinish: (id: string, status: 'success' | 'error') => void;
}

interface InspectorState {
  type: 'asset' | 'panel';
  data: Asset | ScriptPanel;
  volId?: string;
  episodeNum?: number;
}

interface DisplayPanel {
  vol: Volume;
  script: WebtoonScript;
  panel: ScriptPanel;
}

// ============================================================================
// Helper Functions
// ============================================================================

const parseTimestampFromPath = (path: string): number | null => {
  const match = path.match(/_(\d+)\.(png|jpg|jpeg|webp)$/i);
  return match ? parseInt(match[1], 10) : null;
};

const formatRelativeTime = (ts: number): string => {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
};

// ============================================================================
// Main Component
// ============================================================================

export const StoryboardBoard: React.FC<StoryboardBoardProps> = ({
  project, settings, onGeneratePanelImage, onUpdatePanelAssets, onGenerateAssetImage,
  onUpdateAsset, onSavePanelImage, onUpdatePanels, onSelectHistoryImage, onSelectAssetHistoryImage,
  onRelinkAllPanels, status, generatingItemIds, onTaskStart, onTaskFinish
}) => {
  // State
  const [selectedVolId, setSelectedVolId] = useState<string>('all');
  const [selectedEpNum, setSelectedEpNum] = useState<number | 'all'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspector, setInspector] = useState<InspectorState | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [assetImages, setAssetImages] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [globalNoFilter, setGlobalNoFilter] = useState<string>(''); // e.g. "1-50" or "34"

  // Inspector width (resizable, per-page memory)
  const INSPECTOR_PAGE_KEY = 'STORYBOARD';
  const INSPECTOR_WIDTH_STORAGE_KEY = `autoManju:inspectorWidth:${INSPECTOR_PAGE_KEY}`;
  const INSPECTOR_WIDTH_DEFAULT = 480;
  const INSPECTOR_WIDTH_MIN = 320;
  const INSPECTOR_WIDTH_MAX = 720;
  const INSPECTOR_WIDTH_STEP = 10;

  // (Removed debug-only network logging hooks)

  // NOTE: We keep these width classes explicit so Tailwind can statically include them.
  const INSPECTOR_WIDTH_CLASS_MAP: Record<number, string> = {
    320: 'w-[320px]',
    330: 'w-[330px]',
    340: 'w-[340px]',
    350: 'w-[350px]',
    360: 'w-[360px]',
    370: 'w-[370px]',
    380: 'w-[380px]',
    390: 'w-[390px]',
    400: 'w-[400px]',
    410: 'w-[410px]',
    420: 'w-[420px]',
    430: 'w-[430px]',
    440: 'w-[440px]',
    450: 'w-[450px]',
    460: 'w-[460px]',
    470: 'w-[470px]',
    480: 'w-[480px]',
    490: 'w-[490px]',
    500: 'w-[500px]',
    510: 'w-[510px]',
    520: 'w-[520px]',
    530: 'w-[530px]',
    540: 'w-[540px]',
    550: 'w-[550px]',
    560: 'w-[560px]',
    570: 'w-[570px]',
    580: 'w-[580px]',
    590: 'w-[590px]',
    600: 'w-[600px]',
    610: 'w-[610px]',
    620: 'w-[620px]',
    630: 'w-[630px]',
    640: 'w-[640px]',
    650: 'w-[650px]',
    660: 'w-[660px]',
    670: 'w-[670px]',
    680: 'w-[680px]',
    690: 'w-[690px]',
    700: 'w-[700px]',
    710: 'w-[710px]',
    720: 'w-[720px]',
  };

  const clampInspectorWidth = useCallback((v: number): number => {
    const clamped = Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, v));
    const snappedSteps = Math.round((clamped - INSPECTOR_WIDTH_MIN) / INSPECTOR_WIDTH_STEP);
    const snapped = INSPECTOR_WIDTH_MIN + snappedSteps * INSPECTOR_WIDTH_STEP;
    return Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, snapped));
  }, []);

  const [inspectorWidthPx, setInspectorWidthPx] = useState<number>(INSPECTOR_WIDTH_DEFAULT);
  const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inspectorWidthPxRef = useRef<number>(INSPECTOR_WIDTH_DEFAULT);
  // (Removed debug-only inspector logging)

  useEffect(() => {
    inspectorWidthPxRef.current = inspectorWidthPx;
  }, [inspectorWidthPx]);

  // Load persisted width (per page)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      setInspectorWidthPx(clampInspectorWidth(parsed));
    } catch {
      // ignore
    }
  }, [INSPECTOR_WIDTH_STORAGE_KEY, clampInspectorWidth]);

  const persistInspectorWidth = useCallback((px: number) => {
    try {
      localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(px));
    } catch {
      // ignore
    }
  }, [INSPECTOR_WIDTH_STORAGE_KEY]);

  const inspectorWidthClass = INSPECTOR_WIDTH_CLASS_MAP[inspectorWidthPx] || 'w-[480px]';

  const handleInspectorResizerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Left-button only for mouse; touch/pen are fine
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizingInspector(true);

    const updateFromClientX = (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextWidth = rect.right - clientX;
      setInspectorWidthPx(clampInspectorWidth(nextWidth));
    };

    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      setIsResizingInspector(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Persist final width
      persistInspectorWidth(inspectorWidthPxRef.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [clampInspectorWidth, persistInspectorWidth]);

  // Parse global number filter
  const parsedGlobalFilter = useMemo(() => {
    if (!globalNoFilter.trim()) return null;
    const trimmed = globalNoFilter.trim();
    // Range format: "1-50"
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-').map(p => parseInt(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { from: Math.min(parts[0], parts[1]), to: Math.max(parts[0], parts[1]) };
      }
    }
    // Single number format: "34"
    const single = parseInt(trimmed);
    if (!isNaN(single)) {
      return { from: single, to: single };
    }
    return null;
  }, [globalNoFilter]);

  // Computed: Display panels (with global number filter)
  const displayPanels = useMemo<DisplayPanel[]>(() => {
    const panels: DisplayPanel[] = [];
    project.volumes.forEach(vol => {
      if (selectedVolId !== 'all' && vol.id !== selectedVolId) return;
      (Object.values(vol.scriptCache) as WebtoonScript[]).forEach(script => {
        if (selectedEpNum !== 'all' && script.episode_number !== selectedEpNum) return;
        (script.panels || []).forEach(panel => {
          // Apply global number filter
          if (parsedGlobalFilter) {
            const globalNo = panel.globalPanelNo ?? panel.panel_id;
            if (globalNo < parsedGlobalFilter.from || globalNo > parsedGlobalFilter.to) {
              return; // Skip this panel
            }
          }
          panels.push({ vol, script, panel });
        });
      });
    });
    return panels;
  }, [project, selectedVolId, selectedEpNum, parsedGlobalFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = displayPanels.length;
    const withImage = displayPanels.filter(p => p.panel.imagePath).length;
    const totalDuration = displayPanels.reduce((sum, p) => {
      const dur = parseInt(p.panel.duration || '0');
      return sum + (isNaN(dur) ? 0 : dur);
    }, 0);
    return { total, withImage, totalDuration };
  }, [displayPanels]);

  // Load asset images
  useEffect(() => {
    const load = async () => {
      const map: Record<string, string> = {};
      for (const asset of project.assets) {
        if (asset.imagePath) {
          try {
          map[asset.id] = await loadAssetImage(asset.imagePath);
          } catch (e) {
            console.warn('Failed to load asset image:', asset.id, e);
          }
        }
      }
      setAssetImages(map);
    };
    load();
  }, [project.assets]);

  // Get asset image URL helper
  const getAssetImageUrl = useCallback((assetId: string) => {
    return assetImages[assetId] || '';
  }, [assetImages]);

  // Update single panel
  const handleUpdatePanel = useCallback((panelId: number, updates: Partial<ScriptPanel>) => {
    // CRITICAL FIX: Only update the panel in the currently inspected episode
    // Previously updated ALL episodes with matching panel_id, causing wrong episode to get triptych data
    if (!inspector || inspector.type !== 'panel') {
      return;
    }
    
    const targetVolId = inspector.volId;
    const targetEpisodeNum = inspector.episodeNum;
    
    // Find vol and script to get all panels
    const vol = project.volumes.find(v => v.id === targetVolId);
    if (!vol) return;
    
    const script = vol.scriptCache[targetEpisodeNum];
    if (!script) return;
    
    // CRITICAL FIX: Read the latest panel from script.panels instead of inspector.data
    // inspector.data may be stale when handleUpdatePanelAssets updates happen asynchronously
    // This ensures we always merge with the most recent panel state from project
    const latestPanel = script.panels?.find(p => p.panel_id === panelId);
    if (!latestPanel) return;
    
    // Merge updates with latest panel from script (source of truth)
    // CRITICAL: Deep clone array fields to prevent shared references between panels
    const mergedPanel = { 
      ...latestPanel, 
      ...updates,
      // Deep clone segmentPrompts if present in updates to avoid shared references
      ...(updates.segmentPrompts ? { 
        segmentPrompts: JSON.parse(JSON.stringify(updates.segmentPrompts)) 
      } : {}),
      // Deep clone shots if present in updates to avoid shared references
      ...(updates.shots ? { 
        shots: JSON.parse(JSON.stringify(updates.shots)) as [PanelShot, PanelShot, PanelShot]
      } : {})
    };
    
    const newPanels = (script.panels || []).map(p =>
      p.panel_id === panelId ? mergedPanel : p
    );
    
    onUpdatePanels(targetVolId, targetEpisodeNum, newPanels);
  }, [inspector, project.volumes, onUpdatePanels]);

  // Assign unified global panel numbers across all scripts (volume order -> episode -> panel_id)
  const handleAssignGlobalPanelNumbers = useCallback(() => {
    let counter = 1;

    const sortedVolumes = [...project.volumes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const vol of sortedVolumes) {
      const scripts = (Object.values(vol.scriptCache || {}) as WebtoonScript[])
        .sort((a, b) => a.episode_number - b.episode_number);
      for (const script of scripts) {
        const panels = ([...(script.panels || [])] as ScriptPanel[])
          .sort((a, b) => a.panel_id - b.panel_id);
        const newPanels = panels.map(p => ({
          ...p,
          globalPanelNo: counter++,
        }));
        onUpdatePanels(vol.id, script.episode_number, newPanels);
      }
    }
  }, [project.volumes, onUpdatePanels]);

  // ============================================================================
  // JSX
  // ============================================================================

  const volumes = project.volumes;
  const episodes = useMemo(() => {
    if (selectedVolId === 'all') {
      const allEps: number[] = [];
      volumes.forEach(v => Object.keys(v.scriptCache).forEach(ep => allEps.push(Number(ep))));
      return [...new Set(allEps)].sort((a, b) => a - b);
    } else {
      const vol = volumes.find(v => v.id === selectedVolId);
      return vol ? Object.keys(vol.scriptCache).map(Number).sort((a, b) => a - b) : [];
    }
  }, [volumes, selectedVolId]);

  // Get linked assets for a panel
  const getLinkedAssets = useCallback((panel: ScriptPanel) => {
    const assetIds = panel.relatedAssetIds || [];
    const itemIds = panel.relatedItemIds || [];
    const allIds = [...assetIds, ...itemIds];
    const byId = new Map<string, Asset>(project.assets.map(a => [a.id, a]));
    // Preserve stored order (assets first, then items)
    return allIds.map(id => byId.get(id)).filter((a): a is Asset => Boolean(a));
  }, [project.assets]);

  const handleSelectPanel = useCallback((dp: DisplayPanel) => {
    setInspector({ type: 'panel', data: dp.panel, volId: dp.vol.id, episodeNum: dp.script.episode_number });
  }, [setInspector]);

  // CRITICAL FIX: Sync inspector.data with latest project data when updates occur
  // This prevents stale panel data from being used when triptych_sources/videoRefPath/imagePath are added
  // NOTE: Read directly from project instead of displayPanels to bypass useMemo cache delay
  useEffect(() => {
    setInspector(prev => {
      if (!prev || prev.type !== 'panel') {
        return prev;
      }
      
      const panel = prev.data as ScriptPanel;
      
      // CRITICAL: Find latest panel directly from project.volumes to bypass displayPanels useMemo delay
      const vol = project.volumes.find(v => v.id === prev.volId);
      if (!vol) return prev;
      
      const script = vol.scriptCache[prev.episodeNum];
      if (!script) return prev;
      
      const latestPanelData = script.panels?.find(p => p.panel_id === panel.panel_id);
      if (!latestPanelData) {
        return prev;
      }
      
      // Check if panel data has changed (use triptych_sources and videoGenerations as key indicators)
      const oldTriptychLength = panel.triptych_sources?.length || 0;
      const newTriptychLength = latestPanelData.triptych_sources?.length || 0;
      const oldVideoGenCount = panel.videoGenerations?.length || 0;
      const newVideoGenCount = latestPanelData.videoGenerations?.length || 0;
      // Also check if any generation status changed (e.g., processing -> success)
      const oldVideoGenKey = (panel.videoGenerations || []).map(g => `${g.id}:${g.status}`).join(',');
      const newVideoGenKey = (latestPanelData.videoGenerations || []).map(g => `${g.id}:${g.status}`).join(',');
      const oldVideoRefPath = panel.videoRefPath || '';
      const newVideoRefPath = latestPanelData.videoRefPath || '';
      const oldImagePath = panel.imagePath || '';
      const newImagePath = latestPanelData.imagePath || '';
      
      const oldRelatedAssetIds = (panel.relatedAssetIds || []).join(',');
      const newRelatedAssetIds = (latestPanelData.relatedAssetIds || []).join(',');
      const oldRelatedItemIds = (panel.relatedItemIds || []).join(',');
      const newRelatedItemIds = (latestPanelData.relatedItemIds || []).join(',');
      
      // CRITICAL: Check continuityMode to prevent infinite loop in TriptychGenerator
      const oldContinuityMode = panel.continuityMode || 'auto';
      const newContinuityMode = latestPanelData.continuityMode || 'auto';
      
      const needsSync = oldTriptychLength !== newTriptychLength || 
                        oldVideoGenCount !== newVideoGenCount ||
                        oldVideoGenKey !== newVideoGenKey ||
                        oldVideoRefPath !== newVideoRefPath ||
                        oldImagePath !== newImagePath ||
                        oldRelatedAssetIds !== newRelatedAssetIds ||
                        oldRelatedItemIds !== newRelatedItemIds ||
                        oldContinuityMode !== newContinuityMode;
      
      if (needsSync) {
        return {
          type: 'panel',
          data: latestPanelData,
          volId: prev.volId,
          episodeNum: prev.episodeNum
        };
      }
      
      return prev;
    });
  }, [project]); // Changed from displayPanels to project to directly track project updates

  // ============================================================================
  // Return JSX
  // ============================================================================

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden bg-[#0A0A0A]">
      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="shrink-0 px-6 py-4 border-b border-white/5 bg-[#0D0D0D]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                🎬 <span>分镜管理</span>
              </h2>
              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedVolId}
                  onChange={e => {
                    setSelectedVolId(e.target.value);
                    setSelectedEpNum('all');
                  }}
                  className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300"
                >
                  <option value="all">全部卷</option>
                  {volumes.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <select
                  value={selectedEpNum}
                  onChange={e => setSelectedEpNum(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300"
                >
                  <option value="all">全部集</option>
                  {episodes.map(ep => (
                    <option key={ep} value={ep}>第 {ep} 集</option>
                  ))}
                </select>
                {/* Global Panel Number Filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">#</span>
                  <input
                    type="text"
                    value={globalNoFilter}
                    onChange={e => setGlobalNoFilter(e.target.value)}
                    placeholder="1-50"
                    className="w-20 bg-[#1A1A1A] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-300 placeholder-gray-600"
                    title="筛选全局序号 (如: 34 或 1-50)"
                  />
                  {globalNoFilter && (
                    <button
                      onClick={() => setGlobalNoFilter('')}
                      className="text-gray-500 hover:text-gray-300 text-xs"
                      title="清除筛选"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Stats & Actions */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>📊 {stats.withImage}/{stats.total} 已绘制</span>
                <span>⏱ {Math.floor(stats.totalDuration / 60)}:{(stats.totalDuration % 60).toString().padStart(2, '0')}</span>
              </div>
              
              {/* View Mode */}
              <div className="flex items-center gap-1 bg-[#1A1A1A] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1 rounded text-xs transition-all ${
                    viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  ☰
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-1 rounded text-xs transition-all ${
                    viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  ⊞
                </button>
              </div>
              
              {/* Relink Button */}
              {onRelinkAllPanels && (
                <button
                  onClick={onRelinkAllPanels}
                  className="px-3 py-1.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium hover:bg-purple-600/30 transition-colors"
                >
                  🔗 智能关联全部
                </button>
              )}

              {/* Global Panel Numbering */}
              <button
                onClick={handleAssignGlobalPanelNumbers}
                className="px-3 py-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
                title="跨卷/跨集统一生成全局分镜序号（volume.order → episode_number → panel_id）"
              >
                🔢 全局序号
              </button>
            </div>
          </div>
        </div>

        {/* Panel List/Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {viewMode === 'list' ? (
            <div className="space-y-3">
              {(() => {
                // Group panels by vol > episode for hierarchical display
                let lastVolId = '';
                let lastEpNum = -1;
                
                return displayPanels.map((dp, idx) => {
                  const elements: React.ReactNode[] = [];
                  
                  // Volume Header
                  if (dp.vol.id !== lastVolId) {
                    lastVolId = dp.vol.id;
                    lastEpNum = -1; // Reset episode tracking
                    elements.push(
                      <div key={`vol-${dp.vol.id}`} className="flex items-center gap-3 pt-4 pb-2 first:pt-0">
                        <div className="h-px flex-1 bg-gradient-to-r from-purple-500/30 to-transparent" />
                        <span className="px-3 py-1 bg-purple-600/20 text-purple-300 text-xs font-bold rounded-full border border-purple-500/30">
                          📚 {dp.vol.name}
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-l from-purple-500/30 to-transparent" />
                      </div>
                    );
                  }
                  
                  // Episode Header
                  if (dp.script.episode_number !== lastEpNum) {
                    lastEpNum = dp.script.episode_number;
                    const epPanels = displayPanels.filter(p => p.vol.id === dp.vol.id && p.script.episode_number === dp.script.episode_number);
                    const epGlobalRange = epPanels.length > 0 
                      ? `#${epPanels[0].panel.globalPanelNo ?? epPanels[0].panel.panel_id} - #${epPanels[epPanels.length - 1].panel.globalPanelNo ?? epPanels[epPanels.length - 1].panel.panel_id}`
                      : '';
                    elements.push(
                      <div key={`ep-${dp.vol.id}-${dp.script.episode_number}`} className="flex items-center gap-2 pt-3 pb-2 ml-4">
                        <span className="px-2.5 py-1 bg-green-600/20 text-green-300 text-xs font-medium rounded-lg border border-green-500/30">
                          📺 第 {dp.script.episode_number} 集
                        </span>
                        <span className="text-[10px] text-gray-600">{epPanels.length} 镜</span>
                        {epGlobalRange && (
                          <span className="text-[10px] text-gray-600">({epGlobalRange})</span>
                        )}
                      </div>
                    );
                  }
                  
                  // Panel Row
                  elements.push(
                    <PanelRow
                      key={`${dp.vol.id}-${dp.script.episode_number}-${dp.panel.panel_id}`}
                      dp={dp}
                      assetImages={assetImages}
                      getLinkedAssets={getLinkedAssets}
                      generatingItemIds={generatingItemIds}
                      isSelected={inspector?.type === 'panel' && 
                        (inspector.data as ScriptPanel).panel_id === dp.panel.panel_id &&
                        inspector.volId === dp.vol.id &&
                        inspector.episodeNum === dp.script.episode_number}
                      onSelect={() => handleSelectPanel(dp)}
                      onPreview={setPreviewImage}
                      onUpdatePanel={handleUpdatePanel}
                    />
                  );
                  
                  return elements;
                });
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayPanels.map(dp => (
                <PanelCard
                  key={`${dp.vol.id}-${dp.script.episode_number}-${dp.panel.panel_id}`}
                  dp={dp}
                  generatingItemIds={generatingItemIds}
                  isSelected={inspector?.type === 'panel' && 
                    (inspector.data as ScriptPanel).panel_id === dp.panel.panel_id &&
                    inspector.volId === dp.vol.id &&
                    inspector.episodeNum === dp.script.episode_number}
                onSelect={() => handleSelectPanel(dp)}
                  onPreview={setPreviewImage}
                />
              ))}
            </div>
          )}
          
          {displayPanels.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <span className="text-4xl mb-4 opacity-30">📋</span>
              <p className="text-sm">暂无分镜</p>
              <p className="text-xs mt-1">请先在剧本工坊中生成剧本分镜</p>
            </div>
          )}
        </div>
      </div>

      {/* Resizer gutter (between main area and inspector) */}
      <div className="relative shrink-0 w-2 bg-[#0A0A0A]">
        {/* Visual divider */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/5" />
        {/* Hit area */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整右侧面板宽度"
          className={`absolute inset-y-0 inset-x-0 cursor-col-resize transition-colors ${
            isResizingInspector ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
          onPointerDown={handleInspectorResizerPointerDown}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = inspectorWidthPx === INSPECTOR_WIDTH_DEFAULT ? 640 : INSPECTOR_WIDTH_DEFAULT;
            const snapped = clampInspectorWidth(next);
            setInspectorWidthPx(snapped);
            persistInspectorWidth(snapped);
          }}
        />
      </div>

      {/* Inspector Panel */}
      <InspectorPanel
        inspector={inspector}
        project={project}
        settings={settings}
        assetImages={assetImages}
        generatingItemIds={generatingItemIds}
        onClose={() => setInspector(null)}
        onPreview={setPreviewImage}
        onGeneratePanelImage={onGeneratePanelImage}
        onSavePanelImage={onSavePanelImage}
        onSelectHistoryImage={onSelectHistoryImage}
        onUpdatePanelAssets={onUpdatePanelAssets}
        onGenerateAssetImage={onGenerateAssetImage}
        onSelectAssetHistoryImage={onSelectAssetHistoryImage}
        onUpdatePanel={handleUpdatePanel}
        onUpdateAsset={onUpdateAsset}
        onTaskStart={onTaskStart}
        onTaskFinish={onTaskFinish}
        widthClassName={inspectorWidthClass}
      />

      {/* Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <img 
            src={previewImage} 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Panel Row (List View)
// ============================================================================

// Helper to format duration (removes trailing 's' if present to avoid "10ss")
const formatDuration = (dur: string | undefined): string => {
  if (!dur) return '';
  return String(dur).replace(/s$/i, '');
};

const PanelRow: React.FC<{
  dp: DisplayPanel;
  assetImages: Record<string, string>;
  getLinkedAssets: (panel: ScriptPanel) => Asset[];
  generatingItemIds: Set<string>;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: (url: string) => void;
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
}> = ({ dp, assetImages, getLinkedAssets, generatingItemIds, isSelected, onSelect, onPreview, onUpdatePanel }) => {
  const { panel, vol, script } = dp;
  const linkedAssets = getLinkedAssets(panel);
  const isGenerating = generatingItemIds.has(`panel-${panel.panel_id}`);
  
  const pickerRef = useRef<HTMLDivElement>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Local edit states (for responsive editing)
  const [editScriptContent, setEditScriptContent] = useState(panel.script_content || '');
  const [editSceneName, setEditSceneName] = useState(panel.scene_name || '');
  const [editDuration, setEditDuration] = useState(panel.duration || '5s');
  const [editCharacters, setEditCharacters] = useState(panel.active_characters_str || '');
  const [editProps, setEditProps] = useState(panel.props || '');
  const [editComposition, setEditComposition] = useState(panel.composition || '');

  // Sync local states when panel changes externally
  useEffect(() => {
    setEditScriptContent(panel.script_content || '');
    setEditSceneName(panel.scene_name || '');
    setEditDuration(panel.duration || '5s');
    setEditCharacters(panel.active_characters_str || '');
    setEditProps(panel.props || '');
    setEditComposition(panel.composition || '');
  }, [panel]);

  // Get visual lines from script
  const visualLines = useMemo(() => {
    const lines = panel.script_content?.split('\n')
      .filter(l => l.trim().startsWith('▲'))
      .map(l => l.replace(/^▲/, '').trim()) || [];
    return lines.slice(0, 3);
  }, [panel.script_content]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAssetPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle double click to expand
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Save all edits
  const handleSaveEdits = () => {
    onUpdatePanel(panel.panel_id, {
      script_content: editScriptContent,
      scene_name: editSceneName,
      duration: editDuration,
      active_characters_str: editCharacters,
      props: editProps,
      composition: editComposition,
    });
  };

  // Auto-save on blur
  const handleFieldBlur = () => {
    handleSaveEdits();
  };
  
  return (
    <div 
      className={`group bg-[#141414] rounded-xl border overflow-hidden transition-all ${
        isSelected ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-white/5 hover:border-white/10'
      } ${isExpanded ? 'bg-[#1A1A1A]' : 'hover:bg-[#1A1A1A] cursor-pointer'}`}
      onClick={!isExpanded ? onSelect : undefined}
      onDoubleClick={handleDoubleClick}
    >
      {/* Main Row */}
      <div className="flex">
        {/* Left: Global Panel Number */}
        <div className="w-16 shrink-0 flex flex-col items-center justify-center bg-[#0D0D0D] border-r border-white/5">
          <span className="text-2xl font-black text-blue-400">
            {panel.globalPanelNo ?? panel.panel_id}
          </span>
          <span className="text-[10px] text-gray-600 mt-0.5">#{panel.panel_id}</span>
        </div>
        
        {/* Thumbnail */}
        <div className="w-36 aspect-video bg-[#0A0A0A] shrink-0 relative">
          {panel.imagePath ? (
            <AsyncImage 
              path={panel.imagePath} 
              className="w-full h-full object-cover"
              onClick={(e) => {
                e.stopPropagation();
                loadAssetImage(panel.imagePath!).then(url => onPreview(url));
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-700">
              <span className="text-2xl opacity-30">🖼️</span>
            </div>
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-blue-400/50 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Scene & Duration & Hierarchy */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-bold text-gray-200 truncate">
                  {panel.scene_name || `场景 ${panel.globalPanelNo ?? panel.panel_id}`}
                </span>
                <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 text-[10px] rounded-full font-medium">
                  {vol.name}
                </span>
                <span className="px-2 py-0.5 bg-green-600/20 text-green-300 text-[10px] rounded-full font-medium">
                  E{script.episode_number}
                </span>
                {panel.duration && (
                  <span className="px-2 py-0.5 bg-orange-600/20 text-orange-300 text-[10px] rounded-full font-medium">
                    ⏱ {formatDuration(panel.duration)}s
                  </span>
                )}
                {/* Expand/Collapse Hint */}
                <span className="text-[10px] text-gray-600 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  双击{isExpanded ? '收起' : '展开'}编辑
                </span>
              </div>
              
              {/* Visual Lines - Script Content */}
              <div className="space-y-1 mt-2">
                {visualLines.map((line, idx) => (
                  <p key={idx} className="text-sm text-gray-400 leading-relaxed line-clamp-1">
                    <span className="text-gray-500 mr-1">{['🎬', '📷', '🔍'][idx]}</span> {line}
                  </p>
                ))}
                {visualLines.length === 0 && (
                  <p className="text-xs text-gray-600 italic">无视觉描述</p>
                )}
              </div>
            </div>
            
            {/* Linked Assets Avatars */}
            <div className="shrink-0 max-w-[300px] overflow-x-auto custom-scrollbar">
              {linkedAssets.length > 0 ? (
                <div className="flex items-center gap-1.5 py-1">
                  {linkedAssets.map(asset => (
                    <div 
                      key={asset.id} 
                      className="w-10 h-10 rounded-lg border border-white/10 bg-[#252525] overflow-hidden shrink-0"
                      title={asset.name}
                    >
                      {assetImages[asset.id] ? (
                        <img src={assetImages[asset.id]} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
                          {asset.type === 'character' ? '👤' : asset.type === 'scene' ? '🏞️' : '🎒'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-600">无关联</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Edit Section */}
      {isExpanded && (
        <div className="border-t border-white/5 bg-[#0D0D0D] p-4 space-y-4" onClick={e => e.stopPropagation()}>
          {/* Quick Edit Fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">场景名</label>
              <input
                value={editSceneName}
                onChange={e => setEditSceneName(e.target.value)}
                onBlur={handleFieldBlur}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
                placeholder="场景名称"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">时长</label>
              <input
                value={editDuration}
                onChange={e => setEditDuration(e.target.value)}
                onBlur={handleFieldBlur}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
                placeholder="5s"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">角色</label>
              <input
                value={editCharacters}
                onChange={e => setEditCharacters(e.target.value)}
                onBlur={handleFieldBlur}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
                placeholder="角色列表"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">构图</label>
              <select
                value={editComposition}
                onChange={e => { setEditComposition(e.target.value); handleSaveEdits(); }}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="Wide Shot">Wide Shot 全景</option>
                <option value="Medium Shot">Medium Shot 中景</option>
                <option value="Close-up">Close-up 特写</option>
                <option value="Extreme Close-up">Extreme Close-up 大特写</option>
                <option value="Over the Shoulder">Over the Shoulder 过肩</option>
                <option value="POV">POV 主观</option>
                <option value="Bird's Eye">Bird's Eye 俯视</option>
                <option value="Low Angle">Low Angle 仰视</option>
              </select>
            </div>
          </div>
          
          {/* Props Field */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">道具</label>
            <input
              value={editProps}
              onChange={e => setEditProps(e.target.value)}
              onBlur={handleFieldBlur}
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none"
              placeholder="场景中使用的道具"
            />
          </div>

          {/* Script Content */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">
              📝 分镜脚本 <span className="text-gray-600 normal-case">(与剧本页同步)</span>
            </label>
            <textarea
              value={editScriptContent}
              onChange={e => setEditScriptContent(e.target.value)}
              onBlur={handleFieldBlur}
              rows={6}
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none resize-none font-mono leading-relaxed"
              placeholder="▲[景别] [角色]（[视觉细节]） [动作]：..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-gray-600">编辑内容自动保存，点击任意空白处收起</span>
            <button
              onClick={() => setIsExpanded(false)}
              className="px-4 py-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
            >
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Panel Card (Grid View)
// ============================================================================

const PanelCard: React.FC<{
  dp: DisplayPanel;
  generatingItemIds: Set<string>;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: (url: string) => void;
}> = ({ dp, generatingItemIds, isSelected, onSelect, onPreview }) => {
  const { panel, vol, script } = dp;
  const isGenerating = generatingItemIds.has(`panel-${panel.panel_id}`);
  
  return (
    <div 
      className={`group bg-[#141414] rounded-xl border overflow-hidden hover:bg-[#1A1A1A] transition-all cursor-pointer ${
        isSelected ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-white/5 hover:border-white/10'
      }`}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-[#0A0A0A] relative">
        {panel.imagePath ? (
          <AsyncImage 
            path={panel.imagePath} 
            className="w-full h-full object-cover"
            onClick={(e) => {
              e.stopPropagation();
              loadAssetImage(panel.imagePath!).then(url => onPreview(url));
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <span className="text-3xl opacity-30">🖼️</span>
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-blue-400/50 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}
        {/* Panel ID Badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white font-bold">
          #{panel.globalPanelNo ?? panel.panel_id}
        </div>
        {/* Duration Badge */}
        {panel.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
            ⏱ {formatDuration(panel.duration)}s
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-300 truncate">
          {panel.scene_name || `场景 ${panel.globalPanelNo ?? panel.panel_id}`}
        </p>
        <p className="text-xs text-gray-500 truncate mt-1">
          {vol.name} · E{script.episode_number} · P{panel.panel_id}
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// Async Image Component
// ============================================================================

const AsyncImage: React.FC<{
  path: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ path, className, onClick }) => {
  const [src, setSrc] = useState<string>('');
  
  useEffect(() => {
    let mounted = true;
    loadAssetImage(path)
      .then(url => mounted && setSrc(url))
      .catch(() => mounted && setSrc(''));
    return () => { mounted = false; };
  }, [path]);
  
  if (!src) {
    return <div className={className + ' bg-[#1A1A1A] animate-pulse'} />;
  }
  
  return <img src={src} className={className} onClick={onClick} />;
};

// ============================================================================
// Inspector Panel
// ============================================================================

const InspectorPanel: React.FC<{
  inspector: InspectorState | null;
  project: Project;
  settings: AppSettings;
  assetImages: Record<string, string>;
  generatingItemIds: Set<string>;
  onClose: () => void;
  onPreview: (url: string) => void;
  onGeneratePanelImage: (panelId: number, prompt: string, episodeNum: number, volId: string) => void;
  onSavePanelImage: (panelId: number, imageBlob: Blob, episodeNum: number, volId: string) => Promise<void>;
  onSelectHistoryImage: (panelId: number, path: string, episodeNum: number, volId: string) => void;
  onUpdatePanelAssets: (volId: string, episodeNum: number, panelId: number, assetIds: string[], itemIds: string[]) => void;
  onGenerateAssetImage: (assetId: string) => void;
  onSelectAssetHistoryImage: (assetId: string, path: string) => void;
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
  onUpdateAsset: (asset: Asset) => void;
  onTaskStart: (desc: string, type?: string, model?: string) => string;
  onTaskFinish: (id: string, status: 'success' | 'error') => void;
  widthClassName: string;
}> = ({
  inspector,
  project,
  settings,
  assetImages,
  generatingItemIds,
  onClose,
  onPreview,
  onGeneratePanelImage,
  onSavePanelImage,
  onSelectHistoryImage,
  onUpdatePanelAssets,
  onGenerateAssetImage,
  onSelectAssetHistoryImage,
  onUpdatePanel,
  onUpdateAsset,
  onTaskStart,
  onTaskFinish,
  widthClassName
}) => {
  const [subView, setSubView] = useState<{ type: 'asset'; data: Asset } | null>(null);
  
  // Reset subview when inspector changes
  useEffect(() => {
    setSubView(null);
  }, [inspector]);
  
  if (!inspector) {
    return (
      <div className={`${widthClassName} bg-[#0D0D0D] border-l border-white/5 shrink-0 flex flex-col items-center justify-center text-gray-600`}>
        <span className="text-4xl mb-4 opacity-30">👈</span>
        <p className="text-sm">选择一个分镜查看详情</p>
      </div>
    );
  }
  
  // Handle toggle link
  const handleToggleAssetLink = (asset: Asset) => {
    if (inspector.type !== 'panel') return;
    const panel = inspector.data as ScriptPanel;
    const currentIds = panel.relatedAssetIds || [];
    const isLinked = currentIds.includes(asset.id);
    const newIds = isLinked 
      ? currentIds.filter(id => id !== asset.id)
      : [...currentIds, asset.id];
    
    // Separate by type
    const charIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'character');
    const itemIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'item');
    const sceneIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'scene');
    
    onUpdatePanelAssets(inspector.volId!, inspector.episodeNum!, panel.panel_id, [...charIds, ...sceneIds], itemIds);
  };

  // Handle update triptych
  const handleUpdateTriptych = (panelId: number, urls: string[], history?: string[][]) => {
    const updates: Partial<ScriptPanel> = { triptych_sources: urls };
    if (history) updates.triptych_history = history;
    onUpdatePanel(panelId, updates);
  };
  
  if (inspector.type === 'panel') {
    const panel = inspector.data as ScriptPanel;
    const linkedAssets = project.assets.filter(a => (panel.relatedAssetIds || []).includes(a.id));
    
    // If showing asset sub-view
    if (subView?.type === 'asset') {
      return (
        <div className={`${widthClassName} bg-[#0D0D0D] border-l border-white/5 shrink-0 flex flex-col overflow-hidden`}>
          <EmbeddedAssetDetail
            asset={subView.data}
            assetImage={assetImages[subView.data.id]}
            isLinked={linkedAssets.some(a => a.id === subView.data.id)}
            isGenerating={generatingItemIds.has(subView.data.id)}
            onBack={() => setSubView(null)}
            onToggleLink={() => handleToggleAssetLink(subView.data)}
            onGenerate={() => onGenerateAssetImage(subView.data.id)}
            onSelectHistory={(path) => onSelectAssetHistoryImage(subView.data.id, path)}
            onPreview={onPreview}
            onUpdateAsset={onUpdateAsset}
          />
        </div>
      );
    }
    
    return (
      <div className={`${widthClassName} bg-[#0D0D0D] border-l border-white/5 shrink-0 flex flex-col overflow-hidden`}>
        <PanelInspectorContent
          panel={panel}
          project={project}
          assetImages={assetImages}
          settings={settings}
          volId={inspector.volId!}
          episodeNum={inspector.episodeNum!}
          generatingItemIds={generatingItemIds}
          onGeneratePanelImage={onGeneratePanelImage}
          onSavePanelImage={onSavePanelImage}
          onSelectHistoryImage={onSelectHistoryImage}
          onUpdateTriptych={handleUpdateTriptych}
          onUpdatePanel={onUpdatePanel}
          onUpdatePanelAssets={onUpdatePanelAssets}
          onGenerateAssetImage={onGenerateAssetImage}
          onSelectAssetHistoryImage={onSelectAssetHistoryImage}
          onPreview={onPreview}
          onUpdateAsset={onUpdateAsset}
          onTaskStart={onTaskStart}
          onTaskFinish={onTaskFinish}
          inspector={inspector}
        />
      </div>
    );
  }
  
  return null;
};

// ============================================================================
// Embedded Asset Detail (for Panel Inspector)
// ============================================================================

const EmbeddedAssetDetail: React.FC<{
  asset: Asset;
  assetImage?: string;
  isLinked: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onToggleLink: () => void;
  onGenerate: () => void;
  onSelectHistory: (path: string) => void;
  onPreview: (url: string) => void;
  onUpdateAsset?: (asset: Asset) => void;
}> = ({ asset, assetImage, isLinked, isGenerating, onBack, onToggleLink, onGenerate, onSelectHistory, onPreview, onUpdateAsset }) => {
  const [historyUrls, setHistoryUrls] = useState<{path: string; url: string}[]>([]);
  const [editingField, setEditingField] = useState<'description' | 'prompt' | null>(null);
  const [editValue, setEditValue] = useState('');
  // (Removed debug-only render logging)
  
  // Load history images
  useEffect(() => {
    if (!asset.imageHistory?.length) {
      setHistoryUrls([]);
      return;
    }
    Promise.all(
      asset.imageHistory.map(async (path) => {
        try {
          const url = await loadAssetImage(path);
          return { path, url };
        } catch {
          return null;
        }
      })
    ).then(results => setHistoryUrls(results.filter(Boolean) as {path: string; url: string}[]));
  }, [asset.imageHistory]);

  useEffect(() => {
    setEditingField(null);
    setEditValue('');
  }, [asset.id]);

  const handleDoubleClick = (field: 'description' | 'prompt') => {
    if (!onUpdateAsset) return;
    setEditingField(field);
    setEditValue(asset[field] || '');
  };

  const handleSave = () => {
    if (editingField && onUpdateAsset && editValue !== (asset[editingField] || '')) {
      onUpdateAsset({ ...asset, [editingField]: editValue });
    }
    setEditingField(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
    if (event.key === 'Escape') {
      setEditingField(null);
      setEditValue('');
    }
  };
  
  const typeConfig = {
    character: { icon: '👤', label: '角色', color: 'blue' },
    scene: { icon: '🏞️', label: '场景', color: 'green' },
    item: { icon: '🎒', label: '道具', color: 'amber' },
  }[asset.type] || { icon: '📦', label: '资产', color: 'gray' };
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-[#0A0A0A] flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors">
          ← 返回
        </button>
        <span className="text-sm font-medium text-white">{asset.name}</span>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Image */}
        <div 
          className="aspect-square bg-[#0A0A0A] rounded-xl border border-white/10 overflow-hidden relative cursor-pointer group"
          onClick={() => assetImage && onPreview(assetImage)}
        >
          {assetImage ? (
            <>
              <img src={assetImage} className="w-full h-full object-contain" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                <span className="text-white/0 group-hover:text-white text-2xl">🔍</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
              <span className="text-4xl mb-2">{typeConfig.icon}</span>
              <span className="text-xs">暂无图片</span>
            </div>
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="w-8 h-8 border-3 border-blue-400/50 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}
        </div>


        {/* Info & Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-bold text-white truncate">{asset.name}</h4>
            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-${typeConfig.color}-900/30 text-${typeConfig.color}-400 border border-${typeConfig.color}-500/20`}>
              {typeConfig.icon} {typeConfig.label}
            </span>
          </div>
          {/* Link Toggle Button */}
          <button
            onClick={onToggleLink}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              isLinked
                ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
            }`}
          >
            {isLinked ? '✕ 取消关联' : '🔗 关联此资产'}
          </button>
        </div>

        {/* Generate Button */}
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            isGenerating 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:brightness-110 active:scale-[0.98]'
          }`}
        >
          {isGenerating ? (
            <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> 生成中...</>
          ) : (
            <><span>✨</span> {assetImage ? '重新生成图片' : '生成图片'}</>
          )}
        </button>

        {/* History Timeline */}
        {historyUrls.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-gray-500 uppercase">📜 历史版本</h5>
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
              {historyUrls.map(({ path, url }, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectHistory(path)}
                  className={`shrink-0 w-16 aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    path === asset.imagePath 
                      ? 'border-blue-500' 
                      : 'border-transparent hover:border-white/30'
                  }`}
                >
                  <img src={url} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Description */}
        <div className="space-y-1">
          <h5 className="text-[10px] font-bold text-gray-500 uppercase">描述</h5>
          {editingField === 'description' ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full text-xs text-gray-100 bg-[#0A0A0A] border border-blue-500/40 rounded-lg p-2 focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              placeholder="请输入资产描述..."
            />
          ) : (
            <div
              className={`text-xs text-gray-400 bg-[#0A0A0A] p-2 rounded-lg ${onUpdateAsset ? 'cursor-pointer hover:bg-[#111]' : ''}`}
              onDoubleClick={() => handleDoubleClick('description')}
            >
              {asset.description || '双击编辑描述'}
            </div>
          )}
        </div>
        
        {/* Prompt */}
        <div className="space-y-1">
          <h5 className="text-[10px] font-bold text-gray-500 uppercase">生成提示词</h5>
          {editingField === 'prompt' ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full text-[11px] text-gray-100 bg-[#0A0A0A] border border-blue-500/40 rounded-lg p-2 font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-none"
              rows={4}
              placeholder="请输入生成提示词..."
            />
          ) : (
            <div
              className={`text-[11px] text-gray-300 bg-[#0A0A0A] p-2 rounded-lg font-mono leading-relaxed break-words ${onUpdateAsset ? 'cursor-pointer hover:bg-[#111]' : ''}`}
              onDoubleClick={() => handleDoubleClick('prompt')}
            >
              {asset.prompt || '双击编辑生成提示词'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// Panel Inspector Content
// ============================================================================

const PanelInspectorContent: React.FC<{
  panel: ScriptPanel;
    project: Project;
    assetImages: Record<string, string>;
    settings: AppSettings;
  volId: string;
  episodeNum: number;
    generatingItemIds: Set<string>;
  onGeneratePanelImage: (panelId: number, prompt: string, episodeNum: number, volId: string) => void;
  onSavePanelImage: (panelId: number, imageBlob: Blob, episodeNum: number, volId: string) => Promise<void>;
  onSelectHistoryImage: (panelId: number, path: string, episodeNum: number, volId: string) => void;
  onUpdateTriptych: (panelId: number, urls: string[], history?: string[][]) => void;
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
  onUpdatePanelAssets: (volId: string, episodeNum: number, panelId: number, assetIds: string[], itemIds: string[]) => void;
  onGenerateAssetImage: (assetId: string) => void;
  onSelectAssetHistoryImage: (assetId: string, path: string) => void;
    onPreview: (url: string) => void;
  onUpdateAsset: (asset: Asset) => void;
  onTaskStart: (desc: string, type?: string, model?: string) => string;
    onTaskFinish: (id: string, status: 'success' | 'error') => void;
  inspector?: InspectorState | null;
}> = ({ panel, project, assetImages, settings, volId, episodeNum, generatingItemIds, onGeneratePanelImage, onSavePanelImage, onSelectHistoryImage, onUpdateTriptych, onUpdatePanel, onUpdatePanelAssets, onGenerateAssetImage, onSelectAssetHistoryImage, onPreview, onUpdateAsset, onTaskStart, onTaskFinish, inspector }) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'generate' | 'video'>('assets');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Optimistic local state for linked assets (fix "click no response" + immediate reordering)
  const getCombinedRelatedIds = useCallback(() => {
    const assetIds = panel.relatedAssetIds || [];
    const itemIds = panel.relatedItemIds || [];
    // Keep stored ordering within each list; UI uses combined list (assets first, then items)
    return [...assetIds, ...itemIds];
  }, [panel.relatedAssetIds, panel.relatedItemIds]);

  const [localRelatedAssetIds, setLocalRelatedAssetIds] = useState<string[]>(getCombinedRelatedIds());
  const localRelatedAssetIdsRef = useRef<string[]>(getCombinedRelatedIds());

  useEffect(() => {
    const next = getCombinedRelatedIds();
    localRelatedAssetIdsRef.current = next;
    setLocalRelatedAssetIds(next);
  }, [getCombinedRelatedIds]);

  const linkedAssets = useMemo(
    () => project.assets.filter(a => localRelatedAssetIds.includes(a.id)),
    [project.assets, localRelatedAssetIds]
  );
  
  // Get selected asset
  const selectedAsset = useMemo(() => 
    selectedAssetId ? project.assets.find(a => a.id === selectedAssetId) : null,
    [selectedAssetId, project.assets]
  );

  // Check if selected asset is linked
  const isSelectedAssetLinked = useMemo(() => 
    selectedAssetId ? localRelatedAssetIds.includes(selectedAssetId) : false,
    [selectedAssetId, localRelatedAssetIds]
  );

  // Reset selected asset when switching tabs
  useEffect(() => {
    if (activeTab !== 'assets') {
      setSelectedAssetId(null);
    }
  }, [activeTab]);
  
  // Visual lines from script
  const visualLines = useMemo(() => {
    const lines = panel.script_content?.split('\n')
      .filter(l => l.trim().startsWith('▲'))
      .map(l => l.replace(/^▲/, '').trim()) || [];
    return lines.slice(0, 3);
  }, [panel.script_content]);
  
  // Construct prompt for generation
  const constructPrompt = useCallback(() => {
    const parts: string[] = [];
    
    if (project.activeStyle) {
      parts.push(`[Style] ${project.activeStyle.name}: ${project.activeStyle.prompt}`);
    }
    
    if (panel.scene_name) {
      parts.push(`[Scene] ${panel.scene_name}`);
    }
    
    const chars = linkedAssets.filter(a => a.type === 'character');
    if (chars.length > 0) {
      parts.push(`[Characters] ${chars.map(c => c.name).join(', ')}`);
    }
    
    if (visualLines.length > 0) {
      parts.push(`[Action] ${visualLines.join(' → ')}`);
    }
    
    if (panel.composition) {
      parts.push(`[Composition] ${panel.composition}`);
    }
    
    parts.push('[Output] High quality webtoon panel, cinematic lighting');
    
    return parts.join('\n');
  }, [project.activeStyle, panel, linkedAssets, visualLines]);

  // Toggle asset link
  const toggleAsset = useCallback((assetId: string) => {
    const currentIds = localRelatedAssetIdsRef.current;
    const isLinked = currentIds.includes(assetId);

    // Preserve binding order:
    // - link => append to end
    // - unlink => remove from list (will drop to unlinked section immediately)
    const newIds = isLinked ? currentIds.filter(id => id !== assetId) : [...currentIds, assetId];

    // Optimistic update first (avoid "needs page switch to reorder")
    localRelatedAssetIdsRef.current = newIds;
    setLocalRelatedAssetIds(newIds);

    // Separate by type for onUpdatePanelAssets
    const charIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'character');
    const itemIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'item');
    const sceneIds = newIds.filter(id => project.assets.find(a => a.id === id)?.type === 'scene');

    onUpdatePanelAssets(volId, episodeNum, panel.panel_id, [...charIds, ...sceneIds], itemIds);
  }, [project.assets, volId, episodeNum, panel.panel_id, onUpdatePanelAssets]);

  // Auto-link assets based on panel text (MVP: name match)
  // Prioritize visualZh over legacy visual field
  const panelLinkingText = useMemo(() => {
    return [
      panel.scene_name,
      panel.active_characters_str,
      panel.props,
      panel.script_content,
      panel.composition,
      panel.visualZh || panel.visual, // Prefer Chinese visual description
    ]
      .filter(Boolean)
      .join('\n');
  }, [panel.scene_name, panel.active_characters_str, panel.props, panel.script_content, panel.composition, panel.visualZh, panel.visual]);

  const handleAutoLinkAssets = useCallback(() => {
    const text = panelLinkingText;
    if (!text.trim()) return;

    const firstIndexOf = (haystack: string, needle: string): number => {
      const idx = haystack.indexOf(needle);
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
    };

    const matched = project.assets
      .map(a => ({
        asset: a,
        idx: a.name ? firstIndexOf(text, a.name) : Number.POSITIVE_INFINITY,
      }))
      .filter(x => x.idx !== Number.POSITIVE_INFINITY)
      .sort((a, b) => a.idx - b.idx)
      .map(x => x.asset);

    // Cap to avoid overlinking; tune later if needed
    const chars = matched.filter(a => a.type === 'character').slice(0, 8);
    const scenes = matched.filter(a => a.type === 'scene').slice(0, 2);
    const items = matched.filter(a => a.type === 'item').slice(0, 12);

    const assetIds = [...chars.map(a => a.id), ...scenes.map(a => a.id)];
    const itemIds = items.map(a => a.id);
    const combined = [...assetIds, ...itemIds];

    // Optimistic UI
    localRelatedAssetIdsRef.current = combined;
    setLocalRelatedAssetIds(combined);

    onUpdatePanelAssets(volId, episodeNum, panel.panel_id, assetIds, itemIds);
  }, [panelLinkingText, project.assets, volId, episodeNum, panel.panel_id, onUpdatePanelAssets]);

  // Stable key for reordering: NEVER sort() in-place on props/state arrays
  const relatedAssetIdsKey = localRelatedAssetIds.join('|');

  // Sorted assets:
  // - linked assets on top, strictly follow binding order (localRelatedAssetIds)
  // - unlinked assets below (stable, by name)
  const sortedAssets = useMemo(() => {
    const filtered = project.assets.filter(a => filterType === 'all' || a.type === filterType);
    const byId = new Map<string, Asset>();
    for (const a of filtered) byId.set(a.id, a);

    const linkedSet = new Set(localRelatedAssetIds);
    const linkedOrdered = localRelatedAssetIds
      .map(id => byId.get(id))
      .filter((a): a is Asset => Boolean(a));

    const rest = filtered
      .filter(a => !linkedSet.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return [...linkedOrdered, ...rest];
  }, [project.assets, filterType, relatedAssetIdsKey, localRelatedAssetIds]);

  // Shot URLs for video generation
  const shotUrls = useMemo(() => {
    return panel.triptych_sources || ['', '', ''];
  }, [panel.triptych_sources]);
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-white/5 bg-[#0A0A0A]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">
              #{panel.globalPanelNo ?? panel.panel_id} {panel.scene_name || '分镜'}
              <span className="ml-2 text-sm text-gray-500 font-medium">P{panel.panel_id}</span>
            </h3>
            <p className="text-sm text-gray-400 mt-1">E{episodeNum} · {formatDuration(panel.duration) || '?'}s</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1.5 mt-4">
          {(['assets', 'generate', 'video'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab 
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab === 'assets' && '📦 资产'}
              {tab === 'generate' && '🎨 绘图'}
              {tab === 'video' && '🎬 视频'}
            </button>
          ))}
        </div>
        
        {/* NarrationZh Display (collapsible) */}
        {panel.narrationZh && (
          <div className="mt-3 bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-lg border border-orange-500/20 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                🎙️ 讲解轨
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(panel.narrationZh || '');
                }}
                className="text-[10px] text-orange-300 hover:text-orange-200 bg-orange-500/20 hover:bg-orange-500/30 px-2 py-0.5 rounded transition-colors"
                title="复制讲解文案"
              >
                复制
              </button>
            </div>
            <p className="text-xs text-orange-100/90 leading-relaxed line-clamp-3">
              {panel.narrationZh}
            </p>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* ========== Assets Tab ========== */}
        {activeTab === 'assets' && (
          <div className="h-full relative">
            {/* Asset List View */}
            <div className={`absolute inset-0 overflow-y-auto custom-scrollbar p-4 transition-all duration-300 ${
              selectedAsset ? 'opacity-0 -translate-x-8 pointer-events-none' : 'opacity-100 translate-x-0'
            }`}>
              <div className="space-y-4">
                {/* Filter */}
                <div className="flex gap-2 flex-wrap items-center">
                  {['all', 'character', 'scene', 'item'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                        filterType === t 
                          ? 'bg-white text-black border-white' 
                          : 'bg-[#252525] text-gray-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {t === 'all' ? '全部' : t === 'character' ? '👤 角色' : t === 'scene' ? '🏞️ 场景' : '🎒 道具'}
                    </button>
                  ))}

                  <button
                    onClick={handleAutoLinkAssets}
                    className="px-3 py-1 rounded-full text-[10px] border transition-all bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/20"
                    title="根据分镜文本（场景/角色/道具/视觉描述）自动匹配资产并关联"
                  >
                    ✨ 一键关联
                  </button>
                </div>

                {/* Asset Grid */}
                {sortedAssets.length === 0 ? (
                  <div className="py-12 text-center text-gray-600">
                    <span className="text-3xl">📦</span>
                    <p className="text-xs mt-2">暂无资产</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {sortedAssets.map(asset => {
                      const isLinked = localRelatedAssetIds.includes(asset.id);
                      return (
                        <div 
                          key={asset.id} 
                          onClick={() => setSelectedAssetId(asset.id)}
                          className={`relative cursor-pointer rounded-xl border transition-all group ${
                            isLinked 
                              ? 'border-blue-500/50 bg-blue-900/10' 
                              : 'border-white/10 bg-[#1A1A1A] hover:border-white/20'
                          }`}
                        >
                          <div className="aspect-square bg-[#0A0A0A] rounded-t-xl overflow-hidden relative">
                            {assetImages[asset.id] ? (
                              <img src={assetImages[asset.id]} className={`w-full h-full object-cover transition-opacity ${isLinked ? '' : 'opacity-70 group-hover:opacity-100'}`} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl text-gray-700">
                                {asset.type === 'character' ? '👤' : asset.type === 'scene' ? '🏞️' : '🎒'}
                              </div>
                            )}
                            {/* Checkbox for linking (bottom-right, reliable click) */}
                            <button
                              type="button"
                              className="absolute bottom-2 right-2 z-30"
                              aria-pressed={isLinked}
                              aria-label={isLinked ? '取消关联资产' : '关联资产'}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleAsset(asset.id);
                              }}
                            >
                              <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
                                isLinked
                                  ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/30'
                                  : 'bg-black/60 border-white/40 hover:border-white/60 hover:bg-black/80'
                              }`}>
                                {isLinked && (
                                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </button>
                            {/* View detail indicator */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                              <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-colors">
                                查看详情 →
                              </span>
                            </div>
                          </div>
                          <div className="p-2.5">
                            <div className="text-[11px] font-bold text-gray-200 truncate">{asset.name}</div>
                            <div className={`text-[9px] mt-0.5 ${asset.type === 'character' ? 'text-blue-400' : asset.type === 'scene' ? 'text-green-400' : 'text-purple-400'}`}>
                              {asset.type === 'character' ? '👤 角色' : asset.type === 'scene' ? '🏞️ 场景' : '🎒 道具'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Asset Detail View (Embedded) */}
            <div className={`absolute inset-0 overflow-y-auto custom-scrollbar transition-all duration-300 ${
              selectedAsset ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
            }`}>
              {selectedAsset && (
                <EmbeddedAssetDetail
                  asset={selectedAsset}
                  assetImage={assetImages[selectedAsset.id]}
                  isLinked={isSelectedAssetLinked}
                  isGenerating={generatingItemIds.has(selectedAsset.id)}
                  onBack={() => setSelectedAssetId(null)}
                  onToggleLink={() => toggleAsset(selectedAsset.id)}
                  onGenerate={() => onGenerateAssetImage(selectedAsset.id)}
                  onSelectHistory={(path) => onSelectAssetHistoryImage(selectedAsset.id, path)}
                  onPreview={onPreview}
                  onUpdateAsset={onUpdateAsset}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'generate' && (
          <div className="h-full overflow-y-auto custom-scrollbar p-5 space-y-6">
            {/* Triptych Generator */}
            <TriptychGenerator
              panel={panel}
              project={project}
              settings={settings}
              onUpdateTriptych={onUpdateTriptych}
              onUpdatePanel={onUpdatePanel}
              onSaveResult={async (blob) => { await onSavePanelImage(panel.panel_id, blob, episodeNum, volId); }}
              onPreview={onPreview}
              onTaskStart={onTaskStart}
              onTaskFinish={onTaskFinish}
              assetImages={assetImages}
              inspector={inspector}
            />

            {/* TEMP DISABLED: Single Image Generation (will remove later) */}
            {false && (
              <>
                <div className="h-px bg-white/5" />
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">🖼️ 单图生成</h4>
                  <div className="bg-[#0A0A0A] p-3 rounded-lg border border-white/5 text-[10px] text-gray-500 font-mono line-clamp-3">
                    {constructPrompt()}
                  </div>
                  <button
                    onClick={() => onGeneratePanelImage(panel.panel_id, constructPrompt(), episodeNum, volId)}
                    disabled={generatingItemIds.has(`panel-${panel.panel_id}`)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#252525] text-gray-300 border border-white/10 hover:bg-[#303030] hover:text-white transition-all"
                  >
                    {generatingItemIds.has(`panel-${panel.panel_id}`) ? '生成中...' : '🎨 生成概览图'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'video' && (
          <div className="h-full overflow-hidden">
            <VideoGeneratorPanel
              panel={panel}
              project={project}
              settings={settings}
              assetImages={assetImages}
              shotUrls={shotUrls.filter(Boolean)}
              onUpdatePanel={(panelId, updates) => onUpdatePanel(panelId, updates)}
              onTaskStart={onTaskStart}
              onTaskFinish={onTaskFinish}
              onPreview={onPreview}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Triptych Generator
// ============================================================================

const TriptychGenerator: React.FC<{
    panel: ScriptPanel;
    project: Project;
    settings: AppSettings;
  onUpdateTriptych: (panelId: number, urls: string[], history?: string[][]) => void;
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
    onSaveResult: (blob: Blob) => Promise<void>;
    onPreview: (url: string) => void;
  onTaskStart: (desc: string, type?: string, model?: string) => string;
  onTaskFinish: (id: string, status: 'success' | 'error') => void;
  assetImages: Record<string, string>;
  inspector?: InspectorState | null;
}> = ({ panel, project, settings, onUpdateTriptych, onUpdatePanel, onSaveResult, onPreview, onTaskStart, onTaskFinish, assetImages, inspector }) => {
  const { mergeImages, isMerging, mergeError } = useStoryboardMerger();
  
  // ========== Three Shots State ==========
  const [localUrls, setLocalUrls] = useState<string[]>(['', '', '']);
  const [generating, setGenerating] = useState<boolean[]>([false, false, false]);
  const [customPrompts, setCustomPrompts] = useState<string[]>(['', '', '']);
  const [historyUrls, setHistoryUrls] = useState<string[][]>([[], [], []]);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  // Track current panel_id to avoid overwriting user edits when switching panels
  const currentPanelIdRef = useRef<number | null>(null);
  const [showPromptDetail, setShowPromptDetail] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showVideoRef, setShowVideoRef] = useState(false);
  
  // ========== Line Art State (collapsible) ==========
  const [showLineArtSection, setShowLineArtSection] = useState(false);
  const [isGeneratingLineArt, setIsGeneratingLineArt] = useState(false);
  const [lineArtProgress, setLineArtProgress] = useState<string>('');
  // Default to 16:9 for horizontal video workflow (matches video output ratio)
  const [lineArtAspectRatio, setLineArtAspectRatio] = useState<'9:16' | '16:9'>('16:9');
  const [generatedLineArtUrl, setGeneratedLineArtUrl] = useState<string>('');
  const [lineArtHistoryUrls, setLineArtHistoryUrls] = useState<string[]>([]);
  const [showLineArtHistory, setShowLineArtHistory] = useState(false);
  
  // ========== Micro-Montage Continuity State ==========
  const [continuityMode, setContinuityMode] = useState<ContinuityMode>(panel.continuityMode || 'auto');
  const [continuityAnalysis, setContinuityAnalysis] = useState<ContinuityAnalysisResult | null>(null);
  const [showContinuityInfo, setShowContinuityInfo] = useState(false);
  const continuityAnalysisKeyRef = useRef<string>('');
  
  const sourcesRef = useRef<string[]>(['', '', '']);
  const historyRef = useRef<string[][]>([[], [], []]);

  // Visual lines from script - PRIORITY: panel.shots > ▲ parsing
  const visualLines = useMemo(() => {
    // Priority 1: Use structured shots if available
    if (panel.shots && panel.shots.length === 3) {
      return panel.shots.map(shot => {
        // Priority: Use shot.visual directly (for immediate sync with ScriptCanvas)
        // If visual is empty, fallback to combining visual + action
        if (shot.visual) {
          return shot.visual;
        }
        // Fallback: Combine visual + action for rich description
        const parts = [shot.visual, shot.action].filter(Boolean);
        return parts.join(' - ') || '';
      });
    }
    
    // Fallback: Parse ▲ lines from script_content
    const lines = panel.script_content?.split('\n')
      .filter(l => l.trim().startsWith('▲'))
      .map(l => l.replace(/^▲/, '').trim()) || [];
    return [lines[0] || '', lines[1] || '', lines[2] || ''];
  }, [panel.script_content, panel.shots]);
  
  // Check if we have structured shots data
  const hasStructuredShots = useMemo(() => {
    return panel.shots && panel.shots.length === 3;
  }, [panel.shots]);

  // Initialize custom prompts from visual lines - Smart sync with panel.shots
  useEffect(() => {
    // If switching to a different panel, reset ref and reinitialize
    if (currentPanelIdRef.current !== panel.panel_id) {
      currentPanelIdRef.current = panel.panel_id;
      
      // Priority: Sync from panel.shots if available (for immediate update from ScriptCanvas)
      if (panel.shots && panel.shots.length === 3) {
        const newPrompts = panel.shots.map((shot, idx) => {
          // Priority: Use shot.visual directly, fallback to visualLines[idx]
          return shot.visual || visualLines[idx] || '';
        });
        setCustomPrompts(newPrompts);
      } else {
        // Fallback: Use visualLines when shots are not available
        setCustomPrompts(visualLines);
      }
      return; // Directly set when switching panel, no change check needed
    }
    
    // Same panel: only update when panel.shots or visualLines actually change
    // CRITICAL: Preserve user edits that haven't been saved yet
    if (panel.shots && panel.shots.length === 3) {
      const newPrompts = panel.shots.map((shot, idx) => {
        const shotVisual = shot.visual || '';
        const visualLine = visualLines[idx] || '';
        
        // Priority: shot.visual > visualLines[idx]
        // But don't overwrite if current customPrompts has user edits
        return shotVisual || visualLine;
      });
      
      // Only update if values actually changed (avoid unnecessary re-renders)
      // CRITICAL: Don't overwrite if new value is empty and current has content (user edit in progress)
      setCustomPrompts(prev => {
        const hasChanged = newPrompts.some((newVal, idx) => {
          // If new value is empty but prev has content, don't overwrite (preserve user edit)
          if (!newVal && prev[idx]) return false;
          // If new value exists and is different, update
          return newVal !== prev[idx];
        });
        return hasChanged ? newPrompts : prev;
      });
    } else {
      // Only update if visualLines actually changed
      setCustomPrompts(prev => {
        const hasChanged = visualLines.some((newVal, idx) => {
          // Don't overwrite if new value is empty but prev has content
          if (!newVal && prev[idx]) return false;
          return newVal !== prev[idx];
        });
        return hasChanged ? visualLines : prev;
      });
    }
  }, [panel.panel_id, panel.shots, visualLines]); // Add panel.panel_id to dependencies

  // Sync continuity mode when switching panels
  useEffect(() => {
    setContinuityMode(panel.continuityMode || 'auto');
    setContinuityAnalysis(null);
    continuityAnalysisKeyRef.current = '';
  }, [panel.panel_id]);

  // Reset generating state when switching panels to prevent cross-panel pollution
  useEffect(() => {
    setGenerating([false, false, false]);
  }, [panel.panel_id]);

  // Initialize three shots
  useEffect(() => {
    const sources = panel.triptych_sources || ['', '', ''];
    sourcesRef.current = sources;
    historyRef.current = panel.triptych_history || [[], [], []];
  }, [panel.triptych_sources, panel.triptych_history, panel.panel_id]);

  // Load display URLs for three shots
  useEffect(() => {
    const load = async () => {
      const urls = await Promise.all((panel.triptych_sources || ['', '', '']).map(async (p) => {
        if (!p) return '';
        try { return await loadAssetImage(p); } catch { return ''; }
      }));
      setLocalUrls(urls);
    };
    load();
  }, [panel.triptych_sources]);

  // Load history URLs for three shots
  useEffect(() => {
    const loadHistory = async () => {
      const allUrls = await Promise.all(
        (panel.triptych_history || [[], [], []]).map(async (paths) => {
          return Promise.all(paths.map(p => loadAssetImage(p).catch(() => '')));
        })
      );
      setHistoryUrls(allUrls.map(urls => urls.filter(Boolean)));
    };
    loadHistory();
  }, [panel.triptych_history]);

  // ========== Line Art Init ==========
  useEffect(() => {
    const loadLineArt = async () => {
      if (panel.lineArt) {
        try {
          const url = await loadAssetImage(panel.lineArt);
          setGeneratedLineArtUrl(url);
        } catch {
          setGeneratedLineArtUrl('');
        }
      } else {
        setGeneratedLineArtUrl('');
      }
    };
    loadLineArt();
  }, [panel.lineArt, panel.panel_id]);

  useEffect(() => {
    const loadLineArtHistory = async () => {
      if (panel.lineArtHistory && panel.lineArtHistory.length > 0) {
        const urls = await Promise.all(
          panel.lineArtHistory.map(p => loadAssetImage(p).catch(() => ''))
        );
        setLineArtHistoryUrls(urls.filter(Boolean));
      } else {
        setLineArtHistoryUrls([]);
      }
    };
    loadLineArtHistory();
  }, [panel.lineArtHistory]);

  // ========== Micro-Montage Continuity Analysis ==========
  useEffect(() => {
    // Analyze continuity on panel change
    const panelWithMode = { ...panel, continuityMode };
    const analysis = shouldUseCrossPanelContinuity(panelWithMode, project);
    const key = [
      analysis.shouldUsePrevAnchor ? '1' : '0',
      analysis.prevPanelAnchorPath || '',
      analysis.reason || '',
      String(Math.round((analysis.confidence || 0) * 1000))
    ].join('|');
    if (key !== continuityAnalysisKeyRef.current) {
      continuityAnalysisKeyRef.current = key;
      setContinuityAnalysis(analysis);
    }
  }, [
    panel.panel_id,
    panel.globalPanelNo,
    panel.scene_name,
    continuityMode,
    project.id,
    project.lastModified,
    project.activeVolumeId
  ]);

  // Sync continuityMode to panel when changed
  useEffect(() => {
    const panelMode = panel.continuityMode || 'auto';
    if (continuityMode !== panelMode) {
      onUpdatePanel(panel.panel_id, { continuityMode });
    }
  }, [continuityMode, panel.panel_id, panel.continuityMode, onUpdatePanel]);

  // ========== Three Shots Handlers ==========
  
  // Select history image for a slot
  const handleSelectHistory = useCallback(async (slotIdx: number, historyPath: string) => {
    try {
      const displayUrl = await loadAssetImage(historyPath);
      sourcesRef.current[slotIdx] = historyPath;
      setLocalUrls(prev => { const n = [...prev]; n[slotIdx] = displayUrl; return n; });
      onUpdateTriptych(panel.panel_id, [...sourcesRef.current], [...historyRef.current]);
    } catch (e) {
      console.error('Failed to load history image', e);
    }
  }, [panel.panel_id, onUpdateTriptych]);

  // Reset prompt to original
  const handleResetPrompt = useCallback((idx: number) => {
    setCustomPrompts(prev => { const n = [...prev]; n[idx] = visualLines[idx]; return n; });
  }, [visualLines]);

  // Build shared context prompt (for consistency across 3 shots)
  const buildContextPrompt = useCallback(() => {
    const linkedAssets = project.assets.filter(a => 
      (panel.relatedAssetIds || []).includes(a.id)
    );
    
    const characters = linkedAssets.filter(a => a.type === 'character');
    const scenes = linkedAssets.filter(a => a.type === 'scene');
    const items = linkedAssets.filter(a => a.type === 'item');

    const parts: string[] = [];
    
    if (project.activeStyle) {
      parts.push(`[ART STYLE] ${project.activeStyle.name}: ${project.activeStyle.prompt}`);
    }
    
    if (scenes.length > 0) {
      const sceneDesc = scenes.map(s => s.prompt || s.description || s.name).join('; ');
      parts.push(`[SCENE] ${panel.scene_name || scenes[0].name}: ${sceneDesc}`);
    } else if (panel.scene_name) {
      parts.push(`[SCENE] ${panel.scene_name}`);
    }
    
    if (characters.length > 0) {
      const charDesc = characters.map(c => `${c.name}(${c.prompt || c.description || 'character'})`).join(', ');
      parts.push(`[CHARACTERS] ${charDesc}`);
    } else if (panel.active_characters_str) {
      parts.push(`[CHARACTERS] ${panel.active_characters_str}`);
    }
    
    if (items.length > 0) {
      parts.push(`[PROPS] ${items.map(i => i.name).join(', ')}`);
    } else if (panel.props) {
      parts.push(`[PROPS] ${panel.props}`);
    }
    
    return parts.join('\n');
  }, [project.assets, project.activeStyle, panel, settings.shotPromptLanguage]);

  /**
   * Build reference images for img2img generation
   * Enhanced with structured shots support:
   * Priority: character assets > scene assets > cross-panel anchor > prev shot > prop assets
   */
  const buildReferenceImages = useCallback(async (
    slotIdx: number,
    useCrossPanelAnchor: boolean,
    crossPanelAnchorPath: string | null
  ): Promise<Blob[]> => {
    const refs: Blob[] = [];
    const shot = panel.shots?.[slotIdx];
    
    // Helper: load asset image as blob
    const loadAssetBlob = async (assetId: string): Promise<Blob | null> => {
      const asset = project.assets.find(a => a.id === assetId);
      if (!asset?.imagePath) return null;
      
      // Try from assetImages cache first
      const cachedUrl = assetImages[assetId];
      if (cachedUrl) {
        try {
          const res = await fetch(cachedUrl);
          return await res.blob();
        } catch { /* fall through */ }
      }
      
      // Fallback: load from path
      try {
        const url = await loadAssetImage(asset.imagePath);
        const res = await fetch(url);
        return await res.blob();
      } catch {
        return null;
      }
    };
    
    // 1. CHARACTER ANCHORS (identity - most important)
    // Use shot-specific character IDs if available, else fallback to relatedAssetIds
    const characterIds = shot?.characterAssetIds?.length 
      ? shot.characterAssetIds 
      : (panel.relatedAssetIds || []).filter(id => {
          const asset = project.assets.find(a => a.id === id);
          return asset?.type === 'character';
        });
    
    for (const charId of characterIds.slice(0, 2)) { // Max 2 characters
      const blob = await loadAssetBlob(charId);
      if (blob) {
        refs.push(blob);
        console.log(`[MicroMontage] Added character anchor: ${charId}`);
      }
    }
    
    // 2. SCENE ANCHOR (background consistency - NEW)
    // Use shot-specific scene ID if available
    const sceneId = shot?.sceneAssetId || (panel.relatedAssetIds || []).find(id => {
      const asset = project.assets.find(a => a.id === id);
      return asset?.type === 'scene';
    });
    
    if (sceneId) {
      const blob = await loadAssetBlob(sceneId);
      if (blob) {
        refs.push(blob);
        console.log(`[MicroMontage] Added scene anchor: ${sceneId}`);
      }
    }
    
    // 3. CROSS-PANEL ANCHOR (only for Shot1 when continuity is enabled)
    if (slotIdx === 0 && useCrossPanelAnchor && crossPanelAnchorPath) {
      try {
        const prevUrl = await loadAssetImage(crossPanelAnchorPath);
        const res = await fetch(prevUrl);
        const blob = await res.blob();
        refs.push(blob);
        console.log('[MicroMontage] Added cross-panel anchor from prev panel');
      } catch (err) {
        console.warn('[MicroMontage] Failed to load cross-panel anchor, continuing without it:', err);
      }
    }
    
    // 4. PREVIOUS SHOT ANCHOR (for Shot2 and Shot3 - intra-panel continuity)
    if (slotIdx > 0) {
      const prevSlotPath = sourcesRef.current[slotIdx - 1];
      if (prevSlotPath) {
        try {
          const prevUrl = await loadAssetImage(prevSlotPath);
          const res = await fetch(prevUrl);
          const blob = await res.blob();
          refs.push(blob);
          console.log(`[MicroMontage] Added prev shot (slot${slotIdx - 1}) as continuity anchor`);
        } catch (err) {
          console.warn(`[MicroMontage] Failed to load prev shot, continuing without it:`, err);
        }
      }
    }
    
    // 5. PROP ANCHORS (optional, max 1-2, avoid overfitting)
    // Use shot-specific prop IDs if available
    const propIds = shot?.propAssetIds?.length 
      ? shot.propAssetIds 
      : (panel.relatedAssetIds || []).filter(id => {
          const asset = project.assets.find(a => a.id === id);
          return asset?.type === 'item';
        });
    
    for (const propId of propIds.slice(0, 1)) { // Max 1 prop to avoid overfitting
      const blob = await loadAssetBlob(propId);
      if (blob) {
        refs.push(blob);
        console.log(`[MicroMontage] Added prop anchor: ${propId}`);
      }
    }
    
    console.log(`[MicroMontage] Total reference images for slot ${slotIdx}: ${refs.length}`);
    return refs;
  }, [project.assets, panel.relatedAssetIds, panel.shots, assetImages]);

  /**
   * Build micro-montage prompt with Continuity Contract
   * Enhanced: Uses structured shot data when available
   */
  const buildMicroMontagePrompt = useCallback((
    slotIdx: number,
    actionText: string
  ): string => {
    const shot = panel.shots?.[slotIdx];
    
    // Get asset names - prioritize shot-specific bindings
    let linkedAssetNames: { characters: string[]; scenes: string[]; props: string[] };
    
    if (shot) {
      // Use shot-specific asset bindings
      const charAssets = getAssetsByIds(shot.characterAssetIds, project.assets);
      const sceneAsset = shot.sceneAssetId ? getAssetById(shot.sceneAssetId, project.assets) : undefined;
      const propAssets = getAssetsByIds(shot.propAssetIds, project.assets);
      
      linkedAssetNames = {
        characters: charAssets.map(a => a.name),
        scenes: sceneAsset ? [sceneAsset.name] : [],
        props: propAssets.map(a => a.name),
      };
    } else {
      // Fallback: use relatedAssetIds
      const linkedAssets = project.assets.filter(a => 
        (panel.relatedAssetIds || []).includes(a.id)
      );
      linkedAssetNames = {
        characters: linkedAssets.filter(a => a.type === 'character').map(a => a.name),
        scenes: linkedAssets.filter(a => a.type === 'scene').map(a => a.name),
        props: linkedAssets.filter(a => a.type === 'item').map(a => a.name),
      };
    }
    
    // Build continuity contract (language controlled by global settings)
    const continuityContract = buildContinuityContract(
      panel,
      project,
      linkedAssetNames,
      { language: settings.shotPromptLanguage || 'bilingual' }
    );
    
    // Build shot-specific prompt - enhanced with structured shot data
    let shotPrompt: string;
    
    if (shot) {
      // Use structured shot data for richer prompt
      const shotSizeLabel = {
        'WS': 'Wide Shot (全景)',
        'MS': 'Medium Shot (中景)',
        'CU': 'Close-Up (特写)'
      }[shot.shotSize] || shot.shotSize;
      
      const promptParts: string[] = [];
      
      // Continuity contract first
      promptParts.push(continuityContract);
      
      // Shot metadata
      promptParts.push(`\n[SINGLE KEYFRAME - Shot ${slotIdx + 1} - ${shotSizeLabel}]`);
      
      // Visual description - PRIORITY: actionText (from customPrompts) > shot.visual
      // This ensures real-time updates when user modifies customPrompts or shot.visual
      const visualText = actionText || shot.visual || '';
      if (visualText) {
        promptParts.push(`[VISUAL] ${visualText}`);
      }
      
      // Action
      if (shot.action) {
        promptParts.push(`[ACTION] ${shot.action}`);
      }
      
      // Dialogue (for context, not rendered)
      if (shot.dialogue) {
        promptParts.push(`[DIALOGUE CONTEXT] ${shot.dialogue} (do not render any text on screen)`);
      }
      
      // Composition
      if (shot.composition) {
        promptParts.push(`[COMPOSITION] ${shot.composition}`);
      }
      
      // Camera
      if (shot.camera) {
        promptParts.push(`[CAMERA] ${shot.camera}`);
      }
      
      // Lighting
      if (shot.light) {
        promptParts.push(`[LIGHTING] ${shot.light}`);
      }
      
      // Color grading
      if (shot.grade) {
        promptParts.push(`[COLOR GRADE] ${shot.grade}`);
      }
      
      // Negatives
      if (shot.negatives && shot.negatives.length > 0) {
        promptParts.push(`[AVOID] ${shot.negatives.join(', ')}`);
      }
      
      // Output style reminder
      promptParts.push('');
      promptParts.push(buildSingleFrameOutputContract('16:9'));
      
      shotPrompt = promptParts.join('\n');
    } else {
      // Fallback to original buildShotPrompt
      shotPrompt = buildShotPrompt(slotIdx, actionText, continuityContract);
    }
    
    // Add art style if available
    let fullPrompt = shotPrompt;
    if (project.activeStyle) {
      fullPrompt = `[ART STYLE] ${project.activeStyle.name}: ${project.activeStyle.prompt}\n\n${shotPrompt}`;
    }
    
    return fullPrompt;
  }, [project.assets, project.activeStyle, panel, customPrompts, settings.shotPromptLanguage]);

  // 内部辅助函数：执行单个 slot 的生成逻辑（不包含状态管理）
  const generateSlotInternal = async (idx: number): Promise<void> => {
    let promptText = customPrompts[idx] || visualLines[idx];
    if (!promptText) {
      throw new Error(`Shot ${idx + 1} 缺少画面描述`);
    }
    
    // Get continuity analysis
    const analysis = continuityAnalysis || shouldUseCrossPanelContinuity(panel, project);
    const useCrossPanelAnchor = analysis.shouldUsePrevAnchor;
    const crossPanelAnchorPath = analysis.prevPanelAnchorPath;
    
    // Update continuity hint for debugging
    if (analysis.reason !== panel.continuityPrevHint) {
      onUpdatePanel(panel.panel_id, { continuityPrevHint: analysis.reason });
    }
    
    // Check if translation is needed (Chinese input + English model)
    // Models that prefer English prompts
    const englishPreferredModels = ['flux', 'dall-e', 'midjourney', 'sd', 'stable-diffusion', 'claude', 'gpt', 'gemini'];
    const modelName = (settings.imageModel || '').toLowerCase();
    const needsEnglish = englishPreferredModels.some(m => modelName.includes(m));
    
    if (needsEnglish && isPrimarilyChinese(promptText)) {
      console.log(`[MicroMontage] Translating Chinese prompt for English model (${settings.imageModel})`);
      try {
        // Build character name mapping from assets
        const characterNames = new Map<string, string>();
        project.assets.filter(a => a.type === 'character').forEach(a => {
          // Use asset name as key, keep same for now (can extend with English name field later)
          characterNames.set(a.name, a.name);
        });
        
        promptText = await translateVisualToEnglish(promptText, settings, { characterNames });
        console.log(`[MicroMontage] Translated prompt: ${promptText.substring(0, 100)}...`);
      } catch (err) {
        console.warn('[MicroMontage] Translation failed, using original Chinese:', err);
        // Continue with Chinese prompt as fallback
      }
    }
    
    const taskId = onTaskStart(`分镜 #${panel.panel_id} - Shot ${idx + 1} (${SHOT_PLAN[idx]?.type || 'Shot'})`, 'image', settings.imageModel);
    
    try {
      // Build micro-montage prompt
      const fullPrompt = buildMicroMontagePrompt(idx, promptText);
      
      // Build reference images for img2img
      const referenceImages = await buildReferenceImages(idx, useCrossPanelAnchor, crossPanelAnchorPath);
      
      let url: string;
      
      if (referenceImages.length > 0) {
        // Use img2img with reference images
        console.log(`[MicroMontage] Generating slot ${idx} with ${referenceImages.length} reference images`);
        url = await generateImage(fullPrompt, settings, '16:9', undefined, referenceImages);
      } else {
        // Fallback to txt2img (no reference images available)
        console.log(`[MicroMontage] No reference images available, using txt2img for slot ${idx}`);
        url = await generateImage(fullPrompt, settings, '16:9');
      }
      
      let localPath = url;
      const isTosUrl = url?.includes('tos-cn-beijing') || url?.includes('volces.com');
      console.log('[MicroMontage] Generated image, saving locally:', { idx, isTosUrl, urlPrefix: url?.substring(0, 50) });
      
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const filename = `triptych_${panel.panel_id}_slot${idx}_${Date.now()}.png`;
        localPath = await saveImageToAssets(blob, filename);
        console.log('[MicroMontage] Saved to local path:', localPath);
      } catch (err) {
        console.warn('[MicroMontage] Failed to save slot image locally:', err);
        
        // CRITICAL: If URL is a TOS URL (VolcEngine), throw error instead of storing remote URL
        // TOS URLs have CORS restrictions and will fail when loaded later
        if (isTosUrl) {
          throw new Error('Cannot save VolcEngine TOS image - CORS restriction. Please check if image generation is using b64_json format.');
        }
        // For non-TOS URLs (like blob URLs or other CDNs), we can try to use them directly
        // But log a warning
        console.warn('[MicroMontage] Using remote URL as fallback (may have issues):', url?.substring(0, 50));
      }
      
      const displayUrl = await loadAssetImage(localPath);
      
      // Update refs for concurrency safety
      sourcesRef.current[idx] = localPath;
      historyRef.current[idx] = [localPath, ...(historyRef.current[idx] || [])].slice(0, 10);

      // Update UI
      setLocalUrls(prev => { const n = [...prev]; n[idx] = displayUrl; return n; });

      // Sync to DB
      onUpdateTriptych(panel.panel_id, [...sourcesRef.current], [...historyRef.current]);
      
      // Play success sound
      playSuccessSound('panel', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
      onTaskFinish(taskId, 'success');
    } catch (e: unknown) {
      console.error('[MicroMontage] Generation failed:', e);
      playSound('error', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
      onTaskFinish(taskId, 'error');
      throw e; // 重新抛出以便批量生成时处理
    }
  };

  // 原有的 handleGenerateSlot 改为调用内部函数
  const handleGenerateSlot = async (idx: number) => {
    setGenerating(prev => { const n = [...prev]; n[idx] = true; return n; });
    try {
      await generateSlotInternal(idx);
    } finally {
      setGenerating(prev => { const n = [...prev]; n[idx] = false; return n; });
    }
  };

  // 批量生成 Shot2 和 Shot3
  const handleGenerateSlot2And3 = async () => {
    // 检查 Shot1 是否已生成（作为前置条件）
    if (!localUrls[0]) {
      alert('请先生成 Shot1');
      return;
    }
    
    // 检查是否正在生成
    if (generating[1] || generating[2]) {
      return;
    }
    
    setGenerating(prev => { const n = [...prev]; n[1] = true; n[2] = true; return n; });
    
    try {
      // 按顺序生成：先 Shot2，再 Shot3
      await generateSlotInternal(1); // Shot2
      await generateSlotInternal(2); // Shot3
    } catch (e) {
      console.error('[BatchGen] Failed to generate shot2 and shot3:', e);
    } finally {
      setGenerating(prev => { const n = [...prev]; n[1] = false; n[2] = false; return n; });
    }
  };

  const handleMerge = async () => {
    const resultUrl = await mergeImages(localUrls);
    if (resultUrl) {
      onPreview(resultUrl);
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      await onSaveResult(blob);
    }
  };

  const allSlotsReady = localUrls.every(u => u);

  // ========== Line Art Handlers ==========
  
  const handleSelectLineArtHistory = useCallback(async (historyPath: string) => {
    try {
      const displayUrl = await loadAssetImage(historyPath);
      setGeneratedLineArtUrl(displayUrl);
      onUpdatePanel(panel.panel_id, { lineArt: historyPath });
    } catch (e) {
      console.error('Failed to load history line art', e);
    }
  }, [panel.panel_id, onUpdatePanel]);

  const handleGenerateLineArt = async () => {
    if (!isLineArtAvailable(settings)) {
      alert(getLineArtAvailabilityMessage(settings));
      return;
    }
    
    setIsGeneratingLineArt(true);
    setLineArtProgress('准备中...');
    
    const taskId = onTaskStart(`线稿三联画 - 分镜 #${panel.panel_id}`, 'image', settings.imageModel);
    
    try {
      const result = await generateLineArtTriptych(
        {
          panel,
          project,
          settings,
          assetImages,
          options: {
            style: 'manga',
            aspectRatio: lineArtAspectRatio,
          },
        },
        (status) => {
          setLineArtProgress(status);
        }
      );
      
      let localPath = result.imageUrl;
      try {
        const filename = `lineart_${panel.panel_id}_${Date.now()}.png`;
        localPath = await saveImageToAssets(result.imageBlob, filename);
      } catch (err) {
        console.warn('Failed to save line art locally, using remote URL', err);
      }
      
      const displayUrl = await loadAssetImage(localPath);
      setGeneratedLineArtUrl(displayUrl);
      
      const currentHistory = panel.lineArtHistory || [];
      const newHistory = [localPath, ...currentHistory.filter(p => p !== localPath)].slice(0, 10);
      
      onUpdatePanel(panel.panel_id, { 
        lineArt: localPath,
        lineArtHistory: newHistory,
        triptych: localPath,
        triptych_sources: result.visualLines,
      });
      
      onTaskFinish(taskId, 'success');
      setLineArtProgress('三格分镜线稿生成完成！');
    } catch (e: unknown) {
      const error = e as Error;
      console.error('[LineArt] Generation failed:', error);
      alert(`线稿生成失败: ${error.message}`);
      onTaskFinish(taskId, 'error');
      setLineArtProgress('');
    } finally {
      setIsGeneratingLineArt(false);
    }
  };

  const lineArtAvailable = isLineArtAvailable(settings);

  // ========== Render ==========
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">🧩 动作分解 (三连拍)</h4>
      
      {/* Micro-Montage Continuity Control */}
      <div className="bg-[#151515] rounded-lg border border-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-medium">🔗 跨分镜连续性</span>
          <select
            value={continuityMode}
            onChange={(e) => setContinuityMode(e.target.value as ContinuityMode)}
            className="bg-[#0A0A0A] text-[10px] text-gray-300 border border-white/10 rounded px-2 py-1 focus:border-blue-500/50 outline-none"
          >
            <option value="auto">自动判断</option>
            <option value="on">强制开启</option>
            <option value="off">强制关闭</option>
          </select>
        </div>
        
        {/* Continuity Status */}
        {continuityAnalysis && (
          <div className={`text-[9px] p-2 rounded ${
            continuityAnalysis.shouldUsePrevAnchor 
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
          }`}>
            <div className="flex items-center gap-2">
              <span>{continuityAnalysis.shouldUsePrevAnchor ? '✓ 启用' : '✗ 禁用'}</span>
              <span className="opacity-70">({Math.round(continuityAnalysis.confidence * 100)}% 置信度)</span>
              <button
                onClick={() => setShowContinuityInfo(!showContinuityInfo)}
                className="ml-auto text-gray-500 hover:text-gray-300"
              >
                {showContinuityInfo ? '▲' : '▼'}
              </button>
            </div>
            {showContinuityInfo && (
              <div className="mt-2 pt-2 border-t border-current/20">
                <div className="text-[9px] opacity-80">{continuityAnalysis.reason}</div>
                {continuityAnalysis.prevPanelAnchorPath && (
                  <div className="mt-1 text-[8px] opacity-60 truncate">
                    锚点: {continuityAnalysis.prevPanelAnchorPath.split('/').pop()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Three Shots - Vertical Layout */}
      <div className="space-y-4">
        {[0, 1, 2].map(idx => {
          const slotHistory = panel.triptych_history?.[idx] || [];
          const slotHistoryUrls = historyUrls[idx] || [];
          const currentPath = sourcesRef.current[idx];
          const isExpanded = expandedSlot === idx;
          
          return (
            <div key={idx} className="bg-[#1A1A1A] rounded-xl border border-white/5 overflow-hidden">
              {/* Slot Header */}
              <div className="px-3 py-2 bg-[#222] border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400">Shot {idx + 1}</span>
                <div className="flex items-center gap-2">
                  {slotHistoryUrls.length > 0 && (
                    <button
                      onClick={() => setExpandedSlot(isExpanded ? null : idx)}
                      className="text-[9px] text-blue-400 hover:text-blue-300"
                    >
                      📜 历史 ({slotHistoryUrls.length}) {isExpanded ? '↑' : '↓'}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Main Content */}
              <div className="p-3 flex gap-3">
                {/* Image Area */}
                <div className="w-32 shrink-0">
                  <div 
                    className="aspect-video bg-[#0A0A0A] rounded-lg border border-white/5 overflow-hidden relative group cursor-pointer"
                    onClick={() => localUrls[idx] && onPreview(localUrls[idx])}
                  >
                    {localUrls[idx] ? (
                      <>
                        <img src={localUrls[idx]} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          <span className="text-white/0 group-hover:text-white text-xs">🔍</span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700 text-[10px]">
                        空
                      </div>
                    )}
                    {generating[idx] && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="w-5 h-5 border-2 border-blue-400/50 border-t-blue-400 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  {/* Generate Button */}
                  <button
                    onClick={() => handleGenerateSlot(idx)}
                    disabled={generating[idx]}
                    className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {generating[idx] ? '生成中...' : '✨ 生成'}
                  </button>
                </div>
                
                {/* Prompt Editor */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-500">画面描述</span>
                    <div className="flex items-center gap-2">
                      {/* 只在 Shot2 显示批量生成按钮 */}
                      {idx === 1 && (
                        <button
                          onClick={handleGenerateSlot2And3}
                          disabled={generating[1] || generating[2] || !localUrls[0]}
                          className="px-2 py-1 rounded text-[9px] font-bold bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-300 border border-purple-500/30 hover:from-purple-600/30 hover:to-pink-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          title="一键生成 Shot2 和 Shot3（需要先生成 Shot1）"
                        >
                          {generating[1] || generating[2] ? '生成中...' : '🚀 一键生成 2+3'}
                        </button>
                      )}
                      <button
                        onClick={() => setShowPromptDetail(showPromptDetail === idx ? null : idx)}
                        className="text-[9px] text-gray-500 hover:text-amber-400"
                      >
                        {showPromptDetail === idx ? '▲ 隐藏详情' : '▼ 查看详情'}
                      </button>
                      {customPrompts[idx] !== visualLines[idx] && (
                        <button
                          onClick={() => handleResetPrompt(idx)}
                          className="text-[9px] text-gray-500 hover:text-blue-400"
                        >
                          ↺ 重置
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={customPrompts[idx]}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      // Update local state immediately (optimistic UI)
                      setCustomPrompts(prev => { 
                        const n = [...prev]; 
                        n[idx] = newValue; 
                        return n; 
                      });
                      
                      // Sync back to panel.shots[idx].visual for bidirectional sync
                      // CRITICAL: Read latest panel from project.volumes to avoid stale closure
                      // Find the volume and script containing this panel
                      // CRITICAL: Use inspector to find the correct volume and episode
                      let latestPanel: ScriptPanel | undefined;
                      if (inspector && inspector.type === 'panel' && inspector.volId && inspector.episodeNum !== undefined) {
                        const vol = project.volumes.find(v => v.id === inspector.volId);
                        const script = vol?.scriptCache[inspector.episodeNum];
                        latestPanel = script?.panels?.find(p => p.panel_id === panel.panel_id);
                      } else {
                        // Fallback: search all volumes (may find wrong panel if panel_id is duplicated)
                        for (const vol of project.volumes) {
                          for (const script of Object.values(vol.scriptCache || {})) {
                            const foundPanel = script.panels?.find(p => p.panel_id === panel.panel_id);
                            if (foundPanel) {
                              latestPanel = foundPanel;
                              break;
                            }
                          }
                          if (latestPanel) break;
                        }
                      }
                      
                      // Use latest panel if found, otherwise fallback to prop
                      const currentPanel = latestPanel || panel;
                      
                      if (currentPanel.shots && currentPanel.shots[idx]) {
                        const updatedShots = [...currentPanel.shots] as [PanelShot, PanelShot, PanelShot];
                        updatedShots[idx] = { ...updatedShots[idx], visual: newValue };
                        onUpdatePanel(panel.panel_id, { shots: updatedShots });
                      } else {
                        // Create shots if they don't exist
                        const defaultShots: [PanelShot, PanelShot, PanelShot] = [
                          { index: 1, dialogue: '', action: '', visual: '', characterAssetIds: [], sceneAssetId: null, propAssetIds: [], shotSize: 'WS', composition: '三分法', camera: '平视', light: '自然光' },
                          { index: 2, dialogue: '', action: '', visual: '', characterAssetIds: [], sceneAssetId: null, propAssetIds: [], shotSize: 'MS', composition: '三分法', camera: '平视', light: '自然光' },
                          { index: 3, dialogue: '', action: '', visual: '', characterAssetIds: [], sceneAssetId: null, propAssetIds: [], shotSize: 'CU', composition: '三分法', camera: '平视', light: '自然光' }
                        ];
                        defaultShots[idx] = { ...defaultShots[idx], visual: newValue };
                        onUpdatePanel(panel.panel_id, { shots: defaultShots });
                      }
                    }}
                    className="w-full h-16 bg-[#0A0A0A] border border-white/10 rounded-lg p-2 text-[10px] text-gray-300 resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none"
                    placeholder="输入此 Shot 的画面描述..."
                  />
                  
                  {/* Full Prompt Detail (Expandable) */}
                  {showPromptDetail === idx && (
                    <div className="bg-[#0A0A0A] border border-amber-500/20 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[9px] text-amber-400 font-bold uppercase">完整生成提示词 (微蒙太奇)</div>
                        <div className="text-[8px] text-gray-500">
                          {SHOT_PLAN[idx]?.type} · {SHOT_PLAN[idx]?.beat}
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                        {buildMicroMontagePrompt(idx, customPrompts[idx] || visualLines[idx])}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* History Timeline (Expandable) */}
              {isExpanded && slotHistoryUrls.length > 0 && (
                <div className="px-3 pb-3 border-t border-white/5 pt-3">
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {slotHistoryUrls.map((url, hIdx) => {
                      const historyPath = slotHistory[hIdx];
                      const isCurrent = historyPath === currentPath;
                      const timestamp = historyPath ? parseTimestampFromPath(historyPath) : null;
                      const timeStr = timestamp ? formatRelativeTime(timestamp) : `#${hIdx + 1}`;
                      
                      return (
                        <div
                          key={hIdx}
                          onClick={() => historyPath && handleSelectHistory(idx, historyPath)}
                          className={`shrink-0 cursor-pointer transition-all ${
                            isCurrent ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-white/30'
                          }`}
                        >
                          <div className="w-20 aspect-video bg-[#0A0A0A] rounded overflow-hidden relative">
                            <img src={url} className="w-full h-full object-cover" />
                            {isCurrent && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="text-[8px] text-gray-500 text-center mt-1 truncate">
                            {isCurrent ? '当前' : timeStr}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleMerge}
          disabled={isMerging || !allSlotsReady}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            allSlotsReady 
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:brightness-110' 
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          {isMerging ? '拼合中...' : allSlotsReady ? '🎬 快速拼图' : '请先生成全部 3 格'}
        </button>
        
        <button
          onClick={() => setShowComposer(true)}
          disabled={!allSlotsReady}
          className={`px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1 ${
            allSlotsReady 
              ? 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white' 
              : 'bg-gray-800/50 text-gray-600 border border-white/5 cursor-not-allowed'
          }`}
        >
          🎨 编辑
        </button>
        
        <button
          onClick={() => setShowVideoRef(true)}
          disabled={!allSlotsReady}
          className={`px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1 ${
            allSlotsReady 
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:brightness-110' 
              : 'bg-gray-800/50 text-gray-600 border border-white/5 cursor-not-allowed'
          }`}
          title="生成视频 AI 参考帧"
        >
          🎬 视频帧
        </button>
      </div>
      
      {mergeError && <p className="text-[10px] text-red-500 text-center mt-2">{mergeError}</p>}
      
      {/* TEMP DISABLED: Line Art Triptych (will remove later) */}
      {false && (
        <div className="border-t border-white/5 pt-4">
          <button
            onClick={() => setShowLineArtSection(!showLineArtSection)}
            className="w-full flex items-center justify-between py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-amber-400">✏️</span>
              <span className="font-bold">一键线稿三联画</span>
              <span className="text-[9px] text-gray-600">(实验性功能)</span>
            </span>
            <span className="text-xs">{showLineArtSection ? '▲' : '▼'}</span>
          </button>
          
          {showLineArtSection && (
            <div className="mt-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-gray-500">基于角色/场景资产生成连贯分镜</span>
              {!lineArtAvailable && (
                <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">需要 Nano-Banana 模型</span>
              )}
            </div>
            
            {/* Generate Button */}
            <button
              onClick={handleGenerateLineArt}
              disabled={isGeneratingLineArt || !lineArtAvailable}
              className={`w-full py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                lineArtAvailable && !isGeneratingLineArt
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:brightness-110 shadow-lg shadow-amber-500/20' 
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              {isGeneratingLineArt ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  {lineArtProgress || '生成中...'}
                </>
              ) : (
                <>✏️ 生成线稿三联画</>
              )}
            </button>
            
            {/* Aspect Ratio Selection */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400">生成比例:</span>
              <div className="flex gap-2">
                {(['9:16', '16:9'] as const).map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setLineArtAspectRatio(ratio)}
                    disabled={isGeneratingLineArt}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      lineArtAspectRatio === ratio
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                        : 'bg-gray-800 text-gray-400 border border-white/10 hover:bg-gray-700'
                    }`}
                  >
                    {ratio} {ratio === '9:16' ? '(竖版)' : '(横版)'}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Single Image Preview Area */}
            <div 
              className={`bg-[#0A0A0A] rounded-lg border border-white/10 overflow-hidden relative cursor-pointer group ${
                lineArtAspectRatio === '9:16' ? 'aspect-[9/16] max-w-[200px] mx-auto' : 'aspect-video'
              }`}
              onClick={() => generatedLineArtUrl && onPreview(generatedLineArtUrl)}
            >
              {generatedLineArtUrl ? (
                <>
                  <img 
                    src={generatedLineArtUrl} 
                    className="w-full h-full object-contain"
                    alt="线稿三联画"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                    <span className="text-white/0 group-hover:text-white text-xl">🔍</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-4">
                  <span className="text-3xl mb-3 opacity-30">✏️</span>
                  <span className="text-[11px] font-bold text-gray-500 mb-2">线稿三联画预览</span>
                  <div className="text-[9px] text-gray-600 text-center space-y-1">
                    <div>🎬 {visualLines[0]?.substring(0, 20) || '全景'}...</div>
                    <div>📷 {visualLines[1]?.substring(0, 20) || '中景'}...</div>
                    <div>🔍 {visualLines[2]?.substring(0, 20) || '特写'}...</div>
                  </div>
                </div>
              )}
              <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-[9px] text-white/80">
                {lineArtAspectRatio}
              </div>
            </div>
            
            {/* Generated Result Info */}
            {generatedLineArtUrl && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-green-400">✅ 生成完成</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onPreview(generatedLineArtUrl)}
                    className="text-[10px] text-amber-400 hover:text-amber-300"
                  >
                    🔍 查看大图
                  </button>
                  {lineArtHistoryUrls.length > 0 && (
                    <button
                      onClick={() => setShowLineArtHistory(!showLineArtHistory)}
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      📜 历史 ({lineArtHistoryUrls.length}) {showLineArtHistory ? '↑' : '↓'}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Line Art History */}
            {showLineArtHistory && lineArtHistoryUrls.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <div className="text-[9px] text-gray-500 mb-2">历史记录 (点击选择)</div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {lineArtHistoryUrls.map((url, hIdx) => {
                    const historyPath = panel.lineArtHistory?.[hIdx];
                    const isCurrent = historyPath === panel.lineArt;
                    
                    return (
                      <div
                        key={hIdx}
                        onClick={() => historyPath && handleSelectLineArtHistory(historyPath)}
                        className={`shrink-0 cursor-pointer transition-all ${
                          isCurrent ? 'ring-2 ring-amber-500' : 'hover:ring-1 hover:ring-white/30'
                        }`}
                      >
                        <div className={`bg-[#0A0A0A] rounded overflow-hidden relative ${
                          lineArtAspectRatio === '9:16' ? 'w-12 aspect-[9/16]' : 'w-20 aspect-video'
                        }`}>
                          <img src={url} className="w-full h-full object-cover" />
                          {isCurrent && (
                            <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="text-[8px] text-gray-500 text-center mt-1">
                          {isCurrent ? '当前' : `#${hIdx + 1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      )}
      
      {/* Composer Modal */}
      <ComposerModal
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        onSave={onSaveResult}
        shotUrls={localUrls}
        shotCaptions={visualLines}
        assets={project.assets.filter(a => (panel.relatedAssetIds || []).includes(a.id))}
        assetImages={assetImages}
        panelInfo={{
          scene: panel.scene_name,
          duration: panel.duration
        }}
      />
      
      {/* Video Reference Modal */}
      <VideoReferenceModal
        isOpen={showVideoRef}
        onClose={() => setShowVideoRef(false)}
        onSave={onSaveResult}
        onGeneratePrompt={() => {}}
        panel={panel}
        project={project}
        assetImages={assetImages}
        shotUrls={localUrls}
      />
    </div>
  );
};

export default StoryboardBoard;
