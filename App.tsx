import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectManager } from './components/ProjectManager';
import { AssetLibrary } from './components/AssetLibrary';
import { StoryboardBoard } from './components/StoryboardBoard';
import { SourcePanel } from './components/SourcePanel';
import { ScriptCanvas } from './components/ScriptCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { SettingsModal } from './components/SettingsModal';
import { StoryBibleModal } from './components/StoryBibleModal';
import { StyleManager } from './components/StyleManager';
import { StatusBar } from './components/StatusBar';
// Toast component no longer used - replaced with inline log history panel
import { 
  runSplitterAgent, 
  runWriterAgent, 
  runWriterAgentV2,
  runExplainAgent,
  runAlignerAgent, 
  runBreakdownAligner, 
  extractAssetsFromText,
  // Note: cleanJson and callOpenAI are now exported for use by assetOptimizationService
  detectNovelStyle,
  generateImage,
  generateStoryBible
} from './services/geminiService';
import { 
  runAssetOptimization, 
  applyProposal 
} from './services/assetOptimizationService';
import { playSuccessSound, playSound } from './services/soundService';
import { 
  openDirectory, 
  saveProjectToDir, 
  saveProjectToDirWithHandle,
  loadProjectFromDirWithHandle,
  saveImageToAssets,
  loadAssetImage,
  loadProjectFromDir,
  initializeNewProject,
  scanWorkspaceProjects,
  createProjectInWorkspace,
  setCurrentProjectDir,
  deleteProjectFromWorkspace
} from './services/fileSystem';
import { 
  loadSettings, 
  saveSettings, 
  loadProjects, 
  saveProject, 
  deleteProject, 
  updateStoryBible, 
  db,
  saveWorkspaceHandle,
  loadWorkspaceHandle,
  clearWorkspaceHandle,
  initializeDatabase,
  resetDatabase
} from './db';
import { exportProjectToZip, importProjectFromZip } from './services/zipService';
import JSZip from 'jszip';
import { ProjectStateManager } from './services/projectStateManager';
import { AutoSaveService } from './services/autoSaveService';
import { SaveCoordinator, SaveStatus, formatTimeAgo } from './services/saveCoordinator';
import { AutoBackupService, BackupConfig, DEFAULT_BACKUP_CONFIG } from './services/autoBackupService';
import { ProjectHistoryService, HistoryState } from './services/projectHistoryService';
import { MultiTabSyncService, SyncState, ConflictInfo } from './services/multiTabSyncService';

import { 
  PlotEpisode, 
  PipelineStatus,
  MessageLog,
  Project,
  ProjectV2,
  AppSettings,
  Volume,
  Asset,
  NovelStyle,
  WebtoonScript,
  ScriptPanel,
  GenerationTask,
  AlignerReport,
  AssetOptimizationProposal
} from './types';
import { loadConfigFromJSON } from './services/configService';
const configFromJSON = loadConfigFromJSON();


// Default Prompts (No Changes)
const PROMPT_SPLITTER = `# Role: Data Processing Engine (Manju Plot Splitter)
# Language: 输出字段值必须为简体中文；JSON key 按 schema 使用英文。

你是“剧情拆解”流水线组件：只做结构化拆解，不写散文，不扩写，不编造。
你必须严格基于输入 NOVEL TEXT 的事实进行拆分；若信息缺失，允许留空/写“未提及”，禁止脑补。

【核心目标】
把输入文本拆成若干短剧 episodes，忽略原章节边界，按“冲突密度 + 情绪钩子”重新分段。
每个 episode 需要满足：起(铺垫)→承(升级)→转(反转/爆点)→勾(强钩子收尾)。

【重要：分批输入兼容】
如果 NOVEL TEXT 中包含类似 “【PART i/n】” 的标记：
- 你只允许基于该 PART 内的内容生成 episodes
- 不要尝试总结全书/其它 PART
- 不要引用本段以外人物设定或剧情

【拆分规则（硬约束）】
1) 覆盖率：尽量覆盖输入文本的关键事件链；不要只拆开头一小段就结束。
2) 节奏：每个 episode 约等价 1-2 分钟短剧节奏（高压缩叙事）。
3) 去重：不同 episode 不要重复同一事件；如必须重复，用更推进的冲突升级表达。
4) 每集结尾必须是“强钩子”：明确悬念/危机/反转/宣战/暴露身份等。
5) scenes_summary 必须严格是 3 条：
   - 1: 建立场面/人物目标（纯画面化）
   - 2: 冲突升级/对抗动作（纯画面化）
   - 3: 钩子结尾（必须 cliffhanger，留悬念）
   约束：每条尽量 20-50 字，禁止心理独白长段落，禁止泛泛而谈。

【hook_type 选择规范】
- Suspense: 悬念/秘密/身份暴露前夕
- Revenge: 复仇/打脸/反击宣告
- Romance: 情感关系推进/误会/告白/修罗场
- Action: 明确打斗/追逐/爆发性动作
- Face-Slapping: 明确“打脸爽点”（羞辱→反转→跪服）

【hook_intensity 标尺】
1-3: 小冲突；4-6: 中等反转；7-8: 强爆点；9-10: 颠覆性爆点/命运转折

【输出要求（硬约束）】
- 只输出 VALID JSON（不要 markdown，不要解释）
- 根对象必须包含 episodes 数组
- episode_number 必须从 1 开始连续递增
- scenes_summary 必须为长度=3 的数组

【JSON OUTPUT SCHEMA】
{
  "batch_id": "string",
  "episodes": [
    {
      "episode_number": number,
      "title": "string",
      "core_conflict": "string",
      "hook_type": "Suspense" | "Revenge" | "Romance" | "Action" | "Face-Slapping",
      "hook_intensity": number,
      "scenes_summary": ["string", "string", "string"],
      "source_hint": "string"
    }
  ]
}`;

const PROMPT_WRITER = `# Role: AI Manju Director (Cinematic Novel Flow)
# Core Logic: "Immersive 4-Slot Syntax" + "Visual Anchoring"
# Language: STRICTLY Simplified Chinese (简体中文)

# Context
你正在编写用于 AI 视频生成的**高密度分镜脚本**。
目标：将脚本写得像“紧凑的小说”，但每一个字都是可被执行的视觉/听觉指令。

# The "Immersive 4-Slot Syntax" (沉浸式四段句法)
每一行画面描述（Script Line）必须严格遵循以下**从左到右**的逻辑流，中间不换行：

\`▲[Slot 1: 运镜/景别] [Slot 2: 主语+视觉钩子] [Slot 3: 动作+环境音] ： [Slot 4: 台词/独白]\`

### Slot 详解 (关键规则)
1.  **Slot 1 (Camera)**: 必须以 \`▲\` 开头，紧跟运镜术语（如：特写、广角、推镜头）。
2.  **Slot 2 (Visual Anchor)**:
    * **主语**：新分镜必须用全名+后缀（如：\`陆晨玄（战神）\`），同分镜连续动作可用“他/她”。
    * **视觉钩子 (强制括号)**：在主语后**必须**紧跟 \`（）\`，括号内只能写**物理视觉细节**（如：光影、微表情、皮肤纹理、特效状态）。
    * *禁止写抽象情绪*：❌ \`（悲伤）\` -> ✅ \`（眼角红肿、泪水反光）\`。
3.  **Slot 3 (Action & SFX)**:
    * 描述具体的物理动作。
    * 如果动作伴随巨大声响，用 \`【】\` 插入音效词。
    * *示例*：\`猛然挥出一拳【空气爆鸣声】\`。
4.  **Slot 4 (Audio)**:
    * 使用 \`：“...”\` 连接台词。
    * 如果是内心独白，使用 \`(OS)：“...”\`。
    * *如果没有台词，则省略此部分，以句号结尾。*

# Critical Constraints (执行铁律)
1.  **Strict 3-Beat Structure (三拍子)**:
    * 每个分镜 ID (Panel) 必须包含 **3 行** 这样的描述。
    * 逻辑：\`铺垫 -> 冲突 -> 结果\`。
2.  **Auto-Duration Logic (自动时长算法 - 必须执行)**:
    * 你必须根据内容估算该分镜的合理时长，并填入 \`duration\` 字段。
    * **计算公式**：
        * **基础时长**：3个画面动作 ≈ **9秒**。
        * **台词增量**：如果台词总字数超过 15 字，每 5 个字增加 1 秒。
        * **动作修正**：如果是“慢动作/特写凝视”，增加 2 秒；如果是“快速连击/瞬移”，减少 2 秒。
    * *范围约束*：时长必须控制在 **8s - 15s** 之间。
3.  **Smart Subject Tracking**:
    * Line 1: \`陆晨玄（战神）\`
    * Line 2: \`他\` (指代陆晨玄)
    * Line 3: \`他\` (指代陆晨玄)
    * Line 4 (新分镜): \`陆晨玄（战神）\` (恢复全名)

# Output Schema (JSON Structure)
请输出一个 JSON 对象，包含 \`characters\` (人物表), \`scenes\` (场景表), \`storyboard\` (分镜表)。

## 1. Characters List
提取所有登场角色，并赋予详细视觉设定。
\`\`\`json
"characters": [
  {
    "name": "string (e.g., 陆晨玄（战神）- 必须带状态后缀)",
    "description": "string (Format: 【身份】...【面部特征】...【气质】...【服装】...【发型】...【身材】...)"
  }
]
\`\`\`

## 2. Scenes List
提取所有场景，强调环境氛围。
\`\`\`json
"scenes": [
  {
    "name": "string (e.g., 仙朝绝境)",
    "description": "string (Format: 【地理环境】...【光影】...【细节增强】...)"
  }
]
\`\`\`

## 3. Storyboard List (The Core)
\`\`\`json
"storyboard": [
  {
    "id": number,
    "duration": "string (Calculated, e.g. '9s', '12s', '15s')",
    "script_content": "string (MULTI-LINE STRING. SEE EXAMPLE BELOW)",
    "active_characters": "string (Comma separated names)",
    "scene_name": "string (Must match Scenes List)",
    "props": "string (Optional)",
    "visualZh": "string (必须是简体中文！画面总结描述，用于绘图页面展示)"
  }
]
\`\`\`

### visualZh 字段规范（重要！）
**语言要求**: visualZh 字段**必须**使用简体中文，**禁止**夹杂英文。
**内容要求**: 用一段话总结该分镜的核心画面，包括：
  - 角色（用中文名）
  - 动作/姿态
  - 场景环境
  - 光影氛围
  - 关键道具
**示例**: "陆晨玄浴血站立于破碎仙宫废墟，周围雷霆肆虐，他仰天咆哮，身后浮现金色战神残魂虚影，整体氛围悲壮。"

### Example (Good):
"▲广角俯视 陆晨玄（战神，浑身浴血） 孤身立于破碎仙宫，四周雷霆肆虐【雷鸣声】。\\n▲特写 他（眼角崩裂，血泪滑落） 仰天咆哮，身后炸开金色残魂虚影【炸裂声】："北冥幽！你安敢如此对我！"\\n▲画面震动 他（双手结印，指尖发白） 猛然向虚空按去，引发空间坍塌。"

# Workflow
1. 阅读小说原文。
2. 构建人物和场景表。
3. 将剧情拆解为分镜块。
4. 应用自动时长算法计算 duration。
5. 编写 script_content，确保包含 3个▲画面描述行。
6. 输出 JSON。`;

const PROMPT_ALIGNER = `
Role: Webtoon-Aligner (网文改编漫剧一致性校验员).
Language: STRICTLY Simplified Chinese (简体中文).

【任务】
以 plot_breakdown 为核心基准, 逐集检查剧本的一致性和质量。

【技能】
- 剧情还原检查: 验证是否按照plot-breakdown中的剧情点创作
- 跨集连贯检查: 验证与前一集的剧情衔接是否自然连贯
- 节奏控制检查: 验证起承转钩结构清晰
- 视觉化风格检查: 验证是否使用视觉描述符号，画面感是否强
- 格式规范检查: 验证是否符合 script-template 格式
- 心理活动检测: 发现心理描写过多(bubble_style=Thought)

【Output Schema】
{
  "status": "PASS" | "FAIL",
  "score": number,
  "checkpoints": {
    "plot_fidelity": boolean,
    "pacing_control": boolean,
    "visual_impact": boolean,
    "format_compliance": boolean
  },
  "critical_issues": [
    {
      "panel_id": number,
      "issue_type": "Pacing_Too_Slow" | "Too_Much_Thought" | "Low_Conflict" | "Format_Error" | "Logic_Loop" | "Visual_Style" | "Character_OOC",
      "description": "string",
      "suggestion": "string (IMPORTANT: Provide the FULL REVISED VISUAL TEXT. Do NOT use prefixes like 'Suggested change:'. Just output the visual description ready to replace the original.)"
    }
  ]
}
`;

const PROMPT_BREAKDOWN = `
Role: Breakdown-Aligner (网文改编漫剧剧情拆解质量校验员).
Language: STRICTLY Simplified Chinese (简体中文).

【任务】
对剧情拆解(Plot Breakdown)进行全面质量检查。

【重要规则】
如果发现问题，在 issues 中必须提供:
1. "target_episode": 有问题的集数 (episode_number)
2. "target_field": 具体的字段名 ("title" | "core_conflict" | "scenes_summary")
3. "suggestion": **修改后的完整内容** (可以直接采纳覆盖)

【Output Schema】
{
  "batch_id": "string",
  "status": "PASS" | "FAIL",
  "score": number,
  "summary": "string",
  "metrics": {
    "conflict_density_score": number,
    "hook_validity_score": number,
    "pacing_score": number
  },
  "issues": [
    {
      "issue_type": "Conflict_Intensity" | "Hook_Density" | "Split_Rationality" | "Compression_Strategy" | "Original_Fidelity" | "Methodology",
      "target_episode": number,
      "target_field": "title" | "core_conflict",
      "description": "string (详细描述)",
      "suggestion": "string (修正后的完整文本)"
    }
  ]
}
`;

const PROMPT_ASSET = `# Role: AI 视觉资产总监 (基于预设数据的绘图指令生成)
# Language: 简体中文 (用于思考/描述), English (STRICTLY for Image Prompts)

# Context
你处于自动化漫剧生产流的中间环节。
1. **输入 A (结构化资产表)**：上游 Agent 已经提取了人物、场景、道具的详细中文描述（格式为 \`【标签】描述内容\`）。
2. **输入 B (小说原文)**：作为补充参考字典。如果输入 A 中的描述有缺失或模糊（如“待定”），请查阅小说原文进行逻辑补全。

# Task
将输入的结构化中文资产数据，转化为**生产级的视觉资产清单 (JSON)**。
核心任务是将中文描述翻译并润色为**Midjourney/Stable Diffusion 专用的英文提示词**。

# Workflow (工作流)

## Step 1: 解析与映射 (Parse & Map)
直接读取上游提供的 \`characters\`, \`scenes\`, \`items\` 数据。你需要解析其中的 \`【标签】\` 格式，并将其映射到 JSON 的 \`attributes\` 字段中。
* **人物映射规则**:
  - 【身份】 -> identity
  - 【面部特征】 -> face
  - 【气质】 -> vibe
  - 【发型】 -> hair
  - 【身材】 -> body
  - 【服装】 -> clothing
* **场景映射规则**:
  - 【地理环境】 -> environment
  - 【光影】 -> lighting
  - 【细节增强】 -> details

## Step 2: 提示词工程 (Prompt Engineering)
将映射后的中文属性翻译为英文，并套用以下**强制公式**生成 \`prompt\` 字段：

1. **Character Prompt (必须是白底四视图参考图)**:
   - **Formula**: \`Character Design Reference Sheet, masterpiece, best quality, professional concept art. 2x2 grid layout composition with clear borders: [Top-Left] full body front view with neutral A-pose, [Top-Right] full body side profile view (3/4 angle), [Bottom-Left] full body back view, [Bottom-Right] detailed face close-up portrait showing eyes, nose, mouth, expression details. Same character in all four panels, consistent design, consistent proportions, consistent colors. #FFFFFF pure white background, solid white backdrop, isolated subject, clean studio lighting, no shadows on background, high-key lighting, [Identity translation], [Face translation], [Vibe translation], [Hair translation], [Body translation], [Clothing translation].\`
   - *注意：必须保留白色背景关键词以便后期抠图，四个视图必须保持角色设计完全一致。*

2. **Scene Prompt (必须是空镜)**:
   - **Formula**: \`Environment concept art, wide shot, no people, nobody, empty scene, [Environment translation], [Lighting translation], [Details translation], masterpiece, 8k resolution, cinematic lighting, architectural visualization.\`
   - *注意：必须强制包含 "no people, empty scene"。*

3. **Item Prompt (必须是单品特写)**:
   - **Formula**: \`3D Product shot, center composition, [Item Name translation], [Description translation], neutral studio background, 8k, unreal engine 5 render.\`

## Step 3: 格式输出 (JSON Construction)
输出必须严格符合 Schema，不要包含任何 Markdown 说明文字。

# Output Schema
\`\`\`json
{
  "assets": [
    {
      "type": "character",
      "id": "string (Unique ID, e.g., char_luchenxuan_god)",
      "name": "string (中文名称, e.g., 陆晨玄（战神）)",
      "attributes": {
        "identity": "string (CN)",
        "face": "string (CN)",
        "vibe": "string (CN)",
        "hair": "string (CN)",
        "body": "string (CN)",
        "clothing": "string (CN)"
      },
      "prompt": "string (English Prompt generated in Step 2)",
      "aspectRatio": "1:1"
    },
    {
      "type": "scene",
      "id": "string (Unique ID, e.g., scn_void_chaos)",
      "name": "string (中文名称, e.g., 虚空乱流)",
      "attributes": {
        "environment": "string (CN)",
        "lighting": "string (CN)",
        "details": "string (CN)"
      },
      "prompt": "string (English Prompt generated in Step 2)",
      "aspectRatio": "16:9"
    },
    {
      "type": "item",
      "id": "string (Unique ID, e.g., item_jade_amulet)",
      "name": "string (中文名称, e.g., 神秘玉符)",
      "description": "string (CN)",
      "prompt": "string (English Prompt generated in Step 2)",
      "aspectRatio": "1:1"
    }
  ]
}
\`\`\``;

