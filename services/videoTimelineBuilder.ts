/**
 * Video Timeline Builder Service
 * 
 * Builds structured timeline configurations from panel data.
 * Converts panel/project/settings into VideoTimelineConfig DSL.
 */

import {
  ScriptPanel,
  Project,
  AppSettings,
  Asset,
  VideoTimelineConfig,
  ShotUnit,
  NarrativeBeat,
  MotionState,
  TimelineMode,
  CameraMove,
  DirectorPlan,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default shot durations based on shot type
 */
const DEFAULT_SHOT_DURATIONS: Record<string, number> = {
  wide: 3.0,      // Wide/establishing shot
  medium: 2.5,    // Medium shot
  close: 2.0,     // Close-up
  extreme_close: 1.5, // Extreme close-up
  default: 2.5,
};

/**
 * Camera move to motion state mapping
 */
const CAMERA_MOTION_MAP: Record<CameraMove, MotionState> = {
  static: 'STATIC',
  pan_left: 'DYNAMIC',
  pan_right: 'DYNAMIC',
  pan_up: 'DYNAMIC',
  pan_down: 'DYNAMIC',
  zoom_in: 'DYNAMIC',
  zoom_out: 'DYNAMIC',
  dolly_in: 'DYNAMIC',
  dolly_out: 'DYNAMIC',
  orbit_left: 'DYNAMIC',
  orbit_right: 'DYNAMIC',
  crane_up: 'DYNAMIC',
  crane_down: 'DYNAMIC',
  follow: 'DYNAMIC',
  handheld: 'DYNAMIC',
};

/**
 * Camera move to camera language mapping
 */
const CAMERA_LANGUAGE_MAP: Record<CameraMove, string> = {
  static: 'locked',
  pan_left: 'pan left',
  pan_right: 'pan right',
  pan_up: 'tilt up',
  pan_down: 'tilt down',
  zoom_in: 'zoom in',
  zoom_out: 'zoom out',
  dolly_in: 'dolly in',
  dolly_out: 'dolly out',
  orbit_left: 'orbit left',
  orbit_right: 'orbit right',
  crane_up: 'crane up',
  crane_down: 'crane down',
  follow: 'follow shot',
  handheld: 'handheld',
};

/**
 * Shot type abbreviations
 */
const SHOT_TYPE_ABBR: Record<string, string> = {
  wide: 'WS',
  medium: 'MS',
  close: 'CU',
  extreme_close: 'ECU',
  full: 'FS',
  establishing: 'ES',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract visual actions (▲ lines) from script content
 */
function extractVisualActions(scriptContent: string | undefined): string[] {
  if (!scriptContent) return [];
  return scriptContent
    .split('\n')
    .filter(line => line.trim().startsWith('▲'))
    .map(line => line.replace(/^▲/, '').trim())
    .slice(0, 3); // Max 3 shots
}

/**
 * Infer shot type from visual action text
 */
function inferShotType(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('全景') || lower.includes('wide') || lower.includes('establishing')) {
    return 'wide';
  }
  if (lower.includes('中景') || lower.includes('medium')) {
    return 'medium';
  }
  if (lower.includes('特写') || lower.includes('close') || lower.includes('detail')) {
    return 'close';
  }
  if (lower.includes('大特写') || lower.includes('extreme')) {
    return 'extreme_close';
  }
  return 'medium'; // Default
}

/**
 * Infer narrative beat based on shot index and total shots
 */
function inferBeat(index: number, totalShots: number): NarrativeBeat {
  if (totalShots <= 2) {
    return index === 0 ? 'Ki' : 'Ketsu';
  }
  if (totalShots === 3) {
    if (index === 0) return 'Ki';
    if (index === 1) return 'Sho';
    return 'Ketsu';
  }
  // 4+ shots: Ki, Sho, Ten, Ketsu pattern
  const ratio = index / (totalShots - 1);
  if (ratio < 0.25) return 'Ki';
  if (ratio < 0.5) return 'Sho';
  if (ratio < 0.75) return 'Ten';
  return 'Ketsu';
}

/**
 * Infer mood from script content
 */
function inferMood(scriptContent: string | undefined): string {
  if (!scriptContent) return 'neutral';
  const lower = scriptContent.toLowerCase();
  
  if (lower.includes('紧张') || lower.includes('危险') || lower.includes('战斗')) {
    return 'tense';
  }
  if (lower.includes('悲伤') || lower.includes('哀愁') || lower.includes('痛苦')) {
    return 'melancholic';
  }
  if (lower.includes('温馨') || lower.includes('浪漫') || lower.includes('幸福')) {
    return 'warm';
  }
  if (lower.includes('神秘') || lower.includes('诡异') || lower.includes('黑暗')) {
    return 'mysterious';
  }
  if (lower.includes('欢快') || lower.includes('喜悦') || lower.includes('庆祝')) {
    return 'joyful';
  }
  return 'neutral';
}

/**
 * Build SUBJECT block from characters
 */
function buildSubjectBlock(characters: Asset[], action: string): string {
  if (characters.length === 0) return '';
  
  const charDescriptions = characters.map(c => {
    const parts = [c.name];
    if (c.description) {
      // Extract key appearance details
      const desc = c.description.slice(0, 100);
      parts.push(desc);
    }
    return parts.join(': ');
  });
  
  return charDescriptions.join('; ');
}

/**
 * Build SCENE block from scene asset
 */
function buildSceneBlock(scene: Asset | undefined, sceneName: string | undefined): string {
  const parts: string[] = [];
  
  if (sceneName) {
    parts.push(sceneName);
  }
  
  if (scene?.description) {
    parts.push(scene.description.slice(0, 150));
  }
  
  return parts.join(' - ') || 'unspecified location';
}

/**
 * Build LIGHT block based on mood and time of day
 */
function buildLightBlock(mood: string, sceneDesc: string | undefined): string {
  const moodLighting: Record<string, string> = {
    tense: 'harsh shadows, high contrast, cold blue key light',
    melancholic: 'soft diffused light, desaturated, golden hour warmth',
    warm: 'warm ambient, soft fill, natural window light',
    mysterious: 'rim lighting, deep shadows, single practical source',
    joyful: 'bright key light, soft shadows, natural daylight',
    neutral: 'balanced three-point lighting',
  };
  
  return moodLighting[mood] || moodLighting.neutral;
}

/**
 * Build GRADE block based on style and mood
 */
function buildGradeBlock(style: { name: string; prompt: string } | undefined, mood: string): string {
  const parts: string[] = [];
  
  if (style) {
    parts.push(style.name);
  }
  
  const moodGrade: Record<string, string> = {
    tense: 'crushed blacks, teal-orange contrast',
    melancholic: 'lifted blacks, desaturated midtones',
    warm: 'golden highlights, soft contrast',
    mysterious: 'deep shadows, selective saturation',
    joyful: 'vibrant colors, lifted shadows',
    neutral: 'natural color, balanced contrast',
  };
  
  parts.push(moodGrade[mood] || moodGrade.neutral);
  parts.push('fine grain'); // Cinematic texture
  
  return parts.join(', ');
}

/**
 * Build CAM tech block
 */
function buildCamTechBlock(shotType: string, cameraMove: CameraMove): string {
  const shotAbbr = SHOT_TYPE_ABBR[shotType] || 'MS';
  const cameraLang = CAMERA_LANGUAGE_MAP[cameraMove] || 'locked';
  
  // Infer focal length based on shot type
  const focalLength: Record<string, string> = {
    wide: '24mm',
    medium: '35mm',
    close: '50mm',
    extreme_close: '85mm',
  };
  
  return `${shotAbbr}, ${focalLength[shotType] || '35mm'}, ${cameraLang}`;
}

/**
 * Build AUDIO block for multimodal hints
 */
function buildAudioBlock(sceneName: string | undefined, mood: string): string {
  const moodAudio: Record<string, string> = {
    tense: 'low rumble, heartbeat, metallic scrapes',
    melancholic: 'wind, distant echoes, muted ambience',
    warm: 'gentle breeze, birds, soft music',
    mysterious: 'cave drip, distant whispers, silence',
    joyful: 'laughter, upbeat tones, crowd murmur',
    neutral: 'ambient room tone',
  };
  
  return moodAudio[mood] || moodAudio.neutral;
}

/**
 * Generate unique shot ID
 */
function generateShotId(): string {
  return `shot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// ============================================================================
// Reference Image Hints
// ============================================================================

/**
 * Micro-Montage reference image hints configuration
 */
export interface MicroMontageRefHints {
  isMicroMontageLayout: boolean;
  hasCrossPanelContinuity: boolean;
}

/**
 * Build reference image hints for a shot based on layout mode
 */
function buildRefImageHints(
  shotIndex: number,
  microMontageHints?: MicroMontageRefHints
): string {
  // Micro-montage layout: top strip (prev continuity) + left triptych + right assets
  if (microMontageHints?.isMicroMontageLayout) {
    const hasPrevStrip = microMontageHints.hasCrossPanelContinuity;
    
    const triptychPanelName = shotIndex === 0 
      ? 'left column top panel (Shot 1: Wide Shot)' 
      : shotIndex === 1 
        ? 'left column middle panel (Shot 2: Medium Shot)' 
        : 'left column bottom panel (Shot 3: Close-Up)';
    
    if (shotIndex === 0 && hasPrevStrip) {
      // First shot with continuity: reference both prev strip and first triptych panel
      return `top strip (prev panel continuity anchor) + ${triptychPanelName}; maintain visual continuity from prev frame`;
    } else {
      // Other shots or no continuity: reference triptych panel + assets
      return `${triptychPanelName}; right side shows character/scene/prop references`;
    }
  }
  
  // Default: simple triptych layout (line art + assets)
  return shotIndex === 0 ? 'triptych top panel (Wide Shot)' : 
         shotIndex === 1 ? 'triptych middle panel (Medium Shot)' : 
         'triptych bottom panel (Close-Up)';
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build default timeline from panel data
 * @param microMontageHints - Optional hints for micro-montage layout reference images
 */
export function buildDefaultTimeline(
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  microMontageHints?: MicroMontageRefHints
): VideoTimelineConfig {
  // Extract visual actions
  const visualActions = extractVisualActions(panel.script_content);
  
  // If no visual actions, create a single default shot
  if (visualActions.length === 0) {
    visualActions.push(panel.scene_name || '场景展示');
  }
  
  // Get linked assets
  const linkedAssetIds = [...(panel.relatedAssetIds || []), ...(panel.relatedItemIds || [])];
  const linkedAssets = project.assets.filter(a => linkedAssetIds.includes(a.id));
  const characters = linkedAssets.filter(a => a.type === 'character');
  const scenes = linkedAssets.filter(a => a.type === 'scene');
  const props = linkedAssets.filter(a => a.type === 'item');
  
  // Get style
  const style = project.activeStyle ? {
    name: project.activeStyle.name,
    prompt: project.activeStyle.prompt,
  } : undefined;
  
  // Infer mood
  const mood = inferMood(panel.script_content);
  
  // Get camera moves (use panel.cameraMoves if available, otherwise default)
  const cameraMoves: CameraMove[] = (panel as unknown as { cameraMoves?: CameraMove[] }).cameraMoves || 
    ['static', 'dolly_in', 'static'];
  
  // Get shot durations (use panel.shotDurations if available)
  const shotDurations = panel.shotDurations || visualActions.map((_, idx) => {
    const shotType = inferShotType(visualActions[idx]);
    return DEFAULT_SHOT_DURATIONS[shotType] || DEFAULT_SHOT_DURATIONS.default;
  });
  
  // Build shots
  const shots: ShotUnit[] = visualActions.map((action, idx) => {
    const shotType = inferShotType(action);
    const cameraMove = cameraMoves[idx] || 'static';
    const duration = shotDurations[idx] || DEFAULT_SHOT_DURATIONS.default;
    
    return {
      id: generateShotId(),
      index: idx + 1,
      durationSec: duration,
      beat: inferBeat(idx, visualActions.length),
      motionState: CAMERA_MOTION_MAP[cameraMove] || 'STATIC',
      action: action,
      camera: `${CAMERA_LANGUAGE_MAP[cameraMove]} ${SHOT_TYPE_ABBR[shotType] || 'MS'}`,
      subject: buildSubjectBlock(characters, action),
      scene: buildSceneBlock(scenes[0], panel.scene_name),
      light: buildLightBlock(mood, scenes[0]?.description),
      grade: buildGradeBlock(style, mood),
      camTech: buildCamTechBlock(shotType, cameraMove),
      audio: buildAudioBlock(panel.scene_name, mood),
      refImageHints: buildRefImageHints(idx, microMontageHints),
    };
  });
  
  // Calculate durations
  const contentDuration = shots.reduce((sum, s) => sum + s.durationSec, 0);
  const blackoutDuration = 1.0; // Default 1s blackout
  const totalDuration = contentDuration + blackoutDuration;
  
  // Build timeline config
  const timeline: VideoTimelineConfig = {
    title: panel.scene_name || `Panel #${panel.panel_id}`,
    totalDurationSec: totalDuration,
    contentDurationSec: contentDuration,
    blackoutSec: blackoutDuration,
    aspectRatio: settings.veoAspectRatio || '16:9',
    tempoFactor: mood === 'tense' ? 1.5 : mood === 'joyful' ? 1.2 : 1.0,
    mode: 'standard',
    shots,
    globalGrade: style ? `${style.name} style` : undefined,
    globalLight: buildLightBlock(mood, undefined),
    globalCamTech: 'cinematic depth of field, 2.39:1 aspect feel',
    refImageLayout: linkedAssets.length > 0 
      ? `Reference image contains: line art triptych (left 60%) + asset cards (right 40%): ${linkedAssets.map(a => a.name).join(', ')}`
      : undefined,
  };
  
  return timeline;
}

