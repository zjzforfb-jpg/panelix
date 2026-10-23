# Memory Bank - Auto-Manju V3.0

本文件用于记录项目开发过程中的关键决策、Anti-patterns、最佳实践和架构演进。

---

## 📅 2026-01-09 - 第二人称讲解模式 (Two-Agent Chain) 升级

### 背景

用户需求：在剧本生成时支持"第二人称视角"讲解模式，输出沉浸式口播稿（"你"视角）同时保持分镜的可画面化和资产一致性。

### ✅ 完成的功能

#### 1. 类型扩展 (`types.ts`)

**新增类型**：
- `ExplainBeat` - 讲解 beat 单元，含 narrationZh（第二人称）、turningPoint（反转点）
- `ExplainPackage` - Agent A 输出，含四件套（novelType/goldenHook/explosiveOpening/plotTwist）+ beats + script
- `NarrationBeatRef` - ScriptPanel 中的 beat 引用

**扩展 `PlotEpisode`**：
- 可选字段：`novelType`, `goldenHook`, `explosiveOpening`, `plotTwist`, `explainPackage`

**扩展 `ScriptPanel`**：
- `narrationZh?: string` - 第二人称讲解轨（口播/字幕）
- `narrationHook?: string` - 本 panel 的钩子句
- `narrationBeats?: NarrationBeatRef[]` - beat 引用（调试用）

**扩展 `AppSettings`**：
- `enableSecondPersonExplain?: boolean` - 启用第二人称讲解模式
- `explainModel?: string` - Agent A 使用的模型（可选，默认用 writerModel）
- `explainBeatsCount?: number` - 推荐 beats 数量（默认 8）
- `explainPanelCount?: number` - 推荐分镜数量（默认 8）

#### 2. Agent A - 讲解 Agent (`runExplainAgent`)

**文件**: `services/geminiService.ts`

**输入**: PlotEpisode + 原文片段 + settings

**输出**: ExplainPackage
```typescript
{
  novelType: "规则怪谈",
  goldenHook: "千万记住，如果你在地铁里看到...",
  explosiveOpening: "你睁开眼，发现自己置身于...",
  plotTwist: "原来那个规则...其实是...",
  writingTechnique: "信息差叙事 + 规则陷阱",
  heatEstimate: "9.5/10",
  beats: [ { beatId, narrationZh, turningPoint, ... } ],
  script: ["第1句黄金钩子", ...],
  sourceSummary: "原文摘要（供 Agent B）"
}
```

**提示词核心约束**：
- 全程第二人称"你"
- 快节奏爽感叙事：危机 → 选择 → 代价 → 升级
- 每 2-3 句含信息差/反转
- 开头黄金钩子，结尾更强钩子

#### 3. Agent B - 分镜 Agent V2 (`runWriterAgentV2`)

**文件**: `services/geminiService.ts`

**输入**: PlotEpisode + ExplainPackage + existingAssets + settings

**输出**: `{ script: WebtoonScript, newAssets: Asset[] }`

**双轨输出规则**：
| 轨道 | 主语 | 用途 |
|------|------|------|
| `narrationZh` | 第二人称"你" | 口播/字幕 |
| `visualZh`, `shots[*].visual` | 角色真名 | 图像/视频生成 |

**一致性硬约束**（嵌入提示词）：
- 角色一致性：外观锁定短语，3 shots 保持不变
- 场景一致性：固定 scene_name，优先填 sceneAssetId
- 道具一致性：props 列 1-3 个，shots 的 propAssetIds 一致
- 禁止"你"作为视觉轨主语

#### 4. Pipeline 集成 (`App.tsx`)

**位置**: `handleGenerateScript`

**逻辑**：
```typescript
if (settings.enableSecondPersonExplain) {
  // Two-Agent Chain
  const explainPackage = await runExplainAgent(episode, sourceText, settings);
  const { script, newAssets } = await runWriterAgentV2(episode, explainPackage, settings, assets, panelCount);
} else {
  // Original single-agent
  const { script, newAssets } = await runWriterAgent(episode, settings, ...);
}
```

**ExplainPackage 存储**：生成后写入 episode，持久化到 plotBreakdown

#### 5. UI 设置 (`SettingsModal.tsx`)

**新增区域**："第二人称讲解模式"
- 启用开关：`enableSecondPersonExplain`
- 讲解 Agent 模型选择
- Beats 数量滑块（6-10）
- 分镜数量滑块（6-12）

#### 6. UI 显示

**ScriptCanvas**：
- 在 script_content 下方显示 narrationZh（橙色高亮卡片）
- 支持一键复制口播稿
- 显示 narrationHook（钩子句）

**StoryboardBoard** (PanelInspectorContent)：
- Header 区域显示 narrationZh 摘要
- 支持复制功能
- 折叠显示，不影响绘图操作

### 📁 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | 新增 ExplainPackage/ExplainBeat/NarrationBeatRef；扩展 PlotEpisode/ScriptPanel/AppSettings |
| `services/geminiService.ts` | 新增 `runExplainAgent`（Agent A）、`runWriterAgentV2`（Agent B） |
| `App.tsx` | `handleGenerateScript` 支持双 Agent 链；导入新函数 |
| `components/SettingsModal.tsx` | 新增"第二人称讲解模式"配置区域 |
| `components/ScriptCanvas.tsx` | 显示 narrationZh + 复制功能 |
| `components/StoryboardBoard.tsx` | Inspector Header 显示 narrationZh 摘要 |

### 设计原则

| 原则 | 说明 |
|------|------|
| **双轨隔离** | narration轨用于口播，visual轨用于绘图/视频，互不污染 |
| **视觉轨禁用"你"** | 视觉描述使用角色真名，确保资产绑定和一致性锚点生效 |
| **向后兼容** | 所有新字段均为 optional，旧项目无需迁移 |
| **Feature Flag** | 通过 `enableSecondPersonExplain` 控制，默认关闭 |
| **原子化更新** | Pipeline 使用 setProject 函数式更新，避免竞态覆盖 |

### ❌ Anti-pattern: narrationZh 污染视觉轨

```typescript
// BAD - 视觉轨使用"你"作为主语
panel.visualZh = "你站在山巅，远眺云海";
// 问题：资产绑定失效，角色外观无法锚定

// BAD - shots.visual 使用第二人称
shot.visual = "你转身面向镜头";
// 问题：图像生成模型无法识别具体角色
```

### ✅ Fix: 双轨分离，视觉轨用角色真名

```typescript
// GOOD - 双轨分离
panel.narrationZh = "你站在山巅，远眺云海..."; // 口播轨：第二人称
panel.visualZh = "陆寒玄（战神，银色战甲）立于山巅，远眺云海"; // 视觉轨：角色真名

// GOOD - shots 使用角色真名
shot.visual = "陆寒玄转身面向镜头，表情坚定";
shot.characterAssetIds = ["char_123"]; // 资产绑定生效
```

### 数据流架构

```
NovelText
    ↓
SplitterAgent → PlotEpisodeList
    ↓
[enableSecondPersonExplain?]
    ├── true:  ExplainAgent (A) → ExplainPackage
    │                                    ↓
    │          StoryboardAgent (B) ←─────┘
    │                 ↓
    │          WebtoonScript (with narrationZh + visualZh + shots)
    │
    └── false: WriterAgent (original) → WebtoonScript
                       ↓
                ScriptPanels
                       ↓
         ┌────────────┴────────────┐
         ↓                         ↓
   narrationZh轨            visualZh/shots轨
  (口播/字幕/推文)        (Triptych/VideoPrompt)
```

### 验收检查点

- [ ] 讲解稿为第二人称，节奏快、有钩子
- [ ] visualZh/shots.visual 使用角色真名，无"你"
- [ ] 资产绑定（characterAssetIds/sceneAssetId）有效
- [ ] Triptych 生成角色外观一致
- [ ] VideoPromptBuilder 不读取 narrationZh

- 📅 **Date:** 2026-01-09
- 📝 **Version:** v2.7 (第二人称讲解模式升级)

---

## 📅 2026-01-09 - 第二人称讲解字数不足修复

### 问题

用户反馈第二人称讲解（narrationZh）字数太少，导致剧情不连贯。

### 根本原因

1. `EXPLAIN_PROMPT` 中没有明确字数下限要求
2. "节奏快、句子短"的约束导致 AI 过度精简
3. `beatToNarration` 函数直接返回 beat，没有补充机制

### ✅ 修复方案

#### 1. 增强 EXPLAIN_PROMPT 字数约束

| 字段 | 原要求 | 新要求 |
|------|--------|--------|
| `goldenHook` | 无 | 20-50字 |
| `explosiveOpening` | 无 | 50-100字 |
| `plotTwist` | 无 | 30-80字 |
| `narrationZh` | 无 | **60-150字**（硬性要求） |
| `script` 每句 | 无 | 40-80字 |
| `script` 总字数 | 无 | **不少于800字** |

#### 2. 新增"内容丰富度要求"

```
# 内容丰富度要求（极其重要！）
- 每个 beat 的 narrationZh 必须 60-150 字，禁止只写一两句话
- 每个 beat 必须包含以下元素中的至少 2 个：
  1. 场景/环境描写
  2. 角色动作/反应
  3. 心理活动/感官描写
  4. 对话/互动
```

#### 3. 调整风格约束

```diff
- 节奏快、句子短、有画面感
+ 节奏紧凑、句子有力、画面感强（注意：不是句子短，而是信息密度高）
```

#### 4. 增加输出长度校验

```typescript
// Quality warnings
if (avgBeatLength < 40) {
  console.warn('[ExplainAgent] ⚠️ WARNING: Average beat narration is too short');
}
if (totalScriptLength < 500) {
  console.warn('[ExplainAgent] ⚠️ WARNING: Total script length is too short');
}
```

#### 5. 优化 beatToNarration 补充机制

```typescript
// 如果 beat narration < 40字，自动补充 script 句子
if (narration.length < 40) {
  const supplementScripts = explainPackage.script.slice(startIdx, endIdx).join(' ');
  narration = `${narration} ${supplementScripts}`.trim();
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/geminiService.ts` | EXPLAIN_PROMPT 增加字数约束；增加输出长度校验；优化 beatToNarration 补充机制 |

### ❌ Anti-pattern: 提示词只约束格式不约束长度

```
// BAD - 只告诉 AI 输出什么，不告诉多长
- narrationZh：第二人称讲解文本
// 结果：AI 可能只输出一两句话
```

### ✅ Fix: 明确字数范围

```
// GOOD - 明确字数下限
- narrationZh：第二人称讲解文本（60-150字，必须详细展开）
// 结果：AI 被迫输出足够内容
```

- 📅 **Date:** 2026-01-09
- 📝 **Version:** v2.7.1 (讲解字数修复)

---

## 📅 2026-01-08 - 火山 Seedance 多镜头提示词优化 & 视频时长修复

### 背景

用户反馈火山 Seedance 生成的视频只有 5 秒（而非预期的 10 秒），且多镜头脚本只表现出 2-3 个镜头切换。原因是：
1. 火山调用的 duration 参数未使用自动导演设置的时长
2. 提示词格式不符合 Seedance 的"镜头切换"语法，导致模型无法正确识别多镜头

### ✅ 完成的功能

#### 1. Seedance 专用提示词导出函数

根据火山官方文档的多镜头技巧，新增 `exportTimelineToSeedancePrompt` 函数，生成符合 Seedance 的提示词格式：

**格式特点**：
- 使用中文自然语言
- 用 **"镜头切换"** 作为切镜标记
- 运镜用"镜头推进/镜头右移/镜头环绕"等中文
- 末尾追加 `--dur/--rs/--cf` 参数

**示例输出**：
```text
【参考图说明】图中包含三格分镜线稿（展示动作流程）；图中包含角色/场景/道具参考卡片（展示外观细节）。
请参考图中的角色外观、服装、场景风格，保持视频中人物和环境的一致性。

【整体风格】
画面风格：webtoon style
人物外观、服装、场景、光影在所有镜头中保持一致。

（第1镜头 远景）
角色站立于山巅，远眺云海，镜头缓慢推进。
镜头切换，（第2镜头 中景）
角色转身面向镜头，表情坚定，镜头轻微右移。
镜头切换，（第3镜头 特写）
角色眼神特写，瞳孔中倒映光芒，镜头固定。

--rs 720p --dur 10 --cf false
```

#### 2. 火山视频时长修复

**问题**：`handleGenerate` 中火山调用使用 `settings.volcVideoDuration || 5`，忽略了自动导演的时长设置。

**修复**：
```typescript
// BEFORE
duration: settings.volcVideoDuration || 5,

// AFTER - 优先使用自动导演时长
const volcDuration = settings.autoVideoPanelDurationSec ?? settings.volcVideoDuration ?? 10;
duration: volcDuration,
```

#### 3. 参考图角色优化

**问题**：综合参考图（分镜+资产）作为 `first_frame` 传入，模型可能误解为"第一帧画面"。

**修复**：当检测到是综合参考图时，使用 `reference_image` 角色：
```typescript
// 判断是否为综合参考图
const isCompositeRef = refImageUrl && (
  panel.videoRefPath?.includes('videoref_') ||
  panel.videoRefPath?.includes('microMontage') ||
  refLayoutMode === 'microMontage'
);
const imageRole = isCompositeRef ? 'reference_image' : 'first_frame';
```

同时在提示词中添加参考图布局说明，帮助模型理解：
```text
【参考图说明】图中包含三格分镜线稿；图中包含角色/场景/道具参考卡片。
请参考图中的角色外观、服装、场景风格，保持视频中人物和环境的一致性。
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/videoTimelineBuilder.ts` | 1. 新增 `exportTimelineToSeedancePrompt` 函数<br>2. 新增 `buildSeedanceRefImageDescription` 函数<br>3. 更新 `detectModelProviderFromName` 支持 seedance<br>4. 更新 `exportAllTimelinePrompts` 包含 seedance 格式 |
| `components/VideoGeneratorPanel.tsx` | 1. 导入新的 Seedance 相关函数<br>2. `handleAutoGenerateCinematic` 支持生成 Seedance 专用提示词<br>3. `handleGenerate` 火山调用使用自动导演时长<br>4. 参考图角色智能判断（综合参考图用 reference_image）<br>5. `generateTimeline` 和 `switchTimelinePromptType` 支持 seedance 格式 |

### ❌ Anti-pattern: 火山提示词使用英文列表格式

```typescript
// BAD - 英文格式，Seedance 识别效果差
Shot 1 (2.5s): Wide shot establishing scene. Camera dolly in.
Shot 2 (2.0s): Medium shot character action. Camera pan right.
Shot 3 (1.5s): Close up emotion. Camera locked.
```

### ✅ Fix: 使用火山官方推荐的中文"镜头切换"格式

```typescript
// GOOD - 中文格式，用"镜头切换"连接
（第1镜头 远景）
场景建立镜头，镜头缓慢推进。
镜头切换，（第2镜头 中景）
角色动作展开，镜头右移跟随。
镜头切换，（第3镜头 特写）
情绪落点，镜头固定。
--rs 720p --dur 10 --cf false
```

### 火山 Seedance 多镜头最佳实践

| 原则 | 说明 |
|------|------|
| **使用"镜头切换"** | 每个镜头之间用"镜头切换"连接，这是 Seedance 识别切镜的关键词 |
| **中文自然语言** | 动作和运镜都用中文描述，如"镜头推进"、"镜头环绕" |
| **景别标注** | 每个镜头标注景别：远景/全景/中景/近景/特写 |
| **参数追加** | 末尾追加 `--rs 720p --dur 10 --cf false` |
| **综合参考图说明** | 如果参考图是分镜+资产综合图，在提示词开头说明布局 |
| **只用 first_frame** | ⚠️ Seedance 1.0 不支持 `reference_image`（r2v），必须用 `first_frame` |

#### ⚠️ 重要：Seedance 模型不支持 reference_image

**问题**：火山 Seedance 1.0 系列模型（`doubao-seedance-1-0-*`）只支持 t2v/i2v 任务（使用 `first_frame`/`last_frame`），**不支持 r2v 任务**（`reference_image`）。

**错误示例**：
```typescript
// ❌ BAD - 会触发 "task_type r2v does not support model" 错误
imageRoles: ['reference_image']
// Error: The parameter `task_type` specified in the request is not valid: 
//        the specified task_type r2v does not support model doubao-seedance-1-0-pro
```

**正确做法**：
```typescript
// ✅ GOOD - 使用 first_frame，配合提示词说明参考图用途
imageRoles: ['first_frame']
// 提示词中说明：【参考图说明】图中包含三格分镜线稿...
```

**原理**：火山后端根据 `imageRoles` 分流任务类型：
- `first_frame`/`last_frame` → i2v（图生视频）✅
- `reference_image` → r2v（参考图生视频）❌ Seedance 1.0 不支持

**解决方案**：即使是综合参考图（分镜+资产），也使用 `first_frame` 角色，通过提示词开头的【参考图说明】让模型理解参考图布局。

- 📅 **Date:** 2026-01-08
- 📝 **Version:** v2.6 (Seedance 多镜头提示词优化 + reference_image 修复)

---

## 📅 2026-01-08 - 火山方舟模型集成 & 模型选择逻辑优化 & CORS 问题修复

### 背景

集成火山方舟（VolcEngine Ark）API，支持图片生成和视频生成。修复模型选择不生效和 CORS 错误问题。

### ✅ 完成的功能

#### 1. 火山方舟 API 集成

**图片生成 API**：
- 支持文生图（txt2img）和图生图（img2img）
- 模型列表：`doubao-seedream-4-5-251128`、`doubao-seedream-4-0-250828`、`doubao-seedream-3-0-t2i-250415`、`doubao-seededit-3-0-i2i-250628`
- Base URL：`https://ark.cn-beijing.volces.com`
- API 端点：`POST /api/v3/images/generations`

**视频生成 API**：
- 支持文生视频、图生视频（首帧/首尾帧/参考图）
- 模型列表：`doubao-seedance-1-5-pro-251215`、`doubao-seedance-1-0-pro-250528` 等
- API 端点：`POST /api/v3/contents/generations/tasks`、`GET /api/v3/contents/generations/tasks/{id}`

#### 2. 模型 ID 格式修正

**问题**：初始实现使用了错误的模型 ID 格式（如 `doubao-seedream-4.5`），导致 API 返回 404 错误。

**修复**：根据官方文档更新为正确的模型 ID 格式（带版本号）：
- `doubao-seedream-4-5-251128`（原 `doubao-seedream-4.5`）
- `doubao-seedance-1-5-pro-251215`（原 `doubao-seedance-1-5-pro`）

#### 3. 模型选择逻辑优化

**问题现象**：
- 用户在设置中选择 nano banana 作为 `txt2imgModel`
- 但在生成有参考图的图片时，系统仍使用 `imageModel`（可能是火山模型）
- 导致用户选择的模型不生效

**根本原因**：
```typescript
// BAD - 有参考图时强制使用 imageModel
const selectedModel = hasReferenceImages 
  ? settings.imageModel  // ← 忽略了用户的 txt2imgModel 选择
  : (settings.txt2imgModel || settings.imageModel);
```

**修复方案**：
```typescript
// GOOD - 如果用户选择了 nano-banana，优先使用它（支持 img2img）
let selectedModel = hasReferenceImages 
  ? settings.imageModel 
  : (settings.txt2imgModel || settings.imageModel);

// 如果用户选择了 nano-banana 作为 txt2imgModel，即使有参考图也优先使用
if (hasReferenceImages && settings.txt2imgModel && isNanoBananaModel(settings.txt2imgModel)) {
  selectedModel = settings.txt2imgModel;  // ← 尊重用户选择
}
```

#### 4. CORS 问题修复

**问题现象**：
- 火山 API 返回的图片 URL 是 TOS 存储的临时 URL（如 `https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/...`）
- 浏览器直接 `fetch` 该 URL 时被 CORS 策略阻止
- 错误信息：`Access to fetch at '...' from origin 'http://localhost:3000' has been blocked by CORS policy`

**根本原因**：
```typescript
// BAD - 使用 URL 格式，返回 TOS 临时链接
responseFormat: 'url'  // ← 返回的 URL 有 CORS 限制
```

