/**
 * Video Prompt Builder Service
 * 
 * Generates optimized prompts for different video generation models:
 * - Veo 3.1 / Veo 3.1 Pro (Google)
 * - Sora 2 (OpenAI)
 * - Kling (Kuaishou)
 * - VolcEngine (ByteDance)
 * 
 * Core principle: Reference images show appearance, prompts describe motion.
 */

import { Asset, ScriptPanel, Project, AppSettings } from '../types';

// ============================================================================
// Types
// ============================================================================

export type VideoModelProvider = 'veo' | 'sora' | 'kling' | 'volcengine' | 'generic';

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

export interface CameraMoveOption {
  value: CameraMove;
  labelCN: string;
  labelEN: string;
  icon: string;
}

export interface VideoPromptConfig {
  // Model selection
  modelProvider: VideoModelProvider;
  
  // Characters
  characters: Array<{
    name: string;
    description?: string;
    action?: string;
  }>;
  
  // Scene
  scene?: {
    name: string;
    description?: string;
    atmosphere?: string;
  };
  
  // Props (optional)
  props?: string[];
  
  // Visual action (extracted from script ▲ lines)
  visualActions: string[];
  
  // Style
  style?: {
    name: string;
    prompt: string;
  };
  
  // Video settings
  aspectRatio: '16:9' | '9:16' | '1:1';
  duration: number;
  
  // Camera movement
  cameraMove: CameraMove;
  
  // Additional modifiers
  mood?: string;
  lighting?: string;
}

// ============================================================================
// Camera Move Options
// ============================================================================

export const CAMERA_MOVES: CameraMoveOption[] = [
  { value: 'static', labelCN: '固定镜头', labelEN: 'Static', icon: '📷' },
  { value: 'pan_left', labelCN: '左摇', labelEN: 'Pan Left', icon: '⬅️' },
  { value: 'pan_right', labelCN: '右摇', labelEN: 'Pan Right', icon: '➡️' },
  { value: 'pan_up', labelCN: '上摇', labelEN: 'Pan Up', icon: '⬆️' },
  { value: 'pan_down', labelCN: '下摇', labelEN: 'Pan Down', icon: '⬇️' },
  { value: 'zoom_in', labelCN: '推进', labelEN: 'Zoom In', icon: '🔍' },
  { value: 'zoom_out', labelCN: '拉远', labelEN: 'Zoom Out', icon: '🔭' },
  { value: 'dolly_in', labelCN: '推轨', labelEN: 'Dolly In', icon: '🎬' },
  { value: 'dolly_out', labelCN: '拉轨', labelEN: 'Dolly Out', icon: '🎥' },
  { value: 'orbit_left', labelCN: '左环绕', labelEN: 'Orbit Left', icon: '🔄' },
  { value: 'orbit_right', labelCN: '右环绕', labelEN: 'Orbit Right', icon: '🔃' },
  { value: 'crane_up', labelCN: '升降升', labelEN: 'Crane Up', icon: '📈' },
  { value: 'crane_down', labelCN: '升降降', labelEN: 'Crane Down', icon: '📉' },
  { value: 'follow', labelCN: '跟随', labelEN: 'Follow', icon: '🏃' },
  { value: 'handheld', labelCN: '手持', labelEN: 'Handheld', icon: '✋' },
];

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build video prompt based on model provider
 */
export function buildVideoPrompt(config: VideoPromptConfig): string {
  const { modelProvider } = config;
  
  switch (modelProvider) {
    case 'veo':
      return buildVeoPrompt(config);
    case 'sora':
      return buildSoraPrompt(config);
    case 'kling':
      return buildKlingPrompt(config);
    case 'volcengine':
      return buildVolcEnginePrompt(config);
    default:
      return buildGenericPrompt(config);
  }
}

// ============================================================================
// Model-Specific Builders
// ============================================================================

// ============================================================================
// Cinematic Quality Modifiers
// ============================================================================

const VEO_QUALITY_TAGS = [
  'cinematic lighting',
  'volumetric rays',
  'smooth motion',
  'professional cinematography',
  'high production value',
  '4K resolution',
  'film grain',
  'depth of field'
];