/**
 * Build timeline from director plan (稳高级自动镜头表)
 */
export function buildCinematicTimelineFromDirectorPlan(
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  plan: DirectorPlan,
  refLayoutDesc?: string
): VideoTimelineConfig {
  const mood = inferMood(panel.script_content);
  const style = project.activeStyle ? {
    name: project.activeStyle.name,
    prompt: project.activeStyle.prompt,
  } : undefined;

  const shots: ShotUnit[] = plan.shots.map((s, idx) => ({
    id: generateShotId(),
    index: idx + 1,
    durationSec: s.durationSec,
    beat: s.beat,
    motionState: s.motion === 'DYNAMIC' ? 'DYNAMIC' : 'STATIC',
    action: s.action,
    camera: s.camera,
    subject: s.subject,
    scene: s.scene,
    light: buildLightBlock(mood, s.scene),
    grade: buildGradeBlock(style, mood),
    camTech: undefined,
    audio: buildAudioBlock(panel.scene_name, mood),
    refImageHints: `Single reference frame; shot ${s.index}`,
  }));

  const contentDuration = shots.reduce((sum, s) => sum + s.durationSec, 0);
  const blackoutSec = 1.0;

  return {
    title: panel.scene_name || `Panel #${panel.panel_id}`,
    totalDurationSec: contentDuration + blackoutSec,
    contentDurationSec: contentDuration,
    blackoutSec,
    aspectRatio: settings.veoAspectRatio || '16:9',
    tempoFactor: 1.0,
    mode: 'cinematic',
    shots,
    globalGrade: style ? `${style.name} style` : undefined,
    globalLight: buildLightBlock(mood, undefined),
    globalCamTech: 'cinematic depth of field, 2.39:1 aspect feel',
    refImageLayout: refLayoutDesc || 'Single combined reference frame (no grid, no collage)',
  };
}