**修复方案**：
```typescript
// GOOD - 使用 base64 格式，避免 CORS 问题
responseFormat: 'b64_json'  // ← 直接返回 base64 数据，无 CORS 限制

// 在 volcArkService.ts 中处理 base64 数据
if (data.data[0].b64_json) {
  const base64Data = data.data[0].b64_json;
  const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(r => r.blob());
  return URL.createObjectURL(blob);  // 转换为 blob URL
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | 扩展 `VeoModel` 类型，添加火山视频模型 ID；`AppSettings` 添加 `volcArkApiKey`、`volcImageDefaultSize`、`volcImageWatermark`、`volcVideoResolution`、`volcVideoDuration`、`volcVideoGenerateAudio` 字段 |
| `services/volcArkService.ts` | **新建**：火山方舟 API 服务，实现图片生成、视频任务创建/查询/删除 |
| `services/geminiService.ts` | 1. 添加模型选择逻辑优化（优先使用用户选择的 nano-banana）<br>2. 集成火山图片生成 API 调用 |
| `components/SettingsModal.tsx` | 1. 添加火山 API Key 配置输入框<br>2. 更新模型预设列表（使用正确的模型 ID 格式）<br>3. 添加火山视频生成配置选项 |
| `components/VideoGeneratorPanel.tsx` | 集成火山视频生成 API（创建任务 + 轮询查询） |
| `services/configService.ts` | 支持从 `config.json` 加载 `volcArkApiKey` |
| `config.json` | 添加 `volcArkApiKey` 配置项 |

### ❌ Anti-pattern: 忽略用户模型选择

```typescript
// BAD - 有参考图时强制使用 imageModel，忽略用户的 txt2imgModel 选择
const selectedModel = hasReferenceImages 
  ? settings.imageModel  // 用户可能只设置了 txt2imgModel
  : settings.txt2imgModel;
// 问题：用户选择了 nano-banana 作为 txt2imgModel，但有参考图时仍使用 imageModel（可能是火山模型）
```

### ✅ Fix: 优先使用用户选择的模型

```typescript
// GOOD - 如果用户选择了支持 img2img 的模型（如 nano-banana），优先使用它
if (hasReferenceImages && settings.txt2imgModel && isNanoBananaModel(settings.txt2imgModel)) {
  selectedModel = settings.txt2imgModel;  // 尊重用户选择
}
```

### ❌ Anti-pattern: 使用有 CORS 限制的 URL 格式

```typescript
// BAD - 返回 TOS 临时 URL，浏览器无法直接访问
responseFormat: 'url'
// 问题：返回的 URL 有 CORS 限制，fetch 失败
```

### ✅ Fix: 使用 base64 格式避免 CORS

```typescript
// GOOD - 使用 base64 格式，直接返回图片数据
responseFormat: 'b64_json'
// 优点：无 CORS 限制，可直接转换为 blob URL
```

#### 5. 视频拼接：TOS MP4 CORS + 后端临时文件清理时序 Bug 修复

**问题现象**：
- 火山视频生成返回的 `video_url` 是 TOS 临时链接（如 `https://ark-content-generation-...tos-cn-beijing...mp4?...`）
- 浏览器在拼接前尝试 `fetch(video_url)` 下载视频片段 → **CORS 被阻止**，导致拼接失败
- 即使改为后端下载拼接，后端若提前删除临时目录，会触发 `FileResponse` 找不到文件：
  - `RuntimeError: File at path ... does not exist.`

**根本原因 1（CORS）**：
```typescript
// BAD - 浏览器直接 fetch TOS MP4，会被 CORS 拦截
const blob = await fetch(tosMp4Url).then(r => r.blob());
```

**修复方案 1（后端下载 + 拼接，绕过浏览器 CORS）**：
- 前端不再下载 mp4，只把 `video_urls[]` 发给本地 Python sidecar
- 后端通过 `httpx` 下载每个 URL → `ffmpeg` 拼接 → 返回拼接后视频

**根本原因 2（后端临时文件提前清理）**：
```python
# BAD - 在 finally 中删除 temp_dir，FileResponse 发送时会找不到文件
try:
    # ... generate output_path ...
    return FileResponse(output_path)
finally:
    shutil.rmtree(temp_dir)  # 💥 too early
```

**修复方案 2（BackgroundTask 延迟清理）**：
```python
# GOOD - 让 FileResponse 发送完成后再清理临时目录
def _cleanup() -> None:
    shutil.rmtree(temp_dir, ignore_errors=True)

return FileResponse(output_path, background=BackgroundTask(_cleanup))
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **尊重用户选择** | 如果用户明确选择了某个模型，应优先使用它（如果该模型支持所需功能） |
| **避免 CORS 问题** | 对于可能返回临时 URL 的 API，优先使用 base64 格式 |
| **视频拼接避免浏览器直连 TOS** | TOS 视频链接常无 CORS 头；拼接应由本地后端下载并处理 |
| **FileResponse 清理时序** | 返回临时文件时，不要在响应发送前删除临时目录，使用 BackgroundTask 延迟清理 |
| **模型 ID 格式** | 严格按照官方文档使用正确的模型 ID 格式（包含版本号） |
| **配置管理** | API Key 等敏感配置支持从 `config.json` 加载，也支持在设置界面手动配置 |

- 📅 **Date:** 2026-01-08
- 📝 **Version:** v2.5 (火山方舟集成 + 模型选择优化 + CORS 修复)

---

## 📅 2026-01-07 - 16:9 视频生成比例配置规范 & 生成前校验清单

### 背景

为保证 16:9 视频生成时角色一致性、背景稳定、构图不变形，制定统一的资产/分镜/参考图比例规范。同时兼容 **Sora2** 和 **Veo** 视频模型。

### ✅ 推荐比例规则（作为执行标准）

| 资产/内容类型 | 推荐比例 | 说明 |
|-------------|---------|------|
| **角色资产（character）** | `1:1` | 正方形，用于身份锚点，避免裁切脸部/服装 |
| **场景资产（scene）** | `16:9` | 与视频输出一致，避免拉伸/黑边/构图漂移 |
| **道具资产（item）** | `1:1` | 正方形，单品特写便于参考图布局 |
| **分镜图 / shots / triptych** | `16:9` | 与视频输出一致，是视频的核心帧 |
| **构建参考图（Video Reference）** | `16:9` | 由系统合成（1920×1080），作为视频参考帧 |

### 🔧 代码实现

#### 1. 默认视频比例

```typescript
// App.tsx - DEFAULT_SETTINGS
veoAspectRatio: '16:9',  // Default: horizontal video (better for scene/character stability)
```

#### 2. 资产类型 → 默认比例映射

```typescript
// App.tsx - getDefaultAspectRatio
const getDefaultAspectRatio = (assetType: string): string => {
  switch (assetType) {
    case 'character': return '1:1';   // Square for character identity reference
    case 'scene': return '16:9';      // Match video output ratio
    case 'item': return '1:1';        // Square for prop reference
    default: return '1:1';
  }
};
```

#### 3. 分镜图生成

```typescript
// StoryboardBoard.tsx - TriptychGenerator
// Micro-Montage slots 固定使用 16:9
url = await generateImage(fullPrompt, settings, '16:9', undefined, referenceImages);
```

### ✅ 生成前 10 秒校验清单

每次生成 16:9 视频前，快速检查以下项目：

| # | 检查项 | 通过标准 |
|---|-------|---------|
| 1 | **角色资产** | 比例为 `1:1`，角色脸/服装标志物完整清晰 |
| 2 | **场景资产** | 比例为 `16:9`，空镜/无人物（场景资产原则） |
| 3 | **道具资产** | 比例为 `1:1`，画面无手/无人物（道具资产原则） |
| 4 | **分镜图** | 比例为 `16:9`（三联画三张图均为横版） |
| 5 | **参考图预览** | 显示合成后的 `videoref_*`，不是 shot1 fallback |
| 6 | **设置 → 视频比例** | 确认为 `16:9`（设置 → 视频生成 → Veo/Sora） |

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | 1. `DEFAULT_SETTINGS.veoAspectRatio` 从 `'9:16'` 改为 `'16:9'`<br>2. 新增 `getDefaultAspectRatio()` 函数，资产提取时按类型设置默认比例 |
| `components/AssetLibrary.tsx` | `handleCreateNew` 根据资产类型设置默认比例（scene → 16:9，其他 → 1:1） |
| `components/StoryboardBoard.tsx` | 线稿三联画默认比例从 `'9:16'` 改为 `'16:9'` |

### 验收标准

- ✅ 生成的视频为 **16:9**
- ✅ 角色外观在视频中稳定（发型/服装/脸不漂）
- ✅ 背景构图不拉伸、不黑边，且与分镜图构图一致
- ✅ 参考图在刷新/切换分镜/切换页面后仍能正确显示

- 📅 **Date:** 2026-01-07
- 📝 **Version:** v2.4 (16:9 视频比例配置)

---

## 📅 2026-01-07 - 参考图刷新/切换时显示错误问题（React 异步状态同步 + 多次 onUpdatePanel 调用）

### 问题现象

1. 点击「构建参考图」后，参考图成功生成并保存到 `assets/videoref_X_TIMESTAMP.png`
2. 刷新页面后，参考图位置显示的是 `shot1` 而非构建的参考图
3. 切换分镜后，参考图不更新
4. 从剧本页切换回分镜页后，参考图重新变成 `shot1`

### 根本原因（多重问题叠加）

#### 问题 1：React 异步状态更新导致 `syncEffect` 不触发

```typescript
// BAD - displayPanels 通过 useMemo 派生，React 状态更新是异步的
const displayPanels = useMemo(() => { /* ... */ }, [project.volumes, ...]);

useEffect(() => {
  const latestPanel = displayPanels.find(item => item.panel.panel_id === panel.panel_id);
  // ❌ displayPanels 可能还是旧数据（useMemo 缓存尚未更新）
}, [displayPanels]);
```

**时序问题**：
```
t0: VideoGeneratorPanel 调用 onUpdatePanel({ videoRefPath: "assets/videoref_1_xxx.png" })
t1: onUpdatePanel → handleBatchUpdatePanels → setProject(updated)
t2: React 安排状态更新（异步）
t3: StoryboardBoard 的 syncEffect 运行，但 displayPanels 仍是旧值（useMemo 缓存）
t4: syncEffect 检查：oldVideoRefPath === newVideoRefPath → needsSync = false
t5: inspector.data 不更新，VideoGeneratorPanel 收到的 panel prop 仍是旧快照
```

#### 问题 2：多次 `onUpdatePanel` 调用导致数据覆盖

```typescript
// BAD - VideoGeneratorPanel 中多个函数都调用 onUpdatePanel
const generatePromptWithLayout = async () => {
  const prompt = buildPrompt();
  onUpdatePanel(panel.panel_id, { currentVideoPrompt: prompt }); // 第 1 次
};

const handleBuildReferenceImage = async () => {
  const localPath = await saveImageToAssets(blob, filename);
  const prompt = await generatePromptWithLayout(); // 触发第 2 次 onUpdatePanel
  onUpdatePanel(panel.panel_id, { 
    videoRefPath: localPath,
    imagePath: localPath,
    currentVideoPrompt: prompt
  }); // 第 3 次
};
```

**竞态条件**：
```
t0: handleBuildReferenceImage 调用 generatePromptWithLayout
t1: generatePromptWithLayout 调用 onUpdatePanel({ currentVideoPrompt: "..." })
t2: handleBatchUpdatePanels 读取 project.volumes (v1, 无 videoRefPath)
t3: generatePromptWithLayout 返回 prompt
t4: handleBuildReferenceImage 调用 onUpdatePanel({ videoRefPath, imagePath, ... })
t5: handleBatchUpdatePanels 再次调用，读取 project.volumes (可能还是 v1)
t6: 第二次调用覆盖了第一次调用的更新（videoRefPath 被清空）
```

#### 问题 3：`loadRefImage` 使用 stale props

```typescript
// BAD - loadRefImage 依赖 panel.videoRefPath/imagePath，但 panel prop 可能是旧的
useEffect(() => {
  const loadRefImage = async () => {
    const imageSources = [
      panel.videoRefPath,  // ← 可能是空的（stale prop）
      panel.imagePath,
      // ...
    ];
  };
  loadRefImage();
}, [panel.videoRefPath, panel.imagePath]); // ← 触发条件是 prop 变化，但 prop 可能没更新
```

### ✅ 修复方案（三管齐下）

#### 修复 1：`syncEffect` 直接从 `project.volumes` 读取最新数据

```typescript
// GOOD - 绕过 useMemo 缓存，直接从 project 读取
useEffect(() => {
  // 从 project.volumes 直接查找最新的 panel 数据
  const targetVol = project.volumes.find(v => v.id === inspector.data.volumeId);
  const targetScript = targetVol?.scriptCache[inspector.data.episodeNum];
  const latestPanelData = targetScript?.panels?.find(p => p.panel_id === panel.panel_id);
  
  // 检查关键字段变化
  const oldVideoRefPath = panel.videoRefPath || '';
  const newVideoRefPath = latestPanelData.videoRefPath || '';
  const oldImagePath = panel.imagePath || '';
  const newImagePath = latestPanelData.imagePath || '';
  
  const needsSync = oldVideoRefPath !== newVideoRefPath ||
                    oldImagePath !== newImagePath ||
                    // ... 其他条件
  
  if (needsSync) {
    setInspector({ type: 'panel', data: latestPanelData });
  }
}, [project.volumes, panel.panel_id]); // ← 依赖 project.volumes 而非 displayPanels
```

#### 修复 2：合并多次 `onUpdatePanel` 调用为单次原子更新

```typescript
// GOOD - 一次调用更新所有字段
const handleBuildReferenceImage = async () => {
  const localPath = await saveImageToAssets(blob, filename);
  
  // generatePromptWithLayout 不再调用 onUpdatePanel，只返回 prompt
  const generatedPrompt = await generatePromptWithLayout();
  
  // 统一更新：videoRefPath + imagePath + currentVideoPrompt
  const updates: Partial<ScriptPanel> = {
    videoRefPath: localPath,
    imagePath: localPath,
    currentVideoPrompt: generatedPrompt,
  };
  
  onUpdatePanel(panel.panel_id, updates); // 只调用 1 次！
};
```

#### 修复 3：`handleBatchUpdatePanels` 使用函数式更新

```typescript
// GOOD - 确保基于最新 state 更新
const handleBatchUpdatePanels = (volId: string, episodeNum: number, newPanels: ScriptPanel[]) => {
  if (!project) return;
  
  let updatedProjectForSave: Project | null = null;
  
  setProject(prev => {
    if (!prev) return null;
    
    // 从 prev (最新状态) 读取数据
    const updatedVolumes = prev.volumes.map(v => {
      if (v.id === volId) {
        return { ...v, scriptCache: { ...v.scriptCache, [episodeNum]: { ...script, panels: newPanels } } };
      }
      return v;
    });
    
    const updated = { ...prev, volumes: updatedVolumes, lastModified: Date.now() };
    updatedProjectForSave = updated; // 捕获最新值用于保存
    return updated;
  });
  
  // 保存捕获的最新值
  if (updatedProjectForSave) {
    saveCurrentProject(updatedProjectForSave);
  }
};
```

#### 修复 4（辅助）：`localOverridePathRef` 临时保护新数据

```typescript
// GOOD - 使用 ref 临时存储新设置的路径，防止 loadRefImage 过早覆盖
const localOverridePathRef = useRef<Map<number, string>>(new Map());

const handleBuildReferenceImage = async () => {
  const localPath = await saveImageToAssets(blob, filename);
  
  // 立即记录到 ref，防止 loadRefImage 使用旧的 panel prop
  localOverridePathRef.current.set(panel.panel_id, localPath);
  
  // ... 更新 onUpdatePanel
};

useEffect(() => {
  const loadRefImage = async () => {
    // 检查是否有本地覆盖
    const localOverride = localOverridePathRef.current.get(panel.panel_id);
    if (localOverride) {
      // 如果 panel prop 还没更新到 localOverride，跳过加载
      if (panel.videoRefPath !== localOverride && panel.imagePath !== localOverride) {
        return; // 等待 props 更新
      } else {
        // Props 已更新，清除覆盖标记
        localOverridePathRef.current.delete(panel.panel_id);
      }
    }
    
    // 正常加载逻辑...
  };
  loadRefImage();
}, [panel.videoRefPath, panel.imagePath, panel.panel_id]);
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/VideoGeneratorPanel.tsx` | 1. 引入 `localOverridePathRef` 保护新数据<br>2. 合并多次 `onUpdatePanel` 为单次调用<br>3. `generatePromptWithLayout` 和 `generateTimeline` 不再调用 `onUpdatePanel`，改为返回结果 |
| `components/StoryboardBoard.tsx` | 1. `syncEffect` 直接从 `project.volumes` 读取最新数据<br>2. 添加 `videoRefPath` 和 `imagePath` 到 `needsSync` 检查条件<br>3. `handleUpdatePanel` 使用函数式更新 |
| `App.tsx` | `handleBatchUpdatePanels` 使用函数式更新，并捕获更新后的 project 用于保存 |

### ❌ Anti-pattern：多重 setState 调用 + 闭包捕获导致数据丢失

```typescript
// BAD - 多次 setState 可能导致数据覆盖
function updateA() {
  setProject(prev => ({ ...prev, fieldA: 'A' })); // 更新 1
}

function updateB() {
  updateA(); // 触发更新 1
  setProject(prev => ({ ...prev, fieldB: 'B' })); // 更新 2，可能基于更新 1 之前的 prev
}
// 结果：fieldA 的更新可能被 fieldB 的更新覆盖（如果 React 批处理不同步）
```

### ✅ Fix：原子更新 + 单次 setState

```typescript
// GOOD - 一次 setState 更新所有字段
function updateBoth() {
  setProject(prev => ({
    ...prev,
    fieldA: 'A',
    fieldB: 'B'
  }));
}
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **原子更新** | 多个相关字段应在一次 setState 中更新，避免竞态条件 |
| **函数式更新** | 当新状态依赖旧状态时，使用 `setState(prev => ...)` 确保基于最新状态 |
| **直接读取源数据** | 避免依赖派生数据（如 useMemo），在需要最新数据时直接从源 state 读取 |
| **临时保护新数据** | 使用 ref 临时存储新设置的值，防止异步 props 更新期间被旧数据覆盖 |

- 📅 **Date:** 2026-01-07
- 📝 **Version:** v2.3 (参考图刷新/切换修复)

---

## 📅 2026-01-07 - Sora2 图生视频接口集成

### 背景

项目已有 Veo 视频生成服务，需要添加 OpenAI Sora2 图生视频支持，通过神马 API 代理调用。

### ✅ 实现方案

#### 1. 类型扩展 (`types.ts`)

```typescript
// VeoModel 扩展 Sora2 模型
export type VeoModel =
  | 'veo3-pro-frames'
  | 'veo3-fast-frames'
  // ... existing veo models
  | 'sora2'        // Sora 2 标准版
  | 'sora2-turbo'; // Sora 2 Pro (支持 HD、25s)

// AppSettings 新增 Sora2 专用字段
export interface AppSettings {
  // ... existing fields
  sora2ApiKey?: string;
  sora2ApiBaseUrl?: string;
  sora2Duration?: '10' | '15' | '25';
  sora2Hd?: boolean;
  sora2Watermark?: boolean;
  sora2Private?: boolean;
  sora2NotifyHook?: string;
}
```

#### 2. Sora2 服务 (`services/sora2Service.ts`)

**核心函数**：
- `generateSora2Video()` - 调用 `POST /v2/videos/generations`
- `querySora2Task()` - 轮询 `GET /v2/videos/generations/{task_id}`
- `isSora2Model()` - 模型分流判断
- `normalizeBaseUrl()` - 处理带路径的 baseUrl

**Base URL 归一化**：
```typescript
// 用户可能输入 https://api.whatai.cc/v2/videos/generations
// 需要归一化为 https://api.whatai.cc
function normalizeBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith('/v2/videos/generations')) {
    return baseUrl.replace('/v2/videos/generations', '');
  }
  return baseUrl.replace(/\/$/, '');
}
```

#### 3. 模型分流逻辑 (`VideoGeneratorPanel.tsx`)

```typescript
// 生成时根据模型选择 API
if (isSora2Model(selectedModel)) {
  result = await generateSora2Video(prompt, images, settings, selectedModel, aspectRatio);
} else {
  result = await generateVideo({ prompt, model, images, aspectRatio }, settings);
}

// 轮询时也需分流
const queryResult = isSora2Model(selectedModel)
  ? await querySora2Task(taskId, settings)
  : await queryVideoTask(taskId, settings);
```

#### 4. 设置 UI (`SettingsModal.tsx`)

在「视频生成」Tab 新增 Sora2 配置区域：
- API Key / Base URL
- 时长选择 (10s / 15s / 25s)
- HD 高清开关
- 水印 / 隐私 / Webhook

### 📁 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | `VeoModel` 添加 `sora2`/`sora2-turbo`，`AppSettings` 添加 Sora2 字段 |
| `services/sora2Service.ts` | **新建**：Sora2 API 服务 |
| `components/SettingsModal.tsx` | 新增 Sora2 配置 UI |
| `components/VideoGeneratorPanel.tsx` | 添加 `isSora2Model` 分流逻辑 |

### API 规格

