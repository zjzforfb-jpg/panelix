import { 
  AppSettings, 
  PlotBreakdown, 
  WebtoonScript, 
  AlignerReport, 
  BreakdownReport,
  Asset, 
  NovelStyle, 
  StoryBible, 
  PlotEpisode,
  ScriptPanel,
  PanelShot,
  ShotSize,
  DirectorPlan,
  DirectorPlanShot,
  NarrativeBeat,
  Project,
  ExplainPackage,
  ExplainBeat
} from "../types";
import {
  isNanoBananaModel,
  parseNanoBananaModelId,
  convertAspectRatio,
  generateNanoBananaImage,
} from "./nanoBananaService";
import {
  isVolcArkImageModel,
  generateVolcImage,
} from "./volcArkService";

// --- Helper: Robust JSON Cleaning ---
export const cleanJson = (text: string): string => {
  // 1. Remove Markdown fences
  let cleaned = text.replace(/```json\n|```json|```/g, '').trim();
  
  // 2. Extract JSON substring if there is extra text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  // Determine if it looks like an Object or Array and extract the valid part
  if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket !== -1) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }

  // 3. Fix common JSON issues:
  // First, replace smart quotes OUTSIDE of JSON string values
  // We need to be careful not to break valid JSON structure
  
  // 4. Fix unescaped quotes in string values (more robust approach)
  // Strategy: Use a state machine to track string boundaries
  // Key insight: In JSON, a " inside a string value must be escaped as \"
  // We need to distinguish between string delimiters and quotes inside strings
  
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : '';
    const nextChar = i < cleaned.length - 1 ? cleaned[i + 1] : '';
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      // Check if this is a string delimiter or a quote inside a string
      if (inString) {
        // We're inside a string. Check if this quote is followed by : or , or } or ]
        // If so, it's likely a string delimiter. Otherwise, it might be part of the string content.
        // For safety, if we're in a string and see ", we should check context
        const isLikelyDelimiter = /^[\s:,}\]}]/.test(cleaned.substring(i + 1, i + 10));
        if (isLikelyDelimiter) {
          // This is likely the end of the string
          inString = false;
          result += char;
        } else {
          // This is likely a quote inside the string content - escape it
          result += '\\"';
        }
      } else {
        // We're outside a string, so this is the start of a string
        inString = true;
        result += char;
      }
    } else if (inString) {
      // Inside a string value - need to escape problematic characters
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char === '"' || char === '"' || char === '"') {
        // Smart quotes inside string values - escape as regular quote
        result += '\\"';
      } else {
        result += char;
      }
    } else {
      // Outside string values
      // Replace smart quotes with regular quotes
      if (char === '"' || char === '"' || char === '"') {
        result += '"';
      } else if (char === "'" || char === "'" || char === "'") {
        result += "'";
      } else {
        result += char;
      }
    }
  }
  
  cleaned = result;

  // 5. Try to fix common trailing comma issues
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  return cleaned;
};

// ============================================================================
// Asset Prompt Templates (Local Template Filling)
// ============================================================================
// These templates ensure consistent, high-quality prompts for asset generation
// without requiring an additional AI call.

/**
 * Character asset template - 4-view reference sheet for consistency
 * Format: Template prefix + character description (translated/adapted)
 */
const CHARACTER_PROMPT_TEMPLATE = 
  `Character Design Reference Sheet, masterpiece, best quality, professional concept art. ` +
  `2x2 grid layout composition with clear borders: ` +
  `[Top-Left] full body front view with neutral A-pose, ` +
  `[Top-Right] full body side profile view (3/4 angle), ` +
  `[Bottom-Left] full body back view, ` +
  `[Bottom-Right] detailed face close-up portrait showing eyes, nose, mouth, expression details. ` +
  `Same character in all four panels, consistent design, consistent proportions, consistent colors. ` +
  `#FFFFFF pure white background, solid white backdrop, isolated subject, clean studio lighting, no shadows on background, high-key lighting.`;

/**
 * Scene asset template - empty environment without people
 * Format: Template prefix + environment description
 */
const SCENE_PROMPT_TEMPLATE = 
  `Environment concept art, wide shot, cinematic composition, ` +
  `no people, nobody, empty scene, uninhabited, deserted, ` +
  `masterpiece, 8k resolution, cinematic lighting, architectural visualization, ` +
  `establishing shot, location reference.`;

/**
 * Item/prop asset template - single object focus
 * Format: Template prefix + item description
 */
const ITEM_PROMPT_TEMPLATE = 
  `3D Product shot, center composition, isolated item, ` +
  `single object focus, product photography, ` +
  `neutral studio background, clean backdrop, ` +
  `8k resolution, unreal engine 5 render, professional lighting.`;

/**
 * Build a complete asset prompt by combining template + description
 * @param type - Asset type (character/scene/item)
 * @param description - The original description from Writer Agent
 * @returns Complete prompt ready for image generation
 */
const buildAssetPrompt = (type: 'character' | 'scene' | 'item', description: string): string => {
  // Clean up description - remove leading/trailing whitespace
  const cleanDesc = description.trim();
  
  switch (type) {
    case 'character':
      // For characters: template + description
      // The description usually contains Chinese attributes like 【身份】【面部特征】etc
      return `${CHARACTER_PROMPT_TEMPLATE} Character details: ${cleanDesc}`;
    
    case 'scene':
      // For scenes: template + description
      return `${SCENE_PROMPT_TEMPLATE} Scene details: ${cleanDesc}`;
    
    case 'item':
      // For items: template + description
      return `${ITEM_PROMPT_TEMPLATE} Item details: ${cleanDesc}`;
    
    default:
      return cleanDesc;
  }
};

// --- Helper: Generic OpenAI-Compatible Call ---
export async function callOpenAI(
  settings: AppSettings, 
  messages: Array<{ role: string, content: string }>, 
  model: string,
  jsonMode: boolean = false
): Promise<string> {
  // Fallback to process.env.API_KEY if settings.apiKey is empty/missing
  const apiKey = settings.apiKey || process.env.API_KEY;
  let endpoint = settings.apiBaseUrl;

  if (!apiKey) {
    throw new Error("API configuration missing. Please set API Key in Settings or via environment variable.");
  }
  if (!endpoint) {
    throw new Error("API Base URL is missing. Please check Settings.");
  }

  // Robust endpoint construction
  // Remove trailing slash
  endpoint = endpoint.replace(/\/+$/, "");
  // Append path if not present
  if (!endpoint.endsWith("/chat/completions")) {
      endpoint += "/chat/completions";
  }

  const payload: any = {
    model: model,
    messages: messages,
    temperature: 0.7,
    stream: false
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Request Failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("API returned empty content.");
    }

    return content;
  } catch (error: any) {
    console.error("AI Service Error:", error);
    throw new Error(error.message || "Unknown API Error");
  }
}

// --- Visual Translation Service (中文 → 英文) ---

/**
 * Translate Chinese visual description to English for image generation models
 * Uses a lightweight prompt to preserve visual terminology
 */
export async function translateVisualToEnglish(
  visualZh: string,
  settings: AppSettings,
  context?: {
    characterNames?: Map<string, string>; // 中文名 → 英文名
    sceneNames?: Map<string, string>;     // 场景名映射
  }
): Promise<string> {
  if (!visualZh || visualZh.trim().length === 0) {
    return '';
  }
  
  // Build character/scene name hints for consistency
  let nameHints = '';
  if (context?.characterNames && context.characterNames.size > 0) {
    const charLines = Array.from(context.characterNames.entries())
      .map(([zh, en]) => `  - "${zh}" → "${en}"`)
      .join('\n');
    nameHints += `\n**Character Name Mapping:**\n${charLines}`;
  }
  if (context?.sceneNames && context.sceneNames.size > 0) {
    const sceneLines = Array.from(context.sceneNames.entries())
      .map(([zh, en]) => `  - "${zh}" → "${en}"`)
      .join('\n');
    nameHints += `\n**Scene Name Mapping:**\n${sceneLines}`;
  }
  
  const prompt = `You are a professional visual description translator for AI image generation.

**Task:** Translate the following Chinese visual description into English.

**Requirements:**
1. Preserve all visual details (lighting, composition, atmosphere, colors)
2. Keep action descriptions vivid and specific
3. Use standard cinematography terms (wide shot, close-up, medium shot, etc.)
4. Output ONLY the English translation, no explanations
${nameHints}

**Chinese Visual Description:**
${visualZh}

**English Translation:**`;

  try {
    const response = await callOpenAI(
      settings,
      [{ role: "user", content: prompt }],
      settings.writerModel, // Use writer model for consistency
      false
    );
    
    // Clean up response (remove any markdown or extra formatting)
    return response.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[TranslateVisual] Failed to translate:', error);
    // Fallback: return original Chinese (some models can understand it)
    return visualZh;
  }
}

/**
 * Get visual description with automatic language handling
 * - Returns visualEn if available and model prefers English
 * - Returns visualZh if available (source of truth)
 * - Falls back to legacy visual field
 */
export function getVisualDescription(
  panel: { visual?: string; visualZh?: string; visualEn?: string },
  preferEnglish: boolean = false
): string {
  if (preferEnglish && panel.visualEn) {
    return panel.visualEn;
  }
  if (panel.visualZh) {
    return panel.visualZh;
  }
  // Fallback to legacy visual field
  return panel.visual || '';
}

/**
 * Check if a string is primarily Chinese
 */
export function isPrimarilyChinese(text: string): boolean {
  if (!text) return false;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  return chineseChars / totalChars > 0.3; // More than 30% Chinese characters
}

// ============================================================================
// Director Shot Plan (稳高级自动镜头计划)
// ============================================================================

interface DirectorPlanOptions {
  durationSec?: number;
  minShots?: number;
  maxShots?: number;
  mode?: 'stable';
}

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val));

