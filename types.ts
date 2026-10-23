export type PipelineStatus = 'IDLE' | 'SPLITTING' | 'BREAKDOWN_ALIGNING' | 'WRITING' | 'ALIGNING' | 'AUTO_FIXING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'ERROR' | 'ARCHIVING' | 'GENERATING_IMAGE';

export type AssetType = 'character' | 'scene' | 'item';

// ============================================================================
// Panel Shot Types (Structured 3-shot per panel for triptych generation)
// ============================================================================

/**
 * Shot Size (景别)
 * - WS: Wide Shot (全景/远景) - Establishing shot, shows full environment
 * - MS: Medium Shot (中景) - Character from waist up, balanced context
 * - CU: Close-Up (特写) - Face or object detail, emotional impact
 */
export type ShotSize = 'WS' | 'MS' | 'CU';

/**
 * Panel Shot - Structured data for one shot within a panel's 3-shot triptych
 * Each panel should have exactly 3 shots (index 1, 2, 3)
 */
export interface PanelShot {
  index: 1 | 2 | 3;                    // Shot index within the triptych
  dialogue: string;                    // Dialogue line for this shot
  action: string;                      // Action description (what's happening)
  visual: string;                      // Visual description for image generation
  
  // Asset bindings (by asset ID for precise matching)
  characterAssetIds: string[];         // Character asset IDs (recommended max 2)
  sceneAssetId: string | null;         // Scene asset ID (one per shot)
  propAssetIds: string[];              // Prop/item asset IDs (recommended max 3)
  
  // Shot composition
  shotSize: ShotSize;                  // WS / MS / CU
  composition: string;                 // Composition notes (rule of thirds, center, etc.)
  camera: string;                      // Camera angle/movement (eye level, low angle, etc.)
  
  // Lighting and grading
  light: string;                       // Lighting setup (natural, dramatic, rim light, etc.)
  grade?: string;                      // Color grading style (teal-orange, warm, cold, etc.)
  
  // Negative prompts for image generation
  negatives?: string[];                // Things to avoid in generation
}

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  description: string;
  prompt: string;
  aspectRatio: string;
  imagePath?: string;
  imageHistory?: string[];
  attributes?: Record<string, string>;
}

// ============================================================================
// Asset Optimization Types
// ============================================================================

/**
 * Risk level for optimization proposals
 * - low: Safe to apply (e.g., adding missing template)
 * - medium: Review recommended (e.g., significant prompt changes)
 * - high: Manual review required (e.g., AI-generated major rewrites)
 */
export type OptimizationRiskLevel = 'low' | 'medium' | 'high';

/**
 * Source of the optimization suggestion
 * - local_rule: Deterministic local template/rule
 * - ai_suggestion: AI-generated optimization
 */
export type OptimizationSource = 'local_rule' | 'ai_suggestion';

/**
 * A single field change within a proposal
 */
export interface FieldChange {
  field: 'prompt' | 'description' | 'aspectRatio';
  before: string;
  after: string;
}

/**
 * Asset optimization proposal - suggests improvements for an existing asset
 */
export interface AssetOptimizationProposal {
  id: string;                        // Unique proposal ID
  assetId: string;                   // Target asset ID
  assetName: string;                 // Asset name (for display)
  assetType: AssetType;              // Asset type
  source: OptimizationSource;        // Where this suggestion came from
  riskLevel: OptimizationRiskLevel;  // Risk assessment
  reason: string;                    // Why this optimization is suggested
  changes: FieldChange[];            // List of field changes
  // Convenience: the full "after" asset (with changes applied)
  proposedAsset: Partial<Asset>;
}

/**
 * Result of running asset optimization analysis
 */
export interface AssetOptimizationResult {
  proposals: AssetOptimizationProposal[];
  newAssets: Asset[];                // Also include any newly discovered assets
  summary: {
    totalAnalyzed: number;
    proposalsGenerated: number;
    newAssetsFound: number;
  };
}

/**
 * Narration Beat reference within ScriptPanel (for debug/trace)
 */
export interface NarrationBeatRef {
  beatId: string;
  text: string;
}