**生成接口** `POST /v2/videos/generations`
```json
{
  "prompt": "动画效果",
  "model": "sora-2" | "sora-2-pro",
  "aspect_ratio": "16:9" | "9:16",
  "hd": false,
  "duration": "10" | "15" | "25",
  "images": [{ "url": "..." }],
  "watermark": true,
  "private": false,
  "notify_hook": ""
}
```

**查询接口** `GET /v2/videos/generations/{task_id}`
```json
{
  "task_id": "...",
  "status": "NOT_START" | "IN_PROGRESS" | "SUCCESS" | "FAILURE",
  "progress": "50%",
  "data": { "output": "https://...mp4" },
  "fail_reason": ""
}
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **模型分流** | 通过 `isSora2Model()` 统一判断，避免硬编码 |
| **Base URL 归一化** | 支持用户输入完整 URL 或仅 host |
| **复用轮询架构** | 与 Veo 共享 `VeoGenerationResponse` / `VeoTaskQueryResponse` 类型 |
| **独立配置** | Sora2 有独立的 API Key / Base URL，不与 Veo 混用 |

- 📅 **Date:** 2026-01-07

---

## 📅 2026-01-07 - Sora2 视频生成成功但 UI 不显示问题修复

### 问题现象

使用 Sora2 生成视频，API 轮询返回 `SUCCESS` 状态并带有视频 URL，但页面上视频预览区域不显示视频，需要切换离开面板再切换回来才能看到。

### 根本原因

`StoryboardBoard.tsx` 的 `syncEffect`（用于同步 `inspector.data` 与最新的 `displayPanels`）只检查 `triptych_sources.length` 变化来决定是否同步，**不检查 `videoGenerations` 的变化**。

**时序问题**：
```
t0: 视频生成成功，轮询回调调用 onUpdatePanel({ videoGenerations: [...] })
t1: onUpdatePanel 更新 scriptCache → displayPanels 包含最新 panel
t2: syncEffect 检查：oldTriptychLength === newTriptychLength → needsSync = false
t3: inspector.data.panel 仍然是旧快照（videoGenerations 为空）
t4: VideoGeneratorPanel 渲染时 panel.videoGenerations 为空，不显示视频
```

用户切换离开面板再切换回来时，`inspector.data` 会从最新的 `displayPanels` 重新获取，这时视频才正确显示。

### ✅ 修复方案

扩展 `syncEffect` 的同步条件，增加对 `videoGenerations` 的检查：

```typescript
// StoryboardBoard.tsx - syncEffect
const oldVideoGenCount = panel.videoGenerations?.length || 0;
const newVideoGenCount = latestPanel.panel.videoGenerations?.length || 0;

// 检查 generation 状态变化（如 processing -> success）
const oldVideoGenKey = (panel.videoGenerations || [])
  .map(g => `${g.id}:${g.status}`).join(',');
const newVideoGenKey = (latestPanel.panel.videoGenerations || [])
  .map(g => `${g.id}:${g.status}`).join(',');

const needsSync = oldTriptychLength !== newTriptychLength || 
                  oldVideoGenCount !== newVideoGenCount ||
                  oldVideoGenKey !== newVideoGenKey;  // 状态变化也触发同步
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/StoryboardBoard.tsx` | `syncEffect` 增加 `videoGenerations` 长度和状态检查 |

### ❌ Anti-pattern: syncEffect 只检查部分字段变化

```typescript
// BAD - 只检查 triptych_sources，忽略其他重要字段
const needsSync = oldTriptychLength !== newTriptychLength;
// videoGenerations 变化时不会触发同步！
```

### ✅ Fix: 检查所有可能导致 UI 需要更新的字段

```typescript
// GOOD - 检查多个关键字段
const needsSync = oldTriptychLength !== newTriptychLength || 
                  oldVideoGenCount !== newVideoGenCount ||
                  oldVideoGenKey !== newVideoGenKey;
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **完整性检查** | `inspector.data` 同步条件应覆盖所有可能影响子组件显示的字段 |
| **状态变化感知** | 不仅检查数组长度，还要检查内部状态变化（如 `status`） |
| **避免过期快照** | 当父组件状态更新时，确保传递给子组件的 props 是最新的 |

- 📅 **Date:** 2026-01-07

---

## 📅 2026-01-07 - 绘图页功能收敛 + 参考图回填为分镜图

### 目标

1. 绘图页先聚焦主流程（Triptych/Micro-Montage），降低界面复杂度
2. 「构建参考图」生成的合成图，既作为视频参考图保留，也作为当前分镜的缩略图/分镜图展示

### ✅ 变更内容

#### 1) 绘图页隐藏两个实验性入口（先注释，后续再删）

- 在 `StoryboardBoard.tsx` 中将以下 UI 用 `false && (...)` 包裹（等价注释）：
  - 「🖼️ 单图生成（生成概览图）」区块
  - 「✏️ 一键线稿三联画」区块

#### 2) 构建参考图后回填分镜图字段

在 `VideoGeneratorPanel.tsx` 中：
- 保存合成参考图到本地后，优先使用本地路径加载并显示在参考图区域
- 同步写入：
  - `panel.videoRefPath = localPath`（保留参考图来源）
  - `panel.imagePath = localPath`（让分镜缩略图/分镜图展示使用该图）

### 设计原则

| 原则 | 说明 |
|------|------|
| **先隐藏后删除** | 用 `false && (...)` 保留代码位置，便于回滚与后续彻底清理 |
| **单一真相** | 参考图保存到本地后，以本地路径作为 UI 显示与持久化的首选来源 |
| **回填复用** | 同一张合成图同时服务「视频参考」和「分镜展示」，减少重复生成 |

- 📅 **Date:** 2026-01-07

## 📅 2026-01-06 - 分镜三连 Shot 结构化管线升级 (PanelShot Schema)

### 背景问题

原有的分镜系统使用 `▲` 开头的三行文本作为三张分镜图的生成提示词，存在以下问题：
1. **资产绑定模糊**：无法明确指定每个镜头使用哪些角色/场景资产
2. **镜头参数缺失**：景别、构图、光影等信息散落在文本中，难以提取
3. **一致性难保证**：三张图独立生成，角色外观容易漂移

### ✅ 解决方案：结构化 Shots 数据

为每个 `ScriptPanel` 添加 `shots` 字段，包含固定 3 个 `PanelShot` 对象，每个对象携带完整的镜头配置和资产绑定。

#### 新增类型定义 (`types.ts`)

```typescript
// 景别类型
type ShotSize = 'WS' | 'MS' | 'CU';

// 单镜头结构化数据
interface PanelShot {
  index: 1 | 2 | 3;                    // 镜头序号
  dialogue: string;                    // 台词
  action: string;                      // 动作描述
  visual: string;                      // 视觉描述
  
  // 资产绑定 (使用 asset ID)
  characterAssetIds: string[];         // 角色资产 ID (建议 ≤2)
  sceneAssetId: string | null;         // 场景资产 ID
  propAssetIds: string[];              // 道具资产 ID (建议 ≤3)
  
  // 镜头配置
  shotSize: ShotSize;                  // 景别: WS/MS/CU
  composition: string;                 // 构图
  camera: string;                      // 机位
  light: string;                       // 光影
  grade?: string;                      // 调色
  negatives?: string[];                // 负面提示词
}

// ScriptPanel 扩展
interface ScriptPanel {
  // ... 原有字段 ...
  shots?: [PanelShot, PanelShot, PanelShot];  // 新增
}
```

### 📁 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | 新增 `ShotSize`、`PanelShot` 类型，扩展 `ScriptPanel.shots` |
| `services/geminiService.ts` | 升级 `runWriterAgent`：添加 shots schema prompt、接收 `existingAssets` 参数、解析 shots 数据 |
| `services/panelShotResolver.ts` | **新文件**：资产绑定解析服务，确定性映射 assetId |
| `components/StoryboardBoard.tsx` | `TriptychGenerator` 升级：优先使用 shots 数据、增强参考图构建（场景锚+道具锚）、强化 prompt |
| `components/ScriptCanvas.tsx` | 新增 `ShotsEditor` 组件：可折叠的 3-shot 编辑器 |
| `App.tsx` | 传递 `project.assets` 给 `runWriterAgent` |
| `SHOT_SCHEMA_GUIDE.md` | **新文件**：完整使用指南 |

### 数据流架构

```
Writer Agent                          绘图页 (TriptychGenerator)
    │                                        │
    ▼                                        ▼
接收 existingAssets ──────────────▶ 检测 panel.shots 是否存在
    │                                        │
    ▼                                  ┌─────┴─────┐
输出 JSON with shots                   │           │
(每 panel 3 个 shots,                  ▼           ▼
 含 assetIds)                    有 shots    无 shots
                                      │           │
                                      ▼           ▼
                                使用 shots   回退 ▲ 解析
                                构建 prompt   + relatedAssetIds
                                + 参考图
```

### 一致性提升机制

1. **角色锚点**：从 `shot.characterAssetIds` 获取角色资产图
2. **场景锚点**（新增）：从 `shot.sceneAssetId` 获取场景资产图
3. **道具锚点**（新增）：从 `shot.propAssetIds` 获取道具资产图
4. **跨分镜锚点**：Shot1 使用上一分镜末帧
5. **帧间锚点**：Shot2/3 使用前一 shot 的生成结果
6. **强化 prompt**：结构化输出镜头配置（景别/构图/机位/光影）

### ❌ Anti-pattern: Writer 不传入现有资产导致 ID 无法绑定

```typescript
// BAD - Writer 不知道现有资产，无法输出有效的 assetId
const { script, newAssets } = await runWriterAgent(episode, settings, issueText, panelCount, continuityContext);
// shots 中的 characterAssetIds 可能是空的或无效的 ID
```

### ✅ Fix: 传入 existingAssets 供 Writer 选择

```typescript
// GOOD - 传入现有资产列表，Writer 可以从中选取 ID
const { script, newAssets } = await runWriterAgent(
  episode, settings, issueText, panelCount, continuityContext, 
  project.assets  // ← 传入现有资产
);
// Writer prompt 中包含资产列表，可输出有效的 assetId
```

### ❌ Anti-pattern: TriptychGenerator 只使用角色参考图

```typescript
// BAD - 只有角色参考图，背景容易漂移
const refs: Blob[] = [];
for (const char of characterAssets.slice(0, 2)) {
  refs.push(await loadAssetBlob(char.id));
}
// 没有场景参考图，三张图背景不一致！
```

### ✅ Fix: 增加场景锚和道具锚

```typescript
// GOOD - 角色锚 + 场景锚 + 道具锚
const refs: Blob[] = [];

// 1. 角色锚 (identity)
for (const charId of characterIds.slice(0, 2)) {
  const blob = await loadAssetBlob(charId);
  if (blob) refs.push(blob);
}

// 2. 场景锚 (background) - 新增
if (sceneId) {
  const blob = await loadAssetBlob(sceneId);
  if (blob) refs.push(blob);
}

// 3. 道具锚 (optional, max 1)
for (const propId of propIds.slice(0, 1)) {
  const blob = await loadAssetBlob(propId);
  if (blob) refs.push(blob);
}
```

### 降级策略

| 场景 | 降级行为 |
|------|---------|
| `panel.shots` 缺失 | 回退到 `▲` 解析 + `relatedAssetIds` |
| `assetId` 无效 | 跳过该参考图，不阻断生成 |
| 资产无图片 | 跳过该参考图，使用其他可用锚点 |

### 三镜头节奏规范 (Ki-Sho-Ketsu)

| Shot | 景别 | 叙事作用 |
|------|------|---------|
| Shot 1 | WS 全景 | **建立** - 展示场景和角色位置 |
| Shot 2 | MS 中景 | **展开** - 动作和冲突 |
| Shot 3 | CU 特写 | **落点** - 情绪或结果 |

### 相关文档

- `SHOT_SCHEMA_GUIDE.md` - 完整字段说明、最佳实践、漂移排查

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 文件系统并发写入冲突修复（Write Queue）

### 问题现象

打开分镜界面生成 shot 图片时，控制台持续报错：
```
[RetryService] Attempt 1/4 failed: Failed to execute 'createWritable' on 'FileSystemFileHandle': Failed to create swap file.
[SaveCoordinator] FileSystem save retry 1, waiting 1039ms...
Failed to save content for volume ... AbortError: Failed to create swap file.
```
同时，生成的分镜 shot 图片不显示在页面上。

### 根本原因

**并发写入冲突**：当用户快速生成多个 shot 时：
1. 每个 shot 生成后会调用 `saveImageToAssets` 保存图片
2. 然后触发 `onUpdateTriptych` → `saveCurrentProject`
3. 多个保存操作同时调用 `FileSystemFileHandle.createWritable()`
4. 文件系统不允许同一文件同时打开多个写入流，导致 `AbortError`

**问题本质**：`fileSystem.ts` 中的所有写入函数（`saveProjectMeta`、`saveVolumeContent`、`saveScript` 等）没有互斥锁，导致并发写入时冲突。

### ✅ 修复方案：全局写入队列（Write Queue）

在 `services/fileSystem.ts` 中添加写入队列机制：

```typescript
// 全局写入锁
let isWriting = false;
const writeQueue: Array<{
  execute: () => Promise<void>;
  resolve: (value: void) => void;
  reject: (error: Error) => void;
}> = [];

// 串行化写入操作
const executeWithWriteLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      isWriting = true;
      try {
        await new Promise(r => setTimeout(r, 30)); // 防止竞争
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error as Error);
      } finally {
        isWriting = false;
        processNextInQueue();
      }
    };

    if (isWriting) {
      writeQueue.push({ execute, resolve, reject });
    } else {
      execute();
    }
  });
};

// 安全写入函数
const safeWriteFile = async (fileHandle: FileSystemFileHandle, data: string | Blob): Promise<void> => {
  return executeWithWriteLock(async () => {
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (error) {
      try { await writable.close(); } catch {}
      throw error;
    }
  });
};
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/fileSystem.ts` | 添加写入队列、`safeWriteFile` 函数，更新所有写入函数使用队列 |

### 更新的函数

- `saveProjectMeta` - 保存项目元数据
- `saveVolumeContent` - 保存卷内容
- `savePlotBreakdown` - 保存剧情拆解
- `saveScript` - 保存剧本
- `saveReport` - 保存报告
- `saveImageToAssets` - 保存图片资源
- `createNewVolume` - 创建新卷
- `migrateProjectToV2` - 项目迁移

### ❌ Anti-pattern: 并发调用 createWritable()

```typescript
// BAD - 多个并发调用会导致 "Failed to create swap file"
const save1 = saveProjectMeta(project);  // 同时
const save2 = saveImageToAssets(blob, 'image.png');  // 同时
const save3 = saveScript(volId, epNum, script);  // 同时
await Promise.all([save1, save2, save3]);  // 💥 冲突！
```

### ✅ Fix: 使用写入队列串行化

```typescript
// GOOD - 所有写入自动串行化，内部使用 safeWriteFile
await saveProjectMeta(project);  // 自动排队
await saveImageToAssets(blob, 'image.png');  // 自动排队
await saveScript(volId, epNum, script);  // 自动排队
// 不再冲突！
```

### 设计原则

| 原则 | 说明 |
|------|------|
| **写入串行化** | 同一时间只有一个写入操作执行 |
| **自动排队** | 后续写入自动进入队列等待 |
| **透明升级** | 现有代码无需修改，内部自动处理 |
| **错误传播** | 写入失败时正确抛出异常 |

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 生成脚本后剧本工作区内容消失（React 闭包覆盖问题）

### 问题现象

点击"生成脚本"按钮后，脚本生成成功（console 有日志），但剧本工作区显示为空。

### 根本原因

`handleGenerateScript` 函数中存在 **React 闭包陷阱**：

```typescript
// BAD - 使用闭包中的旧 project 快照覆盖新数据
const handleGenerateScript = async () => {
    // ...生成脚本...
    
    // 1️⃣ updateActiveVolume 更新 scriptCache → 内部调用 setProject
    updateActiveVolume(vol => ({
        scriptCache: { ...vol.scriptCache, [epNum]: script }
    }));
    
    // 2️⃣ 再次调用 setProject 更新 assets
    setProject(prev => ({ ...prev, assets: updatedAssets }));
    
    // 3️⃣ ❌ 问题在这里！使用闭包中的 project（函数开始时捕获的旧值）
    const updatedProject = { ...project, assets: updatedAssets }; // ← project 是旧快照！
    await saveCurrentProject(updatedProject); // 旧数据覆盖了刚刚更新的 scriptCache！
};
```

**时序问题**：
```
t0: handleGenerateScript 捕获 project (v0, 无 scriptCache)
t1: updateActiveVolume → setProject(scriptCache) → React 队列中等待 (v1)
t2: setProject(assets) → React 队列中等待 (v2)
t3: saveCurrentProject(project=v0 + assets) → 保存 v0，没有 scriptCache！
t4: React 批量更新，但持久化已经用 v0 覆盖了
```

### ✅ 修复方案

**原子更新**：在一次 `setProject` 调用中同时更新 scriptCache 和 assets，并从闭包中捕获更新后的值用于保存：

```typescript
// GOOD - 原子更新，避免闭包陷阱
let updatedProjectForSave: Project | null = null;

setProject(prev => {
    if (!prev) return null;
    
    // 在回调中获取最新的 volume
    const activeVolume = prev.volumes.find(v => v.id === prev.activeVolumeId);
    if (!activeVolume) return prev;
    
    // 原子更新 scriptCache + assets
    const newScriptCache = { ...activeVolume.scriptCache, [epNum]: script };
    const updatedVolume = { ...activeVolume, scriptCache: newScriptCache };
    const newVolumes = prev.volumes.map(v => v.id === prev.activeVolumeId ? updatedVolume : v);
    
    const updated = { 
        ...prev, 
        volumes: newVolumes,
        assets: updatedAssets,
        lastModified: Date.now() 
    };
    
    // 从闭包中捕获更新后的值
    updatedProjectForSave = updated;
    return updated;
});

// 等待 React 状态更新
await new Promise(resolve => setTimeout(resolve, 0));

// 保存捕获的最新值
if (updatedProjectForSave) {
    await saveCurrentProject(updatedProjectForSave);
}
```

### ❌ Anti-pattern: 多次 setProject 后使用闭包中的旧值

```typescript
// BAD
updateActiveVolume(...);  // 内部调用 setProject
setProject(...);          // 又一次 setProject
saveCurrentProject(project); // project 是旧快照，覆盖了之前的更新！
```

### ✅ Fix: 原子更新 + 从回调中捕获

```typescript
// GOOD
let capturedProject: Project | null = null;

setProject(prev => {
    const updated = { ...prev, /* all updates */ };
    capturedProject = updated;  // 捕获最新值
    return updated;
});

await saveCurrentProject(capturedProject);
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleGenerateScript` 使用原子更新模式 |

### 设计原则

| 原则 | 说明 |
|------|------|
| **原子更新** | 一次 `setProject` 调用完成所有相关更新 |
| **闭包感知** | 不信任闭包中捕获的 state/props，使用回调获取最新值 |
| **保存前同步** | 保存操作前等待 React 状态更新完成 |

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 数据保存系统全面改进（专业级持久化架构）

### 背景

为了达到专业软件的数据保存标准，对项目的持久化系统进行了全面改进，实现了多层保存架构、数据一致性保护、版本历史和多标签页同步。

### ✅ 已实现功能

#### P0 - 数据安全风险修复（最高优先级）

| 功能 | 文件 | 说明 |
|------|------|------|
| **双存储事务性保存** | `services/saveCoordinator.ts` | 并行保存到文件系统和 IndexedDB，使用 `Promise.allSettled` 收集结果，部分失败时降级处理 |
| **保存重试机制** | `services/retryService.ts` | 指数退避重试（1s → 2s → 4s），最多3次，区分可重试错误（网络、配额、权限） |

**SaveCoordinator 核心架构**：
```typescript
// services/saveCoordinator.ts
export class SaveCoordinator {
  async saveProject(project: Project, dirHandle?: FileSystemDirectoryHandle) {
    // 1. 立即更新内存缓存（乐观UI）
    this.updateMemoryCache(project);
    
    // 2. 并行保存到双存储
    const results = await Promise.allSettled([
      dirHandle ? this.saveToFileSystem(project, dirHandle) : Promise.resolve(),
      this.saveToIndexedDB(project) // 始终保存到 IndexedDB
    ]);
    
    // 3. 检查结果，部分失败时降级处理
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length === results.length) {
      throw new AggregateError(failures, '所有存储位置保存失败');
    }
    
    return { success: true, partialFailure: failures.length > 0 };
  }
}
```

#### P1 - 基础用户体验（高优先级）