/**
 * Update timeline shot durations
 */
export function updateShotDurations(
  timeline: VideoTimelineConfig,
  newDurations: number[]
): VideoTimelineConfig {
  const updatedShots = timeline.shots.map((shot, idx) => ({
    ...shot,
    durationSec: newDurations[idx] ?? shot.durationSec,
  }));
  
  const contentDuration = updatedShots.reduce((sum, s) => sum + s.durationSec, 0);
  
  return {
    ...timeline,
    shots: updatedShots,
    contentDurationSec: contentDuration,
    totalDurationSec: contentDuration + timeline.blackoutSec,
  };
}

/**
 * Update single shot
 */
export function updateShot(
  timeline: VideoTimelineConfig,
  shotId: string,
  updates: Partial<ShotUnit>
): VideoTimelineConfig {
  const updatedShots = timeline.shots.map(shot => 
    shot.id === shotId ? { ...shot, ...updates } : shot
  );
  
  const contentDuration = updatedShots.reduce((sum, s) => sum + s.durationSec, 0);
  
  return {
    ...timeline,
    shots: updatedShots,
    contentDurationSec: contentDuration,
    totalDurationSec: contentDuration + timeline.blackoutSec,
  };
}

/**
 * Add a new shot to timeline
 */
export function addShot(
  timeline: VideoTimelineConfig,
  shot: Omit<ShotUnit, 'id' | 'index'>
): VideoTimelineConfig {
  const newShot: ShotUnit = {
    ...shot,
    id: generateShotId(),
    index: timeline.shots.length + 1,
  };
  
  const updatedShots = [...timeline.shots, newShot];
  const contentDuration = updatedShots.reduce((sum, s) => sum + s.durationSec, 0);
  
  return {
    ...timeline,
    shots: updatedShots,
    contentDurationSec: contentDuration,
    totalDurationSec: contentDuration + timeline.blackoutSec,
  };
}