export interface ScriptPanel {
  panel_id: number;
  globalPanelNo?: number; // Unified panel number across scripts/episodes
  script_content: string;
  duration: string;
  active_characters_str: string;
  scene_name: string;
  props: string;
  composition: string;
  visual: string;           // Legacy field (kept for compatibility)
  visualZh?: string;        // Chinese visual description (source of truth for human editing)
  visualEn?: string;        // English visual description (cached translation for English models)
  dialogue: string[];
  imagePath?: string;
  imageUrl?: string;
  imageHistory?: string[];
  triptych_sources?: string[];
  triptych_history?: string[][];
  relatedAssetIds?: string[];
  relatedItemIds?: string[];
  // Video Reference Frame
  videoRefPath?: string;
  shotTypes?: string[];
  shotDurations?: number[];
  // Line Art Triptych
  lineArt?: string;           // Current line art image path
  lineArtHistory?: string[];  // History of generated line arts
  // Video Generation
  videoGenerations?: VideoGeneration[];
  currentVideoPrompt?: string;
  // Segment-mode prompt cache (首尾帧三段提示词)
  segmentPrompts?: {
    segmentKey: VideoSegmentKey;
    prompt: string;
    durationSec?: number;
    startFramePath?: string;
    endFramePath?: string;
  }[];
  // Video Timeline DSL
  videoTimeline?: VideoTimelineConfig;
  // Micro-Montage Continuity (cross-panel consistency)
  continuityMode?: 'auto' | 'on' | 'off';  // auto: system decides, on: force use prev anchor, off: skip prev anchor
  continuityPrevHint?: string;              // Debug hint explaining why continuity was enabled/disabled
  
  // Structured 3-shot data (new: for enhanced triptych generation)
  // When present, TriptychGenerator uses shots[idx] for each frame instead of ▲ parsing
  shots?: [PanelShot, PanelShot, PanelShot];

  // Director auto plan (稳高级自动镜头表)
  videoDirectorPlan?: DirectorPlan;
  
  // ============================================================================
  // Second-Person Narration Track (第二人称讲解轨)
  // ============================================================================
  // Dual-track design: narration轨 for voiceover/subtitles, visual轨 for image generation
  
  narrationZh?: string;               // Final second-person narration (口播/字幕)
  narrationHook?: string;             // Optional: This panel's hook sentence
  narrationBeats?: NarrationBeatRef[]; // Optional: Beat references for debug/trace
}

/**
 * Continuity Mode Type
 * - 'auto': System automatically decides based on scene/time continuity
 * - 'on': Force use previous panel's last frame as anchor
 * - 'off': Skip cross-panel continuity anchor
 */
export type ContinuityMode = 'auto' | 'on' | 'off';

// Video Generation Record
export interface VideoGeneration {
  id: string;
  createdAt: number;
  model: VeoModel;
  prompt: string;
  refImagePath?: string;
  videoPath?: string;
  videoUrl?: string;
  taskId?: string; // Remote task ID for polling
  progress?: string; // e.g. "50%"
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  
  // Segment mode fields (for 首尾帧 3-segment generation)
  kind?: 'single' | 'segment' | 'concat';  // single=普通单段, segment=首尾帧片段, concat=拼接成片
  segmentKey?: 'p3-1' | '1-2' | '2-3';     // Which segment this is (prev3→1, 1→2, 2→3)
  startFramePath?: string;                  // Start keyframe image path
  endFramePath?: string;                    // End keyframe image path
  durationSec?: number;                     // Target duration for this segment
}

// Segment Key Type for type safety
export type VideoSegmentKey = 'p3-1' | '1-2' | '2-3';

// Veo Model Types
export type VeoModel = 
  | 'veo3-pro-frames' 
  | 'veo3-fast-frames' 
  | 'veo2-fast-frames' 
  | 'veo2-fast-components'
  | 'veo3.1'
  | 'veo3.1-pro'
  | 'veo3.1-components'
  // Sora models
  | 'sora2'
  | 'sora2-turbo'
  // Kling models (可灵)
  | 'kling-v1'
  | 'kling-v1.5'
  // VolcEngine models (火山) - Legacy
  | 'doubao-video'
  | 'volcengine-video'
  // VolcEngine Ark Seedance models (火山方舟视频生成)
  | 'doubao-seedance-1-5-pro-251215'
  | 'doubao-seedance-1-0-pro-250528'
  | 'doubao-seedance-1-0-pro-fast-251015'
  | 'doubao-seedance-1-0-lite-t2v-250428'
  | 'doubao-seedance-1-0-lite-i2v-250428';