| 功能 | 文件 | 说明 |
|------|------|------|
| **手动保存快捷键** | `App.tsx` | Ctrl+S / Cmd+S 手动保存，立即 flush 保存队列 |
| **UI保存状态反馈** | `components/StatusBar.tsx` | 实时显示：正在保存（黄色）/已保存（绿色）/失败（红色），相对时间，待保存数量 |
| **自动备份系统** | `services/autoBackupService.ts` | 可配置间隔（1-30分钟）、保留数量（5-50个）、重要操作后自动备份 |
| **备份管理UI** | `components/SettingsModal.tsx` | 新增"💾 备份管理"Tab，配置开关/间隔/数量，备份列表、恢复、删除 |

**StatusBar 保存状态显示**：
```typescript
// 状态类型
interface SaveStatus {
  isSaving: boolean;
  lastSavedTime: number | null;
  pendingChanges: number;
  lastError: string | null;
  partialFailure: boolean;
}

// UI 显示逻辑
if (saveStatus.isSaving) → "● 正在保存..." (黄色)
if (saveStatus.lastError) → "✗ 保存失败" (红色)
if (saveStatus.partialFailure) → "⚠ 部分保存" (橙色)
if (saveStatus.lastSavedTime) → "✓ 已保存 · 2秒前" (绿色)
```

#### P2 - 高级功能（中优先级）

| 功能 | 文件 | 说明 |
|------|------|------|
| **版本历史栈（撤销/重做）** | `services/projectHistoryService.ts` | Ctrl+Z 撤销、Ctrl+Shift+Z/Ctrl+Y 重做，最多20个版本，持久化到 IndexedDB |
| **多标签页同步** | `services/multiTabSyncService.ts` | 使用 BroadcastChannel 实现标签页间通信，冲突检测，自动/手动重载 |

**版本历史服务**：
```typescript
// services/projectHistoryService.ts
export class ProjectHistoryService {
  private undoStack: ProjectHistory[] = [];
  private redoStack: ProjectHistory[] = [];
  
  async addSnapshot(project: Project, description: string) {
    // 添加到撤销栈，新操作清空重做栈
    this.undoStack.push(snapshot);
    this.redoStack = [];
    // 限制栈大小，持久化到 IndexedDB
  }
  
  async undo(): Promise<Project | null> {
    if (this.undoStack.length < 2) return null;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    return this.undoStack[this.undoStack.length - 1].project;
  }
}
```

**多标签页同步**：
```typescript
// services/multiTabSyncService.ts
export class MultiTabSyncService {
  private channel: BroadcastChannel;
  
  notifyProjectSaved(projectId: string, lastModified: number) {
    this.channel.postMessage({
      type: 'project-saved',
      projectId,
      timestamp: Date.now(),
      tabId: this.tabId,
      lastModified
    });
  }
  
  private handleProjectSaved(data: SyncMessage) {
    if (localLastModified > remoteLastModified) {
      // 本地版本更新 - 显示冲突对话框
      this.showConflictDialog();
    } else {
      // 远程版本更新 - 自动重新加载
      this.reloadProject(data.projectId);
    }
  }
}
```

#### P3 - 性能优化（低优先级）

| 功能 | 文件 | 说明 |
|------|------|------|
| **保存优先级队列** | `services/autoSaveService.ts` | P0(关键/生成操作) > P1(普通编辑) > P2(后台/资产图片)，按优先级+时间戳排序执行 |
| **大文件保存进度条** | `components/SaveProgressModal.tsx` | 当前操作显示、进度百分比、已用时间、预计剩余时间、取消按钮 |

**优先级队列**：
```typescript
// services/autoSaveService.ts
type SavePriority = 'P0' | 'P1' | 'P2';

const processSaveQueue = async () => {
  // 按优先级排序（P0 > P1 > P2，相同优先级按时间戳排序）
  operationsToProcess.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.timestamp - b.timestamp;
  });
  // 按顺序执行...
};
```

### 📁 新增/修改文件清单

**新建文件（6个）**：
| 文件 | 行数 | 说明 |
|------|------|------|
| `services/saveCoordinator.ts` | ~280 | 保存协调器（双写+状态管理+监听器） |
| `services/retryService.ts` | ~140 | 重试服务（指数退避+错误分类） |
| `services/autoBackupService.ts` | ~320 | 自动备份服务（定时+配置+持久化） |
| `services/projectHistoryService.ts` | ~280 | 版本历史服务（撤销/重做+持久化） |
| `services/multiTabSyncService.ts` | ~340 | 多标签页同步（BroadcastChannel） |
| `components/SaveProgressModal.tsx` | ~180 | 保存进度模态框（进度条+时间估算） |

**修改文件（5个）**：
| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | 集成所有新服务、快捷键监听（Ctrl+S/Z/Y）、状态管理 |
| `components/StatusBar.tsx` | 添加 `saveStatus` prop，实时显示保存状态 |
| `components/SettingsModal.tsx` | 新增"备份管理"Tab，备份配置+列表+恢复 |
| `services/autoSaveService.ts` | 添加 `SavePriority` 类型，优先级队列排序 |
| `db.ts` | 版本升级到 v4，添加 `backups` 和 `history` 表 |

### 数据库 Schema 升级

```typescript
// db.ts - 版本 4
class AutoManjuDB extends Dexie {
  projects!: Table<Project>;
  settings!: Table<AppSettings>;
  workspace!: Table<WorkspaceRecord>;
  backups!: Table<ProjectBackup>;    // 新增：项目备份
  history!: Table<ProjectHistory>;   // 新增：版本历史
  
  constructor() {
    super('AutoManjuDB');
    this.version(4).stores({
      projects: 'id, lastModified',
      settings: 'id',
      workspace: 'id',
      backups: 'id, projectId, createdAt',
      history: 'id, projectId, timestamp'
    });
  }
}

// 备份记录类型
interface ProjectBackup {
  id: string;           // backup_{projectId}_{timestamp}
  projectId: string;
  project: Project;     // 完整项目快照
  createdAt: number;
  description: string;  // "自动备份" / "手动快照"
}

// 历史记录类型
interface ProjectHistory {
  id: string;           // history_{projectId}_{timestamp}
  projectId: string;
  project: Project;
  timestamp: number;
  description: string;  // "导入小说", "生成剧本EP1", "编辑分镜"
}
```

### ❌ Anti-pattern: 单一路径保存导致数据不一致

```typescript
// BAD - 单一路径保存，可能导致数据不一致
if (dirHandle) {
  await saveProjectToDirWithHandle(updatedProject, dirHandle);
} else {
  await saveProject(updatedProject);
}
// 问题：两个存储位置不同步，一个失败另一个也丢失
```

### ✅ Fix: 双存储事务性保存

```typescript
// GOOD - 使用 SaveCoordinator 双写
const coordinator = saveCoordinatorRef.current;
const result = await coordinator.saveProject(updatedProject, dirHandle);

if (result.success) {
  // 通知其他标签页
  multiTabSyncRef.current?.notifyProjectSaved(updatedProject.id, updatedProject.lastModified);
  
  if (result.partialFailure) {
    addLog(`项目已保存（部分存储失败）`, "warning");
  }
}
```

### 设计原则：专业级持久化架构

| 原则 | 说明 |
|------|------|
| **双存储冗余** | 文件系统 + IndexedDB 并行保存，任一成功即算成功 |
| **乐观 UI** | 立即更新内存状态，后台异步保存 |
| **重试机制** | 指数退避，区分可重试/不可重试错误 |
| **版本历史** | 支持撤销/重做，关键操作自动创建快照 |
| **多标签页同步** | BroadcastChannel 通信，冲突检测与解决 |
| **优先级队列** | 关键操作优先保存，后台操作延后 |
| **用户反馈** | 实时状态显示，进度条，错误提示 |

### 键盘快捷键

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Ctrl/Cmd + S` | 手动保存 | 立即 flush 队列并强制保存 |
| `Ctrl/Cmd + Z` | 撤销 | 回退到上一个历史版本 |
| `Ctrl/Cmd + Shift + Z` | 重做 | 前进到下一个历史版本 |
| `Ctrl/Cmd + Y` | 重做（备用） | 同上 |

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 项目持久化架构彻底重构 & activeVolumeId 自动修复

### 问题：导入小说后刷新丢失 & 切换项目丢失 & 原文不显示

**问题现象**:
1. 导入小说文本后，刷新页面内容丢失
2. 保存项目 A → 切换到项目 B → 再切换回项目 A，内容丢失
3. 进入项目后，小说原文位置为空，需要手动切换卷才显示

**根本原因分析**（多次调试后确诊）:

| 问题 | 根因 | 证据 |
|------|------|------|
| 原因 1 | `AutoSaveService.saveVolumeContent()` 类型不匹配 | `stateManager.getProject()` 返回 `ProjectV2`（只有 `volumeIndex`），但代码尝试访问 `project.volumes.find()` |
| 原因 2 | 项目切换时使用内存缓存快照 | `projectsList.find()` 返回的是初始扫描时的旧数据，不会反映最新保存的内容 |
| 原因 3 | `activeVolumeId` 为空或无效 | 项目加载时 `activeVolumeId` 可能是 `""`，导致 `activeVolume` 为 null，`rawText` 为空 |

### ✅ 修复方案

#### 1. 简化保存架构 - 移除复杂的双层系统

**旧架构问题**：
```
saveCurrentProject → projectStateManager.updateProject (ProjectV2)
                  → autoSaveService.saveProject (尝试访问 ProjectV2.volumes)
                  → ❌ ProjectV2 没有 volumes 字段！
