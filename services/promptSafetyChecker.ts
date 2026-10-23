/**
 * Prompt Safety Checker Service
 * 
 * Detects potentially sensitive content that may be rejected by
 * video generation APIs (Veo, Sora, Kling, etc.)
 * 
 * Categories:
 * - Violence / Weapons
 * - Adult / NSFW
 * - Political / Religious
 * - Copyright / Trademark
 * - Real persons / Celebrities
 */

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';

export type RiskCategory = 
  | 'violence'
  | 'weapon'
  | 'adult'
  | 'political'
  | 'copyright'
  | 'celebrity'
  | 'drug'
  | 'hate';

export interface SafetyWarning {
  word: string;
  category: RiskCategory;
  categoryLabel: string;
  suggestion: string;
  position: { start: number; end: number };
}

export interface SafetyCheckResult {
  safe: boolean;
  riskLevel: RiskLevel;
  warnings: SafetyWarning[];
  cleanedPrompt?: string;
}

// ============================================================================
// Sensitive Patterns
// ============================================================================

interface PatternRule {
  pattern: RegExp;
  category: RiskCategory;
  categoryLabel: string;
  suggestion: string;
}

// Chinese patterns
const CHINESE_PATTERNS: PatternRule[] = [
  // Violence
  { pattern: /杀死|杀害|杀戮/g, category: 'violence', categoryLabel: '暴力', suggestion: '击败、战胜' },
  { pattern: /血腥|流血|鲜血喷涌/g, category: 'violence', categoryLabel: '暴力', suggestion: '红色特效、光芒' },
  { pattern: /死亡|死去|毙命/g, category: 'violence', categoryLabel: '暴力', suggestion: '倒下、消失' },
  { pattern: /残忍|残暴|虐待/g, category: 'violence', categoryLabel: '暴力', suggestion: '激烈、强势' },
  { pattern: /刺杀|暗杀|谋杀/g, category: 'violence', categoryLabel: '暴力', suggestion: '突袭、对抗' },
  { pattern: /尸体|死尸/g, category: 'violence', categoryLabel: '暴力', suggestion: '倒地的身影' },
  
  // Weapons
  { pattern: /枪|手枪|步枪|机枪/g, category: 'weapon', categoryLabel: '武器', suggestion: '器械、装备' },
  { pattern: /炸弹|爆炸物|炸药/g, category: 'weapon', categoryLabel: '武器', suggestion: '能量爆发、光效' },
  { pattern: /刀刺|剑刺|捅|砍杀/g, category: 'weapon', categoryLabel: '武器', suggestion: '挥舞、格挡' },
  { pattern: /子弹|开枪|射击/g, category: 'weapon', categoryLabel: '武器', suggestion: '能量束、光线' },
  
  // Adult
  { pattern: /裸体|裸露|赤裸/g, category: 'adult', categoryLabel: '成人', suggestion: '优雅、端庄' },
  { pattern: /性感|诱惑|挑逗/g, category: 'adult', categoryLabel: '成人', suggestion: '魅力、优雅' },
  { pattern: /亲吻|接吻|热吻/g, category: 'adult', categoryLabel: '成人', suggestion: '亲密、温馨' },
  { pattern: /色情|情色/g, category: 'adult', categoryLabel: '成人', suggestion: '移除' },
  
  // Political
  { pattern: /国旗|党旗|军旗/g, category: 'political', categoryLabel: '政治', suggestion: '旗帜、标志' },
  { pattern: /领导人|主席|总统/g, category: 'political', categoryLabel: '政治', suggestion: '领袖、首领' },
  { pattern: /政府|政党|政治/g, category: 'political', categoryLabel: '政治', suggestion: '组织、势力' },
  { pattern: /军队|士兵|战争/g, category: 'political', categoryLabel: '政治', suggestion: '武者、冲突' },
  
  // Drug
  { pattern: /毒品|吸毒|贩毒/g, category: 'drug', categoryLabel: '毒品', suggestion: '移除' },
  { pattern: /大麻|可卡因|海洛因/g, category: 'drug', categoryLabel: '毒品', suggestion: '移除' },
  
  // Hate
  { pattern: /种族|歧视|仇恨/g, category: 'hate', categoryLabel: '仇恨', suggestion: '移除' },
];

