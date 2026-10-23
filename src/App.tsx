import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { TestV3Upload } from './modules/gallery/presentation/components/TestV3Upload';
import { Sidebar } from '../components/Sidebar';
import { Dashboard } from '../components/Dashboard';
import { ProjectManager } from '../components/ProjectManager';
import { AssetLibrary } from '../components/AssetLibrary';
import { StoryboardBoard } from '../components/StoryboardBoard';
import { SourcePanel } from '../components/SourcePanel';
import { ScriptCanvas } from '../components/ScriptCanvas';
import { InspectorPanel } from '../components/InspectorPanel';
import { SettingsModal } from '../components/SettingsModal';
import { StoryBibleModal } from '../components/StoryBibleModal';
import { StyleManager } from '../components/StyleManager';
import { StatusBar } from '../components/StatusBar';
import { 
  runSplitterAgent, 
  runWriterAgent, 
  runAlignerAgent, 
  runBreakdownAligner, 
  extractAssetsFromText,
  detectNovelStyle,
  generateImage,
  generateStoryBible
} from '../services/geminiService';
import { 
  openDirectory, 
  saveProjectToDir, 
  saveImageToAssets,
  loadAssetImage,
  loadProjectFromDir,
  initializeNewProject
} from '../services/fileSystem';
import { loadSettings, saveSettings, loadProjects, saveProject, deleteProject, updateStoryBible } from '../db';
import { exportProjectToZip, importProjectFromZip } from '../services/zipService';

import { 
  PlotEpisode, 
  PipelineStatus,
  MessageLog,
  Project,
  AppSettings,
  Volume,
  Asset,
  NovelStyle,
  WebtoonScript,
  ScriptPanel
} from '../types';

function App2() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Panelix V3.0 架构验证</h1>
        <p className="text-gray-600">正在测试：OPFS 文件存储 + RxDB 数据库</p>
      </header>

      <main>
        {/* 2. 在这里放置测试组件 */}
        <div className="bg-white p-6 rounded-lg shadow-md">
           <TestV3Upload />
        </div>
      </main>
    </div>
  );
}