```

**新架构（简化）**：
```typescript
// App.tsx - saveCurrentProject
if (dirHandle) {
  setCurrentProjectDir(dirHandle);
  await saveProjectToDirWithHandle(updatedProject, dirHandle);
  // saveProjectToDir 内部会：
  //   1. 保存每个卷的 content.txt
  //   2. 保存 plotBreakdown, scripts, reports
  //   3. 保存 project.json 元数据
} else {
  // Fallback: IndexedDB only
  await saveProject(updatedProject);
}
```

**优点**：
- ✅ 一次性完整保存，不依赖防抖队列
- ✅ 类型匹配（`Project` → `ProjectV2` 转换在内部处理）
- ✅ 同步执行，刷新前保证完成

#### 2. 项目加载时从文件系统重新读取

**旧逻辑问题**：
```typescript
const p = projectsList.find(x => x.id === id);  // 使用初始扫描的快照
setProject(p);  // 旧数据，volumeCount=0
```

**新逻辑（修复）**：
```typescript
if (dirHandle) {
  setCurrentProjectDir(dirHandle);
  
  // 🔥 关键：从文件系统重新加载最新数据
  const freshProject = await loadProjectFromDirWithHandle(dirHandle);
  
  if (freshProject) {
    // 验证并修复 activeVolumeId
    const validatedProject = ensureValidActiveVolume(freshProject);
    
    // 更新内存缓存
    setProjectsList(prev => prev.map(proj => 
      proj.id === validatedProject.id ? validatedProject : proj
    ));
    
    setProject(validatedProject);
    return;
  }
}
```

#### 3. 自动修复 activeVolumeId

**辅助函数**：
```typescript
const ensureValidActiveVolume = (proj: Project): Project => {
  if (proj.volumes.length > 0) {
    const activeVolumeExists = proj.volumes.some(v => v.id === proj.activeVolumeId);
    if (!activeVolumeExists || !proj.activeVolumeId) {
      return {
        ...proj,
        activeVolumeId: proj.volumes[0].id  // 自动设置为第一个卷
      };
    }
  }
  return proj;
};
```

**应用位置**：在 `handleSelectProject` 的所有 4 个代码路径中，`setProject()` 前调用此函数。

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `saveCurrentProject` 简化为直接调用 `saveProjectToDirWithHandle`，移除 `AutoSaveService` 复杂逻辑 |
| `App.tsx` | `handleSelectProject` 添加从文件系统重新加载逻辑，导入 `loadProjectFromDirWithHandle` |
| `App.tsx` | 新增 `ensureValidActiveVolume` 辅助函数，在所有 `setProject` 调用前应用 |

### ❌ Anti-pattern

- ❌ **错误做法**：保存架构过于复杂，类型不匹配（`Project` vs `ProjectV2`），依赖防抖队列
- ✅ **正确做法**：简化为直接调用文件系统保存函数，一次性完整保存
- ❌ **错误做法**：项目切换时使用内存缓存，导致读取旧快照
- ✅ **正确做法**：每次加载项目时从文件系统重新读取最新数据
- ❌ **错误做法**：假设 `activeVolumeId` 始终有效
- ✅ **正确做法**：加载项目后验证并自动修复无效的 `activeVolumeId`

### 设计原则：简单可靠的持久化

| 原则 | 说明 |
|------|------|
| **Single Source of Truth** | 文件系统是唯一真相来源，内存缓存仅用于 UI 响应 |
| **Always Reload** | 项目加载/切换时始终从文件系统读取，不信任内存快照 |
| **Fail-Safe Defaults** | 无效状态自动修复（如 `activeVolumeId`），不抛出错误 |
| **Synchronous Saves** | 避免防抖和异步队列，关键操作同步完成 |

### 调试日志分析（关键证据）

| Line | 事件 | volumeCount | 分析 |
|------|------|-------------|------|
| 36-38 | 保存项目 | 1 | ✅ 保存成功 |
| 39-40 | 刷新后加载同一项目 | **1** | ✅ 修复后成功 |
| 46-48 | 保存新项目 | 42 | ✅ 保存成功 |
| 49-50 | 切换回旧项目 | **0** | ❌ 使用了旧快照（修复前） |
| - | 切换回旧项目 | **1** | ✅ 从 FS 重新加载（修复后） |

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 工作区本地存储完整修复 & 优雅降级

### 问题 1：工作区相关功能导致项目无法打开

**问题现象**:
- 选择项目时无法打开
- 导入项目时无法导入
- 新建项目时失败

**根本原因**:
1. `handleSelectProject` 中查找项目目录的逻辑有问题 - 如果 `projectDirMap` 中没有找到，会尝试创建新目录，但目录名可能与已存在的不一致
2. `handleCreateProject` 和 `handleImportProject` 强制要求 `workspaceHandle`，没有工作区时完全无法使用
3. JSON 导入时，`saveProjectToDirWithHandle` 在 `if` 块外调用，但 `projectDirHandle` 只在块内定义

### ✅ 修复方案

#### 1. 改进 `handleSelectProject` 目录查找逻辑
```typescript
// 先扫描工作区寻找已存在的目录
if (!dirHandle && workspaceHandle) {
  // 遍历工作区查找匹配 project ID 的目录
  for await (const entry of workspaceHandle.values()) {
    if (entry.kind === 'directory' && entry.name.includes(id)) {
      dirHandle = entry;
      break;
    }
  }
  // 如果仍未找到，才创建新目录
  if (!dirHandle) {
    dirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
  }
}
```

#### 2. `handleCreateProject` 支持双模式
```typescript
// Mode 1: 有工作区 → 本地存储
if (workspaceHandle) {
  const { project, dirHandle } = await createProjectInWorkspace(...);
  await saveProjectToDir(newProject);
  addLog('项目创建成功（本地存储）', 'success');
}
// Mode 2: 无工作区 → IndexedDB 降级
else {
  await projectStateManager.saveProjectToDB(projectV2);
  addLog('项目创建成功（浏览器存储）', 'success');
  addLog('提示：选择工作区文件夹可启用本地存储', 'info');
}
```

#### 3. `handleImportProject` 支持双模式
```typescript
// ZIP 导入
let projectDirHandle: FileSystemDirectoryHandle | null = null;
if (workspaceHandle) {
  projectDirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
  setCurrentProjectDir(projectDirHandle);
}
// 导入逻辑...
if (projectDirHandle) {
  await saveProjectToDirWithHandle(finalProject, projectDirHandle);
}
// 始终保存到 IndexedDB 作为元数据备份
await projectStateManager.saveProjectToDB(projectV2);
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleSelectProject` 先查找再创建、`handleCreateProject` 双模式、`handleImportProject` 双模式 |

### Anti-pattern

- ❌ **错误做法**：强制依赖特定存储模式，无降级方案
- ✅ **正确做法**：支持多种存储模式（本地文件系统 + IndexedDB），优雅降级
- ❌ **错误做法**：在条件块外使用条件块内定义的变量
- ✅ **正确做法**：变量定义在外部，条件块内赋值，使用前检查
- ❌ **错误做法**：使用 React Hook (`useRef`) 但忘记导入
- ✅ **正确做法**：添加新 Hook 使用时，**立即检查导入语句**
- ❌ **错误做法**：调用不存在的方法 (`loadFullProject`)，导致项目状态未初始化
- ✅ **正确做法**：确保调用的方法存在，并正确初始化 `currentProject` 和 `loadedVolumes`

### 设计原则：双模式存储策略

| 存储模式 | 触发条件 | 特点 |
|---------|---------|------|
| 本地文件系统 | `workspaceHandle` 存在 | 数据主权归用户、可直接访问文件 |
| IndexedDB | 无 `workspaceHandle` | 兼容性好、无需用户授权 |

### 问题 2：导入小说文本后刷新页面内容丢失

**问题现象**:
- 导入小说文本后，内容显示正常
- 刷新页面后，导入的内容消失

**根本原因**:
1. `loadFullProject` 方法**不存在于** `ProjectStateManager` 类中
2. App.tsx 第801行调用 `projectStateManager.loadFullProject(projectV2)` 会抛出错误
3. 错误被 catch 捕获后，`projectStateManager.currentProject` 没有被设置
4. 后续 `updateActiveVolume` 调用 `projectStateManager.updateVolume()` 时，`saveProjectToDB(this.currentProject)` 使用 `null` 的 `currentProject`，导致保存失败

**修复方案**:
添加 `loadFullProject` 方法到 `ProjectStateManager`：

```typescript
// services/projectStateManager.ts
async loadFullProject(projectV2: ProjectV2): Promise<Project> {
  // 1. 设置当前项目
  this.currentProject = projectV2;
  
  // 2. 从数据库获取完整项目数据（包含卷内容）
  const projectRecord = await db.projects.get(projectV2.id);
  
  // 3. 加载所有卷到内存缓存
  for (const volume of projectRecord.volumes) {
    this.loadedVolumes.set(volume.id, volume);
    // 加载脚本和报告缓存...
  }
  
  // 4. 返回完整项目数据
  return projectRecord;
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/projectStateManager.ts` | 添加 `loadFullProject` 方法 |

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-06 - 首页优化 & 新建项目修复

### 问题 1：新建项目后无反应

**根因**：`handleCreateProject` 在走 RxDB/ProjectStateManager 分支创建成功后直接 `return`，没有调用 `handleSelectProject(newProject.id)` 进入项目，导致用户视觉上"点了没反应"。

**解决方案**：
```typescript
// App.tsx - handleCreateProject
await projectStateManager.saveProjectToDB(projectV2);
await refreshProjectsList();
addLog(`项目 "${newProject.name}" 创建成功`, 'success');

// ✅ 关键：创建完成后立刻进入项目 (SCRIPT 视图)
await handleSelectProject(newProject.id);
return;
```

### 问题 2：首页功能不完善

**优化内容**：

#### 1. 搜索功能
- 新增搜索框，支持按项目名称或卷名搜索
- 搜索结果实时过滤显示
- 清除按钮一键重置

#### 2. 排序功能
- 按最后修改时间排序（默认）
- 按名称排序（拼音）
- 按创建时间排序

#### 3. 项目卡片统计信息
- 📚 卷数
- 📺 集数（跨所有卷的剧本数）
- 🎬 分镜数（跨所有卷所有剧本的分镜数）
- 🎭 资产数
- 🎨 当前风格名称

#### 4. 空状态优化
- 搜索无结果时显示"未找到匹配项目"提示
- 提供"清除搜索"按钮

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleCreateProject` 成功后调用 `handleSelectProject` |
| `components/ProjectManager.tsx` | 新增 `useMemo` 过滤排序、搜索框、排序按钮、统计信息展示 |

### Anti-pattern

- ❌ **错误做法**：创建资源后直接 `return`，不通知用户或自动导航
- ✅ **正确做法**：创建成功后应自动进入资源编辑状态，提供流畅的用户体验

### 进一步修复：React State 异步更新问题

**问题**：初步修复后调用 `handleSelectProject(newProject.id)` 仍然无效

**根因**：
```typescript
// handleSelectProject 依赖 projectsList 来查找项目
const p = projectsList.find(x => x.id === id);
if (!p) return; // ← 如果找不到项目就直接返回
```

React state 更新是异步的，`refreshProjectsList()` 虽然被 await，但 `projectsList` 的实际更新要等到下一个渲染周期。

**最终修复**：
```typescript
// 直接设置项目状态，不依赖 projectsList
setProject(newProject);
setCurrentView('SCRIPT');
```

---

## 📅 2026-01-06 - 微蒙太奇三镜头连续性管线 (Micro-Montage Continuity Pipeline)

### 背景问题

**三镜头独立生成导致角色/道具/背景漂移**

原有的"动作分解三连拍"系统使用独立的 txt2img 为每张镜头生成图片，导致：
- 同一角色在三张图中外观不一致（发型/服装/配饰漂移）
- 场景背景细节在三张图之间有差异
- 跨分镜时，前后分镜的视觉连续性差
- 视频生成参考图信息不完整，缺乏统一的"参考图契约"

### ✅ 解决方案：微蒙太奇连续性管线

引入三层融合策略：

#### 1. 连续性判定服务 (`services/microMontageContinuity.ts`)

```typescript
// 自动判定规则
function analyzeContinuity(currentPanel, project): ContinuityAnalysisResult {
  // 场景一致性检测（scene_name 归一化比对）
  // 跳切关键词检测（"转场/闪回/与此同时"等）
  // 角色重叠度计算（Jaccard 相似度）
  return {
    shouldUsePrevAnchor: boolean,
    reason: string,
    prevPanelAnchorPath: string | null,
    confidence: number,
  };
}
```

**连续性模式**：
| 模式 | 行为 |
|------|------|
| `auto` | 系统自动判定（基于场景/角色/关键词） |
| `on` | 强制使用上一分镜末帧作为锚点 |
| `off` | 禁用跨分镜连续性 |

#### 2. 图生图参考构建（资产锚 + 帧间锚 + 跨分镜锚）

```typescript
// 构建 referenceImages
async function buildReferenceImages(slotIdx, useCrossPanelAnchor, crossPanelAnchorPath) {
  const refs: Blob[] = [];
  
  // 1. 角色资产图（身份锚 - 始终加入）
  for (const char of characterAssets.slice(0, 2)) {
    refs.push(await loadAssetImage(char.imagePath));
  }
  
  // 2. 跨分镜锚（仅 Shot1 且连续性启用时）
  if (slotIdx === 0 && useCrossPanelAnchor && crossPanelAnchorPath) {
    refs.push(await loadAssetImage(crossPanelAnchorPath));
  }
  
  // 3. 帧间锚（Shot2/Shot3 使用前一 shot 的结果）
  if (slotIdx > 0 && prevSlotPath) {
    refs.push(await loadAssetImage(prevSlotPath));
  }
  
  return refs;
}
```

#### 3. 提示词结构（Continuity Contract + Shot Plan + Delta）

```
[CONTINUITY CONTRACT - INVARIANTS]
The following elements MUST remain IDENTICAL across all shots:
- CHARACTER APPEARANCE: 陆寒玄 - same face, hair, outfit, accessories
- SCENE/LOCATION: 仙境山巅 - same environment, lighting direction, time of day
- 180° RULE: Maintain consistent screen direction

[SHOT 1/3 - WIDE SHOT (WS)]
Beat: Ki (Establishing shot - show full scene and characters)

[THIS SHOT ACTION]
角色站立于山巅，远眺云海

[COMPOSITION]
- Frame: Full body or environmental wide shot
- Purpose: Establish location, character positions, and scene atmosphere

[OUTPUT]
webtoon panel style, high quality illustration, consistent character design
```

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | 新增 `ContinuityMode` 类型、`ScriptPanel.continuityMode/continuityPrevHint` 字段 |
| `services/microMontageContinuity.ts` | **新增**：连续性判定服务（自动规则 + 手动覆盖） |
| `components/StoryboardBoard.tsx` | TriptychGenerator 升级：img2img + 连续性锚点 + 微蒙太奇提示词 |
| `services/videoReferenceImageBuilder.ts` | 新增 `microMontage` 布局（prev strip + triptych + assets） |
| `components/VideoGeneratorPanel.tsx` | 集成 microMontage 参考图构建、布局模式选择器 |
| `services/videoTimelineBuilder.ts` | 新增 `MicroMontageRefHints`、动态 `refImageHints` 生成 |

### 🛡️ 纠错机制 / 降级策略

| 层级 | 错误场景 | 处理策略 |
|------|---------|---------|
| Level 1 | 角色资产图缺失 | 提示用户先生成资产图，自动降级为 txt2img |
| Level 2 | img2img 失败 | 重试 1 次，仍失败则降级为 txt2img |
| Level 3 | 跨分镜锚点不可用 | 跳过跨分镜锚点，不阻断生成 |
| Level 3 | 用户一键修复 | 提供"按连续性重生成 Shot2/3"按钮 |

### 视频参考图布局（microMontage）

```
┌────────────────────────────────────────────────────────────┐
│  [Prev Panel Strip] (optional, 8% height when enabled)    │
├────────────────────────────────────────────────────────────┤
│                      │                                     │
│  Triptych Shots      │         Asset Cards                 │
│  (52% width)         │         (48% width)                 │
│  ┌─────────────┐     │  ┌───────┐ ┌───────┐ ┌───────┐     │
│  │ Shot 1 (WS) │     │  │ Char1 │ │ Scene │ │ Prop  │     │
│  ├─────────────┤     │  └───────┘ └───────┘ └───────┘     │
│  │ Shot 2 (MS) │     │                                     │
│  ├─────────────┤     │                                     │
│  │ Shot 3 (CU) │     │                                     │
│  └─────────────┘     │                                     │
│                      │                                     │
└────────────────────────────────────────────────────────────┘
```

### ❌ Anti-pattern: 独立 txt2img 导致视觉漂移

```typescript
// BAD - 三张图独立生成，没有共享参考
for (let i = 0; i < 3; i++) {
  const prompt = buildShotPrompt(panel, i);
  const imageUrl = await generateImage(prompt, settings, '16:9');
  // 角色外观、背景、道具在三张图之间不一致！
}
```

### ✅ Fix: 微蒙太奇管线

```typescript
// GOOD - 使用资产锚 + 帧间锚 + 跨分镜锚
const handleGenerateSlot = async (idx) => {
  // 构建连续性契约提示词
  const fullPrompt = buildMicroMontagePrompt(idx, actionText);
  
  // 构建参考图（角色资产 + 前一帧 + 跨分镜锚点）
  const referenceImages = await buildReferenceImages(
    idx,
    continuityAnalysis.shouldUsePrevAnchor,
    continuityAnalysis.prevPanelAnchorPath
  );
  
  // img2img 生成（有参考时）或 txt2img 降级（无参考时）
  if (referenceImages.length > 0) {
    return generateImage(fullPrompt, settings, '16:9', undefined, referenceImages);
  } else {
    return generateImage(fullPrompt, settings, '16:9');
  }
};
```

- 📅 **Date:** 2026-01-06

---

## 📅 2026-01-05 - 并发资产图片生成状态覆盖问题

### ❌ Anti-pattern: 并发更新使用闭包捕获的旧状态

**问题现象**:
- 同时点击两个资产的"生成图片"按钮
- 两个都成功生成（API 返回正确）
- 但只有一个资产显示图片，另一个的更新被覆盖

**根本原因**:
```typescript
// BAD - 直接使用闭包捕获的 project.assets
const handleUpdateAsset = async (asset: Asset) => {
    const newAssets = project.assets.map(a => a.id === asset.id ? asset : a);
    //                ^^^^^^^^^^^^^^ 这是闭包捕获的旧快照！
    await saveCurrentProject({ ...project, assets: newAssets });
};
```

**并发时序问题**:
```
t0: 资产 A 开始生成 → 读取 project.assets (v1)
t1: 资产 B 开始生成 → 读取 project.assets (也是 v1)
t2: 资产 A 完成 → 基于 v1 更新 → 保存 v2 (含 A 图片)
t3: 资产 B 完成 → 基于 v1 更新 → 保存 v3 (只含 B 图片)
结果: v3 覆盖了 v2，A 的图片丢失！
```

### ✅ 修复方案: 使用 setProject 函数式更新

**1. handleUpdateAsset 使用函数式更新**:
```typescript
const handleUpdateAsset = async (updatedAsset: Asset) => {
    let updatedProject: Project | null = null;
    
    // 函数式更新确保基于最新状态
    setProject(prev => {
        if (!prev) return null;
        const newAssets = prev.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a);
        updatedProject = { ...prev, assets: newAssets, lastModified: Date.now() };
        return updatedProject;
    });
    
    // 等待状态更新后再持久化
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (updatedProject && projectStateManager) {
        await projectStateManager.saveProject(updatedProject);
    }
};
```

**2. handleGenerateAssetImage 在更新时读取最新状态**:
```typescript
const handleGenerateAssetImage = async (assetId: string) => {
    // 1. 开始时捕获不变的值（prompt 等）
    const assetPrompt = asset.prompt;
    
    // 2. 生成图片...
    const localPath = await saveImageToAssets(blob, filename);
    
    // 3. 使用函数式更新获取最新 asset 状态
    setProject(prev => {
        if (!prev) return null;
        const latestAsset = prev.assets.find(a => a.id === assetId);
        if (!latestAsset) return prev;
        
        // 基于最新状态合并新图片
        const history = [localPath, ...(latestAsset.imageHistory || [])].slice(0, 5);
        const updatedAsset = { ...latestAsset, imagePath: localPath, imageHistory: history };
        const newAssets = prev.assets.map(a => a.id === assetId ? updatedAsset : a);
        
        return { ...prev, assets: newAssets, lastModified: Date.now() };
    });
};
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleUpdateAsset` 和 `handleGenerateAssetImage` 使用函数式更新 |

### 关键原则

1. **永远不要在异步回调中使用闭包捕获的 state/props**
2. **需要基于当前状态更新时，使用 `setState(prev => ...)` 函数式更新**
3. **并发操作必须考虑时序问题，使用 ref 或函数式更新获取最新值**

- 📅 **Date:** 2026-01-05

---

## 📅 2026-01-05 - 资产名称去括号 + 重复资产合并

### ❌ Anti-pattern: 资产名称带括号导致重复创建

**问题**:
AI 生成的分镜脚本中，角色名带有状态后缀（如 `陆寒玄（战神）`、`苏婉儿（少女）`）。
资产提取时这些括号被当作 `asset.name` 的一部分存入，导致：
- `陆寒玄（战神）` 和 `陆寒玄（少年）` 被当作两个不同资产
- 同一角色产生多个"不同状态"的重复资产

**根因**:
`PROMPT_WRITER` 要求"主语必须带状态后缀"（如 `陆晨玄（战神）`），资产提取时直接把这种名字写入 `asset.name`。

### ✅ 修复方案

**1. 去重逻辑忽略末尾括号**
```typescript
const stripNameSuffix = (name: string): string =>
    name.trim().replace(/\s*[（(][^）)]*[）)]\s*$/u, '').trim();

const normalizeKey = (type: string, name: string): string =>
    `${type}:${stripNameSuffix(name)}`.toLowerCase().replace(/\s+/g, ' ');
```

**2. 资产提取时清洗 name**
- 括号内容从 `name` 移到 `description`
- `陆寒玄（战神）` → `name: 陆寒玄`, `description: 【战神】...`

```typescript
const extractNameSuffix = (name: string): { cleanName: string; suffix: string | null } => {
    const match = name.trim().match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/u);
    if (match) return { cleanName: match[1].trim(), suffix: match[2].trim() };
    return { cleanName: name.trim(), suffix: null };
};
```

**3. 已有资产清理工具**
- 资产库新增 `🧹 清理` 按钮
- 自动去除已有资产名称的末尾括号
- 合并重复资产（相同 type + cleanName）

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `normalizeKey` 忽略括号、`sanitizeExtractedAsset` 清洗 name、`handleCleanupAssetNames` 清理工具 |
| `components/AssetLibrary.tsx` | 添加 `onCleanupNames` prop 和清理按钮 |

- 📅 **Date:** 2026-01-05

---

## 📅 2026-01-05 - 资产生成禁止人物约束（Scene/Item）

### ❌ Anti-pattern: 场景/道具资产生成时出现角色人物

**问题**:
资产生成时，`scene`（场景）和 `item`（道具）类型资产图像中出现了角色人物，违反了"场景为空镜、道具为单品特写"的设计原则。

**根因**:
`generateImage` 函数已有 `assetType` 参数可追加负面约束，但 `handleGenerateAssetImage` 调用时**没有传递 `asset.type`**，导致约束未生效。

### ✅ 修复方案

**1. 传递 assetType 到 generateImage**
```typescript
// App.tsx - handleGenerateAssetImage
const assetType = asset.type; // character | scene | item
const url = await generateImage(prompt, settings, assetAspectRatio, assetType);
```

**2. 增强 scene/item 负面约束（geminiService.ts）**
```typescript
if (assetType === 'scene') {
  // 场景资产：强制空镜
  const sceneConstraints = [
    "CRITICAL: absolutely no humans, no people, no characters, no figures, no silhouettes",
    "no human-like shapes, no body parts, no faces, no crowds",
    "empty scene, uninhabited, deserted, nobody present",
    "environment concept art, landscape, scenery, background only",
    "architectural visualization, location shot, establishing shot"
  ].join(", ");
  finalPrompt = `${prompt}. ${sceneConstraints}`;
} else if (assetType === 'item') {
  // 道具资产：单品特写，无人物
  const itemConstraints = [
    "CRITICAL: no humans, no people, no hands, no body parts",
    "single object focus, isolated item, product photography",
    "center composition, object only, no human interaction",
    "studio lighting, clean background, 3D product render"
  ].join(", ");
  finalPrompt = `${prompt}. ${itemConstraints}`;
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleGenerateAssetImage` 传递 `asset.type` 参数 |
| `services/geminiService.ts` | `generateImage` 增强 scene/item 负面约束 |

### 📝 设计原则

| 资产类型 | 是否允许人物 | 典型场景 |
|---------|-------------|---------|
| `character` | ✅ 允许 | 角色立绘、四视图 |
| `scene` | ❌ 禁止 | 空镜场景、环境概念图 |
| `item` | ❌ 禁止 | 道具单品特写、产品图 |

- 📅 **Date:** 2026-01-05

---

## 📅 2026-01-05 - 分镜管理双击展开编辑 + 全局序号筛选 + 层级分组

### ✅ 新增功能: PanelRow 双击展开编辑

**功能说明**:
- 双击分镜行可展开编辑区域
- 展开后可编辑: `script_content`（分镜脚本）、`scene_name`、`duration`、`active_characters_str`、`props`、`composition`
- 编辑内容在失去焦点时自动保存（与剧本页同步）
- 点击"收起"按钮或双击可收起编辑区

**实现要点**:
- `isExpanded` 状态控制展开/收起
- 本地编辑状态（`editScriptContent` 等）实现响应式输入
- `useEffect` 同步外部 panel 变化到本地状态
- `onBlur` 时调用 `handleSaveEdits()` 自动保存

### ✅ 新增功能: 全局序号筛选

**功能说明**:
- 顶部工具栏新增 `#` 筛选框
- 支持单个数字（如 `34`）或范围（如 `1-50`）
- 筛选后只显示符合条件的分镜

**实现要点**:
```typescript
const [globalNoFilter, setGlobalNoFilter] = useState<string>('');
const parsedGlobalFilter = useMemo(() => {
  if (!globalNoFilter.trim()) return null;
  // 支持 "1-50" 或 "34" 格式
  // ...
}, [globalNoFilter]);

// displayPanels 中应用筛选
if (parsedGlobalFilter) {
  const globalNo = panel.globalPanelNo ?? panel.panel_id;
  if (globalNo < parsedGlobalFilter.from || globalNo > parsedGlobalFilter.to) return;
}
```

### ✅ 新增功能: 列表按卷>集分组显示

**功能说明**:
- 列表视图中，分镜按 `卷 > 集` 层级分组显示
- 每个卷和集有独立的分组头部
- 集头部显示分镜数量和全局序号范围

**实现要点**:
- 遍历 `displayPanels` 时跟踪 `lastVolId` 和 `lastEpNum`
- 当卷或集变化时插入分组头部
- 分组头部使用紫色（卷）和绿色（集）区分

### ✅ UI 优化: PanelRow 左侧大号全局序号

- 分镜行左侧新增独立的全局序号显示区
- 大号字体显示全局序号，小号显示本地 panel_id
- 层级标签（卷/集/时长）使用彩色标签样式

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/StoryboardBoard.tsx` | PanelRow 双击展开编辑、全局序号筛选、层级分组显示 |

- 📅 **Date:** 2026-01-05

---

## 📅 2026-01-05 - 分镜界面 UI 优化（字体放大 + 时长格式修复）

### ❌ Anti-pattern: 时长显示重复后缀 "10ss"

**问题**:
`panel.duration` 类型为 `string`，可能已包含 "s" 后缀（如 "10s"）。
代码中又硬编码了 `{panel.duration}s`，导致显示为 "10ss"。

**修复**:
添加 `formatDuration` 辅助函数，去除字符串末尾的 "s" 后缀：
```typescript
const formatDuration = (dur: string | undefined): string => {
  if (!dur) return '';
  return String(dur).replace(/s$/i, '');
};
// Usage: {formatDuration(panel.duration)}s → "10s"
```

### ✅ UI 优化: 增大分镜字体显示

| 元素 | 原字体 | 新字体 |
|------|--------|--------|
| 场景名 | `text-xs` (12px) | `text-sm` (14px) |
| 剧本视觉描述 | `text-[10px]` | `text-sm` (14px) |
| 卷/集号 | `text-[10px]` | `text-xs` (12px) |
| 面板检查器标题 | `text-base` (16px) | `text-lg` (18px) |
| Tab 按钮 | `text-xs` | `text-sm` |

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/StoryboardBoard.tsx` | 添加 `formatDuration`，调整 `PanelRow`/`PanelCard`/`PanelInspectorContent` 字体大小 |

- 📅 **Date:** 2026-01-05

---

## 📅 2026-01-05 - 视频时间轴 DSL 架构升级

### ✅ 新增功能: 结构化时间轴 Prompt 系统

**背景问题**:
原视频生成流程只能生成"单段自然语言 prompt"，无法精确控制：
- 多镜头的时序切换（shot timeline）
- 每帧的叙事节奏标记（Ki/Sho/Ten/Ketsu）
- 五维参数块隔离（SUBJECT/SCENE/LIGHT/GRADE/CAM/AUDIO）
- 参考图契约（明确告诉 AI 参考图哪个区域对应哪个 shot）

**解决方案**:
引入 `VideoTimelineConfig` 数据结构作为**内部统一表示**，然后通过**适配器函数**导出不同模型的 prompt 格式。

#### 核心类型定义 (`types.ts`)

```typescript
// 叙事节奏标记（起承转合）
type NarrativeBeat = 'Ki' | 'Sho' | 'Ten' | 'Ketsu';

// 运动状态
type MotionState = 'STATIC' | 'DYNAMIC';

// 单镜头单元
interface ShotUnit {
  id: string;
  index: number;                    // #1, #2, ...
  durationSec: number;              // 时长（秒）
  beat: NarrativeBeat;              // 叙事节奏
  motionState: MotionState;         // 静态/动态
  
  // 核心指令
  action: string;                   // ACTION:{...}
  camera: string;                   // CAMERA:{...}
  
  // 五维参数块
  subject?: string;                 // 主体外观
  scene?: string;                   // 场景环境
  light?: string;                   // 光影设计
  grade?: string;                   // 调色风格
  camTech?: string;                 // 摄影技术参数
  audio?: string;                   // 音频/通感提示
  
  // 参考图契约
  refImageHints?: string;           // 引用参考图的哪个区域
}

// 完整时间轴配置
interface VideoTimelineConfig {
  title: string;
  totalDurationSec: number;
  contentDurationSec: number;
  blackoutSec: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  tempoFactor: number;              // 节奏因子
  mode: 'standard' | 'cinematic' | 'fast';
  shots: ShotUnit[];
  globalGrade?: string;             // 全局调色
  globalLight?: string;             // 全局光影
  refImageLayout?: string;          // 参考图布局说明
}
```

#### 导出器函数 (`services/videoTimelineBuilder.ts`)

| 函数 | 输出格式 | 适用模型 |
|------|---------|---------|
| `exportTimelineToSoraPrompt()` | 伪代码时间轴 | Sora 2 |
| `exportTimelineToVeoPrompt()` | 电影级自然语言分段 | Veo 3.1 |
| `exportTimelineToGenericPrompt()` | 简化自然语言 | 可灵/火山/通用 |

**Sora 格式示例**:
```
# PANEL TITLE
## Structure (variable cut durations; total 8.0s; content 7.00s + 1.00s blackout; mode:standard; tempo_factor:1.0)

## Timeline

 - [ #1 2.50s ] ACTION:{角色全景展示} ; CAMERA:{locked WS} — [STATIC] /* Ki */
   | SUBJECT:{女骑士, 银色盔甲} | SCENE:{地下神庙} | LIGHT:{冷光束} | GRADE:{teal-orange}
   | REF:{triptych top panel}

 - [ #2 2.00s ] ACTION:{角色动作展开} ; CAMERA:{dolly in MS} — [DYNAMIC] /* Sho */
   ...
```

#### UI 集成 (`VideoGeneratorPanel`)

- **时间轴编辑器**: 可视化展示 shot 列表、时长、beat 标记
- **格式切换**: 支持「自动/Sora/Veo」三种模式
- **一键复制**: 分别复制 Sora/Veo/通用格式
- **默认开启**: 高级时间轴模式默认启用

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|---------|
| `types.ts` | 新增 `VideoTimelineConfig`, `ShotUnit`, `NarrativeBeat` 等类型 |
| `services/videoTimelineBuilder.ts` | 新增：时间轴构建器 + 多格式导出器 |
| `components/VideoGeneratorPanel.tsx` | 集成时间轴编辑器 UI |

### 设计原则

1. **结构与文本分离**: 内部用结构体存储 timeline，导出时再转文本
2. **适配器模式**: 同一数据结构，不同模型不同格式
3. **参考图契约**: 每个 shot 明确引用参考图的哪个区域
4. **叙事节奏可视化**: Ki/Sho/Ten/Ketsu 用颜色区分

---

## 📅 2026-01-05 - 线稿三联画生成功能

### ✅ 新增功能: 一键生成线稿三联画

**核心功能**:
- 使用角色、场景、道具资产图作为参考
- 基于剧本的三句视觉描述生成三张线稿
- 序列生成确保一致性（第一张 → 第二张 → 第三张）
- 自动合并到竖版画布（适合 9:16 视频）

**技术实现**:
```typescript
// 多图参考 + 序列生成
const referenceImages = [characterBlob, sceneBlob, propBlob];

// 第一帧
const frame1 = await generateLineArtFrame(prompt1, referenceImages);

// 第二帧：加入第一帧作为额外参考
const frame2 = await generateLineArtFrame(prompt2, [...referenceImages, frame1Blob]);

// 第三帧：保持与前两帧一致
const frame3 = await generateLineArtFrame(prompt3, [...referenceImages, frame1Blob]);
```

**线稿风格控制**:
```typescript
const LINE_ART_MODIFIERS = [
  'lineart', 'black and white line drawing',
  'clean precise lines', 'manga storyboard style',
  'no color', 'no shading', 'white background',
  'consistent character design',
];
```

**竖版布局 (1080x1920)**:
```
┌──────────────┐
│  📖 分镜线稿   │ ← 标题
├──────────────┤
│   Shot 1     │
│  🎬 全景镜头  │
├──────────────┤
│   Shot 2     │
│  📷 中景镜头  │
├──────────────┤
│   Shot 3     │
│  🔍 特写镜头  │
└──────────────┘
```

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/lineArtTriptychService.ts` | 新增：线稿三联画生成服务 |
| `components/StoryboardBoard.tsx` | 添加线稿生成按钮和处理逻辑 |

### 使用前提

- 需要使用 **Nano-Banana** 模型（支持图生图）
- 需要关联角色/场景/道具资产
- 资产需要有已生成的图片

---

## 📅 2026-01-05 - 分镜资产关联 UI（复选框/排序）修复

### ❌ Anti-pattern: 对 props/state 数组直接调用 sort() 导致原地 mutation

- **问题现象**:
  - 资产勾选/取消后排序不稳定，出现“需要切换页面才会按绑定顺序排列”
  - 绑定顺序被意外打乱（因为 `sort()` 会修改原数组）
  - 复选框点击区域被卡片点击/详情切换吞掉，用户感觉“点击没反应”

- ✅ **Fix**:
  - 永远不要对 props/state 的数组直接 `sort()`，需要排序时用拷贝：`([...arr]).sort(...)`
  - 对“按绑定顺序展示”的场景：使用 `localRelatedAssetIds` 做乐观 UI（先更新本地顺序，再调用 `onUpdatePanelAssets` 持久化）
  - 复选框使用 `button`，并在 `pointerDown/mouseDown/click` 中 `stopPropagation()`，避免触发卡片的 `onClick`（打开详情）

- 📅 **Date**: 2026-01-05

---

## 📅 2026-01-05 - 分镜管理：一键关联 + 全局分镜序号

### ✅ 一键关联（分镜 → 资产）

- **目标**: 在右侧「📦 资产」Tab 提供「✨ 一键关联」，自动从分镜内容中匹配角色/场景/道具资产并建立关联，减少手动勾选成本。
- **实现策略（MVP）**:
  - 使用分镜文本拼接：`scene_name / active_characters_str / props / script_content / composition / visual`
  - 以“资产 name 在文本中出现的位置”作为匹配依据，按出现顺序排序
  - 防止过度关联：角色/场景/道具分别设置上限（可调）
  - UI 使用乐观更新：先更新本地 `localRelatedAssetIds` 再调用 `onUpdatePanelAssets` 持久化

### ✅ 全局分镜序号（跨脚本统一）

- **问题**: `panel_id` 是“脚本内序号”，跨卷/跨集会重复，不适合作为统一管理编号。
- **解决方案**:
  - 在 `ScriptPanel` 增加 `globalPanelNo?: number`
  - 分镜管理顶部提供「🔢 全局序号」按钮：按 `volume.order → episode_number → panel_id` 扫描全项目并连续编号
  - UI 展示：主要显示 `globalPanelNo`，并在旁边标注 `P{panel_id}` 作为脚本内定位信息

- 📅 **Date**: 2026-01-05

---

## 📅 2026-01-05 - 新增 Nano-Banana 图像生成模型

### ✅ 新增功能: nano-banana-2-2k 模型支持

**特点**:
- 支持文生图 (txt2img) 和图生图 (img2img)
- 使用 multipart/form-data 格式
- 支持多种比例和分辨率

**模型列表**:
| 模型 ID | 名称 | 说明 |
|--------|------|------|
| `nano-banana-2-2k` | Nano-Banana 2K | 2K 分辨率，推荐 |
| `nano-banana-2-4k` | Nano-Banana 4K | 4K 超高清 |
| `nano-banana-hd` | Nano-Banana HD | 高清版 4K |

**API 配置**:
```typescript
// 端点
const NANO_BANANA_API_URL = 'https://api.whatai.cc/v1/images/edits';

// 使用方法
const formData = new FormData();
formData.append('model', 'nano-banana-2');
formData.append('prompt', prompt);
formData.append('aspect_ratio', '16:9');
formData.append('image_size', '2K');  // 仅 nano-banana-2 支持
formData.append('image', referenceBlob);  // 可选，图生图
```

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/nanoBananaService.ts` | 新增：Nano-Banana 专用服务 |
| `services/geminiService.ts` | 修改：generateImage 支持 Nano-Banana |
| `components/SettingsModal.tsx` | 修改：添加模型预设 |

---

## 📅 2026-01-05 - 资产库 AI 智能提取升级（分镜 JSON + 通用资产清洗器）

### ✅ 改进目标

- 从“原文 rawText 提取资产”升级为“**分镜脚本 JSON** 提取资产”，使资产与分镜系统强绑定、可复现、可控。
- 资产 prompt 保留**独特但通用的长期设定**，把“镜头级临时细节”交给分镜/剧本提示词（例如场景资产不写天气）。

### ✅ 核心实现

1. **输入改造（结构化 JSON）**
   - 输入包含：
     - `storyboardPanels`: 全项目 panels（`active_characters_str / scene_name / props / visual / script_content` 等）
     - `existingAssets`: 已有资产的 `id/type/name`（用于避免重复创建）
     - `storyBible`: 角色设定/世界观（用于归一化命名）
     - `style`: 项目风格 prompt（用于统一画风）

2. **通用资产规则（prompt 约束）**
   - 角色：保留外观基底（发型/服装/面部特征/标志性配饰），避免情绪/动作/受伤/镜头/台词。
   - 场景：保留环境结构/材质/风格地标，**禁止天气与昼夜**等瞬态信息。
   - 道具：保留形状/材质/用途，避免“谁拿着/正在使用”等状态。

3. **资产清洗器（兜底）**
   - 对 `scene` 资产的 `prompt/description` 自动去除天气/昼夜/季节等词汇（中英双语关键词），减少资产被“镜头状态污染”的概率。

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | `handleAutoExtractAssets` 使用分镜 JSON 构建输入 + 合并去重 + 场景 prompt 清洗器 |

- 📅 **Date:** 2026-01-05

## 📅 2026-01-05 - 线稿三联画生成优化（单图三格）

### ❌ Anti-pattern: 分步生成再合并导致不连贯

**问题现象**:
- 分别生成3张线稿图，结果基本一模一样
- 角色外观、背景、道具在三张图之间不一致
- 无法呈现连贯的动作分解

**根本原因**:
```typescript
// BAD - 分别生成3张图，AI 无法保证一致性
for (let i = 0; i < 3; i++) {
  const prompt = buildShotPrompt(panel, i);
  const imageUrl = await generateImage(prompt, referenceBlobs);
  generatedImages.push(imageUrl);
}
// 然后手动合并成一张图 - 但内容已经不连贯了！
```

**解决方案**:

```typescript
// GOOD - 单次 API 调用生成包含3格的单张图
const triptychPrompt = `
  Generate a vertical 3-panel manga storyboard in a single image.
  Three sequential comic panels stacked vertically.
  
  [THREE PANELS - TOP TO BOTTOM]
  Panel 1 (Top - Wide Shot): ${visualLines[0]}
  Panel 2 (Middle - Medium Shot): ${visualLines[1]}
  Panel 3 (Bottom - Close-Up): ${visualLines[2]}
  
  IMPORTANT: 
  - Single vertical image containing all 3 panels
  - Same character design in ALL three panels
  - Consistent appearance, outfit across panels
  - Clear panel borders/dividers between the three panels
`;

const result = await generateNanoBananaImage({
  prompt: triptychPrompt,
  referenceImages,
  aspectRatio: '9:16',  // Vertical for 3 stacked panels
}, settings);
```

**关键要点**:
1. **一次调用**: 让 AI 在一张图中画出三格
2. **明确指示**: 提示词明确要求 "THREE PANELS"，"TOP TO BOTTOM"
3. **一致性强调**: 反复强调 "same character"，"consistent appearance"
4. **比例匹配**: 使用 9:16 竖版比例适合三格垂直排列

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/lineArtTriptychService.ts` | 重构：单次生成三格分镜 |
| `components/StoryboardBoard.tsx` | 修改：更新调用逻辑 |

---

## 📅 2026-01-05 - 视频轮询优化（防止 UI 闪烁）

### ❌ Anti-pattern: 轮询频繁更新导致 UI 重渲染

**问题现象**:
- 视频生成时，参考图一闪一闪频繁加载
- 轮询每 5 秒触发一次，每次都更新 panel

**根本原因**:
```typescript
// BAD - 每次轮询都更新 progress，即使值没变
if (result.progress) {
  updateGenerationStatus(generationId, 'processing', ..., result.progress);
}
// 这会触发 onUpdatePanel → panel 对象变化 → useEffect 重新执行
```

**解决方案**:

1. **Progress 缓存** - 只在值变化时更新：
```typescript
const lastProgressRef = useRef<Record<string, string>>({});

if (result.progress && result.progress !== lastProgressRef.current[generationId]) {
  lastProgressRef.current[generationId] = result.progress;
  updateGenerationStatus(...);
}
```

2. **参考图加载防重复** - 记录上次加载的 source：
```typescript
const lastLoadedSourceRef = useRef<string>('');

if (currentSourceKey === lastLoadedSourceRef.current && refImageUrl) {
  return; // 跳过重复加载
}
```

3. **稳定依赖** - 使用 key 代替数组引用：
```typescript
// BAD - 数组引用可能变化
}, [panel.videoGenerations]);

