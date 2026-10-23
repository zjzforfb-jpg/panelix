/**
 * Transition Prompt Builder Service
 * 
 * Generates deterministic prompts for 3-segment keyframe-to-keyframe video generation.
 * Each segment transitions from START frame to END frame with smooth motion.
 * 
 * Segments:
 * - Segment 0 (p3-1): Previous panel Shot3 → Current panel Shot1 (cross-panel continuity)
 * - Segment 1 (1-2): Current Shot1 → Shot2
 * - Segment 2 (2-3): Current Shot2 → Shot3
 */

import { ScriptPanel, Project, AppSettings, CameraMove, VideoSegmentKey } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface SegmentConfig {
  segmentKey: VideoSegmentKey;
  startDesc: string;      // Visual description of start frame
  endDesc: string;        // Visual description of end frame
  characters: string;     // Character names and key features
  scene: string;          // Scene/location description
  style: string;          // Art style prompt
  cameraMove: CameraMove; // Camera movement for this segment
  durationSec: number;    // Target duration
}

export interface TransitionPromptResult {
  prompt: string;
  layoutHint: string;     // Description for reference image layout
  segmentKey: VideoSegmentKey;
  durationSec: number;
}

// ============================================================================
// Duration Calculation
// ============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate segment duration based on shot durations
 * Formula: clamp(0.8 + 0.45 * min(d_start, d_end), min, max)
 */
export function calculateSegmentDuration(
  segmentKey: VideoSegmentKey,
  shotDurations: number[] | undefined,
  prevShotDuration?: number
): number {
  const d1 = shotDurations?.[0] ?? 3;
  const d2 = shotDurations?.[1] ?? 2.5;
  const d3 = shotDurations?.[2] ?? 2;
  
  switch (segmentKey) {
    case 'p3-1': {
      // Cross-panel segment: shorter to avoid drift
      const prevD3 = prevShotDuration ?? 2;
      return clamp(0.6 + 0.30 * Math.min(prevD3, d1), 1.2, 2.0);
    }
    case '1-2':
      return clamp(0.8 + 0.45 * Math.min(d1, d2), 1.8, 3.2);
    case '2-3':
      return clamp(0.8 + 0.45 * Math.min(d2, d3), 1.8, 3.2);
    default:
      return 2.5;
  }
}

/**
 * Get default camera move for each segment
 */
export function getDefaultCameraMove(segmentKey: VideoSegmentKey): CameraMove {
  switch (segmentKey) {
    case 'p3-1':
      return 'static'; // Cross-panel: keep stable
    case '1-2':
      return 'dolly_in'; // Approach subject
    case '2-3':
      return 'static'; // Hold for close-up
    default:
      return 'static';
  }
}

// ============================================================================
// Camera Move Descriptions
// ============================================================================

const CAMERA_MOVE_DESC: Record<CameraMove, string> = {
  static: 'locked camera, no movement',
  pan_left: 'smooth pan left',
  pan_right: 'smooth pan right',
  pan_up: 'smooth tilt up',
  pan_down: 'smooth tilt down',
  zoom_in: 'gradual zoom in',
  zoom_out: 'gradual zoom out',
  dolly_in: 'dolly in toward subject',
  dolly_out: 'dolly out from subject',
  orbit_left: 'orbit left around subject',
  orbit_right: 'orbit right around subject',
  crane_up: 'crane shot rising',
  crane_down: 'crane shot descending',
  follow: 'following shot tracking subject',
  handheld: 'subtle handheld movement',
};

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build transition prompt for a single segment
 * Uses deterministic template with strong START/END frame constraints
 */
export function buildTransitionPrompt(config: SegmentConfig): TransitionPromptResult {
  const {
    segmentKey,
    startDesc,
    endDesc,
    characters,
    scene,
    style,
    cameraMove,
    durationSec,
  } = config;
  
  const segmentLabel = segmentKey === 'p3-1' ? 'Cross-Panel Transition' :
                       segmentKey === '1-2' ? 'Shot 1 → Shot 2' :
                       'Shot 2 → Shot 3';
  
  const cameraDesc = CAMERA_MOVE_DESC[cameraMove] || 'smooth camera';
  
  // Build the prompt with strong constraints
  const prompt = `
[SEGMENT: ${segmentLabel}] - ${durationSec.toFixed(1)}s continuous video, 16:9 aspect ratio.

[INVARIANTS - MUST REMAIN IDENTICAL THROUGHOUT]
- Character identity: ${characters || 'maintain consistent appearance'}
- Location/environment: ${scene || 'same setting'}
- Art style: ${style || 'consistent visual style'}
- Screen direction: maintain 180-degree rule
- NO new characters, NO costume changes, NO scene changes, NO text overlay

[START FRAME - must match first_frame reference]
${startDesc}

[END FRAME - must match last_frame reference]
${endDesc}

[MOTION PLAN]
Smoothly animate from START to END state. Interpolate poses, expressions, and positions naturally.
Camera: ${cameraDesc}
Maintain visual continuity - no jump cuts, no morphing artifacts.

[QUALITY]
Cinematic lighting, smooth motion, professional cinematography, high production value.
`.trim();
  
  // Layout hint for reference image
  const layoutHint = `first_frame=${segmentKey.split('-')[0] === 'p3' ? 'prev_shot3' : 'shot' + segmentKey.split('-')[0]}, last_frame=shot${segmentKey.split('-')[1]}`;
  
  return {
    prompt,
    layoutHint,
    segmentKey,
    durationSec,
  };
}

