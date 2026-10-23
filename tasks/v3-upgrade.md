# 🎯 Auto-Manju V3.0 升级任务

> **任务目标**: 将 Auto-Manju 从 V2.1 升级到 V3.0 架构
> **预计周期**: 3-4 周
> **核心原则**: Local-First, 零延迟交互, 线程隔离, DDD

---

## 📋 执行前检查

开始任务前，必须完成：
- [x] 阅读 CLAUDE.md Memory Bank
- [x] 确认当前工作目录 (`pwd`)
- [ ] 确认 `npm run dev` 运行正常
- [ ] 确认 RxDB 数据库初始化成功

---

## Phase 1: 基础设施层 (Infrastructure)

### 1.1 TaskEntity 领域实体 ✅
- [x] 定义 TaskStatus 状态机
- [x] 定义 TaskType 任务类型
- [x] 实现 TaskEntity 类（不可变）
- [x] 添加进度追踪 (progress 0-100)
- [x] 添加任务取消 (Cancelled 状态)
- [x] 添加任务依赖 (dependsOn)
- [x] 添加标签系统 (tags)
- [x] 导出 RxDB Schema

### 1.2 RxDB 数据库集成 ✅
- [x] 在 database.ts 添加 tasks 集合
- [x] 定义 TaskDocument 类型
- [x] 添加 getTasksCollection 函数
- [ ] 实现 TaskRepository 接口

### 1.3 TaskRepository 实现
- [ ] 创建 `src/modules/pipeline/infrastructure/RxDBTaskRepository.ts`
- [ ] 实现 save(task) 方法
- [ ] 实现 saveBatch(tasks) 方法
- [ ] 实现 findById(id) 方法
- [ ] 实现 findByStatus(status) 方法
- [ ] 实现 findPending(limit) 方法
- [ ] 实现 findStale(timeout) 方法
- [ ] 实现 delete/deleteBatch 方法
- [ ] 实现 subscribe(callback) 方法

### 1.4 OPFS Service 完善
- [ ] 添加文件元数据缓存
- [ ] 添加批量操作支持
- [ ] 添加进度回调
- [ ] 添加错误重试机制

---

## Phase 2: 持久化作业队列 (Durable Job Queue)

### 2.1 SharedWorker 编排器
- [ ] 创建 `src/workers/JobSchedulerWorker.ts`
- [ ] 实现 Worker ↔ Main 通信协议
- [ ] 实现 BroadcastChannel 多标签页同步
- [ ] 实现心跳机制

### 2.2 WAL (预写日志) 模式
- [ ] 任务开始前写入 `processing` 状态
- [ ] 实现 lastHeartbeatAt 更新
- [ ] 实现崩溃恢复扫描

### 2.3 故障恢复策略
- [ ] 检测僵尸任务 (isStale)
- [ ] 自动重试策略 (指数退避)
- [ ] 最大重试次数控制

### 2.4 并发控制
- [ ] 实现 Token Bucket 算法
- [ ] MAX_CONCURRENT_JOBS 配置
- [ ] 优先级队列排序

---

## Phase 3: 双层存储策略 (Dual-Storage)

### 3.1 RxDB ↔ OPFS 数据流
- [ ] 定义 AssetEntity 领域实体
- [ ] 实现 OPFSAssetRepository
- [ ] 元数据存 RxDB, 二进制存 OPFS
- [ ] 文件路径引用机制

### 3.2 导出/备份功能
- [ ] 实现 showDirectoryPicker 选择目录
- [ ] 实现流式导出 Worker
- [ ] 进度追踪 UI

---

## Phase 4: UI 层重构 (Presentation)

### 4.1 ScriptCanvas 重构 ✅
- [x] 详细视图 / 紧凑视图切换
- [x] 完整字段展示 (角色/道具/构图/对话)
- [x] 对话管理功能
- [ ] 关联资产选择器

### 4.2 虚拟化滚动 (Gallery)
- [ ] 集成 @tanstack/react-virtual
- [ ] 实现 useOPFSImage Hook
- [ ] 视口外资源释放
- [ ] 懒加载占位符

### 4.3 乐观 UI 模式
- [ ] 任务创建立即显示占位符
- [ ] 后台失败回滚 + 提示
- [ ] 进度条实时更新

### 4.4 任务队列面板
- [ ] 显示排队/处理中/完成任务
- [ ] 支持取消/重试操作
- [ ] 显示预估剩余时间

---

## Phase 5: 迁移策略 (Migration)

### 5.1 双库并行模式
- [ ] IndexedDB 读取兼容层
- [ ] RxDB/OPFS 优先读取
- [ ] 后台静默迁移

### 5.2 MigrationWorker
- [ ] 遍历旧 IndexedDB Blob
- [ ] 写入 OPFS + RxDB 元数据
- [ ] 迁移进度追踪

### 5.3 数据完整性验证
- [ ] 校验已迁移数据
- [ ] 清理旧数据 flag
- [ ] 最终清理脚本

---

## 🔄 自我纠错规则

执行过程中遇到以下情况时，**必须**更新 CLAUDE.md Memory Bank：

1. **编译错误** - 记录错误类型和修复方法
2. **运行时错误** - 记录错误信息和调用栈
3. **类型不匹配** - 记录涉及的类型和正确用法
4. **状态更新不生效** - 记录状态流转路径
5. **文件修改位置错误** - 记录正确的目录结构

---

## ✅ 每步验证

每完成一个子任务，执行：

```bash
# 1. 编译检查
npm run build

# 2. Lint 检查  
npm run lint

# 3. 类型检查
npx tsc --noEmit

# 4. 浏览器控制台检查
# - 无 React 警告
# - 无 RxDB 错误
# - 状态更新正确
```

---

## 📊 进度追踪

| Phase | 任务数 | 完成数 | 进度 |
|-------|--------|--------|------|
| Phase 1 | 20 | 12 | 60% |
| Phase 2 | 12 | 0 | 0% |
| Phase 3 | 6 | 0 | 0% |
| Phase 4 | 12 | 4 | 33% |
| Phase 5 | 8 | 0 | 0% |
| **Total** | **58** | **16** | **28%** |

---

## 📝 备注

- 优先级：Phase 1 > Phase 4 > Phase 2 > Phase 3 > Phase 5
- 每个 Phase 完成后进行集成测试
- 遇到阻塞问题及时更新 Memory Bank

