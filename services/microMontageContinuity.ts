/**
 * Micro-Montage Continuity Service
 * 
 * Handles cross-panel continuity detection and anchor point management
 * for the three-shot action breakdown (triptych) system.
 * 
 * Key responsibilities:
 * - Locate previous panel based on globalPanelNo
 * - Determine if cross-panel continuity should be used (auto_rule)
 * - Provide continuity anchor sources (prev triptych slot3)
 */

import { ScriptPanel, Project, Volume, WebtoonScript, ContinuityMode } from '../types';

// Debug flag for development
const DEBUG_MICRO_MONTAGE = false;

function log(...args: unknown[]) {
  if (DEBUG_MICRO_MONTAGE) {
    console.log('[MicroMontage]', ...args);
  }
}

/**
 * Result of continuity analysis
 */
export interface ContinuityAnalysisResult {
  shouldUsePrevAnchor: boolean;
  reason: string;
  prevPanel: ScriptPanel | null;
  prevPanelAnchorPath: string | null; // Path to prev triptych slot3
  confidence: number; // 0-1, higher = more confident about continuity
}

export type ShotPromptLanguage = 'bilingual' | 'zh';

/**
 * Scene cut keywords that indicate a scene/time jump
 * When detected, cross-panel continuity should be disabled
 */
const SCENE_CUT_KEYWORDS_CN = [
  '切换', '转场', '与此同时', '回忆', '闪回', '场景切换', '镜头切到',
  '另一边', '此时', '同一时间', '梦境', '幻觉', '过去', '未来',
  '画面转到', '视角切换', '时间流逝', '若干年后', '几天后',
  '黑场', '白场', '淡出', '淡入', '切至', '跳切'
];

const SCENE_CUT_KEYWORDS_EN = [
  'cut to', 'meanwhile', 'flashback', 'flash forward', 'scene change',
  'elsewhere', 'at the same time', 'dream sequence', 'memory',
  'transition', 'fade to', 'dissolve to', 'time lapse', 'years later',
  'days later', 'jump cut', 'smash cut'
];

/**
 * Normalize scene name for comparison
 */
function normalizeSceneName(name: string | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '') // Keep Chinese chars, letters, numbers
    .trim();
}

/**
 * Check if script content contains scene cut keywords
 */
function containsSceneCutKeywords(content: string | undefined): boolean {
  if (!content) return false;
  const lowerContent = content.toLowerCase();
  
  for (const keyword of SCENE_CUT_KEYWORDS_CN) {
    if (content.includes(keyword)) {
      log(`Detected CN cut keyword: "${keyword}"`);
      return true;
    }
  }
  
  for (const keyword of SCENE_CUT_KEYWORDS_EN) {
    if (lowerContent.includes(keyword)) {
      log(`Detected EN cut keyword: "${keyword}"`);
      return true;
    }
  }
  
  return false;
}

/**
 * Parse character string into array of names
 */