const pickActionLines = (panel: ScriptPanel): string[] => {
  const lines = (panel.script_content || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const visualLines = lines.filter(l => l.startsWith('▲')).map(l => l.replace(/^▲/, '').trim());
  if (visualLines.length >= 1) return visualLines.slice(0, 3);
  // fallback：取前 3 行作为动作摘要
  return lines.slice(0, 3);
};

const buildDeterministicDirectorPlan = (
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  options?: DirectorPlanOptions
): DirectorPlan => {
  const durationSec = options?.durationSec ?? settings.autoVideoPanelDurationSec ?? 10;
  const minShots = options?.minShots ?? settings.autoVideoShotCountMin ?? 6;
  const maxShots = options?.maxShots ?? settings.autoVideoShotCountMax ?? 10;
  const targetShots = clamp(Math.round(durationSec / 1.4), minShots, maxShots);

  const actions = pickActionLines(panel);
  const scene = panel.scene_name || (project.activeStyle?.name ?? '场景');
  const characters = (panel.active_characters_str || '').split(/[,，、]/).filter(Boolean);

  const beatBuckets: NarrativeBeat[] = [];
  const shotsKi = clamp(Math.round(targetShots * 0.2), 1, 2);
  const shotsSho = clamp(Math.round(targetShots * 0.5), 3, targetShots - 2);
  const shotsKetsu = clamp(targetShots - shotsKi - shotsSho, 2, 3);
  const total = shotsKi + shotsSho + shotsKetsu;
  const deficit = targetShots - total;
  // 平衡误差
  const ki = shotsKi + (deficit > 0 ? 1 : 0);
  const sho = shotsSho + (deficit > 1 ? 1 : 0);
  const ketsu = shotsKetsu;

  for (let i = 0; i < ki; i++) beatBuckets.push('Ki');
  for (let i = 0; i < sho; i++) beatBuckets.push('Sho');
  for (let i = 0; i < ketsu; i++) beatBuckets.push('Ketsu');

  // shotType/运镜模板（稳：动镜头不超过2个）
  const shotTypeFor = (idx: number, totalShots: number): DirectorPlanShot['shotType'] => {
    if (idx === 0) return 'WS';
    if (idx === totalShots - 1) return 'CU';
    if (totalShots >= 7 && idx === Math.floor(totalShots / 2)) return 'INSERT';
    return idx >= totalShots - 3 ? 'CU' : 'MS';
  };

  const dynamicSlots = Math.min(2, Math.floor(targetShots / 4));
  const dynamicIndices = new Set<number>();
  for (let i = 1; i < targetShots - 1 && dynamicIndices.size < dynamicSlots; i += 2) {
    dynamicIndices.add(i);
  }

  const cameraText = (shotType: DirectorPlanShot['shotType'], isDynamic: boolean): string => {
    if (!isDynamic) {
      if (shotType === 'WS') return 'locked wide establishing, minimal movement';
      if (shotType === 'CU') return 'locked close-up, focus on emotion';
      return 'locked medium, steady framing';
    }
    if (shotType === 'CU') return 'subtle push-in to face/hands';
    if (shotType === 'WS') return 'gentle dolly in to establish depth';
    return 'slow dolly in / light pan following action';
  };

  const segmentDuration = {
    Ki: durationSec * 0.2,
    Sho: durationSec * 0.5,
    Ketsu: durationSec * 0.3,
  };

  const countBeat = (beat: NarrativeBeat) => beatBuckets.filter(b => b === beat).length || 1;
  const durationForBeat = (beat: NarrativeBeat) => segmentDuration[beat] / countBeat(beat);

  const shots: DirectorPlanShot[] = beatBuckets.map((beat, idx) => {
    const st = shotTypeFor(idx, beatBuckets.length);
    const isDynamic = dynamicIndices.has(idx);
    const actionIdx = beat === 'Ki' ? 0 : beat === 'Sho' ? 1 : 2;
    const action = actions[actionIdx] || actions[0] || panel.script_content || '角色行动';
    return {
      index: idx + 1,
      beat,
      shotType: st,
      durationSec: parseFloat(durationForBeat(beat).toFixed(2)),
      motion: isDynamic ? 'DYNAMIC' : 'STATIC',
      camera: cameraText(st, isDynamic),
      action,
      subject: characters.join('、') || undefined,
      scene,
    };
  });

  return {
    durationSec,
    shotCount: shots.length,
    mode: 'stable_cinematic',
    shots,
    createdAt: Date.now(),
    source: 'deterministic',
  };
};

const refinePlanWithAI = async (
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  draft: DirectorPlan
): Promise<DirectorPlan | null> => {
  const scene = panel.scene_name || '场景';
  const actions = pickActionLines(panel);
  const style = project.activeStyle?.name || '默认风格';
  const prompt = `你是专业影视导演 + AI 视频提示词设计师。
请在保持“稳高级”风格的前提下，精修镜头计划，保持总时长 ${draft.durationSec}s，镜头数在 6-10 之间，运镜克制（动态镜头不超过2个）。

输入：
- 三句微蒙太奇：${actions.join(' / ')}
- 场景：${scene}
- 角色：${panel.active_characters_str || '未提供'}
- 风格：${style}
- 初稿镜头表（JSON）：${JSON.stringify(draft)}

要求：
1) 保持中文为主，如有英文保持简短术语即可。
2) 景别/运镜/时长需专业、连贯，起-承-合有节奏递进。
3) 动态镜头不超过2个，其余保持稳。
4) 必须返回严格 JSON，字段与初稿一致。`;

  try {
    const resp = await callOpenAI(
      settings,
      [{ role: 'user', content: prompt }],
      settings.writerModel,
      true
    );
    const parsed = JSON.parse(cleanJson(resp));
    if (!parsed || !Array.isArray(parsed.shots)) return null;
    const refined: DirectorPlan = {
      durationSec: parsed.durationSec ?? draft.durationSec,
      shotCount: parsed.shots.length,
      mode: 'stable_cinematic',
      shots: parsed.shots.map((s: any, idx: number): DirectorPlanShot => ({
        index: s.index ?? idx + 1,
        beat: (s.beat as NarrativeBeat) || draft.shots[idx]?.beat || 'Ki',
        shotType: s.shotType || draft.shots[idx]?.shotType || 'MS',
        durationSec: s.durationSec ?? draft.shots[idx]?.durationSec ?? 1.2,
        motion: s.motion || (draft.shots[idx]?.motion ?? 'STATIC'),
        camera: s.camera || draft.shots[idx]?.camera || 'locked',
        action: s.action || draft.shots[idx]?.action || '',
        subject: s.subject || draft.shots[idx]?.subject,
        scene: s.scene || draft.shots[idx]?.scene,
      })),
      createdAt: Date.now(),
      source: 'ai_refined',
    };
    refined.shotCount = refined.shots.length;
    return refined;
  } catch (e) {
    console.warn('[DirectorPlan] AI refine failed, fallback to draft', e);
    return null;
  }
};

export const generateDirectorShotPlanFromThreeLines = async (
  panel: ScriptPanel,
  project: Project,
  settings: AppSettings,
  options?: DirectorPlanOptions
): Promise<DirectorPlan> => {
  const draft = buildDeterministicDirectorPlan(panel, project, settings, options);
  const refined = await refinePlanWithAI(panel, project, settings, draft);
  return refined || draft;
};

// --- Agents ---

export const runSplitterAgent = async (text: string, settings: AppSettings, bible?: StoryBible): Promise<PlotBreakdown> => {
  const prompt = `${settings.splitterPrompt}\n\n${bible ? `STORY BIBLE CONTEXT:\n${JSON.stringify(bible)}\n\n` : ''}NOVEL TEXT:\n${text}\n\nIMPORTANT: Return VALID JSON only. Ensure the root object has an "episodes" array.`;
  
  const responseText = await callOpenAI(
    settings, 
    [{ role: "user", content: prompt }], 
    settings.splitterModel, 
    true
  );
  
  try {
      const cleaned = cleanJson(responseText);
      const parsed = JSON.parse(cleaned);

      // --- Normalization Logic ---
      // Case 1: Standard Schema { episodes: [...] }
      if (parsed.episodes && Array.isArray(parsed.episodes)) {
          return parsed as PlotBreakdown;
      }
      
      // Case 2: Direct Array [...] -> Wrap it
      if (Array.isArray(parsed)) {
          return { episodes: parsed } as PlotBreakdown;
      }

      // Case 3: Nested in a random key like { "result": { "episodes": ... } } or { "data": [...] }
      // Try to find the first array value in the object
      const arrayValue = Object.values(parsed).find(v => Array.isArray(v));
      if (arrayValue) {
          return { episodes: arrayValue } as unknown as PlotBreakdown;
      }

      throw new Error("Parsed JSON does not contain a valid 'episodes' array.");

  } catch (e: any) {
      console.error("Splitter Parse Error:", e, "Raw:", responseText);
      throw new Error(`Failed to parse AI response: ${e.message}`);
  }
};

// ============================================================================
// Agent A: Second-Person Explain Agent (第二人称讲解 Agent)
// ============================================================================

/**
 * EXPLAIN_PROMPT - Agent A 专用提示词
 * 
 * 核心职责：
 * 1. 输出"四件套"（novelType/goldenHook/explosiveOpening/plotTwist）
 * 2. 生成第二人称讲解脚本 script[]
 * 3. 切分为 6-10 个 beats，每个 beat 含 narrationZh + turningPoint
 * 4. 生成 sourceSummary 供 Agent B 使用
 */
const EXPLAIN_PROMPT = `# 角色
你是一位顶级小说推文分享博主，擅长用【第二人称】视角将小说内容转化为强代入、高爽感的讲解文案。你的文案字数充足、剧情连贯、代入感极强。

# 核心任务
基于用户提供的小说片段，输出一个完整的讲解包（ExplainPackage）。

# 四件套（必须提取）
1. **novelType**：小说类型（如"规则怪谈"、"系统流"、"玄幻"、"末世"等）
2. **goldenHook**：黄金钩子 —— 一句"规则/警告/禁忌/代价"，极强记忆点（20-50字）
   - 格式示例："千万记住，如果XXX，哪怕YYY也绝对不能ZZZ。"
3. **explosiveOpening**：爆款开头 —— 快速建立场景 + 异常点 + 你的处境（50-100字）
4. **plotTwist**：剧情反转 —— 关键翻转/身份置换/认知悖论/规则陷阱的揭示（30-80字）

# 讲解脚本风格要求
- 全程使用第二人称"你"，不要用"主角/他/她"
- 节奏紧凑、句子有力、画面感强（注意：不是句子短，而是信息密度高）
- 强刺激、高冲突、快反馈（爽感叙事）：危机 → 选择 → 代价 → 升级
- 允许情绪渲染，但不能新增原文不存在的事件
- 开头必须是黄金钩子（可直接复用 goldenHook）
- 中段每 2-3 句至少出现 1 个信息差/反转/升级
- 结尾必须再给一个更狠的钩子（"二次钩子"）

# 内容丰富度要求（极其重要！）
- 每个 beat 的 narrationZh 必须 **60-150 字**，禁止只写一两句话
- 每个 beat 必须包含以下元素中的至少 2 个：
  1. 场景/环境描写（你身处何处，周围有什么）
  2. 角色动作/反应（你做了什么，别人做了什么）
  3. 心理活动/感官描写（你感觉到、你意识到、你看到）
  4. 对话/互动（简短但有信息量的对白）
- script 数组总字数不少于 **800 字**，确保剧情完整连贯
- 每句 script 建议 **40-80 字**，充分展开描述

# Beats 切分规则
- 将脚本切分为 6-10 个 beats（推荐 8 个）
- 每个 beat 代表一个独立的叙事单元，可对应 1 个分镜
- 每个 beat 必须包含：
  - narrationZh：第二人称讲解文本（**60-150字，必须详细展开**）
  - turningPoint：本 beat 的反转点/信息差（必填，10-30字）
  - stakes：爽点描述（危机/资源/规则破局）—— 可选
  - relatedSceneHint：场景提示（供 Agent B 参考）—— 可选
  - relatedCharactersHint：角色提示数组 —— 可选
  - relatedPropsHint：道具提示数组 —— 可选

# 安全约束
- 规避高风险敏感表述（过度血腥、极端仇恨等），用更安全的表达替代
- 技巧/热度是分析，不是剧情事实

# 输出格式（严格 JSON）
{
  "novelType": "string",
  "goldenHook": "string（20-50字）",
  "explosiveOpening": "string（50-100字）",
  "plotTwist": "string（30-80字）",
  "writingTechnique": "string（写作技巧分析）",
  "heatEstimate": "string（热度预估，如 9.5/10）",
  "script": [
    "string（第1句必须是黄金钩子，40-80字）",
    "string（40-80字）",
    "string（40-80字）",
    "...更多句子，总计不少于15句...",
    "string（最后1句必须是更强钩子，40-80字）"
  ],
  "beats": [
    {
      "beatId": "beat_1",
      "narrationZh": "string（第二人称讲解，60-150字，必须详细）",
      "turningPoint": "string（反转点/信息差，10-30字）",
      "stakes": "string（可选）",
      "relatedSceneHint": "string（可选）",
      "relatedCharactersHint": ["string"]（可选）,
      "relatedPropsHint": ["string"]（可选）
    }
  ],
  "sourceSummary": "string（原文摘要，200字以内，供 Agent B 使用）"
}

# 重要
- 只输出 JSON，不要 markdown 代码块
- 不要输出任何解释性文字
- **字数不足会导致生成失败，请确保每个 beat 的 narrationZh 足够详细！**`;

/**
 * Agent A: runExplainAgent
 * 
 * 基于单集 episode + 原文片段输出 ExplainPackage
 * 
 * @param episode - PlotEpisode from splitter
 * @param sourceText - Original novel text (or chunk)
 * @param settings - App settings
 * @returns ExplainPackage
 */
export const runExplainAgent = async (
  episode: PlotEpisode,
  sourceText: string,
  settings: AppSettings
): Promise<ExplainPackage> => {
  const model = settings.explainModel || settings.writerModel;
  const beatsCount = settings.explainBeatsCount || 8;
  
  const prompt = `${EXPLAIN_PROMPT}

# 输入数据
## Episode 信息
${JSON.stringify(episode, null, 2)}

## 原文片段
${sourceText.substring(0, 8000)}${sourceText.length > 8000 ? '\n...(内容过长已截断)' : ''}

# 输出要求
- beats 数量建议: ${beatsCount} 个
- 请基于 episode 的 scenes_summary 和原文内容，生成完整的讲解包
- goldenHook 必须是一句话规则/警告格式
- script 数组长度应与 beats 数量相近或略多

请输出 JSON:`;

  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    model,
    true
  );

  try {
    const cleaned = cleanJson(responseText);
    const parsed = JSON.parse(cleaned);
    
    // Validate required fields
    if (!parsed.novelType || !parsed.goldenHook || !parsed.explosiveOpening || !parsed.plotTwist) {
      throw new Error("Missing required '四件套' fields (novelType/goldenHook/explosiveOpening/plotTwist)");
    }
    
    if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
      throw new Error("Missing or empty 'beats' array");
    }
    
    if (!Array.isArray(parsed.script) || parsed.script.length === 0) {
      throw new Error("Missing or empty 'script' array");
    }
    
    // Normalize beats structure
    const normalizedBeats: ExplainBeat[] = parsed.beats.map((beat: Record<string, unknown>, idx: number) => ({
      beatId: String(beat.beatId || `beat_${idx + 1}`),
      narrationZh: String(beat.narrationZh || ''),
      turningPoint: String(beat.turningPoint || ''),
      stakes: beat.stakes ? String(beat.stakes) : undefined,
      relatedSceneHint: beat.relatedSceneHint ? String(beat.relatedSceneHint) : undefined,
      relatedCharactersHint: Array.isArray(beat.relatedCharactersHint) 
        ? beat.relatedCharactersHint.map(String) 
        : undefined,
      relatedPropsHint: Array.isArray(beat.relatedPropsHint) 
        ? beat.relatedPropsHint.map(String) 
        : undefined,
    }));
    
    const explainPackage: ExplainPackage = {
      novelType: String(parsed.novelType),
      goldenHook: String(parsed.goldenHook),
      explosiveOpening: String(parsed.explosiveOpening),
      plotTwist: String(parsed.plotTwist),
      writingTechnique: parsed.writingTechnique ? String(parsed.writingTechnique) : undefined,
      heatEstimate: parsed.heatEstimate ? String(parsed.heatEstimate) : undefined,
      beats: normalizedBeats,
      script: parsed.script.map(String),
      sourceSummary: String(parsed.sourceSummary || episode.core_conflict || ''),
    };
    
    // Calculate total content length for quality check
    const totalNarrationLength = explainPackage.beats.reduce((sum, b) => sum + (b.narrationZh?.length || 0), 0);
    const totalScriptLength = explainPackage.script.reduce((sum, s) => sum + s.length, 0);
    const avgBeatLength = Math.round(totalNarrationLength / explainPackage.beats.length);
    
    console.log('[ExplainAgent] Generated package:', {
      novelType: explainPackage.novelType,
      beatsCount: explainPackage.beats.length,
      scriptLength: explainPackage.script.length,
      totalNarrationChars: totalNarrationLength,
      totalScriptChars: totalScriptLength,
      avgBeatLength: avgBeatLength,
    });
    
    // Quality warnings
    if (avgBeatLength < 40) {
      console.warn('[ExplainAgent] ⚠️ WARNING: Average beat narration is too short (' + avgBeatLength + ' chars). Expected 60-150 chars per beat.');
    }
    if (totalScriptLength < 500) {
      console.warn('[ExplainAgent] ⚠️ WARNING: Total script length is too short (' + totalScriptLength + ' chars). Expected 800+ chars.');
    }
    
    return explainPackage;
    
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[ExplainAgent] Parse Error:", errorMsg, "Raw:", responseText.substring(0, 500));
    throw new Error(`Failed to parse ExplainAgent response: ${errorMsg}`);
  }
};