const SORA_QUALITY_TAGS = [
  'cinematic',
  'professional film quality',
  'detailed textures',
  'natural lighting',
  'smooth camera movement'
];

const KLING_QUALITY_TAGS_CN = [
  '电影质感',
  '高清画质',
  '流畅运动',
  '专业摄影'
];

const VOLC_QUALITY_TAGS_CN = [
  '电影感',
  '高清',
  '画质精美',
  '动作流畅'
];

// Mood to cinematic description mapping
const MOOD_TO_CINEMATIC: Record<string, { en: string; cn: string; lighting: string }> = {
  '紧张悬疑': { 
    en: 'suspenseful tension, dramatic atmosphere', 
    cn: '紧张悬疑氛围',
    lighting: 'high contrast lighting, dramatic shadows'
  },
  '温馨治愈': { 
    en: 'warm and heartfelt, cozy atmosphere', 
    cn: '温馨治愈氛围',
    lighting: 'soft warm lighting, golden hour glow'
  },
  '激烈动作': { 
    en: 'intense action, high energy', 
    cn: '激烈动作场面',
    lighting: 'dynamic lighting, motion blur, impact effects'
  },
  '悲伤沉重': { 
    en: 'melancholic, heavy emotional weight', 
    cn: '悲伤沉重氛围',
    lighting: 'desaturated colors, soft diffused light'
  },
  '愤怒压抑': { 
    en: 'suppressed rage, building tension', 
    cn: '愤怒压抑氛围',
    lighting: 'harsh shadows, red undertones'
  },
  '神秘诡谲': { 
    en: 'mysterious and eerie', 
    cn: '神秘诡谲氛围',
    lighting: 'low key lighting, volumetric fog'
  },
  '浪漫唯美': { 
    en: 'romantic and beautiful', 
    cn: '浪漫唯美氛围',
    lighting: 'soft backlight, lens flare, dreamy bokeh'
  },
  '日常': { 
    en: 'everyday slice of life', 
    cn: '日常生活',
    lighting: 'natural ambient lighting'
  }
};

/**
 * Veo 3.1 / Veo 3.1 Pro format (Enhanced)
 * - Supports longer, detailed prompts
 * - Responds well to cinematic terminology
 * - Excellent for continuous actions and smooth motion
 */
function buildVeoPrompt(config: VideoPromptConfig): string {
  const parts: string[] = [];
  
  // 1. Primary visual action (core narrative)
  const mainAction = config.visualActions.join('. ');
  if (mainAction) {
    parts.push(mainAction);
  }
  
  // 2. Character descriptions
  if (config.characters.length > 0) {
    const charDesc = config.characters.map(c => {
      if (c.description) {
        return `${c.name} (${c.description})`;
      }
      return c.name;
    }).join(', ');
    parts.push(charDesc);
  }
  
  // 3. Scene/Environment
  if (config.scene?.name) {
    let sceneDesc = config.scene.name;
    if (config.scene.description) {
      sceneDesc += `, ${config.scene.description}`;
    }
    parts.push(sceneDesc);
  }
  
  // 4. Camera movement (detailed)
  const cameraDesc = getCameraMoveEN(config.cameraMove);
  if (cameraDesc && config.cameraMove !== 'static') {
    parts.push(cameraDesc);
  }
  
  // 5. Style modifier
  if (config.style?.prompt) {
    parts.push(config.style.prompt);
  }
  
  // 6. Mood/atmosphere with cinematic enhancement
  if (config.mood) {
    const moodInfo = MOOD_TO_CINEMATIC[config.mood] || { en: config.mood, lighting: '' };
    parts.push(moodInfo.en);
    if (moodInfo.lighting) {
      parts.push(moodInfo.lighting);
    }
  }
  
  // 7. Additional lighting
  if (config.lighting) {
    parts.push(config.lighting);
  }
  
  // 8. Technical quality tags
  parts.push(...VEO_QUALITY_TAGS);
  
  // 9. Duration
  parts.push(`${config.duration} seconds video`);
  
  return parts.filter(Boolean).join('. ');
}

