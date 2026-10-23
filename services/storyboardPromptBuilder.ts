/**
 * Storyboard Prompt Builder Service
 * 
 * High-quality anime storyboard image prompt generator
 * Reference styles: Makoto Shinkai, Ufotable (Demon Slayer), Kyoto Animation
 * 
 * Core Visual Standards:
 * 1. Cinematography: Lens language, Depth of Field, Dynamic Angles
 * 2. Lighting: Rim Light, Volumetric/Tyndall Effect, Subsurface Scattering
 * 3. Atmosphere: Particle effects, Weather conditions
 * 4. Quality: 8k, Ray tracing, Detailed textures
 * 5. Tension: Visual imbalance, Motion blur, Exaggerated perspective
 */

import { ScriptPanel, Project, Asset } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ShotRole = 'setup' | 'conflict' | 'resolution';

export type LensType = 
  | '24mm_wide'      // Impact, dramatic
  | '35mm_standard'  // Natural, establishing
  | '50mm_normal'    // Balanced, versatile
  | '85mm_portrait'  // Intimate, emotional
  | '135mm_telephoto'; // Compression, isolation

export type CameraAngle = 
  | 'eye_level'      // Neutral
  | 'low_angle'      // Power, heroic
  | 'high_angle'     // Vulnerability
  | 'dutch_angle'    // Tension, unease
  | 'birds_eye'      // Overview, scale
  | 'worms_eye';     // Dramatic impact

export type LightingStyle = 
  | 'rim_light'           // Edge highlight
  | 'volumetric'          // God rays, fog
  | 'high_contrast'       // Drama
  | 'soft_diffused'       // Gentle, emotional
  | 'dramatic_shadow'     // Noir style
  | 'golden_hour'         // Warm, romantic
  | 'blue_hour'           // Cold, mysterious
  | 'neon_glow';          // Cyberpunk, vibrant

export interface CinematicConfig {
  // Camera parameters
  lens: LensType;
  angle: CameraAngle;
  depthOfField: 'shallow' | 'medium' | 'deep';
  motionBlur: boolean;
  
  // Lighting
  lighting: {
    primary: LightingStyle;
    secondary?: LightingStyle;
    colorTemp: 'warm' | 'neutral' | 'cold';
    intensity: 'low' | 'medium' | 'high';
  };
  
  // Atmosphere
  particles: string[];
  weather?: string;
  timeOfDay?: string;
  
  // Composition & Tension
  composition: string;
  tensionStrategy: string;
}

export interface StoryboardShotConfig {
  role: ShotRole;
  title: string;
  visualDescription: string;
  cinematicConfig: Partial<CinematicConfig>;
  characters: Asset[];
  scene: Asset | null;
  props: Asset[];
  stylePrompt?: string;
}

export interface VisualToneAnalysis {
  tone: string;
  mood: string;
  suggestedParticles: string[];
  suggestedLighting: LightingStyle;
  suggestedColorTemp: 'warm' | 'neutral' | 'cold';
}

// ============================================================================
// Lens Descriptions (for prompt generation)
// ============================================================================

const LENS_DESCRIPTIONS: Record<LensType, string> = {
  '24mm_wide': '24mm wide angle lens, dramatic perspective distortion, expansive field of view',
  '35mm_standard': '35mm lens, natural perspective, cinematic standard',
  '50mm_normal': '50mm lens, balanced composition, true-to-life proportions',
  '85mm_portrait': '85mm portrait lens, beautiful background compression, shallow depth of field',
  '135mm_telephoto': '135mm telephoto lens, compressed perspective, subject isolation'
};

const ANGLE_DESCRIPTIONS: Record<CameraAngle, string> = {
  'eye_level': 'eye level shot, neutral perspective',
  'low_angle': 'low angle shot, heroic framing, powerful presence',
  'high_angle': 'high angle shot, looking down, vulnerability',
  'dutch_angle': 'dutch angle, tilted frame, visual tension and unease',
  'birds_eye': 'birds eye view, overhead shot, establishing scale',
  'worms_eye': 'worms eye view, extreme low angle, dramatic impact'
};

