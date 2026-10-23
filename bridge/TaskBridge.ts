/**
 * TaskBridge - 任务系统桥接服务
 * 
 * 职责：
 * 1. 协调旧任务系统和新 TaskQueue 之间的交互
 * 2. 提供统一的任务创建和查询接口
 * 3. 根据功能开关决定使用哪个系统
 * 4. 在双系统并存期间同步数据
 * 
 * 使用示例：
 * ```typescript
 * const bridge = new TaskBridge();
 * 
 * // 创建任务（自动选择系统）
 * const task = await bridge.createTask({
 *   type: 'image',
 *   params: { source: 'gemini', model: 'flux' }
 * });
 * 
 * // 查询任务状态
 * const status = await bridge.getTaskStatus(taskId);
 * ```
 */

import { TaskEntity, CreateTaskParams } from '../src/modules/pipeline/domain/TaskEntity';
import { LegacyAdapter, LegacyTask } from './LegacyAdapter';

// ==================== 配置接口 ====================

export interface TaskBridgeConfig {
  useV3System: boolean;           // 是否使用 V3 系统
  enableSync: boolean;             // 是否启用双系统同步
  debugMode: boolean;              // 调试模式
  legacyTaskService?: any;        // 旧任务服务实例
  v3TaskQueue?: any;              // V3 TaskQueue 实例
}

// ==================== TaskBridge 类 ====================

export class TaskBridge {
  private config: TaskBridgeConfig;
  
  constructor(config: Partial<TaskBridgeConfig> = {}) {
    this.config = {
      useV3System: false,
      enableSync: false,
      debugMode: false,
      ...config,
    };
    
    this.log('TaskBridge initialized', this.config);
  }

  // ==================== 任务创建 ====================

  /**
   * 创建任务（统一接口）
   * 根据配置自动选择使用旧系统或 V3 系统
   * @param params 任务创建参数
   * @returns 任务 ID
   */
  async createTask(params: CreateTaskParams): Promise<string> {
    this.log('Creating task', params);

    if (this.config.useV3System && this.config.v3TaskQueue) {
      // 使用 V3 系统
      const task = TaskEntity.create(params);
      const submittedTask = task.submit();
      
      // 保存到 V3 队列
      await this.config.v3TaskQueue.enqueue(submittedTask);
      
      // 如果启用同步，同时创建旧任务
      if (this.config.enableSync && this.config.legacyTaskService) {
        const legacyTask = LegacyAdapter.toLegacyTask(submittedTask);
        await this.config.legacyTaskService.createTask(legacyTask);
      }
      
      return submittedTask.id;
    } else if (this.config.legacyTaskService) {
      // 使用旧系统
      const legacyTask: Partial<LegacyTask> = {
        id: `task_${Date.now()}`,
        type: params.type as 'image' | 'text' | 'video',
        source: params.params.source || '',
        model: params.params.model,
        status: 'pending',
        createdAt: Date.now(),
      };
      
      await this.config.legacyTaskService.createTask(legacyTask);
      
      return legacyTask.id!;
    } else {
      throw new Error('No task service available. Please configure legacyTaskService or v3TaskQueue.');
    }
  }

  /**
   * 批量创建任务
   * @param paramsList 任务参数列表
   * @returns 任务 ID 列表
   */
  async createTasks(paramsList: CreateTaskParams[]): Promise<string[]> {
    const ids: string[] = [];
    
    for (const params of paramsList) {
      const id = await this.createTask(params);
      ids.push(id);
    }
    
    return ids;
  }

  // ==================== 任务查询 ====================

  /**
   * 获取任务状态
   * @param taskId 任务 ID
   * @returns 任务对象（统一格式）
   */
  async getTaskStatus(taskId: string): Promise<LegacyTask | null> {
    this.log('Getting task status', taskId);

    if (this.config.useV3System && this.config.v3TaskQueue) {
      // 从 V3 系统查询
      const task = await this.config.v3TaskQueue.getTask(taskId);
      if (!task) return null;
      
      return LegacyAdapter.toLegacyTask(task);
    } else if (this.config.legacyTaskService) {
      // 从旧系统查询
      return await this.config.legacyTaskService.getTask(taskId);
    }
    
    return null;
  }

  /**
   * 查询所有待处理的任务
   * @returns 任务列表
   */
  async getPendingTasks(): Promise<LegacyTask[]> {
    if (this.config.useV3System && this.config.v3TaskQueue) {
      const tasks = await this.config.v3TaskQueue.getPendingTasks();
      return LegacyAdapter.toLegacyTaskList(tasks);
    } else if (this.config.legacyTaskService) {
      return await this.config.legacyTaskService.getPendingTasks();
    }
    
    return [];
  }

  /**
   * 查询所有正在处理的任务
   * @returns 任务列表
   */
  async getProcessingTasks(): Promise<LegacyTask[]> {
    if (this.config.useV3System && this.config.v3TaskQueue) {
      const tasks = await this.config.v3TaskQueue.getProcessingTasks();
      return LegacyAdapter.toLegacyTaskList(tasks);
    } else if (this.config.legacyTaskService) {
      return await this.config.legacyTaskService.getProcessingTasks();
    }
    
    return [];
  }

  // ==================== 任务操作 ====================