function parseCharacters(charStr: string | undefined): string[] {
  if (!charStr) return [];
  return charStr
    .split(/[,，、;；]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

/**
 * Calculate character overlap between two panels
 * Returns a score 0-1
 */
function calculateCharacterOverlap(
  chars1: string[],
  chars2: string[]
): number {
  if (chars1.length === 0 || chars2.length === 0) return 0;
  
  const set1 = new Set(chars1);
  const intersection = chars2.filter(c => set1.has(c));
  const union = new Set([...chars1, ...chars2]);
  
  return intersection.length / union.size; // Jaccard similarity
}

/**
 * Get all panels from project, sorted by globalPanelNo
 */
export function getAllPanelsSorted(project: Project): Array<{
  panel: ScriptPanel;
  volume: Volume;
  script: WebtoonScript;
}> {
  const allPanels: Array<{
    panel: ScriptPanel;
    volume: Volume;
    script: WebtoonScript;
  }> = [];
  
  // Collect all panels from all volumes and scripts
  for (const volume of project.volumes) {
    for (const episodeNum of Object.keys(volume.scriptCache)) {
      const script = volume.scriptCache[Number(episodeNum)];
      if (script?.panels) {
        for (const panel of script.panels) {
          allPanels.push({ panel, volume, script });
        }
      }
    }
  }
  
  // Sort by globalPanelNo (or fallback to panel_id within episode)
  allPanels.sort((a, b) => {
    const aGlobal = a.panel.globalPanelNo ?? (a.volume.order * 10000 + a.script.episode_number * 100 + a.panel.panel_id);
    const bGlobal = b.panel.globalPanelNo ?? (b.volume.order * 10000 + b.script.episode_number * 100 + b.panel.panel_id);
    return aGlobal - bGlobal;
  });
  
  return allPanels;
}

/**
 * Find the previous panel based on globalPanelNo
 */
export function findPreviousPanel(
  currentPanel: ScriptPanel,
  project: Project
): ScriptPanel | null {
  const allPanels = getAllPanelsSorted(project);
  
  // Find current panel index
  const currentIndex = allPanels.findIndex(p => 
    p.panel.panel_id === currentPanel.panel_id &&
    p.panel.globalPanelNo === currentPanel.globalPanelNo
  );
  
  if (currentIndex <= 0) {
    log('No previous panel found (current is first or not found)');
    return null;
  }
  
  return allPanels[currentIndex - 1].panel;
}

/**
 * Get the anchor path from previous panel (triptych slot3)
 */
export function getPrevPanelAnchorPath(prevPanel: ScriptPanel | null): string | null {
  if (!prevPanel) return null;
  
  // Priority: triptych_sources[2] (slot3)
  const triptychSources = prevPanel.triptych_sources;
  if (triptychSources && triptychSources[2] && triptychSources[2].length > 0) {
    log('Using prev triptych slot3 as anchor:', triptychSources[2]);
    return triptychSources[2];
  }
  
  // Fallback: triptych_sources[1] or [0]
  if (triptychSources && triptychSources[1] && triptychSources[1].length > 0) {
    log('Fallback to prev triptych slot2:', triptychSources[1]);
    return triptychSources[1];
  }
  if (triptychSources && triptychSources[0] && triptychSources[0].length > 0) {
    log('Fallback to prev triptych slot1:', triptychSources[0]);
    return triptychSources[0];
  }
  
  // Final fallback: panel imagePath
  if (prevPanel.imagePath && prevPanel.imagePath.length > 0) {
    log('Fallback to prev panel imagePath:', prevPanel.imagePath);
    return prevPanel.imagePath;
  }
  
  log('No anchor path available from previous panel');
  return null;
}

/**
 * Analyze continuity between current panel and previous panel
 * This is the main auto_rule implementation
 */
export function analyzeContinuity(
  currentPanel: ScriptPanel,
  project: Project
): ContinuityAnalysisResult {
  const prevPanel = findPreviousPanel(currentPanel, project);
  
  // No previous panel = no continuity needed
  if (!prevPanel) {
    return {
      shouldUsePrevAnchor: false,
      reason: '这是第一个分镜，无需跨分镜连续性',
      prevPanel: null,
      prevPanelAnchorPath: null,
      confidence: 1.0,
    };
  }
  
  const anchorPath = getPrevPanelAnchorPath(prevPanel);
  
  // Check if anchor is available
  if (!anchorPath) {
    return {
      shouldUsePrevAnchor: false,
      reason: '上一分镜没有可用的末帧图片（请先生成上一分镜的动作分解）',
      prevPanel,
      prevPanelAnchorPath: null,
      confidence: 0.8,
    };
  }
  
  // Check for explicit scene cut in current panel's script
  if (containsSceneCutKeywords(currentPanel.script_content)) {
    return {
      shouldUsePrevAnchor: false,
      reason: '检测到转场/跳切关键词，禁用跨分镜连续性',
      prevPanel,
      prevPanelAnchorPath: anchorPath,
      confidence: 0.9,
    };
  }
  
  // Compare scene names
  const currentScene = normalizeSceneName(currentPanel.scene_name);
  const prevScene = normalizeSceneName(prevPanel.scene_name);
  const sceneMatch = currentScene === prevScene && currentScene.length > 0;
  
  // Compare characters
  const currentChars = parseCharacters(currentPanel.active_characters_str);
  const prevChars = parseCharacters(prevPanel.active_characters_str);
  const charOverlap = calculateCharacterOverlap(currentChars, prevChars);
  
  log('Scene match:', sceneMatch, `(${currentScene} vs ${prevScene})`);
  log('Character overlap:', charOverlap, currentChars, prevChars);
  
  // Decision logic
  let shouldUse = false;
  let reason = '';
  let confidence = 0.5;
  
  if (sceneMatch && charOverlap >= 0.5) {
    // Same scene + significant character overlap = strong continuity
    shouldUse = true;
    reason = `同一场景「${currentPanel.scene_name}」+ 角色重叠度${Math.round(charOverlap * 100)}%，启用跨分镜连续性`;
    confidence = 0.9;
  } else if (sceneMatch) {
    // Same scene only
    shouldUse = true;
    reason = `同一场景「${currentPanel.scene_name}」，启用跨分镜连续性`;
    confidence = 0.7;
  } else if (charOverlap >= 0.8) {
    // High character overlap despite different scene
    shouldUse = true;
    reason = `角色高度重叠(${Math.round(charOverlap * 100)}%)，可能是同一场景的不同视角，启用跨分镜连续性`;
    confidence = 0.6;
  } else {
    // Different scene and low character overlap
    shouldUse = false;
    reason = `场景不同「${prevPanel.scene_name}」→「${currentPanel.scene_name}」且角色重叠度低(${Math.round(charOverlap * 100)}%)，禁用跨分镜连续性`;
    confidence = 0.8;
  }
  
  return {
    shouldUsePrevAnchor: shouldUse,
    reason,
    prevPanel,
    prevPanelAnchorPath: anchorPath,
    confidence,
  };
}

/**
 * Determine if cross-panel continuity should be used
 * Respects manual override (continuityMode) if set
 */
export function shouldUseCrossPanelContinuity(
  panel: ScriptPanel,
  project: Project
): ContinuityAnalysisResult {
  const mode = panel.continuityMode || 'auto';
  
  // Manual overrides
  if (mode === 'on') {
    const prevPanel = findPreviousPanel(panel, project);
    const anchorPath = getPrevPanelAnchorPath(prevPanel);
    return {
      shouldUsePrevAnchor: !!anchorPath,
      reason: anchorPath 
        ? '手动强制启用跨分镜连续性' 
        : '手动强制启用，但上一分镜没有可用锚点',
      prevPanel,
      prevPanelAnchorPath: anchorPath,
      confidence: 1.0,
    };
  }
  
  if (mode === 'off') {
    return {
      shouldUsePrevAnchor: false,
      reason: '手动禁用跨分镜连续性',
      prevPanel: null,
      prevPanelAnchorPath: null,
      confidence: 1.0,
    };
  }
  
  // Auto mode: run analysis
  return analyzeContinuity(panel, project);
}

/**
 * Build the Continuity Contract prompt section
 * This defines the invariants that must be maintained across shots
 */
export function buildContinuityContract(
  panel: ScriptPanel,
  project: Project,
  linkedAssetNames: { characters: string[]; scenes: string[]; props: string[] },
  options?: { language?: ShotPromptLanguage }
): string {
  const language: ShotPromptLanguage = options?.language || 'bilingual';
  const parts: string[] = [];
  const isZhOnly = language === 'zh';
  
  parts.push('[CONTINUITY CONTRACT - INVARIANTS]');
  parts.push(isZhOnly
    ? '以下要素在所有镜头中必须保持完全一致：'
    : '以下要素在所有镜头中必须保持完全一致（must remain IDENTICAL across all shots）：'
  );
  
  // Character consistency
  if (linkedAssetNames.characters.length > 0) {
    parts.push(isZhOnly
      ? `- 角色外观：${linkedAssetNames.characters.join('、')}（脸型/发型/服装/配饰一致）`
      : `- 角色外观：${linkedAssetNames.characters.join('、')}（same face, hair, outfit, accessories）`
    );
  } else if (panel.active_characters_str) {
    parts.push(isZhOnly
      ? `- 角色外观：${panel.active_characters_str}（脸型/发型/服装/配饰一致）`
      : `- 角色外观：${panel.active_characters_str}（same face, hair, outfit, accessories）`
    );
  }
  
  // Scene consistency
  if (linkedAssetNames.scenes.length > 0) {
    parts.push(isZhOnly
      ? `- 场景/地点：${linkedAssetNames.scenes[0]}（环境结构/光源方向/时间段一致）`
      : `- 场景/地点：${linkedAssetNames.scenes[0]}（same environment, lighting direction, time of day）`
    );
  } else if (panel.scene_name) {
    parts.push(isZhOnly
      ? `- 场景/地点：${panel.scene_name}（环境结构/光源方向/时间段一致）`
      : `- 场景/地点：${panel.scene_name}（same environment, lighting direction, time of day）`
    );
  }
  
  // Props consistency
  if (linkedAssetNames.props.length > 0) {
    parts.push(isZhOnly
      ? `- 道具/物件：${linkedAssetNames.props.join('、')}（外观与相对位置一致）`
      : `- 道具/物件：${linkedAssetNames.props.join('、')}（same appearance, position relative to characters）`
    );
  } else if (panel.props) {
    parts.push(isZhOnly
      ? `- 道具/物件：${panel.props}（外观与相对位置一致）`
      : `- 道具/物件：${panel.props}（same appearance, position relative to characters）`
    );
  }
  
  // Axis consistency
  parts.push(isZhOnly
    ? '- 180° 规则：保持一致的屏幕方向与视线关系'
    : '- 180° RULE: Maintain consistent screen direction and eyeline'
  );
  parts.push(isZhOnly
    ? '- 时间连续性：所有镜头发生在同一时间段/同一动作序列中'
    : '- TEMPORAL CONTINUITY: All shots happen in the same moment/sequence'
  );
  
  return parts.join('\n');
}

/**
 * Shot Plan for micro-montage (Wide → Medium → Close)
 */
export const SHOT_PLAN = [
  { index: 0, type: '全景 (WS)', beat: 'Ki', description: '建立镜头：交代场景与角色位置关系（Establishing shot）' },
  { index: 1, type: '中景 (MS)', beat: 'Sho', description: '动作镜头：推进动作与互动（Action shot）' },
  { index: 2, type: '特写 (CU)', beat: 'Ten', description: '情绪/细节落点：表情或关键细节（Close-up payoff）' },
];

/**
 * Single-frame output contract to prevent multi-panel/storyboard-page outputs.
 * IMPORTANT: Keep English constraints for better model compliance.
 */
export const SINGLE_FRAME_FORBIDDEN = [
  'NO multi-panel',
  'NO split-screen',
  'NO storyboard sheet',
  'NO grid',
  'NO collage',
  'NO comic page layout',
  'NO panel borders',
  'NO frames',
  'NO gutters',
  'NO speech bubbles',
  'NO captions',
  'NO subtitles',
  'NO text boxes',
] as const;

export function buildSingleFrameOutputContract(aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'): string {
  const parts: string[] = [];
  parts.push('[OUTPUT]');
  parts.push(`ONE single full-bleed cinematic illustration frame (${aspectRatio}). No on-screen text.`);
  parts.push('[FORBIDDEN]');
  parts.push(SINGLE_FRAME_FORBIDDEN.join(', '));
  return parts.join('\n');
}

/**
 * Build shot-specific prompt with delta-only approach
 */
export function buildShotPrompt(
  shotIndex: number,
  actionDescription: string,
  continuityContract: string
): string {
  const plan = SHOT_PLAN[shotIndex] || SHOT_PLAN[0];
  
  const parts: string[] = [];
  
  // Continuity contract (same for all shots)
  parts.push(continuityContract);
  parts.push('');
  
  // Shot-specific directives (single frame only)
  parts.push(`[SINGLE KEYFRAME - Shot ${shotIndex + 1}]`);
  parts.push(`Shot Type: ${plan.type}`);
  parts.push(`Beat: ${plan.beat} (${plan.description})`);
  parts.push('');
  
  // Delta: only what changes in this shot
  parts.push('[THIS SHOT ACTION]');
  parts.push(actionDescription);
  parts.push('');
  
  // Composition guidance
  parts.push('[COMPOSITION]');
  if (shotIndex === 0) {
    parts.push('- Frame: Full body or environmental wide shot');
    parts.push('- Purpose: Establish location, character positions, and scene atmosphere');
  } else if (shotIndex === 1) {
    parts.push('- Frame: Waist-up or interaction-focused medium shot');
    parts.push('- Purpose: Show action, gesture, and character dynamics');
  } else {
    parts.push('- Frame: Face, hands, or significant object close-up');
    parts.push('- Purpose: Capture emotion, detail, or dramatic emphasis');
  }
  
  parts.push('');
  parts.push(buildSingleFrameOutputContract('16:9'));
  
  return parts.join('\n');
}

