/**
 * Asset Optimization Service
 * 
 * Provides two-tier optimization for existing assets:
 * 1. Local Rules: Deterministic template-based fixes (fast, stable, 0 tokens)
 * 2. AI Suggestions: Model-powered prompt improvements (optional, richer)
 * 
 * Also supports discovering new assets from storyboard context.
 */

import {
  Asset,
  AssetType,
  AssetOptimizationProposal,
  AssetOptimizationResult,
  FieldChange,
  OptimizationRiskLevel,
  AppSettings,
  NovelStyle,
} from '../types';

// ============================================================================
// Asset Prompt Templates (shared with geminiService.ts)
// ============================================================================

export const CHARACTER_PROMPT_TEMPLATE = 
  `Character Design Reference Sheet, masterpiece, best quality, professional concept art. ` +
  `2x2 grid layout composition with clear borders: ` +
  `[Top-Left] full body front view with neutral A-pose, ` +
  `[Top-Right] full body side profile view (3/4 angle), ` +
  `[Bottom-Left] full body back view, ` +
  `[Bottom-Right] detailed face close-up portrait showing eyes, nose, mouth, expression details. ` +
  `Same character in all four panels, consistent design, consistent proportions, consistent colors. ` +
  `#FFFFFF pure white background, solid white backdrop, isolated subject, clean studio lighting, no shadows on background, high-key lighting.`;

export const SCENE_PROMPT_TEMPLATE = 
  `Environment concept art, wide shot, cinematic composition, ` +
  `no people, nobody, empty scene, uninhabited, deserted, ` +
  `masterpiece, 8k resolution, cinematic lighting, architectural visualization, ` +
  `establishing shot, location reference.`;

export const ITEM_PROMPT_TEMPLATE = 
  `3D Product shot, center composition, isolated item, ` +
  `single object focus, product photography, ` +
  `neutral studio background, clean backdrop, ` +
  `8k resolution, unreal engine 5 render, professional lighting.`;

// ============================================================================
// Detection Keywords
// ============================================================================

// Keywords that indicate a proper template is already present
const CHARACTER_TEMPLATE_KEYWORDS = [
  'character design reference sheet',
  '2x2 grid',
  'four panels',
  '4-view',
  'reference sheet',
  'character sheet',
];

const SCENE_TEMPLATE_KEYWORDS = [
  'environment concept art',
  'empty scene',
  'no people',
  'nobody',
  'establishing shot',
];

const ITEM_TEMPLATE_KEYWORDS = [
  'product shot',
  'isolated item',
  'single object',
  'product photography',
];

// Weather/time-of-day keywords that shouldn't be in scene prompts (cause drift)
const SCENE_TRANSIENT_KEYWORDS = [
  // Weather (Chinese)
  '下雨', '雨天', '雨中', '暴风雨', '雷雨', '阴天', '晴天', '多云', '雪', '下雪', '雾', '大雾',
  // Weather (English)
  'rain', 'rainy', 'raining', 'storm', 'thunder', 'cloudy', 'sunny', 'snow', 'snowing', 'fog', 'foggy', 'mist',
  // Time of day (Chinese)
  '夜晚', '深夜', '黄昏', '傍晚', '清晨', '黎明', '日落', '日出', '正午', '午夜',
  // Time of day (English)
  'night', 'midnight', 'dusk', 'dawn', 'sunset', 'sunrise', 'noon', 'evening', 'morning',
  // Season (Chinese)
  '春天', '夏天', '秋天', '冬天', '春季', '夏季', '秋季', '冬季',
  // Season (English)
  'spring', 'summer', 'autumn', 'fall', 'winter',
];

// Style anchors to add based on project style
const STYLE_ANCHORS: Record<string, string[]> = {
  '彩绘': ['painted illustration', 'watercolor style', 'artistic', 'colorful brush strokes'],
  '水彩': ['watercolor painting', 'soft colors', 'fluid brushwork', 'artistic watercolor'],
  '插画': ['illustration style', 'digital illustration', 'artistic rendering'],
  '厚涂': ['impasto style', 'thick paint', 'textured brushwork', 'oil painting style'],
  '漫画': ['manga style', 'comic art', 'clean linework', 'anime illustration'],
  '动漫': ['anime style', 'japanese animation', 'cel shaded', 'vibrant colors'],
  '写实': ['realistic', 'photorealistic', 'lifelike', 'detailed rendering'],
  '赛博朋克': ['cyberpunk', 'neon lights', 'futuristic', 'sci-fi aesthetic'],
  '古风': ['chinese traditional art', 'ink wash painting', 'oriental aesthetic'],
};