const LIGHTING_DESCRIPTIONS: Record<LightingStyle, string> = {
  'rim_light': 'rim lighting, edge highlight, silhouette definition',
  'volumetric': 'volumetric lighting, god rays, tyndall effect, atmospheric depth',
  'high_contrast': 'high contrast lighting, dramatic shadows, chiaroscuro',
  'soft_diffused': 'soft diffused lighting, gentle shadows, emotional warmth',
  'dramatic_shadow': 'dramatic shadow play, noir lighting, mysterious atmosphere',
  'golden_hour': 'golden hour lighting, warm orange glow, romantic atmosphere',
  'blue_hour': 'blue hour lighting, cold blue tones, melancholic mood',
  'neon_glow': 'neon glow lighting, vibrant colors, cyberpunk aesthetic'
};

const DOF_DESCRIPTIONS: Record<string, string> = {
  'shallow': 'shallow depth of field, beautiful bokeh, subject isolation',
  'medium': 'medium depth of field, balanced focus',
  'deep': 'deep focus, entire scene sharp, environmental storytelling'
};

// ============================================================================
// Shot Role Presets (Setup → Conflict → Resolution)
// ============================================================================

const SHOT_PRESETS: Record<ShotRole, CinematicConfig> = {
  setup: {
    lens: '35mm_standard',
    angle: 'eye_level',
    depthOfField: 'deep',
    motionBlur: false,
    lighting: {
      primary: 'volumetric',
      colorTemp: 'neutral',
      intensity: 'medium'
    },
    particles: ['atmospheric dust', 'ambient particles'],
    composition: 'rule of thirds, establishing shot',
    tensionStrategy: 'environmental context, mood building'
  },
  conflict: {
    lens: '24mm_wide',
    angle: 'dutch_angle',
    depthOfField: 'shallow',
    motionBlur: true,
    lighting: {
      primary: 'high_contrast',
      secondary: 'rim_light',
      colorTemp: 'cold',
      intensity: 'high'
    },
    particles: ['sparks', 'debris', 'energy effects'],
    composition: 'diagonal lines, breaking frame, visual imbalance',
    tensionStrategy: 'dynamic action, exaggerated perspective, peak intensity'
  },
  resolution: {
    lens: '85mm_portrait',
    angle: 'eye_level',
    depthOfField: 'shallow',
    motionBlur: false,
    lighting: {
      primary: 'soft_diffused',
      colorTemp: 'warm',
      intensity: 'medium'
    },
    particles: ['soft light particles', 'gentle dust motes'],
    composition: 'centered subject, golden ratio, intimate framing',
    tensionStrategy: 'emotional focus, stillness, character reaction'
  }
};

// ============================================================================
// Quality Modifiers (Masterpiece Level)
// ============================================================================

const QUALITY_MODIFIERS = [
  'masterpiece',
  'best quality',
  'ultra detailed',
  '8k resolution',
  'ray tracing',
  'cinematic lighting',
  'intricate details',
  'detailed eyes',
  'expressive face'
];

const STYLE_MODIFIERS = [
  'anime style',
  'high-budget anime production',
  'Ufotable quality',
  'Kyoto Animation style',
  'Makoto Shinkai aesthetic',
  'webtoon illustration',
  'dynamic composition'
];

// ============================================================================
// Visual Tone Analysis
// ============================================================================

/**
 * Analyze script content and extract visual tone
 */