// GOOD - 只有内容变化时才触发
const generationsKey = useMemo(() => 
  gens.map(g => `${g.id}:${g.refImagePath}:${g.videoPath}`).join(','),
[panel.videoGenerations]);
}, [generationsKey]);
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `VideoGeneratorPanel.tsx` | 添加 refs 缓存，优化 effect 依赖 |

---

## 📅 2026-01-05 - 操作历史面板 & 默认设置优化

### ✅ 完成的功能

#### 1. 操作历史面板（替代 Toast 弹窗）

**改进**: 把自动弹出的 Toast 通知改为隐藏式历史面板

**特点**:
- 右下角显示 "📋 操作历史" 按钮
- 点击展开查看完整历史记录
- 按时间倒序显示（最新在前）
- 不同类型用不同颜色标识（success/error/warning/info）
- 可一键清空历史

**优势**:
- 不干扰用户操作
- 可随时查看历史记录
- 界面更简洁

#### 2. 默认设置优化

| 设置项 | 原默认值 | 新默认值 |
|--------|---------|---------|
| `veoEnhancePrompt` | `false` | `true` |
| `veoAspectRatio` | `'16:9'` | `'9:16'` |

**原因**: 
- 启用 AI 提示词优化可提高视频生成质量
- 9:16 竖屏是短视频主流格式

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | 替换 Toast 为历史面板，添加默认设置 |

---

## 📅 2026-01-05 - 提示词安全检测系统

### ✅ 新增功能: promptSafetyChecker.ts

**目的**: 检测视频生成提示词中的敏感内容，避免被 Veo/Sora 等 API 拒绝（如 `PUBLIC_ERROR_AUDIO_FILTERED`）

**检测类别**:
| 类别 | 中文示例 | 英文示例 | 建议替换 |
|------|---------|---------|---------|
| violence | 杀死、血腥 | kill, blood | 击败、红色特效 |
| weapon | 枪、爆炸 | gun, bomb | 器械、能量爆发 |
| adult | 裸露、色情 | nude, sexy | 优雅、魅力 |
| political | 国旗、军队 | flag, military | 旗帜、武者 |
| copyright | - | Disney, Marvel | 原创描述 |
| drug | 毒品 | drug, cocaine | 移除 |
| hate | 歧视 | racist | 移除 |

**风险等级**:
- `safe` ✓: 无敏感词
- `low` ⚠: 1个警告
- `medium` ⚠: 2-4个警告
- `high` ⛔: 5+警告或含高风险类别

**集成位置**: VideoGeneratorPanel.tsx
- 提示词输入时实时检测
- 智能生成后自动检测
- "一键优化" 按钮自动替换敏感词

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/promptSafetyChecker.ts` | 新增：敏感词检测服务 |
| `components/VideoGeneratorPanel.tsx` | 集成安全检测 UI |

### 最佳实践

```typescript
// 检测提示词安全性
import { checkPromptSafety, autoCleanPrompt } from '../services/promptSafetyChecker';

const result = checkPromptSafety(prompt);
if (result.riskLevel === 'high') {
  // 显示警告，建议用户修改或使用一键优化
  const cleanedPrompt = autoCleanPrompt(prompt, result.warnings);
}
```

---

## 📅 2026-01-05 - Toast 自动关闭 & 设置按钮修复

### ✅ 完成的功能

#### 1. Toast 通知 3 秒自动关闭

**问题**: App.tsx 中的 Toast 使用简单 div，没有自动关闭逻辑

**解决方案**:
- 使用 `Toast.tsx` 组件替换简单 div
- 添加 `removeLog` 函数处理 Toast 关闭
- Toast 组件自带 3 秒自动关闭 + 进度条 + 悬停暂停

```typescript
// 替换前（无自动关闭）
{logs.slice(-3).map(log => (
  <div className={`p-3 rounded-lg ...`}>{log.text}</div>
))}

// 替换后（3秒自动关闭）
{logs.slice(-3).map(log => (
  <Toast key={log.id} log={log} onClose={removeLog} />
))}
```

#### 2. 设置按钮点击行为修复

**问题**: 左下角设置按钮点击后会切换到 DASHBOARD 视图（当关闭设置时）

**解决方案**:
```typescript
// 替换前
onOpenSettings={() => setCurrentView('SETTINGS')}

// 替换后（打开模态框而不是切换视图）
onOpenSettings={() => setIsSettingsOpen(true)}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `App.tsx` | 导入 Toast 组件，添加 removeLog，修复设置按钮 |

---

## 📅 2026-01-04 - 视频生成 React 闭包问题修复

### ❌ Anti-pattern: React 异步更新 + 闭包导致状态丢失

**问题现象**:
- 视频生成成功（轮询返回 SUCCESS）
- 但 UI 不显示视频，控制台显示 `generations count: 0`

**根本原因**:
```typescript
// handleGenerate 中创建 generation 后
onUpdatePanel(panel.panel_id, { videoGenerations: [generation, ...existing] });
// ↑ 这是异步的，不会立即更新 panel.videoGenerations

// 轮询回调中使用
const existingGenerations = panel.videoGenerations || []; // ← 这是旧快照！
```

React 的 props/state 更新是**异步**的，`onUpdatePanel` 调用后，当前函数执行栈中的 `panel.videoGenerations` 仍然是旧值。轮询回调是一个闭包，它捕获的也是旧值。

### ✅ Fix: 使用 useRef 同步存储最新值

```typescript
// 1. 创建 ref 存储最新 generations
const generationsRef = useRef(panel.videoGenerations || []);

// 2. useEffect 同步更新 ref
useEffect(() => {
  generationsRef.current = panel.videoGenerations || [];
}, [panel.videoGenerations]);

// 3. 创建 generation 后立即更新 ref
const newGenerations = [generation, ...existing];
generationsRef.current = newGenerations; // ← 立即同步！
onUpdatePanel(panel.panel_id, { videoGenerations: newGenerations });

// 4. 轮询成功时从 ref 读取
const existingGenerations = generationsRef.current || []; // ← 永远是最新值
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/VideoGeneratorPanel.tsx` | 添加 generationsRef，所有写入同步更新 ref |

---

## 📅 2026-01-05 - 视频生成不显示回归（创建 generation 覆盖历史）

### ❌ Anti-pattern: 创建新 generation 时读取 props 快照（panel.videoGenerations）导致覆盖/清空历史

- **问题现象**:
  - 轮询 SUCCESS 已返回并保存了视频，但 UI 又变成“暂无视频”
  - 或历史记录突然变少/变空，导致 `latestSuccessVideo` 计算为 none

- **根本原因**:
  - `onUpdatePanel` 是异步回流，`panel.videoGenerations` 在当前 render 里可能还是旧快照
  - 在 `handleGenerate` 中用 `panel.videoGenerations || []` 拼接新数组，会把“最新历史”用旧值覆盖掉

- ✅ **Fix**:
  - 在任何需要“基于当前 generations 追加/更新”的地方，统一以 `generationsRef.current` 作为数据源
  - 视频预览/历史播放器优先使用本地 `videoPath` 对应的 ObjectURL（`historyUrls[gen.id + '_video']`），再 fallback 到远程 `videoUrl`

- 📅 **Date:** 2026-01-05

## 📅 2026-01-04 - 视频播放器 UI 优化

### ✅ 完成的功能

#### 视频预览播放器

**问题**: 视频生成完成后只显示链接，没有实际的播放器

**解决方案**:

1. **最新视频预览区域** - 在参考图下方显示
```
┌─────────────────────────────────┐
│  🎬 最新生成视频 ✓              │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │     <video controls>      │  │
│  │                           │  │
│  └───────────────────────────┘  │
│  veo3.1 · 刚刚        📥 下载   │
└─────────────────────────────────┘
```

2. **历史记录视频播放** - 替换链接为内嵌播放器
- 成功的记录显示完整视频播放器
- 带下载链接和本地保存状态

### 📁 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/VideoGeneratorPanel.tsx` | 添加视频预览区域和历史记录播放器 |

---

## 📅 2026-01-04 - 视频生成状态轮询 & API 修复

### ✅ 完成的功能

### React 状态闭包问题（关键）

- ❌ **Anti-pattern:** 在异步轮询回调中读取 `panel.videoGenerations`（props 快照），并基于旧数组更新；`onUpdatePanel` 触发的数据回流是异步的，导致轮询 SUCCESS 时 `existingGenerations` 仍为空/旧值，更新不到目标记录，UI 不显示视频。
- ✅ **Fix:** 使用 `useRef` 保存最新的 generations，并在**创建 generation 后立即同步更新 ref**；所有写入 `videoGenerations` 的地方同时更新 `generationsRef.current`，轮询回调一律使用 ref 作为数据源，避免 stale closure。
- 📅 **Date:** 2026-01-05

#### 1. API URL 修复

**问题**: `baseUrl` 配置可能包含路径（如 `/v1/chat/completions`），导致最终 URL 拼接错误

**解决方案**:
```typescript
// Clean base URL - remove path suffixes
function cleanBaseUrl(url: string): string {
  return url
    .replace(/\/v1\/.*$/, '')   // Remove /v1/... paths
    .replace(/\/v2\/.*$/, '')   // Remove /v2/... paths
    .replace(/\/$/, '');        // Remove trailing slash
}
```

#### 2. 视频生成任务状态轮询

**新增功能**: 当 API 返回 `taskId` 时，自动轮询任务状态直到完成