/**
 * Remove a shot from timeline
 */
export function removeShot(
  timeline: VideoTimelineConfig,
  shotId: string
): VideoTimelineConfig {
  const updatedShots = timeline.shots
    .filter(shot => shot.id !== shotId)
    .map((shot, idx) => ({ ...shot, index: idx + 1 }));
  
  const contentDuration = updatedShots.reduce((sum, s) => sum + s.durationSec, 0);
  
  return {
    ...timeline,
    shots: updatedShots,
    contentDurationSec: contentDuration,
    totalDurationSec: contentDuration + timeline.blackoutSec,
  };
}

// ============================================================================
// Prompt Export Functions
// ============================================================================

/**
 * Export timeline to Sora-style pseudo-code prompt
 * Format: [#n duration] ACTION:{...} ; CAMERA:{...} — [MOTION] (Beat)
 *         | SUBJECT:{...} | SCENE:{...} | LIGHT:{...} | GRADE:{...} | CAM:{...} | AUDIO:{...}
 */
export function exportTimelineToSoraPrompt(timeline: VideoTimelineConfig): string {
  const lines: string[] = [];
  
  // Global metadata header
  lines.push(`# ${timeline.title.toUpperCase()}`);
  lines.push(`## Structure (variable cut durations; total ${timeline.totalDurationSec.toFixed(1)}s; content ${timeline.contentDurationSec.toFixed(2)}s + ${timeline.blackoutSec.toFixed(2)}s blackout; mode:${timeline.mode}; tempo_factor:${timeline.tempoFactor.toFixed(1)})`);
  lines.push('');
  
  // Reference image contract (if available)
  if (timeline.refImageLayout) {
    lines.push(`## Reference Image: ${timeline.refImageLayout}`);
    lines.push('');
  }
  
  // Global overrides (if any)
  if (timeline.globalGrade || timeline.globalLight || timeline.globalCamTech) {
    lines.push('## Global Settings');
    if (timeline.globalGrade) lines.push(`  GRADE: ${timeline.globalGrade}`);
    if (timeline.globalLight) lines.push(`  LIGHT: ${timeline.globalLight}`);
    if (timeline.globalCamTech) lines.push(`  CAM: ${timeline.globalCamTech}`);
    lines.push('');
  }
  
  lines.push('## Timeline');
  lines.push('');
  
  // Shots
  timeline.shots.forEach(shot => {
    // Main line: [#n duration] ACTION:{} ; CAMERA:{} — [MOTION] /* Beat */
    const mainLine = ` - [ #${shot.index} ${shot.durationSec.toFixed(2)}s ] ACTION:{${shot.action}} ; CAMERA:{${shot.camera}} — [${shot.motionState}] /* ${shot.beat} */`;
    lines.push(mainLine);
    
    // Parameter blocks
    const params: string[] = [];
    if (shot.subject) params.push(`SUBJECT:{${shot.subject}}`);
    if (shot.scene) params.push(`SCENE:{${shot.scene}}`);
    if (shot.light) params.push(`LIGHT:{${shot.light}}`);
    if (shot.grade) params.push(`GRADE:{${shot.grade}}`);
    if (shot.camTech) params.push(`CAM:{${shot.camTech}}`);
    if (shot.audio) params.push(`AUDIO:{${shot.audio}}`);
    
    if (params.length > 0) {
      lines.push(`   | ${params.join(' | ')}`);
    }
    
    // Reference image hint
    if (shot.refImageHints) {
      lines.push(`   | REF:{${shot.refImageHints}}`);
    }
    
    lines.push('');
  });
  
  // End marker
  lines.push(`## END — ${timeline.blackoutSec.toFixed(1)}s blackout/fade`);
  
  return lines.join('\n');
}

