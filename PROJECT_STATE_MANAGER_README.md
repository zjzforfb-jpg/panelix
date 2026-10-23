# AIComicDramas4.0 - 项目状态管理升级

## 概述

本项目已升级了项目状态管理系统，引入了更高效的项目管理服务和自动保存功能。这些改进提供了更好的数据持久化、缓存管理和用户体验。

## 新增组件

### 1. ProjectStateManager (`services/projectStateManager.ts`)

这是一个核心服务，负责管理项目的完整生命周期：

- **项目初始化**：支持从数据库加载项目或创建新项目
- **数据管理**：提供获取、更新和删除项目的完整API
- **缓存管理**：实现内存缓存以提高性能
- **事件监听**：支持项目变更事件监听
- **版本支持**：支持Project和ProjectV2两种项目格式

主要方法：
- `initialize()`: 初始化服务
- `getProject(id)`: 获取单个项目
- `getAllProjects()`: 获取所有项目
- `createProject(project)`: 创建新项目
- `updateProject(id, updates)`: 更新项目
- `deleteProject(id)`: 删除项目
- `getVolume(projectId, volumeId)`: 获取特定卷
- `updateVolume(projectId, volumeId, updates)`: 更新卷内容
- `addListener(callback)`: 添加变更监听器

### 2. AutoSaveService (`services/autoSaveService.ts`)

提供自动保存功能，使用防抖机制减少频繁保存操作：

- **防抖保存**：避免短时间内多次保存操作
- **分类保存**：支持不同类型数据的独立保存
- **错误处理**：提供完善的错误处理机制
- **状态管理**：跟踪保存状态和进度

主要方法：
- `saveProject(projectId)`: 保存整个项目
- `saveVolume(projectId, volumeId)`: 保存卷
- `saveVolumeContent(projectId, volumeId)`: 保存卷内容
- `savePlotBreakdown(projectId, volumeId)`: 保存剧情分解
- `saveScript(projectId, volumeId, episodeNumber)`: 保存脚本
- `saveReport(projectId, volumeId, episodeNumber)`: 保存报告
- `flushSaveQueue()`: 立即执行所有待保存操作

## App.tsx 中的集成

### 1. 状态管理更新

添加了两个新的状态变量：
```typescript
const [projectStateManager, setProjectStateManager] = useState<ProjectStateManager | null>(null);
const [autoSaveService, setAutoSaveService] = useState<AutoSaveService | null>(null);
```

### 2. 初始化逻辑

在useEffect中初始化新服务：
```typescript
useEffect(() => {
  const initServices = async () => {
    try {
      const stateManager = new ProjectStateManager();
      await stateManager.initialize();
      setProjectStateManager(stateManager);
      
      const autoSave = new AutoSaveService(stateManager);
      setAutoSaveService(autoSave);
      
      // 设置页面卸载时的保存
      const handleBeforeUnload = () => {
        if (autoSave) {
          autoSave.flushSaveQueue();
        }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  };
  
  initServices();
}, []);
```

### 3. 函数更新

所有主要的项目管理函数都已更新，以使用新的服务架构：

- `saveCurrentProject`: 使用ProjectStateManager和AutoSaveService
- `updateActiveVolume`: 集成自动保存功能
- `handleSelectProject`: 支持V2项目加载
- `handleCreateProject`: 支持V2项目创建
- `handleUpdateProject`: 使用新的更新机制
- `handleDeleteProject`: 使用新的删除机制
- `handleCreateVolume`: 创建新卷
- `handleDeleteVolume`: 删除卷
- `handleUpdateVolume`: 更新卷内容
- `handleImportProject`: 支持V2项目导入

每个函数都实现了降级机制，确保在新服务不可用时仍能正常工作。

## 优势

1. **性能提升**：通过缓存和防抖机制减少不必要的数据库操作
2. **数据安全**：自动保存功能减少数据丢失风险
3. **扩展性**：模块化设计便于未来功能扩展
4. **向后兼容**：保持与现有代码的兼容性
5. **错误恢复**：完善的错误处理和降级机制

## 使用指南

### 开发者

1. 在修改项目相关功能时，优先使用`projectStateManager`而不是直接操作数据库
2. 对于需要自动保存的操作，调用相应的`autoSaveService`方法
3. 监听项目变更事件，使用`projectStateManager.addListener`

### 用户

1. 项目现在会自动保存，无需手动点击保存按钮
2. 在页面关闭前，系统会自动保存所有未保存的更改
3. 导入导出功能现在支持更高效的项目格式

## 未来计划

1. 添加项目版本控制和历史记录功能
2. 实现项目协作和共享功能
3. 优化大项目的加载性能
4. 添加项目备份和恢复功能