// ============================================================================
// Structured Shots Schema Prompt (for enhanced triptych generation)
// ============================================================================
const SHOTS_SCHEMA_PROMPT = `
【ENHANCED OUTPUT: STRUCTURED SHOTS (三镜头结构化输出)】
为每个 panel 输出一个 "shots" 数组，包含固定 3 个对象（对应三张分镜图）。

**shots 数组结构**:
"shots": [
  {
    "index": 1,                           // 固定为 1（全景/建立镜头）
    "dialogue": "string",                 // 该镜头对应的台词（可为空字符串）
    "action": "string",                   // 动作描述（正在发生什么）
    "visual": "string",                   // 视觉描述（用于图像生成）
    "characterAssetIds": ["string"],      // 角色资产ID数组（从 existingAssets 中选取，最多2个）
    "sceneAssetId": "string|null",        // 场景资产ID（从 existingAssets 中选取，或 null）
    "propAssetIds": ["string"],           // 道具资产ID数组（从 existingAssets 中选取，最多3个）
    "shotSize": "WS",                     // 景别: "WS"(全景) | "MS"(中景) | "CU"(特写)
    "composition": "string",              // 构图说明（三分法/居中/前景遮挡等）
    "camera": "string",                   // 机位/角度（平视/俯拍/仰拍/荷兰角等）
    "light": "string",                    // 光影设置（自然光/侧光/逆光/戏剧光等）
    "grade": "string",                    // 调色风格（青橙/暖调/冷调/高对比等）
    "negatives": ["string"]               // 负面提示词（避免生成的内容）
  },
  {
    "index": 2,                           // 固定为 2（中景/动作镜头）
    "shotSize": "MS",
    // ... 其他字段同上
  },
  {
    "index": 3,                           // 固定为 3（特写/情绪镜头）
    "shotSize": "CU",
    // ... 其他字段同上
  }
]

**三镜头逻辑（Ki-Sho-Ketsu 简化版）**:
- Shot 1 (WS/全景): 建立场景，展示环境和角色位置关系
- Shot 2 (MS/中景): 展开动作，表现冲突或互动
- Shot 3 (CU/特写): 情绪落点，聚焦表情或关键细节

**资产绑定规则**:
- characterAssetIds/sceneAssetId/propAssetIds 必须从提供的 existingAssets 列表中选取有效 ID
- 如果没有匹配的资产，留空数组或 null
- 如需新资产，在 characters/scenes 中声明，代码侧会生成 ID 后回填
`;