**API 端点**: `GET /v2/videos/generations/{task_id}`

**状态枚举**:
- `NOT_START` - 未开始
- `IN_PROGRESS` - 正在执行
- `SUCCESS` - 执行完成
- `FAILURE` - 失败

**轮询逻辑**:
```typescript
// 每 5 秒轮询一次，最多 10 分钟
const poll = async () => {
  const result = await queryVideoTask(taskId, settings);
  
  if (result.status === 'SUCCESS') {
    // 获取视频 URL，保存到本地
    updateGenerationStatus(generationId, 'success', result.data.output);
  } else if (result.status === 'FAILURE') {
    updateGenerationStatus(generationId, 'error', result.fail_reason);
  } else {
    // 继续轮询
    setTimeout(poll, 5000);
  }
};
```

**UI 增强**:
- ✅ 进度条显示（如 50%）
- ✅ 任务 ID 显示
- ✅ 动态状态更新
- ✅ 页面重载后自动恢复轮询

#### 3. VideoGeneration 类型扩展

```typescript
export interface VideoGeneration {
  // ... existing fields
  taskId?: string;   // Remote task ID for polling
  progress?: string; // e.g. "50%"
}
```

### 📁 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `services/veoService.ts` | 添加 `cleanBaseUrl`、`queryVideoTask` 函数 |
| `components/VideoGeneratorPanel.tsx` | 添加轮询逻辑、进度条 UI |
| `types.ts` | `VideoGeneration` 添加 `taskId`、`progress` 字段 |

---

## 📅 2026-01-04 - 运镜设置统一 & UI 优化

### ✅ 完成的功能

#### 1. 运镜设置统一

**问题**: VideoReferenceModal 和 VideoGeneratorPanel 中都有"运镜方式"选择器，功能重复

**解决方案**:
- ❌ 移除 `VideoReferenceModal` 中单独的"运镜方式"选择器
- ❌ 移除 `VideoGeneratorPanel` 中的"运镜方式"选择器
- ✅ 保留 `VideoReferenceModal` 中的"镜头间运镜"（composite 模式）

**设计原则**:
```
视频帧模式 (设置运镜)          视频模式 (使用运镜)
┌─────────────────┐          ┌─────────────────┐
│ 镜头间运镜设置   │    →     │ 自动读取运镜    │
│ [推进] [推进]    │  保存到   │ 生成提示词      │
│                 │  panel    │                 │
└─────────────────┘          └─────────────────┘
```

#### 2. 视频参考图来源优化

**优化逻辑**: 按优先级自动选择参考图

```typescript
// Priority order for reference image
const imageSources = [
  panel.videoRefPath,   // 1. 视频参考帧 (VideoReferenceModal 生成)
  panel.triptych,       // 2. 三连图
  panel.imagePath,      // 3. 生成的分镜图
  shotUrls[0],          // 4. 第一张镜头图 (最终 fallback)
];
```

#### 3. Toast 通知优化

**修改**: 自动关闭时间从 4 秒调整为 3 秒
- 文件: `components/Toast.tsx`
- 常量: `TOAST_DURATION = 3000`

### 📁 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `components/VideoReferenceModal.tsx` | 移除冗余运镜选择器，使用 cameraMoves[0] |
| `components/VideoGeneratorPanel.tsx` | 移除运镜选择器，优化参考图加载逻辑 |
| `components/Toast.tsx` | 调整自动关闭时间为 3 秒 |

---

## 📅 2026-01-04 - 分镜组合参考图 & 动作流程图

### ✅ 完成的功能

#### 1. 分镜组合参考图服务 (services/storyboardSketchService.ts)

**目标**: 将分镜参考图与资产参考图组合成适合图生视频的参考帧

**核心布局**:
```
┌─────────────────────────────────────────────────┐
│  🎨 资产参考区 (25%)                             │
│  [角色A] [角色B] [场景] [道具]                    │
├─────────────────────────────────────────────────┤
│  🎬 动作流程区 (55%)                             │
│  [镜头1] ──推进──▶ [镜头2] ──推进──▶ [镜头3]     │
│  带运镜箭头和动作描述                            │
├─────────────────────────────────────────────────┤
│  📝 场景信息区 (20%)                             │
│  风格 | 氛围 | 时长 | 运镜序列                   │
└─────────────────────────────────────────────────┘
```

**核心特性**:
- ✅ **资产区** - 展示角色、场景、道具参考图（保证一致性）
- ✅ **动作流程图** - 3帧分镜 + 运镜箭头（指导动作）
- ✅ **信息区** - 风格、氛围、时长标签
- ✅ **Canvas 高质量渲染** - 1920×1080，PNG 格式

**使用场景**:
- Veo 3.1 / Sora 2 等高理解能力模型
- 需要角色一致性 + 动作指引的场景

#### 2. VideoReferenceModal 布局模式

**新增两种布局模式**:
- **动作流程图** (composite) - 资产 + 动作流程 + 运镜箭头
- **标准模式** (standard) - 原有的资产 + 分镜序列布局

**新增运镜序列设置**:
- 可设置镜头1→2、镜头2→3的运镜方式
- 15种运镜选项支持

**文件清单**:
- `services/storyboardSketchService.ts` - 新建（分镜组合服务）
- `components/VideoReferenceModal.tsx` - 修改（添加布局模式选择）
- `components/VideoGeneratorPanel.tsx` - 修改（修复参考图点击问题）

---

## 📅 2026-01-04 - 视频提示词生成器优化

### ✅ 完成的功能

#### 视频提示词生成器 (services/videoPromptBuilder.ts)

**目标**: 针对不同视频生成模型（Veo、Sora、可灵、火山）优化提示词格式

**核心特性**:
- ✅ **多模型支持** - Veo 3.1、Sora 2、可灵、火山引擎
- ✅ **运镜选择** - 15种摄像机运动方式
- ✅ **智能提示词** - 根据模型自动优化格式
- ✅ **上下文提取** - 从分镜、资产、风格自动构建

**核心原则**:
```
参考图展示外观 → 提示词描述动作
[MOTION] + [CAMERA] + [STYLE] + [DURATION]
```

**模型格式差异**:

| 模型 | 格式特点 | 语言 |
|------|---------|------|
| Veo 3.1 | 长提示词，cinematic 标签 | 英文为主 |
| Sora 2 | 自然语言，场景理解强 | 英文 |
| 可灵 | 短提示词，中文运镜词 | 中文 |
| 火山 | 标签格式，结构化 | 中文 |

**运镜选项**:
```typescript
type CameraMove = 
  | 'static'      // 固定镜头
  | 'pan_left'    // 左摇
  | 'pan_right'   // 右摇
  | 'zoom_in'     // 推进
  | 'zoom_out'    // 拉远
  | 'dolly_in'    // 推轨
  | 'orbit_left'  // 左环绕
  | 'follow'      // 跟随
  | 'handheld';   // 手持
```

**文件清单**:
- `services/videoPromptBuilder.ts` - 新建（视频提示词生成器）
- `types.ts` - 修改（添加 VeoModel 扩展、CameraMove 类型）
- `components/VideoGeneratorPanel.tsx` - 修改（集成新生成器、运镜选择器）
- `components/VideoReferenceModal.tsx` - 修改（集成新生成器、模型选择）

**使用示例**:
```typescript
import { buildVideoPrompt, buildPromptConfigFromPanel } from './services/videoPromptBuilder';

// 从面板上下文构建配置
const config = buildPromptConfigFromPanel(panel, project, settings, 'zoom_in');

// 生成针对特定模型优化的提示词
const prompt = buildVideoPrompt(config);
```

---

## 📅 2026-01-04 - V3 架构桥接层 & 渐进式迁移系统

### ✅ 完成的功能

#### 1. 桥接层系统 (bridge/)

**目标**: 实现旧系统与 V3 架构的无缝协作，支持渐进式迁移

**核心文件**:
- `bridge/LegacyAdapter.ts` - 类型适配器（旧任务 ↔️ TaskEntity）
- `bridge/TaskBridge.ts` - 任务系统桥接服务
- `bridge/index.ts` - 统一导出

**LegacyAdapter 功能**:
- ✅ 双向类型转换（LegacyTask ↔️ TaskEntity）
- ✅ 状态映射（6 种旧状态 → 7 种 V3 状态）
- ✅ 批量转换支持
- ✅ 数据验证和一致性检查
- ✅ 调试工具（compareTaskVersions）

**TaskBridge 功能**:
- ✅ 统一任务接口（自动选择新旧系统）
- ✅ 功能开关控制（useV3System）
- ✅ 双系统同步（enableSync）
- ✅ 数据迁移工具（migrateLegacyTasks）
- ✅ 一致性验证（validateSync）
- ✅ 调试模式和统计信息

**使用示例**:
```typescript
// 初始化桥接
const bridge = new TaskBridge({
  useV3System: FEATURES.USE_V3_TASK_SYSTEM,
  enableSync: true,
  debugMode: true,
});

// 创建任务（自动选择系统）
const taskId = await bridge.createTask({
  type: 'image',
  params: { source: 'gemini' }
});

// 查询任务（统一接口）
const task = await bridge.getTaskStatus(taskId);
```

#### 2. 功能开关系统 (config.ts)

**目标**: 通过配置控制 V3 功能的启用/禁用，支持灵活的迁移节奏

**核心组件**:
- `FeatureFlags` - 功能开关接口（15+ 个开关）
- `FeatureManager` - 功能管理器
- `MigrationConfig` - 迁移阶段配置
- `PerformanceConfig` - 性能参数

**功能开关列表**:
```typescript
{
  USE_V3_TASK_SYSTEM: false,      // V3 任务系统
  USE_V3_GALLERY: false,          // V3 资产管理
  USE_V3_VIDEO_REFERENCE: false,  // V3 视频参考图
  USE_V3_DATABASE: false,         // RxDB 数据库
  USE_V3_STORAGE: false,          // OPFS 存储
  ENABLE_LEGACY_SYNC: false,      // 双系统同步
  DEBUG_V3_MIGRATION: true,       // 调试模式
  // ... 更多
}
```

**FeatureManager 方法**:
- `isEnabled(feature)` - 检查功能状态
- `enable(feature)` / `disable(feature)` - 控制功能
- `toggle(feature)` - 切换功能
- `configureForPhase(phase)` - 按迁移阶段自动配置

**迁移阶段配置**:
```typescript
// Phase 1: 准备阶段
configureForPhase('preparation');  // 只启用调试

// Phase 2: 共存阶段
configureForPhase('coexistence');  // 启用部分 V3 + 同步

// Phase 3: 迁移阶段
configureForPhase('migration');    // 大规模启用 V3

// Phase 4: 完成阶段
configureForPhase('complete');     // 全面 V3，禁用旧系统
```

#### 3. TypeScript 路径映射

**配置 tsconfig.json**:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@v3/*": ["src/*"],           // V3 模块
      "@legacy/*": ["./*"],         // 旧代码
      "@bridge/*": ["bridge/*"]     // 桥接层
    }
  }
}
```

**使用示例**:
```typescript
// 导入 V3 模块
import { TaskEntity } from '@v3/modules/pipeline/domain/TaskEntity';

// 导入桥接层
import { TaskBridge } from '@bridge/TaskBridge';

// 导入旧代码
import { geminiService } from '@legacy/services/geminiService';
```

#### 4. 迁移计划文档 (MIGRATION.md)

**内容概览**:
- 📊 **当前状态分析** - 双系统架构图
- 🎯 **迁移目标** - 架构和业务目标
- 🔄 **四阶段路线图** - 详细实施计划
- 📅 **时间表** - 8 周完整计划
- 🔧 **技术细节** - 代码示例和最佳实践
- 📊 **风险管理** - 风险识别和缓解策略
- ✅ **验收标准** - 每个阶段的交付物

**四阶段迁移策略**:
1. **Phase 1: 准备阶段（1 周）** ✅ 80% 完成
   - 创建桥接层
   - 功能开关系统
   - TypeScript 配置

2. **Phase 2: 共存阶段（2-3 周）** 🎯 下一步
   - 迁移视频参考图到 V3
   - 迁移任务管理系统
   - 迁移资产管理

3. **Phase 3: 迁移阶段（3-4 周）**
   - 存储层迁移（IndexedDB → OPFS）
   - 状态管理迁移（React State → Zustand + RxDB）
   - 核心业务逻辑迁移

4. **Phase 4: 完成阶段（1 周）**
   - 清理旧代码
   - 性能优化
   - 文档完善

**关键策略**:
- 🔗 **桥接层** - 让新旧系统无缝协作
- 🎛️ **功能开关** - 灵活控制迁移节奏
- 🔄 **双系统同步** - 保证数据一致性
- 📊 **监控和回滚** - 快速响应问题

---

## 📅 2026-01-04 - 视频参考图合成系统 & TaskEntity V3.0 升级

### ✅ 完成的功能

#### 1. TaskEntity 架构升级 (src/modules/pipeline/)

**升级内容**:
- 新增 `Cancelled` 状态和取消任务功能
- 集成领域事件系统（7种事件类型）
- 添加 RxDB Schema 定义（TASK_SCHEMA）
- 增强验证机制（优先级、参数、JSON 序列化检查）
- 新增 12+ 个业务方法（submit, cancel, clone, getProgressPercentage 等）
- 改进错误处理（支持 Error 对象和字符串）

**文件清单**:
- `src/modules/pipeline/domain/TaskEntity.ts` - 升级到 849 行（原 441 行）
- `src/modules/pipeline/infrastructure/TaskRepository.ts` - 新建（425 行）
- `src/modules/pipeline/infrastructure/TaskQueue.ts` - 新建（492 行）
- `src/modules/pipeline/README.md` - 新建（完整使用文档）
- `src/modules/pipeline/UPGRADE_SUMMARY.md` - 新建（升级总结）
- `src/modules/pipeline/ARCHITECTURE_DIAGRAM.md` - 新建（架构图）
- `src/modules/pipeline/index.ts` - 新建（统一导出）

**核心改进**:
1. **领域事件系统** - 所有状态变化自动发布事件
2. **取消任务** - 支持取消执行中的任务
3. **故障恢复** - 自动检测和恢复僵尸任务
4. **响应式订阅** - 基于 RxDB 的实时数据流
5. **不可变性** - 所有修改返回新实例

#### 2. 视频参考图合成系统

**功能描述**:
将分镜图 + 资产参考图合成为适合图生视频的高质量参考帧，支持 Runway Gen-3、Pika 1.5、PixVerse 等主流模型。

**核心特性**:
- ✅ **资产优先布局** - 角色/场景/道具参考置顶（占 30% 高度）
- ✅ **详细文字标注** - 资产卡片带名称、类型、关键特征
- ✅ **分镜序列** - 1-3 个关键帧，显示运镜逻辑
- ✅ **剧情说明** - 底部叠加层显示剧情概述
- ✅ **高质量渲染** - Canvas API，1920x1080，PNG 格式
- ✅ **一键合成** - UI 集成，自动下载

**文件清单**:
- `types.ts` - 添加 `VideoReferenceConfig` 和 `VideoReferenceFrame` 类型
- `services/videoReferenceComposer.ts` - 新建（核心合成服务）
- `components/StoryboardBoard.tsx` - 修改（UI 集成）
- `VIDEO_REFERENCE_GUIDE.md` - 新建（使用指南）

**实现细节**:
1. **Canvas 高质量渲染** - `imageSmoothingQuality: 'high'`
2. **圆角卡片** - `roundRect()` 辅助函数
3. **自动缩放** - 保持图片宽高比
4. **错误降级** - 图片加载失败显示占位符
5. **内存管理** - `URL.revokeObjectURL()` 自动释放

**布局方案**:
```
┌─────────────────────────────────────┐
│ 资产参考区 (30%) - 置顶高亮          │
│ [角色] [场景] [道具] - 带标注        │
├─────────────────────────────────────┤
│ 分镜序列区 (55%)                    │
│ [镜头1] [镜头2] [镜头3]             │
│  标注构图、时长                      │
├─────────────────────────────────────┤
│ 剧情说明区 (15%)                    │
│ 文字概述                             │
└─────────────────────────────────────┘
```

---

---

## 🚫 Anti-Patterns

### 架构迁移相关

#### ❌ Anti-pattern: 大爆炸式重写
```typescript
// BAD - 一次性删除所有旧代码，重写整个系统
rm -rf services/ components/
// 风险极高，无法回滚！
```

#### ✅ Fix: 渐进式迁移 + 桥接层
```typescript
// GOOD - 使用桥接层让新旧系统共存
import { TaskBridge } from '@bridge/TaskBridge';

const bridge = new TaskBridge({
  useV3System: FEATURES.USE_V3_TASK_SYSTEM,  // 功能开关控制
  enableSync: true,                          // 双系统同步
});

// 统一接口，自动选择系统
const taskId = await bridge.createTask(params);
```
📅 **Date**: 2026-01-04

#### ❌ Anti-pattern: 硬编码系统选择
```typescript
// BAD - 硬编码使用哪个系统
if (process.env.USE_V3) {
  // V3 代码
} else {
  // 旧代码
}
```

#### ✅ Fix: 功能开关 + 运行时配置
```typescript
// GOOD - 使用功能开关系统
import { FeatureManager } from './config';

if (FeatureManager.isEnabled('USE_V3_TASK_SYSTEM')) {
  // V3 代码
} else {
  // 旧代码
}

// 可在运行时切换
FeatureManager.enable('USE_V3_TASK_SYSTEM');
```
📅 **Date**: 2026-01-04

#### ❌ Anti-pattern: 忽略数据一致性
```typescript
// BAD - 双系统运行但不同步数据
await v3TaskQueue.enqueue(task);
// 旧系统不知道这个任务！
```

#### ✅ Fix: 启用双系统同步
```typescript
// GOOD - 自动同步到两个系统
const bridge = new TaskBridge({
  useV3System: true,
  enableSync: true,  // 关键！
});

await bridge.createTask(params);
// 自动同步到旧系统

// 定期验证一致性
const validation = await bridge.validateSync();
if (!validation.consistent) {
  console.error('数据不一致', validation.differences);
}
```
📅 **Date**: 2026-01-04

### 类型适配相关

#### ❌ Anti-pattern: 强制类型转换
```typescript
// BAD - 直接强转，丢失类型信息
const v3Task = legacyTask as any as TaskEntity;
```

#### ✅ Fix: 使用适配器模式
```typescript
// GOOD - 通过适配器转换
import { LegacyAdapter } from '@bridge/LegacyAdapter';

const v3Task = LegacyAdapter.fromLegacyTask(legacyTask);

// 验证转换结果
if (!LegacyAdapter.canConvertToLegacy(v3Task)) {
  throw new Error('Invalid task conversion');
}
```
📅 **Date**: 2026-01-04

### Canvas 相关

#### ❌ Anti-pattern: 忘记释放 ObjectURL
```typescript
// BAD
const url = URL.createObjectURL(blob);
img.src = url;
// 内存泄漏！
```

#### ✅ Fix: 使用后立即释放
```typescript
// GOOD
const url = URL.createObjectURL(blob);
img.src = url;
URL.revokeObjectURL(url);
```

#### ❌ Anti-pattern: 直接修改 Canvas 上下文状态
```typescript
// BAD
ctx.clip();
ctx.drawImage(img, x, y);
// 裁剪状态污染后续绘制
```

#### ✅ Fix: 使用 save/restore
```typescript
// GOOD
ctx.save();
ctx.clip();
ctx.drawImage(img, x, y);
ctx.restore();
```

### TypeScript 类型相关

#### ❌ Anti-pattern: 使用 any 类型
```typescript
// BAD
const StoryboardRow: React.FC<any> = ({ ... }) => { }
```

#### ✅ Fix: 定义完整接口
```typescript
// GOOD
interface StoryboardRowProps {
  item: { vol: Volume; script: WebtoonScript; panel: ScriptPanel };
  isSelected: boolean;
  onToggleSelection: () => void;
  // ... 其他属性
}
const StoryboardRow: React.FC<StoryboardRowProps> = ({ ... }) => { }
```

### React Hook 相关

#### ❌ Anti-pattern: useCallback 缺少依赖项
```typescript
// BAD
const handleClick = useCallback(() => {
  console.log(someValue); // someValue 未在依赖项中
}, []);
```

#### ✅ Fix: 完整的依赖项列表
```typescript
// GOOD
const handleClick = useCallback(() => {
  console.log(someValue);
}, [someValue]);
```

### CSS 包含块与模态框相关

#### ❌ Anti-pattern: 在有 transform 的容器内使用 fixed 定位模态框
```typescript
// BAD - 模态框在有 transform 属性的父容器内，fixed 定位失效
const InspectorPanel = () => (
  // 父容器有 transition-transform 和 translate-x-*
  <aside className="transition-transform translate-x-0">
    <TriptychGenerator>
      {/* 模态框在这里渲染，fixed 定位相对于父容器而非视口 */}
      <VideoReferenceModal />  {/* 被限制在侧边栏内！ */}
    </TriptychGenerator>
  </aside>
);
```

#### ✅ Fix: 使用 React Portal 渲染到 document.body
```typescript
// GOOD - 使用 createPortal 绕过父容器的包含块限制
import { createPortal } from 'react-dom';