const PROMPT_STYLE = `
Role: Literary & Visual Style Analyzer.
Task: Analyze the input novel text and extract a visual style definition for AI Image Generation.
Output JSON Schema: { "name": "string (Short Style Name)", "prompt": "string (Detailed English visual prompt keywords, e.g., lighting, color palette, atmosphere)" }
`;

const PROMPT_ARCHIVIST = `Role: Archivist. Summarize plot and update character status for Story Bible. Output JSON.`;

const DEFAULT_SETTINGS: AppSettings = {
  ...configFromJSON,

  splitterModel: configFromJSON.splitterModel || 'gemini-3-flash-preview-nothinking',
  writerModel: configFromJSON.writerModel || 'gemini-3-flash-preview-nothinking',
  alignerModel: configFromJSON.alignerModel || 'gemini-3-flash-preview-nothinking',
  imageModel: configFromJSON.imageModel || 'gemini-2.5-flash-image-preview',
  storageKeyPrefix: 'automanju_projects',

  // Video generation defaults (16:9 recommended for character consistency)
  veoEnhancePrompt: true,  // Default: enable AI prompt optimization
  veoAspectRatio: '16:9',  // Default: horizontal video (better for scene/character stability)

  // Storyboard prompt language defaults
  shotPromptLanguage: 'bilingual',
  
  // Sound notification defaults
  soundEnabled: true,   // Default: enable sound notifications
  soundVolume: 1.0,     // Default: full volume

  // // Default Prompts
  // splitterPrompt: PROMPT_SPLITTER,
  // writerPrompt: PROMPT_WRITER,
  // alignerPrompt: PROMPT_ALIGNER,
  // breakdownPrompt: PROMPT_BREAKDOWN,
  // assetPrompt: PROMPT_ASSET,
  // stylePrompt: PROMPT_STYLE,
  // archivistPrompt: PROMPT_ARCHIVIST,

  // storageKeyPrefix: 'automanju_projects',
  // apiKey 由 config.json / UI 设置提供，不在此硬编码
  // apiBaseUrl: 'https://api.whatai.cc/v1/chat/completions',
  // customModels: []
};

// Define busy statuses that should block user input (Global Pipeline)
const BUSY_STATUSES: PipelineStatus[] = ['SPLITTING', 'BREAKDOWN_ALIGNING', 'WRITING', 'ALIGNING', 'AUTO_FIXING', 'GENERATING_IMAGE', 'ARCHIVING'];

