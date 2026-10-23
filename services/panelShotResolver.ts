/**
 * Panel Shot Resolver Service
 * 
 * Resolves asset bindings for panel shots by:
 * 1. Matching shot references (names) to existing asset IDs
 * 2. Creating new assets for unmatched references
 * 3. Normalizing and validating shot data
 * 
 * @module services/panelShotResolver
 */

import { Asset, PanelShot, ScriptPanel, ShotSize } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ResolverInput {
  panels: ScriptPanel[];
  existingAssets: Asset[];
}

export interface ResolverOutput {
  resolvedPanels: ScriptPanel[];
  newAssets: Asset[];
  stats: {
    totalShots: number;
    resolvedCharacterBindings: number;
    resolvedSceneBindings: number;
    resolvedPropBindings: number;
    newAssetsCreated: number;
  };
}

interface AssetMatch {
  id: string;
  type: Asset['type'];
  name: string;
  score: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip parentheses suffix from asset name (e.g., "陆寒玄（战神）" -> "陆寒玄")
 */
const stripNameSuffix = (name: string): string => {
  return name.trim().replace(/\s*[（(][^）)]*[）)]\s*$/u, '').trim();
};

/**
 * Normalize string for matching (lowercase, remove extra spaces, strip suffix)
 */
const normalizeForMatch = (name: string): string => {
  return stripNameSuffix(name).toLowerCase().replace(/\s+/g, ' ').trim();
};

/**
 * Calculate similarity score between two strings (0-1)
 * Uses simple inclusion check + length ratio
 */
const calculateSimilarity = (a: string, b: string): number => {
  const normA = normalizeForMatch(a);
  const normB = normalizeForMatch(b);
  
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;
  
  // Check for partial word matches
  const wordsA = normA.split(/\s+/);
  const wordsB = normB.split(/\s+/);
  const commonWords = wordsA.filter(w => wordsB.some(bw => bw.includes(w) || w.includes(bw)));
  
  if (commonWords.length > 0) {
    return 0.5 * (commonWords.length / Math.max(wordsA.length, wordsB.length));
  }
  
  return 0;
};

/**
 * Find best matching asset for a given name/reference
 */
const findBestAssetMatch = (
  reference: string,
  assets: Asset[],
  type: Asset['type']
): AssetMatch | null => {
  if (!reference || !reference.trim()) return null;
  
  const typeAssets = assets.filter(a => a.type === type);
  if (typeAssets.length === 0) return null;
  
  let bestMatch: AssetMatch | null = null;
  let bestScore = 0;
  
  for (const asset of typeAssets) {
    const score = calculateSimilarity(reference, asset.name);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        score
      };
    }
  }
  
  return bestMatch;
};

/**
 * Generate a unique asset ID
 */
const generateAssetId = (type: Asset['type']): string => {
  const prefix = type === 'character' ? 'char' : type === 'scene' ? 'scene' : 'item';
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
};

/**
 * Create a new asset from a reference name
 */
const createAssetFromReference = (
  reference: string,
  type: Asset['type']
): Asset => {
  const cleanName = stripNameSuffix(reference);
  return {
    id: generateAssetId(type),
    type,
    name: cleanName,
    description: `${cleanName} - auto-generated from script`,
    prompt: cleanName,
    aspectRatio: type === 'scene' ? '16:9' : type === 'character' ? '3:4' : '1:1'
  };
};

/**
 * Validate shot size value
 */
const validateShotSize = (size: string | undefined): ShotSize => {
  const normalized = (size || 'MS').toUpperCase();
  if (normalized === 'WS' || normalized === 'WIDE' || normalized === 'LS') return 'WS';
  if (normalized === 'CU' || normalized === 'CLOSE' || normalized === 'ECU') return 'CU';
  return 'MS';
};

// ============================================================================
// Main Resolver Function
// ============================================================================

/**
 * Resolve asset bindings for all shots in panels
 * 
 * This function:
 * 1. Validates existing asset ID references
 * 2. Tries to match unresolved names to existing assets
 * 3. Creates new assets for completely unmatched references
 * 4. Returns resolved panels and new assets
 */
