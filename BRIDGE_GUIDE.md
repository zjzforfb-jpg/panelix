# 🌉 桥接层使用指南

## 📋 概述

桥接层（Bridge Layer）是连接旧系统和 V3 架构的关键组件，让你可以在不影响现有功能的前提下逐步迁移到新架构。

---

## 🚀 快速开始

### 1. 基础使用

#### 初始化桥接

```typescript
import { TaskBridge } from './bridge/TaskBridge';
import { FEATURES } from './config';

// 创建桥接实例
const bridge = new TaskBridge({
  useV3System: FEATURES.USE_V3_TASK_SYSTEM,
  enableSync: FEATURES.ENABLE_LEGACY_SYNC,
  debugMode: FEATURES.DEBUG_V3_MIGRATION,
  legacyTaskService: projectStateManager,  // 旧系统服务
  v3TaskQueue: taskQueue,                   // V3 任务队列
});
```

#### 创建任务（统一接口）

```typescript
// 无论使用哪个系统，接口都一样
const taskId = await bridge.createTask({
  type: 'image',
  params: {
    source: 'gemini',
    model: 'flux',
    prompt: 'A beautiful sunset',
  },
  priority: 80,
  maxRetries: 3,
});

console.log('Task created:', taskId);
```

#### 查询任务状态

```typescript
// 统一的查询接口
const task = await bridge.getTaskStatus(taskId);

console.log('Task status:', task.status);
console.log('Task type:', task.type);
```

---

## 🔄 类型转换

### 使用 LegacyAdapter

```typescript
import { LegacyAdapter } from './bridge/LegacyAdapter';

// 1. 旧任务 → V3 TaskEntity
const legacyTask = {
  id: 'task_123',
  type: 'image',
  source: 'gemini',
  status: 'pending',
  createdAt: Date.now(),
};

const v3Task = LegacyAdapter.fromLegacyTask(legacyTask);
console.log('V3 Task:', v3Task.getDescription());

// 2. V3 TaskEntity → 旧任务
const convertedBack = LegacyAdapter.toLegacyTask(v3Task);
console.log('Legacy Task:', convertedBack);

// 3. 批量转换
const legacyTasks = [task1, task2, task3];
const v3Tasks = LegacyAdapter.fromLegacyTaskList(legacyTasks);

// 4. 验证转换
if (LegacyAdapter.isValidLegacyTask(legacyTask)) {
  // 可以安全转换
}

// 5. 比较差异（调试用）
const comparison = LegacyAdapter.compareTaskVersions(legacyTask, v3Task);
console.log('Status match:', comparison.statusMatch);
console.log('Differences:', comparison.differences);
```

---

## 🎛️ 功能开关

### 使用 FeatureManager

```typescript
import { FeatureManager } from './config';

// 1. 检查功能状态
if (FeatureManager.isEnabled('USE_V3_TASK_SYSTEM')) {
  console.log('Using V3 task system');
}

// 2. 启用/禁用功能
FeatureManager.enable('USE_V3_VIDEO_REFERENCE');
FeatureManager.disable('USE_V3_GALLERY');

// 3. 切换功能
FeatureManager.toggle('DEBUG_V3_MIGRATION');

// 4. 批量更新
FeatureManager.updateFlags({
  USE_V3_TASK_SYSTEM: true,
  USE_V3_DATABASE: true,
  ENABLE_LEGACY_SYNC: true,
});

// 5. 根据迁移阶段自动配置
FeatureManager.configureForPhase('coexistence');
// 自动启用：USE_V3_VIDEO_REFERENCE, ENABLE_LEGACY_SYNC, DEBUG_V3_MIGRATION

// 6. 获取所有开关状态
const flags = FeatureManager.getFlags();
console.log('Current flags:', flags);

// 7. 重置为默认
FeatureManager.reset();
```

---

## 🔄 数据迁移

### 迁移旧任务到 V3

```typescript
// 1. 迁移所有任务
await bridge.migrateLegacyTasks();

// 2. 迁移指定任务
await bridge.migrateLegacyTasks(['task_1', 'task_2', 'task_3']);

// 3. 监控迁移进度
const stats = await bridge.getStats();
console.log('Migration stats:', stats);
```

