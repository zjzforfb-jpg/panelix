# 实现差距分析：当前实现 vs 架构设计 V2

## 📊 总体对比

| 功能模块 | 架构设计 V2 | 当前实现状态 | 完成度 |
|---------|------------|------------|--------|
| 文件结构拆分 | ✅ 设计完成 | ❌ 未实现 | 0% |
| 细粒度保存接口 | ✅ 设计完成 | ❌ 未实现 | 0% |
| 防抖自动保存 | ✅ 设计完成 | ❌ 未实现 | 0% |
| project.json 精简 | ✅ 设计完成 | ❌ 未实现 | 0% |
| 迁移策略 | ✅ 设计完成 | ❌ 未实现 | 0% |
| 按需加载 | ✅ 设计完成 | ❌ 未实现 | 0% |

---

## 🔴 缺失功能详细分析

### 1. 文件结构拆分存储 ❌

**架构设计要求：**
```
[ProjectRoot] /
├── project.json          # 精简版，只包含元数据
├── assets /              # ✅ 已实现
└── volumes /             # ❌ 未实现
    ├── vol_{volumeId} /
    │   ├── content.txt
    │   ├── breakdown.json
    │   ├── scripts /
    │   │   └── ep_{num}.json
    │   └── reports /
    │       └── ep_{num}_report.json
```

**当前实现：**
- ✅ `assets/` 文件夹已实现
- ❌ 所有数据仍存储在单文件 `project.json` 中
- ❌ 没有 `volumes/` 文件夹结构
- ❌ 没有按卷拆分存储

**影响：**
- 大项目（长篇小说、多集剧本）会导致 `project.json` 文件过大
- 全量读写造成性能问题（卡顿）
- 数据丢失风险高（单点故障）

---

### 2. 细粒度保存接口 ❌

**架构设计要求：**
```typescript
// 写入接口
saveProjectMeta(project: Project)              // 仅更新 project.json
saveVolumeContent(volumeId: string, content: string)
savePlotBreakdown(volumeId: string, breakdown: PlotBreakdown)
saveScript(volumeId: string, episodeNum: number, script: WebtoonScript)
saveReport(volumeId: string, episodeNum: number, report: AlignerReport)

// 读取接口
loadProjectIndex(dirHandle)                   // 快速加载索引
loadVolumeFull(volumeId: string)               // 按需加载完整卷数据
loadScript(volumeId: string, episodeNum: number)  // 按需加载剧本
```

**当前实现：**
- ✅ `saveProjectToDir(project)` - 但保存的是完整项目对象
- ✅ `loadProjectFromDir(dirHandle)` - 但加载的是完整项目对象
- ❌ 没有细粒度的保存方法
- ❌ 没有按需加载机制

**当前代码位置：**
- `services/fileSystem.ts:195` - `saveProjectToDir` 保存整个 Project 对象
- `services/fileSystem.ts:168` - `loadProjectFromDir` 加载整个 Project 对象

---

### 3. 防抖自动保存机制 ❌

**架构设计要求：**
```typescript
// 需要实现 useAutoSave Hook
useAutoSave({
  data: currentScript,
  delay: 2000,  // 2秒防抖
  onSave: (script) => saveScript(volId, epNum, script)
})
```

**场景要求：**
- **场景 A：编辑剧本** - 停止输入 2000ms 后自动保存
- **场景 B：编辑小说原文** - 停止输入 3000ms 后自动保存
- **场景 C：修改项目设置** - 立即保存或 500ms 防抖

**当前实现：**
- ❌ 没有 `useAutoSave` Hook
- ❌ 没有防抖机制
- ✅ 有 `saveCurrentProject` 方法，但每次都是全量保存
- ✅ 有 `updateActiveVolume` 方法，但也是全量保存

**当前代码位置：**
- `App.tsx:633` - `saveCurrentProject` 每次保存整个项目
- `App.tsx:652` - `updateActiveVolume` 每次保存整个项目

---

### 4. project.json 精简版 ❌

**架构设计要求：**
```json
{
  "id": "proj_123",
  "name": "我的漫剧项目",
  "version": "2.0",
  "activeVolumeId": "vol_abc",
  "activeStyle": { ... },
  "customStyles": [ ... ],
  "storyBible": { ... },
  "assets": [ ... ],
  "volumeIndex": [   // 仅保留索引，不包含完整数据
    { "id": "vol_abc", "name": "第一卷", "order": 1 }
  ]
}
```

**当前实现：**
- ❌ `project.json` 仍包含完整的 `volumes` 数组
- ❌ 每个 volume 包含完整的 `content`、`plotBreakdown`、`scriptCache`、`reportCache`
- ❌ 没有 `volumeIndex` 字段
- ❌ 没有 `version` 字段用于版本控制