// Camera Movement Types
export type CameraMove = 
  | 'static'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'dolly_in'
  | 'dolly_out'
  | 'orbit_left'
  | 'orbit_right'
  | 'crane_up'
  | 'crane_down'
  | 'follow'
  | 'handheld';

export interface WebtoonScript {
  episode_number: number;
  panels: ScriptPanel[];
}

// ============================================================================
// Second-Person Explain / Narration Types (Two-Agent Chain)
// ============================================================================

/**
 * ExplainBeat - A narrative beat unit for second-person storytelling
 * Used as intermediate layer between ExplainAgent (A) and StoryboardAgent (B)
 */
export interface ExplainBeat {
  beatId: string;                     // Unique beat identifier (e.g., "beat_1")
  narrationZh: string;                // Second-person narration text (第二人称讲解)
  turningPoint: string;               // The twist/information gap in this beat (反转/信息差)
  stakes?: string;                    // Stakes/conflict driver (爽点：危机/资源/规则破局)
  relatedSceneHint?: string;          // Scene hint for Agent B mapping
  relatedCharactersHint?: string[];   // Character hints for Agent B mapping
  relatedPropsHint?: string[];        // Prop hints for Agent B mapping
}

/**
 * ExplainPackage - Output of Agent A (Explain/Narration Agent)
 * Contains "四件套" (Four-Piece Set) + beats + script for downstream processing
 */
export interface ExplainPackage {
  // 四件套 (Four-Piece Set) - extracted from source novel
  novelType: string;                  // 小说类型 (e.g., "规则怪谈", "系统流", "玄幻")
  goldenHook: string;                 // 黄金钩子 - Opening hook (rule/warning/taboo)
  explosiveOpening: string;           // 爆款开头 - Scene establishment + anomaly
  plotTwist: string;                  // 剧情反转 - Key twist reveal
  
  // Analysis fields (分析，非剧情事实)
  writingTechnique?: string;          // 写作技巧分析
  heatEstimate?: string;              // 热度预估 (e.g., "9.5/10")
  
  // Narrative structure
  beats: ExplainBeat[];               // 分镜级 beats (6-10 recommended)
  script: string[];                   // Full second-person script array
  
  // Summary for Agent B (避免 B 重新长文本理解导致漂移)
  sourceSummary: string;              // Condensed summary of source material
}

export interface PlotEpisode {
  episode_number: number;
  title: string;
  core_conflict: string;
  hook_type: string;
  hook_intensity: number;
  scenes_summary: string[] | string;
  status?: 'idle' | 'loading' | 'success' | 'error';
  
  // Optional: 四件套 fields (populated when second-person explain mode is enabled)
  novelType?: string;                 // 小说类型
  goldenHook?: string;                // 黄金钩子
  explosiveOpening?: string;          // 爆款开头
  plotTwist?: string;                 // 剧情反转
  writingTechnique?: string;          // 写作技巧
  heatEstimate?: string;              // 热度预估
  
  // Full explain package (cached from Agent A output)
  explainPackage?: ExplainPackage;
}

export interface PlotBreakdown {
  batch_id?: string;
  episodes: PlotEpisode[];
}

export interface AlignerIssue {
  panel_id: number;
  issue_type: string;
  description: string;
  suggestion: string;
  // Original script content before auto-fix (used for undo)
  original_visual?: string;
  is_fixed?: boolean;
}

export interface AlignerReport {
  score: number;
  checkpoints?: Record<string, boolean>;
  critical_issues: AlignerIssue[];
}

export interface BreakdownIssue {
  issue_type: string;
  target_episode?: number;
  target_field?: string;
  description: string;
  suggestion?: string;
  is_fixed?: boolean;
  original_value?: any;
}

export interface BreakdownReport {
  batch_id?: string;
  status: string;
  score: number;
  summary: string;
  metrics: {
    conflict_density_score: number;
    hook_validity_score: number;
    pacing_score: number;
  };
  issues: BreakdownIssue[];
}

export interface NovelStyle {
  id: string;
  name: string;
  prompt: string;
  isBuiltIn: boolean;
  previewColor?: string;
  previewGradient?: string;
  genre?: string;           // Applicable genres/themes
  previewImage?: string;    // URL or base64 preview image
}

export interface StoryBible {
  summary: string;
  last_plot_point: string;
  characters: Record<string, string>;
  updatedAt: number;
}