export const runWriterAgent = async (
  episode: PlotEpisode,
  settings: AppSettings,
  issueText?: string,
  panelCount: number = 8,
  continuityContext?: string,
  existingAssets?: Asset[]
): Promise<{ script: WebtoonScript, newAssets: Asset[] }> => {
  console.log("[WriterAgent] Starting with episode:", episode.episode_number, "Panel count:", panelCount);
  console.log("[WriterAgent] Settings available:", !!settings, "Has API key:", !!settings.apiKey, "Has API base URL:", !!settings.apiBaseUrl);
  console.log("[WriterAgent] Existing assets count:", existingAssets?.length || 0);
  
  let prompt = settings.writerPrompt;
  
  // Add structured shots schema requirement
  prompt += SHOTS_SCHEMA_PROMPT;
  
  // Include existing assets for ID binding
  if (existingAssets && existingAssets.length > 0) {
    const assetsReference = existingAssets.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      prompt: a.prompt?.substring(0, 100) // Truncate long prompts
    }));
    prompt += `\n\n【EXISTING ASSETS (用于 shots 中的资产绑定)】\n${JSON.stringify(assetsReference, null, 2)}`;
    prompt += `\n注意：在 shots 中使用上述资产的 id 进行绑定。如果角色/场景不在列表中，在 characters/scenes 中新增声明。`;
  }
  
  if (continuityContext && continuityContext.trim()) {
    prompt += `\n\n【CONTINUITY CONTEXT (PREVIOUS EPISODE)】\n${continuityContext}\n\n【CONTINUITY REQUIREMENT】\n本集的第1镜必须承接上一集的结尾钩子/动作延续，保持人物关系与场景逻辑一致；禁止突兀跳场或新增未铺垫设定。`;
  }
  prompt += `\n\n【TARGET EPISODE】\nTitle: ${episode.title}\nConflict: ${episode.core_conflict}\nHook: ${episode.hook_type}\nVisual Summary: ${JSON.stringify(episode.scenes_summary)}`;
  if (issueText) {
    prompt += `\n\n【QA ISSUES TO FIX】\n${issueText}`;
  }
  prompt += `\n\n【CONSTRAINT】\nGenerate exactly ${panelCount} key panels.\nEach panel MUST include a "shots" array with exactly 3 shot objects.\nIMPORTANT: Return VALID JSON only.`;

  console.log("[WriterAgent] Prompt length:", prompt.length);

  try {
    const responseText = await callOpenAI(
      settings,
      [{ role: "user", content: prompt }],
      settings.writerModel,
      true
    );

    console.log("[WriterAgent] Raw Response length:", responseText.length);

    let data;
    try {
      const cleanedJson = cleanJson(responseText);
      data = JSON.parse(cleanedJson);
    } catch (e: any) {
      console.error("JSON Parse Error:", e.message, "Raw text:", responseText.substring(0, 500));
      throw new Error(`JSON解析失败: ${e.message}。请检查API响应格式。`);
    }

    // Handle if root is array (Model returned just the list)
    if (Array.isArray(data)) {
        data = { storyboard: data };
        console.log("[WriterAgent] Converted array response to object with storyboard key");
    }

    // Flexible key check for storyboard
    const storyboardData = data.storyboard || data.panels || data.script || [];
    console.log("[WriterAgent] Found storyboard data:", Array.isArray(storyboardData) ? `Array with ${storyboardData.length} panels` : "Empty or not array");

    // Helper: Clean asset name - remove parentheses and their content
    const cleanAssetName = (name: string): string => {
      return name.replace(/[（(][^）)]*[）)]/g, '').trim();
    };

    // Helper: Validate and normalize ShotSize
    const normalizeShotSize = (size: string | undefined): ShotSize => {
      const upper = (size || 'MS').toUpperCase();
      if (upper === 'WS' || upper === 'WIDE' || upper === 'EWS' || upper === 'LS') return 'WS';
      if (upper === 'CU' || upper === 'CLOSE' || upper === 'ECU' || upper === 'BCU') return 'CU';
      return 'MS'; // Default to medium shot
    };

    // Helper: Parse shots array from panel data
    const parseShotsFromPanel = (panelData: any, existingAssets?: Asset[]): [PanelShot, PanelShot, PanelShot] | undefined => {
      if (!panelData.shots || !Array.isArray(panelData.shots) || panelData.shots.length < 3) {
        console.log("[WriterAgent] Panel missing shots array, skipping structured shots");
        return undefined;
      }

      const validAssetIds = new Set(existingAssets?.map(a => a.id) || []);
      
      // Filter asset IDs to only include valid ones from existingAssets
      const filterValidIds = (ids: string[] | undefined): string[] => {
        if (!ids || !Array.isArray(ids)) return [];
        return ids.filter(id => validAssetIds.has(id));
      };

      const validateSceneId = (id: string | null | undefined): string | null => {
        if (!id || !validAssetIds.has(id)) return null;
        return id;
      };

      try {
        const shots = panelData.shots.slice(0, 3).map((shot: any, idx: number): PanelShot => ({
          index: (idx + 1) as 1 | 2 | 3,
          dialogue: shot.dialogue || '',
          action: shot.action || '',
          visual: shot.visual || shot.description || '',
          characterAssetIds: filterValidIds(shot.characterAssetIds || shot.characters),
          sceneAssetId: validateSceneId(shot.sceneAssetId || shot.scene),
          propAssetIds: filterValidIds(shot.propAssetIds || shot.props_ids || []),
          shotSize: normalizeShotSize(shot.shotSize || shot.shot_size),
          composition: shot.composition || '三分法',
          camera: shot.camera || shot.angle || '平视',
          light: shot.light || shot.lighting || '自然光',
          grade: shot.grade || shot.color_grade,
          negatives: Array.isArray(shot.negatives) ? shot.negatives : undefined
        }));

        // Ensure we have exactly 3 shots
        while (shots.length < 3) {
          const idx = shots.length;
          shots.push({
            index: (idx + 1) as 1 | 2 | 3,
            dialogue: '',
            action: '',
            visual: '',
            characterAssetIds: [],
            sceneAssetId: null,
            propAssetIds: [],
            shotSize: idx === 0 ? 'WS' : idx === 1 ? 'MS' : 'CU',
            composition: '居中构图',
            camera: '平视',
            light: '自然光'
          });
        }

        return shots as [PanelShot, PanelShot, PanelShot];
      } catch (e) {
        console.error("[WriterAgent] Failed to parse shots:", e);
        return undefined;
      }
    };

    // Map response to internal types
    const script: WebtoonScript = {
      episode_number: episode.episode_number,
      panels: Array.isArray(storyboardData) ? storyboardData.map((b: any, idx: number) => {
        const panel: ScriptPanel = {
          panel_id: b.id || idx + 1,
          script_content: b.script_content || "",
          duration: b.duration || "5s",
          active_characters_str: b.active_characters || "",
          scene_name: b.scene_name || "Scene",
          props: b.props || "",
          composition: b.composition || "Close-up",
          visual: b.visual || "",
          dialogue: b.dialogue || [],
          // Parse structured shots if available
          shots: parseShotsFromPanel(b, existingAssets)
        };
        return panel;
      }) : []
    };

    console.log("[WriterAgent] Generated script with", script.panels.length, "panels");
    const panelsWithShots = script.panels.filter(p => p.shots && p.shots.length === 3).length;
    console.log("[WriterAgent] Panels with structured shots:", panelsWithShots, "/", script.panels.length);

    // Collect assets with deduplication by cleaned name
    const assetMap = new Map<string, Asset>();
    
    if (data.characters) {
      console.log("[WriterAgent] Found", data.characters.length, "raw characters");
      data.characters.forEach((c: any) => {
        const cleanedName = cleanAssetName(c.name);
        const key = `character:${cleanedName.toLowerCase()}`;
        // Check if this character already exists in existingAssets
        const existingMatch = existingAssets?.find(a => 
          a.type === 'character' && 
          cleanAssetName(a.name).toLowerCase() === cleanedName.toLowerCase()
        );
        if (!existingMatch && !assetMap.has(key)) {
          assetMap.set(key, {
            id: `char_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            type: 'character',
            name: cleanedName,
            description: c.description,
            prompt: buildAssetPrompt('character', c.description), // 4-view template + description
            aspectRatio: '1:1' // Square for 4-view reference sheet
          });
        }
      });
    }
    if (data.scenes) {
      console.log("[WriterAgent] Found", data.scenes.length, "raw scenes");
      data.scenes.forEach((s: any) => {
        const cleanedName = cleanAssetName(s.name);
        const key = `scene:${cleanedName.toLowerCase()}`;
        // Check if this scene already exists in existingAssets
        const existingMatch = existingAssets?.find(a => 
          a.type === 'scene' && 
          cleanAssetName(a.name).toLowerCase() === cleanedName.toLowerCase()
        );
        if (!existingMatch && !assetMap.has(key)) {
          assetMap.set(key, {
            id: `scene_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            type: 'scene',
            name: cleanedName,
            description: s.description,
            prompt: buildAssetPrompt('scene', s.description), // Empty scene template + description
            aspectRatio: '16:9'
          });
        }
      });
    }

    const newAssets = Array.from(assetMap.values());
    console.log("[WriterAgent] Returning", newAssets.length, "unique NEW assets (after dedup, excluding existing)");
    return { script, newAssets };
  } catch (e: any) {
    console.error("[WriterAgent] Unexpected error:", e.message);
    throw new Error(`剧本生成失败: ${e.message}`);
  }
};