  /**
   * 取消任务
   * @param taskId 任务 ID
   * @param reason 取消原因
   */
  async cancelTask(taskId: string, reason: string = 'User cancelled'): Promise<void> {
    this.log('Cancelling task', taskId, reason);

    if (this.config.useV3System && this.config.v3TaskQueue) {
      await this.config.v3TaskQueue.cancelTask(taskId, reason);
      
      if (this.config.enableSync && this.config.legacyTaskService) {
        await this.config.legacyTaskService.cancelTask(taskId);
      }
    } else if (this.config.legacyTaskService) {
      await this.config.legacyTaskService.cancelTask(taskId);
    }
  }

  /**
   * 重试失败的任务
   * @param taskId 任务 ID
   */
  async retryTask(taskId: string): Promise<void> {
    this.log('Retrying task', taskId);

    if (this.config.useV3System && this.config.v3TaskQueue) {
      await this.config.v3TaskQueue.retryTask(taskId);
    } else if (this.config.legacyTaskService) {
      await this.config.legacyTaskService.retryTask(taskId);
    }
  }

  // ==================== 数据同步 ====================

  /**
   * 从旧系统迁移任务到 V3 系统
   * @param taskIds 要迁移的任务 ID 列表（可选，不提供则迁移所有）
   */
  async migrateLegacyTasks(taskIds?: string[]): Promise<void> {
    if (!this.config.legacyTaskService || !this.config.v3TaskQueue) {
      throw new Error('Both legacyTaskService and v3TaskQueue are required for migration');
    }

    this.log('Starting task migration', taskIds);

    let legacyTasks: LegacyTask[];
    
    if (taskIds) {
      legacyTasks = await Promise.all(
        taskIds.map(id => this.config.legacyTaskService.getTask(id))
      );
    } else {
      legacyTasks = await this.config.legacyTaskService.getAllTasks();
    }

    let migratedCount = 0;
    let failedCount = 0;

    for (const legacyTask of legacyTasks) {
      try {
        if (!LegacyAdapter.isValidLegacyTask(legacyTask)) {
          this.log('Skipping invalid legacy task', legacyTask);
          failedCount++;
          continue;
        }

        const v3Task = LegacyAdapter.fromLegacyTask(legacyTask);
        await this.config.v3TaskQueue.enqueue(v3Task);
        
        migratedCount++;
        this.log('Migrated task', legacyTask.id);
      } catch (error) {
        this.log('Failed to migrate task', legacyTask.id, error);
        failedCount++;
      }
    }

    this.log('Migration complete', { migratedCount, failedCount });
  }

  /**
   * 同步单个任务的状态（从 V3 到旧系统）
   * @param taskId 任务 ID
   */
  async syncTaskToLegacy(taskId: string): Promise<void> {
    if (!this.config.enableSync || !this.config.v3TaskQueue || !this.config.legacyTaskService) {
      return;
    }

    const v3Task = await this.config.v3TaskQueue.getTask(taskId);
    if (!v3Task) return;

    const legacyTask = LegacyAdapter.toLegacyTask(v3Task);
    await this.config.legacyTaskService.updateTask(legacyTask);
  }

  // ==================== 配置管理 ====================

  /**
   * 更新桥接配置
   * @param updates 配置更新
   */
  updateConfig(updates: Partial<TaskBridgeConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('Config updated', this.config);
  }

  /**
   * 切换到 V3 系统
   */
  switchToV3(): void {
    this.config.useV3System = true;
    this.log('Switched to V3 system');
  }

  /**
   * 切换回旧系统
   */
  switchToLegacy(): void {
    this.config.useV3System = false;
    this.log('Switched to legacy system');
  }

  /**
   * 启用双系统同步
   */
  enableSync(): void {
    this.config.enableSync = true;
    this.log('Sync enabled');
  }

  /**
   * 禁用双系统同步
   */
  disableSync(): void {
    this.config.enableSync = false;
    this.log('Sync disabled');
  }

  // ==================== 调试和监控 ====================

  /**
   * 获取桥接统计信息
   */
  async getStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {
      config: this.config,
      adapterStats: LegacyAdapter.getAdapterStats(),
    };

    if (this.config.v3TaskQueue) {
      stats.v3Stats = await this.config.v3TaskQueue.getStats();
    }

    if (this.config.legacyTaskService) {
      stats.legacyStats = await this.config.legacyTaskService.getStats?.();
    }

    return stats;
  }

  /**
   * 验证双系统数据一致性
   */
  async validateSync(): Promise<{
    consistent: boolean;
    differences: any[];
  }> {
    if (!this.config.enableSync || !this.config.v3TaskQueue || !this.config.legacyTaskService) {
      return { consistent: true, differences: [] };
    }

    const v3Tasks = await this.config.v3TaskQueue.getAllTasks();
    const legacyTasks = await this.config.legacyTaskService.getAllTasks();

    const differences: any[] = [];

    for (const v3Task of v3Tasks) {
      const legacyId = v3Task.metadata?.legacyId || v3Task.id;
      const legacyTask = legacyTasks.find((t: LegacyTask) => t.id === legacyId);

      if (!legacyTask) {
        differences.push({
          type: 'missing_in_legacy',
          taskId: v3Task.id,
        });
        continue;
      }

      const comparison = LegacyAdapter.compareTaskVersions(legacyTask, v3Task);
      if (!comparison.statusMatch) {
        differences.push({
          type: 'status_mismatch',
          taskId: v3Task.id,
          comparison,
        });
      }
    }

    return {
      consistent: differences.length === 0,
      differences,
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 日志输出
   */
  private log(...args: any[]): void {
    if (this.config.debugMode) {
      console.log('[TaskBridge]', ...args);
    }
  }
}

// ==================== 导出 ====================

export default TaskBridge;