export function analyzeVisualTone(scriptContent: string): VisualToneAnalysis {
  const text = scriptContent.toLowerCase();
  
  // Action/Combat detection
  if (text.includes('战斗') || text.includes('攻击') || text.includes('冲突') || 
      text.includes('打斗') || text.includes('爆炸') || text.includes('冲击')) {
    return {
      tone: 'High-Octane Action',
      mood: 'Intense',
      suggestedParticles: ['sparks', 'debris', 'energy particles', 'motion blur trails', 'impact effects'],
      suggestedLighting: 'high_contrast',
      suggestedColorTemp: 'cold'
    };
  }
  
  // Sadness/Melancholy detection
  if (text.includes('悲伤') || text.includes('哭') || text.includes('离别') ||
      text.includes('泪') || text.includes('痛') || text.includes('死')) {
    return {
      tone: 'Melancholic',
      mood: 'Emotional',
      suggestedParticles: ['rain droplets', 'falling leaves', 'dust motes in light', 'tears'],
      suggestedLighting: 'soft_diffused',
      suggestedColorTemp: 'cold'
    };
  }
  
  // Romance/Warmth detection
  if (text.includes('浪漫') || text.includes('爱') || text.includes('温馨') ||
      text.includes('拥抱') || text.includes('微笑') || text.includes('幸福')) {
    return {
      tone: 'Romantic',
      mood: 'Warm',
      suggestedParticles: ['cherry blossoms', 'soft light particles', 'gentle sparkles', 'petals'],
      suggestedLighting: 'golden_hour',
      suggestedColorTemp: 'warm'
    };
  }
  
  // Mystery/Dark detection
  if (text.includes('神秘') || text.includes('诡异') || text.includes('黑暗') ||
      text.includes('阴影') || text.includes('恐惧') || text.includes('诅咒')) {
    return {
      tone: 'Dark Fantasy',
      mood: 'Mysterious',
      suggestedParticles: ['dark mist', 'ethereal glow', 'shadow particles', 'ominous fog'],
      suggestedLighting: 'dramatic_shadow',
      suggestedColorTemp: 'cold'
    };
  }
  
  // Tension/Suspense detection
  if (text.includes('紧张') || text.includes('对峙') || text.includes('威胁') ||
      text.includes('危险') || text.includes('警觉')) {
    return {
      tone: 'Suspenseful',
      mood: 'Tense',
      suggestedParticles: ['floating dust', 'subtle fog', 'ambient particles'],
      suggestedLighting: 'high_contrast',
      suggestedColorTemp: 'cold'
    };
  }
  
  // Power/Heroic detection
  if (text.includes('力量') || text.includes('觉醒') || text.includes('强大') ||
      text.includes('崛起') || text.includes('突破')) {
    return {
      tone: 'Epic Heroic',
      mood: 'Powerful',
      suggestedParticles: ['energy aura', 'light rays', 'power particles', 'wind effects'],
      suggestedLighting: 'volumetric',
      suggestedColorTemp: 'warm'
    };
  }
  
  // Default: Cinematic
  return {
    tone: 'Cinematic',
    mood: 'Neutral',
    suggestedParticles: ['atmospheric dust', 'ambient light particles'],
    suggestedLighting: 'volumetric',
    suggestedColorTemp: 'neutral'
  };
}

/**
 * Infer shot role from visual line index and content
 */
export function inferShotRole(index: number, totalShots: number, content: string): ShotRole {
  // If only one shot, analyze content
  if (totalShots === 1) {
    const text = content.toLowerCase();
    if (text.includes('攻击') || text.includes('冲击') || text.includes('爆发')) {
      return 'conflict';
    }
    return 'setup';
  }
  
  // For 3-shot triptych: Setup → Conflict → Resolution
  if (totalShots === 3) {
    if (index === 0) return 'setup';
    if (index === 1) return 'conflict';
    return 'resolution';
  }
  
  // For 2 shots: Setup → Conflict/Resolution
  if (totalShots === 2) {
    return index === 0 ? 'setup' : 'conflict';
  }
  
  // Default based on index
  const ratio = index / (totalShots - 1);
  if (ratio < 0.33) return 'setup';
  if (ratio < 0.67) return 'conflict';
  return 'resolution';
}

// ============================================================================
// Prompt Building Functions
// ============================================================================

/**
 * Build cinematic prompt string from config
 */
