# ⚡ 快速开始：V3 架构整合

> 5 分钟快速上手桥接层和功能开关系统

---

## 🎯 你现在拥有什么？

✅ **桥接层** - 连接旧系统和 V3 架构  
✅ **功能开关** - 灵活控制 V3 功能启用  
✅ **完整文档** - 详细的迁移计划和使用指南  
✅ **零风险** - 新旧系统共存，随时回滚  

---

## 🚀 3 步开始使用

### Step 1: 在 App.tsx 中初始化桥接

```typescript
import { TaskBridge } from './bridge/TaskBridge';
import { FeatureManager } from './config';

function App() {
  const [bridge, setBridge] = useState<TaskBridge | null>(null);

  useEffect(() => {
    // 初始化桥接
    const taskBridge = new TaskBridge({
      useV3System: false,  // 先关闭，测试后再开启
      enableSync: false,
      debugMode: true,     // 开启调试
      legacyTaskService: projectStateManager,
    });
    
    setBridge(taskBridge);
    console.log('✅ Bridge initialized');
  }, []);

  return <div>{/* Your app */}</div>;
}
```

### Step 2: 测试桥接功能

```typescript
// 在任意组件中测试
const handleTest = async () => {
  if (!bridge) return;
  
  try {
    // 创建任务（使用旧系统）
    const taskId = await bridge.createTask({
      type: 'image',
      params: { source: 'gemini', model: 'flux' },
      priority: 50,
    });
    
    console.log('✅ Task created:', taskId);
    
    // 查询任务
    const task = await bridge.getTaskStatus(taskId);
    console.log('✅ Task status:', task?.status);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};
```

### Step 3: 启用第一个 V3 功能

```typescript
// 测试通过后，启用 V3 功能
FeatureManager.enable('USE_V3_VIDEO_REFERENCE');

// 或者按阶段配置
FeatureManager.configureForPhase('coexistence');

// 更新桥接配置
bridge.updateConfig({
  useV3System: true,
  enableSync: true,  // 启用双系统同步
});

console.log('✅ V3 features enabled');
```

---

## 🎛️ 功能开关速查

```typescript
import { FeatureManager } from './config';

// 检查功能状态
FeatureManager.isEnabled('USE_V3_TASK_SYSTEM')  // false

// 启用功能
FeatureManager.enable('USE_V3_VIDEO_REFERENCE')

// 禁用功能
FeatureManager.disable('USE_V3_GALLERY')

// 切换功能
FeatureManager.toggle('DEBUG_V3_MIGRATION')

// 按阶段配置（推荐）
FeatureManager.configureForPhase('coexistence')
// 自动启用：USE_V3_VIDEO_REFERENCE, ENABLE_LEGACY_SYNC, DEBUG_V3_MIGRATION
```

---

## 🔄 迁移阶段

### Phase 1: 准备阶段 ✅ 当前
```typescript
FeatureManager.configureForPhase('preparation');
// 只启用调试，不启用任何 V3 功能
```

### Phase 2: 共存阶段 🎯 下一步
```typescript
FeatureManager.configureForPhase('coexistence');
// 启用部分 V3 功能 + 双系统同步
```

### Phase 3: 迁移阶段
```typescript
FeatureManager.configureForPhase('migration');
// 大规模启用 V3 功能
```

### Phase 4: 完成阶段
```typescript
FeatureManager.configureForPhase('complete');
// 全面 V3，禁用旧系统
```

---

## 📊 常用操作

### 创建任务
```typescript
const taskId = await bridge.createTask({
  type: 'image',
  params: { source: 'gemini', model: 'flux' },
  priority: 80,
});
```

### 查询任务
```typescript
const task = await bridge.getTaskStatus(taskId);
console.log(task.status);  // 'pending' | 'processing' | 'success' | 'error'
```

### 取消任务
```typescript
await bridge.cancelTask(taskId, 'User cancelled');
```

### 数据迁移
```typescript
// 迁移所有旧任务到 V3
await bridge.migrateLegacyTasks();
```

### 验证一致性
```typescript
const validation = await bridge.validateSync();
if (!validation.consistent) {
  console.error('数据不一致', validation.differences);
}
```

---

## 🐛 遇到问题？

### 问题 1: 桥接未初始化
```typescript
if (!bridge) {
  console.error('Bridge not initialized');
  return;
}
```

### 问题 2: 功能开关不生效
```typescript
// 检查当前状态
const flags = FeatureManager.getFlags();
console.log(flags);

// 强制启用
FeatureManager.enable('USE_V3_TASK_SYSTEM');
```

### 问题 3: 数据不一致
```typescript
// 运行一致性检查
const validation = await bridge.validateSync();
console.log(validation);
```

---

## 📚 详细文档

- **INTEGRATION_SUMMARY.md** - 完成总结（推荐先看）
- **BRIDGE_GUIDE.md** - 桥接层详细使用指南
- **MIGRATION.md** - 完整的 8 周迁移计划
- **CLAUDE.md** - 开发记录和最佳实践

---

## ✅ 检查清单

在开始迁移前，确认：

- [ ] 已阅读 INTEGRATION_SUMMARY.md
- [ ] 在 App.tsx 中初始化了 TaskBridge
- [ ] 测试了基础功能（创建、查询任务）
- [ ] 理解了功能开关的使用
- [ ] 知道如何回滚（disable 功能或 switchToLegacy）
- [ ] 备份了现有数据

---

## 🎉 准备好了？

**现在你可以安全地开始 V3 架构迁移了！**

1. ✅ 桥接层已就绪
2. ✅ 功能开关已配置
3. ✅ 文档已完善
4. ✅ 随时可以回滚

**下一步**：在 App.tsx 中集成 TaskBridge，开始测试！

---

*创建时间：2026-01-04*