// ============================================================================
// Local Rule Analysis
// ============================================================================

/**
 * Check if a prompt already contains template keywords
 */
const hasTemplateKeywords = (prompt: string, keywords: string[]): boolean => {
  const lowerPrompt = prompt.toLowerCase();
  return keywords.some(kw => lowerPrompt.includes(kw.toLowerCase()));
};

/**
 * Find transient keywords in a prompt
 */
const findTransientKeywords = (prompt: string): string[] => {
  const found: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  for (const kw of SCENE_TRANSIENT_KEYWORDS) {
    if (lowerPrompt.includes(kw.toLowerCase())) {
      found.push(kw);
    }
  }
  
  return found;
};

/**
 * Remove transient keywords from a string
 */
const removeTransientKeywords = (text: string): string => {
  let result = text;
  for (const kw of SCENE_TRANSIENT_KEYWORDS) {
    // Case-insensitive replace
    const regex = new RegExp(kw, 'gi');
    result = result.replace(regex, '');
  }
  // Clean up extra spaces and commas
  result = result.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  return result;
};

/**
 * Extract style anchors from project style
 */
const getStyleAnchors = (projectStyle?: NovelStyle | null): string[] => {
  if (!projectStyle?.name && !projectStyle?.prompt) return [];
  
  const anchors: string[] = [];
  const styleName = projectStyle.name || '';
  const stylePrompt = projectStyle.prompt || '';
  
  // Check style name against known styles
  for (const [key, values] of Object.entries(STYLE_ANCHORS)) {
    if (styleName.includes(key) || stylePrompt.includes(key)) {
      anchors.push(...values);
    }
  }
  
  // If style prompt has English keywords, extract them
  const englishWords = stylePrompt.match(/\b[a-zA-Z]+\b/g) || [];
  const relevantWords = englishWords.filter(w => 
    w.length > 3 && 
    !['with', 'from', 'this', 'that', 'style', 'prompt'].includes(w.toLowerCase())
  );
  anchors.push(...relevantWords.slice(0, 3));
  
  return [...new Set(anchors)]; // Dedupe
};

/**
 * Analyze a single asset using local rules
 */
export const analyzeAssetWithLocalRules = (
  asset: Asset,
  projectStyle?: NovelStyle | null
): AssetOptimizationProposal | null => {
  const changes: FieldChange[] = [];
  const reasons: string[] = [];
  let riskLevel: OptimizationRiskLevel = 'low';
  
  const styleAnchors = getStyleAnchors(projectStyle);
  
  // --- Character Analysis ---
  if (asset.type === 'character') {
    // Check if missing 4-view template
    if (!hasTemplateKeywords(asset.prompt, CHARACTER_TEMPLATE_KEYWORDS)) {
      const newPrompt = `${CHARACTER_PROMPT_TEMPLATE} Character details: ${asset.description || asset.prompt}`;
      
      // Add style anchors if available
      const finalPrompt = styleAnchors.length > 0
        ? `${newPrompt}, ${styleAnchors.slice(0, 2).join(', ')}`
        : newPrompt;
      
      changes.push({
        field: 'prompt',
        before: asset.prompt,
        after: finalPrompt,
      });
      reasons.push('缺少四视图参考图模板，添加标准模板以提高一致性');
    }
    
    // Check aspect ratio for 4-view
    if (asset.aspectRatio !== '1:1') {
      changes.push({
        field: 'aspectRatio',
        before: asset.aspectRatio,
        after: '1:1',
      });
      reasons.push('四视图参考图需要正方形比例(1:1)');
    }
  }
  
  // --- Scene Analysis ---
  if (asset.type === 'scene') {
    let promptNeedsUpdate = false;
    let newPrompt = asset.prompt;
    
    // Check for transient keywords
    const transients = findTransientKeywords(asset.prompt);
    if (transients.length > 0) {
      newPrompt = removeTransientKeywords(newPrompt);
      reasons.push(`场景资产包含瞬态词汇(${transients.slice(0, 3).join('/')})，这会导致跨镜头漂移`);
      promptNeedsUpdate = true;
      riskLevel = 'medium'; // Removing content is riskier
    }
    
    // Check for transient keywords in description too
    const descTransients = findTransientKeywords(asset.description);
    if (descTransients.length > 0) {
      const cleanedDesc = removeTransientKeywords(asset.description);
      changes.push({
        field: 'description',
        before: asset.description,
        after: cleanedDesc,
      });
      reasons.push(`描述中包含瞬态词汇，已清理`);
    }
    
    // Check if missing empty scene template
    if (!hasTemplateKeywords(asset.prompt, SCENE_TEMPLATE_KEYWORDS)) {
      newPrompt = `${SCENE_PROMPT_TEMPLATE} Scene details: ${newPrompt || asset.description}`;
      reasons.push('缺少空镜场景模板，添加标准模板以避免生成人物');
      promptNeedsUpdate = true;
    }
    
    if (promptNeedsUpdate) {
      // Add style anchors
      const finalPrompt = styleAnchors.length > 0
        ? `${newPrompt}, ${styleAnchors.slice(0, 2).join(', ')}`
        : newPrompt;
      
      changes.push({
        field: 'prompt',
        before: asset.prompt,
        after: finalPrompt,
      });
    }
  }
  
  // --- Item Analysis ---
  if (asset.type === 'item') {
    if (!hasTemplateKeywords(asset.prompt, ITEM_TEMPLATE_KEYWORDS)) {
      let newPrompt = `${ITEM_PROMPT_TEMPLATE} Item details: ${asset.description || asset.prompt}`;
      
      // Add style anchors
      if (styleAnchors.length > 0) {
        newPrompt = `${newPrompt}, ${styleAnchors.slice(0, 2).join(', ')}`;
      }
      
      changes.push({
        field: 'prompt',
        before: asset.prompt,
        after: newPrompt,
      });
      reasons.push('缺少道具单品模板，添加标准模板以生成干净的产品图');
    }
  }
  
  // Only return proposal if there are changes
  if (changes.length === 0) {
    return null;
  }
  
  // Build proposed asset with changes applied
  const proposedAsset: Partial<Asset> = { id: asset.id };
  for (const change of changes) {
    (proposedAsset as any)[change.field] = change.after;
  }
  
  return {
    id: `proposal_local_${asset.id}_${Date.now()}`,
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.type,
    source: 'local_rule',
    riskLevel,
    reason: reasons.join('；'),
    changes,
    proposedAsset,
  };
};