/**
 * Sora 2 format (Enhanced)
 * - Prefers natural, narrative English
 * - Excellent scene understanding
 * - Supports complex action sequences
 * - Best for storytelling-style prompts
 */
function buildSoraPrompt(config: VideoPromptConfig): string {
  const parts: string[] = [];
  
  // 1. Build subject description with details
  let subject = '';
  if (config.characters.length > 0) {
    const charDescriptions = config.characters.map(c => {
      let desc = c.name;
      if (c.description) {
        desc += ` (${c.description})`;
      }
      if (c.action) {
        desc += ` ${c.action}`;
      }
      return desc;
    });
    subject = charDescriptions.join(' and ');
  } else {
    subject = 'The scene unfolds';
  }
  
  // 2. Build setting with atmosphere
  let setting = '';
  if (config.scene?.name) {
    setting = `in ${config.scene.name}`;
    if (config.scene.description) {
      setting += `, ${config.scene.description}`;
    }
    if (config.scene.atmosphere) {
      setting += `, with ${config.scene.atmosphere} atmosphere`;
    }
  }
  
  // 3. Main narrative sentence
  const mainAction = config.visualActions[0] || 'moves gracefully';
  parts.push(`${subject} ${mainAction} ${setting}`.trim());
  
  // 4. Additional action sequences
  if (config.visualActions.length > 1) {
    const additionalActions = config.visualActions.slice(1).map(a => a.trim()).join('. Then, ');
    parts.push(`Then, ${additionalActions}`);
  }
  
  // 5. Camera movement (narrative style)
  if (config.cameraMove !== 'static') {
    const cameraDesc = getCameraMoveEN(config.cameraMove);
    parts.push(`The camera ${cameraDesc.toLowerCase()}`);
  }
  
  // 6. Mood with cinematic enhancement
  if (config.mood) {
    const moodInfo = MOOD_TO_CINEMATIC[config.mood] || { en: config.mood };
    parts.push(`The atmosphere is ${moodInfo.en}`);
  }
  
  // 7. Style
  // Prefer the full project style prompt (strong constraint) over just the style name.
  if (config.style?.prompt) {
    parts.push(`Visual style: ${config.style.prompt}`);
  } else if (config.style?.name) {
    parts.push(`Visual style: ${config.style.name}`);
  }
  
  // 8. Lighting
  if (config.lighting) {
    parts.push(config.lighting);
  }
  
  // 9. Quality tags
  parts.push(...SORA_QUALITY_TAGS);
  
  return parts.filter(Boolean).join('. ') + '.';
}

/**
 * Kling (可灵) format (Enhanced)
 * - Excellent Chinese understanding
 * - Responds well to concise, structured prompts
 * - Sensitive to Chinese camera movement terms
 * - Best with shorter, focused prompts
 */
function buildKlingPrompt(config: VideoPromptConfig): string {
  const parts: string[] = [];
  
  // 1. Characters (concise)
  if (config.characters.length > 0) {
    const charNames = config.characters.map(c => c.name).join('、');
    parts.push(charNames);
  }
  
  // 2. Main action (keep it concise but descriptive)
  const mainAction = config.visualActions.slice(0, 2).join('，');
  if (mainAction) {
    parts.push(mainAction);
  }
  
  // 3. Scene
  if (config.scene?.name) {
    parts.push(config.scene.name);
  }
  
  // 4. Camera movement (Chinese)
  const cameraCN = getCameraMoveCN(config.cameraMove);
  if (cameraCN && config.cameraMove !== 'static') {
    parts.push(cameraCN);
  }
  
  // 5. Mood with Chinese cinematic terms
  if (config.mood) {
    const moodInfo = MOOD_TO_CINEMATIC[config.mood] || { cn: config.mood };
    parts.push(moodInfo.cn);
  }
  
  // 6. Style (short tag)
  if (config.style?.name) {
    parts.push(config.style.name);
  }
  
  // 7. Quality tags (Chinese)
  parts.push(...KLING_QUALITY_TAGS_CN);
  
  return parts.filter(Boolean).join('，');
}