### 验证数据一致性

```typescript
// 检查双系统数据是否一致
const validation = await bridge.validateSync();

if (validation.consistent) {
  console.log('✅ Data is consistent');
} else {
  console.error('❌ Data inconsistency detected:');
  validation.differences.forEach(diff => {
    console.error(`  - ${diff.type}: ${diff.taskId}`);
  });
}
```

---

## 🔧 高级用法

### 1. 动态切换系统

```typescript
// 运行时切换到 V3 系统
bridge.switchToV3();

// 切换回旧系统
bridge.switchToLegacy();

// 启用双系统同步
bridge.enableSync();

// 禁用同步
bridge.disableSync();
```

### 2. 自定义配置

```typescript
// 更新桥接配置
bridge.updateConfig({
  useV3System: true,
  enableSync: true,
  debugMode: false,
});
```

### 3. 监控和调试

```typescript
// 获取桥接统计信息
const stats = await bridge.getStats();
console.log('Bridge stats:', stats);
console.log('V3 stats:', stats.v3Stats);
console.log('Legacy stats:', stats.legacyStats);

// 获取适配器统计
const adapterStats = LegacyAdapter.getAdapterStats();
console.log('Adapter stats:', adapterStats);
```

---

## 📊 实际应用场景

### 场景 1：在 App.tsx 中集成桥接层

```typescript
// App.tsx
import { TaskBridge } from './bridge/TaskBridge';
import { FeatureManager } from './config';
import { projectStateManager } from './services/projectStateManager';
import { initTaskQueue } from './src/modules/pipeline/infrastructure/TaskQueue';

function App() {
  const [bridge, setBridge] = useState<TaskBridge | null>(null);

  useEffect(() => {
    async function initBridge() {
      // 初始化 V3 任务队列（如果启用）
      const taskQueue = FeatureManager.isEnabled('USE_V3_TASK_SYSTEM')
        ? await initTaskQueue()
        : null;

      // 创建桥接实例
      const taskBridge = new TaskBridge({
        useV3System: FeatureManager.isEnabled('USE_V3_TASK_SYSTEM'),
        enableSync: FeatureManager.isEnabled('ENABLE_LEGACY_SYNC'),
        debugMode: FeatureManager.isEnabled('DEBUG_V3_MIGRATION'),
        legacyTaskService: projectStateManager,
        v3TaskQueue: taskQueue,
      });

      setBridge(taskBridge);
    }

    initBridge();
  }, []);

  // 使用桥接创建任务
  const handleCreateTask = async (params) => {
    if (!bridge) return;
    
    try {
      const taskId = await bridge.createTask(params);
      console.log('Task created:', taskId);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  return (
    <div>
      {/* Your app UI */}
    </div>
  );
}
```

### 场景 2：在组件中使用功能开关

```typescript
// StoryboardBoard.tsx
import { FeatureManager } from '../config';
import { composeVideoReference as legacyCompose } from '../services/videoReferenceComposer';
import { ComposeVideoReferenceUseCase } from '../src/modules/video/application/ComposeVideoReferenceUseCase';

function StoryboardBoard() {
  const handleComposeReference = async (panels, assets) => {
    try {
      if (FeatureManager.isEnabled('USE_V3_VIDEO_REFERENCE')) {
        // 使用 V3 版本
        const useCase = new ComposeVideoReferenceUseCase(projectDirHandle);
        const resultPath = await useCase.execute(panels, assets);
        console.log('V3 result:', resultPath);
      } else {
        // 使用旧版本
        const config = getDefaultConfig();
        const blob = await legacyCompose(panels, assets, config, projectDirHandle);
        console.log('Legacy result:', blob);
      }
    } catch (error) {
      console.error('Composition failed:', error);
      
      // 如果 V3 失败，自动回滚到旧版本
      if (FeatureManager.isEnabled('USE_V3_VIDEO_REFERENCE')) {
        FeatureManager.disable('USE_V3_VIDEO_REFERENCE');
        console.warn('Auto-rollback to legacy system');
      }
    }
  };

  return (
    <div>
      <button onClick={handleComposeReference}>
        合成视频参考图
      </button>
    </div>
  );
}
```

### 场景 3：渐进式迁移流程