// ============================================================================
// AI-Powered Optimization
// ============================================================================

/**
 * Generate AI-powered optimization suggestions
 * This calls the model to improve prompts with better English, style integration, etc.
 */
export const generateAIOptimizations = async (
  assets: Asset[],
  projectStyle: NovelStyle | null,
  settings: AppSettings
): Promise<AssetOptimizationProposal[]> => {
  // Only process assets that don't already have good templates
  const assetsToOptimize = assets.filter(a => {
    if (a.type === 'character') return !hasTemplateKeywords(a.prompt, CHARACTER_TEMPLATE_KEYWORDS);
    if (a.type === 'scene') return !hasTemplateKeywords(a.prompt, SCENE_TEMPLATE_KEYWORDS);
    if (a.type === 'item') return !hasTemplateKeywords(a.prompt, ITEM_TEMPLATE_KEYWORDS);
    return true;
  });
  
  if (assetsToOptimize.length === 0) {
    return [];
  }
  
  // Build prompt for AI
  const systemPrompt = `You are an expert prompt engineer for AI image generation (Midjourney, Stable Diffusion, DALL-E).
Your task is to optimize asset prompts for better image generation quality.

PROJECT STYLE: ${projectStyle ? `${projectStyle.name}: ${projectStyle.prompt}` : 'No specific style set'}

For each asset, you will receive the current prompt and description. Generate an improved English prompt that:
1. Follows best practices for the asset type:
   - Characters: Include character sheet layout, consistent design, white background
   - Scenes: Include "no people", establishing shot, environment focus
   - Items: Include product photography, isolated subject, clean background
2. Incorporates the project style keywords naturally
3. Translates Chinese descriptions to clear English
4. Removes any weather/time-of-day references from scene prompts (these cause drift)
5. Keeps the prompt concise but complete (under 200 words)

Return a JSON array of optimizations:
{
  "optimizations": [
    {
      "assetId": "string",
      "improvedPrompt": "string (the new English prompt)",
      "improvedDescription": "string (optional, cleaned description)",
      "reason": "string (Chinese explanation of what was improved)"
    }
  ]
}

Only include assets where you made meaningful improvements. Skip assets that already have good prompts.`;

  const assetsJson = JSON.stringify(assetsToOptimize.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description,
    prompt: a.prompt,
    aspectRatio: a.aspectRatio,
  })));

  try {
    // Import callOpenAI dynamically to avoid circular dependency
    const { callOpenAI, cleanJson } = await import('./geminiService');
    
    const responseText = await callOpenAI(
      settings,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `ASSETS TO OPTIMIZE:\n${assetsJson}` }
      ],
      settings.writerModel,
      true
    );
    
    const data = JSON.parse(cleanJson(responseText));
    const optimizations = data.optimizations || [];
    
    // Convert to proposals
    const proposals: AssetOptimizationProposal[] = [];
    
    for (const opt of optimizations) {
      const originalAsset = assets.find(a => a.id === opt.assetId);
      if (!originalAsset) continue;
      
      const changes: FieldChange[] = [];
      
      if (opt.improvedPrompt && opt.improvedPrompt !== originalAsset.prompt) {
        changes.push({
          field: 'prompt',
          before: originalAsset.prompt,
          after: opt.improvedPrompt,
        });
      }
      
      if (opt.improvedDescription && opt.improvedDescription !== originalAsset.description) {
        changes.push({
          field: 'description',
          before: originalAsset.description,
          after: opt.improvedDescription,
        });
      }
      
      if (changes.length === 0) continue;
      
      const proposedAsset: Partial<Asset> = { id: originalAsset.id };
      for (const change of changes) {
        (proposedAsset as any)[change.field] = change.after;
      }
      
      proposals.push({
        id: `proposal_ai_${originalAsset.id}_${Date.now()}`,
        assetId: originalAsset.id,
        assetName: originalAsset.name,
        assetType: originalAsset.type,
        source: 'ai_suggestion',
        riskLevel: 'medium', // AI suggestions always medium risk
        reason: opt.reason || 'AI 优化了提示词结构和翻译',
        changes,
        proposedAsset,
      });
    }
    
    return proposals;
  } catch (error) {
    console.error('[AssetOptimization] AI optimization failed:', error);
    return [];
  }
};

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run full asset optimization analysis
 * 
 * @param assets - Current project assets
 * @param projectStyle - Current project style (for style anchor injection)
 * @param settings - App settings (for AI calls)
 * @param options - Configuration options
 */