// ============================================================================
// Agent B: Storyboard Agent V2 (分镜 Agent - 消费 ExplainPackage)
// ============================================================================

/**
 * STORYBOARD_V2_PROMPT - Agent B 专用提示词
 * 
 * 核心职责：
 * 1. 消费 ExplainPackage（从 Agent A 获取的四件套+beats+script）
 * 2. 输出 WebtoonScript with:
 *    - script_content（三拍子▲，兼容现有系统）
 *    - visualZh（画面轨总结，可画面化）
 *    - narrationZh（第二人称讲解轨，来自 beat 映射）
 *    - shots（强制 3 个 PanelShot，含资产绑定）
 * 3. 确保一致性约束（角色/场景/道具）
 */
const STORYBOARD_V2_PROMPT = `# 角色
你是一位专业的分镜导演，负责将第二人称讲解脚本转化为可执行的分镜结构。

# 核心任务
基于 ExplainPackage（含四件套 + beats + script），生成结构化分镜脚本。

# 双轨输出规则（关键！）
- **narrationZh**（Narration轨）：必须用第二人称"你"，适合口播/字幕，风格生动、爽感、强代入。
- **visualZh** 与 **shots[*].visual**（Visual轨）：必须用"角色真名/外观锚点"来描述画面，**禁止用"你"作为画面主语**。
- **active_characters_str** 必须列出真实角色名（用于资产绑定），**不得写"你"**。

# 一致性硬约束
1. **角色一致性**：每个出现的角色必须给"外观锁定短语"，并在 3 shots 中保持关键 token 不变
2. **场景一致性**：每个 panel 固定一个 scene_name，shots 优先填 sceneAssetId
3. **道具一致性**：props 只列关键 1-3 个，shots 的 propAssetIds 与描述一致
4. **视觉轨禁止用"你"**：视觉轨使用角色真名或"他/她（指代XXX）"

# 三拍子规则 (script_content)
每个 panel 的 script_content 必须包含 3 行，每行以 ▲ 开头：
- ▲[Slot 1: 运镜/景别] [Slot 2: 角色真名+视觉钩子] [Slot 3: 动作+环境音]："台词"
- 示例：▲广角俯视 陆寒玄（战神，浑身浴血） 孤身立于破碎仙宫，四周雷霆肆虐【雷鸣声】。

# shots 结构（强制输出 3 个）
每个 panel 必须输出 shots 数组，包含固定 3 个对象：
- Shot 1 (WS/全景): 建立场景，展示环境和角色位置关系
- Shot 2 (MS/中景): 展开动作，表现冲突或互动
- Shot 3 (CU/特写): 情绪落点，聚焦表情或关键细节

# 输出格式（严格 JSON）
{
  "characters": [
    { "name": "角色名（不带括号后缀）", "description": "外观描述" }
  ],
  "scenes": [
    { "name": "场景名", "description": "环境描述" }
  ],
  "storyboard": [
    {
      "id": 1,
      "duration": "9s",
      "script_content": "▲...\\n▲...\\n▲...",
      "active_characters": "角色A, 角色B",
      "scene_name": "场景名",
      "props": "道具1, 道具2",
      "composition": "构图说明",
      "visualZh": "中文画面总结（可画面化，用角色真名）",
      "narrationZh": "第二人称讲解（用'你'）",
      "shots": [
        {
          "index": 1,
          "dialogue": "台词",
          "action": "动作描述",
          "visual": "画面描述（用角色真名）",
          "characterAssetIds": ["asset_id"],
          "sceneAssetId": "asset_id|null",
          "propAssetIds": [],
          "shotSize": "WS",
          "composition": "三分法",
          "camera": "平视",
          "light": "自然光",
          "grade": "暖调"
        },
        { "index": 2, "shotSize": "MS", ... },
        { "index": 3, "shotSize": "CU", ... }
      ]
    }
  ]
}

# 重要
- 只输出 JSON，不要 markdown 代码块
- 每个 panel 必须有 3 个 shots
- narrationZh 必须第二人称，visualZh/shots.visual 必须用角色真名`;