/**
 * Export timeline to Veo-style cinematic prompt
 * More natural language, but structured with clear sections
 */
export function exportTimelineToVeoPrompt(timeline: VideoTimelineConfig): string {
  const sections: string[] = [];
  
  // Title and overview
  sections.push(`**${timeline.title}**`);
  sections.push('');
  sections.push(`Cinematic sequence, ${timeline.aspectRatio} aspect ratio, ${timeline.contentDurationSec.toFixed(0)} seconds of dynamic storytelling.`);
  sections.push('');
  
  // Reference image description
  if (timeline.refImageLayout) {
    sections.push(`**Reference Image Layout:**`);
    sections.push(timeline.refImageLayout);
    sections.push('');
  }
  
  // Global style
  if (timeline.globalGrade || timeline.globalLight) {
    sections.push('**Visual Style:**');
    if (timeline.globalGrade) sections.push(`Color grading: ${timeline.globalGrade}`);
    if (timeline.globalLight) sections.push(`Lighting: ${timeline.globalLight}`);
    if (timeline.globalCamTech) sections.push(`Camera: ${timeline.globalCamTech}`);
    sections.push('');
  }
  
  // Shot breakdown
  sections.push('**Shot Breakdown:**');
  sections.push('');
  
  timeline.shots.forEach((shot, idx) => {
    const beatLabel = {
      'Ki': 'Introduction',
      'Sho': 'Development',
      'Ten': 'Turning Point',
      'Ketsu': 'Resolution',
    }[shot.beat];
    
    // Shot header
    sections.push(`**Shot ${shot.index}** (${shot.durationSec.toFixed(1)}s) — ${beatLabel}`);
    
    // Action description (natural language)
    sections.push(`${shot.action}.`);
    
    // Camera movement
    const motionDesc = shot.motionState === 'STATIC' ? 'Static shot' : 'Dynamic camera movement';
    sections.push(`Camera: ${shot.camera}. ${motionDesc}.`);
    
    // Subject (if significant)
    if (shot.subject) {
      sections.push(`Subject: ${shot.subject}.`);
    }
    
    // Scene/Environment
    if (shot.scene) {
      sections.push(`Setting: ${shot.scene}.`);
    }
    
    // Lighting and grade combined
    const visualMood: string[] = [];
    if (shot.light) visualMood.push(shot.light);
    if (shot.grade) visualMood.push(shot.grade);
    if (visualMood.length > 0) {
      sections.push(`Visual mood: ${visualMood.join('. ')}.`);
    }
    
    // Reference hint
    if (shot.refImageHints) {
      sections.push(`(Reference: ${shot.refImageHints})`);
    }
    
    sections.push('');
  });
  
  // Ending
  sections.push(`**Ending:** Fade to black over ${timeline.blackoutSec.toFixed(1)} seconds.`);
  
  // Quality modifiers
  sections.push('');
  sections.push('**Quality:** Cinematic lighting, professional color grading, film grain texture, high production value.');
  
  return sections.join('\n');
}