// Default Prompts (No Changes)
const PROMPT_SPLITTER = `# Role: Data Processing Engine (Manju Adaptation Mode)
# Core Logic: Visual-Paced Adaptation Methodology
# Language: STRICTLY Simplified Chinese (简体中文) for content values.

You are a STRICT data extraction and restructuring pipeline.
You do NOT write creative prose. You analyze raw novel text and restructure it into a JSON format optimized for "Manju" (Motion Comic/Short Drama) production.

Your internal processing logic is based on the **Manju Adaptation Methodology**:
1.  **Reconstruction, Not Translation**: You do not summarize chapter by chapter. You regroup content based on "Emotional Hooks" and "Conflict Density".
2.  **Pacing**: Each \`episode\` in the JSON represents 1-2 minutes of visual content (approx. 500-800 words of source text equivalent).
3.  **Structure**: Each episode must follow the "Start-Develop-Twist-Hook" (起承转勾) flow.

【TASK】
Parse input novel text into a JSON Plot Outline.

【PROCESSING RULES】
1.  **Segmentation (分集逻辑)**:
    -   Ignore original chapter boundaries.
    -   Slice the text into episodes based on **High-Density Conflicts**.
    -   Ensure every episode ends with a **Strong Hook** (Suspense/Cliffhanger).
2.  **Title Generation (标题逻辑)**:
    -   Extract the most shocking/engaging element of the segment.
    -   Format: Short video style (Shocking, Suspenseful, Direct). E.g., "哑巴开口，全场下跪！" instead of "Chapter 1 Summary".
3.  **Visual Extraction (视觉化摘要)**:
    -   In \`scenes_summary\`, filter out internal monologues and environmental descriptions unless they are visually striking.
    -   Focus on: Actions, Expressions, Violence, Magic Effects, Key Dialogue lines.

【JSON OUTPUT SCHEMA】
\`\`\`json
{
  "batch_id": "string", // Unique ID for this batch (e.g., "novel_title_batch_01")
  "episodes": [
    {
      "episode_number": number, // Integer, starting from 1
      "title": "string", // Short video style title (Chinese)
      "core_conflict": "string", // The main conflict resolved or exploded in this episode (Chinese)
      "hook_type": "Suspense" | "Revenge" | "Romance" | "Action" | "Face-Slapping", // Select best fit
      "hook_intensity": number, // 1-10 (10 being highest emotional impact)
      "scenes_summary": [
        "string", // Scene 1: Visual description (Chinese)
        "string", // Scene 2: Visual description (Chinese)
        "string"  // Scene 3: The 'Hook' ending description (Chinese)
      ]
    }
  ]
}
\`\`\``;

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
    "props": "string (Optional)"
  }
]
\`\`\`

### Example (Good):
"▲广角俯视 陆晨玄（战神，浑身浴血） 孤身立于破碎仙宫，四周雷霆肆虐【雷鸣声】。\\n▲特写 他（眼角崩裂，血泪滑落） 仰天咆哮，身后炸开金色残魂虚影【炸裂声】：“北冥幽！你安敢如此对我！”\\n▲画面震动 他（双手结印，指尖发白） 猛然向虚空按去，引发空间坍塌。"

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
  splitterModel: 'gemini-2.5-flash-nothinking',
  writerModel: 'gemini-2.5-flash-nothinking',
  alignerModel: 'gemini-2.5-flash-nothinking',
  imageModel: 'gemini-2.5-flash-image-preview', // Updated Default
  
  // Default Prompts
  splitterPrompt: PROMPT_SPLITTER,
  writerPrompt: PROMPT_WRITER,
  alignerPrompt: PROMPT_ALIGNER,
  breakdownPrompt: PROMPT_BREAKDOWN,
  assetPrompt: PROMPT_ASSET,
  stylePrompt: PROMPT_STYLE,
  archivistPrompt: PROMPT_ARCHIVIST,

  storageKeyPrefix: 'automanju_projects',
  // API Key 不写死在源码中：优先从 UI 设置（localStorage / IndexedDB）读取，
  // 或在 config.json 中配置（见 config.example.json）。
  apiKey: '',
  apiBaseUrl: 'https://api.whatai.cc/v1/chat/completions',
  customModels: []
};

// Define busy statuses that should block user input (Global Pipeline)
const BUSY_STATUSES: PipelineStatus[] = ['SPLITTING', 'BREAKDOWN_ALIGNING', 'WRITING', 'ALIGNING', 'AUTO_FIXING', 'GENERATING_IMAGE', 'ARCHIVING'];

export const App = () => {
  // --- Global App State ---
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'SCRIPT' | 'ASSETS' | 'STORYBOARD' | 'SETTINGS'>('DASHBOARD');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<PipelineStatus>('IDLE');
  
  // New: Track specific items being generated (assets or panels) to avoid blocking the whole UI
  const [generatingItemIds, setGeneratingItemIds] = useState<Set<string>>(new Set());

  // --- Project State ---
  const [projectsList, setProjectsList] = useState<Project[]>([]); // List for Dashboard
  const [project, setProject] = useState<Project | null>(null);    // Active Project
  
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
  const suggestedPanelCount = useMemo(() => {
     if (!selectedEpisode) return 6; // Default lowered
     
     const summaryText = Array.isArray(selectedEpisode.scenes_summary) 
        ? selectedEpisode.scenes_summary.join(" ") 
        : String(selectedEpisode.scenes_summary || "");
     
     const intensity = selectedEpisode.hook_intensity || 5;

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

     let potentialShots = dialogueLines + narrativeShots;

     // 3. 3-to-1 Compression
     // The core requirement: max 3 shots merge into 1 panel
     let basePanels = potentialShots / 2.5; 

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
     return Math.max(6, Math.min(12, Math.round(finalCount)));
  }, [selectedEpisode]);

  // Check if app is busy
  const isBusy = BUSY_STATUSES.includes(status);

  // --- Initialization ---
  useEffect(() => {
    loadSettings().then(s => {
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    });
    refreshProjectsList();
  }, []);

  const refreshProjectsList = async () => {
    const list = await loadProjects();
    setProjectsList(list);
  };

  const addLog = useCallback((text: string, type: MessageLog['type'] = 'info') => {
    setLogCounter(prev => prev + 1);
    setLogs(prev => [...prev, { id: `${Date.now().toString()}-${logCounter + 1}`, timestamp: new Date(), type, text }]);
  }, [logCounter]);

  // --- Project Management Handlers ---
  
  const handleSelectProject = (id: string) => {
    const p = projectsList.find(x => x.id === id);
    if (p) {
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
      setProject(projectData);
      setCurrentView('SCRIPT');
      addLog(`已加载项目: ${p.name}`);
    }
  };

  // Updated to accept cover
  const handleCreateProject = async (name: string, cover?: string) => {
    const newProject: Project = {
      id: Date.now().toString(),
      name,
      coverImage: cover,
      lastModified: Date.now(),
      volumes: [],
      // novelStyles: [], // Deprecated
      activeStyle: null,
      customStyles: [], // Empty start
      activeVolumeId: "",
      storyBible: null,
      assets: []
    };
    await saveProject(newProject);
    await refreshProjectsList();
    handleSelectProject(newProject.id);
  };

  const handleDeleteProject = async (id: string) => {
    try {
        const isDeletingCurrent = project?.id === id;
        await deleteProject(id);
        await refreshProjectsList();
        
        if (isDeletingCurrent) {
          setProject(null);
          setCurrentView('DASHBOARD');
        }
        addLog("项目已删除", "success");
    } catch (e: any) {
        console.error("Failed to delete project:", e);
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

      await saveProject(updatedProject);
      await refreshProjectsList();
      
      // If updating current active project, sync state
      if (project?.id === projectId) {
          setProject(updatedProject);
      }
      addLog(`项目已更新: ${name}`, 'success');
  };

  const handleExportProject = async (proj: Project) => {
    try {
      addLog("正在打包资源 (ZIP)...", "info");
      const count = await exportProjectToZip(proj);
      addLog(`项目导出成功！包含 ${count} 个媒体文件。`, 'success');
    } catch (e: any) {
      console.error("Export failed", e);
      addLog(`导出失败: ${e.message}`, 'error');
    }
  };

  const handleImportProject = async (file: File) => {
    try {
      // 简单判断文件类型
      if (file.name.endsWith('.json')) {
         alert("检测到旧版 JSON 格式。建议导出为 ZIP 格式以包含图片。");
         const text = await file.text();
         const data = JSON.parse(text);
         await saveProject(data);
         await refreshProjectsList();
         addLog("旧版 JSON 导入成功 (无图片)", "warning");
         return;
      }
  
      addLog("正在解压项目包...", "info");
      const importedProject = await importProjectFromZip(file);
      
      // 强制更新最后修改时间，使其排在最前
      const finalProject = { ...importedProject, lastModified: Date.now() };
      
      await saveProject(finalProject);
      await refreshProjectsList();
      addLog(`项目 "${finalProject.name}" 导入成功`, 'success');
  
    } catch (e: any) {
      console.error(e);
      addLog(`导入失败: ${e.message}`, 'error');
      alert(`导入失败: 文件可能已损坏或格式不正确。`);
    }
  };

  // --- Core Persistence Helper ---
  const saveCurrentProject = async (updatedProject: Project) => {
    setProject(updatedProject);
    try {
      await saveProject(updatedProject);
      setProjectsList(prevList => {
         const exists = prevList.some(p => p.id === updatedProject.id);
         if (exists) {
            return prevList.map(p => p.id === updatedProject.id ? updatedProject : p);
         }
         return [updatedProject, ...prevList];
      });
      // Attempt background directory sync
      saveProjectToDir(updatedProject).catch(() => {});
    } catch (e) {
      console.error("Save failed", e);
      addLog("保存失败", 'error');
    }
  };

  const updateActiveVolume = useCallback((updater: (vol: Volume) => Partial<Volume>) => {
    setProject(prev => {
      if (!prev) return null;
      const currentActiveId = prev.activeVolumeId;
      if (!currentActiveId) return prev;
      const newVolumes = prev.volumes.map(v => v.id === currentActiveId ? { ...v, ...updater(v) } : v);
      const newProject = { ...prev, volumes: newVolumes, lastModified: Date.now() };
      saveProject(newProject).then(() => {
          setProjectsList(list => list.map(p => p.id === newProject.id ? newProject : p));
          saveProjectToDir(newProject).catch(() => {});
      }).catch(e => console.error("Auto-save failed", e));
      return newProject;
    });
  }, []);

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
          
      } catch (e: any) { 
          setStatus('ERROR'); 
          addLog(e.message, 'error'); 
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
    const CHUNK_SIZE = 100; const newVolumesList: Volume[] = []; let baseOrder = project.volumes.length;
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
  const handleDeleteVolume = async (volId: string) => {
    if (!project) return;
    if (!window.confirm("确定要删除此卷吗？数据将无法恢复。")) return;
    const newVolumes = project.volumes.filter(v => v.id !== volId);
    let newActiveId = project.activeVolumeId;
    if (project.activeVolumeId === volId) { newActiveId = newVolumes.length > 0 ? newVolumes[0].id : ""; }
    const updatedProject = { ...project, volumes: newVolumes, activeVolumeId: newActiveId, lastModified: Date.now() };
    await saveCurrentProject(updatedProject);
    addLog("分卷已删除", 'success');
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

    setStatus('SPLITTING'); // Start busy state
    
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

    const breakdownPromise = runSplitterAgent(rawText, settings, project?.storyBible || undefined);

    try {
      const [data, style] = await Promise.all([breakdownPromise, stylePromise]);
      
      data.episodes = data.episodes.map(e => ({...e, status: 'idle'}));
      
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

    } catch (e: any) {
      console.error(e);
      setStatus('ERROR');
      addLog(`拆解失败: ${e.message}`, 'error');
    }
  };

  const handleGenerateScript = async (episode: PlotEpisode, panelCount: number = 8) => {
      if (!project) return;
      setStatus('WRITING');
      
      try {
          // Get breakdown suggestions if any
          const breakdownIssueText = breakdownReport?.issues
             .filter(i => i.target_episode === episode.episode_number && !i.is_fixed)
             .map(i => `[Issue: ${i.description}] Suggestion: ${i.suggestion}`)
             .join('\n');

          const { script, newAssets } = await runWriterAgent(episode, settings, breakdownIssueText, panelCount);
          
          // Merge new assets
          const existingIds = new Set(project.assets.map(a => a.name));
          const uniqueNewAssets = newAssets.filter(a => !existingIds.has(a.name));
          
          const updatedAssets = [...project.assets, ...uniqueNewAssets];
          
          // Save script and assets
          updateActiveVolume(vol => ({
              scriptCache: { ...vol.scriptCache, [episode.episode_number]: script }
          }));
          
          await saveCurrentProject({ ...project, assets: updatedAssets });
          
          setStatus('ALIGNING');
          
          // Auto run Aligner
          const report = await runAlignerAgent(episode, script, settings);
          updateActiveVolume(vol => ({
              reportCache: { ...vol.reportCache, [episode.episode_number]: report }
          }));

          setStatus('SUCCESS');
          addLog(`EP.${episode.episode_number} 剧本生成完成`, 'success');
          
      } catch (e: any) {
          setStatus('ERROR');
          addLog(`剧本生成失败: ${e.message}`, 'error');
      }
  };

  const handleUpdateScript = (newScript: WebtoonScript) => {
      updateActiveVolume(vol => ({
          scriptCache: { ...vol.scriptCache, [newScript.episode_number]: newScript }
      }));
  };

  // QA Handlers
  const handleRunQA = async () => {
      if (!selectedEpisode || !currentScript) return;
      setStatus('ALIGNING');
      try {
          const report = await runAlignerAgent(selectedEpisode, currentScript, settings);
          updateActiveVolume(vol => ({
              reportCache: { ...vol.reportCache, [selectedEpisode.episode_number]: report }
          }));
          setStatus('SUCCESS');
      } catch (e: any) {
          setStatus('ERROR');
          addLog(e.message, 'error');
      }
  };

  const handleAcceptSuggestion = (panelId: number, suggestion: string) => {
      if (!currentScript) return;
      const targetPanel = currentScript.panels.find(p => p.panel_id === panelId);
      if(targetPanel) {
           const newContent = targetPanel.script_content + `\n▲[修正建议] ${suggestion}`;
           const updatedPanels = currentScript.panels.map(p => p.panel_id === panelId ? { ...p, script_content: newContent } : p);
           handleUpdateScript({ ...currentScript, panels: updatedPanels });
      }
  };

  const handleRevertFix = (panelId: number) => {
      if (!currentReport) return;
      const issueIndex = currentReport.critical_issues.findIndex(i => i.panel_id === panelId && i.is_fixed);
      if (issueIndex !== -1) {
          const newIssues = [...currentReport.critical_issues];
          newIssues[issueIndex] = { ...newIssues[issueIndex], is_fixed: false };
          updateActiveVolume(vol => ({
              reportCache: { ...vol.reportCache, [currentScript!.episode_number]: { ...currentReport, critical_issues: newIssues } }
          }));
      }
  };

  // Asset Handlers
  const handleAddAsset = async (asset: Asset) => {
      if(!project) return;
      const newAssets = [...project.assets, asset];
      await saveCurrentProject({ ...project, assets: newAssets });
  };
  
  const handleUpdateAsset = async (asset: Asset) => {
      if(!project) return;
      const newAssets = project.assets.map(a => a.id === asset.id ? asset : a);
      await saveCurrentProject({ ...project, assets: newAssets });
  };

  const handleDeleteAsset = async (assetId: string) => {
      if(!project) return;
      const newAssets = project.assets.filter(a => a.id !== assetId);
      await saveCurrentProject({ ...project, assets: newAssets });
  };

  const handleGenerateAssetImage = async (assetId: string) => {
      const asset = project.assets.find(a => a.id === assetId);
      if (!asset) return;
      
      setGeneratingItemIds(prev => new Set(prev).add(assetId));
      setStatus('GENERATING_IMAGE');
      
      try {
          const prompt = `${asset.prompt}. ${project?.activeStyle?.prompt || ""}`;
          const url = await generateImage(prompt, settings, asset.aspectRatio);
          
          // Save to local fs
          const response = await fetch(url);
          const blob = await response.blob();
          const filename = `asset_${asset.id}_${Date.now()}.png`;
          const localPath = await saveImageToAssets(blob, filename);
          
          // Update asset history
          const history = [localPath, ...(asset.imageHistory || [])].slice(0, 5); // Keep last 5
          const newAsset = { ...asset, imagePath: localPath, imageHistory: history };
          
          handleUpdateAsset(newAsset);
          addLog(`资产 ${asset.name} 生图成功`, 'success');
      } catch (e: any) {
          addLog(`生图失败: ${e.message}`, 'error');
      } finally {
          setGeneratingItemIds(prev => { const n = new Set(prev); n.delete(assetId); return n; });
          setStatus('IDLE');
      }
  };
  
  const handleAutoExtractAssets = async () => {
      if (!rawText) return;
      setStatus('WRITING'); // Reuse writing status for generic AI task
      try {
          const newAssets = await extractAssetsFromText(rawText, settings);
          if(!project) return;
          
          // Merge
          const existingNames = new Set(project.assets.map(a => a.name));
          const toAdd = newAssets.filter(a => !existingNames.has(a.name));
          
          if (toAdd.length > 0) {
              await saveCurrentProject({ ...project, assets: [...project.assets, ...toAdd] });
              addLog(`成功提取 ${toAdd.length} 个新资产`, 'success');
          } else {
              addLog("未发现新资产", 'info');
          }
      } catch (e: any) {
          addLog(e.message, 'error');
      } finally {
          setStatus('IDLE');
      }
  };

  // Storyboard Handlers
  const handleGeneratePanelImage = async (panelId: number, prompt: string, episodeNum: number, volId: string) => {
      const panelKey = `panel-${panelId}`;
      setGeneratingItemIds(prev => new Set(prev).add(panelKey));
      setStatus('GENERATING_IMAGE');

      try {
         const url = await generateImage(prompt, settings, "16:9");
         const response = await fetch(url);
         const blob = await response.blob();
         await handleSavePanelImage(panelId, blob, episodeNum, volId);
         addLog("分镜图生成成功", 'success');
      } catch (e: any) {
         addLog(e.message, 'error');
      } finally {
         setGeneratingItemIds(prev => { const n = new Set(prev); n.delete(panelKey); return n; });
         setStatus('IDLE');
      }
  };

  const handleSavePanelImage = async (panelId: number, imageBlob: Blob, episodeNum: number, volId: string) => {
      if (!project) return;
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
      if (!project) return;
      
      const vol = project.volumes.find(v => v.id === volId);
      if (!vol) return;
      const script = vol.scriptCache[episodeNum];
      if (!script) return;
      
      const newPanels = script.panels.map(p => 
          p.panel_id === panelId ? { ...p, relatedAssetIds: assetIds, relatedItemIds: itemIds } : p
      );
      
      const updatedVolumes = project.volumes.map(v => 
          v.id === volId 
          ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...script, panels: newPanels } } }
          : v
      );
      saveCurrentProject({ ...project, volumes: updatedVolumes });
  };
  
  const handleBatchUpdatePanels = (volId: string, episodeNum: number, newPanels: ScriptPanel[]) => {
      if (!project) return;
      const updatedVolumes = project.volumes.map(v => 
          v.id === volId 
          ? { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...v.scriptCache[episodeNum], panels: newPanels } } }
          : v
      );
      saveCurrentProject({ ...project, volumes: updatedVolumes });
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
     try {
         const newBible = await generateStoryBible(activeVolume.plotBreakdown, settings, project.storyBible || undefined);
         await updateStoryBible(project.id, newBible);
         setProject({...project, storyBible: newBible});
         addLog('剧情记忆库已更新', 'success');
     } catch (e: any) {
         addLog(`记忆更新失败: ${e.message}`, 'error');
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
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#121212] relative">
          
          {/* Views */}
          {currentView === 'DASHBOARD' && (
             <Dashboard 
               currentProject={project} 
               onOpenFolder={async () => {
                   try {
                       const { handle } = await openDirectory();
                       const proj = await loadProjectFromDir(handle);
                       if (proj) {
                           await saveCurrentProject(proj);
                           handleSelectProject(proj.id);
                       } else {
                           alert("所选文件夹为空或不是有效的项目文件夹。");
                       }
                   } catch (e: any) {
                       if (e.message !== "用户取消了操作") {
                           alert(e.message);
                       }
                   }
               }}
               onInitializeProject={async (name) => {
                   try {
                       const { handle } = await openDirectory();
                       const existing = await loadProjectFromDir(handle);
                       if (existing) {
                           if (!window.confirm("该文件夹已包含项目数据。是否覆盖？")) return;
                       }
                       const newProj = await initializeNewProject(handle, name);
                       await saveCurrentProject(newProj);
                       handleSelectProject(newProj.id);
                   } catch (e: any) {
                        if (e.message !== "用户取消了操作") {
                           alert(e.message);
                       }
                   }
               }}
             />
          )}
          
          {currentView === 'DASHBOARD' && project === null && projectsList.length > 0 && (
             <div className="absolute inset-0 bg-[#121212] z-50 overflow-auto">
                <ProjectManager
                   projects={projectsList}
                   onSelectProject={handleSelectProject}
                   onCreateProject={handleCreateProject}
                   onDeleteProject={handleDeleteProject}
                   onUpdateProject={handleUpdateProject}
                   onOpenSettings={() => setCurrentView('SETTINGS')}
                   onImportProject={handleImportProject}
                   onExportProject={handleExportProject}
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
                       isGenerating={status === 'SPLITTING'}
                       onBatchGenerate={() => {}} // TODO: Batch gen
                       onBatchExport={() => {}} 
                       onBackToProjects={() => { setProject(null); setCurrentView('DASHBOARD'); }}
                       
                       onUpdateEpisode={handleUpdateEpisode}
                       onRunBreakdownQA={handleRunBreakdownQA}
                       
                       // Stubbed style props
                       activeStyle={null}
                       customStyles={[]}
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
                      onExportScript={() => handleExportProject(project)}
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
                isGenerating={status === 'GENERATING_IMAGE'}
                generatingItemIds={generatingItemIds}
             />
          )}

          {currentView === 'STORYBOARD' && project && (
             <StoryboardBoard 
                project={project}
                settings={settings}
                onGeneratePanelImage={handleGeneratePanelImage}
                onUpdatePanelAssets={handleUpdatePanelAssets}
                onGenerateAssetImage={handleGenerateAssetImage}
                onSavePanelImage={handleSavePanelImage}
                onUpdatePanels={handleBatchUpdatePanels}
                onSelectHistoryImage={handleSelectPanelHistoryImage}
                onSelectAssetHistoryImage={(assetId, url) => {
                     const newAssets = project.assets.map(a => a.id === assetId ? { ...a, imagePath: url } : a);
                     saveCurrentProject({ ...project, assets: newAssets });
                }}
                status={status}
                generatingItemIds={generatingItemIds}
             />
          )}
          
          {currentView === 'SETTINGS' && (
              <div className="flex items-center justify-center h-full bg-black/50">
                  <SettingsModal 
                    isOpen={true} 
                    onClose={() => setCurrentView('DASHBOARD')} 
                    settings={settings} 
                    onSave={(s) => { setSettings(s); saveSettings(s); }}
                  />
              </div>
          )}

          {/* Overlays / Modals */}
          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            settings={settings} 
            onSave={(s) => { setSettings(s); saveSettings(s); }}
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

          {/* Toast / Logs */}
          <div className="absolute bottom-10 right-10 flex flex-col gap-2 pointer-events-none z-[100]">
             {logs.slice(-3).map(log => (
                 <div key={log.id} className={`p-3 rounded-lg text-xs font-bold shadow-xl animate-in fade-in slide-in-from-right-10 ${
                     log.type === 'error' ? 'bg-red-600 text-white' : 
                     log.type === 'success' ? 'bg-green-600 text-white' : 
                     log.type === 'warning' ? 'bg-yellow-600 text-white' : 'bg-[#333] text-gray-200'
                 }`}>
                    {log.text}
                 </div>
             ))}
          </div>

        </div>
      </div>
      
      {/* Global Status Bar */}
      <StatusBar status={status} generatingItemIds={generatingItemIds} />

    </div>
  );
};