export function buildCinematicPrompt(config: StoryboardShotConfig): string {
  const preset = SHOT_PRESETS[config.role];
  const cinema: CinematicConfig = {
    ...preset,
    ...config.cinematicConfig,
    lighting: {
      ...preset.lighting,
      ...config.cinematicConfig?.lighting
    }
  };
  
  const parts: string[] = [];
  
  // 1. Core visual description (the action/scene)
  if (config.visualDescription) {
    // Clean up the visual description (remove ▲ prefix if present)
    const cleanDesc = config.visualDescription.replace(/^▲\s*/, '').trim();
    parts.push(cleanDesc);
  }
  
  // 2. Character references (from assets)
  if (config.characters.length > 0) {
    const charDescriptions = config.characters.map(c => {
      // Prefer English prompt if available, fallback to description/name
      return c.prompt || c.description || c.name;
    });
    parts.push(charDescriptions.join(', '));
  }
  
  // 3. Scene/Environment (from assets)
  if (config.scene) {
    const sceneDesc = config.scene.prompt || config.scene.description || config.scene.name;
    parts.push(sceneDesc);
  }
  
  // 4. Cinematography - Lens
  parts.push(LENS_DESCRIPTIONS[cinema.lens]);
  
  // 5. Cinematography - Angle
  parts.push(ANGLE_DESCRIPTIONS[cinema.angle]);
  
  // 6. Depth of Field
  parts.push(DOF_DESCRIPTIONS[cinema.depthOfField]);
  
  // 7. Motion blur (for action shots)
  if (cinema.motionBlur) {
    parts.push('motion blur, speed lines, dynamic movement');
  }
  
  // 8. Lighting
  parts.push(LIGHTING_DESCRIPTIONS[cinema.lighting.primary]);
  if (cinema.lighting.secondary) {
    parts.push(LIGHTING_DESCRIPTIONS[cinema.lighting.secondary]);
  }
  
  // Color temperature
  const colorTempDesc: Record<string, string> = {
    'warm': 'warm color palette, golden tones',
    'neutral': 'balanced color temperature',
    'cold': 'cool color palette, blue tones'
  };
  parts.push(colorTempDesc[cinema.lighting.colorTemp]);
  
  // 9. Atmospheric particles
  if (cinema.particles.length > 0) {
    parts.push(cinema.particles.join(', '));
  }
  
  // 10. Weather/Time of day
  if (cinema.weather) {
    parts.push(cinema.weather);
  }
  if (cinema.timeOfDay) {
    parts.push(cinema.timeOfDay);
  }
  
  // 11. Composition
  parts.push(cinema.composition);
  
  // 12. Art style (from project or default)
  if (config.stylePrompt) {
    parts.push(config.stylePrompt);
  }
  
  // 13. Quality modifiers
  parts.push(...QUALITY_MODIFIERS);
  
  // 14. Style modifiers
  parts.push(...STYLE_MODIFIERS);
  
  // Filter empty strings and join
  return parts.filter(p => p && p.trim()).join(', ');
}

/**
 * Build context prompt (shared across all shots in a panel)
 */
export function buildContextPrompt(
  panel: ScriptPanel,
  project: Project
): string {
  // Get linked assets
  const linkedAssets = project.assets.filter(a => 
    (panel.relatedAssetIds || []).includes(a.id)
  );
  
  const characters = linkedAssets.filter(a => a.type === 'character');
  const scenes = linkedAssets.filter(a => a.type === 'scene');
  const items = linkedAssets.filter(a => a.type === 'item');

  const parts: string[] = [];
  
  // 1. Art Style (enhanced)
  if (project.activeStyle) {
    parts.push(`[ART STYLE] ${project.activeStyle.name}: ${project.activeStyle.prompt}, anime style, Ufotable quality, masterpiece, high-budget production`);
  } else {
    parts.push(`[ART STYLE] High-budget anime, Ufotable style, Kyoto Animation quality, masterpiece, best quality`);
  }
  
  // 2. Scene/Environment (enhanced)
  if (scenes.length > 0) {
    const scene = scenes[0];
    const scenePrompt = scene.prompt || scene.description || scene.name;
    parts.push(`[ENVIRONMENT] ${scenePrompt}, volumetric lighting, atmospheric depth, cinematic environment design`);
  } else if (panel.scene_name) {
    parts.push(`[ENVIRONMENT] ${panel.scene_name}, detailed background, atmospheric lighting, environment art`);
  }
  
  // 3. Characters (enhanced with consistency focus)
  if (characters.length > 0) {
    const charDescriptions = characters.map(c => {
      const prompt = c.prompt || c.description || c.name;
      return `${c.name}: ${prompt}`;
    });
    parts.push(`[CHARACTERS] ${charDescriptions.join(' | ')}, detailed eyes, expressive face, consistent character design`);
  } else if (panel.active_characters_str) {
    parts.push(`[CHARACTERS] ${panel.active_characters_str}, detailed eyes, expressive face`);
  }
  
  // 4. Props (if any)
  if (items.length > 0) {
    parts.push(`[PROPS] ${items.map(i => i.prompt || i.name).join(', ')}, detailed textures`);
  } else if (panel.props) {
    parts.push(`[PROPS] ${panel.props}`);
  }
  
  // 5. Technical Quality
  parts.push(`[QUALITY] 8k resolution, ray tracing, intricate details, professional anime production`);
  
  // 6. Cinematic Elements
  parts.push(`[CINEMATOGRAPHY] cinematic composition, professional camera work, dynamic framing`);
  
  return parts.join('\n');
}