export interface Volume {
  id: string;
  name: string;
  content: string;
  order: number;
  plotBreakdown: PlotBreakdown | null;
  breakdownReport: BreakdownReport | null;
  scriptCache: Record<number, WebtoonScript>;
  reportCache: Record<number, AlignerReport>;
}

// 新增卷索引类型，用于精简版project.json
export interface VolumeIndex {
  id: string;
  name: string;
  order: number;
}

export interface ProjectV2 {
  id: string;
  name: string;
  coverImage?: string;
  lastModified: number;
  version: string; // 新增版本字段，用于标识架构版本
  activeVolumeId: string;
  storyBible: StoryBible | null;
  assets: Asset[];
  activeStyle: NovelStyle | null;
  customStyles: NovelStyle[];
  volumeIndex: VolumeIndex[]; // 替换完整的volumes数组
}

// 保留原始Project类型用于向后兼容
export interface Project {
  id: string;
  name: string;
  coverImage?: string;
  lastModified: number;
  volumes: Volume[];
  activeVolumeId: string;
  storyBible: StoryBible | null;
  assets: Asset[];
  activeStyle: NovelStyle | null;
  customStyles: NovelStyle[];
}

export interface MessageLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export interface GenerationTask {
  id: string;
  source: string;
  type: 'image' | 'text' | 'video';
  model: string;
  status: 'processing' | 'success' | 'error' | 'pending';
  createdAt: number;
  finishedAt?: number;
}

export interface AppSettings {
  splitterModel: string;
  writerModel: string;
  alignerModel: string;
  imageModel: string;         // Image-to-image model (with reference images)
  txt2imgModel?: string;      // Text-to-image model (no reference images)
  
  splitterPrompt: string;
  writerPrompt: string;
  alignerPrompt: string;
  breakdownPrompt: string;
  assetPrompt: string;
  stylePrompt: string;
  archivistPrompt: string;

  storageKeyPrefix: string;
  apiKey: string;
  apiBaseUrl: string;
  customModels: string[];
  
  // Video Generation (Veo API)
  veoApiKey?: string;
  veoApiBaseUrl?: string;
  veoModel?: VeoModel;
  veoEnhancePrompt?: boolean;
  veoAspectRatio?: '9:16' | '16:9';
  
  // Video Generation (Sora2 API)
  sora2ApiKey?: string;
  sora2ApiBaseUrl?: string;
  sora2Model?: 'sora-2' | 'sora-2-pro';  // Default model for Sora2
  sora2Duration?: '10' | '15' | '25';
  sora2Hd?: boolean;
  sora2Watermark?: boolean;
  sora2Private?: boolean;
  sora2NotifyHook?: string;

  // VolcEngine Ark (火山方舟) - Image & Video Generation
  volcArkApiKey?: string;
  volcImageDefaultSize?: string;        // e.g., '2048x2048', '2K', '4K'
  volcImageWatermark?: boolean;          // Default: true
  volcVideoResolution?: '480p' | '720p' | '1080p';  // Default: '720p'
  volcVideoDuration?: number;            // Default: 5 (seconds, range: 2-12)
  volcVideoGenerateAudio?: boolean;      // Default: true (only for Seedance 1.5 pro)

  // Storyboard / Shot Prompt Language
  // - bilingual: Chinese main content + English hard constraints (recommended)
  // - zh: Chinese only (constraints will still include English forbidden list in some places for compliance)
  shotPromptLanguage?: 'bilingual' | 'zh';
  
  // Sound Notifications
  soundEnabled?: boolean;        // 是否启用声音提醒
  soundVolume?: number;          // 音量 (0-1)
  
  // Video Concat (Python backend)
  videoConcatBaseUrl?: string;   // Default: http://127.0.0.1:8008

  // Auto Director (稳高级自动镜头计划)
  autoVideoPanelDurationSec?: number;   // 默认 10
  autoVideoShotCountMin?: number;       // 默认 6
  autoVideoShotCountMax?: number;       // 默认 10
  autoVideoMode?: 'stable';             // 当前仅支持 stable
  autoVideoConfirmBeforeGenerate?: boolean; // 生成前需要确认镜头计划
  
  // ============================================================================
  // Second-Person Explain Mode (第二人称讲解模式)
  // ============================================================================
  // When enabled, uses Two-Agent Chain: Agent A (Explain) -> Agent B (Storyboard)
  