/**
 * Agent B: runWriterAgentV2
 * 
 * 消费 ExplainPackage + existingAssets，输出完整分镜脚本
 * 支持双轨输出：narrationZh（第二人称） + visualZh（可画面化）
 * 
 * @param episode - PlotEpisode from splitter
 * @param explainPackage - ExplainPackage from Agent A
 * @param settings - App settings
 * @param existingAssets - Existing assets for ID binding
 * @param panelCount - Number of panels to generate (default: beats.length)
 * @returns { script: WebtoonScript, newAssets: Asset[] }
 */
export const runWriterAgentV2 = async (
  episode: PlotEpisode,
  explainPackage: ExplainPackage,
  settings: AppSettings,
  existingAssets?: Asset[],
  panelCount?: number
): Promise<{ script: WebtoonScript, newAssets: Asset[] }> => {
  const targetPanelCount = panelCount || explainPackage.beats.length || 8;
  
  console.log("[WriterAgentV2] Starting with episode:", episode.episode_number);
  console.log("[WriterAgentV2] ExplainPackage beats count:", explainPackage.beats.length);
  console.log("[WriterAgentV2] Target panel count:", targetPanelCount);
  console.log("[WriterAgentV2] Existing assets count:", existingAssets?.length || 0);

  let prompt = STORYBOARD_V2_PROMPT;
  
  // Add structured shots schema
  prompt += SHOTS_SCHEMA_PROMPT;
  
  // Include existing assets for ID binding
  if (existingAssets && existingAssets.length > 0) {
    const assetsReference = existingAssets.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      prompt: a.prompt?.substring(0, 100)
    }));
    prompt += `\n\n【EXISTING ASSETS (用于 shots 中的资产绑定)】\n${JSON.stringify(assetsReference, null, 2)}`;
    prompt += `\n注意：在 shots 中使用上述资产的 id 进行绑定。`;
  }
  
  // Add ExplainPackage context
  prompt += `\n\n【EXPLAIN PACKAGE (来自 Agent A)】\n`;
  prompt += `四件套:\n- novelType: ${explainPackage.novelType}\n- goldenHook: ${explainPackage.goldenHook}\n- explosiveOpening: ${explainPackage.explosiveOpening}\n- plotTwist: ${explainPackage.plotTwist}\n`;
  prompt += `\n摘要: ${explainPackage.sourceSummary}\n`;
  prompt += `\nBeats (${explainPackage.beats.length} 个):\n${JSON.stringify(explainPackage.beats, null, 2)}\n`;
  prompt += `\n第二人称脚本 (${explainPackage.script.length} 句):\n${explainPackage.script.join('\n')}\n`;
  
  // Add episode context
  prompt += `\n\n【TARGET EPISODE】\nTitle: ${episode.title}\nConflict: ${episode.core_conflict}\nHook: ${episode.hook_type}\nVisual Summary: ${JSON.stringify(episode.scenes_summary)}`;
  
  // Constraint
  prompt += `\n\n【CONSTRAINT】\nGenerate exactly ${targetPanelCount} panels.\nEach panel MUST include:\n- narrationZh (第二人称)\n- visualZh (角色真名)\n- shots array with exactly 3 shot objects\nIMPORTANT: Return VALID JSON only.`;

  console.log("[WriterAgentV2] Prompt length:", prompt.length);

  try {
    const responseText = await callOpenAI(
      settings,
      [{ role: "user", content: prompt }],
      settings.writerModel,
      true
    );

    console.log("[WriterAgentV2] Raw Response length:", responseText.length);

    let data;
    try {
      const cleanedJson = cleanJson(responseText);
      data = JSON.parse(cleanedJson);
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[WriterAgentV2] JSON Parse Error:", errorMsg, "Raw text:", responseText.substring(0, 500));
      throw new Error(`JSON解析失败: ${errorMsg}。请检查API响应格式。`);
    }

    // Handle if root is array
    if (Array.isArray(data)) {
      data = { storyboard: data };
    }

    const storyboardData = data.storyboard || data.panels || data.script || [];
    console.log("[WriterAgentV2] Found storyboard data:", Array.isArray(storyboardData) ? `Array with ${storyboardData.length} panels` : "Empty or not array");

    // Helper functions
    const cleanAssetName = (name: string): string => {
      return name.replace(/[（(][^）)]*[）)]/g, '').trim();
    };

    const normalizeShotSize = (size: string | undefined): ShotSize => {
      const upper = (size || 'MS').toUpperCase();
      if (upper === 'WS' || upper === 'WIDE' || upper === 'EWS' || upper === 'LS') return 'WS';
      if (upper === 'CU' || upper === 'CLOSE' || upper === 'ECU' || upper === 'BCU') return 'CU';
      return 'MS';
    };

    const parseShotsFromPanel = (panelData: Record<string, unknown>, assets?: Asset[]): [PanelShot, PanelShot, PanelShot] | undefined => {
      const shotsData = panelData.shots;
      if (!shotsData || !Array.isArray(shotsData) || shotsData.length < 3) {
        return undefined;
      }

      const validAssetIds = new Set(assets?.map(a => a.id) || []);
      
      const filterValidIds = (ids: unknown): string[] => {
        if (!ids || !Array.isArray(ids)) return [];
        return ids.filter((id): id is string => typeof id === 'string' && validAssetIds.has(id));
      };

      const validateSceneId = (id: unknown): string | null => {
        if (typeof id !== 'string' || !validAssetIds.has(id)) return null;
        return id;
      };

      try {
        const shots = shotsData.slice(0, 3).map((shot: Record<string, unknown>, idx: number): PanelShot => ({
          index: (idx + 1) as 1 | 2 | 3,
          dialogue: String(shot.dialogue || ''),
          action: String(shot.action || ''),
          visual: String(shot.visual || shot.description || ''),
          characterAssetIds: filterValidIds(shot.characterAssetIds || shot.characters),
          sceneAssetId: validateSceneId(shot.sceneAssetId || shot.scene),
          propAssetIds: filterValidIds(shot.propAssetIds || shot.props_ids),
          shotSize: normalizeShotSize(shot.shotSize as string),
          composition: String(shot.composition || '三分法'),
          camera: String(shot.camera || shot.angle || '平视'),
          light: String(shot.light || shot.lighting || '自然光'),
          grade: shot.grade ? String(shot.grade) : undefined,
          negatives: Array.isArray(shot.negatives) ? shot.negatives.map(String) : undefined
        }));

        while (shots.length < 3) {
          const idx = shots.length;
          shots.push({
            index: (idx + 1) as 1 | 2 | 3,
            dialogue: '',
            action: '',
            visual: '',
            characterAssetIds: [],
            sceneAssetId: null,
            propAssetIds: [],
            shotSize: idx === 0 ? 'WS' : idx === 1 ? 'MS' : 'CU',
            composition: '居中构图',
            camera: '平视',
            light: '自然光'
          });
        }

        return shots as [PanelShot, PanelShot, PanelShot];
      } catch (e) {
        console.error("[WriterAgentV2] Failed to parse shots:", e);
        return undefined;
      }
    };

    // Map beats to panels for narrationZh
    // Enhanced: if beat narration is too short, concatenate with script sentences for richer content
    const beatToNarration = (idx: number): string => {
      let narration = '';
      
      // Primary: use beat's narrationZh
      if (idx < explainPackage.beats.length) {
        narration = explainPackage.beats[idx].narrationZh || '';
      }
      
      // If narration is too short (< 40 chars), supplement with script sentences
      if (narration.length < 40) {
        // Calculate which script sentences correspond to this panel
        const scriptsPerPanel = Math.max(1, Math.floor(explainPackage.script.length / targetPanelCount));
        const startIdx = idx * scriptsPerPanel;
        const endIdx = Math.min(startIdx + scriptsPerPanel + 1, explainPackage.script.length);
        const supplementScripts = explainPackage.script.slice(startIdx, endIdx).join(' ');
        
        // Combine: if we have some narration, append scripts; otherwise use scripts only
        narration = narration.length > 0 
          ? `${narration} ${supplementScripts}`.trim()
          : supplementScripts;
      }
      
      return narration || '';
    };

    // Build script with narrationZh
    const script: WebtoonScript = {
      episode_number: episode.episode_number,
      panels: Array.isArray(storyboardData) ? storyboardData.map((b: Record<string, unknown>, idx: number) => {
        const panel: ScriptPanel = {
          panel_id: typeof b.id === 'number' ? b.id : idx + 1,
          script_content: String(b.script_content || ""),
          duration: String(b.duration || "9s"),
          active_characters_str: String(b.active_characters || ""),
          scene_name: String(b.scene_name || "Scene"),
          props: String(b.props || ""),
          composition: String(b.composition || "Close-up"),
          visual: String(b.visual || ""),
          visualZh: String(b.visualZh || b.visual || ""),
          dialogue: Array.isArray(b.dialogue) ? b.dialogue.map(String) : [],
          shots: parseShotsFromPanel(b, existingAssets),
          // New: second-person narration track
          narrationZh: String(b.narrationZh || beatToNarration(idx)),
          narrationHook: idx === 0 ? explainPackage.goldenHook : undefined,
        };
        return panel;
      }) : []
    };

    console.log("[WriterAgentV2] Generated script with", script.panels.length, "panels");
    const panelsWithShots = script.panels.filter(p => p.shots && p.shots.length === 3).length;
    const panelsWithNarration = script.panels.filter(p => p.narrationZh && p.narrationZh.length > 0).length;
    console.log("[WriterAgentV2] Panels with structured shots:", panelsWithShots, "/", script.panels.length);
    console.log("[WriterAgentV2] Panels with narrationZh:", panelsWithNarration, "/", script.panels.length);

    // Collect new assets
    const assetMap = new Map<string, Asset>();
    
    if (data.characters && Array.isArray(data.characters)) {
      data.characters.forEach((c: Record<string, unknown>) => {
        const name = String(c.name || '');
        const cleanedName = cleanAssetName(name);
        const key = `character:${cleanedName.toLowerCase()}`;
        const existingMatch = existingAssets?.find(a => 
          a.type === 'character' && 
          cleanAssetName(a.name).toLowerCase() === cleanedName.toLowerCase()
        );
        if (!existingMatch && !assetMap.has(key) && cleanedName) {
          assetMap.set(key, {
            id: `char_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            type: 'character',
            name: cleanedName,
            description: String(c.description || ''),
            prompt: buildAssetPrompt('character', String(c.description || '')),
            aspectRatio: '1:1'
          });
        }
      });
    }
    
    if (data.scenes && Array.isArray(data.scenes)) {
      data.scenes.forEach((s: Record<string, unknown>) => {
        const name = String(s.name || '');
        const cleanedName = cleanAssetName(name);
        const key = `scene:${cleanedName.toLowerCase()}`;
        const existingMatch = existingAssets?.find(a => 
          a.type === 'scene' && 
          cleanAssetName(a.name).toLowerCase() === cleanedName.toLowerCase()
        );
        if (!existingMatch && !assetMap.has(key) && cleanedName) {
          assetMap.set(key, {
            id: `scene_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            type: 'scene',
            name: cleanedName,
            description: String(s.description || ''),
            prompt: buildAssetPrompt('scene', String(s.description || '')),
            aspectRatio: '16:9'
          });
        }
      });
    }

    const newAssets = Array.from(assetMap.values());
    console.log("[WriterAgentV2] Returning", newAssets.length, "unique NEW assets");
    return { script, newAssets };
    
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[WriterAgentV2] Unexpected error:", errorMsg);
    throw new Error(`剧本生成失败 (V2): ${errorMsg}`);
  }
};

