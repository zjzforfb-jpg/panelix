# Shot 结构化数据指南 (PanelShot Schema Guide)

本文档介绍 Panelix V3.0 中引入的 **Panel Shot 结构化数据系统**，用于提升分镜三连图生成的一致性和可控性。

---

## 目录

1. [概述](#概述)
2. [数据结构](#数据结构)
3. [字段详解](#字段详解)
4. [使用流程](#使用流程)
5. [最佳实践](#最佳实践)
6. [常见漂移问题与排查](#常见漂移问题与排查)
7. [降级策略](#降级策略)

---

## 概述

### 为什么需要结构化 Shots？

原有的分镜系统使用 `▲` 开头的三行文本作为三张分镜图的生成提示词。这种方式存在以下问题：

1. **资产绑定模糊**：无法明确指定每个镜头使用哪些角色/场景资产
2. **镜头参数缺失**：景别、构图、光影等信息散落在文本中，难以提取
3. **一致性难保证**：三张图独立生成，角色外观容易漂移

**结构化 Shots** 通过为每个分镜的三个镜头提供独立的结构化数据，解决上述问题：

- 每个 shot 明确绑定 `characterAssetIds`、`sceneAssetId`、`propAssetIds`
- 每个 shot 独立配置 `shotSize`（景别）、`composition`（构图）、`camera`（机位）、`light`（光影）
- 绘图页根据 shot 数据自动构建参考图锚点，提升一致性

---

## 数据结构

### ShotSize (景别)

```typescript
type ShotSize = 'WS' | 'MS' | 'CU';
```

| 值 | 含义 | 典型用途 |
|----|------|---------|
| `WS` | Wide Shot (全景/远景) | 建立场景，展示环境和角色位置关系 |
| `MS` | Medium Shot (中景) | 展开动作，表现冲突或互动 |
| `CU` | Close-Up (特写) | 情绪落点，聚焦表情或关键细节 |

### PanelShot (单镜头数据)

```typescript
interface PanelShot {
  index: 1 | 2 | 3;                    // 镜头序号 (固定 3 个)
  dialogue: string;                    // 该镜头对应的台词
  action: string;                      // 动作描述
  visual: string;                      // 视觉描述 (用于图像生成)
  
  // 资产绑定 (使用 asset ID)
  characterAssetIds: string[];         // 角色资产 ID 数组 (建议 ≤2)
  sceneAssetId: string | null;         // 场景资产 ID
  propAssetIds: string[];              // 道具资产 ID 数组 (建议 ≤3)
  
  // 镜头配置
  shotSize: ShotSize;                  // 景别
  composition: string;                 // 构图 (三分法、居中、前景遮挡等)
  camera: string;                      // 机位/角度 (平视、俯拍、仰拍等)
  
  // 光影
  light: string;                       // 光影设置 (自然光、侧光、逆光等)
  grade?: string;                      // 调色风格 (青橙、暖调、冷调等)
  
  // 负面提示词
  negatives?: string[];                // 避免生成的内容
}
```

### ScriptPanel.shots (三镜头数组)

```typescript
interface ScriptPanel {
  // ... 其他字段 ...
  shots?: [PanelShot, PanelShot, PanelShot];
}
```

**约定**：`shots` 数组固定为 3 个元素，分别对应：
- `shots[0]` → Shot 1 (通常为 WS 全景)
- `shots[1]` → Shot 2 (通常为 MS 中景)
- `shots[2]` → Shot 3 (通常为 CU 特写)

---

## 字段详解

### 核心字段

| 字段 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `index` | ✅ | 镜头序号，固定为 1/2/3 | `1` |
| `dialogue` | ❌ | 该镜头对应的台词 | `"你以为你赢了？"` |
| `action` | ✅ | 动作描述 | `"角色猛然挥拳" ` |
| `visual` | ✅ | 视觉描述，用于生成图像 | `"战神站立于山巅，风吹披风" ` |

### 资产绑定字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `characterAssetIds` | `string[]` | 该镜头出现的角色资产 ID，建议最多 2 个 |
| `sceneAssetId` | `string \| null` | 该镜头的场景资产 ID |
| `propAssetIds` | `string[]` | 该镜头出现的道具资产 ID，建议最多 3 个 |

**资产 ID 来源**：
- 由 Writer Agent 从 `existingAssets` 列表中选取
- 如果 Writer 输出的是名称而非 ID，`panelShotResolver` 会自动匹配

### 镜头配置字段

| 字段 | 默认值 | 说明 | 推荐值 |
|------|--------|------|--------|
| `shotSize` | `MS` | 景别 | Shot1=WS, Shot2=MS, Shot3=CU |
| `composition` | `rule of thirds` | 构图方式 | `三分法` / `居中` / `对角线` |
| `camera` | `eye level` | 机位角度 | `平视` / `俯拍` / `仰拍` / `荷兰角` |
| `light` | `natural light` | 光影设置 | `自然光` / `侧光` / `逆光` / `戏剧光` |
| `grade` | - | 调色风格 | `青橙` / `暖调` / `冷调` / `高对比` |

### 负面提示词

`negatives` 数组用于指定生成时需要避免的内容：

```typescript
negatives: [
  "blurry",
  "low quality",
  "extra limbs",
  "wrong proportions"
]
```

---

## 使用流程

### 1. 脚本生成阶段 (Writer Agent)

Writer Agent 在生成脚本时会：
1. 接收 `existingAssets` 列表（现有资产的 ID/name/type）
2. 为每个 panel 输出 `shots` 数组
3. 在 shots 中使用 `assetId` 绑定角色/场景/道具

```
用户点击「生成脚本」
    ↓
App.tsx 调用 runWriterAgent(episode, settings, ..., existingAssets)
    ↓
Writer 返回 { script, newAssets }
    ↓
script.panels[i].shots 包含结构化数据
```

### 2. 资产绑定解析 (panelShotResolver)

如果 Writer 返回的 shots 中资产绑定不完整：

```typescript
import { resolvePanelShots } from './services/panelShotResolver';

const { resolvedPanels, newAssets } = resolvePanelShots({
  panels: script.panels,
  existingAssets: project.assets
});
```

### 3. 绘图页消费 (TriptychGenerator)

`TriptychGenerator` 组件会：
1. 检测 `panel.shots` 是否存在
2. 如果存在，优先使用 shots 数据构建：
   - 提示词 (visual + action + dialogue + 镜头配置)
   - 参考图 (characterAssetIds → 角色锚, sceneAssetId → 场景锚)
3. 如果不存在，回退到 `▲` 解析逻辑

### 4. 剧本界面编辑 (ScriptCanvas)

用户可以在剧本界面：
1. 点击「添加 3-Shot 结构化数据」初始化 shots
2. 展开编辑每个 shot 的视觉描述、动作、台词
3. 调整景别、构图、机位、光影

---

## 最佳实践

### 1. 三镜头节奏 (Ki-Sho-Ketsu 简化版)

| Shot | 景别 | 叙事作用 | 示例 |
|------|------|---------|------|
| Shot 1 | WS 全景 | **建立** - 展示场景和角色位置 | 战神站立于山巅，云海翻涌 |
| Shot 2 | MS 中景 | **展开** - 动作和冲突 | 他挥剑斩向敌人，剑气四溢 |
| Shot 3 | CU 特写 | **落点** - 情绪或结果 | 特写他坚毅的眼神，瞳孔倒映火焰 |

### 2. 资产绑定原则

- **角色**：每个 shot 最多绑定 2 个角色，避免参考图过于复杂
- **场景**：3 个 shot 应绑定同一个场景资产，保持背景一致
- **道具**：只在道具出现的镜头绑定，避免过拟合

### 3. 提示词编写规范

**Visual 字段**（最重要）：
```
✅ 好的写法：战神（浴血、披风飘扬）站立于破碎仙宫前，四周雷霆环绕
❌ 不好的写法：战神很生气
```

**Action 字段**：
```
✅ 好的写法：猛然挥剑，剑气撕裂虚空
❌ 不好的写法：攻击敌人
```

### 4. 光影和调色

- **同一场景** 的 3 个 shot 应使用相同的 `light` 和 `grade`
- 调色风格影响整体氛围：
  - `青橙 (teal-orange)` - 电影感、科幻
  - `暖调 (warm)` - 温馨、回忆
  - `冷调 (cold)` - 紧张、危机

---

## 常见漂移问题与排查

### 问题 1：角色外观漂移

**现象**：三张图中角色的发型/服装/配饰不一致

**排查**：
1. 检查 `characterAssetIds` 是否正确绑定
2. 确认角色资产有图片 (`asset.imagePath` 不为空)
3. 查看控制台 `[MicroMontage] Added character anchor` 日志

**解决**：
- 确保角色资产已生成图片
- 减少单个 shot 的角色数量（≤2）

### 问题 2：背景漂移

**现象**：三张图的背景环境不一致

**排查**：
1. 检查 `sceneAssetId` 是否正确设置
2. 确认场景资产有图片
3. 查看控制台 `[MicroMontage] Added scene anchor` 日志

**解决**：
- 确保 3 个 shot 使用同一个 `sceneAssetId`
- 生成场景资产图片

### 问题 3：镜头风格不一致

**现象**：三张图的光影/色调差异大

**排查**：
1. 检查 `light` 和 `grade` 字段是否一致
2. 检查提示词中是否有冲突的光影描述

**解决**：
- 统一 3 个 shot 的 `light` 和 `grade`
- 在 visual 中避免指定与 light/grade 冲突的光影

### 问题 4：Shots 数据丢失

**现象**：刷新页面后 shots 数据消失

**排查**：
1. 检查 `saveCurrentProject` 是否正确保存 shots
2. 检查 `loadProjectFromDir` 是否正确加载 shots
3. 查看 IndexedDB/文件系统中的 JSON 数据

**解决**：
- 确保保存时包含 `shots` 字段
- 检查 JSON 序列化/反序列化是否正确处理 shots

---

## 降级策略

### 场景 1：panel.shots 缺失

如果 `panel.shots` 为空或长度不为 3：
- `TriptychGenerator` 回退到 `▲` 解析逻辑
- 使用 `relatedAssetIds` 作为参考图来源
- 用户可以在剧本界面点击「添加 3-Shot 结构化数据」初始化

### 场景 2：资产 ID 无效

如果 shots 中的 `characterAssetIds`/`sceneAssetId` 在 `project.assets` 中找不到：
- 跳过该资产的参考图
- 不阻断生成流程
- 控制台警告：`[MicroMontage] Asset not found: xxx`

### 场景 3：资产无图片

如果资产存在但 `imagePath` 为空：
- 跳过该资产的参考图
- 使用其他可用的参考图
- 建议用户先生成资产图片

---

## 附录：完整示例

```json
{
  "panel_id": 1,
  "script_content": "▲广角俯视 战神（浴血）站立于破碎仙宫...",
  "duration": "12s",
  "scene_name": "破碎仙宫",
  "shots": [
    {
      "index": 1,
      "dialogue": "",
      "action": "战神孤身站立，四周雷霆肆虐",
      "visual": "广角俯视 战神（浑身浴血）孤身立于破碎仙宫，四周雷霆环绕",
      "characterAssetIds": ["char_zhangshen_001"],
      "sceneAssetId": "scene_xiangong_001",
      "propAssetIds": [],
      "shotSize": "WS",
      "composition": "居中偏下，留天空",
      "camera": "俯拍",
      "light": "戏剧光，雷电闪烁",
      "grade": "青橙高对比"
    },
    {
      "index": 2,
      "dialogue": "北冥幽！你安敢如此对我！",
      "action": "仰天咆哮，身后炸开金色残魂虚影",
      "visual": "中景 战神（眼角崩裂，血泪滑落）仰天咆哮，身后金色残魂虚影炸裂",
      "characterAssetIds": ["char_zhangshen_001"],
      "sceneAssetId": "scene_xiangong_001",
      "propAssetIds": [],
      "shotSize": "MS",
      "composition": "三分法偏左",
      "camera": "仰拍",
      "light": "逆光，金色边缘光",
      "grade": "青橙高对比"
    },
    {
      "index": 3,
      "dialogue": "",
      "action": "双手结印，猛然向虚空按去",
      "visual": "特写 战神（双手结印，指尖发白）猛然向虚空按去，空间扭曲裂纹蔓延",
      "characterAssetIds": ["char_zhangshen_001"],
      "sceneAssetId": "scene_xiangong_001",
      "propAssetIds": [],
      "shotSize": "CU",
      "composition": "居中，聚焦双手",
      "camera": "平视微仰",
      "light": "手部发光，周围暗",
      "grade": "青橙高对比"
    }
  ]
}
```

---

**文档版本**：1.0  
**最后更新**：2026-01-06  
**相关文件**：
- `types.ts` - 类型定义
- `services/panelShotResolver.ts` - 资产绑定解析
- `services/geminiService.ts` - Writer Agent
- `components/StoryboardBoard.tsx` - TriptychGenerator
- `components/ScriptCanvas.tsx` - ShotsEditor