  enableSecondPersonExplain?: boolean;  // 启用第二人称讲解模式 (默认: false)
  explainModel?: string;                // Agent A (Explain) 使用的模型 (默认: 使用 writerModel)
  explainBeatsCount?: number;           // 推荐 beats 数量 (默认: 8, 范围: 6-10)
  explainPanelCount?: number;           // 推荐 panel 数量 (默认: 8, 范围: 6-12)
}

// ============================================================================
// Video Timeline DSL Types
// ============================================================================

/**
 * Narrative Beat (Ki-Sho-Ten-Ketsu structure)
 * - Ki: Introduction / Setup
 * - Sho: Development
 * - Ten: Twist / Climax
 * - Ketsu: Conclusion / Resolution
 */
export type NarrativeBeat = 'Ki' | 'Sho' | 'Ten' | 'Ketsu';

/**
 * Motion State for a shot
 */
export type MotionState = 'STATIC' | 'DYNAMIC';

/**
 * Timeline Mode
 */
export type TimelineMode = 'standard' | 'cinematic' | 'fast';

/**
 * Single Shot Unit in the timeline
 * Follows the structured pseudo-code format:
 * [#n duration] ACTION:{} ; CAMERA:{} — [MOTION] /* Beat */
 * | SUBJECT:{} | SCENE:{} | LIGHT:{} | GRADE:{} | CAM:{} | AUDIO:{}
 */
export interface ShotUnit {
  id: string;
  index: number;                    // Shot number (#1, #2, ...)
  durationSec: number;              // Duration in seconds (e.g., 2.3)
  beat: NarrativeBeat;              // Narrative beat marker
  motionState: MotionState;         // STATIC or DYNAMIC
  
  // Core directives
  action: string;                   // ACTION:{...} - What's happening
  camera: string;                   // CAMERA:{...} - Camera language (e.g., "locked MS", "dolly in")
  
  // Five-dimensional parameter blocks
  subject?: string;                 // SUBJECT:{...} - Character/object appearance details
  scene?: string;                   // SCENE:{...} - Environment/setting details
  light?: string;                   // LIGHT:{...} - Lighting setup
  grade?: string;                   // GRADE:{...} - Color grading / style
  camTech?: string;                 // CAM:{...} - Technical camera params (lens, focal length)
  audio?: string;                   // AUDIO:{...} - Audio/sound design hints
  
  // Reference image contract
  refImageHints?: string;           // Which part of reference image this shot uses
}

// Director-style auto shot plan (稳高级)
export interface DirectorPlanShot {
  index: number;                    // 1-based shot index
  beat: NarrativeBeat;              // Narrative beat
  shotType: 'WS' | 'MS' | 'CU' | 'OTS' | 'POV' | 'INSERT'; // 景别/视角类型
  durationSec: number;              // Duration per shot
  motion: 'STATIC' | 'DYNAMIC';     // 简化后的运动状态
  camera: string;                   // 运镜/机位描述
  action: string;                   // 镜头要表现的动作/情节
  subject?: string;                 // 主体/人物外观摘要
  scene?: string;                   // 场景/环境摘要
}

export interface DirectorPlan {
  durationSec: number;              // 总时长
  shotCount: number;                // 镜头数量
  mode: 'stable_cinematic';         // 当前只支持稳高级模式
  shots: DirectorPlanShot[];        // 镜头列表
  createdAt: number;                // 生成时间戳
  source: 'deterministic' | 'ai_refined'; // 来源：算法草案或 AI 精修
}

/**
 * Complete Video Timeline Configuration
 * Global metadata + array of shots
 */
export interface VideoTimelineConfig {
  // Global metadata
  title: string;                    // Project/video title
  totalDurationSec: number;         // Total video duration
  contentDurationSec: number;       // Actual content duration (excluding blackout)
  blackoutSec: number;              // End blackout/fade duration
  aspectRatio: '16:9' | '9:16' | '1:1';
  tempoFactor: number;              // Editing tempo (1.0 = normal, 2.0 = fast cuts)
  mode: TimelineMode;               // Rendering mode
  
  // Timeline shots
  shots: ShotUnit[];
  
  // Global overrides (applied to all shots unless overridden)
  globalGrade?: string;             // Global color grading
  globalLight?: string;             // Global lighting style
  globalCamTech?: string;           // Global camera tech defaults
  
  // Reference image layout description
  refImageLayout?: string;          // Description of reference image layout
}
