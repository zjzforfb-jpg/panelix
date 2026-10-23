/**
 * VideoGeneratorPanel
 * Panel for video generation - reference image, prompt, history, and generation
 * 
 * Features:
 * - Multi-model support (Veo, Sora, Kling, VolcEngine)
 * - Camera movement selection
 * - Optimized prompts per model
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ScriptPanel, Project, AppSettings, VideoGeneration, VeoModel, CameraMove, VideoSegmentKey, DirectorPlan, VideoTimelineConfig, WebtoonScript } from '../types';
import { generateVideo, queryVideoTask, VEO_MODELS, imageToBase64 } from '../services/veoService';
import { generateSora2Video, querySora2Task, isSora2Model, SORA2_MODELS } from '../services/sora2Service';
import { createVolcVideoTask, queryVolcVideoTask, isVolcArkVideoModel } from '../services/volcArkService';
import { loadAssetImage, saveImageToAssets } from '../services/fileSystem';
import { 
  buildVideoPrompt, 
  buildPromptConfigFromPanel, 
  generateFormattedPrompt,
  buildAllModelPrompts,
  getModelInfo,
  detectModelProvider,
  type CameraMove as CameraMoveType,
  type AllModelPrompts,
} from '../services/videoPromptBuilder';
import {
  checkPromptSafety,
  getRiskLevelColor,
  getRiskLevelBg,
  getRiskLevelLabel,
  getCategoryIcon,
  autoCleanPrompt,
  type SafetyCheckResult,
} from '../services/promptSafetyChecker';
import {
  buildVideoReferenceImage,
  canBuildReferenceImage,
  buildMicroMontageReferenceImage,
  canBuildMicroMontage,
  type VideoReferenceResult,
  type VideoReferenceLayoutMode,
  type MicroMontageConfig,
} from '../services/videoReferenceImageBuilder';
import {
  shouldUseCrossPanelContinuity,
  type ContinuityAnalysisResult,
} from '../services/microMontageContinuity';
import {
  buildDefaultTimeline,
  exportTimelineToSoraPrompt,
  exportTimelineToVeoPrompt,
  exportTimelineToGenericPrompt,
  exportTimelineToSeedancePrompt,
  detectModelProviderFromName,
  exportAllTimelinePrompts,
  buildCinematicTimelineFromDirectorPlan,
  buildSeedanceRefImageDescription,
} from '../services/videoTimelineBuilder';
import { ShotUnit } from '../types';
import { playSuccessSound, playSound } from '../services/soundService';
import {
  buildAllSegmentPrompts,
  calculateSegmentDuration,
  extractShotVisual,
  type AllSegmentsResult,
  type TransitionPromptResult,
} from '../services/transitionPromptBuilder';
import {
  checkConcatHealth,
  concatenateVideos,
  concatenateVideoUrls,
  type HealthCheckResponse,
  type ConcatResponse,
} from '../services/videoConcatService';
import { generateDirectorShotPlanFromThreeLines } from '../services/geminiService';

interface VideoGeneratorPanelProps {
  panel: ScriptPanel;
  project: Project;
  settings: AppSettings;
  assetImages: Record<string, string>;
  shotUrls: string[];
  
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
  onTaskStart: (desc: string, type?: string, model?: string) => string;
  onTaskFinish: (id: string, status: 'success' | 'error') => void;
  onPreview: (url: string) => void;
}

// Parse timestamp from path
const parseTimestampFromPath = (path: string): number | null => {
  const match = path.match(/(\d{13})/);
  return match ? parseInt(match[1], 10) : null;
};

// Format relative time
const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
};

export const VideoGeneratorPanel: React.FC<VideoGeneratorPanelProps> = ({
  panel, project, settings, assetImages, shotUrls,
  onUpdatePanel, onTaskStart, onTaskFinish, onPreview
}) => {
  // Debug flag (disable noisy logs in production)
  const DEBUG_VIDEO = false;
  
  // Ref to hold handleGenerate function - avoids TDZ (Temporal Dead Zone) error
  // when handleConfirmAutoPlan references handleGenerate before its declaration
  const handleGenerateRef = useRef<(() => Promise<void>) | null>(null);

  const checkTriptychAvailability = useCallback((): { ok: boolean; message: string } => {
    const sources = panel.triptych_sources || [];
    const validSources = sources.filter((src) => src && src.trim() !== '');
    if (validSources.length === 0) {
      return {
        ok: false,
        message: '⚠️ 未检测到分镜图。请先在「绘图」标签页生成三张分镜图后再生成视频。',
      };
    }
    if (validSources.length < 3) {
      return {
        ok: false,
        message: `⚠️ 检测到只有 ${validSources.length} 张分镜图，建议生成完整的 3 张分镜图后再生成视频。`,
      };
    }
    return { ok: true, message: '' };
  }, [panel.triptych_sources]);

  const debugLog = useCallback((...args: unknown[]) => {
    if (DEBUG_VIDEO) console.log(...args);
  }, []);

  useEffect(() => {
    if (panel.videoTimeline) {
      setTimeline(panel.videoTimeline);
      setIsTimelineConfirmed(true);
    }
  }, [panel.videoTimeline]);

  // Reference image state
  const [refImageUrl, setRefImageUrl] = useState<string>('');
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  
  // Prompt state
  const [videoPrompt, setVideoPrompt] = useState(panel.currentVideoPrompt || '');
  const [formattedPrompt, setFormattedPrompt] = useState('');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<VeoModel>(settings.veoModel || 'veo3.1');
  
  // Sync selectedModel with settings.veoModel when it changes externally (e.g., from SettingsModal)
  useEffect(() => {
    if (settings.veoModel && settings.veoModel !== selectedModel) {
      setSelectedModel(settings.veoModel);
    }
  }, [settings.veoModel]);
  
  // Track previous model to detect changes (ref used later in useEffect after promptModelMismatch is defined)
  const prevModelRef = useRef<string>(selectedModel);
  
  // History
  const [historyUrls, setHistoryUrls] = useState<Record<string, string>>({});
  const [expandHistory, setExpandHistory] = useState(false);
  
  // Safety check state
  const [safetyResult, setSafetyResult] = useState<SafetyCheckResult | null>(null);
  
  // All models prompts preview state
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [allModelPrompts, setAllModelPrompts] = useState<AllModelPrompts | null>(null);
  
  // Combined reference image state
  const [isBuildingRef, setIsBuildingRef] = useState(false);
  const [refLayoutDescription, setRefLayoutDescription] = useState<string>('');
  
  // Micro-Montage layout state
  const [refLayoutMode, setRefLayoutMode] = useState<VideoReferenceLayoutMode>('microMontage');
  const [continuityAnalysis, setContinuityAnalysis] = useState<ContinuityAnalysisResult | null>(null);
  
  // Timeline DSL state (Advanced mode - default collapsed for better initial view)
  const [timeline, setTimeline] = useState<VideoTimelineConfig | null>(panel.videoTimeline || null);
  const [showTimelineEditor, setShowTimelineEditor] = useState(false); // Default collapsed
  const [timelinePromptType, setTimelinePromptType] = useState<'auto' | 'sora' | 'veo' | 'seedance'>('auto');
  const [timelinePrompts, setTimelinePrompts] = useState<{ sora: string; veo: string; seedance: string; generic: string } | null>(null);
  const [isTimelineConfirmed, setIsTimelineConfirmed] = useState<boolean>(!!panel.videoTimeline);
  type ShotEditableField = 'action' | 'camera' | 'subject' | 'scene' | 'light' | 'grade' | 'camTech' | 'audio' | 'durationSec';
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<ShotEditableField | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  // Auto director draft state
  const [autoPlanDraft, setAutoPlanDraft] = useState<DirectorPlan | null>(panel.videoDirectorPlan || null);
  const [autoTimelineDraft, setAutoTimelineDraft] = useState<VideoTimelineConfig | null>(null);
  const [autoPromptDraft, setAutoPromptDraft] = useState<string | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  // Director plan confirmed state - gates timeline generation
  const [isDirectorPlanConfirmed, setIsDirectorPlanConfirmed] = useState<boolean>(!!panel.videoDirectorPlan);
  // Track which model the current prompt was generated for (for mismatch detection)
  const [promptGeneratedFor, setPromptGeneratedFor] = useState<string | null>(null);
  
  // Video sub-tabs (in Video panel)
  // Default prefer segment mode; show hints when prerequisites are missing.
  const [videoTab, setVideoTab] = useState<'segment' | 'single'>('segment');

  // Concat backend health (local sidecar /api/health)
  const [concatHealth, setConcatHealth] = useState<HealthCheckResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const health = await checkConcatHealth(settings);
      if (!cancelled) setConcatHealth(health);
    })().catch(() => {
      if (!cancelled) setConcatHealth({ status: 'error', error: 'Connection failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [settings.videoConcatBaseUrl]);

  const [segmentPrompts, setSegmentPrompts] = useState<TransitionPromptResult[] | null>(null);
  // Track which panel the current segmentPrompts belongs to
  const [segmentPromptsPanelId, setSegmentPromptsPanelId] = useState<number | null>(null);
  const [segmentStatus, setSegmentStatus] = useState<Record<VideoSegmentKey, 'idle' | 'generating' | 'success' | 'error'>>({
    'p3-1': 'idle',
    '1-2': 'idle',
    '2-3': 'idle',
  });
  const [segmentVideos, setSegmentVideos] = useState<Record<VideoSegmentKey, string>>({
    'p3-1': '',
    '1-2': '',
    '2-3': '',
  });
  const [concatStatus, setConcatStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [concatError, setConcatError] = useState<string>('');
  const [concatResult, setConcatResult] = useState<string>(''); // Blob URL of concatenated video
  
  // Modal state for regenerate prompts confirmation
  const [showRegenPromptModal, setShowRegenPromptModal] = useState(false);
  
  // Polling refs
  const pollingRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // Ref to store latest generations (avoid stale closure in polling)
  const generationsRef = useRef(panel.videoGenerations || []);
  
  // Ref to cache last progress values (avoid redundant updates that cause re-renders)
  const lastProgressRef = useRef<Record<string, string>>({});
  
  // Ref to track last loaded reference image source (prevent duplicate loads)
  const lastLoadedSourceRef = useRef<string>('');
  
  // Ref to track locally-set reference image path (prevent loadRefImage from overwriting before panel catches up)
  // CRITICAL: Use panel ID as key to avoid cross-panel pollution
  const localOverridePathRef = useRef<Record<number, string>>({});

  // Ref to track previous panel ID for debug logs
  const prevPanelIdRef = useRef<number | null>(null);

  // Keep ref in sync with panel.videoGenerations
  useEffect(() => {
    generationsRef.current = panel.videoGenerations || [];
  }, [panel.videoGenerations]);

  // Sync videoPrompt when panel changes (fix stale prompt issue)
  useEffect(() => {
    setVideoPrompt(panel.currentVideoPrompt || '');
    // Clear formatted prompt and safety result when panel changes
    setFormattedPrompt('');
    setSafetyResult(null);
    // Clear segment prompt cache when switching to a different panel
    setSegmentPrompts(null);
    setSegmentPromptsPanelId(null);
    setSegmentPromptText({
      'p3-1': '',
      '1-2': '',
      '2-3': '',
    });

    prevPanelIdRef.current = panel.panel_id;
  }, [panel.panel_id, panel.currentVideoPrompt]);

  // Segment prompt text state (editable textarea content)
  const [segmentPromptText, setSegmentPromptText] = useState<Record<VideoSegmentKey, string>>({
    'p3-1': '',
    '1-2': '',
    '2-3': '',
  });
  // Sync persisted segment prompts from panel (so page switch retains prompts)
  useEffect(() => {
    if (panel.segmentPrompts && panel.segmentPrompts.length > 0) {
      setSegmentPrompts(panel.segmentPrompts as TransitionPromptResult[]);
      setSegmentPromptsPanelId(panel.panel_id);
      setSegmentPromptText({
        'p3-1': panel.segmentPrompts.find(s => s.segmentKey === 'p3-1')?.prompt || '',
        '1-2': panel.segmentPrompts.find(s => s.segmentKey === '1-2')?.prompt || '',
        '2-3': panel.segmentPrompts.find(s => s.segmentKey === '2-3')?.prompt || '',
      });
    }
  }, [panel.segmentPrompts, panel.panel_id]);

  // Restore segment videos/status from persisted panel.videoGenerations when switching panels or re-entering
  useEffect(() => {
    const gens = panel.videoGenerations || [];
    const segGens = gens.filter(g => g.kind === 'segment' && g.segmentKey);

    const latestByKey: Partial<Record<VideoSegmentKey, VideoGeneration>> = {};
    for (const g of segGens) {
      const key = g.segmentKey as VideoSegmentKey;
      const prev = latestByKey[key];
      if (!prev || (g.createdAt || 0) > (prev.createdAt || 0)) {
        latestByKey[key] = g;
      }
    }

    // Explicitly reset all keys, only set to success if found in persisted data
    const nextStatus: Record<VideoSegmentKey, 'idle' | 'generating' | 'success' | 'error'> = {
      'p3-1': latestByKey['p3-1']?.status === 'success' ? 'success' : 'idle',
      '1-2': latestByKey['1-2']?.status === 'success' ? 'success' : 'idle',
      '2-3': latestByKey['2-3']?.status === 'success' ? 'success' : 'idle',
    };

    const nextVideos: Record<VideoSegmentKey, string> = {
      'p3-1': latestByKey['p3-1']?.videoUrl || '',
      '1-2': latestByKey['1-2']?.videoUrl || '',
      '2-3': latestByKey['2-3']?.videoUrl || '',
    };

    // Always use panel.segmentPrompts as the ONLY source of truth (not local state)
    const panelPrompts = panel.segmentPrompts || [];
    const hasPanelPrompts = panelPrompts.length > 0;

    const nextPromptText: Record<VideoSegmentKey, string> = {
      'p3-1': hasPanelPrompts
        ? panelPrompts.find(s => s.segmentKey === 'p3-1')?.prompt || ''
        : latestByKey['p3-1']?.prompt || '',
      '1-2': hasPanelPrompts
        ? panelPrompts.find(s => s.segmentKey === '1-2')?.prompt || ''
        : latestByKey['1-2']?.prompt || '',
      '2-3': hasPanelPrompts
        ? panelPrompts.find(s => s.segmentKey === '2-3')?.prompt || ''
        : latestByKey['2-3']?.prompt || '',
    };

    setSegmentStatus(nextStatus);
    setSegmentVideos(nextVideos);
    setSegmentPromptText(nextPromptText);

  }, [panel.panel_id, panel.videoGenerations, panel.segmentPrompts]);

  // Restore concat result from persisted panel.videoGenerations after refresh/page switch
  useEffect(() => {
    const gens = panel.videoGenerations || [];
    const concatGens = gens.filter(g => g.kind === 'concat' && g.status === 'success');
    
    // CRITICAL: If no concat found, explicitly clear state to prevent stale display
    if (concatGens.length === 0) {
      setConcatResult('');
      setConcatStatus('idle');
      setConcatError('');
      return;
    }

    const latest = concatGens.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));

    const restore = async () => {
      try {
        // Prefer local path (blob URL won't survive refresh)
        if (latest.videoPath) {
          const url = await loadAssetImage(latest.videoPath);
          if (url) {
            setConcatResult(url);
            setConcatStatus('success');
            setConcatError('');
            return;
          }
        }

        // Fallback to remote URL (if ever provided)
        if (latest.videoUrl) {
          setConcatResult(latest.videoUrl);
          setConcatStatus('success');
          setConcatError('');
        }
      } catch (e) {
        // Ignore restore errors silently
      }
    };

    restore();
  }, [panel.panel_id, panel.videoGenerations]);
  
  // Model provider
  const modelProvider = useMemo(() => detectModelProvider(selectedModel), [selectedModel]);

  // Detect prompt-model mismatch (e.g., seedance prompt used with non-seedance model)
  const promptModelMismatch = useMemo(() => {
    if (!promptGeneratedFor || !videoPrompt.trim()) return false;
    
    const currentProvider = detectModelProviderFromName(selectedModel);
    const promptProvider = detectModelProviderFromName(promptGeneratedFor);
    
    // Seedance prompts have different format from others
    if (currentProvider === 'seedance' && promptProvider !== 'seedance') return true;
    if (currentProvider !== 'seedance' && promptProvider === 'seedance') return true;
    
    return false;
  }, [promptGeneratedFor, selectedModel, videoPrompt]);

  // Linked assets
  const linkedAssets = useMemo(() => 
    project.assets.filter(a => panel.relatedAssetIds?.includes(a.id)),
    [project.assets, panel.relatedAssetIds]
  );

  // Visual lines from script
  const visualLines = useMemo(() => {
    const lines = panel.script_content?.split('\n')
      .filter(l => l.trim().startsWith('▲'))
      .map(l => l.replace(/^▲/, '').trim()) || [];
    return [lines[0] || '', lines[1] || '', lines[2] || ''];
  }, [panel.script_content]);

  // Analyze cross-panel continuity for micro-montage
  useEffect(() => {
    const analysis = shouldUseCrossPanelContinuity(panel, project);
    setContinuityAnalysis(analysis);
  }, [panel.panel_id, panel.globalPanelNo, panel.scene_name, panel.continuityMode, project]);

  // Stable key for shotUrls to prevent unnecessary re-renders
  const shotUrlsKey = useMemo(() => shotUrls.join('|'), [shotUrls]);
  
  // Compute current source key for reference image (for change detection)
  const currentSourceKey = useMemo(() => {
    return panel.videoRefPath || panel.triptych || panel.imagePath || shotUrls[0] || '';
  }, [panel.videoRefPath, panel.triptych, panel.imagePath, shotUrls]);

  // Load reference image with fallback: videoRefPath > triptych > imagePath > shotUrls[0]
  // Optimized: only reload when source actually changes
  useEffect(() => {
    // Skip if source hasn't changed (prevents flicker during polling)
    if (currentSourceKey === lastLoadedSourceRef.current && refImageUrl) {
      return;
    }
    
    // CRITICAL: Check if we have a local override that panel hasn't caught up to yet
    // This prevents loadRefImage from overwriting the reference image set by handleBuildReferenceImage
    // before React async state updates propagate to the panel prop
    const localOverridePath = localOverridePathRef.current[panel.panel_id];
    if (localOverridePath) {
      // Check if panel has caught up to our local override
      if (panel.videoRefPath === localOverridePath || 
          panel.imagePath === localOverridePath) {
        // Panel caught up, clear the override and let normal flow continue
        delete localOverridePathRef.current[panel.panel_id];
        // Also update lastLoadedSourceRef so subsequent renders don't re-trigger
        lastLoadedSourceRef.current = localOverridePath || currentSourceKey;
      } else {
        // Panel hasn't caught up yet, skip loading to preserve local override
        return;
      }
    }
    
    const loadRefImage = async () => {
        setIsLoadingRef(true);
      
      // Priority order for reference image
      const imageSources = [
        panel.videoRefPath,           // 1. Video reference frame (from VideoReferenceModal)
        panel.triptych,               // 2. Triptych (三连图)
        panel.imagePath,              // 3. Generated storyboard image
        shotUrls[0],                  // 4. Fallback: first shot path/url
      ].filter(Boolean);
      
      debugLog('[RefImage] Sources to try:', imageSources.map(s => String(s).substring(0, 50)));
      
      for (const source of imageSources) {
        try {
          const url = await loadAssetImage(source as string);
          if (!url) throw new Error('Empty asset url');
          setRefImageUrl(url);
          lastLoadedSourceRef.current = source as string;
          setIsLoadingRef(false);
          return;
        } catch (e) {
          console.warn(`Failed to load reference from ${source}`, e);
        }
      }
      
      // No available source could be loaded
      setRefImageUrl('');
      lastLoadedSourceRef.current = '';
      setIsLoadingRef(false);
    };
    loadRefImage();
  }, [currentSourceKey, shotUrlsKey, panel.videoRefPath, panel.imagePath]); // Added panel paths to detect catch-up


  // Stable key for generations - only trigger when new generations are added or paths change
  const generationsKey = useMemo(() => {
    const gens = panel.videoGenerations || [];
    // Include id, refImagePath, and videoPath to detect meaningful changes
    return gens.map(g => `${g.id}:${g.refImagePath || ''}:${g.videoPath || ''}`).join(',');
  }, [panel.videoGenerations]);

  // Load history images - only when generations key changes (new items or new paths)
  useEffect(() => {
    const loadHistoryImages = async () => {
      const generations = panel.videoGenerations || [];
      const urls: Record<string, string> = {};
      
      for (const gen of generations) {
        if (gen.refImagePath && !historyUrls[gen.id]) {
          try {
            urls[gen.id] = await loadAssetImage(gen.refImagePath);
          } catch (e) {
            console.warn('Failed to load history image', e);
          }
        }
        if (gen.videoPath && !historyUrls[`${gen.id}_video`]) {
          try {
            urls[`${gen.id}_video`] = await loadAssetImage(gen.videoPath);
          } catch (e) {
            console.warn('Failed to load history video', e);
          }
        }
      }
      
      if (Object.keys(urls).length > 0) {
        setHistoryUrls(prev => ({ ...prev, ...urls }));
      }
    };
    loadHistoryImages();
  }, [generationsKey]); // Only reload when generations structure changes

  // Build combined reference image (line art + assets OR micro-montage)
  const handleBuildReferenceImage = useCallback(async () => {
    setIsBuildingRef(true);
    try {
      let result: VideoReferenceResult;
      
      if (refLayoutMode === 'microMontage') {
        // Build micro-montage reference image
        const triptychUrls = panel.triptych_sources || ['', '', ''];
        const checkResult = canBuildMicroMontage(panel, project, triptychUrls);
        if (!checkResult.canBuild) {
          alert(checkResult.reason || '无法构建微蒙太奇参考图');
          return;
        }
        
        // Load triptych URLs
        const loadedTriptychUrls: string[] = [];
        for (const path of triptychUrls) {
          if (path) {
            try {
              const url = await loadAssetImage(path);
              loadedTriptychUrls.push(url);
            } catch {
              loadedTriptychUrls.push('');
            }
          } else {
            loadedTriptychUrls.push('');
          }
        }
        
        // Get continuity analysis
        const analysis = continuityAnalysis || shouldUseCrossPanelContinuity(panel, project);
        
        // Load prev panel anchor if continuity enabled
        let prevPanelAnchorUrl: string | undefined;
        if (analysis.shouldUsePrevAnchor && analysis.prevPanelAnchorPath) {
          try {
            prevPanelAnchorUrl = await loadAssetImage(analysis.prevPanelAnchorPath);
          } catch {
            console.warn('Failed to load prev panel anchor');
          }
        }
        
        const microMontageConfig: MicroMontageConfig = {
          prevPanelAnchorUrl,
          triptychUrls: loadedTriptychUrls,
          useContinuity: analysis.shouldUsePrevAnchor,
          continuityReason: analysis.reason,
        };
        
        result = await buildMicroMontageReferenceImage(panel, project, assetImages, microMontageConfig);
        
      } else {
        // Original line art + assets layout
        const checkResult = canBuildReferenceImage(panel, project, assetImages);
        if (!checkResult.canBuild) {
          alert(checkResult.reason || '无法构建参考图');
          return;
        }
        
        // Get line art URL
        let lineArtUrl: string | undefined;
        if (panel.lineArt) {
          try {
            lineArtUrl = await loadAssetImage(panel.lineArt);
          } catch {
            console.warn('Failed to load line art');
          }
        }
        
        result = await buildVideoReferenceImage(panel, project, assetImages, lineArtUrl);
      }
      
      // Save to local filesystem
      const filename = `videoref_${panel.panel_id}_${Date.now()}.png`;
      const localPath = await saveImageToAssets(result.imageBlob, filename);
      
      // Update display (prefer local saved path so it survives refresh)
      try {
        const localDisplayUrl = await loadAssetImage(localPath);
        setRefImageUrl(localDisplayUrl || result.imageUrl);
      } catch {
        setRefImageUrl(result.imageUrl);
      }
      setRefLayoutDescription(result.layoutDescription);
      
      // CRITICAL: Set local override to prevent loadRefImage from overwriting before panel catches up
      // This guards against the async React state update timing issue
      // Use panel ID as key to prevent cross-panel pollution
      localOverridePathRef.current[panel.panel_id] = localPath;
      lastLoadedSourceRef.current = localPath;
      
      // Auto-generate prompt with layout description (returns the generated prompt)
      const generatedPrompt = generatePromptWithLayout(result.layoutDescription);
      
      // CRITICAL: Update panel with ALL changes at once to prevent race condition
      // where multiple onUpdatePanel calls read stale data and overwrite each other
      const updates: Partial<ScriptPanel> = {
        videoRefPath: localPath,
        imagePath: localPath,
        currentVideoPrompt: generatedPrompt, // Include the prompt that was just generated
      };
      
      onUpdatePanel(panel.panel_id, updates);
      
    } catch (e) {
      console.error('Failed to build reference image', e);
      alert('构建参考图失败');
    } finally {
      setIsBuildingRef(false);
    }
  }, [panel, project, assetImages, onUpdatePanel, refLayoutMode, continuityAnalysis]);

  const rebuildTimelinePrompts = useCallback((nextTimeline: VideoTimelineConfig) => {
    const targetDuration = settings.autoVideoPanelDurationSec ?? settings.volcVideoDuration ?? nextTimeline.contentDurationSec ?? 10;
    const seedanceOptions = {
      duration: targetDuration,
      resolution: (settings.volcVideoResolution || '720p') as '480p' | '720p' | '1080p',
      cf: settings.volcVideoGenerateAudio === false ? false : true,
      refImageLayoutHint: refLayoutDescription || undefined,
    };
    const prompts = exportAllTimelinePrompts(nextTimeline, seedanceOptions);
    setTimelinePrompts(prompts);
  }, [refLayoutDescription, settings.autoVideoPanelDurationSec, settings.volcVideoDuration, settings.volcVideoResolution, settings.volcVideoGenerateAudio]);

  // Watch for model changes and check mismatch - prompt user to regenerate if needed
  // NOTE: This useEffect must be after rebuildTimelinePrompts is defined
  useEffect(() => {
    // Skip on initial render
    if (prevModelRef.current === selectedModel) return;
    prevModelRef.current = selectedModel;
    
    // Only check mismatch if timeline is confirmed and prompt exists
    if (promptModelMismatch && isTimelineConfirmed && videoPrompt.trim() && timeline) {
      const currentProvider = detectModelProviderFromName(selectedModel);
      const promptProvider = promptGeneratedFor ? detectModelProviderFromName(promptGeneratedFor) : 'unknown';
      
      const regenerate = window.confirm(
        `⚠️ 提示词格式不匹配\n\n` +
        `当前提示词是为 ${promptProvider} 格式生成的，\n` +
        `但您已切换到 ${currentProvider} 模型（${selectedModel}）。\n\n` +
        `不同模型的提示词格式可能不兼容，这可能影响生成效果。\n` +
        `是否重新生成匹配的提示词？`
      );
      if (regenerate) {
        // Regenerate prompt for new model
        rebuildTimelinePrompts(timeline);
      }
    }
  }, [selectedModel, promptModelMismatch, isTimelineConfirmed, videoPrompt, timeline, promptGeneratedFor, rebuildTimelinePrompts]);

  const applyTimelineChanges = useCallback((nextTimeline: VideoTimelineConfig) => {
    setTimeline(nextTimeline);
    setIsTimelineConfirmed(false);
    rebuildTimelinePrompts(nextTimeline);
    onUpdatePanel(panel.panel_id, { videoTimeline: nextTimeline });
  }, [onUpdatePanel, panel.panel_id, rebuildTimelinePrompts]);

  // Generate timeline from panel context
  const generateTimeline = useCallback(() => {
    // Check if director plan exists
    const hasDirectorPlan = panel.videoDirectorPlan || autoPlanDraft;
    if (!hasDirectorPlan) {
      const proceed = window.confirm(
        '⚠️ 尚未生成导演镜头计划\n\n' +
        '导演计划可提供更精准的镜头分配和叙事节奏。\n' +
        '是否仍然生成基础时间轴？'
      );
      if (!proceed) return null;
    }
    
    const newTimeline = buildDefaultTimeline(panel, project, settings);
    
    // Update ref layout description if available
    if (refLayoutDescription) {
      newTimeline.refImageLayout = refLayoutDescription;
    }
    
    applyTimelineChanges(newTimeline);
    
    // Build Seedance options
    const targetDuration = settings.autoVideoPanelDurationSec ?? settings.volcVideoDuration ?? 10;
    const linkedAssetIds = [...(panel.relatedAssetIds || []), ...(panel.relatedItemIds || [])];
    const hasAssets = linkedAssetIds.length > 0;
    const hasTriptych = !!(panel.triptych_sources && panel.triptych_sources.length > 0);
    const hasPrevContinuity = continuityAnalysis?.shouldUsePrevAnchor ?? false;
    const seedanceRefHint = buildSeedanceRefImageDescription(hasAssets, hasTriptych, hasPrevContinuity);
    
    const seedanceOptions = {
      duration: targetDuration,
      resolution: (settings.volcVideoResolution || '720p') as '480p' | '720p' | '1080p',
      cameraFixed: false,
      refImageLayoutHint: seedanceRefHint || undefined,
    };
    
    // Generate prompts for all formats
    const prompts = exportAllTimelinePrompts(newTimeline, seedanceOptions);
    setTimelinePrompts(prompts);
    
    // Auto-select prompt based on model
    const provider = detectModelProviderFromName(selectedModel);
    let activePrompt: string;
    if (timelinePromptType === 'auto') {
      activePrompt = provider === 'seedance' ? prompts.seedance :
                     provider === 'sora' ? prompts.sora : 
                     provider === 'veo' ? prompts.veo : 
                     prompts.generic;
    } else if (timelinePromptType === 'seedance') {
      activePrompt = prompts.seedance;
    } else if (timelinePromptType === 'sora') {
      activePrompt = prompts.sora;
    } else if (timelinePromptType === 'veo') {
      activePrompt = prompts.veo;
    } else {
      activePrompt = prompts.generic;
    }
    
    setVideoPrompt(activePrompt);
    onUpdatePanel(panel.panel_id, { currentVideoPrompt: activePrompt });
    
    // Track which model this prompt was generated for
    setPromptGeneratedFor(selectedModel);
    
    // Run safety check
    if (activePrompt.trim()) {
      const result = checkPromptSafety(activePrompt);
      setSafetyResult(result);
    }
    
    return newTimeline;
  }, [panel, project, settings, selectedModel, timelinePromptType, refLayoutDescription, onUpdatePanel, continuityAnalysis, autoPlanDraft]);

  // Switch timeline prompt type
  const switchTimelinePromptType = useCallback((type: 'auto' | 'sora' | 'veo' | 'seedance') => {
    setTimelinePromptType(type);
    
    if (timelinePrompts) {
      let activePrompt: string;
      let trackModel: string;
      
      if (type === 'auto') {
        const provider = detectModelProviderFromName(selectedModel);
        activePrompt = provider === 'seedance' ? timelinePrompts.seedance :
                       provider === 'sora' ? timelinePrompts.sora : 
                       provider === 'veo' ? timelinePrompts.veo : 
                       timelinePrompts.generic;
        trackModel = selectedModel;
      } else if (type === 'seedance') {
        activePrompt = timelinePrompts.seedance;
        trackModel = 'doubao-seedance-1-0-pro'; // Representative seedance model
      } else if (type === 'sora') {
        activePrompt = timelinePrompts.sora;
        trackModel = 'sora2'; // Representative sora model
      } else if (type === 'veo') {
        activePrompt = timelinePrompts.veo;
        trackModel = 'veo3.1'; // Representative veo model
      } else {
        activePrompt = timelinePrompts.generic;
        trackModel = 'generic';
      }
      
      setVideoPrompt(activePrompt);
      onUpdatePanel(panel.panel_id, { currentVideoPrompt: activePrompt });
      
      // Track which model format this prompt was generated for
      setPromptGeneratedFor(trackModel);
      
      // Run safety check
      if (activePrompt.trim()) {
        const result = checkPromptSafety(activePrompt);
        setSafetyResult(result);
      }
    }
  }, [timelinePrompts, selectedModel, onUpdatePanel, panel.panel_id]);

  // Copy specific timeline prompt
  const copyTimelinePrompt = useCallback((type: 'sora' | 'veo' | 'seedance' | 'generic') => {
    if (timelinePrompts) {
      navigator.clipboard.writeText(timelinePrompts[type]);
    }
  }, [timelinePrompts]);

  const startEditShot = useCallback((shot: ShotUnit, field: ShotEditableField) => {
    setEditingShotId(shot.id);
    setEditingField(field);
    setEditingValue(field === 'durationSec' ? String(shot.durationSec) : (shot[field] as string) || '');
  }, []);

  const cancelEditShot = useCallback(() => {
    setEditingShotId(null);
    setEditingField(null);
    setEditingValue('');
  }, []);

  const saveShotEdit = useCallback(() => {
    if (!timeline || !editingShotId || !editingField) return;
    const nextShots = timeline.shots.map((shot) => {
      if (shot.id !== editingShotId) return shot;
      if (editingField === 'durationSec') {
        const nextDur = Math.max(0.3, Number(editingValue) || shot.durationSec);
        return { ...shot, durationSec: nextDur };
      }
      return { ...shot, [editingField]: editingValue };
    });
    const nextTimeline: VideoTimelineConfig = { ...timeline, shots: nextShots };
    applyTimelineChanges(nextTimeline);
    cancelEditShot();
  }, [applyTimelineChanges, cancelEditShot, editingField, editingShotId, editingValue, timeline]);

  // Generate prompt with layout description
  const generatePromptWithLayout = useCallback((layoutDesc: string) => {
    const defaultCameraMove: CameraMoveType = (panel.cameraMoves?.[0] as CameraMoveType) || 'static';
    
    // Build config from panel context
    const config = buildPromptConfigFromPanel(panel, project, settings, defaultCameraMove);
    
    // Override model provider based on selected model
    config.modelProvider = detectModelProvider(selectedModel);
    
    // Generate optimized prompt
    let prompt = buildVideoPrompt(config);
    
    // Append layout description for reference image
    if (layoutDesc) {
      prompt = `${prompt}\n\n${layoutDesc}`;
    }
    
    // Generate formatted prompt for display
    const formatted = generateFormattedPrompt(config);
    
    setVideoPrompt(prompt);
    setFormattedPrompt(formatted);
    // NOTE: onUpdatePanel removed from here to prevent race condition
    // Caller should update panel with prompt after calling this function
    
    // Run safety check on generated prompt
    if (prompt.trim()) {
      const result = checkPromptSafety(prompt);
      setSafetyResult(result);
    }
    
    return prompt; // Return prompt so caller can include it in batch update
  }, [panel, project, settings, selectedModel]);

  // Auto-generate prompt from context using new builder
  // Camera movement comes from panel.cameraMoves (set in VideoReferenceModal) or defaults to 'static'
  const generatePromptFromContext = useCallback(() => {
    // If we have layout description, use it
    if (refLayoutDescription) {
      const prompt = generatePromptWithLayout(refLayoutDescription);
      // Now update panel with the generated prompt
      onUpdatePanel(panel.panel_id, { currentVideoPrompt: prompt });
    } else {
      const defaultCameraMove: CameraMoveType = (panel.cameraMoves?.[0] as CameraMoveType) || 'static';
      
      // Build config from panel context
      const config = buildPromptConfigFromPanel(panel, project, settings, defaultCameraMove);
      
      // Override model provider based on selected model
      config.modelProvider = detectModelProvider(selectedModel);
      
      // Generate optimized prompt
      const prompt = buildVideoPrompt(config);
      
      // Generate formatted prompt for display
      const formatted = generateFormattedPrompt(config);
    
    setVideoPrompt(prompt);
      setFormattedPrompt(formatted);
    onUpdatePanel(panel.panel_id, { currentVideoPrompt: prompt });
      
      // Run safety check on generated prompt
      if (prompt.trim()) {
        const result = checkPromptSafety(prompt);
        setSafetyResult(result);
      }
    }
  }, [panel, project, settings, selectedModel, onUpdatePanel, refLayoutDescription, generatePromptWithLayout]);

  // Auto director flow (稳高级)
  const handleAutoGenerateCinematic = useCallback(async () => {
    if (isAutoGenerating) return;
    const triptychCheck = checkTriptychAvailability();
    if (!triptychCheck.ok) {
      const shouldContinue = window.confirm(`${triptychCheck.message}\n\n是否仍要继续生成？`);
      if (!shouldContinue) return;
    }
    setIsAutoGenerating(true);
    try {
      // 1) 确保有参考图（没有则自动构建）
      if (!refImageUrl && !isBuildingRef) {
        await handleBuildReferenceImage();
      }

      // 2) 生成导演镜头计划（算法草案 + 可选 AI 精修）
      const targetDuration = settings.autoVideoPanelDurationSec ?? 10;
      const plan = await generateDirectorShotPlanFromThreeLines(panel, project, settings, {
        durationSec: targetDuration,
        minShots: settings.autoVideoShotCountMin ?? 6,
        maxShots: settings.autoVideoShotCountMax ?? 10,
        mode: settings.autoVideoMode ?? 'stable',
      });
      setAutoPlanDraft(plan);

      // 3) 生成时间轴 & 提示词
      const refDesc = refLayoutDescription || 'Single combined reference frame (no grid, no collage)';
      const draftTimeline = buildCinematicTimelineFromDirectorPlan(panel, project, settings, plan, refDesc);
      setAutoTimelineDraft(draftTimeline);

      // 4) 根据选择的模型检测 provider
      const provider = detectModelProviderFromName(selectedModel);
      
      // 5) 为 Seedance 构建参考图布局说明
      const linkedAssetIds = [...(panel.relatedAssetIds || []), ...(panel.relatedItemIds || [])];
      const hasAssets = linkedAssetIds.length > 0;
      const hasTriptych = !!(panel.triptych_sources && panel.triptych_sources.length > 0);
      const hasPrevContinuity = continuityAnalysis?.shouldUsePrevAnchor ?? false;
      const seedanceRefHint = buildSeedanceRefImageDescription(hasAssets, hasTriptych, hasPrevContinuity);
      
      // 6) 生成各模型格式的提示词
      const seedanceOptions = {
        duration: targetDuration,
        resolution: (settings.volcVideoResolution || '720p') as '480p' | '720p' | '1080p',
        cameraFixed: false,
        refImageLayoutHint: seedanceRefHint || undefined,
      };
      const prompts = exportAllTimelinePrompts(draftTimeline, seedanceOptions);
      setTimelinePrompts(prompts);
      
      // 7) 根据模型 provider 选择合适的提示词
      let activePrompt: string;
      if (provider === 'seedance') {
        activePrompt = prompts.seedance;
      } else if (provider === 'sora') {
        activePrompt = prompts.sora;
      } else if (provider === 'veo') {
        activePrompt = prompts.veo;
      } else {
        activePrompt = prompts.generic;
      }
      setAutoPromptDraft(activePrompt);

      // 默认展开时间轴编辑器便于确认
      setShowTimelineEditor(true);
    } catch (e: any) {
      console.error('Auto director flow failed', e);
      alert(`自动生成镜头计划失败：${e?.message || '未知错误'}`);
    } finally {
      setIsAutoGenerating(false);
    }
  }, [isAutoGenerating, refImageUrl, isBuildingRef, handleBuildReferenceImage, panel, project, settings, refLayoutDescription, selectedModel, continuityAnalysis]);

  const handleConfirmAutoPlan = useCallback(async () => {
    if (!autoPlanDraft || !autoTimelineDraft || !autoPromptDraft) return;
    
    // Save director plan to panel
    const updates: Partial<ScriptPanel> = {
      videoDirectorPlan: autoPlanDraft,
      videoTimeline: autoTimelineDraft,
      currentVideoPrompt: autoPromptDraft,
    };
    onUpdatePanel(panel.panel_id, updates);
    
    // Apply timeline changes
    if (autoTimelineDraft) {
      applyTimelineChanges(autoTimelineDraft);
    }
    setVideoPrompt(autoPromptDraft);
    
    // Mark director plan as confirmed
    setIsDirectorPlanConfirmed(true);
    
    // Clear draft states
    setAutoPlanDraft(null);
    setAutoTimelineDraft(null);
    setAutoPromptDraft(null);

    // Run safety check
    if (autoPromptDraft.trim()) {
      const result = checkPromptSafety(autoPromptDraft);
      setSafetyResult(result);
    }
    
    // Note: No longer auto-generating video here
    // User needs to confirm timeline details first, then click "生成视频"
  }, [autoPlanDraft, autoTimelineDraft, autoPromptDraft, applyTimelineChanges, onUpdatePanel, panel.panel_id]);

  // Toggle all models prompts preview
  const handleToggleAllPrompts = useCallback(() => {
    if (!showAllPrompts) {
      // Generate prompts for all models
      const defaultCameraMove: CameraMoveType = (panel.cameraMoves?.[0] as CameraMoveType) || 'static';
      const config = buildPromptConfigFromPanel(panel, project, settings, defaultCameraMove);
      const allPrompts = buildAllModelPrompts(config);
      setAllModelPrompts(allPrompts);
    }
    setShowAllPrompts(!showAllPrompts);
  }, [showAllPrompts, panel, project, settings]);

  // Copy specific model prompt
  const handleCopyModelPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt);
  }, []);

  // Use prompt from specific model
  const handleUseModelPrompt = useCallback((prompt: string) => {
    setVideoPrompt(prompt);
    onUpdatePanel(panel.panel_id, { currentVideoPrompt: prompt });
    // Run safety check
    const result = checkPromptSafety(prompt);
    setSafetyResult(result);
  }, [panel.panel_id, onUpdatePanel]);

  // Handle prompt change with safety check
  const handlePromptChange = useCallback((value: string) => {
    setVideoPrompt(value);
    onUpdatePanel(panel.panel_id, { currentVideoPrompt: value });
    
    // Run safety check
    if (value.trim()) {
      const result = checkPromptSafety(value);
      setSafetyResult(result);
    } else {
      setSafetyResult(null);
    }
  }, [panel.panel_id, onUpdatePanel]);

  const handleCancelAutoPlan = useCallback(() => {
    setAutoPlanDraft(null);
    setAutoTimelineDraft(null);
    setAutoPromptDraft(null);
  }, []);
  
  // Auto-clean prompt handler
  const handleAutoClean = useCallback(() => {
    if (safetyResult && safetyResult.warnings.length > 0) {
      const cleaned = autoCleanPrompt(videoPrompt, safetyResult.warnings);
      setVideoPrompt(cleaned);
      onUpdatePanel(panel.panel_id, { currentVideoPrompt: cleaned });
      // Re-check after cleaning
      const newResult = checkPromptSafety(cleaned);
      setSafetyResult(newResult);
    }
  }, [safetyResult, videoPrompt, panel.panel_id, onUpdatePanel]);

  // Confirm timeline and auto-clean prompt for safety
  const handleConfirmTimeline = useCallback(() => {
    setIsTimelineConfirmed(true);
    
    // Auto-clean prompt for safety
    if (videoPrompt.trim()) {
      const result = checkPromptSafety(videoPrompt);
      setSafetyResult(result);
      
      // Auto-clean if there are warnings
      if (result.warnings.length > 0) {
        const cleaned = autoCleanPrompt(videoPrompt, result.warnings);
        setVideoPrompt(cleaned);
        onUpdatePanel(panel.panel_id, { currentVideoPrompt: cleaned });
        // Re-check after cleaning
        const newResult = checkPromptSafety(cleaned);
        setSafetyResult(newResult);
      }
    }
  }, [videoPrompt, panel.panel_id, onUpdatePanel]);

  // Update generation status in panel
  const updateGenerationStatus = useCallback((
    generationId: string,
    status: 'pending' | 'processing' | 'success' | 'error',
    videoUrl?: string,
    error?: string,
    progress?: string
  ) => {
    const existingGenerations = generationsRef.current || [];
    const updatedGenerations = existingGenerations.map(gen => {
      if (gen.id === generationId) {
        return {
          ...gen,
          status,
          videoUrl: videoUrl || gen.videoUrl,
          error: error || gen.error,
          progress: progress || gen.progress,
        };
      }
      return gen;
    });
    generationsRef.current = updatedGenerations;
    onUpdatePanel(panel.panel_id, { videoGenerations: updatedGenerations });
  }, [panel.panel_id, onUpdatePanel]);

  // Poll task status until complete
  const startPolling = useCallback((taskId: string, generationId: string, uiTaskId: string) => {
    const maxAttempts = 120; // 10 minutes max (5s interval)
    let attempts = 0;
    
    const poll = async () => {
      try {
        debugLog(`[VideoGen] Polling task ${taskId}, attempt ${attempts + 1}`);
        
        // Query using appropriate API based on selected model
        const result = isVolcArkVideoModel(selectedModel)
          ? await queryVolcVideoTask(taskId, settings)
          : isSora2Model(selectedModel)
          ? await querySora2Task(taskId, settings)
          : await queryVideoTask(taskId, settings);
        debugLog('[VideoGen] Poll result:', result.status, result.progress, result.data?.output);
        
        // Update progress only if it actually changed (prevents unnecessary re-renders)
        if (result.progress && result.progress !== lastProgressRef.current[generationId]) {
          lastProgressRef.current[generationId] = result.progress;
          updateGenerationStatus(generationId, 'processing', undefined, undefined, result.progress);
        }
        
        if (result.status === 'SUCCESS' && result.data?.output) {
          // Success! Update with video URL
          const videoUrl = result.data.output;
          debugLog('[VideoGen] SUCCESS! Updating UI with video URL:', videoUrl);
          
          // Try to save locally
          let localPath: string | undefined;
          try {
            const videoRes = await fetch(videoUrl);
            const videoBlob = await videoRes.blob();
            const videoFilename = `video_${panel.panel_id}_${Date.now()}.mp4`;
            localPath = await saveImageToAssets(videoBlob, videoFilename);
            debugLog('[VideoGen] Video saved locally:', localPath);
          } catch (e) {
            console.warn('[VideoGen] Failed to save video locally, using remote URL');
          }
          
          // Play success sound
          playSuccessSound('video', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
          
          // Update generation with final URL - USE REF to get latest value!
          const existingGenerations = generationsRef.current || [];
          debugLog('[VideoGen] Current generations count:', existingGenerations.length);
          
          const updatedGenerations = existingGenerations.map(gen => {
            if (gen.id === generationId) {
              const updated = {
                ...gen,
                status: 'success' as const,
                videoUrl,
                videoPath: localPath,
                progress: '100%',
              };
              return updated;
            }
            return gen;
          });

          generationsRef.current = updatedGenerations;
          onUpdatePanel(panel.panel_id, { videoGenerations: updatedGenerations });
          
          onTaskFinish(uiTaskId, 'success');
          
          // Clear polling and progress cache
          if (pollingRef.current[generationId]) {
            clearTimeout(pollingRef.current[generationId]);
            delete pollingRef.current[generationId];
          }
          delete lastProgressRef.current[generationId];
          return;
        }
        
        if (result.status === 'FAILURE') {
          playSound('error', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
          updateGenerationStatus(generationId, 'error', undefined, result.fail_reason || '生成失败');
          onTaskFinish(uiTaskId, 'error');
          
          // Clear polling and progress cache
          if (pollingRef.current[generationId]) {
            clearTimeout(pollingRef.current[generationId]);
            delete pollingRef.current[generationId];
          }
          delete lastProgressRef.current[generationId];
          return;
        }
        
        // Continue polling for NOT_START or IN_PROGRESS
        if (attempts++ < maxAttempts) {
          pollingRef.current[generationId] = setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          updateGenerationStatus(generationId, 'error', undefined, '轮询超时');
          onTaskFinish(uiTaskId, 'error');
        }
      } catch (e) {
        console.error('Poll failed:', e);
        // Continue trying on network errors
        if (attempts++ < maxAttempts) {
          pollingRef.current[generationId] = setTimeout(poll, 5000);
        }
      }
    };
    
    // Start polling
    poll();
  }, [debugLog, settings, panel.panel_id, onUpdatePanel, onTaskFinish, updateGenerationStatus, selectedModel]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(timeout => clearTimeout(timeout as ReturnType<typeof setTimeout>));
    };
  }, []);

  // Resume polling for processing tasks on mount
  useEffect(() => {
    const processingTasks = (panel.videoGenerations || []).filter(
      gen => gen.status === 'processing' && gen.taskId
    );
    
    processingTasks.forEach(gen => {
      if (gen.taskId && !pollingRef.current[gen.id]) {
        const uiTaskId = onTaskStart(`视频生成 - 继续轮询`, 'video', gen.model);
        startPolling(gen.taskId, gen.id, uiTaskId);
      }
    });
  }, []); // Only on mount

  // Internal function to actually generate prompts (used by modal callbacks)
  const doGenerateSegmentPrompts = useCallback((preserveVideos: boolean) => {
    // Analyze continuity
    const analysis = continuityAnalysis || shouldUseCrossPanelContinuity(panel, project);
    
    // Get previous panel's shot3 visual if continuity enabled
    let prevPanelLastShotVisual: string | undefined;
    let prevPanelLastShotDuration: number | undefined;
    
    if (analysis.shouldUsePrevAnchor && analysis.prevPanelAnchorPath) {
      // Find previous panel
      const currentVolume = project.volumes.find(v => v.id === project.activeVolumeId);
      if (currentVolume) {
        // Look through scripts to find current panel and previous one
        for (const [epNum, script] of Object.entries(currentVolume.scriptCache || {}) as [string, WebtoonScript][]) {
          const panels = script.panels || [];
          const currentIdx = panels.findIndex(p => p.panel_id === panel.panel_id);
          if (currentIdx > 0) {
            const prevPanel = panels[currentIdx - 1];
            prevPanelLastShotVisual = extractShotVisual(prevPanel, 3);
            prevPanelLastShotDuration = prevPanel.shotDurations?.[2] ?? 2;
            break;
          }
        }
      }
    }
    
    const result = buildAllSegmentPrompts({
      panel,
      project,
      settings,
      prevPanelLastShotVisual,
      prevPanelLastShotDuration,
      shouldGenerateSegment0: analysis.shouldUsePrevAnchor,
    });
    
    setSegmentPrompts(result.segments);
    setSegmentPromptsPanelId(panel.panel_id);
    // Persist prompts to panel so switching tabs/pages keeps them
    onUpdatePanel(panel.panel_id, { segmentPrompts: result.segments });
    
    // Update prompt text from generated prompts
    const nextPromptText: Record<VideoSegmentKey, string> = {
      'p3-1': result.segments.find(s => s.segmentKey === 'p3-1')?.prompt || '',
      '1-2': result.segments.find(s => s.segmentKey === '1-2')?.prompt || '',
      '2-3': result.segments.find(s => s.segmentKey === '2-3')?.prompt || '',
    };
    setSegmentPromptText(nextPromptText);
    
    // Only reset status/videos if not preserving
    if (!preserveVideos) {
      setSegmentStatus({
        'p3-1': 'idle',
        '1-2': 'idle',
        '2-3': 'idle',
      });
      setSegmentVideos({
        'p3-1': '',
        '1-2': '',
        '2-3': '',
      });
      setConcatStatus('idle');
      setConcatResult('');
    }
    
    return result;
  }, [panel, project, settings, continuityAnalysis]);

  // Generate segment prompts for 3-segment mode (with confirmation modal ONLY if videos exist)
  const handleGenerateSegmentPrompts = useCallback(() => {
    // Only check if there are any generated VIDEOS (not just prompts)
    const hasGeneratedVideos = Object.values(segmentStatus).some(s => s === 'success');
    const hasConcatResult = concatStatus === 'success' && concatResult;
    
    // Only show confirmation modal if there are videos that would be lost
    if (hasGeneratedVideos || hasConcatResult) {
      setShowRegenPromptModal(true);
    } else {
      // No videos (only prompts or nothing), proceed directly without confirmation
      doGenerateSegmentPrompts(false);
    }
  }, [segmentStatus, concatStatus, concatResult, doGenerateSegmentPrompts]);

  // Generate a single segment video
  const handleGenerateSegment = useCallback(async (segmentKey: VideoSegmentKey) => {
    const segment = segmentPrompts?.find(s => s.segmentKey === segmentKey);
    if (!segment) {
      console.warn('Segment not found (prompts not generated yet):', segmentKey);
      alert('请先点击「生成提示词」再生成该片段');
      return;
    }
    
    // Get shot images for first/last frame
    const shotPaths = panel.triptych_sources || [];
    let startFrameUrl = '';
    let endFrameUrl = '';
    
    // Debug: Log shot paths
    const hasTosInShotPaths = shotPaths.some(p => p && p.includes('tos-cn-beijing'));
    console.log('[Segment] Entry:', { segmentKey, shotPaths: shotPaths.map(p => p?.substring(0, 50)), hasTosInShotPaths });
    
    if (segmentKey === 'p3-1') {
      // Cross-panel: need prev panel's shot3 as start, current shot1 as end
      if (continuityAnalysis?.prevPanelAnchorPath) {
        try {
          startFrameUrl = await loadAssetImage(continuityAnalysis.prevPanelAnchorPath);
        } catch (e) {
          console.warn('Failed to load prev panel anchor');
        }
      }
      if (shotPaths[0]) {
        try {
          endFrameUrl = await loadAssetImage(shotPaths[0]);
        } catch (e) {
          console.warn('Failed to load shot 1');
        }
      }
    } else if (segmentKey === '1-2') {
      if (shotPaths[0]) startFrameUrl = await loadAssetImage(shotPaths[0]).catch(() => '');
      if (shotPaths[1]) endFrameUrl = await loadAssetImage(shotPaths[1]).catch(() => '');
    } else if (segmentKey === '2-3') {
      if (shotPaths[1]) startFrameUrl = await loadAssetImage(shotPaths[1]).catch(() => '');
      if (shotPaths[2]) endFrameUrl = await loadAssetImage(shotPaths[2]).catch(() => '');
    }
    
    // Debug: Log loaded URLs
    console.log('[Segment] After loadAssetImage:', { 
      segmentKey, 
      startFrameUrl: startFrameUrl?.substring(0, 80), 
      endFrameUrl: endFrameUrl?.substring(0, 80),
      startIsLocal: startFrameUrl?.startsWith('blob:'),
      endIsLocal: endFrameUrl?.startsWith('blob:')
    });
    
    if (!startFrameUrl || !endFrameUrl) {
      alert(`缺少首尾帧图片: ${segmentKey}`);
      return;
    }
    
    // CRITICAL: Check for TOS URLs that will cause CORS issues
    const startIsTos = startFrameUrl?.includes('tos-cn-beijing') || startFrameUrl?.includes('volces.com');
    const endIsTos = endFrameUrl?.includes('tos-cn-beijing') || endFrameUrl?.includes('volces.com');
    if (startIsTos || endIsTos) {
      alert(`❌ 检测到 CORS 受限的图片 URL (火山 TOS)\n\n问题图片: ${startIsTos ? 'Shot起始帧' : ''}${startIsTos && endIsTos ? ' 和 ' : ''}${endIsTos ? 'Shot结束帧' : ''}\n\n解决方案:\n1. 重新生成该分镜的三联画 (Shot 1/2/3)\n2. 确保设置中图片模型使用正确的格式`);
      return;
    }
    
    // Update status
    setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'generating' }));
    
    const taskId = onTaskStart(`片段 ${segmentKey} - 分镜 #${panel.panel_id}`, 'video', selectedModel);
    
    try {
      // Debug: Log before fetch
      console.log('[Segment] Before fetch for base64 conversion:', { segmentKey, selectedModel });
      
      // Convert URLs to base64
      const [startBlob, endBlob] = await Promise.all([
        fetch(startFrameUrl).then(r => r.blob()),
        fetch(endFrameUrl).then(r => r.blob()),
      ]);
      const [startBase64, endBase64] = await Promise.all([
        imageToBase64(startBlob),
        imageToBase64(endBlob),
      ]);
      
      const images = [
        `data:image/png;base64,${startBase64}`,
        `data:image/png;base64,${endBase64}`,
      ];
      const imageRoles: ('first_frame' | 'last_frame')[] = ['first_frame', 'last_frame'];
      
      // Use VolcEngine Ark API for first/last frame mode
      if (!isVolcArkVideoModel(selectedModel)) {
        console.error('[Segment] Model not compatible:', selectedModel);
        alert('三段首尾帧模式仅支持火山模型（Seedance 系列）');
        setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'error' }));
        onTaskFinish(taskId, 'error');
        return;
      }
      
      // Use edited prompt from textarea if available, otherwise fallback to segment.prompt
      const promptToUse = segmentPromptText[segmentKey]?.trim() || segment.prompt;
      
      const result = await createVolcVideoTask(
        {
          model: selectedModel,
          prompt: promptToUse,
          images,
          imageRoles,
          aspectRatio: settings.veoAspectRatio || '16:9',
          duration: Math.round(segment.durationSec),
          resolution: settings.volcVideoResolution || '720p',
          returnLastFrame: false,
          generateAudio: settings.volcVideoGenerateAudio !== false,
        },
        settings
      );
      
      console.log('[Segment] API result:', { segmentKey, hasError: !!result.error, taskId: result.taskId });
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (result.taskId) {
        // Start polling for this segment
        const pollSegment = async (attempts = 0) => {
          if (attempts > 120) {
            setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'error' }));
            onTaskFinish(taskId, 'error');
            return;
          }
          
          try {
            const queryResult = await queryVolcVideoTask(result.taskId!, settings);
            
            if (queryResult.status === 'SUCCESS' && queryResult.data?.output) {
              setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'success' }));
              setSegmentVideos(prev => ({ ...prev, [segmentKey]: queryResult.data!.output! }));

              // Persist segment generation into panel.videoGenerations so it survives page switches
              const now = Date.now();
              const segGen: VideoGeneration = {
                id: `vgen_seg_${panel.panel_id}_${segmentKey}_${now}`,
                createdAt: now,
                model: selectedModel,
                prompt: promptToUse, // Use the actual prompt used for generation
                videoUrl: queryResult.data!.output!,
                taskId: result.taskId,
                status: 'success',
                kind: 'segment',
                segmentKey,
                durationSec: segment.durationSec,
                startFramePath: segment.startFramePath,
                endFramePath: segment.endFramePath,
              };

              const existing = generationsRef.current || [];
              const filtered = existing.filter(g => !(g.kind === 'segment' && g.segmentKey === segmentKey));
              const newGenerations = [segGen, ...filtered].slice(0, 30);
              generationsRef.current = newGenerations;
              onUpdatePanel(panel.panel_id, { videoGenerations: newGenerations });

              playSuccessSound('video', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
              onTaskFinish(taskId, 'success');
            } else if (queryResult.status === 'FAILURE') {
              setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'error' }));
              onTaskFinish(taskId, 'error');
            } else {
              // Continue polling
              setTimeout(() => pollSegment(attempts + 1), 5000);
            }
          } catch (e) {
            if (attempts < 120) {
              setTimeout(() => pollSegment(attempts + 1), 5000);
            }
          }
        };
        
        pollSegment();
      } else if (result.videoUrl) {
        setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'success' }));
        setSegmentVideos(prev => ({ ...prev, [segmentKey]: result.videoUrl! }));

        // Persist segment generation into panel.videoGenerations
        const now = Date.now();
        const segGen: VideoGeneration = {
          id: `vgen_seg_${panel.panel_id}_${segmentKey}_${now}`,
          createdAt: now,
          model: selectedModel,
          prompt: promptToUse, // Use the actual prompt used for generation
          videoUrl: result.videoUrl!,
          status: 'success',
          kind: 'segment',
          segmentKey,
          durationSec: segment.durationSec,
          startFramePath: segment.startFramePath,
          endFramePath: segment.endFramePath,
        };

        const existing = generationsRef.current || [];
        const filtered = existing.filter(g => !(g.kind === 'segment' && g.segmentKey === segmentKey));
        const newGenerations = [segGen, ...filtered].slice(0, 30);
        generationsRef.current = newGenerations;
        onUpdatePanel(panel.panel_id, { videoGenerations: newGenerations });

        playSuccessSound('video', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
        onTaskFinish(taskId, 'success');
      }
      
    } catch (error) {
      console.error('[Segment] Generation failed:', segmentKey, error);
      setSegmentStatus(prev => ({ ...prev, [segmentKey]: 'error' }));
      onTaskFinish(taskId, 'error');
    }
  }, [segmentPrompts, panel, settings, selectedModel, continuityAnalysis, onTaskStart, onTaskFinish]);

  // Generate all segments sequentially
  const handleGenerateAllSegments = useCallback(async () => {
    if (!segmentPrompts || segmentPrompts.length === 0) {
      handleGenerateSegmentPrompts();
      return;
    }
    
    for (const segment of segmentPrompts) {
      await handleGenerateSegment(segment.segmentKey);
    }
  }, [segmentPrompts, handleGenerateSegment, handleGenerateSegmentPrompts]);

  // Concatenate all successful segments
  const handleConcatenateSegments = useCallback(async () => {
    // Collect all successful segment video URLs
    const videoUrls: string[] = [];
    const orderedKeys: VideoSegmentKey[] = ['p3-1', '1-2', '2-3'];
    
    for (const key of orderedKeys) {
      if (segmentVideos[key] && segmentStatus[key] === 'success') {
        videoUrls.push(segmentVideos[key]);
      }
    }
    
    if (videoUrls.length < 2) {
      alert('需要至少 2 个成功生成的片段才能拼接');
      return;
    }
    
    // Check concat service health
    const health = await checkConcatHealth(settings);
    if (health.status !== 'ok') {
      alert(`拼接服务不可用: ${health.error || '未知错误'}\n\n请先启动 Python 后端：\ncd python_backend && python main.py`);
      return;
    }
    
    setConcatStatus('processing');
    setConcatError('');
    
    try {
      // Concatenate by URLs on backend (avoid browser CORS)
      const result = await concatenateVideoUrls({
        panelId: panel.panel_id,
        videoUrls,
        transition: 'none',
        outputFormat: 'mp4',
        resolution: '720p',
      }, settings);
      
      if (!result.success || !result.video) {
        throw new Error(result.error || '拼接失败');
      }
      
      // Create blob URL for preview
      const blobUrl = URL.createObjectURL(result.video);
      setConcatResult(blobUrl);
      setConcatStatus('success');
      
      // Save to local filesystem
      const filename = `video_concat_${panel.panel_id}_${Date.now()}.mp4`;
      const localPath = await saveImageToAssets(result.video, filename);
      
      // Create a new VideoGeneration record for the concatenated video
      const concatGeneration: VideoGeneration = {
        id: `vgen_concat_${Date.now()}`,
        createdAt: Date.now(),
        model: selectedModel,
        prompt: `三段首尾帧拼接视频 (${videoUrls.length} 片段)`,
        videoPath: localPath,
        // IMPORTANT: blob: URL won't survive refresh; persist localPath and restore via loadAssetImage(videoPath)
        videoUrl: undefined,
        status: 'success',
        kind: 'concat',
      };
      
      const existingGenerations = generationsRef.current || [];
      const newGenerations = [concatGeneration, ...existingGenerations].slice(0, 20);
      generationsRef.current = newGenerations;
      onUpdatePanel(panel.panel_id, { videoGenerations: newGenerations });

      playSuccessSound('video', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
      
    } catch (error) {
      console.error('Concatenation failed:', error);
      setConcatStatus('error');
      setConcatError(error instanceof Error ? error.message : '拼接失败');
    }
  }, [segmentVideos, segmentStatus, panel.panel_id, settings, selectedModel, onUpdatePanel]);

  // Generate video
  const handleGenerate = async () => {
    if (!timeline) {
      alert('请先生成时间轴后再生成视频');
      return;
    }
    if (!isTimelineConfirmed) {
      alert('请先确认时间轴细节，再生成视频');
      return;
    }
    const triptychCheck = checkTriptychAvailability();
    if (!triptychCheck.ok) {
      const shouldContinue = window.confirm(`${triptychCheck.message}\n\n是否仍要继续生成？`);
      if (!shouldContinue) return;
    }
    if (!videoPrompt.trim()) {
      alert('请先输入或生成视频提示词');
      return;
    }
    
    if (!settings.veoApiKey && !settings.apiKey) {
      alert('请在设置中配置视频生成 API Key');
      return;
    }

    setIsGenerating(true);
    const taskId = onTaskStart(`视频生成 - 分镜 #${panel.panel_id}`, 'video', selectedModel);
    
    try {
      // Prepare reference images
      const images: string[] = [];
      
      // Add video reference frame if exists
      if (refImageUrl) {
        const refResponse = await fetch(refImageUrl);
        const refBlob = await refResponse.blob();
        const base64 = await imageToBase64(refBlob);
        images.push(`data:image/png;base64,${base64}`);
      } else if (shotUrls[0]) {
        // Use first shot as fallback
        const response = await fetch(shotUrls[0]);
        const blob = await response.blob();
        const base64 = await imageToBase64(blob);
        images.push(`data:image/png;base64,${base64}`);
      }
      
      if (images.length === 0) {
        throw new Error('需要至少一张参考图');
      }
      
      // Call appropriate API based on model provider
      let result;
      if (isVolcArkVideoModel(selectedModel)) {
        // Use VolcEngine Ark API
        // 优先使用自动导演时长，否则使用火山视频时长设置
        const volcDuration = settings.autoVideoPanelDurationSec ?? settings.volcVideoDuration ?? 10;
        
        // 火山 Seedance 模型只支持 first_frame/last_frame (i2v)，不支持 reference_image (r2v)
        // 即使是综合参考图，也使用 first_frame，通过提示词说明参考图布局即可
        const imageRole = 'first_frame';
        
        result = await createVolcVideoTask(
          {
            model: selectedModel,
            prompt: videoPrompt,
            images: images.length > 0 ? images : undefined,
            imageRoles: images.length > 0 ? [imageRole] as const : undefined,
            aspectRatio: settings.veoAspectRatio || '16:9',
            duration: volcDuration,
            resolution: settings.volcVideoResolution || '720p',
            returnLastFrame: false,
            generateAudio: settings.volcVideoGenerateAudio !== false, // Default: true
          },
          settings
        );
      } else if (isSora2Model(selectedModel)) {
        // Use Sora2 API
        result = await generateSora2Video(
          videoPrompt,
          images, // Sora2 expects image URLs/base64 directly
          settings,
          selectedModel,
          settings.veoAspectRatio || '16:9',
        );
      } else {
        // Use Veo API (default)
        result = await generateVideo(
          {
            prompt: videoPrompt,
            model: selectedModel,
            images,
            aspectRatio: settings.veoAspectRatio || '16:9',
            enhancePrompt: settings.veoEnhancePrompt,
          },
          settings
        );
      }
      
      debugLog('[VideoGen] API result:', { videoUrl: result.videoUrl, taskId: result.taskId, error: result.error });
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Create generation record
      const generationId = `vgen_${Date.now()}`;
      const generation: VideoGeneration = {
        id: generationId,
        createdAt: Date.now(),
        model: selectedModel,
        prompt: videoPrompt,
        refImagePath: panel.videoRefPath,
        videoUrl: result.videoUrl,
        taskId: result.taskId,
        status: result.videoUrl ? 'success' : 'processing',
        progress: result.taskId ? '0%' : undefined,
      };
      
      // If we got a video URL directly, try to save it locally
      if (result.videoUrl) {
        try {
          const videoRes = await fetch(result.videoUrl);
          const videoBlob = await videoRes.blob();
          const videoFilename = `video_${panel.panel_id}_${Date.now()}.mp4`;
          const localPath = await saveImageToAssets(videoBlob, videoFilename);
          generation.videoPath = localPath;
          generation.progress = '100%';
        } catch (e) {
          console.warn('Failed to save video locally, using remote URL');
        }
      }
      
      // Update panel with new generation
      // IMPORTANT: Never read from panel.videoGenerations here (props snapshot).
      // Use generationsRef.current to avoid overwriting history due to async prop updates.
      const existingGenerations = generationsRef.current || [];
      const newGenerations = [generation, ...existingGenerations].slice(0, 20); // Keep max 20
      
      // IMPORTANT: Update ref immediately so polling can access the new generation
      generationsRef.current = newGenerations;
      debugLog('[VideoGen] Created new generation, ref updated. Count:', newGenerations.length);
      
      onUpdatePanel(panel.panel_id, {
        videoGenerations: newGenerations,
      });
      
      // If we got a taskId, start polling for status
      if (result.taskId && !result.videoUrl) {
        debugLog('[VideoGen] Starting polling for task:', result.taskId);
        startPolling(result.taskId, generationId, taskId);
        // Don't finish the UI task yet - polling will finish it
      } else if (result.videoUrl) {
        debugLog('[VideoGen] Got video URL directly, finishing task');
      onTaskFinish(taskId, 'success');
      } else {
        console.warn('[VideoGen] No taskId or videoUrl in result');
        onTaskFinish(taskId, 'success');
      }
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Video generation failed:', message);
      
      // Record failed generation
      const failedGeneration: VideoGeneration = {
        id: `vgen_${Date.now()}`,
        createdAt: Date.now(),
        model: selectedModel,
        prompt: videoPrompt,
        refImagePath: panel.videoRefPath,
        status: 'error',
        error: message,
      };
      
      const existingGenerations = panel.videoGenerations || [];
      const next = [failedGeneration, ...existingGenerations].slice(0, 20);
      generationsRef.current = next;
      onUpdatePanel(panel.panel_id, {
        videoGenerations: next,
      });
      
      onTaskFinish(taskId, 'error');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Update ref so handleConfirmAutoPlan can call it
  handleGenerateRef.current = handleGenerate;

  // Use history generation
  const useHistoryGeneration = (gen: VideoGeneration) => {
    setVideoPrompt(gen.prompt);
    onUpdatePanel(panel.panel_id, { currentVideoPrompt: gen.prompt });
  };

  const generations = panel.videoGenerations || [];
  const modelInfo = VEO_MODELS.find(m => m.id === selectedModel);
  
  // Get latest successful video for preview
  const latestSuccessVideo = useMemo(() => {
    const latest = generations.find(gen => gen.status === 'success' && (gen.videoUrl || gen.videoPath));
    return latest;
  }, [generations]);

  const latestSuccessVideoSrc = useMemo(() => {
    if (!latestSuccessVideo) return '';
    const localKey = `${latestSuccessVideo.id}_video`;
    return historyUrls[localKey] || latestSuccessVideo.videoUrl || '';
  }, [latestSuccessVideo, historyUrls]);

  // Mode-specific generation filters
  const singleModeGenerations = useMemo(() => 
    generations.filter(g => g.kind !== 'segment' && g.kind !== 'concat'),
    [generations]
  );
  const segmentModeGenerations = useMemo(() => 
    generations.filter(g => g.kind === 'segment' || g.kind === 'concat'),
    [generations]
  );
  const [expandSingleHistory, setExpandSingleHistory] = useState(false);
  const [expandSegmentHistory, setExpandSegmentHistory] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="shrink-0 pb-3 mb-3 border-b border-white/5">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
        🎬 视频生成
        <span className="text-[10px] font-normal text-gray-600">Veo API</span>
      </h4>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">

      {/* Video Sub Tabs (within Video panel) */}
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase">视频分页</label>
        <div className="flex gap-2">
          <button
            onClick={() => setVideoTab('segment')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              videoTab === 'segment'
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                : 'bg-gray-800 text-gray-500 border border-white/10 hover:bg-gray-700'
            }`}
          >
            🔗 三段首尾帧（默认）
          </button>
          <button
            onClick={() => setVideoTab('single')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              videoTab === 'single'
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                : 'bg-gray-800 text-gray-500 border border-white/10 hover:bg-gray-700'
            }`}
          >
            🎬 单段视频
          </button>
        </div>
        <p className="text-[9px] text-gray-600">
          {videoTab === 'segment'
            ? '主流程：首尾帧生成三段 + 本地后端拼接（更稳的一致性）'
            : '原有流程：参考图 + 提示词生成单段视频（支持多模型）'}
        </p>
      </div>

      {videoTab === 'single' && (
      <>
      {/* Reference Image */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-500 uppercase">参考图</label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoGenerateCinematic}
              disabled={isAutoGenerating || isGenerating}
              className={`text-[9px] px-2 py-1 rounded transition-all ${
                isAutoGenerating
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
              }`}
            >
              {isAutoGenerating ? '自动生成中...' : '自动生成（稳高级）'}
            </button>
            {/* Layout Mode Selector */}
            <select
              value={refLayoutMode}
              onChange={(e) => setRefLayoutMode(e.target.value as VideoReferenceLayoutMode)}
              className="bg-[#1A1A1A] text-[9px] text-gray-400 border border-white/10 rounded px-1.5 py-1 focus:border-purple-500/50 outline-none"
            >
              <option value="microMontage">🎬 微蒙太奇</option>
              <option value="lineArtAndAssets">🎨 线稿+资产</option>
            </select>
            <button
              onClick={handleBuildReferenceImage}
              disabled={isBuildingRef}
              className={`text-[9px] px-2 py-1 rounded transition-all ${
                isBuildingRef
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
              }`}
            >
              {isBuildingRef ? '生成中...' : '构建参考图'}
            </button>
          </div>
        </div>
        
        {/* Micro-Montage Continuity Status */}
        {refLayoutMode === 'microMontage' && continuityAnalysis && (
          <div className={`text-[9px] p-2 rounded border ${
            continuityAnalysis.shouldUsePrevAnchor
              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
              : 'bg-gray-500/10 border-gray-500/20 text-gray-500'
          }`}>
            <div className="flex items-center justify-between">
              <span>
                🔗 跨分镜连续性: {continuityAnalysis.shouldUsePrevAnchor ? '✓ 启用' : '✗ 禁用'}
              </span>
              <span className="opacity-70">({Math.round(continuityAnalysis.confidence * 100)}%)</span>
            </div>
            <div className="mt-1 text-[8px] opacity-70 truncate">{continuityAnalysis.reason}</div>
          </div>
        )}
        <div 
          className={`aspect-video bg-[#0A0A0A] rounded-xl border border-white/10 overflow-hidden relative group ${
            refImageUrl ? 'cursor-pointer' : 'cursor-default'
          }`}
          onClick={() => {
            if (refImageUrl) {
              onPreview(refImageUrl);
            }
          }}
        >
          {isLoadingRef || isBuildingRef ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="w-6 h-6 border-2 border-purple-400/50 border-t-purple-400 rounded-full animate-spin" />
              <span className="text-[10px] text-gray-500">{isBuildingRef ? '构建合并参考图...' : '加载中...'}</span>
            </div>
          ) : refImageUrl ? (
            <>
              <img
                src={refImageUrl}
                className="w-full h-full object-contain bg-[#0A0A0A]"
                alt="Video Reference"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors pointer-events-none">
                <span className="text-white/0 group-hover:text-white text-sm">🔍 点击放大</span>
              </div>
              {refLayoutDescription && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <span className="text-[8px] text-gray-300">
                    📋 布局: {refLayoutMode === 'microMontage' ? '微蒙太奇 (三连拍+资产)' : '线稿+资产合并'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2 p-4">
              <span className="text-2xl">🖼️</span>
              <span className="text-[10px] text-center">点击上方"合并线稿+资产"生成参考图</span>
              <span className="text-[9px] text-gray-700">或在"生成"标签中创建视频参考帧</span>
            </div>
          )}
        </div>
        
        {/* Layout description preview */}
        {refLayoutDescription && (
          <details className="text-[9px]">
            <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
              📝 参考图布局说明 (已包含在提示词中)
            </summary>
            <pre className="mt-2 p-2 bg-black/50 rounded-lg text-gray-500 whitespace-pre-wrap overflow-auto max-h-32">
              {refLayoutDescription}
            </pre>
          </details>
        )}
      </div>

      {/* Latest Generated Video Preview */}
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase flex items-center gap-2">
          🎬 视频预览
          {latestSuccessVideoSrc && <span className="text-green-400">✓</span>}
        </label>
        {latestSuccessVideoSrc ? (
          <>
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-green-500/30">
              <video 
                src={latestSuccessVideoSrc}
                controls
                className="w-full h-full"
                poster={refImageUrl || undefined}
              >
                您的浏览器不支持视频播放
              </video>
            </div>
            <div className="flex items-center justify-between text-[9px] text-gray-500">
              <span>{latestSuccessVideo.model} · {formatRelativeTime(latestSuccessVideo.createdAt)}</span>
              {latestSuccessVideo.videoUrl ? (
                <a 
                  href={latestSuccessVideo.videoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  📥 下载
                </a>
              ) : (
                <span className="text-[9px] text-gray-600">已保存本地</span>
              )}
            </div>
          </>
        ) : (
          <div className="aspect-video bg-[#0A0A0A] rounded-xl border border-white/10 flex flex-col items-center justify-center text-gray-600 gap-2">
            <span className="text-2xl">🎥</span>
            <span className="text-[10px]">生成的视频将在这里显示</span>
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-gray-500 uppercase">模型</label>
          <span className="text-[9px] text-gray-600">⚙️ 可在设置中配置默认值</span>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as VeoModel)}
          className="w-full bg-[#1A1A1A] text-white text-xs px-3 py-2 rounded-lg border border-white/10 focus:border-blue-500/50 outline-none"
        >
          <optgroup label="Veo (Google)">
          {VEO_MODELS.map(model => (
            <option key={model.id} value={model.id}>
              {model.name} - {model.desc}
            </option>
          ))}
          </optgroup>
          <optgroup label="Sora (OpenAI)">
            <option value="sora2">Sora 2 - 高质量视频生成</option>
            <option value="sora2-turbo">Sora 2 Turbo - 快速生成</option>
          </optgroup>
          <optgroup label="可灵 (快手)">
            <option value="kling-v1">可灵 v1 - 标准版</option>
            <option value="kling-v1.5">可灵 v1.5 - 增强版</option>
          </optgroup>
          <optgroup label="火山引擎 Seedance (字节)">
            <option value="doubao-seedance-1-5-pro-251215">Seedance 1.5 Pro - 最新款，支持有声视频，4-12秒</option>
            <option value="doubao-seedance-1-0-pro-250528">Seedance 1.0 Pro - 高质量，2-12秒</option>
            <option value="doubao-seedance-1-0-pro-fast-251015">Seedance 1.0 Pro Fast - 快速模式</option>
            <option value="doubao-seedance-1-0-lite-t2v-250428">Seedance 1.0 Lite T2V - 文生视频专用</option>
            <option value="doubao-seedance-1-0-lite-i2v-250428">Seedance 1.0 Lite I2V - 图生视频专用</option>
          </optgroup>
        </select>
        <div className="flex items-center gap-2 text-[9px] text-gray-600">
          <span className={`px-1.5 py-0.5 rounded ${
            modelProvider === 'veo' ? 'bg-blue-500/20 text-blue-400' :
            modelProvider === 'sora' ? 'bg-green-500/20 text-green-400' :
            modelProvider === 'kling' ? 'bg-orange-500/20 text-orange-400' :
            modelProvider === 'volcengine' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {modelProvider.toUpperCase()}
          </span>
          <span>提示词格式已优化</span>
        </div>
      </div>

      {/* Auto Director Plan Preview */}
      {autoPlanDraft && autoPromptDraft && (
        <div className="space-y-2 p-3 bg-[#0D0D0D] rounded-xl border border-blue-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-blue-300 font-bold">导演镜头计划（待确认）</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmAutoPlan}
                className="text-[9px] px-2 py-1 bg-blue-500/30 text-blue-100 rounded hover:bg-blue-500/50"
              >
                ✅ 确认并生成时间轴
              </button>
              <button
                onClick={handleCancelAutoPlan}
                className="text-[9px] px-2 py-1 bg-gray-700/50 text-gray-400 rounded hover:text-white"
              >
                取消
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
            {autoPlanDraft.shots.map((s) => (
              <div key={s.index} className="p-2 bg-[#0A0A0A] rounded border border-white/5">
                <div className="flex items-center justify-between text-[9px] mb-1">
                  <span className="text-blue-300 font-bold">#{s.index} {s.beat}</span>
                  <span className="text-gray-500">{s.durationSec.toFixed(2)}s</span>
                </div>
                <div className="text-[9px] text-gray-400">景别: {s.shotType}</div>
                <div className="text-[9px] text-gray-400">运镜: {s.camera}</div>
                <div className="text-[9px] text-gray-300 mt-1 line-clamp-2">{s.action}</div>
              </div>
            ))}
          </div>
          <details className="text-[9px]">
            <summary className="text-gray-500 cursor-pointer hover:text-gray-300">提示词预览</summary>
            <pre className="mt-2 p-2 bg-black/50 rounded text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
              {autoPromptDraft}
            </pre>
          </details>
        </div>
      )}

      {/* Timeline Editor (Single Video Mode Only - Based on Director Plan) */}
      <div className="space-y-2 mt-4 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-purple-400 uppercase flex items-center gap-2 font-bold">
            ⏱️ 时间轴编辑器
            <span className="text-[8px] text-purple-300/70 px-1.5 py-0.5 bg-purple-400/10 rounded font-normal">基于导演计划</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !timeline || !isTimelineConfirmed}
              className={`text-[9px] px-2 py-1 rounded ${
                isGenerating || !timeline || !isTimelineConfirmed
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:brightness-110'
              }`}
            >
              🎬 生成视频
            </button>
            <button
              onClick={handleConfirmTimeline}
              disabled={!timeline}
              className={`text-[9px] px-2 py-1 rounded border ${
                isTimelineConfirmed
                  ? 'border-green-500/40 text-green-300 bg-green-500/10'
                  : 'border-white/10 text-gray-300 hover:border-green-400/50 hover:text-green-200'
              }`}
            >
              {isTimelineConfirmed ? '✅ 已确认时间轴' : '确认时间轴'}
            </button>
            <button
              onClick={generateTimeline}
              disabled={!isDirectorPlanConfirmed}
              className={`text-[9px] px-2 py-1 rounded transition-colors ${
                !isDirectorPlanConfirmed
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
              }`}
              title={!isDirectorPlanConfirmed ? '请先确认导演镜头计划' : '生成时间轴'}
            >
              🔄 生成时间轴
            </button>
            <button
              onClick={() => setShowTimelineEditor(!showTimelineEditor)}
              className="text-[9px] text-gray-500 hover:text-gray-300"
            >
              {showTimelineEditor ? '▲ 折叠' : '▼ 展开'}
            </button>
          </div>
        </div>
        
        {/* Director Plan Not Confirmed Warning */}
        {!isDirectorPlanConfirmed && (
          <div className="text-[9px] p-2 rounded border bg-yellow-500/10 border-yellow-500/30 text-yellow-300">
            ⚠️ 请先在上方「自动生成（稳高级）」或手动生成并确认导演镜头计划，才能生成时间轴
          </div>
        )}
        
        {showTimelineEditor && timeline && (
          <div className="p-3 bg-[#0D0D0D] rounded-xl border border-purple-500/20 space-y-3">
            {/* Timeline Header */}
            <div className="flex items-center justify-between text-[9px]">
              <div className="flex items-center gap-3">
                <span className="text-purple-400 font-bold">{timeline.title}</span>
                <span className="text-gray-500">
                  {timeline.contentDurationSec.toFixed(1)}s 内容 + {timeline.blackoutSec.toFixed(1)}s 黑屏
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[8px] ${
                  timeline.mode === 'cinematic' ? 'bg-purple-500/20 text-purple-400' :
                  timeline.mode === 'fast' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {timeline.mode}
                </span>
                <span className="text-gray-600">tempo: {timeline.tempoFactor.toFixed(1)}x</span>
              </div>
            </div>
            
            {/* Shot Timeline Visual */}
            <div className="relative h-8 bg-[#1A1A1A] rounded-lg overflow-hidden border border-white/5">
              <div className="absolute inset-0 flex">
                {timeline.shots.map((shot, idx) => {
                  const widthPercent = (shot.durationSec / timeline.contentDurationSec) * 100;
                  const beatColor = {
                    'Ki': 'bg-blue-500/40 border-blue-500/60',
                    'Sho': 'bg-green-500/40 border-green-500/60',
                    'Ten': 'bg-orange-500/40 border-orange-500/60',
                    'Ketsu': 'bg-purple-500/40 border-purple-500/60',
                  }[shot.beat];
                  
                  return (
                    <div
                      key={shot.id}
                      className={`h-full ${beatColor} border-r flex items-center justify-center text-[8px] text-white/80 font-mono`}
                      style={{ width: `${widthPercent}%` }}
                      title={`#${shot.index} ${shot.beat} (${shot.durationSec}s): ${shot.action}`}
                    >
                      #{shot.index}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Shot List */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
              {timeline.shots.map((shot) => (
                <div 
                  key={shot.id}
                  className="p-2 bg-[#0A0A0A] rounded-lg border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {/* Shot number and beat */}
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center ${
                      shot.beat === 'Ki' ? 'bg-blue-500/20 text-blue-400' :
                      shot.beat === 'Sho' ? 'bg-green-500/20 text-green-400' :
                      shot.beat === 'Ten' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      <span className="text-[10px] font-bold">#{shot.index}</span>
                      <span className="text-[7px]">{shot.beat}</span>
                    </div>
                    
                    {/* Shot info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Action editable */}
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-gray-500 uppercase">Action</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span
                            onDoubleClick={() => startEditShot(shot, 'durationSec')}
                            className="text-[8px] px-1 py-0.5 rounded bg-gray-700/60 text-gray-300 cursor-pointer hover:bg-gray-700"
                            title="双击编辑时长"
                          >
                            {editingShotId === shot.id && editingField === 'durationSec' ? (
                              <input
                                autoFocus
                                type="number"
                                step="0.1"
                                min="0.3"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={saveShotEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveShotEdit(); }
                                  if (e.key === 'Escape') cancelEditShot();
                                }}
                                className="w-14 bg-[#111] border border-blue-500/40 rounded px-1 py-0.5 text-[8px] text-white focus:outline-none"
                              />
                            ) : (
                              `${shot.durationSec.toFixed(1)}s`
                            )}
                          </span>
                          <span className={`text-[8px] px-1 py-0.5 rounded ${
                            shot.motionState === 'STATIC' ? 'bg-gray-700 text-gray-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {shot.motionState}
                          </span>
                        </div>
                      </div>
                      <div
                        className="text-[9px] text-gray-200 bg-[#111] rounded p-2 cursor-pointer hover:border hover:border-white/10"
                        onDoubleClick={() => startEditShot(shot, 'action')}
                      >
                        {editingShotId === shot.id && editingField === 'action' ? (
                          <textarea
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveShotEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveShotEdit(); }
                              if (e.key === 'Escape') cancelEditShot();
                            }}
                            className="w-full bg-[#0A0A0A] border border-blue-500/40 rounded p-2 text-[9px] text-white focus:outline-none"
                            rows={2}
                            placeholder="双击编辑镜头动作"
                          />
                        ) : (
                          shot.action || '双击编辑镜头动作'
                        )}
                      </div>

                      {/* Detail fields */}
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        {(['camera', 'subject', 'scene', 'light', 'grade', 'camTech', 'audio'] as ShotEditableField[]).map((field) => {
                          const labelMap: Record<ShotEditableField, string> = {
                            action: 'Action',
                            camera: '📹 摄影',
                            subject: '👤 主体',
                            scene: '🏞️ 场景',
                            light: '💡 光影',
                            grade: '🎨 调色',
                            camTech: '🔧 相机',
                            audio: '🎵 音频',
                            durationSec: '时长',
                          };
                          const value = (shot as unknown as Record<string, string | undefined>)[field];
                          const isEditing = editingShotId === shot.id && editingField === field;
                          return (
                            <div
                              key={field}
                              className="text-[8px] text-gray-400 bg-[#111] rounded p-1.5 min-h-[30px] cursor-pointer hover:border hover:border-white/10"
                              onDoubleClick={() => startEditShot(shot, field)}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-gray-500">{labelMap[field]}</span>
                              </div>
                              {isEditing ? (
                                <textarea
                                  autoFocus
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={saveShotEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveShotEdit(); }
                                    if (e.key === 'Escape') cancelEditShot();
                                  }}
                                  className="w-full bg-[#0A0A0A] border border-blue-500/40 rounded mt-1 p-1 text-[8px] text-white focus:outline-none"
                                  rows={field === 'camera' ? 2 : 1}
                                  placeholder="双击编辑"
                                />
                              ) : (
                                <div className="text-white/90 mt-0.5 leading-snug break-words">
                                  {value || '双击编辑'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Reference Image Layout */}
            {timeline.refImageLayout && (
              <div className="text-[8px] text-gray-500 bg-black/30 p-2 rounded-lg">
                📋 <span className="text-gray-400">参考图布局:</span> {timeline.refImageLayout}
              </div>
            )}
            
            {/* Prompt Type Selector */}
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-gray-500">提示词格式</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => switchTimelinePromptType('auto')}
                    className={`text-[8px] px-2 py-1 rounded transition-colors ${
                      timelinePromptType === 'auto' 
                        ? 'bg-cyan-500/30 text-cyan-300' 
                        : 'bg-gray-700/30 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    🤖 自动
                  </button>
                  <button
                    onClick={() => switchTimelinePromptType('sora')}
                    className={`text-[8px] px-2 py-1 rounded transition-colors ${
                      timelinePromptType === 'sora' 
                        ? 'bg-green-500/30 text-green-300' 
                        : 'bg-gray-700/30 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    🟢 Sora
                  </button>
                  <button
                    onClick={() => switchTimelinePromptType('veo')}
                    className={`text-[8px] px-2 py-1 rounded transition-colors ${
                      timelinePromptType === 'veo' 
                        ? 'bg-blue-500/30 text-blue-300' 
                        : 'bg-gray-700/30 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    🔵 Veo
                  </button>
                </div>
              </div>
              
              {/* Quick Copy Buttons */}
              {timelinePrompts && (
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-gray-600">复制:</span>
                  <button
                    onClick={() => copyTimelinePrompt('sora')}
                    className="text-[8px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded hover:bg-green-500/20"
                    title="复制 Sora 格式"
                  >
                    📋 Sora
                  </button>
                  <button
                    onClick={() => copyTimelinePrompt('veo')}
                    className="text-[8px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20"
                    title="复制 Veo 格式"
                  >
                    📋 Veo
                  </button>
                  <button
                    onClick={() => copyTimelinePrompt('generic')}
                    className="text-[8px] px-1.5 py-0.5 bg-gray-500/10 text-gray-400 rounded hover:bg-gray-500/20"
                    title="复制通用格式"
                  >
                    📋 通用
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* No timeline hint */}
        {showTimelineEditor && !timeline && isDirectorPlanConfirmed && (
          <div className="p-4 bg-[#0D0D0D] rounded-xl border border-dashed border-purple-500/30 text-center">
            <span className="text-gray-500 text-[10px]">点击「生成时间轴」从导演计划自动创建</span>
          </div>
        )}
      </div>

      {/* Confirmed Prompt Editor - Only shown after timeline is confirmed */}
      {isTimelineConfirmed && timeline && (
        <div className="space-y-2 mt-3 p-3 bg-green-500/5 rounded-xl border border-green-500/20">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-green-400 uppercase font-bold flex items-center gap-2">
              📝 视频生成提示词
              <span className="text-[8px] text-green-300/70 px-1.5 py-0.5 bg-green-400/10 rounded font-normal">已确认时间轴</span>
            </label>
            <div className="flex items-center gap-2">
              {/* Model mismatch warning */}
              {promptModelMismatch && (
                <span className="text-[8px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded animate-pulse">
                  ⚠️ 提示词与当前模型不匹配
                </span>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(videoPrompt)}
                className="text-[9px] text-gray-500 hover:text-gray-300"
                title="复制提示词"
              >
                📋
              </button>
              <button
                onClick={handleAutoClean}
                disabled={!safetyResult || safetyResult.warnings.length === 0}
                className={`text-[9px] px-2 py-1 rounded transition-colors ${
                  safetyResult && safetyResult.warnings.length > 0
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                🔧 优化敏感词
              </button>
            </div>
          </div>
          
          {/* Editable prompt textarea */}
          <textarea
            value={videoPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            className="w-full h-28 bg-[#0A0A0A] border border-green-500/20 rounded-lg p-3 text-xs text-gray-300 resize-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 outline-none font-mono"
            placeholder="视频生成提示词..."
          />
          
          {/* Safety Check Result */}
          {safetyResult && (
            <div className={`p-3 rounded-lg border ${getRiskLevelBg(safetyResult.riskLevel)} border-white/10`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold ${getRiskLevelColor(safetyResult.riskLevel)}`}>
                  {getRiskLevelLabel(safetyResult.riskLevel)}
                </span>
                {safetyResult.warnings.length > 0 && (
                  <button
                    onClick={handleAutoClean}
                    className="text-[9px] px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                  >
                    🔧 一键优化
                  </button>
                )}
              </div>

              {safetyResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {safetyResult.warnings.slice(0, 5).map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[9px]">
                      <span>{getCategoryIcon(warning.category)}</span>
                      <div className="flex-1">
                        <span className="text-red-400 font-mono">「{warning.word}」</span>
                        <span className="text-gray-500 mx-1">→</span>
                        <span className="text-green-400">{warning.suggestion}</span>
                        <span className="text-gray-600 ml-2">({warning.categoryLabel})</span>
                      </div>
                    </div>
                  ))}
                  {safetyResult.warnings.length > 5 && (
                    <div className="text-[9px] text-gray-500">
                      ... 还有 {safetyResult.warnings.length - 5} 个警告
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Model info hint */}
          <div className="flex items-center justify-between text-[8px] text-gray-600">
            <span>当前模型: <span className="text-gray-400">{selectedModel}</span></span>
            {promptGeneratedFor && (
              <span>提示词来源: <span className={promptModelMismatch ? 'text-yellow-400' : 'text-gray-400'}>{promptGeneratedFor}</span></span>
            )}
          </div>
        </div>
      )}

      {/* Single Mode Generation History */}
      {singleModeGenerations.length > 0 && (
        <div className="space-y-2 mt-3">
          <button
            onClick={() => setExpandSingleHistory(!expandSingleHistory)}
            className="w-full flex items-center justify-between text-[10px] text-purple-400 uppercase hover:text-purple-300"
          >
            <span>📜 单段视频生成历史 ({singleModeGenerations.length})</span>
            <span>{expandSingleHistory ? '▲' : '▼'}</span>
          </button>
          
          {expandSingleHistory && (
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
              {singleModeGenerations.map(gen => {
                const timeStr = formatRelativeTime(gen.createdAt);
                const isSuccess = gen.status === 'success';
                const isError = gen.status === 'error';
                const isProcessing = gen.status === 'processing';
                
                return (
                  <div 
                    key={gen.id}
                    className={`p-3 rounded-lg border ${
                      isError 
                        ? 'bg-red-500/10 border-red-500/20' 
                        : isSuccess 
                          ? 'bg-green-500/10 border-green-500/20'
                          : 'bg-yellow-500/10 border-yellow-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${
                          isError ? 'text-red-400' : isSuccess ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {isError ? '❌' : isSuccess ? '✅' : '⏳'} {gen.model}
                        </span>
                        <span className="text-[9px] text-gray-600">{timeStr}</span>
                        {isProcessing && gen.progress && (
                          <span className="text-[9px] text-yellow-400 animate-pulse">
                            {gen.progress}
                          </span>
                        )}
                      </div>
                      {isSuccess && (
                        <button
                          onClick={() => useHistoryGeneration(gen)}
                          className="text-[9px] text-blue-400 hover:text-blue-300"
                        >
                          使用此提示词
                        </button>
                      )}
                    </div>
                    
                    {isProcessing && gen.progress && (
                      <div className="mb-2">
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-yellow-500 transition-all duration-300"
                            style={{ width: gen.progress }}
                          />
                        </div>
                        <p className="text-[9px] text-yellow-400 mt-1 flex items-center gap-1">
                          <span className="w-2 h-2 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                          正在生成中... {gen.taskId && `(${gen.taskId.substring(0, 20)}...)`}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex gap-2 items-start">
                      {(() => {
                        const localVideoKey = `${gen.id}_video`;
                        const videoSrc = historyUrls[localVideoKey] || gen.videoUrl;
                        if (videoSrc) {
                          return (
                            <div className="flex-1">
                              <video 
                                src={videoSrc}
                                controls
                                className="w-full aspect-video rounded-lg bg-black"
                                poster={historyUrls[gen.id] || undefined}
                              >
                                您的浏览器不支持视频播放
                              </video>
                              <div className="flex items-center gap-2 mt-1">
                                {gen.videoUrl ? (
                                  <a 
                                    href={gen.videoUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[9px] text-blue-400 hover:underline"
                                  >
                                    📥 下载视频
                                  </a>
                                ) : (
                                  <span className="text-[9px] text-gray-600">已保存本地</span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        if (historyUrls[gen.id]) {
                          return (
                            <div 
                              className="w-16 h-10 rounded overflow-hidden cursor-pointer shrink-0"
                              onClick={() => onPreview(historyUrls[gen.id])}
                            >
                              <img src={historyUrls[gen.id]} className="w-full h-full object-cover" alt="Reference" />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    
                    <p className="text-[9px] text-gray-500 mt-2 line-clamp-2">
                      {gen.prompt.substring(0, 100)}...
                    </p>
                    
                    {isError && gen.error && (
                      <p className="text-[9px] text-red-400 mt-1">{gen.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Note: Camera movement is configured in the Video Reference Frame Generator */}
      </>
      )}

      {/* Segment Mode UI */}
      {videoTab === 'segment' && (
        <div className="space-y-3 p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/20">
          {/* Auto hints when prerequisites are missing */}
          {(() => {
            const hints: string[] = [];
            const hasVolcKey = !!settings.volcArkApiKey;
            const isSeedance = isVolcArkVideoModel(selectedModel);
            const isBackendOk = concatHealth?.status === 'ok';

            if (!isSeedance && !hasVolcKey) {
              hints.push('未选择 Seedance 模型，且未配置 volcArkApiKey（请在设置里配置火山 Key 或切换到 Seedance 模型）');
            } else if (!isSeedance) {
              hints.push('当前模型不是火山 Seedance（三段首尾帧仅支持 Seedance 系列，请切换模型）');
            } else if (!hasVolcKey) {
              hints.push('未配置 volcArkApiKey（请在设置中填写火山 Ark API Key）');
            }

            if (concatHealth?.status === 'error') {
              hints.push(`本地后端 /api/health 不可用：${concatHealth.error || '连接失败'}（请启动 python_backend/start.sh）`);
            } else if (concatHealth?.status === 'ok' && concatHealth.ffmpegAvailable === false) {
              hints.push('本地后端已启动，但 ffmpeg 不可用（拼接会失败，请安装 ffmpeg）');
            } else if (concatHealth === null) {
              hints.push('正在检测本地后端 /api/health ...');
            } else if (!isBackendOk) {
              hints.push('本地后端 /api/health 状态异常（请检查后端输出）');
            }

            if (hints.length === 0) return null;

            return (
              <div className="text-[9px] p-2 rounded border bg-yellow-500/10 border-yellow-500/30 text-yellow-300 space-y-1">
                <div className="font-bold text-[10px]">⚠️ 三段首尾帧模式提示</div>
                {hints.map((h, idx) => (
                  <div key={idx} className="opacity-90">{idx + 1}. {h}</div>
                ))}
              </div>
            );
          })()}

          {/* Segment page model selector (Seedance only) */}
          <div className="space-y-2">
            <label className="text-[10px] text-gray-500 uppercase">火山模型（Seedance）</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as VeoModel)}
              className="w-full bg-[#1A1A1A] text-white text-xs px-3 py-2 rounded-lg border border-white/10 focus:border-cyan-500/50 outline-none"
            >
              <option value="doubao-seedance-1-0-pro-250528">Seedance 1.0 Pro - 高质量，2-12秒</option>
              <option value="doubao-seedance-1-0-pro-fast-251015">Seedance 1.0 Pro Fast - 快速模式</option>
              <option value="doubao-seedance-1-0-lite-i2v-250428">Seedance 1.0 Lite I2V - 图生视频专用</option>
              <option value="doubao-seedance-1-0-lite-t2v-250428">Seedance 1.0 Lite T2V - 文生视频专用</option>
              <option value="doubao-seedance-1-5-pro-251215">Seedance 1.5 Pro - 4-12秒（支持有声）</option>
            </select>
            <div className="text-[9px] text-gray-600">
              本页仅用于三段首尾帧（建议使用已开通的 Seedance 模型；拼接需本地 Python 后端）。
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cyan-400 font-bold uppercase">🔗 三段首尾帧模式</span>
            <button
              onClick={handleGenerateSegmentPrompts}
              className="text-[9px] px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30 transition-colors"
            >
              🔄 生成提示词
            </button>
          </div>
          
          {/* Segment Cards (always show keys so persisted results can be displayed after page switches) */}
          <div className="space-y-2">
            {(['p3-1', '1-2', '2-3'] as VideoSegmentKey[]).map((key) => {
              const segment = segmentPrompts?.find(s => s.segmentKey === key);
              const status = segmentStatus[key];
              const videoUrl = segmentVideos[key];
              const isP3 = key === 'p3-1';

              return (
                <div 
                  key={key}
                  className={`p-2 rounded-lg border ${
                    status === 'success' ? 'bg-green-500/10 border-green-500/30' :
                    status === 'error' ? 'bg-red-500/10 border-red-500/30' :
                    status === 'generating' ? 'bg-yellow-500/10 border-yellow-500/30' :
                    'bg-gray-800/50 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold ${
                        isP3 ? 'text-purple-400' : 'text-cyan-400'
                      }`}>
                        {key === 'p3-1' ? '🔗 P3→1 (跨分镜)' :
                         key === '1-2' ? '1️⃣ Shot 1→2' :
                         '2️⃣ Shot 2→3'}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {segment ? `${segment.durationSec.toFixed(1)}s` : (status === 'success' ? '已生成' : '未生成')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {status === 'idle' && (
                        <button
                          onClick={() => handleGenerateSegment(key)}
                          className="text-[9px] px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30"
                        >
                          生成
                        </button>
                      )}
                      {status === 'generating' && (
                        <span className="text-[9px] text-yellow-400 flex items-center gap-1">
                          <span className="w-2 h-2 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                          生成中...
                        </span>
                      )}
                      {status === 'success' && (
                        <span className="text-[9px] text-green-400">✓ 完成</span>
                      )}
                      {status === 'error' && (
                        <span className="text-[9px] text-red-400">✗ 失败</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Video preview if available */}
                  {videoUrl && status === 'success' && (
                    <div className="mt-2">
                      <video 
                        src={videoUrl}
                        controls
                        className="w-full aspect-video rounded-lg bg-black"
                      />
                    </div>
                  )}
                  
                  {/* Editable prompt textarea (default open if video generated) */}
                  {(segment || segmentPromptText[key]) && (
                    <div className="mt-2">
                      <label className="text-[8px] text-gray-500 block mb-1 flex items-center gap-2">
                        <span>{status === 'success' || videoUrl ? '✓ 提示词（可编辑）' : '提示词（可编辑）'}</span>
                        <span className="text-[7px] text-purple-400">
                          角色: {(() => {
                            const chars = (segmentPromptText[key] || segment?.prompt || '').match(/Character identity: ([^-]+)/)?.[1] || 'N/A';
                            return chars.split(',').slice(0, 2).join(', ');
                          })()}
                        </span>
                      </label>
                      <textarea
                        value={segmentPromptText[key] || segment?.prompt || ''}
                        onChange={(e) => {
                          setSegmentPromptText(prev => ({
                            ...prev,
                            [key]: e.target.value,
                          }));
                        }}
                        className="w-full p-1.5 bg-black/50 rounded text-[8px] text-gray-300 whitespace-pre-wrap resize-y min-h-[60px] max-h-[200px] border border-white/10 focus:border-cyan-500/50 focus:outline-none"
                        placeholder="提示词将用于生成视频片段..."
                      />
                      {segment && segmentPromptText[key] !== segment.prompt && (
                        <div className="mt-1 text-[7px] text-yellow-400">
                          ⚠️ 已修改（生成时将使用上方输入框内容）
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
              
              {/* Generate All & Concatenate Buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleGenerateAllSegments}
                  disabled={!!segmentPrompts?.some(s => segmentStatus[s.segmentKey] === 'generating')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    segmentPrompts?.some(s => segmentStatus[s.segmentKey] === 'generating')
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30'
                  }`}
                >
                  🎬 全部生成
                </button>
                <button
                  onClick={handleConcatenateSegments}
                  disabled={
                    concatStatus === 'processing' ||
                    Object.values(segmentStatus).filter(s => s === 'success').length < 2
                  }
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    concatStatus === 'processing' || Object.values(segmentStatus).filter(s => s === 'success').length < 2
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30'
                  }`}
                >
                  {concatStatus === 'processing' ? '🔄 拼接中...' : '🔗 拼接视频'}
                </button>
              </div>
              
              {/* Concat Result */}
              {concatStatus === 'success' && concatResult && (
                <div className="mt-3 p-2 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-green-400 font-bold">✓ 拼接完成</span>
                    <a
                      href={concatResult}
                      download={`panel_${panel.panel_id}_concat.mp4`}
                      className="text-[9px] text-blue-400 hover:underline"
                    >
                      📥 下载
                    </a>
                  </div>
                  <video
                    src={concatResult}
                    controls
                    className="w-full aspect-video rounded-lg bg-black"
                  />
                </div>
              )}
              
              {concatStatus === 'error' && concatError && (
                <div className="mt-3 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                  <span className="text-[9px] text-red-400">❌ {concatError}</span>
                </div>
              )}
          </div>
          
          {/* Tip */}
          <div className="text-[8px] text-gray-600 bg-black/30 p-2 rounded">
            💡 提示：需要先生成 Shot 1/2/3 分镜图，然后选择火山 Seedance 模型
          </div>
          
          {/* Segment Mode Generation History */}
          {segmentModeGenerations.length > 0 && (
            <div className="space-y-2 mt-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setExpandSegmentHistory(!expandSegmentHistory)}
                className="w-full flex items-center justify-between text-[10px] text-cyan-400 uppercase hover:text-cyan-300"
              >
                <span>📜 片段生成历史 ({segmentModeGenerations.length})</span>
                <span>{expandSegmentHistory ? '▲' : '▼'}</span>
              </button>
              
              {expandSegmentHistory && (
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {segmentModeGenerations.map(gen => {
                    const timeStr = formatRelativeTime(gen.createdAt);
                    const isSuccess = gen.status === 'success';
                    const isError = gen.status === 'error';
                    const isProcessing = gen.status === 'processing';
                    const isConcat = gen.kind === 'concat';
                    
                    return (
                      <div 
                        key={gen.id}
                        className={`p-3 rounded-lg border ${
                          isError 
                            ? 'bg-red-500/10 border-red-500/20' 
                            : isSuccess 
                              ? 'bg-green-500/10 border-green-500/20'
                              : 'bg-yellow-500/10 border-yellow-500/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${
                              isError ? 'text-red-400' : isSuccess ? 'text-green-400' : 'text-yellow-400'
                            }`}>
                              {isError ? '❌' : isSuccess ? '✅' : '⏳'} 
                              {isConcat ? '🔗 拼接' : `📹 ${gen.kind || 'segment'}`}
                            </span>
                            <span className="text-[9px] text-gray-600">{timeStr}</span>
                            {isProcessing && gen.progress && (
                              <span className="text-[9px] text-yellow-400 animate-pulse">
                                {gen.progress}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {isProcessing && gen.progress && (
                          <div className="mb-2">
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-yellow-500 transition-all duration-300"
                                style={{ width: gen.progress }}
                              />
                            </div>
                            <p className="text-[9px] text-yellow-400 mt-1 flex items-center gap-1">
                              <span className="w-2 h-2 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                              正在生成中...
                            </p>
                          </div>
                        )}
                        
                        <div className="flex gap-2 items-start">
                          {(() => {
                            const localVideoKey = `${gen.id}_video`;
                            const videoSrc = historyUrls[localVideoKey] || gen.videoUrl;
                            if (videoSrc) {
                              return (
                                <div className="flex-1">
                                  <video 
                                    src={videoSrc}
                                    controls
                                    className="w-full aspect-video rounded-lg bg-black"
                                    poster={historyUrls[gen.id] || undefined}
                                  >
                                    您的浏览器不支持视频播放
                                  </video>
                                  <div className="flex items-center gap-2 mt-1">
                                    {gen.videoUrl ? (
                                      <a 
                                        href={gen.videoUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[9px] text-blue-400 hover:underline"
                                      >
                                        📥 下载视频
                                      </a>
                                    ) : (
                                      <span className="text-[9px] text-gray-600">已保存本地</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        
                        {gen.prompt && (
                          <p className="text-[9px] text-gray-500 mt-2 line-clamp-2">
                            {gen.prompt.substring(0, 80)}...
                          </p>
                        )}
                        
                        {isError && gen.error && (
                          <p className="text-[9px] text-red-400 mt-1">{gen.error}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      </div>
      {/* End Scrollable Content */}

      {/* Regenerate Prompts Confirmation Modal */}
      {showRegenPromptModal && (
        <div 
          className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center"
          onClick={() => setShowRegenPromptModal(false)}
        >
          <div 
            className="bg-[#1A1A1A] rounded-xl border border-white/20 p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-3">⚠️ 重新生成提示词</h3>
            <p className="text-sm text-gray-400 mb-4">
              当前已有生成的视频片段或拼接视频。重新生成提示词可能导致预览与提示词不一致。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  doGenerateSegmentPrompts(true); // Preserve videos
                  setShowRegenPromptModal(false);
                }}
                className="flex-1 py-2 px-4 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                仅更新提示词（保留视频）
              </button>
              <button
                onClick={() => {
                  doGenerateSegmentPrompts(false); // Reset videos
                  setShowRegenPromptModal(false);
                }}
                className="flex-1 py-2 px-4 bg-orange-500/20 text-orange-300 rounded-lg hover:bg-orange-500/30 transition-colors text-sm font-medium"
              >
                重新开始（清空视频）
              </button>
              <button
                onClick={() => setShowRegenPromptModal(false)}
                className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGeneratorPanel;