/**
 * Export timeline to generic/simple prompt
 * For models that prefer simpler input
 */
export function exportTimelineToGenericPrompt(timeline: VideoTimelineConfig): string {
  const parts: string[] = [];
  
  parts.push(`${timeline.title} - ${timeline.contentDurationSec.toFixed(0)}s cinematic video, ${timeline.aspectRatio}`);
  parts.push('');
  
  timeline.shots.forEach(shot => {
    parts.push(`Shot ${shot.index} (${shot.durationSec.toFixed(1)}s): ${shot.action}. Camera ${shot.camera}.`);
  });
  
  if (timeline.globalGrade) {
    parts.push('');
    parts.push(`Style: ${timeline.globalGrade}`);
  }
  
  parts.push('');
  parts.push('High quality cinematic video, professional lighting, smooth transitions.');
  
  return parts.join('\n');
}

// ============================================================================
// VolcEngine Seedance 专用提示词 (中文多镜头切换格式)
// ============================================================================

/**
 * 运镜词汇映射：英文 → 火山 Seedance 中文运镜
 */
const CAMERA_MOVE_TO_SEEDANCE_ZH: Record<string, string> = {
  'locked': '镜头固定',
  'static': '镜头固定',
  'pan left': '镜头左摇',
  'pan right': '镜头右摇',
  'tilt up': '镜头上摇',
  'tilt down': '镜头下摇',
  'zoom in': '镜头推进',
  'zoom out': '镜头拉远',
  'dolly in': '镜头前推',
  'dolly out': '镜头后拉',
  'orbit left': '镜头左环绕',
  'orbit right': '镜头右环绕',
  'crane up': '镜头升起',
  'crane down': '镜头降落',
  'follow shot': '镜头跟随',
  'handheld': '手持镜头',
  // 默认
  'default': '镜头缓缓推进',
};