const VideoReferenceModal = ({ isOpen }) => {
  if (!isOpen) return null;
  
  // Portal 将模态框渲染到 body，完全脱离父容器
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/85">
      {/* 模态框内容 */}
    </div>,
    document.body
  );
};
```
📅 **Date**: 2026-01-04

### React Props 传递相关

#### ❌ Anti-pattern: Props 解构遗漏
```typescript
// BAD - 类型定义包含 onUpdatePanel，但解构时遗漏
const InspectorPanel: React.FC<{
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
  // ...其他 props
}> = ({ 
  onClose, onGenerateAssetImage, onUpdateTriptych, onUpdatePanelAssets,
  // onUpdatePanel 遗漏了！
}) => {
  // 然后使用了未定义的 handleUpdatePanel
  return <PanelInspectorContent onUpdatePanel={handleUpdatePanel} />
  // ReferenceError: handleUpdatePanel is not defined
};
```

#### ✅ Fix: 确保 props 解构与类型定义一致
```typescript
// GOOD - 解构时包含所有需要的 props
const InspectorPanel: React.FC<{
  onUpdatePanel: (panelId: number, updates: Partial<ScriptPanel>) => void;
  // ...其他 props
}> = ({ 
  onClose, onGenerateAssetImage, onUpdateTriptych, onUpdatePanel, onUpdatePanelAssets,
  // ✅ 包含 onUpdatePanel
}) => {
  // 使用从 props 解构的 onUpdatePanel
  return <PanelInspectorContent onUpdatePanel={onUpdatePanel} />
};

// 调用组件时也要传递该 prop
<InspectorPanel
  onUpdatePanel={handleUpdatePanel}  // ✅ 传递 prop
  // ...其他 props
/>
```
📅 **Date**: 2026-01-04

### 文件系统 API

#### ❌ Anti-pattern: 未检查 FileSystemDirectoryHandle
```typescript
// BAD
await saveImageToAssets(blob, filename, projectDirHandle);
// projectDirHandle 可能是 undefined
```

#### ✅ Fix: 添加检查
```typescript
// GOOD
if (!projectDirHandle) {
  alert('⚠️ 需要项目文件句柄才能保存');
  return;
}
await saveImageToAssets(blob, filename, projectDirHandle);
```

---

## 💡 最佳实践

### 0. 渐进式迁移策略

#### 使用桥接层实现平滑过渡
```typescript
// Step 1: 初始化桥接
import { TaskBridge } from '@bridge/TaskBridge';
import { FeatureManager } from './config';

const bridge = new TaskBridge({
  useV3System: FeatureManager.isEnabled('USE_V3_TASK_SYSTEM'),
  enableSync: FeatureManager.isEnabled('ENABLE_LEGACY_SYNC'),
  debugMode: FeatureManager.isEnabled('DEBUG_V3_MIGRATION'),
  legacyTaskService: projectStateManager,
  v3TaskQueue: taskQueue,
});

// Step 2: 统一接口调用
const taskId = await bridge.createTask({
  type: 'image',
  params: { source: 'gemini', model: 'flux' },
  priority: 80,
});

// Step 3: 根据迁移阶段调整配置
FeatureManager.configureForPhase('coexistence');
```
📅 **Date**: 2026-01-04

#### 功能开关最佳实践
```typescript
// 1. 按模块独立控制
if (FeatureManager.isEnabled('USE_V3_VIDEO_REFERENCE')) {
  // 使用 V3 视频参考图服务
  const useCase = new ComposeVideoReferenceUseCase(...);
  await useCase.execute(panels, assets);
} else {
  // 使用旧版本
  await composeVideoReference(panels, assets, config, dirHandle);
}

// 2. 监控错误率，自动回滚
let errorCount = 0;
let totalCount = 0;

try {
  await bridge.createTask(params);
  totalCount++;
} catch (error) {
  errorCount++;
  totalCount++;
  
  const errorRate = errorCount / totalCount;
  if (errorRate > 0.1) {  // 10% 错误率
    FeatureManager.disable('USE_V3_TASK_SYSTEM');
    console.error('Auto-rollback triggered');
  }
}

// 3. 验证数据一致性
const validation = await bridge.validateSync();
if (!validation.consistent) {
  console.error('Data inconsistency detected:', validation.differences);
  // 触发告警或自动修复
}
```
📅 **Date**: 2026-01-04

#### 数据迁移最佳实践
```typescript
// 1. 批量迁移旧任务到 V3
async function migrateAllTasks() {
  const legacyTasks = await projectStateManager.getAllTasks();
  
  let successCount = 0;
  let failedCount = 0;
  
  for (const legacyTask of legacyTasks) {
    try {
      const v3Task = LegacyAdapter.fromLegacyTask(legacyTask);
      await taskQueue.enqueue(v3Task);
      successCount++;
    } catch (error) {
      console.error('Migration failed for task', legacyTask.id, error);
      failedCount++;
    }
  }
  
  console.log(`Migration complete: ${successCount} success, ${failedCount} failed`);
}

// 2. 增量迁移（只迁移活跃任务）
async function migrateActiveTasks() {
  const activeTasks = await projectStateManager.getActiveTasks();
  await bridge.migrateLegacyTasks(activeTasks.map(t => t.id));
}
```
📅 **Date**: 2026-01-04

### 1. Canvas 渲染优化

```typescript
// 设置高质量渲染
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

// 使用渐变背景提升视觉效果
const gradient = ctx.createLinearGradient(0, 0, 0, height);
gradient.addColorStop(0, '#0a0a0a');
gradient.addColorStop(1, '#1a1a1a');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, width, height);
```

### 2. 异步图片加载

```typescript
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 处理跨域
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

### 3. React 状态管理

```typescript
// 使用 Set 管理选择状态
const [selectedPanelIds, setSelectedPanelIds] = useState<Set<number>>(new Set());

// 切换选择
const handleToggle = useCallback((id: number) => {
  setSelectedPanelIds(prev => {
    const newSet = new Set(prev);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    return newSet;
  });
}, []);
```

### 4. 文字处理

```typescript
// 文字截断（避免溢出）
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const ellipsis = '...';
  let width = ctx.measureText(text).width;
  
  if (width <= maxWidth) return text;
  
  while (width > maxWidth - ctx.measureText(ellipsis).width && text.length > 0) {
    text = text.slice(0, -1);
    width = ctx.measureText(text).width;
  }
  
  return text + ellipsis;
}

// 文字换行
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let currentLine = '';
  
  for (const char of text) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  
  return lines;
}
```

### 5. 错误处理和降级

```typescript
// 图片加载失败时显示占位符
try {
  const imageUrl = await loadAssetImage(asset.imagePath, projectDirHandle);
  const img = await loadImage(imageUrl);
  ctx.drawImage(img, x, y, width, height);
} catch (error) {
  // 降级：绘制占位符
  drawPlaceholder(ctx, x, y, width, height, asset.type);
}
```

---

## 📐 架构决策

### 1. 为什么选择 Canvas API 而非 SVG？

**决策**: 使用 Canvas API 进行视频参考图渲染

**理由**:
- ✅ 更好的像素级控制
- ✅ 高性能位图渲染
- ✅ 原生支持图片混合和滤镜
- ✅ 直接导出 PNG/JPEG
- ⚠️ SVG 更适合矢量图形和交互式元素

### 2. 为什么资产参考置顶？

**决策**: 将资产参考区放在顶部（占 30% 高度）

**理由**:
- ✅ 符合视觉优先级（角色一致性最重要）
- ✅ 图生视频模型通常从上到下解析
- ✅ 参考信息先于运镜指示
- ✅ 用户测试反馈更直观

### 3. 为什么使用 Set 管理选择状态？

**决策**: 使用 `Set<number>` 而非 `number[]`

**理由**:
- ✅ O(1) 查找性能
- ✅ 自动去重
- ✅ 更语义化的 API（add, delete, has）
- ⚠️ 需要转换为数组才能映射

### 4. TaskEntity 为什么使用不可变性？

**决策**: 所有修改操作返回新实例

**理由**:
- ✅ 避免意外修改
- ✅ 简化调试（状态快照）
- ✅ 支持撤销/重做
- ✅ 符合函数式编程原则
- ✅ 便于实现时间旅行调试

---

## 🔄 迁移指南

### 从旧版 TaskEntity 迁移

如果你有旧版本的任务数据：

```typescript
// 旧代码
task.status = 'completed';
task.resultPath = '/result.png';
await saveTask(task);

// 新代码（不可变）
const completedTask = task.markAsCompleted('/result.png');
await taskRepo.save(completedTask);
```

### 添加视频参考图功能到 App.tsx

在 `App.tsx` 中传递 `projectDirHandle` 给 StoryboardBoard：

```typescript
<StoryboardBoard
  project={project}
  settings={settings}
  // ... 其他 props
  projectDirHandle={projectDirHandle}  // ← 添加这一行
  onTaskStart={handleTaskStart}
  onTaskFinish={handleTaskFinish}
/>
```

---

## 📊 性能优化记录

### Canvas 渲染优化

- ✅ 使用 `imageSmoothingQuality: 'high'` 提升质量
- ✅ 批量绘制减少状态切换
- ✅ 异步加载图片避免阻塞
- ✅ 使用 OffscreenCanvas（如果支持）

### 内存管理

- ✅ 及时释放 ObjectURL
- ✅ 图片加载后清理临时数据
- ✅ 使用 WeakMap 缓存图片资源

---

## 🐛 已知问题

### 1. StoryboardRow 缺少完整类型定义

**问题**: 当前使用 `React.FC<any>`

**影响**: 缺少类型安全

**计划**: 后续定义完整的 `StoryboardRowProps` 接口

**优先级**: Medium

### 2. 复选框样式在某些浏览器不一致

**问题**: 原生 checkbox 样式跨浏览器差异

**临时方案**: 使用 Tailwind 基础样式

**计划**: 考虑自定义 checkbox 组件

**优先级**: Low

---

## 📝 待办事项

### 短期（本周）
- [ ] 在 App.tsx 中传递 projectDirHandle 参数
- [ ] 测试视频参考图合成功能
- [ ] 完善 StoryboardRow 类型定义

### 中期（本月）
- [ ] 实现 TaskEntity Presentation 层组件
- [ ] 集成 SharedWorker 执行器
- [ ] 编写单元测试

### 长期（季度）
- [ ] 支持自定义视频参考图模板
- [ ] 支持批量生成
- [ ] 支持导出不同比例（9:16, 1:1）

---

## 🎓 经验总结

### 1. Canvas 开发技巧

- 始终使用 `save()/restore()` 保护上下文状态
- 提前计算布局，避免重复计算
- 使用辅助函数（roundRect, truncateText）提升代码复用
- 测量文字宽度使用 `measureText()`

### 2. React 开发技巧

- 使用 `useCallback` 优化事件处理器
- 复杂状态考虑使用 `useReducer`
- 大列表使用虚拟化（@tanstack/react-virtual）
- 及时清理副作用（useEffect cleanup）

### 3. TypeScript 开发技巧

- 优先使用 `interface` 而非 `type`（可扩展）
- 善用 `Pick` 和 `Omit` 工具类型
- 避免使用 `any`，改用 `unknown` 后类型守卫
- 使用 `as const` 创建常量对象

### 4. 文件系统 API

- 始终检查权限和句柄有效性
- 使用 try-catch 处理权限错误
- 提供友好的错误提示
- 考虑降级方案（下载链接）

---



---

## 🤖 智能体工作逻辑 (Agent Workflow)

### 1. 飞轮循环 (Flywheel Pattern)

每次任务执行遵循以下飞轮模式，确保持续改进：

```
┌─────────────────────────────────────────────────────────┐
│                    🔄 飞轮循环                           │
│                                                          │
│   ① 输入 ──→ ② 分析 ──→ ③ 执行 ──→ ④ 验证              │
│      ↑                                      │            │
│      │        ⑥ 优化                       │            │
│      │           ↑                          ↓            │
│      └───── ⑦ 反馈 ←──── ⑤ 记录 ←─────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

| 阶段 | 动作 | 输出 |
|------|------|------|
| ① 输入 | 接收用户指令 | 明确的任务目标 |
| ② 分析 | 理解意图，拆解子任务 | TODO 列表 |
| ③ 执行 | 实施代码修改 | 代码变更 |
| ④ 验证 | 运行 `npm run build` | 构建结果 |
| ⑤ 记录 | 更新 Memory Bank | Anti-pattern/最佳实践 |
| ⑥ 优化 | 根据记录改进策略 | 更高效的执行 |
| ⑦ 反馈 | 返回给用户确认 | 完成报告 |

**关键原则**：
- 每次循环都积累经验到 Memory Bank
- 错误不重复，遇到即记录
- 验证必须通过才能继续

---

### 2. 验证逻辑 (Validation Logic)

#### 2.1 三级验证体系

```typescript
// Level 1: 静态验证（每次修改后）
npm run build          // TypeScript 编译
npm run lint           // ESLint 检查

// Level 2: 运行时验证（功能完成后）
// - 浏览器控制台无错误
// - React DevTools 无警告
// - 功能按预期工作

// Level 3: 集成验证（Phase 完成后）
// - 多标签页同步正常
// - 数据持久化正确
// - 性能无明显退化
```

#### 2.2 验证检查清单

每次代码修改后**必须**执行：

- [ ] `npm run build` 通过（无编译错误）
- [ ] 无 TypeScript `any` 类型泄漏
- [ ] 无内联 `style` 属性
- [ ] Hooks 依赖项完整（无 ESLint 警告）
- [ ] 新增功能有对应的类型定义

#### 2.3 失败处理流程

```
验证失败？
    │
    ├── 编译错误 ──→ 1. 读取错误信息
    │                2. 定位问题文件/行号
    │                3. 修复代码
    │                4. 记录 Anti-pattern
    │                5. 重新验证
    │
    ├── 运行时错误 ──→ 1. 查看控制台堆栈
    │                  2. 分析错误根因
    │                  3. 修复并添加错误处理
    │                  4. 更新 Memory Bank
    │
    └── 逻辑错误 ──→ 1. 回顾需求理解
                     2. 检查实现逻辑
                     3. 调整代码
                     4. 补充注释
```

---

### 3. 自我纠错机制 (Self-Correction)

#### 3.1 触发条件

以下情况**必须**触发自我纠错并更新 Memory Bank：

| 错误类型 | 示例 | 记录位置 |
|---------|------|---------|
| TypeScript 编译错误 | `Property 'x' does not exist on type 'Y'` | Anti-Patterns |
| React Hook 违规 | `Hooks can only be called inside...` | Anti-Patterns |
| 状态更新失效 | `setState` 后值未变化 | Anti-Patterns |
| 类型混淆 | `string` vs `number` key | Anti-Patterns |
| 路径错误 | 修改了 worktree 而非主目录 | Anti-Patterns |
| 重复相同错误 | 连续 2 次犯同类错误 | Anti-Patterns + 高优先级标记 |

#### 3.2 纠错流程

```
检测到错误
    │
    ├── Step 1: 停止当前操作
    │
    ├── Step 2: 分析错误根因
    │           - 是什么？（错误描述）
    │           - 为什么？（根本原因）
    │           - 怎么避免？（预防措施）
    │
    ├── Step 3: 记录到 Memory Bank
    │           格式：
    │           ### {错误类别}
    │           - ❌ **Anti-pattern:** {错误描述}
    │           - ✅ **Fix:** {正确做法}
    │           - 📅 **Date:** {日期}
    │
    ├── Step 4: 应用修复
    │
    └── Step 5: 验证修复成功
```

#### 3.3 经验积累规则

**何时添加到 Memory Bank**

✅ **应该记录**：
- 首次遇到的错误模式
- 花费 > 5 分钟解决的问题
- 需要查阅文档才能解决的问题
- 跨多个文件影响的修改
- 用户明确说"记住这个"

❌ **不需要记录**：
- 简单的拼写错误
- 一眼就能发现的语法问题
- 已经记录过的相同错误

---

### 4. 任务执行清单 (Task Execution Checklist)

#### 4.1 任务开始前

- [ ] 阅读 CLAUDE.md Memory Bank（检查相关 Anti-patterns）
- [ ] 确认当前工作目录是主项目而非 worktree
- [ ] 理解任务目标，必要时向用户确认
- [ ] 创建 TODO 列表（复杂任务）

#### 4.2 任务执行中

- [ ] 每个子任务完成后运行 `npm run build`
- [ ] 发现新问题立即记录
- [ ] 保持代码风格一致（遵循 `.cursorrules`）
- [ ] 大改动前备份/确认

#### 4.3 任务完成后

- [ ] 最终 `npm run build` 验证
- [ ] 总结本次修改内容
- [ ] 如有新发现，更新 Memory Bank
- [ ] 更新版本号和时间戳

---

### 5. Worktree 问题处理 (⚠️ 重要)

#### 5.1 问题识别

Cursor 可能自动创建 worktree，导致：
- 修改的文件在 `~/.cursor/worktrees/` 而非主目录
- UI 不更新
- 文件"丢失"

#### 5.2 预防措施

```bash
# 检查当前路径
pwd

# 正确路径应该是项目主目录：
<项目根目录>

# 错误路径示例：
~/.cursor/worktrees/AIComicDramas4.0/xxx
```

#### 5.3 修复方案

```bash
# 1. 清理所有 worktrees
rm -rf ~/.cursor/worktrees/AIComicDramas4.0

# 2. 重新打开项目（从主目录）
cursor <项目根目录>

# 3. 使用终端命令直接操作主目录（绕过 Cursor 文件系统）
cd <项目根目录>
# 直接使用 cat/cp 等命令操作文件
```

---

### 6. 长任务中断恢复

如果任务被中断（用户离开、网络问题等）：

#### 6.1 保存当前进度

```markdown
## 🚧 未完成任务 - {日期}

**任务描述**: {简要描述}

**已完成**:
- [x] 子任务 1
- [x] 子任务 2

**待完成**:
- [ ] 子任务 3
- [ ] 子任务 4

**当前状态**: {最后修改的文件和内容}

**恢复指令**: {用户下次可以说什么来继续}
```

#### 6.2 恢复任务

当用户返回时：
1. 读取 Memory Bank 中的未完成任务
2. 确认是否继续
3. 从中断点恢复执行

---

### 7. 质量标准 (Quality Gates)

#### 7.1 代码质量门禁

```
┌────────────────────────────────────────────────────┐
│                   质量门禁                          │
├────────────────────────────────────────────────────┤
│ Gate 1: 编译通过     → npm run build 零错误        │
│ Gate 2: 类型安全     → 无 any 类型泄漏             │
│ Gate 3: 代码规范     → npm run lint 零警告         │
│ Gate 4: 样式规范     → 无内联 style                │
│ Gate 5: 依赖完整     → Hooks 依赖项完整            │
└────────────────────────────────────────────────────┘
```

#### 7.2 每日复盘

任务结束时回顾：
- 🎯 完成了什么？
- 🐛 遇到了什么问题？
- 💡 学到了什么？
- 📝 需要记录什么到 Memory Bank？

---

### 8. 提示词模板 (Prompt Templates)

#### 8.1 用户请求分析模板

```markdown
**用户请求**: {原始请求}

**意图分析**:
- 核心目标: {1句话总结}
- 影响范围: {涉及哪些文件/模块}
- 预估复杂度: {简单/中等/复杂}

**拆解子任务**:
1. [ ] {子任务1}
2. [ ] {子任务2}
3. [ ] ...

**潜在风险**:
- {风险1}
- {风险2}
```

#### 8.2 完成报告模板

```markdown
**任务完成报告**

✅ **已完成**:
- {完成项1}
- {完成项2}

📁 **修改的文件**:
- `{file1}`: {改动说明}
- `{file2}`: {改动说明}

🧪 **验证结果**:
- `npm run build`: ✅ 通过
- 功能测试: ✅ 通过

📝 **注意事项**:
- {注意项1}

🔜 **后续建议**:
- {建议1}
```

---

## 🔗 相关资源

- [TaskEntity 设计文档](src/modules/pipeline/README.md)
- [视频参考图使用指南](VIDEO_REFERENCE_GUIDE.md)
- [架构升级总结](src/modules/pipeline/UPGRADE_SUMMARY.md)
- [架构图](src/modules/pipeline/ARCHITECTURE_DIAGRAM.md)

---

**最后更新**: 2026-01-07  
**更新人**: AI Assistant  
**版本**: v2.2 (绘图页收敛 + 参考图回填为分镜图)