```typescript
// 第 1 步：准备阶段（只启用调试）
FeatureManager.configureForPhase('preparation');
console.log('Phase 1: Preparation');

// 第 2 步：共存阶段（启用部分 V3 功能）
FeatureManager.configureForPhase('coexistence');
console.log('Phase 2: Coexistence');

// 测试 V3 功能
if (FeatureManager.isEnabled('USE_V3_VIDEO_REFERENCE')) {
  console.log('Testing V3 video reference...');
}

// 第 3 步：迁移阶段（大规模启用 V3）
FeatureManager.configureForPhase('migration');
console.log('Phase 3: Migration');

// 迁移所有旧任务
await bridge.migrateLegacyTasks();

// 验证数据一致性
const validation = await bridge.validateSync();
if (!validation.consistent) {
  console.error('Migration failed, rolling back...');
  FeatureManager.configureForPhase('coexistence');
}

// 第 4 步：完成阶段（全面 V3）
FeatureManager.configureForPhase('complete');
console.log('Phase 4: Complete');
```

---

## ⚠️ 注意事项

### 1. 双系统同步

- **启用同步时**：所有操作会同时写入两个系统
- **性能影响**：写操作延迟可能翻倍
- **建议**：只在迁移阶段启用，完成后禁用

### 2. 数据一致性

- 定期运行 `validateSync()` 检查一致性
- 发现不一致时及时修复或回滚
- 在生产环境启用监控告警

### 3. 回滚策略

- 保留旧系统代码直到迁移完全完成
- 设置错误率阈值自动回滚
- 定期备份数据

### 4. 性能监控

```typescript
// 监控桥接性能
const startTime = Date.now();
await bridge.createTask(params);
const duration = Date.now() - startTime;

if (duration > 1000) {
  console.warn('Bridge operation slow:', duration, 'ms');
}
```

---

## 🐛 故障排查

### 问题 1：类型转换失败

```typescript
// 检查任务是否有效
if (!LegacyAdapter.isValidLegacyTask(legacyTask)) {
  console.error('Invalid legacy task:', legacyTask);
  // 缺少必需字段：id, type, source, status, createdAt
}

// 检查是否可以转换回旧格式
if (!LegacyAdapter.canConvertToLegacy(v3Task)) {
  console.error('Cannot convert to legacy:', v3Task);
  // 缺少 params.source 字段
}
```

### 问题 2：双系统数据不一致

```typescript
// 运行一致性检查
const validation = await bridge.validateSync();

validation.differences.forEach(diff => {
  switch (diff.type) {
    case 'missing_in_legacy':
      console.error('Task exists in V3 but not in legacy:', diff.taskId);
      break;
    case 'status_mismatch':
      console.error('Status mismatch:', diff.comparison);
      break;
  }
});
```

### 问题 3：功能开关不生效

```typescript
// 检查当前开关状态
const flags = FeatureManager.getFlags();
console.log('Current flags:', flags);

// 确认配置已更新
FeatureManager.enable('USE_V3_TASK_SYSTEM');
console.log('V3 enabled:', FeatureManager.isEnabled('USE_V3_TASK_SYSTEM'));

// 检查桥接配置
bridge.updateConfig({ useV3System: true });
```

---

## 📚 相关文档

- [迁移计划](./MIGRATION.md) - 完整的 8 周迁移计划
- [TaskEntity 文档](./src/modules/pipeline/README.md) - V3 任务系统文档
- [架构文档](./ARCHITECTURE.md) - V3.0 架构设计
- [Memory Bank](./CLAUDE.md) - 开发记录和最佳实践

---

## 🎉 总结

桥接层的核心价值：

1. ✅ **零风险迁移** - 新旧系统共存，随时回滚
2. ✅ **灵活控制** - 功能开关精确控制迁移节奏
3. ✅ **数据安全** - 双系统同步保证数据一致性
4. ✅ **渐进式** - 按模块逐步迁移，降低复杂度

**下一步**：
1. 在 `App.tsx` 中集成 TaskBridge
2. 启用第一个 V3 功能（如视频参考图）
3. 测试并验证功能正常
4. 逐步迁移其他模块

---

*最后更新：2026-01-04*