/**
 * Build full prompt for a single shot
 */
export function buildShotPrompt(
  panel: ScriptPanel,
  project: Project,
  shotIndex: number,
  customPrompt?: string
): string {
  // Get linked assets
  const linkedAssets = project.assets.filter(a => 
    (panel.relatedAssetIds || []).includes(a.id)
  );
  
  const characters = linkedAssets.filter(a => a.type === 'character');
  const scenes = linkedAssets.filter(a => a.type === 'scene');
  const props = linkedAssets.filter(a => a.type === 'item');
  
  // Parse visual lines from script
  const visualLines = panel.script_content?.split('\n')
    .filter(l => l.trim().startsWith('▲'))
    .map(l => l.replace(/^▲/, '').trim()) || [];
  
  // Get the action description for this shot
  const actionDesc = customPrompt || visualLines[shotIndex] || '';
  
  // Analyze visual tone
  const toneAnalysis = analyzeVisualTone(panel.script_content || '');
  
  // Infer shot role
  const shotRole = inferShotRole(shotIndex, visualLines.length || 3, actionDesc);
  
  // Build shot config
  const shotConfig: StoryboardShotConfig = {
    role: shotRole,
    title: `Shot ${shotIndex + 1}`,
    visualDescription: actionDesc,
    cinematicConfig: {
      particles: toneAnalysis.suggestedParticles,
      lighting: {
        primary: toneAnalysis.suggestedLighting,
        colorTemp: toneAnalysis.suggestedColorTemp,
        intensity: 'high'
      }
    },
    characters,
    scene: scenes[0] || null,
    props,
    stylePrompt: project.activeStyle?.prompt
  };
  
  // Build cinematic prompt
  return buildCinematicPrompt(shotConfig);
}

/**
 * Build prompts for all 3 triptych shots
 */
export function buildTriptychPrompts(
  panel: ScriptPanel,
  project: Project,
  customPrompts?: [string, string, string]
): [string, string, string] {
  return [
    buildShotPrompt(panel, project, 0, customPrompts?.[0]),
    buildShotPrompt(panel, project, 1, customPrompts?.[1]),
    buildShotPrompt(panel, project, 2, customPrompts?.[2])
  ];
}

/**
 * Get shot role label (for UI)
 */
export function getShotRoleLabel(role: ShotRole): { cn: string; en: string; icon: string } {
  const labels: Record<ShotRole, { cn: string; en: string; icon: string }> = {
    setup: { cn: '铺垫/氛围', en: 'Setup', icon: '🎬' },
    conflict: { cn: '冲突/高潮', en: 'Conflict', icon: '⚡' },
    resolution: { cn: '结果/情感', en: 'Resolution', icon: '💫' }
  };
  return labels[role];
}

/**
 * Get available camera presets for a shot role
 */
export function getShotPreset(role: ShotRole): CinematicConfig {
  return { ...SHOT_PRESETS[role] };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  analyzeVisualTone,
  inferShotRole,
  buildCinematicPrompt,
  buildContextPrompt,
  buildShotPrompt,
  buildTriptychPrompts,
  getShotRoleLabel,
  getShotPreset,
  SHOT_PRESETS,
  QUALITY_MODIFIERS,
  STYLE_MODIFIERS,
  LENS_DESCRIPTIONS,
  ANGLE_DESCRIPTIONS,
  LIGHTING_DESCRIPTIONS
};