export const runAlignerAgent = async (episode: PlotEpisode, script: WebtoonScript, settings: AppSettings): Promise<AlignerReport> => {
  const prompt = `${settings.alignerPrompt}\n\nEPISODE CONTEXT: ${JSON.stringify(episode)}\n\nSCRIPT TO CHECK:\n${JSON.stringify(script)}\n\nIMPORTANT: Return VALID JSON only.`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    settings.alignerModel,
    true
  );

  return JSON.parse(cleanJson(responseText));
};

export const runBreakdownAligner = async (rawText: string, breakdown: PlotBreakdown, settings: AppSettings): Promise<BreakdownReport> => {
  const prompt = `${settings.breakdownPrompt}\n\nSOURCE TEXT SUMMARY (Snippet): ${rawText.substring(0, 5000)}\n\nBREAKDOWN TO CHECK:\n${JSON.stringify(breakdown)}\n\nIMPORTANT: Return VALID JSON only.`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    settings.alignerModel, // Use aligner model
    true
  );

  return JSON.parse(cleanJson(responseText));
};

export const extractAssetsFromText = async (text: string, settings: AppSettings): Promise<Asset[]> => {
  const prompt = `${settings.assetPrompt}\n\nNOVEL TEXT:\n${text.substring(0, 10000)}\n\nIMPORTANT: Return VALID JSON only.`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    settings.writerModel,
    true
  );

  const data = JSON.parse(cleanJson(responseText));
  return data.assets || [];
};