/**
 * VolcEngine (火山引擎/豆包) format (Enhanced)
 * - Structured Chinese tags
 * - Good with labeled format
 * - Prefers clear categorization
 */
function buildVolcEnginePrompt(config: VideoPromptConfig): string {
  const parts: string[] = [];
  
  // 1. Characters with description
  if (config.characters.length > 0) {
    const charDescs = config.characters.map(c => {
      if (c.description) {
        return `${c.name}（${c.description}）`;
      }
      return c.name;
    }).join('、');
    parts.push(`【人物】${charDescs}`);
  }
  
  // 2. Visual action
  const action = config.visualActions.slice(0, 2).join('，');
  if (action) {
    parts.push(`【动作】${action}`);
  }
  
  // 3. Scene with description
  if (config.scene?.name) {
    let sceneDesc = config.scene.name;
    if (config.scene.description) {
      sceneDesc += `，${config.scene.description}`;
    }
    parts.push(`【场景】${sceneDesc}`);
  }
  
  // 4. Camera movement
  const cameraCN = getCameraMoveCN(config.cameraMove);
  if (cameraCN && config.cameraMove !== 'static') {
    parts.push(`【镜头】${cameraCN}`);
  }
  
  // 5. Mood/Atmosphere
  if (config.mood) {
    const moodInfo = MOOD_TO_CINEMATIC[config.mood] || { cn: config.mood };
    parts.push(`【氛围】${moodInfo.cn}`);
  }
  
  // 6. Style tags
  if (config.style?.name) {
    parts.push(`【风格】${config.style.name}`);
  }
  
  // 7. Quality tags
  parts.push(`【品质】${VOLC_QUALITY_TAGS_CN.join('、')}`);
  
  return parts.filter(Boolean).join(' ');
}

/**
 * Generic format (fallback)
 */
function buildGenericPrompt(config: VideoPromptConfig): string {
  const parts: string[] = [];
  
  // Visual actions
  parts.push(config.visualActions.join('. '));
  
  // Camera
  if (config.cameraMove !== 'static') {
    parts.push(getCameraMoveEN(config.cameraMove));
  }
  
  // Style
  if (config.style?.prompt) {
    parts.push(config.style.prompt);
  }
  
  // Duration
  parts.push(`${config.duration}s`);
  
  return parts.filter(Boolean).join('. ');
}

// ============================================================================
// Camera Movement Descriptions
// ============================================================================

function getCameraMoveEN(move: CameraMove): string {
  const descriptions: Record<CameraMove, string> = {
    'static': 'Static shot',
    'pan_left': 'Camera pans smoothly to the left',
    'pan_right': 'Camera pans smoothly to the right',
    'pan_up': 'Camera tilts upward',
    'pan_down': 'Camera tilts downward',
    'zoom_in': 'Slow zoom in on the subject',
    'zoom_out': 'Camera zooms out to reveal the scene',
    'dolly_in': 'Dolly shot moving toward the subject',
    'dolly_out': 'Dolly shot pulling back from the subject',
    'orbit_left': 'Camera orbits around the subject to the left',
    'orbit_right': 'Camera orbits around the subject to the right',
    'crane_up': 'Crane shot rising upward',
    'crane_down': 'Crane shot descending',
    'follow': 'Camera follows the subject',
    'handheld': 'Handheld camera movement',
  };
  return descriptions[move] || '';
}