export const App = () => {
  // ============================================================================
  // Agent debug log (disabled by default)
  // To enable in DevTools (DEV only): localStorage.setItem('ENABLE_AGENT_LOG', '1')
  // ============================================================================
  const agentLog = useCallback((payload: Record<string, unknown>) => {
      try {
          if (!(import.meta as any)?.env?.DEV) return;
          if (typeof window === 'undefined') return;
          if (window.localStorage.getItem('ENABLE_AGENT_LOG') !== '1') return;
          // 仅输出到浏览器控制台，不向任何外部端点发送数据
          console.debug('[agent-log]', payload);
      } catch {
          // no-op
      }
  }, []);

  const autoLinkAssetsForPanel = useCallback((panel: ScriptPanel, assets: Asset[]) => {
      const text = [
          panel.scene_name,
          panel.active_characters_str,
          panel.props,
          panel.script_content,
          panel.composition,
          panel.visual,
      ]
        .filter(Boolean)
        .join('\n');
      
      if (!text.trim()) {
          return { relatedAssetIds: panel.relatedAssetIds || [], relatedItemIds: panel.relatedItemIds || [] };
      }
      
      const firstIndexOf = (haystack: string, needle: string): number => {
          const idx = haystack.indexOf(needle);
          return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
      };
      
      const matched = assets
        .map(a => ({
            asset: a,
            idx: a.name ? firstIndexOf(text, a.name) : Number.POSITIVE_INFINITY,
        }))
        .filter(x => x.idx !== Number.POSITIVE_INFINITY)
        .sort((a, b) => a.idx - b.idx)
        .map(x => x.asset);
      
      // Cap to avoid overlinking; keep consistent with StoryboardBoard "✨ 一键关联"
      const chars = matched.filter(a => a.type === 'character').slice(0, 8);
      const scenes = matched.filter(a => a.type === 'scene').slice(0, 2);
      const items = matched.filter(a => a.type === 'item').slice(0, 12);
      
      const relatedAssetIds = [...chars.map(a => a.id), ...scenes.map(a => a.id)];
      const relatedItemIds = items.map(a => a.id);
      
      // If nothing matched, keep any existing links (avoid wiping manual work)
      const hasExisting =
        (panel.relatedAssetIds?.length || 0) > 0 || (panel.relatedItemIds?.length || 0) > 0;
      const hasNew = relatedAssetIds.length > 0 || relatedItemIds.length > 0;
      if (!hasNew && hasExisting) {
          return { relatedAssetIds: panel.relatedAssetIds || [], relatedItemIds: panel.relatedItemIds || [] };
      }
      
      return { relatedAssetIds, relatedItemIds };
  }, []);

  const autoLinkAssetsForScript = useCallback((script: WebtoonScript, assets: Asset[]) => {
      const panels = script.panels || [];
      let linkedPanelsCount = 0;
      let totalLinkedAssetRefs = 0;
      let totalLinkedItemRefs = 0;
      
      const updatedPanels = panels.map(p => {
          const { relatedAssetIds, relatedItemIds } = autoLinkAssetsForPanel(p, assets);
          const hasLinks = relatedAssetIds.length > 0 || relatedItemIds.length > 0;
          if (hasLinks) {
              linkedPanelsCount += 1;
              totalLinkedAssetRefs += relatedAssetIds.length;
              totalLinkedItemRefs += relatedItemIds.length;
          }
          return { ...p, relatedAssetIds, relatedItemIds };
      });
      
      return {
          script: { ...script, panels: updatedPanels },
          stats: { linkedPanelsCount, totalLinkedAssetRefs, totalLinkedItemRefs },
      };
  }, [autoLinkAssetsForPanel]);

  // Validate Aligner suggestion for Micro-Montage 3-line contract
  const isValidMicroMontageSuggestion = useCallback((text: string | undefined | null): boolean => {
      if (!text) return false;
      const lines = String(text)
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      if (lines.length !== 3) return false;
      return lines.every(l => l.startsWith('▲'));
  }, []);
  // --- Global App State ---
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'SCRIPT' | 'ASSETS' | 'STORYBOARD' | 'SETTINGS'>('DASHBOARD');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<PipelineStatus>('IDLE');
  
  // New: Track specific items being generated (assets or panels) to avoid blocking the whole UI
  const [generatingItemIds, setGeneratingItemIds] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  
  // Asset optimization state
  const [optimizationProposals, setOptimizationProposals] = useState<AssetOptimizationProposal[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // New: Track which episodes are currently generating scripts (for parallel generation)
  const [generatingEpisodes, setGeneratingEpisodes] = useState<Set<number>>(new Set());
  
  // Helper: Check if a specific episode is generating
  const isEpisodeGenerating = useCallback((epNum: number) => {
    return generatingEpisodes.has(epNum);
  }, [generatingEpisodes]);

  // --- Workspace State ---
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);

  // --- Project State ---
  const [projectsList, setProjectsList] = useState<Project[]>([]); // List from workspace scan
  const [project, setProject] = useState<Project | null>(null);    // Active Project
  const [projectStateManager, setProjectStateManager] = useState<ProjectStateManager | null>(null);
  const [autoSaveService, setAutoSaveService] = useState<AutoSaveService | null>(null);
  // Map of project IDs to their directory handles (for quick access)
  const [projectDirMap, setProjectDirMap] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
  // Ref to access latest projectDirMap in callbacks (avoid stale closure)
  const projectDirMapRef = useRef<Map<string, FileSystemDirectoryHandle>>(projectDirMap);
  useEffect(() => { projectDirMapRef.current = projectDirMap; }, [projectDirMap]);
  
  // Derived Volume Data
  const activeVolume = project?.volumes.find(v => v.id === project.activeVolumeId) || null;
  const rawText = activeVolume?.content || "";
  const plotBreakdown = activeVolume?.plotBreakdown || null;
  const scriptCache = activeVolume?.scriptCache || {};
  const reportCache = activeVolume?.reportCache || {};
  const breakdownReport = activeVolume?.breakdownReport || null;

  // --- UI State ---
  const [selectedEpisode, setSelectedEpisode] = useState<PlotEpisode | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBibleModalOpen, setIsBibleModalOpen] = useState(false);
  
  // New: Style Modal state managed here now
  const [showStyleModal, setShowStyleModal] = useState(false);

  // New: Panel Highlighting State for QA interaction
  const [highlightedPanelId, setHighlightedPanelId] = useState<number | null>(null);
  // Counter for generating unique log IDs
  const [logCounter, setLogCounter] = useState(0);

  // Derived UI
  const currentScript = selectedEpisode ? scriptCache[selectedEpisode.episode_number] || null : null;
  const currentReport = selectedEpisode ? reportCache[selectedEpisode.episode_number] || null : null;
  
  // Advanced Panel Count Logic (High Compression / De-watering)
  // IMPORTANT: Must be computed based on the episode being generated, not only selectedEpisode,
  // otherwise clicking "生成脚本" in the list (stopPropagation) can reuse a stale/default value.
  const getSuggestedPanelCount = useCallback((ep: PlotEpisode | null): number => {
     if (!ep) return 6; // Default lowered
     
     const summaryText = Array.isArray(ep.scenes_summary) 
        ? ep.scenes_summary.join(" ") 
        : String(ep.scenes_summary || "");
     
     const intensity = ep.hook_intensity || 5;

     // 1. Pre-processing (Remove bracketed content like thoughts or notes)
     const cleanText = summaryText.replace(/（[^）]*）|\([^)]*\)/g, "");

     // 2. Identify "Raw Shots"
     // Logic: A continuous dialogue counts as 1 chunk. Narrative text counts as chunks.
     const quoteMatches = cleanText.match(/“|”|"/g) || [];
     const dialogueLines = quoteMatches.length / 2;
     
     // Narrative calculation: assume ~80 chars of pure narrative = 1 core visual shot
     // (Deducting approx length of dialogue to isolate narrative)
     const narrativeLength = Math.max(0, cleanText.length - (dialogueLines * 20)); 
     const narrativeShots = Math.max(0, narrativeLength / 80);

     const potentialShots = dialogueLines + narrativeShots;

     // 3. 3-to-1 Compression
     // The core requirement: max 3 shots merge into 1 panel
     const basePanels = potentialShots / 2.5; 

     // 4. Conflict Filter
     // Only keep details for high conflict; aggressively compress low conflict
     let multiplier = 0.9; 
     if (intensity >= 9) {
       multiplier = 1.1; // Core conflict: keep slightly more detail
     } else if (intensity <= 6) {
       multiplier = 0.8; // Transitional/Low: compress further
     }

     const finalCount = basePanels * multiplier;

     // 5. Strict Range Clamping
     // NOTE: A too-small panel count (e.g., 4) often makes the episode feel discontinuous.
     // Keep a higher minimum for narrative continuity.
     return Math.max(6, Math.min(12, Math.round(finalCount)));
  }, []);

  const suggestedPanelCount = useMemo(() => getSuggestedPanelCount(selectedEpisode), [getSuggestedPanelCount, selectedEpisode]);

  // Check if app is busy
  const isBusy = BUSY_STATUSES.includes(status);

  // --- Initialization ---
  useEffect(() => {
    // Initialize database first
    const initApp = async () => {
      try {
        const dbReady = await initializeDatabase();
        if (!dbReady) {
          // Database upgrade failed - show reset dialog
          const shouldReset = confirm(
            '数据库升级失败。这通常是因为数据库结构不兼容。\n\n' +
            '是否重置数据库？这将清除浏览器中存储的项目元数据。\n\n' +
            '注意：如果您使用工作区模式，项目文件不会丢失，重置后重新选择工作区即可恢复。'
          );
          
          if (shouldReset) {
            await resetDatabase();
            addLog('数据库已重置，正在重新加载...', 'info');
            location.reload();
            return;
          } else {
            addLog('数据库初始化失败，应用可能无法正常工作', 'error');
          }
        }
        
        // Database ready, continue initialization
        loadSettings().then(s => {
          if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
        });
        
        // Try to restore workspace handle from IndexedDB
        initWorkspace();
      } catch (error) {
        console.error('[App] Database initialization error:', error);
        addLog('数据库初始化出错，请刷新页面或重置数据库', 'error');
      }
    };
    
    const initWorkspace = async () => {
      setIsWorkspaceLoading(true);
      try {
        const storedHandle = await loadWorkspaceHandle();
        if (storedHandle) {
          setWorkspaceHandle(storedHandle);
          setWorkspaceName(storedHandle.name);
          // Scan for projects in the workspace
          const projects = await scanWorkspaceProjects(storedHandle);
          setProjectsList(projects);
          
          // Build project directory map
          const dirMap = new Map<string, FileSystemDirectoryHandle>();
          for await (const entry of (storedHandle as any).values()) {
            if (entry.kind === 'directory') {
              try {
                const proj = projects.find(p => entry.name.includes(p.id));
                if (proj) {
                  dirMap.set(proj.id, entry);
                }
              } catch {}
            }
          }
          setProjectDirMap(dirMap);
          
          addLog(`已恢复工作区: ${storedHandle.name}`, 'success');
        } else {
          addLog('请选择工作区文件夹来开始使用', 'info');
        }
      } catch (e) {
        console.error('[Workspace] Failed to restore:', e);
        addLog('工作区恢复失败，请重新选择', 'warning');
      } finally {
        setIsWorkspaceLoading(false);
      }
    };
    
    initApp();
    
    // Initialize services
    const initServices = async () => {
      try {
        // Initialize project state manager without directory handle
        const stateManager = new ProjectStateManager();
        await stateManager.initialize();
        setProjectStateManager(stateManager);
        
        // Initialize auto save service
        const autoSave = new AutoSaveService(stateManager);
        setAutoSaveService(autoSave);
        
        // Add beforeunload listener to flush pending saves
        const handleBeforeUnload = () => {
          if (autoSave) {
            autoSave.flushSaveQueue();
          }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // Cleanup function
        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      } catch (error) {
        console.error('Failed to initialize services:', error);
        addLog('服务初始化失败，部分功能可能不可用', 'error');
      }
    };
    
    initServices();
  }, []);

  // Ensure fileSystem currentDirHandle is set for the active project after refresh.
  // Without this, loadAssetImage('assets/xxx.png') falls back to VirtualRoot and cannot read workspace files.
  useEffect(() => {
    const ensureActiveProjectDirHandle = async () => {
      if (!project?.id) return;

      const existing = projectDirMapRef.current.get(project.id);
      if (existing) {
        setCurrentProjectDir(existing);
        return;
      }

      if (!workspaceHandle) return;

      try {
        for await (const entry of (workspaceHandle as any).values()) {
          if (entry?.kind === 'directory' && typeof entry.name === 'string' && entry.name.includes(project.id)) {
            setProjectDirMap(prev => new Map(prev).set(project.id, entry));
            setCurrentProjectDir(entry);
            return;
          }
        }
      } catch (e) {
        console.warn('[Workspace] Failed to auto-bind project dir handle after refresh:', e);
      }
    };

    ensureActiveProjectDirHandle();
  }, [project?.id, workspaceHandle, projectDirMapRef]);

  const refreshProjectsList = useCallback(async () => {
    // Primary: Scan workspace directory if available
    if (workspaceHandle) {
      try {
        console.log('[Refresh] Scanning workspace for projects...');
        const projects = await scanWorkspaceProjects(workspaceHandle);
        setProjectsList(projects);
        
        // Update project directory map
        const dirMap = new Map<string, FileSystemDirectoryHandle>();
        for await (const entry of (workspaceHandle as any).values()) {
          if (entry.kind === 'directory') {
            const proj = projects.find(p => entry.name.includes(p.id));
            if (proj) {
              dirMap.set(proj.id, entry);
            }
          }
        }
        setProjectDirMap(dirMap);
        
        console.log(`[Refresh] Found ${projects.length} projects in workspace`);
        return;
      } catch (e) {
        console.error("[Refresh] Failed to scan workspace:", e);
        addLog("扫描工作区失败", "error");
      }
    }
    
    // No workspace - show empty list
    console.log('[Refresh] No workspace available');
    setProjectsList([]);
  }, [workspaceHandle]);

  const addLog = useCallback((text: string, type: MessageLog['type'] = 'info') => {
    // 使用更可靠的唯一 ID 生成方式，避免重复
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${performance.now()}`;
    setLogs(prev => [...prev, { id: uniqueId, timestamp: new Date(), type, text }]);
  }, []);

  // Helper to ensure project has a valid directory handle
  const ensureProjectDir = useCallback(async (): Promise<boolean> => {
    if (!project) {
      addLog("请先选择项目", "error");
      return false;
    }
    
    // Check if handle exists
    const dirHandle = projectDirMapRef.current.get(project.id);
    if (dirHandle) {
      return true; // Already has handle
    }
    
    // No handle - try to create one if workspace is available
    if (!workspaceHandle) {
      addLog("请先选择工作区文件夹以启用本地存储", "warning");
      return true; // Allow operation but with virtual FS (backward compat)
    }
    
    try {
      const safeName = (project.name || 'project')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 40);
      const dirName = `${safeName}_${project.id}`;
      const newDirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
      setProjectDirMap(prev => new Map(prev).set(project.id, newDirHandle));
      setCurrentProjectDir(newDirHandle);
      console.log('[Project] Auto-created directory:', dirName);
      return true;
    } catch (e) {
      console.warn('[Project] Failed to create directory:', e);
      addLog("无法创建项目目录，使用临时存储", "warning");
      return true; // Allow operation but with virtual FS
    }
  }, [project, workspaceHandle, addLog]);

  // removeLog no longer needed - logs are now in a persistent history panel

  const handleTaskStart = useCallback((desc: string, type: 'image' | 'text' = 'image', model: string = 'unknown') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 5);
    const newTask: GenerationTask = {
      id,
      source: desc,
      type: type,
      model: model,
      status: 'processing',
      createdAt: Date.now()
    };
    setTasks(prev => [newTask, ...prev]);
    return id;
  }, []);

  const handleTaskFinish = useCallback((id: string, status: 'success' | 'error') => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, finishedAt: Date.now() } : t));
  }, []);

  // --- Workspace Management ---
  
  const handleSelectWorkspace = async () => {
    try {
      const { handle, mode } = await openDirectory();
      
      if (mode === 'virtual') {
        addLog('当前环境不支持本地文件夹，请使用 Chrome 浏览器', 'error');
        return;
      }
      
      // Save workspace handle to IndexedDB
      await saveWorkspaceHandle(handle);
      
      setWorkspaceHandle(handle);
      setWorkspaceName(handle.name);
      
      // Scan for projects
      const projects = await scanWorkspaceProjects(handle);
      setProjectsList(projects);
      
      // Build project directory map
      const dirMap = new Map<string, FileSystemDirectoryHandle>();
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'directory') {
          const proj = projects.find(p => entry.name.includes(p.id));
          if (proj) {
            dirMap.set(proj.id, entry);
          }
        }
      }
      setProjectDirMap(dirMap);
      
      addLog(`已选择工作区: ${handle.name} (${projects.length} 个项目)`, 'success');
    } catch (e: any) {
      if (e.message === "用户取消了操作") {
        return;
      }
      console.error('[Workspace] Failed to select:', e);
      addLog(`选择工作区失败: ${e.message}`, 'error');
    }
  };
  
  const handleSwitchWorkspace = async () => {
    // Clear current workspace
    await clearWorkspaceHandle();
    setWorkspaceHandle(null);
    setWorkspaceName('');
    setProjectsList([]);
    setProjectDirMap(new Map());
    setProject(null);
    
    // Show workspace selection
    await handleSelectWorkspace();
  };

  // --- Helper: Ensure activeVolumeId is valid ---
  const ensureValidActiveVolume = (proj: Project): Project => {
    if (proj.volumes.length > 0) {
      const activeVolumeExists = proj.volumes.some(v => v.id === proj.activeVolumeId);
      if (!activeVolumeExists || !proj.activeVolumeId) {
        return {
          ...proj,
          activeVolumeId: proj.volumes[0].id
        };
      }
    }
    return proj;
  };
  
  // --- Project Management Handlers ---
  
  const handleSelectProject = async (id: string) => {
  const p = projectsList.find(x => x.id === id);
  if (!p) return;
  
  // Set current project directory for file operations
  let dirHandle = projectDirMap.get(id);
  
  // If no handle exists but workspace is available, try to find or create directory
  if (!dirHandle && workspaceHandle) {
    try {
      // First, try to find existing directory by scanning workspace
      for await (const entry of (workspaceHandle as any).values()) {
        if (entry.kind === 'directory' && entry.name.includes(id)) {
          dirHandle = entry;
          console.log('[Project] Found existing directory:', entry.name);
          break;
        }
      }
      
      // If still not found, create a new one
      if (!dirHandle) {
        const safeName = (p.name || 'project')
          .replace(/[\\/:*?"<>|]/g, '_')
          .replace(/\s+/g, '_')
          .slice(0, 40);
        const dirName = `${safeName}_${id}`;
        dirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
        console.log('[Project] Created new directory:', dirName);
      }
      
      // Update directory map
      if (dirHandle) {
        setProjectDirMap(prev => new Map(prev).set(id, dirHandle!));
      }
    } catch (e) {
      console.warn('[Project] Failed to setup directory:', e);
    }
  }
  
  if (dirHandle) {
    setCurrentProjectDir(dirHandle);
    
    // CRITICAL FIX: Always reload from file system to get latest data
    // projectsList contains stale snapshots from initial scan
    try {
      agentLog({ location: 'App.tsx:handleSelectProject:reloadFromFS', message: 'Reloading project from file system', data: { projectId: id, cachedVolumeCount: p.volumes?.length || 0 }, timestamp: Date.now() });
      
      const freshProject = await loadProjectFromDirWithHandle(dirHandle);
      
      if (freshProject) {
        agentLog({ location: 'App.tsx:handleSelectProject:reloadedFromFS', message: 'Fresh project loaded from FS', data: { projectId: freshProject.id, volumeCount: freshProject.volumes?.length || 0, firstVolumeContentLength: freshProject.volumes?.[0]?.content?.length || 0 }, timestamp: Date.now() });
        
        // Ensure activeVolumeId is valid before setting project
        const validatedProject = ensureValidActiveVolume(freshProject);
        
        // Update projectsList with fresh data
        setProjectsList(prev => prev.map(proj => proj.id === validatedProject.id ? validatedProject : proj));
        
        // If using state manager, update it as well
        if (projectStateManager) {
          const isV2 = 'version' in validatedProject && (validatedProject as any).version === '2.0';
          if (isV2) {
            await projectStateManager.loadFullProject(validatedProject as any);
          } else {
            // Convert to V2 and save
            const projectV2: ProjectV2 = {
              ...validatedProject,
              version: '2.0',
              createdAt: (validatedProject as any).createdAt || Date.now(),
              volumeIndex: validatedProject.volumes.map(v => ({
                id: v.id,
                name: v.name,
                order: v.order || (validatedProject.volumes.indexOf(v) + 1)
              }))
            };
            projectStateManager.setCurrentProject(projectV2);
            await projectStateManager.saveProjectToDB(projectV2);
            for (const volume of validatedProject.volumes) {
              await projectStateManager.updateVolume(validatedProject.id, volume.id, volume);
            }
          }
        }
        
        setProject(validatedProject);
        setCurrentView('SCRIPT');
        addLog(`已加载项目: ${freshProject.name}`);
        return;
      }
    } catch (e) {
      console.warn('[Project] Failed to reload from file system:', e);
      agentLog({ location: 'App.tsx:handleSelectProject:reloadFailed', message: 'Reload from FS failed, using cache', data: { projectId: id, error: String(e) }, timestamp: Date.now() });
      // Fall through to use cached data
    }
  }
  
  // Fallback: If projectStateManager is available, try to load the full project data
  if (projectStateManager) {
    try {
      // Check if this is a V2 project
      const isV2 = 'version' in p && p.version === '2.0';
      
      agentLog({ location: 'App.tsx:handleSelectProject', message: 'Loading project', data: { projectId: p.id, isV2, volumeCount: p.volumes?.length || 0 }, timestamp: Date.now() });
      
      if (isV2) {
        // Load V2 project using state manager
        const projectV2 = p as ProjectV2;
        const fullProject = await projectStateManager.loadFullProject(projectV2);
        
        agentLog({ location: 'App.tsx:handleSelectProject:V2loaded', message: 'V2 project loaded via loadFullProject', data: { projectId: fullProject.id, volumeCount: fullProject.volumes?.length || 0, firstVolumeContentLength: fullProject.volumes?.[0]?.content?.length || 0 }, timestamp: Date.now() });
        
        // Ensure customStyles is initialized
        let styles = fullProject.customStyles || [];
        if (styles.length === 0) {
          styles = [];
        }
        
        const projectData = {
          ...fullProject,
          customStyles: styles,
          activeStyle: fullProject.activeStyle || null
        };
        
        setProject(ensureValidActiveVolume(projectData));
        setCurrentView('SCRIPT');
        addLog(`已加载项目: ${fullProject.name}`);
        return;
      } else {
        agentLog({ location: 'App.tsx:handleSelectProject:nonV2', message: 'Non-V2 project, converting and setting currentProject', data: { projectId: p.id, volumeCount: p.volumes?.length || 0 }, timestamp: Date.now() });
        
        // Convert to V2 format and save to database
        const projectV2: ProjectV2 = {
          ...p,
          version: '2.0',
          createdAt: p.createdAt || Date.now(),
          volumeIndex: p.volumes.map(v => ({
            id: v.id,
            name: v.name,
            order: v.order || (p.volumes.indexOf(v) + 1)
          }))
        };
        
        // Ensure volumeIndex is initialized
        if (!projectV2.volumeIndex || !Array.isArray(projectV2.volumeIndex)) {
          projectV2.volumeIndex = [];
        }
        
        // Set current project in state manager BEFORE calling updateVolume
        // This is required because updateVolume needs currentProject to be set
        projectStateManager.setCurrentProject(projectV2);
        
        // Save V2 project to database
        await projectStateManager.saveProjectToDB(projectV2);
        
        // Load all volumes into state manager
        for (const volume of p.volumes) {
          await projectStateManager.updateVolume(p.id, volume.id, volume);
        }
        
        // Ensure customStyles is initialized
        let styles = p.customStyles || [];
        if (styles.length === 0) {
          styles = [];
        }

        const projectData = {
          ...p,
          customStyles: styles,
          activeStyle: p.activeStyle || null
        };
        
        setProject(ensureValidActiveVolume(projectData));
        setCurrentView('SCRIPT');
        addLog(`已加载项目: ${p.name}`);
        return;
      }
    } catch (e) {
      console.error("Failed to load project with state manager:", e);
      addLog("加载项目失败，使用备用方式", "warning");
    }
  }
  
  // Fallback to original implementation
  // Ensure customStyles is initialized for old projects
  let styles = p.customStyles || [];
  if (styles.length === 0) {
    styles = [];
  }

  const projectData = {
    ...p,
    customStyles: styles,
    activeStyle: p.activeStyle || null
  };
  setProject(ensureValidActiveVolume(projectData));
  setCurrentView('SCRIPT');
  addLog(`已加载项目: ${p.name}`);
};

  // Create project - supports both workspace and IndexedDB modes
  const handleCreateProject = async (name: string, cover?: string) => {
    try {
      const projectId = Date.now().toString();
      
      // Mode 1: Workspace available - create in local folder
      if (workspaceHandle) {
        const { project: newProject, dirHandle } = await createProjectInWorkspace(
          workspaceHandle,
          name,
          projectId
        );
        
        // Update with cover if provided
        if (cover) {
          newProject.coverImage = cover;
        }
        
        // IMPORTANT: set current dir handle BEFORE saving.
        // saveProjectToDir/saveProjectMeta rely on fileSystem.ts currentDirHandle.
        setCurrentProjectDir(dirHandle);
        
        // Update project directory map early for future lookups
        setProjectDirMap(prev => new Map(prev).set(newProject.id, dirHandle));
        
        // Save project to directory (may throw NotFoundError if handle invalid)
        try {
          await saveProjectToDir(newProject);
        } catch (err: any) {
          // Graceful downgrade: keep project usable in IndexedDB if FS save fails
          console.error('Local FS save failed during create, fallback to IndexedDB:', err);
          await saveProject(newProject);
          addLog('本地保存失败，已降级为浏览器存储（IndexedDB）。建议重新选择工作区文件夹以恢复本地存储。', 'warning');
        }
        
        // Refresh projects list to show the new project
        await refreshProjectsList();
        
        addLog(`项目 "${newProject.name}" 创建成功（本地存储）`, 'success');
        
        // Auto-open the newly created project
        setProject(newProject);
        setCurrentView('SCRIPT');
      } 
      // Mode 2: No workspace - use IndexedDB (fallback)
      else {
        const newProject: Project = {
          id: projectId,
          name,
          coverImage: cover,
          createdAt: Date.now(),
          lastModified: Date.now(),
          volumes: [],
          assets: [],
          customStyles: [],
          activeStyle: null,
          activeVolumeId: null,
          totalBudget: 0,
        };
        
        // Save to IndexedDB via state manager
        if (projectStateManager) {
          const projectV2: ProjectV2 = {
            ...newProject,
            version: '2.0',
            volumeIndex: []
          };
          await projectStateManager.saveProjectToDB(projectV2);
        } else {
          await saveProject(newProject);
        }
        
        // Update projects list
        setProjectsList(prev => [newProject, ...prev]);
        
        addLog(`项目 "${name}" 创建成功（浏览器存储）`, 'success');
        addLog('提示：选择工作区文件夹可启用本地存储', 'info');
        
        // Auto-open the newly created project
        setProject(newProject);
        setCurrentView('SCRIPT');
      }
    } catch (e: any) {
      console.error("Failed to create project:", e);
      addLog(`创建项目失败: ${e.message}`, 'error');
    }
  };

  const handleCreateVolume = async (name: string) => {
    if (!project) return;
    
    // Create a new volume
    const newVolume: Volume = {
      id: Date.now().toString(),
      name,
      content: "",
      plotBreakdown: null,
      scriptCache: {},
      reportCache: {},
      breakdownReport: null,
      order: (project.volumes?.length || 0) + 1
    };
    
    // If projectStateManager is available, use it to create the volume
    if (projectStateManager) {
      try {
        // Create volume using state manager
        const volumeId = await projectStateManager.createVolume(project.id, name);
        
        // Create the full volume object for local state
        const createdVolume: Volume = {
          id: volumeId,
          name,
          content: "",
          plotBreakdown: null,
          scriptCache: {},
          reportCache: {},
          breakdownReport: null,
          order: (project.volumes?.length || 0) + 1
        };
        
        // Update project state
        const updatedProject = {
          ...project,
          volumes: [...project.volumes, createdVolume],
          activeVolumeId: volumeId,
          lastModified: Date.now()
        };
        
        setProject(updatedProject);
        addLog(`已创建卷: ${name}`, "success");
        
        // Trigger auto-save
        if (autoSaveService) {
          autoSaveService.saveProject(project.id);
        }
        
        return;
      } catch (e) {
        console.error("Failed to create volume with state manager:", e);
        addLog("创建卷失败，使用备用方式", "warning");
      }
    }
    
    // Fallback to original implementation
    const updatedProject = {
      ...project,
      volumes: [...project.volumes, newVolume],
      activeVolumeId: newVolume.id,
      lastModified: Date.now()
    };
    
    await saveCurrentProject(updatedProject);
    addLog(`已创建卷: ${name}`, "success");
  };

  const handleDeleteVolume = async (volumeId: string) => {
    if (!project) return;
    
    // If projectStateManager is available, use it to delete the volume
    if (projectStateManager) {
      try {
        // Delete volume using state manager
        await projectStateManager.deleteVolume(project.id, volumeId);
        
        // Update project state
        const newVolumes = project.volumes.filter(v => v.id !== volumeId);
        const newActiveVolumeId = project.activeVolumeId === volumeId 
          ? (newVolumes.length > 0 ? newVolumes[0].id : "")
          : project.activeVolumeId;
        
        const updatedProject = {
          ...project,
          volumes: newVolumes,
          activeVolumeId: newActiveVolumeId,
          lastModified: Date.now()
        };
        
        setProject(updatedProject);
        addLog("卷已删除", "success");
        
        // Trigger auto-save
        if (autoSaveService) {
          autoSaveService.saveProject(project.id);
        }
        
        return;
      } catch (e) {
        console.error("Failed to delete volume with state manager:", e);
        addLog("删除卷失败，使用备用方式", "warning");
      }
    }
    
    // Fallback to original implementation
    const newVolumes = project.volumes.filter(v => v.id !== volumeId);
    const newActiveVolumeId = project.activeVolumeId === volumeId 
      ? (newVolumes.length > 0 ? newVolumes[0].id : "")
      : project.activeVolumeId;
    
    const updatedProject = {
      ...project,
      volumes: newVolumes,
      activeVolumeId: newActiveVolumeId,
      lastModified: Date.now()
    };
    
    await saveCurrentProject(updatedProject);
    addLog("卷已删除", "success");
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const isDeletingCurrent = project?.id === id;
      const projectToDelete = projectsList.find(p => p.id === id);
      console.log("[Delete] Starting deletion for project:", id);
      
      // Step 1: Delete from local file system (if in workspace mode)
      if (workspaceHandle && projectToDelete) {
        const dirHandle = projectDirMap.get(id);
        if (dirHandle) {
          try {
            console.log("[Delete] Attempting to delete from file system...");
            const safeName = (projectToDelete.name || 'project')
              .replace(/[\\/:*?"<>|]/g, '_')
              .replace(/\s+/g, '_')
              .slice(0, 40);
            const dirName = `${safeName}_${id}`;
            
            const deleted = await deleteProjectFromWorkspace(workspaceHandle, dirName);
            if (deleted) {
              console.log("[Delete] File system deletion successful");
              // Remove from projectDirMap
              setProjectDirMap(prev => {
                const newMap = new Map(prev);
                newMap.delete(id);
                return newMap;
              });
            } else {
              console.warn("[Delete] File system deletion not supported or failed");
            }
          } catch (e) {
            console.error("[Delete] File system deletion error:", e);
            // Continue to IndexedDB deletion even if FS deletion fails
          }
        }
      }
      
      // Step 2: Delete from IndexedDB - try multiple methods
      let dbDeleted = false;
      
      // Method 1: Use projectStateManager
      if (projectStateManager) {
        try {
          console.log("[Delete] Attempting via projectStateManager...");
          await projectStateManager.deleteProjectFromDB(id);
          dbDeleted = true;
          console.log("[Delete] projectStateManager deletion successful");
        } catch (e) {
          console.error("[Delete] projectStateManager failed:", e);
        }
      }
      
      // Method 2: Direct Dexie deletion (always try as backup)
      if (!dbDeleted) {
        try {
          console.log("[Delete] Attempting direct Dexie deletion...");
          await deleteProject(id);
          dbDeleted = true;
          console.log("[Delete] Direct Dexie deletion successful");
        } catch (e) {
          console.error("[Delete] Direct Dexie deletion failed:", e);
        }
      }
      
      // Method 3: Force delete using db directly
      if (!dbDeleted) {
        try {
          console.log("[Delete] Attempting force deletion via db.projects.where...");
          await db.projects.where('id').equals(id).delete();
          dbDeleted = true;
          console.log("[Delete] Force deletion successful");
        } catch (e) {
          console.error("[Delete] Force deletion failed:", e);
          throw new Error(`无法删除项目。请尝试刷新页面后重试。`);
        }
      }
      
      // Step 3: Update UI state
      await refreshProjectsList();
      
      if (isDeletingCurrent) {
        setProject(null);
        setCurrentView('DASHBOARD');
      }
      
      addLog("项目已删除", "success");
    } catch (e: any) {
      console.error("[Delete] All deletion methods failed:", e);
      addLog(`删除失败: ${e.message}`, "error");
      throw e; // Rethrow to let UI handle the error alert
    }
  };

  // --- [NEW] Handler: Project Update (Edit Name/Cover) ---
  const handleUpdateProject = async (projectId: string, name: string, cover?: string) => {
    const targetProject = projectsList.find(p => p.id === projectId);
    if (!targetProject) return;

    const updatedProject = {
      ...targetProject,
      name: name,
      coverImage: cover || targetProject.coverImage, // Keep old if not updated
      lastModified: Date.now()
    };

    // If projectStateManager is available, use it to update the project
    if (projectStateManager) {
      try {
        await projectStateManager.updateProject(projectId, updatedProject);
        
        // Update projects list
        await refreshProjectsList();
        
        // If updating current active project, sync state
        if (project?.id === projectId) {
          setProject(updatedProject);
        }
        
        // Trigger auto-save
        if (autoSaveService) {
          autoSaveService.saveProject(projectId);
        }
        
        addLog(`项目已更新: ${name}`, 'success');
        return;
      } catch (e) {
        console.error("Failed to update project with state manager:", e);
        addLog("更新项目失败，使用备用方式", "warning");
      }
    }
    
    // Fallback to original implementation
    await saveProject(updatedProject);
    await refreshProjectsList();
    
    // If updating current active project, sync state
    if (project?.id === projectId) {
      setProject(updatedProject);
    }
    addLog(`项目已更新: ${name}`, 'success');
  };

  const handleUpdateVolume = async (volumeId: string, updates: Partial<Volume>) => {
    if (!project) return;
    
    // If projectStateManager is available, use it to update the volume
    if (projectStateManager) {
      try {
        // Get the current volume
        const currentVolume = project.volumes.find(v => v.id === volumeId);
        if (!currentVolume) return;
        
        // Update volume using state manager
        const updatedVolume = { ...currentVolume, ...updates };
        await projectStateManager.updateVolume(project.id, volumeId, updatedVolume);
        
        // Update project state
        const newVolumes = project.volumes.map(v => v.id === volumeId ? { ...v, ...updates } : v);
        const updatedProject = {
          ...project,
          volumes: newVolumes,
          lastModified: Date.now()
        };
        
        setProject(updatedProject);
        
        // Trigger auto-save for the specific volume
        if (autoSaveService) {
          // Determine what type of data was updated and save accordingly
          if ('content' in updates) {
            autoSaveService.saveVolumeContent(project.id, volumeId);
          } else if ('plotBreakdown' in updates) {
            autoSaveService.savePlotBreakdown(project.id, volumeId);
          } else if ('scriptCache' in updates) {
            // Save specific script if episode number is provided
            const episodeNumber = Object.keys(updates.scriptCache || {})[0];
            if (episodeNumber) {
              autoSaveService.saveScript(project.id, volumeId, parseInt(episodeNumber));
            }
          } else if ('reportCache' in updates) {
            // Save specific report if episode number is provided
            const episodeNumber = Object.keys(updates.reportCache || {})[0];
            if (episodeNumber) {
              autoSaveService.saveReport(project.id, volumeId, parseInt(episodeNumber));
            }
          } else {
            // Generic volume save
            autoSaveService.saveVolume(project.id, volumeId);
          }
        }
        
        addLog("卷内容已更新", "success");
        return;
      } catch (e) {
        console.error("Failed to update volume with state manager:", e);
        addLog("更新卷内容失败，使用备用方式", "warning");
      }
    }
    
    // Fallback to original implementation
    const newVolumes = project.volumes.map(v => v.id === volumeId ? { ...v, ...updates } : v);
    const updatedProject = {
      ...project,
      volumes: newVolumes,
      lastModified: Date.now()
    };
    
    await saveCurrentProject(updatedProject);
    addLog("卷内容已更新", "success");
  };

  const handleExportProject = async (format: 'json' | 'zip') => {
    if (!project) return;
    
    try {
      // If projectStateManager is available, get project with volumes
      let exportProject = project;
      if (projectStateManager) {
        try {
          // Get full project data with volumes
          const fullProject = await projectStateManager.getProjectWithVolumes(project.id);
          if (fullProject) {
            exportProject = fullProject;
          }
        } catch (e) {
          console.error("Failed to get full project with state manager:", e);
          addLog("获取完整项目数据失败，使用当前数据", "warning");
        }
      }
      
      if (format === 'json') {
        const dataStr = JSON.stringify({ project: exportProject }, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `${project.name}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        addLog("项目导出为JSON", 'success');
      } else if (format === 'zip') {
        addLog("正在打包资源 (ZIP)...", "info");
        const count = await exportProjectToZip(exportProject);
        addLog(`项目导出成功！包含 ${count} 个媒体文件。`, 'success');
      }
    } catch (e) {
      console.error('Export error:', e);
      addLog("导出项目失败: " + e.message, 'error');
    }
  };

  const handleImportProject = async (file: File) => {
  try {
    // 简单判断文件类型
    if (file.name.endsWith('.json')) {
       alert("检测到旧版 JSON 格式。建议导出为 ZIP 格式以包含图片。");
       const text = await file.text();
       const data = JSON.parse(text) as Project;
       
       const projectId = data.id || Date.now().toString();
       const finalData = { ...data, id: projectId, lastModified: Date.now() };
       
       // If workspace is available, create project directory and save there
       if (workspaceHandle) {
         const safeName = (data.name || 'imported')
           .replace(/[\\/:*?"<>|]/g, '_')
           .replace(/\s+/g, '_')
           .slice(0, 40);
         const dirName = `${safeName}_${projectId}`;
         const projectDirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
         
         // Set current project directory for file operations
         setCurrentProjectDir(projectDirHandle);
         
         // Update project directory map
         setProjectDirMap(prev => new Map(prev).set(projectId, projectDirHandle));
         
         // Save to local directory
         await saveProjectToDirWithHandle(finalData, projectDirHandle);
       }
       
       // Also save to IndexedDB for metadata
       if (projectStateManager) {
         try {
           const projectV2: ProjectV2 = {
             ...finalData,
             version: '2.0',
             volumeIndex: finalData.volumes ? finalData.volumes.map(v => ({
               id: v.id,
               name: v.name,
               order: v.order
             })) : []
           };
           await projectStateManager.saveProjectToDB(projectV2);
           if (finalData.volumes) {
             for (const volume of finalData.volumes) {
               await projectStateManager.updateVolume(projectV2.id, volume.id, volume);
             }
           }
         } catch (e) {
           console.warn("Failed to save to IndexedDB:", e);
         }
       }
       
       await refreshProjectsList();
       addLog("旧版 JSON 导入成功 (无图片)", "warning");
       return;
    }

    addLog("正在解压项目包...", "info");
    
    // Parse ZIP to get project info first
    const zip = new JSZip();
    await zip.loadAsync(file);
    
    // Read project.json to get project info
    const projectJsonFile = zip.file("project.json");
    if (!projectJsonFile) {
      throw new Error("ZIP 文件中缺少 project.json");
    }
    const projectJson = await projectJsonFile.async('text');
    const projectData = JSON.parse(projectJson) as Project;
    
    const projectId = projectData.id || Date.now().toString();
    let projectDirHandle: FileSystemDirectoryHandle | null = null;
    
    // If workspace is available, create project directory BEFORE importing
    // This ensures saveImageToAssets uses the correct directory
    if (workspaceHandle) {
      const safeName = (projectData.name || 'imported')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 40);
      const dirName = `${safeName}_${projectId}`;
      projectDirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
      
      // Set current project directory BEFORE importing
      // This ensures all saveImageToAssets calls use the correct directory
      setCurrentProjectDir(projectDirHandle);
      
      // Update project directory map
      setProjectDirMap(prev => new Map(prev).set(projectId, projectDirHandle!));
    }
    
    // Now import - saveImageToAssets will use the correct directory if available
    const importedProject = await importProjectFromZip(file);
    
    // 强制更新最后修改时间，使其排在最前
    const finalProject = { ...importedProject, id: projectId, lastModified: Date.now() };
    
    // Save project metadata to local directory if workspace is available
    if (projectDirHandle) {
      await saveProjectToDirWithHandle(finalProject, projectDirHandle);
    }
    
    // Also save to IndexedDB for metadata
    if (projectStateManager) {
      try {
        const projectV2: ProjectV2 = {
          ...finalProject,
          version: '2.0',
          volumeIndex: finalProject.volumes ? finalProject.volumes.map(v => ({
            id: v.id,
            name: v.name,
            order: v.order
          })) : []
        };
        await projectStateManager.saveProjectToDB(projectV2);
        if (finalProject.volumes) {
          for (const volume of finalProject.volumes) {
            await projectStateManager.updateVolume(projectV2.id, volume.id, volume);
          }
        }
      } catch (e) {
        console.warn("Failed to save to IndexedDB:", e);
      }
    }
    
    await refreshProjectsList();
    addLog(`项目 "${finalProject.name}" 导入成功`, 'success');

  } catch (e: any) {
    console.error(e);
    addLog(`导入失败: ${e.message}`, 'error');
    alert(`导入失败: 文件可能已损坏或格式不正确。`);
  }
};

  // --- SaveCoordinator Instance ---
  const saveCoordinatorRef = useRef<SaveCoordinator | null>(null);
  
  // Initialize SaveCoordinator
  useEffect(() => {
    if (!saveCoordinatorRef.current) {
      saveCoordinatorRef.current = new SaveCoordinator({
        enableDualWrite: true,
        enableRetry: true,
        retryOptions: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 5000
        }
      });
    }
  }, []);
  
  // --- Save Status State ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    isSaving: false,
    lastSavedTime: null,
    pendingChanges: 0,
    lastError: null,
    partialFailure: false
  });
  
  // Subscribe to save status changes
  useEffect(() => {
    const coordinator = saveCoordinatorRef.current;
    if (!coordinator) return;
    
    const unsubscribe = coordinator.subscribe((status) => {
      setSaveStatus(status);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // --- AutoBackupService Instance ---
  const autoBackupServiceRef = useRef<AutoBackupService | null>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig>(DEFAULT_BACKUP_CONFIG);
  
  // Initialize AutoBackupService
  useEffect(() => {
    if (!autoBackupServiceRef.current) {
      autoBackupServiceRef.current = new AutoBackupService(backupConfig);
    }
  }, []);
  
  // Initialize backup service when project changes
  useEffect(() => {
    const backupService = autoBackupServiceRef.current;
    if (backupService && project) {
      backupService.initialize(project.id, () => project);
    }
    
    return () => {
      // Clean up when project changes
      if (backupService) {
        backupService.stop();
      }
    };
  }, [project?.id]);
  
  // Update backup config
  const handleUpdateBackupConfig = useCallback((newConfig: Partial<BackupConfig>) => {
    setBackupConfig(prev => {
      const updated = { ...prev, ...newConfig };
      autoBackupServiceRef.current?.updateConfig(updated);
      return updated;
    });
  }, []);
  
  // Manual backup trigger
  const handleCreateBackup = useCallback(async (description: string = '手动快照') => {
    const backupService = autoBackupServiceRef.current;
    if (backupService) {
      const backupId = await backupService.createBackup(description);
      if (backupId) {
        addLog(`已创建备份: ${description}`, 'success');
      } else {
        addLog('创建备份失败', 'error');
      }
    }
  }, []);
  
  // --- ProjectHistoryService Instance ---
  const projectHistoryRef = useRef<ProjectHistoryService | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    currentDescription: null
  });
  
  // Initialize ProjectHistoryService
  useEffect(() => {
    if (!projectHistoryRef.current) {
      projectHistoryRef.current = new ProjectHistoryService({
        maxStackSize: 20,
        persistToDb: true
      });
    }
  }, []);
  
  // Initialize history service when project changes
  useEffect(() => {
    const historyService = projectHistoryRef.current;
    if (historyService && project) {
      historyService.initialize(project.id).then(() => {
        // Add initial snapshot if stack is empty
        const state = historyService.getState();
        if (state.undoCount === 0) {
          historyService.addSnapshot(project, '初始状态');
        }
      });
      
      // Subscribe to history state changes
      const unsubscribe = historyService.subscribe(setHistoryState);
      return () => unsubscribe();
    }
  }, [project?.id]);
  
  // Add history snapshot (called after important operations)
  const addHistorySnapshot = useCallback((description: string) => {
    const historyService = projectHistoryRef.current;
    if (historyService && project && !historyService.isInProgress()) {
      historyService.addSnapshot(project, description);
    }
  }, [project]);
  
  // Undo handler
  const handleUndo = useCallback(async () => {
    const historyService = projectHistoryRef.current;
    if (!historyService) return;
    
    const previousProject = await historyService.undo();
    if (previousProject) {
      setProject(previousProject);
      // Don't call saveCurrentProject here to avoid creating new history entry
      addLog('已撤销', 'info');
    } else {
      addLog('无法撤销', 'warning');
    }
  }, []);
  
  // Redo handler
  const handleRedo = useCallback(async () => {
    const historyService = projectHistoryRef.current;
    if (!historyService) return;
    
    const nextProject = await historyService.redo();
    if (nextProject) {
      setProject(nextProject);
      addLog('已重做', 'info');
    } else {
      addLog('无法重做', 'warning');
    }
  }, []);
  
  // --- MultiTabSyncService Instance ---
  const multiTabSyncRef = useRef<MultiTabSyncService | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    isConnected: false,
    activeTabsCount: 1,
    lastSyncTime: null,
    hasConflict: false,
    conflictInfo: null
  });
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  
  // Reload project from storage (used by multiTabSync)
  const reloadProjectFromStorage = useCallback(async (projectId: string) => {
    const dirHandle = projectDirMapRef.current.get(projectId);
    if (dirHandle) {
      const freshProject = await loadProjectFromDirWithHandle(dirHandle);
      if (freshProject) {
        setProject(freshProject);
        addLog('项目已从其他标签页更新', 'info');
      }
    }
  }, []);
  
  // Handle conflict
  const handleConflict = useCallback(async (conflict: ConflictInfo) => {
    setShowConflictDialog(true);
    // Return 'ignore' for now, user will make decision in dialog
    return 'ignore' as const;
  }, []);
  
  // Initialize MultiTabSyncService
  useEffect(() => {
    if (!multiTabSyncRef.current) {
      multiTabSyncRef.current = new MultiTabSyncService();
      multiTabSyncRef.current.initialize({
        getProject: () => project,
        reloadProject: reloadProjectFromStorage,
        onConflict: handleConflict
      });
      
      // Subscribe to sync state changes
      const unsubscribe = multiTabSyncRef.current.subscribe(setSyncState);
      
      return () => {
        unsubscribe();
        multiTabSyncRef.current?.dispose();
      };
    }
  }, []);
  
  // Update multiTabSync when project changes
  useEffect(() => {
    if (multiTabSyncRef.current && project?.id) {
      multiTabSyncRef.current.setCurrentProject(project.id);
    }
  }, [project?.id]);
  
  // --- Core Persistence Helper (using SaveCoordinator) ---
  const saveCurrentProject = async (updatedProject: Project) => {
    // 1. Update React state immediately (optimistic UI)
    setProject(updatedProject);
    
    // Update projects list in memory
    setProjectsList(prevList => {
       const exists = prevList.some(p => p.id === updatedProject.id);
       if (exists) {
          return prevList.map(p => p.id === updatedProject.id ? updatedProject : p);
       }
       return [updatedProject, ...prevList];
    });
    
    // 2. Get directory handle for this project
    const dirHandle = projectDirMapRef.current.get(updatedProject.id);
    
    // 3. Use SaveCoordinator for dual-write with retry
    const coordinator = saveCoordinatorRef.current;
    if (!coordinator) {
      // Fallback if coordinator not initialized
      console.warn('[Save] SaveCoordinator not initialized, using fallback');
      try {
        if (dirHandle) {
          setCurrentProjectDir(dirHandle);
          await saveProjectToDirWithHandle(updatedProject, dirHandle);
        }
        await saveProject(updatedProject);
        addLog("项目已保存", "success");
      } catch (e) {
        console.error("Save failed", e);
        addLog("保存失败", 'error');
      }
      return;
    }
    
    try {
      // Use SaveCoordinator for coordinated dual-write
      const result = await coordinator.saveProject(updatedProject, dirHandle || undefined);
      
      if (result.success) {
        // Notify other tabs about the save
        multiTabSyncRef.current?.notifyProjectSaved(updatedProject.id, updatedProject.lastModified);
        
        if (result.partialFailure) {
          // Some storage failed, but at least one succeeded
          const failedTargets = result.errors.map(e => e.target).join(', ');
          addLog(`项目已保存（${failedTargets} 保存失败）`, "warning");
        } else {
          // All succeeded - don't show log to reduce noise, status bar will show it
          // addLog("项目已保存", "success");
        }
      }
    } catch (e) {
      console.error("Save failed", e);
      addLog("保存失败，请重试", 'error');
    }
  };
  
  // --- Manual Save Handler (Ctrl+S) ---
  const handleManualSave = useCallback(async () => {
    if (!project) {
      addLog("没有打开的项目", "warning");
      return;
    }
    
    addLog("正在保存...", "info");
    
    try {
      // Flush any pending auto-save operations first
      if (autoSaveService) {
        await autoSaveService.flushSaveQueue();
      }
      
      // Force save using SaveCoordinator
      const coordinator = saveCoordinatorRef.current;
      const dirHandle = projectDirMapRef.current.get(project.id);
      
      if (coordinator) {
        const result = await coordinator.forceSave(project, dirHandle || undefined);
        if (result.success) {
          addLog("手动保存成功 ✓", "success");
        } else {
          addLog("保存失败", "error");
        }
      } else {
        // Fallback
        if (dirHandle) {
          setCurrentProjectDir(dirHandle);
          await saveProjectToDirWithHandle(project, dirHandle);
        }
        await saveProject(project);
        addLog("手动保存成功 ✓", "success");
      }
    } catch (e) {
      console.error("Manual save failed", e);
      addLog("手动保存失败", "error");
    }
  }, [project, autoSaveService]);
  
  // --- Keyboard Shortcut Listener (Ctrl+S, Ctrl+Z, Ctrl+Shift+Z) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if focus is in an input/textarea - don't intercept undo/redo there
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLInputElement || 
                            activeElement instanceof HTMLTextAreaElement ||
                            activeElement?.getAttribute('contenteditable') === 'true';
      
      // Ctrl+S or Cmd+S for manual save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
      
      // Skip undo/redo when input is focused (let browser handle it)
      if (isInputFocused) return;
      
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      // Ctrl+Y or Cmd+Y for redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave, handleUndo, handleRedo]);

  const updateActiveVolume = useCallback((updater: (vol: Volume) => Partial<Volume>) => {
    agentLog({ location: 'App.tsx:updateActiveVolume', message: 'updateActiveVolume called', data: { hasStateManager: !!projectStateManager, hasAutoSave: !!autoSaveService }, timestamp: Date.now() });
    if (!projectStateManager || !autoSaveService) {
      agentLog({ location: 'App.tsx:updateActiveVolume:fallback', message: 'Using FALLBACK path (no stateManager)', data: {}, timestamp: Date.now() });
      // Fallback to original implementation if services aren't ready
      setProject(prev => {
        if (!prev) return null;
        const currentActiveId = prev.activeVolumeId;
        if (!currentActiveId) return prev;
        const newVolumes = prev.volumes.map(v => v.id === currentActiveId ? { ...v, ...updater(v) } : v);
        const newProject = { ...prev, volumes: newVolumes, lastModified: Date.now() };
        saveProject(newProject).then(() => {
            setProjectsList(list => list.map(p => p.id === newProject.id ? newProject : p));
            // Save to directory with correct handle
            const dirHandle = projectDirMapRef.current.get(newProject.id);
            if (dirHandle) {
              saveProjectToDirWithHandle(newProject, dirHandle).catch(() => {});
            } else {
              saveProjectToDir(newProject).catch(() => {});
            }
        }).catch(e => console.error("Auto-save failed", e));
        return newProject;
      });
      return;
    }
    
    // Use new project state manager with auto-save
    setProject(prev => {
      agentLog({ location: 'App.tsx:updateActiveVolume:setProject', message: 'setProject callback entered', data: { hasPrev: !!prev, activeVolumeId: prev?.activeVolumeId || null, volumeCount: prev?.volumes?.length || 0, volumeIds: prev?.volumes?.map(v => v.id) || [] }, timestamp: Date.now() });
      
      if (!prev) return null;
      const currentActiveId = prev.activeVolumeId;
      if (!currentActiveId) {
        agentLog({ location: 'App.tsx:updateActiveVolume:noActiveId', message: 'EARLY RETURN: No activeVolumeId', data: { projectId: prev.id }, timestamp: Date.now() });
        return prev;
      }
      
      const currentVolume = prev.volumes.find(v => v.id === currentActiveId);
      if (!currentVolume) {
        agentLog({ location: 'App.tsx:updateActiveVolume:noVolume', message: 'EARLY RETURN: Volume not found', data: { projectId: prev.id, activeVolumeId: currentActiveId, volumeIds: prev.volumes.map(v => v.id) }, timestamp: Date.now() });
        return prev;
      }
      
      const updatedVolume = { ...currentVolume, ...updater(currentVolume) };
      const newVolumes = prev.volumes.map(v => v.id === currentActiveId ? updatedVolume : v);
      const newProject = { ...prev, volumes: newVolumes, lastModified: Date.now() };
      
      agentLog({ location: 'App.tsx:updateActiveVolume:stateManager', message: 'Calling projectStateManager.updateVolume', data: { projectId: prev.id, volumeId: currentActiveId, contentLength: updatedVolume.content?.length || 0 }, timestamp: Date.now() });
      
      // Update volume in state manager
      projectStateManager.updateVolume(prev.id, currentActiveId, updatedVolume)
        .then(() => {
          agentLog({ location: 'App.tsx:updateActiveVolume:success', message: 'updateVolume SUCCESS, triggering autoSave', data: { projectId: prev.id, volumeId: currentActiveId }, timestamp: Date.now() });
          // Trigger auto-save for the volume (debounced)
          autoSaveService.saveVolume(prev.id, currentActiveId);
          addLog("卷内容已自动保存", "success");
        })
        .catch(e => {
          agentLog({ location: 'App.tsx:updateActiveVolume:error', message: 'updateVolume FAILED', data: { error: String(e) }, timestamp: Date.now() });
          console.error("Auto-save failed", e);
        });
      
      return newProject;
    });
  }, [projectStateManager, autoSaveService, addLog, agentLog]);

  // --- Handlers: Breakdown QA Auto-Fix & Revert ---
  
  const handleRevertBreakdownIssue = (issueIndex: number) => {
      if (!plotBreakdown || !breakdownReport) return;
      
      const issue = breakdownReport.issues[issueIndex];
      if (!issue || !issue.is_fixed || issue.original_value === undefined) return;

      const currentEpisodes = [...plotBreakdown.episodes];
      const targetEpIdx = currentEpisodes.findIndex(ep => String(ep.episode_number) === String(issue.target_episode));
      
      if (targetEpIdx !== -1 && issue.target_field) {
          // Restore original value
          currentEpisodes[targetEpIdx] = {
              ...currentEpisodes[targetEpIdx],
              [issue.target_field]: issue.original_value
          };
          
          // Update issue status
          const newIssues = [...breakdownReport.issues];
          newIssues[issueIndex] = { ...issue, is_fixed: false, original_value: undefined };
          
          updateActiveVolume(() => ({
              plotBreakdown: { ...plotBreakdown, episodes: currentEpisodes },
              breakdownReport: { ...breakdownReport, issues: newIssues }
          }));
          addLog(`已撤销 EP.${issue.target_episode} 的修改`, 'info');
      }
  };

  const handleRunBreakdownQA = async () => {
      if (!activeVolume || !activeVolume.plotBreakdown || !rawText) return;
      setStatus('BREAKDOWN_ALIGNING');
      const taskId = handleTaskStart("剧情质检 (Breakdown QA)", "text", settings.alignerModel);
      
      try {
          const report = await runBreakdownAligner(rawText, activeVolume.plotBreakdown, settings);
          
          // --- AUTO-FIX LOGIC ---
          let currentEpisodes = [...activeVolume.plotBreakdown.episodes];
          const processedIssues = report.issues.map(issue => {
              if (issue.target_episode !== undefined && issue.target_field && issue.suggestion) {
                  const targetEpIdx = currentEpisodes.findIndex(ep => String(ep.episode_number) === String(issue.target_episode));
                  if (targetEpIdx !== -1) {
                      const ep = currentEpisodes[targetEpIdx];
                      // Verify field exists
                      if (['title', 'core_conflict', 'scenes_summary'].includes(issue.target_field)) {
                          const originalVal = (ep as any)[issue.target_field];
                          // Apply Fix
                          currentEpisodes[targetEpIdx] = { ...ep, [issue.target_field]: issue.suggestion };
                          // Mark as fixed and store original
                          return { ...issue, is_fixed: true, original_value: originalVal };
                      }
                  }
              }
              return issue;
          });
          
          const autoFixedCount = processedIssues.filter(i => i.is_fixed).length;
          
          updateActiveVolume(() => ({ 
              plotBreakdown: { ...activeVolume.plotBreakdown!, episodes: currentEpisodes },
              breakdownReport: { ...report, issues: processedIssues }
          }));
          
          setStatus('SUCCESS');
          addLog(`Breakdown-Aligner 质检完成，已自动修复 ${autoFixedCount} 处问题`, autoFixedCount > 0 ? 'warning' : 'success');
          handleTaskFinish(taskId, 'success');
          
      } catch (e: any) { 
          setStatus('ERROR'); 
          addLog(e.message, 'error'); 
          handleTaskFinish(taskId, 'error');
      }
  };

  // --- Handlers: Volume Management ---
  const handleAppendVolume = async (name: string, content: string) => {
    if (!project) return;
    const newOrder = project.volumes.length + 1;
    const newVolume: Volume = {
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      name: name, content: content, order: newOrder,
      plotBreakdown: null, breakdownReport: null, scriptCache: {}, reportCache: {}
    };
    const updatedProject = { ...project, volumes: [...project.volumes, newVolume], activeVolumeId: newVolume.id, lastModified: Date.now() };
    await saveCurrentProject(updatedProject);
    addLog(`已添加分卷: ${name}`, 'success');
  };
  const handleSmartImport = async (name: string, content: string) => {
    if (!project) return;
    addLog(`正在分析整本小说结构: ${name}...`, 'info');
    const chapterRegex = /(?:^|\n)\s*(第[0-9零一二三四五六七八九十百千]+[章卷回节].*?)(?=\n|$)/g;
    let match; const indices: number[] = [];
    while ((match = chapterRegex.exec(content)) !== null) { indices.push(match.index); }
    if (indices.length === 0) {
      addLog("未检测到章节目录，作为单卷导入...", "warning");
      await handleAppendVolume(name, content);
      return;
    }
    const chapters: string[] = [];
    if (indices[0] > 0) chapters.push(content.substring(0, indices[0])); 
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i]; const end = i === indices.length - 1 ? content.length : indices[i+1];
      chapters.push(content.substring(start, end));
    }
    // NOTE: If a single volume contains too many chapters, Plot Breakdown (splitter) tends to be truncated
    // due to LLM output length limits. Use a smaller chunk size to keep each volume manageable.
    const CHUNK_SIZE = 20;
    const newVolumesList: Volume[] = [];
    let baseOrder = project.volumes.length;
    for (let i = 0; i < chapters.length; i += CHUNK_SIZE) {
      const chunk = chapters.slice(i, i + CHUNK_SIZE);
      const volumeContent = chunk.join('\n');
      const startChap = i + 1; const endChap = Math.min(i + CHUNK_SIZE, chapters.length);
      const volumeName = `${name} - Vol.${baseOrder + 1 + (i / CHUNK_SIZE)} (第${startChap}-${endChap}章)`;
      newVolumesList.push({
        id: Date.now().toString() + i, name: volumeName, content: volumeContent, order: baseOrder + 1 + (i / CHUNK_SIZE),
        plotBreakdown: null, breakdownReport: null, scriptCache: {}, reportCache: {}
      });
    }
    const updatedProject = { ...project, volumes: [...project.volumes, ...newVolumesList], activeVolumeId: newVolumesList.length > 0 ? newVolumesList[0].id : project.activeVolumeId, lastModified: Date.now() };
    await saveCurrentProject(updatedProject);
    addLog(`成功导入并拆分为 ${newVolumesList.length} 卷`, 'success');
  };
  const handleUpdateEpisode = (updatedEp: PlotEpisode) => {
    updateActiveVolume(vol => {
      if (!vol.plotBreakdown) return {};
      const newEpisodes = vol.plotBreakdown.episodes.map(ep => ep.episode_number === updatedEp.episode_number ? updatedEp : ep);
      return { plotBreakdown: { ...vol.plotBreakdown, episodes: newEpisodes } };
    });
    if (selectedEpisode?.episode_number === updatedEp.episode_number) { setSelectedEpisode(updatedEp); }
  };

  // --- Handlers: Script Pipeline ---
  const handleGeneratePlot = async () => {
    if (!rawText.trim()) return;
    if (!project) return;

    // Helper: Split very long novel text into smaller chunks for the splitter agent.
    // LLM responses can be truncated when input is huge, leading to only a few episodes (e.g., 8).
    const buildSplitterChunks = (text: string): string[] => {
      const trimmed = text.trim();
      if (!trimmed) return [];

      // Heuristic: keep each chunk reasonably sized to avoid output truncation.
      const MAX_CHARS_PER_CHUNK = 25000;

      // Prefer splitting by chapter markers if present.
      const chapterRegex = /(?:^|\n)\s*(第[0-9零一二三四五六七八九十百千]+[章卷回节].*?)(?=\n|$)/g;
      const indices: number[] = [];
      let match: RegExpExecArray | null;
      while ((match = chapterRegex.exec(trimmed)) !== null) {
        indices.push(match.index);
      }

      const slices: string[] = [];
      if (indices.length > 1) {
        // Split into chapter slices first
        const chapters: string[] = [];
        if (indices[0] > 0) chapters.push(trimmed.substring(0, indices[0]));
        for (let i = 0; i < indices.length; i++) {
          const start = indices[i];
          const end = i === indices.length - 1 ? trimmed.length : indices[i + 1];
          chapters.push(trimmed.substring(start, end));
        }

        // Pack chapters into chunks by char budget
        let current = '';
        for (const ch of chapters) {
          if (!current) {
            current = ch;
            continue;
          }
          if (current.length + ch.length + 1 <= MAX_CHARS_PER_CHUNK) {
            current += `\n${ch}`;
          } else {
            slices.push(current);
            current = ch;
          }
        }
        if (current) slices.push(current);
      } else {
        // Fallback: split by char budget and newline boundaries
        let start = 0;
        while (start < trimmed.length) {
          const targetEnd = Math.min(start + MAX_CHARS_PER_CHUNK, trimmed.length);
          if (targetEnd === trimmed.length) {
            slices.push(trimmed.substring(start));
            break;
          }
          const window = trimmed.substring(start, targetEnd);
          const lastNewline = window.lastIndexOf('\n');
          const cut = lastNewline > 500 ? start + lastNewline : targetEnd;
          slices.push(trimmed.substring(start, cut));
          start = cut;
        }
      }

      // Final sanitize: drop tiny chunks
      return slices.map(s => s.trim()).filter(s => s.length >= 200);
    };

    setStatus('SPLITTING'); // Start busy state
    const taskId = handleTaskStart("剧情拆解 (Plot Breakdown)", "text", settings.splitterModel);
    
    // Task 1: Fix - Only auto-detect style if activeStyle is NOT set
    let detectedStyle: NovelStyle | null = null;
    let stylePromise: Promise<NovelStyle | null> = Promise.resolve(null);

    if (!project.activeStyle) {
        stylePromise = detectNovelStyle(rawText, settings)
           .then(style => {
               detectedStyle = style;
               addLog(`已自动识别小说风格: ${style.name}`, 'success');
               return style;
           })
           .catch(err => {
               console.error("Style detection failed:", err);
               return null;
           });
    }

    // Splitter: run in batches for very long texts, then merge & renumber episodes.
    const splitterChunks = buildSplitterChunks(rawText);
    const shouldBatchSplit = splitterChunks.length > 1;

    const breakdownPromise = (async () => {
      if (!shouldBatchSplit) {
        return runSplitterAgent(rawText, settings, project?.storyBible || undefined);
      }

      addLog(`检测到长文本，启用分批剧情拆解（${splitterChunks.length} 段）...`, 'info');

      const mergedEpisodes: PlotEpisode[] = [];
      for (let i = 0; i < splitterChunks.length; i++) {
        addLog(`剧情拆解进度：${i + 1}/${splitterChunks.length}`, 'info');

        // Provide chunk context to help the model focus on local content only.
        const chunkText = `【PART ${i + 1}/${splitterChunks.length}】\n请仅基于本段内容生成 episodes（不要尝试覆盖全书）。\n\n${splitterChunks[i]}`;
        const part = await runSplitterAgent(chunkText, settings, project?.storyBible || undefined);

        if (!part?.episodes || !Array.isArray(part.episodes) || part.episodes.length === 0) {
          addLog(`第 ${i + 1} 段未返回有效 episodes，已跳过`, 'warning');
          continue;
        }

        for (const ep of part.episodes) {
          mergedEpisodes.push({
            ...ep,
            episode_number: mergedEpisodes.length + 1,
            status: 'idle'
          });
        }
      }

      if (mergedEpisodes.length === 0) {
        throw new Error("分批剧情拆解未返回任何 episodes。");
      }

      return {
        batch_id: `batch_${project.id}_${Date.now()}`,
        episodes: mergedEpisodes
      };
    })();

    try {
      const [data, style] = await Promise.all([breakdownPromise, stylePromise]);
      
      // --- DEFENSIVE CHECK: Ensure data has episodes ---
      if (!data.episodes || !Array.isArray(data.episodes)) {
          throw new Error("AI 返回的剧情数据不完整，缺少 episodes 数组。");
      }

      // Ensure UI status exists for episode cards (batch splitter already sets it)
      data.episodes = data.episodes.map(e => ({ ...e, status: e.status || 'idle' }));
      
      // Update Project with BOTH breakdown and detected style
      const updatedVolumes = project.volumes.map(v => 
          v.id === project.activeVolumeId ? { ...v, plotBreakdown: data } : v
      );
      
      // Auto-add detected style to custom styles and select it
      let newCustomStyles = project.customStyles;
      let newActiveStyle = project.activeStyle;
      if (style) {
          // Check uniqueness
          const exists = project.customStyles.some(s => s.name === style.name);
          newCustomStyles = exists ? project.customStyles : [...project.customStyles, style];
          newActiveStyle = style;
      }

      const newProject = {
          ...project,
          volumes: updatedVolumes,
          activeStyle: newActiveStyle, 
          customStyles: newCustomStyles,
          lastModified: Date.now()
      };
      
      await saveCurrentProject(newProject);

      setStatus('BREAKDOWN_ALIGNING');
      
      // Run Breakdown QA immediately after splitting
      const breakdownReport = await runBreakdownAligner(rawText, data, settings);
      
      // Apply auto-fixes immediately for the first pass too
      let currentEpisodes = [...data.episodes];
      const processedIssues = breakdownReport.issues.map(issue => {
          if (issue.target_episode !== undefined && issue.target_field && issue.suggestion) {
              const targetEpIdx = currentEpisodes.findIndex(ep => String(ep.episode_number) === String(issue.target_episode));
              if (targetEpIdx !== -1) {
                  const ep = currentEpisodes[targetEpIdx];
                  if (['title', 'core_conflict', 'scenes_summary'].includes(issue.target_field)) {
                      const originalVal = (ep as any)[issue.target_field];
                      currentEpisodes[targetEpIdx] = { ...ep, [issue.target_field]: issue.suggestion };
                      return { ...issue, is_fixed: true, original_value: originalVal };
                  }
              }
          }
          return issue;
      });

      const autoFixedCount = processedIssues.filter(i => i.is_fixed).length;

      updateActiveVolume(() => ({
          plotBreakdown: { ...data, episodes: currentEpisodes },
          breakdownReport: { ...breakdownReport, issues: processedIssues }
      }));
      
      setStatus('SUCCESS');
      addLog(`剧情拆解完成，自动修复 ${autoFixedCount} 处问题`, 'success');
      handleTaskFinish(taskId, 'success');

    } catch (e: any) {
      console.error(e);
      setStatus('ERROR');
      addLog(`拆解失败: ${e.message}`, 'error');
      handleTaskFinish(taskId, 'error');
    }
  };

  const handleGenerateScript = async (episode: PlotEpisode | null, panelCount: number = 8) => {
      if (!episode) return;
      console.log("handleGenerateScript called with episode:", episode);
      if (!project) {
          console.log("project is null");
          return;
      }
      
      const epNum = episode.episode_number;
      
      // Prevent duplicate generation of the same episode
      if (generatingEpisodes.has(epNum)) {
          addLog(`EP.${epNum} 正在生成中，请稍候`, 'warning');
          return;
      }
      
      // Mark this episode as generating (allows parallel generation)
      setGeneratingEpisodes(prev => new Set(prev).add(epNum));
      
      const taskId = handleTaskStart(`剧本生成 (EP.${epNum})`, "text", settings.writerModel);
      
      try {
          // Continuity: build a short context from previous episode to keep cross-episode flow consistent
          const buildContinuityContext = (): string => {
              const epNum = episode.episode_number;
              if (epNum <= 1) return '';
              
              const prevEp = activeVolume?.plotBreakdown?.episodes?.find(e => e.episode_number === epNum - 1) || null;
              const prevScript = activeVolume?.scriptCache?.[epNum - 1] || null;
              
              const parts: string[] = [];
              if (prevEp) {
                  const prevSummary = Array.isArray(prevEp.scenes_summary)
                    ? prevEp.scenes_summary.join(' / ')
                    : String(prevEp.scenes_summary || '');
                  parts.push(`Prev EP.${epNum - 1} Title: ${prevEp.title}`);
                  parts.push(`Prev Core Conflict: ${prevEp.core_conflict}`);
                  parts.push(`Prev Hook Type: ${prevEp.hook_type} (Intensity: ${prevEp.hook_intensity})`);
                  if (prevSummary.trim()) parts.push(`Prev Visual Summary: ${prevSummary}`);
              }
              
              if (prevScript?.panels?.length) {
                  const tail = prevScript.panels.slice(-2).map(p => `#${p.panel_id}: ${String(p.script_content || '').trim()}`).join('\n');
                  if (tail.trim()) {
                      parts.push(`Prev Script Tail (last 1-2 panels):\n${tail}`);
                  }
              }
              
              return parts.join('\n');
          };

          // Get breakdown suggestions if any
          const breakdownIssueText = breakdownReport?.issues
             .filter(i => i.target_episode === episode.episode_number && !i.is_fixed)
             .map(i => `[Issue: ${i.description}] Suggestion: ${i.suggestion}`)
             .join('\n');

          const continuityContext = buildContinuityContext();
          
          // Check if second-person explain mode is enabled
          const useSecondPersonExplain = settings.enableSecondPersonExplain === true;
          
          let script: WebtoonScript;
          let newAssets: Asset[];
          
          if (useSecondPersonExplain) {
              // Two-Agent Chain: Agent A (Explain) -> Agent B (Storyboard V2)
              console.log("[handleGenerateScript] Using Two-Agent Chain (second-person explain mode)");
              
              // Get source text for Agent A
              const sourceText = activeVolume?.content || '';
              
              // Step 1: Run Agent A (Explain)
              addLog(`EP.${epNum} 正在生成第二人称讲解包...`, 'info');
              const explainPackage = await runExplainAgent(episode, sourceText, settings);
              console.log("[handleGenerateScript] Agent A returned ExplainPackage:", {
                  novelType: explainPackage.novelType,
                  beatsCount: explainPackage.beats.length,
                  scriptLength: explainPackage.script.length,
              });
              
              // Step 2: Run Agent B (Storyboard V2)
              addLog(`EP.${epNum} 正在生成分镜脚本 (双轨模式)...`, 'info');
              const result = await runWriterAgentV2(
                  episode,
                  explainPackage,
                  settings,
                  project.assets,
                  panelCount
              );
              script = result.script;
              newAssets = result.newAssets;
              
              // Store ExplainPackage in episode for later reference
              // Update the episode with explainPackage (will be persisted in plotBreakdown)
              const updatedEpisode: PlotEpisode = {
                  ...episode,
                  novelType: explainPackage.novelType,
                  goldenHook: explainPackage.goldenHook,
                  explosiveOpening: explainPackage.explosiveOpening,
                  plotTwist: explainPackage.plotTwist,
                  writingTechnique: explainPackage.writingTechnique,
                  heatEstimate: explainPackage.heatEstimate,
                  explainPackage: explainPackage,
              };
              
              // Update plotBreakdown with the enriched episode
              updateActiveVolume(vol => {
                  if (!vol.plotBreakdown?.episodes) return vol;
                  const updatedEpisodes = vol.plotBreakdown.episodes.map(ep => 
                      ep.episode_number === episode.episode_number ? updatedEpisode : ep
                  );
                  return {
                      ...vol,
                      plotBreakdown: { ...vol.plotBreakdown, episodes: updatedEpisodes }
                  };
              });
              
              console.log("[handleGenerateScript] Agent B returned script with narrationZh:", 
                  script.panels.filter(p => p.narrationZh && p.narrationZh.length > 0).length, 
                  "/", script.panels.length, "panels");
          } else {
              // Original single-agent mode
              console.log("[handleGenerateScript] Using single-agent mode (original Writer)");
              const result = await runWriterAgent(episode, settings, breakdownIssueText, panelCount, continuityContext, project.assets);
              script = result.script;
              newAssets = result.newAssets;
          }
          
          console.log("Script generation completed - panels:", script.panels.length);
          console.log("New assets count:", newAssets.length);
          
          // Merge new assets
          const existingIds = new Set(project.assets.map(a => a.name));
          const uniqueNewAssets = newAssets.filter(a => !existingIds.has(a.name));
          const updatedAssets = [...project.assets, ...uniqueNewAssets];
          console.log("Updated assets count:", updatedAssets.length, "New assets:", uniqueNewAssets.length);

          // Auto-link assets for the newly generated script panels (so Storyboard auto-has relations)
          const { script: scriptWithLinks, stats: linkStats } = autoLinkAssetsForScript(script, updatedAssets);
          
          // Update project state atomically - combine scriptCache + assets in ONE setProject call
          // This avoids the React closure trap where old project snapshot overwrites new data
          console.log("Updating scriptCache for episode:", episode.episode_number);
          
          let updatedProjectForSave: Project | null = null;
          
          setProject(prev => {
              if (!prev) return null;
              
              const currentActiveId = prev.activeVolumeId;
              if (!currentActiveId) {
                  console.warn("No activeVolumeId, cannot update scriptCache");
                  return prev;
              }
              
              // Find and update the active volume with new scriptCache
              const currentVolume = prev.volumes.find(v => v.id === currentActiveId);
              if (!currentVolume) {
                  console.warn("Active volume not found");
                  return prev;
              }
              
              const newScriptCache = { ...currentVolume.scriptCache, [episode.episode_number]: scriptWithLinks };
              console.log("New scriptCache keys:", Object.keys(newScriptCache));
              console.log("Script for episode", episode.episode_number, "panels:", newScriptCache[episode.episode_number]?.panels?.length);
              
              const updatedVolume = { ...currentVolume, scriptCache: newScriptCache };
              const newVolumes = prev.volumes.map(v => v.id === currentActiveId ? updatedVolume : v);
              
              const updated: Project = { 
                  ...prev, 
                  volumes: newVolumes,
                  assets: updatedAssets,
                  lastModified: Date.now() 
              };
              
              console.log("Updated project - assets count:", updated.assets.length);
              
              // Capture for saving AFTER state update
              updatedProjectForSave = updated;
              
              return updated;
          });
          
          // Wait for state update to process before saving
          await new Promise(resolve => setTimeout(resolve, 0));
          
          // Save the updated project (from the state update closure)
          if (updatedProjectForSave) {
              await saveCurrentProject(updatedProjectForSave);
              console.log("Project saved to database and file system with scriptCache");
          } else {
              console.error("Failed to capture updated project for saving");
          }

          if (linkStats.linkedPanelsCount > 0) {
              addLog(
                `已自动关联资产：${linkStats.linkedPanelsCount} 个分镜（角色/场景引用 ${linkStats.totalLinkedAssetRefs}，道具引用 ${linkStats.totalLinkedItemRefs}）`,
                'success'
              );
          } else {
              addLog('自动关联：未在本集分镜文本中匹配到资产名称（可在分镜页使用“✨ 一键关联”或检查资产命名）', 'info');
          }
          
          // Auto run Aligner (no global status change - allows parallel)
          const report = await runAlignerAgent(episode, scriptWithLinks, settings);
          
          // Auto-fix: Apply suggestions and mark issues as fixed (same logic as handleRunQA)
          
          updateActiveVolume(vol => {
              const epNum = episode.episode_number;
              const baseScript = vol.scriptCache?.[epNum] || script;
              const panels = baseScript?.panels || [];
              
              // Process issues: mark as fixed and store original content
              const issueList = (report.critical_issues || []).map(issue => {
                  const target = panels.find(p => p.panel_id === issue.panel_id);
                  if (!target) {
                      return { ...issue, is_fixed: false };
                  }
                  const original = target.script_content || '';
                  const fixed = (issue.suggestion || '').trim();
                  if (!fixed || !isValidMicroMontageSuggestion(fixed)) {
                      return { ...issue, is_fixed: false };
                  }
                  return {
                      ...issue,
                      original_visual: original,
                      is_fixed: true
                  };
              });
              
              // Build map of panel fixes
              const fixedByPanelId = new Map<number, string>();
              for (const i of issueList) {
                  if (i.is_fixed && typeof i.panel_id === 'number' && typeof i.suggestion === 'string') {
                      fixedByPanelId.set(i.panel_id, i.suggestion);
                  }
              }
              
              // Apply fixes to panels
              const updatedPanels = panels.map(p => {
                  const fixed = fixedByPanelId.get(p.panel_id);
                  if (!fixed) return p;
                  return { ...p, script_content: fixed };
              });
              
              const updatedScript: WebtoonScript = {
                  ...baseScript,
                  episode_number: epNum,
                  panels: updatedPanels
              };
              
              const updatedReport: AlignerReport = {
                  ...report,
                  critical_issues: issueList
              };
              
              return {
                  scriptCache: { ...vol.scriptCache, [epNum]: updatedScript },
                  reportCache: { ...vol.reportCache, [epNum]: updatedReport }
              };
          });

          addLog(`EP.${epNum} 剧本生成完成（已自动修复质量问题）`, 'success');
          handleTaskFinish(taskId, 'success');
          
      } catch (e: any) {
          console.error(`Error generating script for EP.${epNum}:`, e);
          addLog(`EP.${epNum} 剧本生成失败: ${e.message}`, 'error');
          handleTaskFinish(taskId, 'error');
      } finally {
          // Always remove from generating set (ensures cleanup on success/error/exception)
          setGeneratingEpisodes(prev => {
              const next = new Set(prev);
              next.delete(epNum);
              return next;
          });
      }
  };

  const handleUpdateScript = (newScript: WebtoonScript) => {
      updateActiveVolume(vol => ({
          scriptCache: { ...vol.scriptCache, [newScript.episode_number]: newScript }
      }));
  };

  // QA Handlers
  const handleRunQA = async () => {
      if (!selectedEpisode || !project) return;
      
      // 从最新的 project 状态读取脚本，避免使用闭包中的旧 currentScript
      const activeVolume = project.volumes.find(v => v.id === project.activeVolumeId);
      const latestScript = activeVolume?.scriptCache?.[selectedEpisode.episode_number];
      if (!latestScript) {
          addLog('未找到脚本，请先生成剧本', 'warning');
          return;
      }
      
      setStatus('ALIGNING');
      const taskId = handleTaskStart(`剧本质检 (EP.${selectedEpisode.episode_number})`, "text", settings.alignerModel);
      try {
          // 使用最新脚本进行检查
          const report = await runAlignerAgent(selectedEpisode, latestScript, settings);
          
          // Auto-fix: Apply suggestions by directly replacing script_content,
          // and store original content on the issue for undo.
          setStatus('AUTO_FIXING');
          
          updateActiveVolume(vol => {
              const epNum = selectedEpisode.episode_number;
              const baseScript = vol.scriptCache?.[epNum] || latestScript;
              const panels = baseScript?.panels || [];
              
              const issueList = (report.critical_issues || []).map(issue => {
                  const target = panels.find(p => p.panel_id === issue.panel_id);
                  if (!target) {
                      return { ...issue, is_fixed: false };
                  }
                  const original = target.script_content || '';
                  const fixed = (issue.suggestion || '').trim();
                  if (!fixed || !isValidMicroMontageSuggestion(fixed)) {
                      return { ...issue, is_fixed: false };
                  }
                  return {
                      ...issue,
                      original_visual: original,
                      is_fixed: true
                  };
              });
              
              const fixedByPanelId = new Map<number, string>();
              for (const i of issueList) {
                  if (i.is_fixed && typeof i.panel_id === 'number' && typeof i.suggestion === 'string') {
                      fixedByPanelId.set(i.panel_id, i.suggestion);
                  }
              }
              
              const updatedPanels = panels.map(p => {
                  const fixed = fixedByPanelId.get(p.panel_id);
                  if (!fixed) return p;
                  return { ...p, script_content: fixed };
              });
              
              const updatedScript: WebtoonScript = {
                  ...baseScript,
                  episode_number: epNum,
                  panels: updatedPanels
              };
              
              const updatedReport: AlignerReport = {
                  ...report,
                  critical_issues: issueList
              };
              
              return {
                  scriptCache: { ...vol.scriptCache, [epNum]: updatedScript },
                  reportCache: { ...vol.reportCache, [epNum]: updatedReport }
              };
          });
          
          setStatus('SUCCESS');
          handleTaskFinish(taskId, 'success');
      } catch (e: any) {
          setStatus('ERROR');
          addLog(e.message, 'error');
          handleTaskFinish(taskId, 'error');
      }
  };

  // Manual apply (fallback): if an issue wasn't auto-fixed, allow applying it explicitly.
  const handleAcceptSuggestion = (panelId: number, suggestion: string) => {
      if (!selectedEpisode) return;
      const epNum = selectedEpisode.episode_number;
      const fixed = (suggestion || '').trim();
      if (!fixed) return;
      if (!isValidMicroMontageSuggestion(fixed)) {
          addLog('修复建议格式不合规：必须严格 3 行且每行以 ▲ 开头（微蒙太奇三条）。请重新运行质检。', 'warning');
          return;
      }
      
      updateActiveVolume(vol => {
          const baseScript = vol.scriptCache?.[epNum] || currentScript;
          if (!baseScript) return {};
          
          const panels = baseScript.panels || [];
          const target = panels.find(p => p.panel_id === panelId);
          if (!target) return {};
          
          const original = target.script_content || '';
          const updatedPanels = panels.map(p => p.panel_id === panelId ? { ...p, script_content: fixed } : p);
          const updatedScript: WebtoonScript = { ...baseScript, panels: updatedPanels, episode_number: epNum };
          
          const baseReport = vol.reportCache?.[epNum] || null;
          const updatedIssues = baseReport?.critical_issues?.map(i => {
              if (i.panel_id !== panelId) return i;
              return { ...i, original_visual: i.original_visual || original, is_fixed: true };
          }) || [];
          
          const updatedReport = baseReport ? { ...baseReport, critical_issues: updatedIssues } : null;
          
          return {
              scriptCache: { ...vol.scriptCache, [epNum]: updatedScript },
              ...(updatedReport ? { reportCache: { ...vol.reportCache, [epNum]: updatedReport } } : {})
          };
      });
  };

  const handleRevertFix = (panelId: number) => {
      if (!selectedEpisode) return;
      const epNum = selectedEpisode.episode_number;
      
      updateActiveVolume(vol => {
          const baseReport = vol.reportCache?.[epNum] || currentReport;
          const baseScript = vol.scriptCache?.[epNum] || currentScript;
          if (!baseReport || !baseScript) return {};
          
          const issueIndex = (baseReport.critical_issues || []).findIndex(i => i.panel_id === panelId && i.is_fixed);
          if (issueIndex === -1) return {};
          
          const issue = baseReport.critical_issues[issueIndex];
          const original = issue.original_visual;
          if (typeof original !== 'string') return {};
          
          const updatedPanels = (baseScript.panels || []).map(p => p.panel_id === panelId ? { ...p, script_content: original } : p);
          const updatedScript: WebtoonScript = { ...baseScript, panels: updatedPanels, episode_number: epNum };
          
          const newIssues = [...baseReport.critical_issues];
          newIssues[issueIndex] = { ...newIssues[issueIndex], is_fixed: false };
          const updatedReport: AlignerReport = { ...baseReport, critical_issues: newIssues };
          
          return {
              scriptCache: { ...vol.scriptCache, [epNum]: updatedScript },
              reportCache: { ...vol.reportCache, [epNum]: updatedReport }
          };
      });
  };

  // Asset Handlers
  const handleAddAsset = async (asset: Asset) => {
      if(!project) return;
      const newAssets = [...project.assets, asset];
      await saveCurrentProject({ ...project, assets: newAssets });
  };
  
  // Use functional update to handle concurrent asset updates safely
  // This prevents the "second update overwrites first" issue when generating multiple asset images simultaneously
  const handleUpdateAsset = async (updatedAsset: Asset) => {
      if(!project) return;
      
      // Use setProject with functional update to ensure we're working with latest state
      let updatedProject: Project | null = null;
      
      setProject(prev => {
          if (!prev) return null;
          const newAssets = prev.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a);
          updatedProject = { ...prev, assets: newAssets, lastModified: Date.now() };
          return updatedProject;
      });
      
      // Wait a tick for state to settle before persisting
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Now save the updated project using saveCurrentProject (which handles DB persistence)
      if (updatedProject) {
          await saveCurrentProject(updatedProject);
      }
  };

  const handleDeleteAsset = async (assetId: string) => {
      if(!project) return;
      const newAssets = project.assets.filter(a => a.id !== assetId);
      await saveCurrentProject({ ...project, assets: newAssets });
  };

  const handleGenerateAssetImage = async (assetId: string) => {
      const asset = project.assets.find(a => a.id === assetId);
      if (!asset) return;
      
      // Ensure project directory exists
      await ensureProjectDir();
      
      // Capture initial values for prompt generation (these don't change during generation)
      const assetPrompt = asset.prompt;
      const assetName = asset.name;
      const assetType = asset.type; // character | scene | item - used for negative prompts
      const assetAspectRatio = asset.aspectRatio;
      const stylePrompt = project?.activeStyle?.prompt || "";
      
      setGeneratingItemIds(prev => new Set(prev).add(assetId));
      setStatus('GENERATING_IMAGE');
      const taskId = handleTaskStart(`资产绘图 (${assetName})`, "image", settings.imageModel);
      
      try {
          const prompt = `${assetPrompt}. ${stylePrompt}`;
          // Pass assetType to generateImage - scene/item will auto-append "no humans" constraint
          const url = await generateImage(prompt, settings, assetAspectRatio, assetType);
          
          // Save to local fs
          const response = await fetch(url);
          const blob = await response.blob();
          const filename = `asset_${assetId}_${Date.now()}.png`;
          const localPath = await saveImageToAssets(blob, filename);
          
          // Use functional update to get the LATEST asset state and merge new image
          // This is critical for concurrent updates - don't use the stale `asset` variable here!
          let updatedProjectForSave: Project | null = null;
          
          setProject(prev => {
              if (!prev) return null;
              const latestAsset = prev.assets.find(a => a.id === assetId);
              if (!latestAsset) return prev;
              
              // Merge new image into latest state (preserving any other concurrent updates)
              const history = [localPath, ...(latestAsset.imageHistory || [])].slice(0, 5);
              const updatedAsset = { ...latestAsset, imagePath: localPath, imageHistory: history };
              const newAssets = prev.assets.map(a => a.id === assetId ? updatedAsset : a);
              
              updatedProjectForSave = { ...prev, assets: newAssets, lastModified: Date.now() };
              return updatedProjectForSave;
          });
          
          // Persist after state update (wait a tick to ensure state is settled)
          await new Promise(resolve => setTimeout(resolve, 0));
          if (updatedProjectForSave) {
              await saveCurrentProject(updatedProjectForSave);
          }
          
          addLog(`资产 ${assetName} 生图成功`, 'success');
          playSuccessSound('asset', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
          handleTaskFinish(taskId, 'success');
      } catch (e: any) {
          addLog(`生图失败: ${e.message}`, 'error');
          playSound('error', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
          handleTaskFinish(taskId, 'error');
      } finally {
          setGeneratingItemIds(prev => { const n = new Set(prev); n.delete(assetId); return n; });
          setStatus('IDLE');
      }
  };
  
  const handleAutoExtractAssets = async () => {
      if (!project) return;
      setStatus('WRITING'); // Reuse writing status for generic AI task
      const taskId = handleTaskStart("智能资产提取", "text", settings.writerModel);
      try {
          // Build input primarily from storyboard script JSON (panels) + project context
          const buildAssetExtractionInput = (): string => {
              const existingAssetsSummary = project.assets.map(a => ({
                  id: a.id,
                  type: a.type,
                  name: a.name,
              }));

              const panelSummaries: Array<{
                  volId: string;
                  volName: string;
                  volOrder: number;
                  episode_number: number;
                  panel_id: number;
                  globalPanelNo?: number;
                  active_characters_str: string;
                  scene_name: string;
                  props: string;
                  visual: string;
                  script_content: string;
              }> = [];

              for (const vol of project.volumes) {
                  const episodeNumbers = Object.keys(vol.scriptCache || {})
                      .map(k => Number(k))
                      .filter(n => Number.isFinite(n))
                      .sort((a, b) => a - b);

                  for (const epNo of episodeNumbers) {
                      const script = vol.scriptCache[epNo];
                      if (!script?.panels?.length) continue;
                      for (const p of script.panels) {
                          panelSummaries.push({
                              volId: vol.id,
                              volName: vol.name,
                              volOrder: vol.order,
                              episode_number: epNo,
                              panel_id: p.panel_id,
                              globalPanelNo: p.globalPanelNo,
                              active_characters_str: p.active_characters_str || '',
                              scene_name: p.scene_name || '',
                              props: p.props || '',
                              visual: p.visual || '',
                              script_content: p.script_content || '',
                          });
                      }
                  }
              }

              const storyboardJson = {
                  project: {
                      id: project.id,
                      name: project.name,
                  },
                  style: project.activeStyle
                      ? { id: project.activeStyle.id, name: project.activeStyle.name, prompt: project.activeStyle.prompt }
                      : null,
                  storyBible: project.storyBible
                      ? {
                          summary: project.storyBible.summary,
                          last_plot_point: project.storyBible.last_plot_point,
                          characters: project.storyBible.characters,
                      }
                      : null,
                  existingAssets: existingAssetsSummary,
                  storyboardPanels: panelSummaries,
              };

              // Keep the most important structured info near the front
              const header = [
                  `TASK: Extract unique visual assets (characters/scenes/items) for the asset library.`,
                  `RULES: Return JSON { assets: Asset[] } only.`,
                  `- De-duplicate by (type + name).`,
                  `- Prefer canonical full names (avoid pronouns like 他/她/这个).`,
                  `- If an asset already exists in existingAssets, do NOT re-create it.`,
                  `- For each asset: provide name, type(character|scene|item), description, prompt, aspectRatio.`,
                  `- Asset prompt should be UNIQUE but максимально reusable (通用资产): keep stable identity/design traits, avoid shot-specific transient details.`,
                  `  - Characters: keep stable appearance (face/hair/outfit/base accessories). Avoid emotions, actions, injuries, camera, dialogue.`,
                  `  - Scenes: keep stable environment/architecture/material/style landmarks. IMPORTANT: DO NOT include weather (rain/snow/fog) or time-of-day (night/dawn/sunset), avoid transient lighting events.`,
                  `  - Items: keep stable shape/material/function. Avoid who holds it, actions, transient effects unless intrinsic.`,
                  `- Asset prompt should be compatible with image generation and consistent with project style.`,
                  ``,
              ].join('\n');

              return `${header}\nSTORYBOARD_JSON:\n${JSON.stringify(storyboardJson)}`;
          };

          const inputText = buildAssetExtractionInput();
          const extractedAssets = await extractAssetsFromText(inputText, settings);
          
          // Merge - strip trailing parenthesis suffix from name for deduplication
          // This prevents "陆寒玄（战神）" and "陆寒玄（少年）" from being treated as different assets
          const stripNameSuffix = (name: string): string =>
              name
                  .trim()
                  .replace(/\s*[（(][^）)]*[）)]\s*$/u, '') // Remove trailing (xxx) or （xxx）
                  .trim();

          const normalizeKey = (type: string, name: string): string =>
              `${type}:${stripNameSuffix(name)}`.toLowerCase().replace(/\s+/g, ' ');

          const existingKeys = new Set(project.assets.map(a => normalizeKey(a.type, a.name)));

          const cleanTextByKeywords = (text: string, keywords: string[]): string => {
              let out = text;
              for (const kw of keywords) {
                  if (!kw) continue;
                  // Escape regex special chars
                  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // For ASCII-ish keywords, use word boundaries; for CJK, simple replace is fine
                  const isAscii = /^[\x00-\x7F]+$/.test(kw);
                  const re = isAscii ? new RegExp(`\\b${escaped}\\b`, 'gi') : new RegExp(escaped, 'gi');
                  out = out.replace(re, '');
              }
              // Normalize whitespace and punctuation spacing
              return out
                  .replace(/\s+/g, ' ')
                  .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
                  .replace(/([,.;:!?，。；：！？])\s+/g, '$1 ')
                  .replace(/\s+\)/g, ')')
                  .replace(/\(\s+/g, '(')
                  .trim();
          };

          const cleanScenePrompt = (text: string): string => {
              // Remove weather/time-of-day and other transient scene states
              const cn = [
                  '雨天','下雨','暴雨','雷雨','阵雨','细雨','大雨','倾盆大雨',
                  '雪天','下雪','暴雪','大雪','飘雪',
                  '雾','大雾','雾气','薄雾','浓雾','烟雾','霾',
                  '晴天','阴天','多云','乌云','风','狂风','台风','暴风',
                  '清晨','清早','黎明','拂晓','早晨','上午','中午','午后','傍晚','黄昏','夜晚','夜里','深夜','白天',
                  '日出','日落','夕阳','朝阳','月光','星空','夜色',
                  '冬天','夏天','春天','秋天','寒冷','炎热','酷热','严寒',
              ];
              const en = [
                  'rain','rainy','storm','thunder','lightning','snow','snowy',
                  'fog','mist','smoke','haze',
                  'sunny','cloudy','windy','typhoon','hurricane',
                  'morning','noon','afternoon','evening','dusk','dawn','sunrise','sunset','night','midnight','daytime',
                  'moonlight','starlight',
                  'winter','summer','spring','autumn',
              ];
              return cleanTextByKeywords(text, [...cn, ...en]);
          };

          // Extract suffix from name like "陆寒玄（战神）" -> { cleanName: "陆寒玄", suffix: "战神" }
          const extractNameSuffix = (name: string): { cleanName: string; suffix: string | null } => {
              const match = name.trim().match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/u);
              if (match) {
                  return { cleanName: match[1].trim(), suffix: match[2].trim() };
              }
              return { cleanName: name.trim(), suffix: null };
          };

          const sanitizeExtractedAsset = (asset: Asset): Asset => {
              // Clean name: move parenthesis suffix to description
              const { cleanName, suffix } = extractNameSuffix(asset.name);
              let updatedDesc = asset.description || '';
              if (suffix) {
                  // Prepend suffix as a tag to description if not already present
                  if (!updatedDesc.includes(suffix)) {
                      updatedDesc = `【${suffix}】${updatedDesc}`.trim();
                  }
              }

              if (asset.type === 'scene') {
                  const cleanedPrompt = cleanScenePrompt(asset.prompt || '');
                  const cleanedDesc = cleanScenePrompt(updatedDesc);
                  return {
                      ...asset,
                      name: cleanName,
                      prompt: cleanedPrompt,
                      description: cleanedDesc,
                  };
              }
              return {
                  ...asset,
                  name: cleanName,
                  description: updatedDesc,
              };
          };

          // Get default aspect ratio based on asset type (for 16:9 video workflow)
          const getDefaultAspectRatio = (assetType: string): string => {
            switch (assetType) {
              case 'character': return '1:1';   // Square for character identity reference
              case 'scene': return '16:9';      // Match video output ratio
              case 'item': return '1:1';        // Square for prop reference
              default: return '1:1';
            }
          };

          const safeAssets: Asset[] = extractedAssets
              .filter(a => a && typeof a.name === 'string' && a.name.trim().length > 0)
              .map((a, idx) => {
                  const type = (a.type === 'character' || a.type === 'scene' || a.type === 'item')
                      ? a.type
                      : 'item';
                  // Use type-specific default aspect ratio when not specified
                  const aspectRatio = typeof a.aspectRatio === 'string' && a.aspectRatio.trim() 
                      ? a.aspectRatio 
                      : getDefaultAspectRatio(type);
                  return {
                      id: a.id && typeof a.id === 'string' ? a.id : `asset_${Date.now()}_${idx}`,
                      type,
                      name: a.name.trim(),
                      description: typeof a.description === 'string' ? a.description : '',
                      prompt: typeof a.prompt === 'string' ? a.prompt : '',
                      aspectRatio,
                      imagePath: a.imagePath,
                      imageHistory: a.imageHistory,
                      attributes: a.attributes,
                  };
              })
              .map(sanitizeExtractedAsset);

          const toAdd = safeAssets.filter(a => !existingKeys.has(normalizeKey(a.type, a.name)));
          
          if (toAdd.length > 0) {
              await saveCurrentProject({ ...project, assets: [...project.assets, ...toAdd] });
              addLog(`成功提取 ${toAdd.length} 个新资产`, 'success');
          } else {
              addLog("未发现新资产", 'info');
          }
          handleTaskFinish(taskId, 'success');
      } catch (e: any) {
          addLog(e.message, 'error');
          handleTaskFinish(taskId, 'error');
      } finally {
          setStatus('IDLE');
      }
  };

  // ============================================================================
  // Asset Optimization Handlers
  // ============================================================================

  /**
   * Generate optimization proposals for existing assets
   * Uses local rules + optional AI optimization
   */
  const handleGenerateOptimizations = async () => {
      if (!project || project.assets.length === 0) {
          addLog('没有资产可供优化', 'info');
          return;
      }
      
      setIsOptimizing(true);
      const taskId = handleTaskStart("生成资产优化建议", "text", settings.writerModel);
      
      try {
          const result = await runAssetOptimization(
              project.assets,
              project.activeStyle || null,
              settings,
              { enableAI: true }  // Enable both local rules and AI
          );
          
          setOptimizationProposals(result.proposals);
          
          if (result.proposals.length > 0) {
              addLog(`发现 ${result.proposals.length} 条优化建议`, 'success');
          } else {
              addLog('所有资产已经是最佳状态', 'info');
          }
          
          handleTaskFinish(taskId, 'success');
      } catch (e: any) {
          addLog(`优化分析失败: ${e.message}`, 'error');
          handleTaskFinish(taskId, 'error');
      } finally {
          setIsOptimizing(false);
      }
  };

  /**
   * Accept a single optimization proposal
   */
  const handleAcceptProposal = async (proposal: AssetOptimizationProposal) => {
      if (!project) return;
      
      const originalAsset = project.assets.find(a => a.id === proposal.assetId);
      if (!originalAsset) {
          addLog(`找不到资产: ${proposal.assetName}`, 'error');
          return;
      }
      
      // Apply the proposal
      const updatedAsset = applyProposal(originalAsset, proposal);
      
      // Update the asset in project
      const newAssets = project.assets.map(a => 
          a.id === proposal.assetId ? updatedAsset : a
      );
      
      await saveCurrentProject({ ...project, assets: newAssets });
      
      // Remove from proposals list
      setOptimizationProposals(prev => prev.filter(p => p.id !== proposal.id));
      
      addLog(`已应用优化: ${proposal.assetName}`, 'success');
  };

  /**
   * Accept multiple proposals at once
   */
  const handleAcceptAllProposals = async (proposals: AssetOptimizationProposal[]) => {
      if (!project || proposals.length === 0) return;
      
      // Build a map of asset updates
      const updatesMap = new Map<string, Asset>();
      
      for (const proposal of proposals) {
          const originalAsset = project.assets.find(a => a.id === proposal.assetId);
          if (!originalAsset) continue;
          
          const updatedAsset = applyProposal(originalAsset, proposal);
          updatesMap.set(proposal.assetId, updatedAsset);
      }
      
      // Apply all updates
      const newAssets = project.assets.map(a => 
          updatesMap.has(a.id) ? updatesMap.get(a.id)! : a
      );
      
      await saveCurrentProject({ ...project, assets: newAssets });
      
      // Remove accepted proposals from list
      const acceptedIds = new Set(proposals.map(p => p.id));
      setOptimizationProposals(prev => prev.filter(p => !acceptedIds.has(p.id)));
      
      addLog(`已应用 ${proposals.length} 条优化`, 'success');
  };

  /**
   * Dismiss a single proposal (don't apply, just remove from list)
   */
  const handleDismissProposal = (proposalId: string) => {
      setOptimizationProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  /**
   * Clear all proposals
   */
  const handleClearProposals = () => {
      setOptimizationProposals([]);
  };

  // Clean up existing asset names: remove trailing parenthesis and merge duplicates
  const handleCleanupAssetNames = async () => {
      if (!project) return;
      
      // Helper to strip trailing parenthesis from name
      const stripNameSuffix = (name: string): string =>
          name
              .trim()
              .replace(/\s*[（(][^）)]*[）)]\s*$/u, '')
              .trim();
      
      // Helper to extract suffix from name
      const extractNameSuffix = (name: string): { cleanName: string; suffix: string | null } => {
          const match = name.trim().match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/u);
          if (match) {
              return { cleanName: match[1].trim(), suffix: match[2].trim() };
          }
          return { cleanName: name.trim(), suffix: null };
      };
      
      // Group assets by (type + cleanName)
      const assetGroups = new Map<string, Asset[]>();
      for (const asset of project.assets) {
          const cleanName = stripNameSuffix(asset.name);
          const key = `${asset.type}:${cleanName.toLowerCase()}`;
          if (!assetGroups.has(key)) {
              assetGroups.set(key, []);
          }
          assetGroups.get(key)!.push(asset);
      }
      
      // Merge duplicates
      const mergedAssets: Asset[] = [];
      let mergedCount = 0;
      let cleanedCount = 0;
      
      for (const [_key, group] of assetGroups) {
          if (group.length === 1) {
              // Single asset - just clean the name
              const asset = group[0];
              const { cleanName, suffix } = extractNameSuffix(asset.name);
              if (suffix) {
                  cleanedCount++;
                  let newDesc = asset.description || '';
                  if (!newDesc.includes(suffix)) {
                      newDesc = `【${suffix}】${newDesc}`.trim();
                  }
                  mergedAssets.push({
                      ...asset,
                      name: cleanName,
                      description: newDesc,
                  });
              } else {
                  mergedAssets.push(asset);
              }
          } else {
              // Multiple assets with same base name - merge them
              mergedCount += group.length - 1;
              
              // Keep the first one as base, merge descriptions and suffixes from others
              const base = group[0];
              const { cleanName } = extractNameSuffix(base.name);
              
              // Collect all suffixes and descriptions
              const allSuffixes: string[] = [];
              const allDescriptions: string[] = [];
              let bestImagePath = base.imagePath;
              const allHistory: string[] = [...(base.imageHistory || [])];
              
              for (const asset of group) {
                  const { suffix } = extractNameSuffix(asset.name);
                  if (suffix && !allSuffixes.includes(suffix)) {
                      allSuffixes.push(suffix);
                  }
                  if (asset.description && !allDescriptions.includes(asset.description)) {
                      allDescriptions.push(asset.description);
                  }
                  // Use the first available image
                  if (!bestImagePath && asset.imagePath) {
                      bestImagePath = asset.imagePath;
                  }
                  // Collect all history images
                  if (asset.imageHistory) {
                      for (const h of asset.imageHistory) {
                          if (!allHistory.includes(h)) allHistory.push(h);
                      }
                  }
              }
              
              // Build merged description
              let mergedDesc = allSuffixes.length > 0 
                  ? `【${allSuffixes.join('/')}】`
                  : '';
              mergedDesc += allDescriptions.join(' ');
              
              mergedAssets.push({
                  ...base,
                  name: cleanName,
                  description: mergedDesc.trim(),
                  imagePath: bestImagePath,
                  imageHistory: allHistory.slice(0, 10), // Keep max 10 history items
              });
          }
      }
      
      if (mergedCount > 0 || cleanedCount > 0) {
          await saveCurrentProject({ ...project, assets: mergedAssets });
          addLog(`资产名称清理完成: ${cleanedCount} 个去括号, ${mergedCount} 个合并`, 'success');
      } else {
          addLog('没有需要清理的资产', 'info');
      }
  };

  // Storyboard Handlers
  const handleGeneratePanelImage = async (panelId: number, prompt: string, episodeNum: number, volId: string) => {
      const panelKey = `panel-${panelId}`;
      setGeneratingItemIds(prev => new Set(prev).add(panelKey));
      setStatus('GENERATING_IMAGE');
      const taskId = handleTaskStart(`分镜绘图 (Panel #${panelId})`, "image", settings.imageModel);

      try {
         const url = await generateImage(prompt, settings, "16:9");
         const response = await fetch(url);
         const blob = await response.blob();
         await handleSavePanelImage(panelId, blob, episodeNum, volId);
         addLog("分镜图生成成功", 'success');
         playSuccessSound('panel', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
         handleTaskFinish(taskId, 'success');
      } catch (e: any) {
         addLog(e.message, 'error');
         playSound('error', settings.soundEnabled ?? true, settings.soundVolume ?? 1.0);
         handleTaskFinish(taskId, 'error');
      } finally {
         setGeneratingItemIds(prev => { const n = new Set(prev); n.delete(panelKey); return n; });
         setStatus('IDLE');
      }
  };

  const handleSavePanelImage = async (panelId: number, imageBlob: Blob, episodeNum: number, volId: string) => {
      if (!project) return;
      
      // Ensure project directory exists
      await ensureProjectDir();
      
      const filename = `panel_${episodeNum}_${panelId}_${Date.now()}.png`;
      const path = await saveImageToAssets(imageBlob, filename);
      
      const vol = project.volumes.find(v => v.id === volId);
      if (!vol) return;
      
      const script = vol.scriptCache[episodeNum];
      if (!script) return;
      
      const oldPanel = script.panels.find(p => p.panel_id === panelId);
      if (!oldPanel) return;

      const newHistory = [path, ...(oldPanel.imageHistory || [])].slice(0, 5);
      const newPanel = { ...oldPanel, imagePath: path, imageHistory: newHistory };
      const newPanels = script.panels.map(p => p.panel_id === panelId ? newPanel : p);
      
      // Update DB
      const updatedVolumes = project.volumes.map(v => 
          v.id === volId 
          ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...script, panels: newPanels } } }
          : v
      );
      
      await saveCurrentProject({ ...project, volumes: updatedVolumes });
  };

  const handleUpdatePanelAssets = (volId: string, episodeNum: number, panelId: number, assetIds: string[], itemIds: string[]) => {
      // CRITICAL: Use functional update to read from latest project state
      // This prevents race condition where second call reads stale project and overwrites data
      let updatedProjectForSave: Project | null = null;
      
      setProject(prev => {
        if (!prev) return null;
        
        const vol = prev.volumes.find(v => v.id === volId);
        if (!vol) return prev;
        const script = vol.scriptCache[episodeNum];
        if (!script) return prev;
        
        const newPanels = script.panels.map(p => 
            p.panel_id === panelId ? { ...p, relatedAssetIds: assetIds, relatedItemIds: itemIds } : p
        );
        
        const updatedVolumes = prev.volumes.map(v => 
            v.id === volId 
            ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...script, panels: newPanels } } }
            : v
        );
        
        const updated = { ...prev, volumes: updatedVolumes, lastModified: Date.now() };
        updatedProjectForSave = updated;
        
        return updated;
      });
      
      // Wait for React state update to complete
      if (updatedProjectForSave) {
        saveCurrentProject(updatedProjectForSave);
      }
  };
  
  const handleBatchUpdatePanels = (volId: string, episodeNum: number, newPanels: ScriptPanel[]) => {
      if (!project) return;
      
      // CRITICAL: Use functional update to read from latest project state
      // This prevents race condition where second call reads stale project and overwrites data
      let updatedProjectForSave: Project | null = null;
      
      setProject(prev => {
        if (!prev) return null;
        
        const updatedVolumes = prev.volumes.map(v => 
            v.id === volId 
            ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...v.scriptCache[episodeNum], panels: newPanels } } }
            : v
        );
        
        const updated = { ...prev, volumes: updatedVolumes, lastModified: Date.now() };
        updatedProjectForSave = updated;
        
        return updated;
      });
      
      // Persist to disk (don't call saveCurrentProject as it would setProject again)
      if (updatedProjectForSave) {
        const dirHandle = projectDirMapRef.current.get(project.id);
        if (dirHandle) {
          saveProjectToDirWithHandle(updatedProjectForSave, dirHandle).catch(err => {
            console.error('[App] Failed to persist project after panel update:', err);
          });
        }
      }
  };

  const handleSelectPanelHistoryImage = async (panelId: number, path: string, episodeNum: number, volId: string) => {
      if (!project) return;
       const vol = project.volumes.find(v => v.id === volId);
      if (!vol) return;
      const script = vol.scriptCache[episodeNum];
      if (!script) return;
      
      const newPanels = script.panels.map(p => 
          p.panel_id === panelId ? { ...p, imagePath: path } : p
      );
      
      const updatedVolumes = project.volumes.map(v => 
          v.id === volId 
          ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...script, panels: newPanels } } }
          : v
      );
      await saveCurrentProject({ ...project, volumes: updatedVolumes });
  };
  
  const handleAutoGenerateBible = async () => {
     if (!project || !activeVolume || !activeVolume.plotBreakdown) return;
     setStatus('ARCHIVING');
     const taskId = handleTaskStart("剧情记忆库归档", "text", settings.writerModel);
     try {
         const newBible = await generateStoryBible(activeVolume.plotBreakdown, settings, project.storyBible || undefined);
         await updateStoryBible(project.id, newBible);
         setProject({...project, storyBible: newBible});
         addLog('剧情记忆库已更新', 'success');
         handleTaskFinish(taskId, 'success');
     } catch (e: any) {
         addLog(`记忆更新失败: ${e.message}`, 'error');
         handleTaskFinish(taskId, 'error');
     } finally {
         setStatus('IDLE');
     }
  };

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white font-sans overflow-hidden">
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar 
          currentView={currentView} 
          onChangeView={setCurrentView} 
          hasProject={!!project}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#121212] relative">
          
          {/* Views */}
          {currentView === 'DASHBOARD' && (
             <div className="absolute inset-0 bg-[#121212] z-50 overflow-auto">
                <ProjectManager
                   projects={projectsList}
                   onSelectProject={handleSelectProject}
                   onCreateProject={handleCreateProject}
                   onDeleteProject={handleDeleteProject}
                   onUpdateProject={handleUpdateProject}
                   onOpenSettings={() => setIsSettingsOpen(true)}
                   onImportProject={handleImportProject}
                   onExportProject={() => handleExportProject('zip')}
                   workspaceName={workspaceName}
                   hasWorkspace={!!workspaceHandle}
                   isWorkspaceLoading={isWorkspaceLoading}
                   onSelectWorkspace={handleSelectWorkspace}
                   onSwitchWorkspace={handleSwitchWorkspace}
                />
             </div>
          )}

          {currentView === 'SCRIPT' && project && (
             <div className="flex h-full">
                {/* Left: Source Panel */}
                <div className="w-[450px] h-full shrink-0 border-r border-white/5 bg-[#1E1E1E]">
                    <SourcePanel 
                       volumes={project.volumes}
                       activeVolumeId={project.activeVolumeId}
                       onVolumeChange={(id) => {
                           if (project) {
                               const updated = { ...project, activeVolumeId: id, lastModified: Date.now() };
                               saveCurrentProject(updated);
                           }
                       }}
                       onAppendVolume={handleAppendVolume}
                       onImportNovel={handleSmartImport}
                       onUpdateContent={(content) => updateActiveVolume(() => ({ content }))}
                       onDeleteVolume={handleDeleteVolume}
                       
                       rawText={rawText}
                       plotBreakdown={plotBreakdown}
                       selectedEpisode={selectedEpisode}
                       onSelectEpisode={setSelectedEpisode}
                       onGeneratePlot={handleGeneratePlot}
                       isGenerating={status === 'SPLITTING' || status === 'BREAKDOWN_ALIGNING'}
                       generatingEpisodes={generatingEpisodes}
                       scriptCache={scriptCache}
                       onBackToProjects={() => { setProject(null); setCurrentView('DASHBOARD'); }}
                       
                       onUpdateEpisode={handleUpdateEpisode}
                       onRunBreakdownQA={handleRunBreakdownQA}
                       onGenerateScript={(ep) => handleGenerateScript(ep, getSuggestedPanelCount(ep))}

                       // Missing props fixed
                       onBatchGenerate={() => {}} 
                       onBatchExport={() => {}}
                       activeStyle={project.activeStyle}
                       customStyles={project.customStyles}
                       onSelectStyle={() => {}}
                       onAddStyle={() => {}}
                       onDeleteStyle={() => {}}
                       onAutoDetectStyle={() => {}}
                    />
                </div>

                {/* Middle: Script Canvas */}
                <div className="flex-1 h-full min-w-0 bg-[#121212]">
                   <ScriptCanvas 
                      script={currentScript}
                      status={status}
                      onGenerateScript={async (count) => {
                          if (!selectedEpisode || !rawText) return;
                          
                          if (!project.activeStyle) {
                              const style = await detectNovelStyle(rawText, settings);
                              if (style) {
                                  const updated = { ...project, activeStyle: style, customStyles: [...project.customStyles, style] };
                                  await saveCurrentProject(updated);
                              }
                          }
                          
                          handleGenerateScript(selectedEpisode, count);
                      }}
                      onUpdateScript={handleUpdateScript}
                      onExportScript={() => handleExportProject('zip')}
                      selectedEpisodeTitle={selectedEpisode?.title}
                      suggestedPanelCount={suggestedPanelCount}
                      highlightedPanelId={highlightedPanelId}
                   />
                </div>

                {/* Right: Inspector */}
                <div className="w-[350px] h-full shrink-0 border-l border-white/5 bg-[#181818]">
                   <InspectorPanel 
                      report={currentReport}
                      breakdownReport={breakdownReport}
                      pipelineStatus={status}
                      onAcceptSuggestion={handleAcceptSuggestion}
                      onRevertFix={handleRevertFix}
                      onRunQA={handleRunQA}
                      onRevertBreakdownIssue={handleRevertBreakdownIssue}
                      
                      activeStyle={project.activeStyle}
                      onOpenStyleManager={() => setShowStyleModal(true)}
                      onInspectIssue={(panelId) => setHighlightedPanelId(panelId)}
                   />
                </div>
             </div>
          )}

          {currentView === 'ASSETS' && project && (
             <AssetLibrary 
                assets={project.assets}
                onAddAsset={handleAddAsset}
                onUpdateAsset={handleUpdateAsset}
                onDeleteAsset={handleDeleteAsset}
                onGenerateImage={handleGenerateAssetImage}
                onSelectHistoryImage={(assetId, url) => {
                    const newAssets = project.assets.map(a => a.id === assetId ? { ...a, imagePath: url } : a);
                    saveCurrentProject({ ...project, assets: newAssets });
                }}
                onAutoExtract={handleAutoExtractAssets}
                onCleanupNames={handleCleanupAssetNames}
                // Asset extraction uses WRITING status
                isGenerating={status === 'WRITING'}
                generatingItemIds={generatingItemIds}
                // Optimization props
                optimizationProposals={optimizationProposals}
                isOptimizing={isOptimizing}
                onGenerateOptimizations={handleGenerateOptimizations}
                onAcceptProposal={handleAcceptProposal}
                onAcceptAllProposals={handleAcceptAllProposals}
                onDismissProposal={handleDismissProposal}
                onClearProposals={handleClearProposals}
             />
          )}

          {currentView === 'STORYBOARD' && project && (
             <StoryboardBoard 
                project={project}
                settings={settings}
                onGeneratePanelImage={handleGeneratePanelImage}
                onUpdatePanelAssets={handleUpdatePanelAssets}
                onGenerateAssetImage={handleGenerateAssetImage}
                onUpdateAsset={handleUpdateAsset}
                onSavePanelImage={handleSavePanelImage}
                onUpdatePanels={handleBatchUpdatePanels}
                onSelectHistoryImage={handleSelectPanelHistoryImage}
                onSelectAssetHistoryImage={(assetId, url) => {
                     const newAssets = project.assets.map(a => a.id === assetId ? { ...a, imagePath: url } : a);
                     saveCurrentProject({ ...project, assets: newAssets });
                }}
                status={status}
                generatingItemIds={generatingItemIds}
                onTaskStart={handleTaskStart}
                onTaskFinish={handleTaskFinish}
             />
          )}
          
          {currentView === 'SETTINGS' && (
              <div className="flex items-center justify-center h-full bg-black/50">
                  <SettingsModal 
                    isOpen={true} 
                    onClose={() => setCurrentView('DASHBOARD')} 
                    settings={settings} 
                    onSave={(s) => { setSettings(s); saveSettings(s); }}
                    backupConfig={backupConfig}
                    onUpdateBackupConfig={handleUpdateBackupConfig}
                    onCreateBackup={handleCreateBackup}
                    getBackups={() => autoBackupServiceRef.current?.getBackups() || Promise.resolve([])}
                    onRestoreBackup={async (id) => {
                      const backup = await autoBackupServiceRef.current?.restoreBackup(id);
                      if (backup) {
                        setProject(backup);
                        await saveCurrentProject(backup);
                        addLog('备份已恢复', 'success');
                      }
                    }}
                    onDeleteBackup={async (id) => {
                      await autoBackupServiceRef.current?.deleteBackup(id);
                    }}
                  />
              </div>
          )}

          {/* Overlays / Modals */}
          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            settings={settings} 
            onSave={(s) => { setSettings(s); saveSettings(s); }}
            backupConfig={backupConfig}
            onUpdateBackupConfig={handleUpdateBackupConfig}
            onCreateBackup={handleCreateBackup}
            getBackups={() => autoBackupServiceRef.current?.getBackups() || Promise.resolve([])}
            onRestoreBackup={async (id) => {
              const backup = await autoBackupServiceRef.current?.restoreBackup(id);
              if (backup) {
                setProject(backup);
                await saveCurrentProject(backup);
                addLog('备份已恢复', 'success');
              }
            }}
            onDeleteBackup={async (id) => {
              await autoBackupServiceRef.current?.deleteBackup(id);
            }}
          />
          
          <StoryBibleModal 
            isOpen={isBibleModalOpen}
            onClose={() => setIsBibleModalOpen(false)}
            bible={project?.storyBible || null}
            onSave={(b) => { if (project) { updateStoryBible(project.id, b); setProject({...project, storyBible: b}); } }}
            onAutoGenerate={handleAutoGenerateBible}
          />

          {showStyleModal && project && (
              <StyleManager 
                 activeStyle={project.activeStyle}
                 customStyles={project.customStyles}
                 onSelectStyle={async (style) => {
                     const updated = { ...project, activeStyle: style, lastModified: Date.now() };
                     await saveCurrentProject(updated);
                 }}
                 onAddStyle={async (style) => {
                     const updated = { ...project, customStyles: [...project.customStyles, style], lastModified: Date.now() };
                     await saveCurrentProject(updated);
                 }}
                 onDeleteStyle={async (id) => {
                     const updated = { 
                         ...project, 
                         customStyles: project.customStyles.filter(s => s.id !== id),
                         lastModified: Date.now()
                     };
                     if (project.activeStyle?.id === id) {
                         updated.activeStyle = null;
                     }
                     await saveCurrentProject(updated);
                 }}
                 onClose={() => setShowStyleModal(false)}
                 onAutoDetect={async () => {
                     if(!rawText) return;
                     const style = await detectNovelStyle(rawText, settings);
                     if (style) {
                         const updated = { ...project, customStyles: [...project.customStyles, style] };
                         await saveCurrentProject(updated);
                     }
                 }}
                 isDetecting={false}
              />
          )}

        </div>
      </div>
      
      {/* Global Status Bar */}
      <StatusBar
        status={status}
        generatingItemIds={generatingItemIds}
        tasks={tasks}
        saveStatus={saveStatus}
        activeModelLabel={(() => {
          if (status === 'SPLITTING' || status === 'BREAKDOWN_ALIGNING') return settings.splitterModel;
          if (status === 'WRITING') return settings.writerModel;
          if (status === 'ALIGNING' || status === 'AUTO_FIXING') return settings.alignerModel;
          if (status === 'GENERATING_IMAGE') return settings.imageModel;
          return settings.writerModel || settings.splitterModel;
        })()}
        allModelsHint={`Splitter: ${settings.splitterModel}\nWriter: ${settings.writerModel}\nAligner: ${settings.alignerModel}\nImage: ${settings.imageModel}`}
        logs={logs}
        onClearLogs={() => setLogs([])}
      />

    </div>
  );
};