/**
 * 景别映射：英文缩写 → 火山 Seedance 中文景别
 */
const SHOT_TYPE_TO_SEEDANCE_ZH: Record<string, string> = {
  'WS': '远景',
  'FS': '全景',
  'MS': '中景',
  'CU': '近景',
  'ECU': '特写',
  'OTS': '过肩镜头',
  'POV': '主观镜头',
  'INSERT': '插入镜头',
  'SILHOUETTE': '剪影镜头',
  // 默认
  'default': '中景',
};

/**
 * 从 camera 字符串中提取景别
 */
function extractShotTypeFromCamera(camera: string): string {
  const upper = camera.toUpperCase();
  for (const abbr of Object.keys(SHOT_TYPE_TO_SEEDANCE_ZH)) {
    if (upper.includes(abbr)) {
      return SHOT_TYPE_TO_SEEDANCE_ZH[abbr];
    }
  }
  return SHOT_TYPE_TO_SEEDANCE_ZH['default'];
}

/**
 * 从 camera 字符串中提取运镜
 */
function extractCameraMoveFromCamera(camera: string): string {
  const lower = camera.toLowerCase();
  for (const [eng, zh] of Object.entries(CAMERA_MOVE_TO_SEEDANCE_ZH)) {
    if (eng !== 'default' && lower.includes(eng)) {
      return zh;
    }
  }
  return CAMERA_MOVE_TO_SEEDANCE_ZH['default'];
}

/**
 * Export timeline to VolcEngine Seedance prompt format
 * 
 * 火山 Seedance 多镜头格式特点：
 * 1. 使用中文自然语言
 * 2. 用"镜头切换"作为切镜标记
 * 3. 运镜用"镜头推进/镜头右移/镜头环绕"等
 * 4. 末尾追加 --dur/--rs/--cf 参数
 * 
 * 参考图说明：
 * 当使用综合参考图（分镜+资产）时，需要在提示词开头说明：
 * - 参考图用于风格/角色/场景的一致性参考，不是第一帧画面
 */
export function exportTimelineToSeedancePrompt(
  timeline: VideoTimelineConfig,
  options?: {
    duration?: number;
    resolution?: '480p' | '720p' | '1080p';
    cameraFixed?: boolean;
    /** 参考图布局说明（如果是综合参考图） */
    refImageLayoutHint?: string;
  }
): string {
  const lines: string[] = [];
  
  // 0) 参考图说明（如果是综合参考图）
  if (options?.refImageLayoutHint) {
    lines.push(`【参考图说明】${options.refImageLayoutHint}`);
    lines.push('请参考图中的角色外观、服装、场景风格，保持视频中人物和环境的一致性。');
    lines.push('');
  }
  
  // 1) 整体风格与一致性约束
  if (timeline.globalGrade || timeline.globalLight) {
    lines.push('【整体风格】');
    if (timeline.globalGrade) lines.push(`画面风格：${timeline.globalGrade}`);
    if (timeline.globalLight) lines.push(`光影氛围：${timeline.globalLight}`);
    lines.push('人物外观、服装、场景、光影在所有镜头中保持一致。');
    lines.push('');
  }
  
  // 2) 逐镜头描述（用"镜头切换"连接）
  timeline.shots.forEach((shot, idx) => {
    const shotType = extractShotTypeFromCamera(shot.camera);
    const cameraMove = extractCameraMoveFromCamera(shot.camera);
    
    // 镜头开头
    if (idx === 0) {
      // 第一镜头：不需要"镜头切换"前缀
      lines.push(`（第${shot.index}镜头 ${shotType}）`);
    } else {
      // 后续镜头：用"镜头切换"连接
      lines.push(`镜头切换，（第${shot.index}镜头 ${shotType}）`);
    }
    
    // 动作描述
    let actionDesc = shot.action || '';
    
    // 如果 action 是英文，尝试使用 subject/scene 补充中文描述
    if (!/[\u4e00-\u9fa5]/.test(actionDesc) && shot.subject) {
      actionDesc = shot.subject;
    }
    
    // 运镜描述
    if (cameraMove && cameraMove !== '镜头固定') {
      lines.push(`${actionDesc}，${cameraMove}。`);
    } else {
      lines.push(`${actionDesc}。`);
    }
    
    // 场景/主体补充（如果有且不重复）
    if (shot.scene && !actionDesc.includes(shot.scene)) {
      lines.push(`场景：${shot.scene}。`);
    }
  });
  
  // 3) 追加参数（--dur/--rs/--cf）
  const params: string[] = [];
  
  // 分辨率
  const rs = options?.resolution || '720p';
  params.push(`--rs ${rs}`);
  
  // 时长
  const dur = options?.duration || Math.round(timeline.contentDurationSec);
  params.push(`--dur ${dur}`);
  
  // 固定摄像头（多镜头切换时建议 false）
  const cf = options?.cameraFixed !== undefined ? options.cameraFixed : false;
  params.push(`--cf ${cf}`);
  
  lines.push('');
  lines.push(params.join(' '));
  
  return lines.join('\n');
}