// ============================================================================
// Extract Visual Descriptions
// ============================================================================

/**
 * Extract visual description for a specific shot index (1, 2, or 3)
 * Priority: panel.shots[idx].visual > panel.shots[idx].action > ▲ lines > fallback
 */
export function extractShotVisual(
  panel: ScriptPanel,
  shotIndex: 1 | 2 | 3
): string {
  const idx = shotIndex - 1;
  
  // Priority 1: Structured shots data
  if (panel.shots && panel.shots[idx]) {
    const shot = panel.shots[idx];
    if (shot.visual) return shot.visual;
    if (shot.action) return shot.action;
  }
  
  // Priority 2: Parse ▲ lines from script_content
  const visualLines = panel.script_content?.split('\n')
    .filter(line => line.trim().startsWith('▲'))
    .map(line => line.replace(/^▲/, '').trim()) || [];
  
  if (visualLines[idx]) {
    return visualLines[idx];
  }
  
  // Fallback
  return `Shot ${shotIndex} visual`;
}

/**
 * Extract character description from panel's linked assets
 */
export function extractCharacterDesc(panel: ScriptPanel, project: Project): string {
  const linkedIds = [...(panel.relatedAssetIds || []), ...(panel.relatedItemIds || [])];
  const characters = project.assets.filter(
    a => a.type === 'character' && linkedIds.includes(a.id)
  );
  
  if (characters.length === 0) {
    // Fallback to active_characters_str
    return panel.active_characters_str || 'characters';
  }
  
  return characters.map(c => {
    const parts = [c.name];
    if (c.description) {
      // Extract key features (first 80 chars)
      parts.push(`(${c.description.slice(0, 80)})`);
    }
    return parts.join(' ');
  }).join(', ');
}

/**
 * Extract scene description from panel's linked assets or scene_name
 */
export function extractSceneDesc(panel: ScriptPanel, project: Project): string {
  const linkedIds = [...(panel.relatedAssetIds || []), ...(panel.relatedItemIds || [])];
  const scenes = project.assets.filter(
    a => a.type === 'scene' && linkedIds.includes(a.id)
  );
  
  if (scenes.length > 0 && scenes[0].description) {
    return `${scenes[0].name}: ${scenes[0].description.slice(0, 100)}`;
  }
  
  return panel.scene_name || 'scene';
}

// ============================================================================
// Build All Segments
// ============================================================================

export interface AllSegmentsConfig {
  panel: ScriptPanel;
  project: Project;
  settings: AppSettings;
  prevPanelLastShotVisual?: string;  // Visual of previous panel's shot 3
  prevPanelLastShotDuration?: number;
  shouldGenerateSegment0: boolean;    // From continuity analysis
}

export interface AllSegmentsResult {
  segments: TransitionPromptResult[];
  totalDuration: number;
}

/**
 * Build prompts for all applicable segments
 */
export function buildAllSegmentPrompts(config: AllSegmentsConfig): AllSegmentsResult {
  const {
    panel,
    project,
    settings,
    prevPanelLastShotVisual,
    prevPanelLastShotDuration,
    shouldGenerateSegment0,
  } = config;
  
  const segments: TransitionPromptResult[] = [];
  const style = project.activeStyle?.prompt || 'cinematic anime style';
  const characters = extractCharacterDesc(panel, project);
  const scene = extractSceneDesc(panel, project);
  
  // Get camera moves from panel (or use defaults)
  const cameraMoves = (panel as unknown as { cameraMoves?: CameraMove[] }).cameraMoves || [];
  
  // Segment 0: prev3 → 1 (only if continuity enabled)
  if (shouldGenerateSegment0 && prevPanelLastShotVisual) {
    const duration = calculateSegmentDuration('p3-1', panel.shotDurations, prevPanelLastShotDuration);
    segments.push(buildTransitionPrompt({
      segmentKey: 'p3-1',
      startDesc: prevPanelLastShotVisual,
      endDesc: extractShotVisual(panel, 1),
      characters,
      scene,
      style,
      cameraMove: 'static', // Cross-panel always stable
      durationSec: duration,
    }));
  }
  
  // Segment 1: 1 → 2
  const duration1 = calculateSegmentDuration('1-2', panel.shotDurations);
  segments.push(buildTransitionPrompt({
    segmentKey: '1-2',
    startDesc: extractShotVisual(panel, 1),
    endDesc: extractShotVisual(panel, 2),
    characters,
    scene,
    style,
    cameraMove: cameraMoves[0] || getDefaultCameraMove('1-2'),
    durationSec: duration1,
  }));
  
  // Segment 2: 2 → 3
  const duration2 = calculateSegmentDuration('2-3', panel.shotDurations);
  segments.push(buildTransitionPrompt({
    segmentKey: '2-3',
    startDesc: extractShotVisual(panel, 2),
    endDesc: extractShotVisual(panel, 3),
    characters,
    scene,
    style,
    cameraMove: cameraMoves[1] || getDefaultCameraMove('2-3'),
    durationSec: duration2,
  }));
  
  const totalDuration = segments.reduce((sum, s) => sum + s.durationSec, 0);
  
  return {
    segments,
    totalDuration,
  };
}

export default {
  buildTransitionPrompt,
  buildAllSegmentPrompts,
  calculateSegmentDuration,
  getDefaultCameraMove,
  extractShotVisual,
  extractCharacterDesc,
  extractSceneDesc,
};

