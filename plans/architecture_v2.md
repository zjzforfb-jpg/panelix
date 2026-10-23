# 架构设计文档 V2：增量保存与文件结构重构

## 1. 背景与目标
当前应用使用单文件 `project.json` 存储所有项目数据。随着项目规模增长（长篇小说、多集剧本），全量读写会导致严重的性能问题（卡顿）和数据丢失风险。
本设计旨在引入**“文件拆分存储”**和**“防抖增量保存”**机制，以实现流畅的自动保存体验。

## 2. 新的文件存储结构 (File Structure)

我们将从单体 JSON 迁移到文件夹结构。

```text
[ProjectRoot] /
├── project.json                # [轻量] 项目元数据、全局设置、角色表(StoryBible)、样式库
├── assets /                    # [资源] 图片资源 (已存在)
│   ├── char_001.png
│   └── ...
└── volumes /                   # [分卷] 存放各卷数据
    ├── vol_{volumeId} /        # 每个分卷独立文件夹
    │   ├── content.txt         # [重量] 原始小说文本
    │   ├── breakdown.json      # [中量] 剧情拆解 (PlotBreakdown)
    │   ├── scripts /           # [剧本] 分集剧本文件夹
    │   │   ├── ep_1.json       # [中量] 第1集剧本
    │   │   ├── ep_2.json
    │   │   └── ...
    │   └── reports /           # [报告] 评估报告文件夹
    │       ├── ep_1_report.json
    │       └── ...
    └── ...
```

### 2.1 `project.json` (精简版)
仅包含索引信息，不再包含 `volumes` 的具体内容。
```json
{
  "id": "proj_123",
  "name": "我的漫剧项目",
  "version": "2.0",
  "activeVolumeId": "vol_abc",
  "activeStyle": { ... },
  "customStyles": [ ... ],
  "storyBible": { ... },
  "assets": [ ... ], // 资产元数据
  "volumeIndex": [   // 仅保留卷的索引信息，用于侧边栏显示
    { "id": "vol_abc", "name": "第一卷", "order": 1 }
  ]
}
```

## 3. 服务层接口变更 (Service Layer)

`services/fileSystem.ts` 将新增细粒度的读写方法。

### 3.1 写入接口 (Writers)
*   `saveProjectMeta(project: Project)`: 仅更新 `project.json`。
*   `saveVolumeContent(volumeId: string, content: string)`: 写入 `volumes/{id}/content.txt`。
*   `savePlotBreakdown(volumeId: string, breakdown: PlotBreakdown)`: 写入 `volumes/{id}/breakdown.json`。
*   `saveScript(volumeId: string, episodeNum: number, script: WebtoonScript)`: 写入 `volumes/{id}/scripts/ep_{num}.json`。

### 3.2 读取接口 (Readers)
*   `loadProjectIndex(dirHandle)`: 仅读取 `project.json`，快速初始化 UI。
*   `loadVolumeFull(volumeId: string)`: (按需) 加载特定卷的所有数据（文本、拆解）。
*   `loadScript(volumeId: string, episodeNum: number)`: (按需) 加载特定集的剧本。

## 4. 前端状态管理与自动保存 (State & Auto-save)

### 4.1 状态拆分 (State Splitting)
为了配合增量保存，内存中的 State 也建议逻辑拆分（虽然为了兼容旧代码，初期可能仍在内存中维护一个大对象，但保存时只取部分）。

### 4.2 防抖保存策略 (Debounce Strategy)
引入 `useAutoSave` Hook，监听特定数据的变化。

*   **场景 A：编辑剧本 (ScriptCanvas)**
    *   监听对象：`currentScript`
    *   触发条件：内容变化且停止输入 2000ms (2秒)。
    *   执行动作：调用 `saveScript(volId, epNum, currentScript)`。
    *   UI 反馈：状态栏显示 "正在保存..." -> "已保存"。

*   **场景 B：编辑小说原文 (SourcePanel)**
    *   监听对象：`rawText`
    *   触发条件：停止输入 3000ms。
    *   执行动作：调用 `saveVolumeContent(volId, rawText)`。

*   **场景 C：修改项目设置/样式**
    *   监听对象：`project.activeStyle`, `project.name`
    *   触发条件：立即保存 (或短防抖 500ms)。
    *   执行动作：调用 `saveProjectMeta(project)`。

## 5. 迁移策略 (Migration)
如何处理旧版 `project.json`？
1.  **检测**：`loadProjectFromDir` 检测到目录下只有 `project.json` 且内容包含 `volumes` 完整数据。
2.  **迁移**：自动执行一次“拆分写入”操作，建立新的文件夹结构。
3.  **备份**：将旧的 `project.json` 重命名为 `project.json.bak`。

## 6. 异常处理
*   **权限丢失**：如果浏览器刷新导致 FileHandle 失效，捕获错误并弹窗提示用户“重新打开文件夹以恢复保存权限”。
*   **写入冲突**：由于是单人本地应用，暂不考虑并发写入冲突，但需确保写入操作是串行的（Promise Queue）。