/**
 * Build Seedance-optimized reference image description
 * 告诉模型参考图的布局，帮助它理解综合参考图
 */
export function buildSeedanceRefImageDescription(
  hasAssets: boolean,
  hasTriptych: boolean,
  hasPrevContinuity: boolean
): string {
  const parts: string[] = [];
  
  if (hasTriptych) {
    parts.push('图中包含三格分镜线稿（展示动作流程）');
  }
  
  if (hasAssets) {
    parts.push('图中包含角色/场景/道具参考卡片（展示外观细节）');
  }
  
  if (hasPrevContinuity) {
    parts.push('图中包含上一分镜末帧（用于保持连续性）');
  }
  
  if (parts.length === 0) {
    return '';
  }
  
  return parts.join('；') + '。';
}

/**
 * Detect model provider from model name
 */
export function detectModelProviderFromName(modelName: string): 'sora' | 'veo' | 'kling' | 'seedance' | 'generic' {
  const lower = modelName.toLowerCase();
  if (lower.includes('sora')) return 'sora';
  if (lower.includes('veo')) return 'veo';
  if (lower.includes('kling')) return 'kling';
  // 火山 Seedance 模型识别
  if (lower.includes('seedance') || lower.includes('doubao-seedance')) return 'seedance';
  return 'generic';
}

/**
 * Export timeline based on model provider
 */
export function exportTimelinePrompt(
  timeline: VideoTimelineConfig,
  provider: 'sora' | 'veo' | 'kling' | 'seedance' | 'generic',
  seedanceOptions?: {
    duration?: number;
    resolution?: '480p' | '720p' | '1080p';
    cameraFixed?: boolean;
    refImageLayoutHint?: string;
  }
): string {
  switch (provider) {
    case 'sora':
      return exportTimelineToSoraPrompt(timeline);
    case 'veo':
      return exportTimelineToVeoPrompt(timeline);
    case 'seedance':
      return exportTimelineToSeedancePrompt(timeline, seedanceOptions);
    case 'kling':
    case 'generic':
    default:
      return exportTimelineToGenericPrompt(timeline);
  }
}

/**
 * Export prompts for all supported models
 */
export function exportAllTimelinePrompts(
  timeline: VideoTimelineConfig,
  seedanceOptions?: {
    duration?: number;
    resolution?: '480p' | '720p' | '1080p';
    cameraFixed?: boolean;
    refImageLayoutHint?: string;
  }
): {
  sora: string;
  veo: string;
  seedance: string;
  generic: string;
} {
  return {
    sora: exportTimelineToSoraPrompt(timeline),
    veo: exportTimelineToVeoPrompt(timeline),
    seedance: exportTimelineToSeedancePrompt(timeline, seedanceOptions),
    generic: exportTimelineToGenericPrompt(timeline),
  };
}

// Export
export default {
  buildDefaultTimeline,
  updateShotDurations,
  updateShot,
  addShot,
  removeShot,
  exportTimelineToSoraPrompt,
  exportTimelineToVeoPrompt,
  exportTimelineToGenericPrompt,
  exportTimelineToSeedancePrompt,
  exportTimelinePrompt,
  exportAllTimelinePrompts,
  detectModelProviderFromName,
  buildCinematicTimelineFromDirectorPlan,
  buildSeedanceRefImageDescription,
};