// English patterns
const ENGLISH_PATTERNS: PatternRule[] = [
  // Violence
  { pattern: /\bkill(ing|ed|s)?\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'defeat, overcome' },
  { pattern: /\bblood(y)?\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'red effects, glow' },
  { pattern: /\bdeath|dead|die(s|d)?\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'fall, vanish' },
  { pattern: /\bmurder(ing|ed|s)?\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'attack, confront' },
  { pattern: /\bviolent|violence\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'intense, dramatic' },
  { pattern: /\bcorpse|body\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'fallen figure' },
  { pattern: /\btorture|brutal\b/gi, category: 'violence', categoryLabel: 'Violence', suggestion: 'intense, fierce' },
  
  // Weapons
  { pattern: /\bgun(s)?\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'device, equipment' },
  { pattern: /\bpistol|rifle|shotgun\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'device' },
  { pattern: /\bbomb|explosive\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'energy burst' },
  { pattern: /\bstab(bing|bed)?\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'strike, thrust' },
  { pattern: /\bshoot(ing|s)?\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'project, emit' },
  { pattern: /\bbullet(s)?\b/gi, category: 'weapon', categoryLabel: 'Weapon', suggestion: 'energy beam' },
  
  // Adult
  { pattern: /\bnude|naked\b/gi, category: 'adult', categoryLabel: 'Adult', suggestion: 'elegant, graceful' },
  { pattern: /\bsexy|erotic\b/gi, category: 'adult', categoryLabel: 'Adult', suggestion: 'charming, elegant' },
  { pattern: /\bkiss(ing|ed)?\b/gi, category: 'adult', categoryLabel: 'Adult', suggestion: 'intimate moment' },
  { pattern: /\bnsfw|porn\b/gi, category: 'adult', categoryLabel: 'Adult', suggestion: 'remove' },
  
  // Political
  { pattern: /\bflag|national flag\b/gi, category: 'political', categoryLabel: 'Political', suggestion: 'banner, symbol' },
  { pattern: /\bpresident|chairman\b/gi, category: 'political', categoryLabel: 'Political', suggestion: 'leader' },
  { pattern: /\bgovernment|political\b/gi, category: 'political', categoryLabel: 'Political', suggestion: 'organization' },
  { pattern: /\bmilitary|soldier|army\b/gi, category: 'political', categoryLabel: 'Political', suggestion: 'warrior, fighter' },
  { pattern: /\bwar\b/gi, category: 'political', categoryLabel: 'Political', suggestion: 'conflict, battle' },
  
  // Copyright / Celebrities
  { pattern: /\bdisney|marvel|dc comics\b/gi, category: 'copyright', categoryLabel: 'Copyright', suggestion: 'remove or describe' },
  { pattern: /\bmickey mouse|spider-?man|batman\b/gi, category: 'copyright', categoryLabel: 'Copyright', suggestion: 'original character' },
  { pattern: /\bpokemon|pikachu\b/gi, category: 'copyright', categoryLabel: 'Copyright', suggestion: 'creature, mascot' },
  
  // Drug
  { pattern: /\bdrug(s)?|cocaine|heroin\b/gi, category: 'drug', categoryLabel: 'Drug', suggestion: 'remove' },
  { pattern: /\bmarijuana|cannabis|weed\b/gi, category: 'drug', categoryLabel: 'Drug', suggestion: 'remove' },
  
  // Hate
  { pattern: /\bracist|racism|discrimination\b/gi, category: 'hate', categoryLabel: 'Hate', suggestion: 'remove' },
];

// All patterns combined
const ALL_PATTERNS = [...CHINESE_PATTERNS, ...ENGLISH_PATTERNS];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Check prompt for potentially sensitive content
 */
export function checkPromptSafety(prompt: string): SafetyCheckResult {
  const warnings: SafetyWarning[] = [];
  
  for (const rule of ALL_PATTERNS) {
    let match;
    // Reset regex lastIndex
    rule.pattern.lastIndex = 0;
    
    while ((match = rule.pattern.exec(prompt)) !== null) {
      // Avoid duplicate warnings for same word
      const existingWarning = warnings.find(w => 
        w.word.toLowerCase() === match[0].toLowerCase() &&
        w.category === rule.category
      );
      
      if (!existingWarning) {
        warnings.push({
          word: match[0],
          category: rule.category,
          categoryLabel: rule.categoryLabel,
          suggestion: rule.suggestion,
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });
      }
    }
  }
  
  // Calculate risk level
  let riskLevel: RiskLevel = 'safe';
  if (warnings.length > 0) {
    const highRiskCategories: RiskCategory[] = ['adult', 'drug', 'hate'];
    const hasHighRisk = warnings.some(w => highRiskCategories.includes(w.category));
    
    if (hasHighRisk || warnings.length >= 5) {
      riskLevel = 'high';
    } else if (warnings.length >= 2) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }
  }
  
  return {
    safe: warnings.length === 0,
    riskLevel,
    warnings,
  };
}

/**
 * Get risk level color for UI
 */
export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'safe': return 'text-green-400';
    case 'low': return 'text-yellow-400';
    case 'medium': return 'text-orange-400';
    case 'high': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

/**
 * Get risk level background for UI
 */
export function getRiskLevelBg(level: RiskLevel): string {
  switch (level) {
    case 'safe': return 'bg-green-500/20';
    case 'low': return 'bg-yellow-500/20';
    case 'medium': return 'bg-orange-500/20';
    case 'high': return 'bg-red-500/20';
    default: return 'bg-gray-500/20';
  }
}

/**
 * Get risk level label
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'safe': return '✓ 安全';
    case 'low': return '⚠ 低风险';
    case 'medium': return '⚠ 中风险';
    case 'high': return '⛔ 高风险';
    default: return '未检测';
  }
}

/**
 * Get category icon
 */
export function getCategoryIcon(category: RiskCategory): string {
  switch (category) {
    case 'violence': return '⚔️';
    case 'weapon': return '🔫';
    case 'adult': return '🔞';
    case 'political': return '🏛️';
    case 'copyright': return '©️';
    case 'celebrity': return '⭐';
    case 'drug': return '💊';
    case 'hate': return '🚫';
    default: return '⚠️';
  }
}

/**
 * Auto-clean prompt by replacing sensitive words with suggestions
 * (Only replaces words with clear suggestions, not "remove")
 */
export function autoCleanPrompt(prompt: string, warnings: SafetyWarning[]): string {
  let cleaned = prompt;
  
  // Sort warnings by position (descending) to replace from end to start
  const sortedWarnings = [...warnings].sort((a, b) => b.position.start - a.position.start);
  
  for (const warning of sortedWarnings) {
    if (warning.suggestion && warning.suggestion !== '移除' && warning.suggestion !== 'remove') {
      // Replace with first suggestion
      const suggestion = warning.suggestion.split(/[,、]/)[0].trim();
      cleaned = 
        cleaned.substring(0, warning.position.start) + 
        suggestion + 
        cleaned.substring(warning.position.end);
    } else {
      // Remove the word entirely
      cleaned = 
        cleaned.substring(0, warning.position.start) + 
        cleaned.substring(warning.position.end);
    }
  }
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