export const detectNovelStyle = async (text: string, settings: AppSettings): Promise<NovelStyle> => {
  const prompt = `${settings.stylePrompt}\n\nNOVEL TEXT SAMPLE:\n${text.substring(0, 5000)}\n\nIMPORTANT: Return VALID JSON only.`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    settings.writerModel,
    true
  );

  const data = JSON.parse(cleanJson(responseText));
  return {
    id: `style_${Date.now()}`,
    name: data.name,
    prompt: data.prompt,
    isBuiltIn: false,
    previewColor: '#8b5cf6'
  };
};

export const generateStoryBible = async (breakdown: PlotBreakdown, settings: AppSettings, oldBible?: StoryBible): Promise<StoryBible> => {
  const prompt = `${settings.archivistPrompt}\n\nCURRENT BREAKDOWN:\n${JSON.stringify(breakdown)}\n\nOLD BIBLE:\n${JSON.stringify(oldBible || {})}\n\nIMPORTANT: Return VALID JSON only.`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: prompt }],
    settings.writerModel,
    true
  );

  return JSON.parse(cleanJson(responseText));
};

export const generateImage = async (
  prompt: string, 
  settings: AppSettings, 
  aspectRatio: string = "1:1",
  assetType?: 'character' | 'scene' | 'item',
  referenceImages?: Blob[]  // Optional reference images for img2img
): Promise<string> => {
  // For scene and item types, add strong negative prompt to prevent human generation
  let finalPrompt = prompt;
  if (assetType === 'scene') {
    // Scene assets: empty environment, absolutely no people
    const sceneConstraints = [
      "CRITICAL: absolutely no humans, no people, no characters, no figures, no silhouettes",
      "no human-like shapes, no body parts, no faces, no crowds",
      "empty scene, uninhabited, deserted, nobody present",
      "environment concept art, landscape, scenery, background only",
      "architectural visualization, location shot, establishing shot"
    ].join(", ");
    finalPrompt = `${prompt}. ${sceneConstraints}`;
  } else if (assetType === 'item') {
    // Item/prop assets: single object focus, no people
    const itemConstraints = [
      "CRITICAL: no humans, no people, no hands, no body parts",
      "single object focus, isolated item, product photography",
      "center composition, object only, no human interaction",
      "studio lighting, clean background, 3D product render"
    ].join(", ");
    finalPrompt = `${prompt}. ${itemConstraints}`;
  }
  
  // Determine which model to use based on whether we have reference images
  const hasReferenceImages = referenceImages && referenceImages.length > 0;
  
  // Select the appropriate model:
  // - txt2imgModel for text-to-image (no reference images) - uses /v1/images/generations
  // - imageModel for image-to-image (with reference images) - uses /v1/images/edits
  // Priority: If user selected nano-banana for txt2img, prefer it for img2img too (if available)
  let selectedModel = hasReferenceImages 
    ? settings.imageModel 
    : (settings.txt2imgModel || settings.imageModel);
  
  // If user selected nano-banana for txt2img but imageModel is different, prefer nano-banana if it supports img2img
  if (hasReferenceImages && settings.txt2imgModel && isNanoBananaModel(settings.txt2imgModel)) {
    // Nano-banana supports img2img, so use it if user selected it for txt2img
    selectedModel = settings.txt2imgModel;
  }
  
  // Check if using Nano-Banana model
  if (isNanoBananaModel(selectedModel)) {
    const { model, imageSize } = parseNanoBananaModelId(selectedModel);
    
    // Convert aspect ratio format (e.g., "1:1" is already correct)
    const nanoBananaAspectRatio = convertAspectRatio(aspectRatio);
    
    console.log(`[ImageGen] Using ${hasReferenceImages ? 'img2img' : 'txt2img'} with model: ${selectedModel}`);
    
    return generateNanoBananaImage({
      prompt: finalPrompt,
      model,
      imageSize,
      aspectRatio: nanoBananaAspectRatio,
      referenceImages,
      responseFormat: 'url',
    }, settings);
  }
  
  // Check if using VolcEngine Ark image model
  if (isVolcArkImageModel(selectedModel)) {
    console.log(`[ImageGen] Using VolcEngine Ark ${hasReferenceImages ? 'img2img' : 'txt2img'} with model: ${selectedModel}`);
    
    // Use b64_json to avoid CORS issues with TOS URLs
    return generateVolcImage({
      model: selectedModel,
      prompt: finalPrompt,
      referenceImages,
      aspectRatio,
      size: settings.volcImageDefaultSize,
      responseFormat: 'b64_json', // Use base64 to avoid CORS issues
      watermark: settings.volcImageWatermark !== false, // Default: true
    }, settings);
  }
  
  // Use Chat Completion endpoint for other models (e.g., gemini, gpt-4o-image)
  const augmentedPrompt = `${finalPrompt} --aspect ${aspectRatio}`;
  
  const responseText = await callOpenAI(
    settings,
    [{ role: "user", content: augmentedPrompt }],
    settings.imageModel,
    false // Not JSON mode, we expect a URL string or markdown
  );

  // Extract URL from response. 
  // It might be markdown "![image](url)" or just "http..."
  // or simple text if it failed.
  
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const match = responseText.match(urlRegex);
  
  if (match && match[0]) {
      return match[0];
  }
  
  // If no URL found, check if it's base64 (less likely in chat response text but possible)
  if (responseText.includes('data:image')) {
      return responseText;
  }

  // Fallback: if the text itself is very short and looks like a path? 
  // Unlikely. Throw error with the text content for debug.
  throw new Error(`Failed to extract image URL from response: ${responseText.substring(0, 100)}...`);
};