export const resolvePanelShots = (input: ResolverInput): ResolverOutput => {
  const { panels, existingAssets } = input;
  
  const stats = {
    totalShots: 0,
    resolvedCharacterBindings: 0,
    resolvedSceneBindings: 0,
    resolvedPropBindings: 0,
    newAssetsCreated: 0
  };
  
  // Track new assets to avoid duplicates
  const newAssetsMap = new Map<string, Asset>();
  const validAssetIds = new Set(existingAssets.map(a => a.id));
  
  // Helper: Resolve a list of asset references
  const resolveAssetRefs = (
    refs: string[] | undefined,
    type: Asset['type'],
    statKey: 'resolvedCharacterBindings' | 'resolvedPropBindings'
  ): string[] => {
    if (!refs || refs.length === 0) return [];
    
    const resolvedIds: string[] = [];
    
    for (const ref of refs) {
      // Check if it's already a valid asset ID
      if (validAssetIds.has(ref)) {
        resolvedIds.push(ref);
        stats[statKey]++;
        continue;
      }
      
      // Try to find a matching asset by name
      const match = findBestAssetMatch(ref, existingAssets, type);
      if (match) {
        resolvedIds.push(match.id);
        stats[statKey]++;
        continue;
      }
      
      // Check if we already created this asset
      const normalizedRef = normalizeForMatch(ref);
      const existingNew = Array.from(newAssetsMap.values()).find(
        a => a.type === type && normalizeForMatch(a.name) === normalizedRef
      );
      
      if (existingNew) {
        resolvedIds.push(existingNew.id);
        continue;
      }
      
      // Create a new asset
      const newAsset = createAssetFromReference(ref, type);
      newAssetsMap.set(newAsset.id, newAsset);
      validAssetIds.add(newAsset.id); // Add to valid set for subsequent lookups
      resolvedIds.push(newAsset.id);
      stats.newAssetsCreated++;
    }
    
    return resolvedIds;
  };
  
  // Helper: Resolve a single scene asset reference
  const resolveSceneRef = (ref: string | null | undefined): string | null => {
    if (!ref) return null;
    
    // Check if it's already a valid asset ID
    if (validAssetIds.has(ref)) {
      stats.resolvedSceneBindings++;
      return ref;
    }
    
    // Try to find a matching scene asset
    const match = findBestAssetMatch(ref, existingAssets, 'scene');
    if (match) {
      stats.resolvedSceneBindings++;
      return match.id;
    }
    
    // Check if we already created this scene
    const normalizedRef = normalizeForMatch(ref);
    const existingNew = Array.from(newAssetsMap.values()).find(
      a => a.type === 'scene' && normalizeForMatch(a.name) === normalizedRef
    );
    
    if (existingNew) {
      return existingNew.id;
    }
    
    // Create a new scene asset
    const newAsset = createAssetFromReference(ref, 'scene');
    newAssetsMap.set(newAsset.id, newAsset);
    validAssetIds.add(newAsset.id);
    stats.newAssetsCreated++;
    
    return newAsset.id;
  };
  
  // Process all panels
  const resolvedPanels: ScriptPanel[] = panels.map(panel => {
    if (!panel.shots || panel.shots.length !== 3) {
      // Panel doesn't have structured shots, skip
      return panel;
    }
    
    const resolvedShots = panel.shots.map((shot, idx) => {
      stats.totalShots++;
      
      const resolvedShot: PanelShot = {
        ...shot,
        index: (idx + 1) as 1 | 2 | 3,
        characterAssetIds: resolveAssetRefs(shot.characterAssetIds, 'character', 'resolvedCharacterBindings'),
        sceneAssetId: resolveSceneRef(shot.sceneAssetId),
        propAssetIds: resolveAssetRefs(shot.propAssetIds, 'item', 'resolvedPropBindings'),
        shotSize: validateShotSize(shot.shotSize),
        // Ensure all required fields have values
        dialogue: shot.dialogue || '',
        action: shot.action || '',
        visual: shot.visual || '',
        composition: shot.composition || '三分法',
        camera: shot.camera || '平视',
        light: shot.light || '自然光'
      };
      
      return resolvedShot;
    }) as [PanelShot, PanelShot, PanelShot];
    
    return {
      ...panel,
      shots: resolvedShots
    };
  });
  
  return {
    resolvedPanels,
    newAssets: Array.from(newAssetsMap.values()),
    stats
  };
};

/**
 * Resolve shots for a single panel
 * Convenience function for use in TriptychGenerator
 */
export const resolveSinglePanelShots = (
  panel: ScriptPanel,
  existingAssets: Asset[]
): { panel: ScriptPanel; newAssets: Asset[] } => {
  const result = resolvePanelShots({
    panels: [panel],
    existingAssets
  });
  
  return {
    panel: result.resolvedPanels[0],
    newAssets: result.newAssets
  };
};

/**
 * Get asset by ID with fallback lookup by name
 */
export const getAssetById = (
  id: string | null | undefined,
  assets: Asset[]
): Asset | undefined => {
  if (!id) return undefined;
  
  // Direct ID lookup
  const byId = assets.find(a => a.id === id);
  if (byId) return byId;
  
  // Fallback: treat id as name and search
  return assets.find(a => normalizeForMatch(a.name) === normalizeForMatch(id));
};

/**
 * Get multiple assets by IDs with fallback lookup
 */
export const getAssetsByIds = (
  ids: string[] | undefined,
  assets: Asset[]
): Asset[] => {
  if (!ids || ids.length === 0) return [];
  return ids.map(id => getAssetById(id, assets)).filter((a): a is Asset => a !== undefined);
};