**当前代码位置：**
- `services/fileSystem.ts:205` - 保存时写入完整的 Project 对象
- `types.ts` - Project 类型定义包含完整的 volumes 数据

---

### 5. 迁移策略 ❌

**架构设计要求：**
1. 检测旧版 `project.json`（包含完整 volumes 数据）
2. 自动执行拆分写入操作
3. 建立新的文件夹结构
4. 备份旧文件为 `project.json.bak`

**当前实现：**
- ❌ 没有迁移检测逻辑
- ❌ 没有自动迁移功能
- ❌ 没有备份机制

**需要实现的位置：**
- `services/fileSystem.ts` - 新增 `migrateProjectToV2` 函数
- `loadProjectFromDir` - 检测并触发迁移

---

### 6. 按需加载机制 ❌

**架构设计要求：**
- 快速加载 `project.json` 初始化 UI（只加载索引）
- 按需加载特定卷的完整数据
- 按需加载特定集的剧本和报告

**当前实现：**
- ❌ 加载项目时一次性加载所有 volumes 数据
- ❌ 没有按需加载机制
- ❌ UI 初始化时需要等待所有数据加载完成

**影响：**
- 项目打开速度慢
- 内存占用高
- 不必要的网络/磁盘 I/O

---

## 📝 需要实现的具体功能清单

### 优先级 P0（核心功能）

1. **文件结构拆分**
   - [ ] 实现 `volumes/vol_{volumeId}/` 文件夹结构
   - [ ] 实现 `content.txt` 存储原始文本
   - [ ] 实现 `breakdown.json` 存储剧情拆解
   - [ ] 实现 `scripts/ep_{num}.json` 存储剧本
   - [ ] 实现 `reports/ep_{num}_report.json` 存储报告

2. **细粒度保存接口**
   - [ ] `saveProjectMeta(project)` - 仅保存元数据
   - [ ] `saveVolumeContent(volumeId, content)`
   - [ ] `savePlotBreakdown(volumeId, breakdown)`
   - [ ] `saveScript(volumeId, episodeNum, script)`
   - [ ] `saveReport(volumeId, episodeNum, report)`

3. **project.json 精简**
   - [ ] 修改 Project 类型，添加 `volumeIndex` 字段
   - [ ] 修改保存逻辑，只保存索引信息
   - [ ] 移除 volumes 完整数据从 project.json

### 优先级 P1（性能优化）

4. **防抖自动保存**
   - [ ] 创建 `hooks/useAutoSave.ts` Hook
   - [ ] 在 ScriptCanvas 中应用防抖保存（2000ms）
   - [ ] 在 SourcePanel 中应用防抖保存（3000ms）
   - [ ] 在项目设置中应用短防抖（500ms）

5. **按需加载**
   - [ ] `loadProjectIndex()` - 快速加载索引
   - [ ] `loadVolumeFull(volumeId)` - 按需加载卷数据
   - [ ] `loadScript(volumeId, episodeNum)` - 按需加载剧本
   - [ ] 修改 App.tsx 状态管理，支持懒加载

### 优先级 P2（兼容性）

6. **迁移策略**
   - [ ] 检测旧版 project.json 格式
   - [ ] 实现 `migrateProjectToV2()` 函数
   - [ ] 自动执行迁移并备份旧文件
   - [ ] 在 `loadProjectFromDir` 中集成迁移逻辑

---

## 🔧 实现建议

### 阶段 1：基础结构（1-2周）
1. 实现文件结构拆分
2. 实现细粒度保存接口
3. 实现 project.json 精简

### 阶段 2：性能优化（1周）
4. 实现防抖自动保存
5. 实现按需加载

### 阶段 3：兼容性（3-5天）
6. 实现迁移策略
7. 测试和修复

---

## 📌 注意事项

1. **向后兼容**：迁移策略必须确保旧项目能正常打开
2. **错误处理**：文件系统操作需要完善的错误处理和回退机制
3. **性能测试**：大项目（100+ 集）的性能测试
4. **用户体验**：保存状态反馈（"正在保存..." -> "已保存"）

---

## 🎯 总结

当前实现仍使用**单体 JSON 存储架构**，与架构设计 V2 的**文件拆分存储 + 防抖增量保存**目标差距较大。需要实现的核心功能包括：

1. ✅ 文件结构拆分（volumes/ 文件夹）
2. ✅ 细粒度保存接口
3. ✅ 防抖自动保存机制
4. ✅ project.json 精简
5. ✅ 迁移策略
6. ✅ 按需加载机制

建议按照优先级分阶段实施，确保每个阶段都能稳定运行后再进行下一阶段。