export const runAssetOptimization = async (
  assets: Asset[],
  projectStyle: NovelStyle | null,
  settings: AppSettings,
  options: {
    enableAI?: boolean;        // Whether to run AI optimization (default: true)
    skipLocalRules?: boolean;  // Skip local rules (default: false)
  } = {}
): Promise<AssetOptimizationResult> => {
  const { enableAI = true, skipLocalRules = false } = options;
  
  const proposals: AssetOptimizationProposal[] = [];
  const processedAssetIds = new Set<string>();
  
  // Phase 1: Local Rule Analysis
  if (!skipLocalRules) {
    console.log('[AssetOptimization] Running local rule analysis on', assets.length, 'assets');
    
    for (const asset of assets) {
      const proposal = analyzeAssetWithLocalRules(asset, projectStyle);
      if (proposal) {
        proposals.push(proposal);
        processedAssetIds.add(asset.id);
      }
    }
    
    console.log('[AssetOptimization] Local rules generated', proposals.length, 'proposals');
  }
  
  // Phase 2: AI-Powered Optimization (for assets not already covered by local rules)
  if (enableAI) {
    // Only send assets that don't already have local rule proposals
    const assetsForAI = assets.filter(a => !processedAssetIds.has(a.id));
    
    if (assetsForAI.length > 0) {
      console.log('[AssetOptimization] Running AI optimization on', assetsForAI.length, 'assets');
      
      const aiProposals = await generateAIOptimizations(assetsForAI, projectStyle, settings);
      proposals.push(...aiProposals);
      
      console.log('[AssetOptimization] AI generated', aiProposals.length, 'additional proposals');
    }
  }
  
  return {
    proposals,
    newAssets: [], // New asset discovery is handled by extractAssetsFromText
    summary: {
      totalAnalyzed: assets.length,
      proposalsGenerated: proposals.length,
      newAssetsFound: 0,
    },
  };
};

/**
 * Apply a single proposal to an asset
 * Returns the updated asset with changes applied
 */
export const applyProposal = (asset: Asset, proposal: AssetOptimizationProposal): Asset => {
  const updated = { ...asset };
  
  for (const change of proposal.changes) {
    (updated as any)[change.field] = change.after;
  }
  
  return updated;
};

/**
 * Apply multiple proposals (batch accept)
 * Returns a map of assetId -> updated asset
 */
export const applyProposals = (
  assets: Asset[],
  proposals: AssetOptimizationProposal[]
): Map<string, Asset> => {
  const assetMap = new Map<string, Asset>();
  
  // Create a map of asset ID to asset for quick lookup
  const originalAssets = new Map(assets.map(a => [a.id, a]));
  
  for (const proposal of proposals) {
    const original = originalAssets.get(proposal.assetId);
    if (!original) continue;
    
    const updated = applyProposal(original, proposal);
    assetMap.set(proposal.assetId, updated);
  }
  
  return assetMap;
};