function getCameraMoveCN(move: CameraMove): string {
  const descriptions: Record<CameraMove, string> = {
    'static': '固定镜头',
    'pan_left': '镜头左摇',
    'pan_right': '镜头右摇',
    'pan_up': '镜头上摇',
    'pan_down': '镜头下摇',
    'zoom_in': '镜头推进',
    'zoom_out': '镜头拉远',
    'dolly_in': '推轨镜头',
    'dolly_out': '拉轨镜头',
    'orbit_left': '左环绕镜头',
    'orbit_right': '右环绕镜头',
    'crane_up': '升镜头',
    'crane_down': '降镜头',
    'follow': '跟随镜头',
    'handheld': '手持镜头',
  };
  return descriptions[move] || '';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer mood from script content
 */
export function inferMood(scriptContent: string): string {
  const text = scriptContent.toLowerCase();
  
  if (text.includes('紧张') || text.includes('对峙') || text.includes('惊') || text.includes('恐惧')) {
    return '紧张悬疑';
  }
  if (text.includes('温馨') || text.includes('拥抱') || text.includes('笑') || text.includes('幸福')) {
    return '温馨治愈';
  }
  if (text.includes('战斗') || text.includes('攻击') || text.includes('冲突') || text.includes('打斗')) {
    return '激烈动作';
  }
  if (text.includes('悲伤') || text.includes('哭泣') || text.includes('痛') || text.includes('离别')) {
    return '悲伤沉重';
  }
  if (text.includes('愤怒') || text.includes('怒') || text.includes('仇恨')) {
    return '愤怒压抑';
  }
  if (text.includes('神秘') || text.includes('诡异') || text.includes('奇怪')) {
    return '神秘诡谲';
  }
  if (text.includes('浪漫') || text.includes('爱情') || text.includes('心动')) {
    return '浪漫唯美';
  }
  
  return '日常';
}

/**
 * Extract visual action lines from script content (lines starting with ▲)
 */
export function extractVisualActions(scriptContent: string): string[] {
  if (!scriptContent) return [];
  
  return scriptContent
    .split('\n')
    .filter(line => line.trim().startsWith('▲'))
    .map(line => line.replace(/^▲/, '').trim())
    .filter(Boolean);
}

/**
 * Detect model provider from model name
 */
export function detectModelProvider(modelName: string): VideoModelProvider {
  const name = modelName.toLowerCase();
  
  if (name.includes('veo')) return 'veo';
  if (name.includes('sora')) return 'sora';
  if (name.includes('kling') || name.includes('可灵')) return 'kling';
  if (name.includes('volc') || name.includes('火山') || name.includes('doubao')) return 'volcengine';
  
  return 'generic';
}

/**
 * Build prompt config from panel context
 */
export function buildPromptConfigFromPanel(
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  cameraMove: CameraMove = 'static'
): VideoPromptConfig {
  // Get linked assets
  const linkedAssets = project.assets.filter(a => 
    panel.relatedAssetIds?.includes(a.id)
  );
  
  // Extract characters
  const characters = linkedAssets
    .filter(a => a.type === 'character')
    .map(a => ({
      name: a.name,
      description: a.description,
      action: undefined, // Can be enhanced with character action detection
    }));
  
  // Extract scene
  const sceneAsset = linkedAssets.find(a => a.type === 'scene');
  const scene = sceneAsset ? {
    name: sceneAsset.name,
    description: sceneAsset.description,
    atmosphere: undefined,
  } : panel.scene_name ? {
    name: panel.scene_name,
    description: undefined,
    atmosphere: undefined,
  } : undefined;
  
  // Extract props
  const props = linkedAssets
    .filter(a => a.type === 'item')
    .map(a => a.name);
  
  // Extract visual actions
  const visualActions = extractVisualActions(panel.script_content || '');
  
  // Get style
  const style = project.activeStyle ? {
    name: project.activeStyle.name,
    prompt: project.activeStyle.prompt,
  } : undefined;
  
  // Get aspect ratio from settings
  const aspectRatio = settings.veoAspectRatio || '16:9';
  
  // Infer mood
  const mood = inferMood(panel.script_content || '');
  
  // Detect model provider
  const modelProvider = detectModelProvider(settings.veoModel || 'veo3.1');
  
  // Calculate duration from shot durations or default
  const duration = panel.shotDurations?.reduce((sum, d) => sum + d, 0) || 8;
  
  return {
    modelProvider,
    characters,
    scene,
    props: props.length > 0 ? props : undefined,
    visualActions,
    style,
    aspectRatio,
    duration,
    cameraMove,
    mood,
  };
}

/**
 * Generate formatted prompt for display (with sections)
 */
export function generateFormattedPrompt(config: VideoPromptConfig): string {
  const sections: string[] = [];
  
  // Characters section
  if (config.characters.length > 0) {
    const charList = config.characters.map(c => {
      if (c.description) {
        return `${c.name} (${c.description})`;
      }
      return c.name;
    }).join(', ');
    sections.push(`Characters: ${charList}`);
  }
  
  // Scene section
  if (config.scene) {
    let sceneText = `Setting: ${config.scene.name}`;
    if (config.scene.description) {
      sceneText += ` - ${config.scene.description}`;
    }
    sections.push(sceneText);
  }
  
  // Props section
  if (config.props && config.props.length > 0) {
    sections.push(`Props: ${config.props.join(', ')}`);
  }
  
  // Visual actions section
  if (config.visualActions.length > 0) {
    config.visualActions.forEach((action, idx) => {
      sections.push(`Shot ${idx + 1}: ${action}`);
    });
  }
  
  // Camera movement
  const cameraOption = CAMERA_MOVES.find(c => c.value === config.cameraMove);
  if (cameraOption && config.cameraMove !== 'static') {
    sections.push(`Camera: ${cameraOption.labelEN} (${cameraOption.labelCN})`);
  }
  
  // Style
  if (config.style) {
    sections.push(`Style: ${config.style.name}`);
  }
  
  // Mood
  if (config.mood) {
    sections.push(`Mood: ${config.mood}`);
  }
  
  // Technical specs
  sections.push(`Aspect Ratio: ${config.aspectRatio}`);
  sections.push(`Duration: ${config.duration}s`);
  
  return sections.join('\n');
}

// ============================================================================
// All Models Prompt Builder
// ============================================================================

export interface AllModelPrompts {
  veo: {
    name: string;
    icon: string;
    color: string;
    prompt: string;
  };
  sora: {
    name: string;
    icon: string;
    color: string;
    prompt: string;
  };
  kling: {
    name: string;
    icon: string;
    color: string;
    prompt: string;
  };
  volcengine: {
    name: string;
    icon: string;
    color: string;
    prompt: string;
  };
}

/**
 * Build prompts for all video models at once
 * Useful for previewing and comparing different model outputs
 */
export function buildAllModelPrompts(config: VideoPromptConfig): AllModelPrompts {
  // Create configs for each model
  const veoConfig = { ...config, modelProvider: 'veo' as VideoModelProvider };
  const soraConfig = { ...config, modelProvider: 'sora' as VideoModelProvider };
  const klingConfig = { ...config, modelProvider: 'kling' as VideoModelProvider };
  const volcConfig = { ...config, modelProvider: 'volcengine' as VideoModelProvider };
  
  return {
    veo: {
      name: 'Veo 3.1 (Google)',
      icon: '🔵',
      color: 'blue',
      prompt: buildVeoPrompt(veoConfig)
    },
    sora: {
      name: 'Sora (OpenAI)',
      icon: '🟢',
      color: 'green',
      prompt: buildSoraPrompt(soraConfig)
    },
    kling: {
      name: '可灵 (快手)',
      icon: '🟠',
      color: 'orange',
      prompt: buildKlingPrompt(klingConfig)
    },
    volcengine: {
      name: '火山引擎 (字节)',
      icon: '🔴',
      color: 'red',
      prompt: buildVolcEnginePrompt(volcConfig)
    }
  };
}

/**
 * Get model info by provider
 */
export function getModelInfo(provider: VideoModelProvider): { name: string; icon: string; color: string } {
  const info: Record<VideoModelProvider, { name: string; icon: string; color: string }> = {
    veo: { name: 'Veo 3.1', icon: '🔵', color: 'blue' },
    sora: { name: 'Sora', icon: '🟢', color: 'green' },
    kling: { name: '可灵', icon: '🟠', color: 'orange' },
    volcengine: { name: '火山引擎', icon: '🔴', color: 'red' },
    generic: { name: '通用', icon: '⚪', color: 'gray' }
  };
  return info[provider] || info.generic;
}

export default {
  buildVideoPrompt,
  buildPromptConfigFromPanel,
  generateFormattedPrompt,
  buildAllModelPrompts,
  getModelInfo,
  extractVisualActions,
  inferMood,
  detectModelProvider,
  CAMERA_MOVES,
};

