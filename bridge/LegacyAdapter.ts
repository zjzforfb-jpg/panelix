/**
 * LegacyAdapter - 旧系统与 V3 架构的适配器
 * 
 * 职责：
 * 1. 在旧代码和 V3 TaskEntity 之间进行类型转换
 * 2. 保持向后兼容性
 * 3. 支持逐步迁移
 * 
 * 使用场景：
 * - 旧的 UI 组件需要使用新的 TaskEntity
 * - 新的服务需要兼容旧的数据格式
 * - 双系统并存时的数据同步
 */

import { TaskEntity, CreateTaskParams, TaskStatus } from '../src/modules/pipeline/domain/TaskEntity';

// ==================== 旧系统类型定义 ====================

/**
 * 旧系统的任务类型
 * 对应根目录 types.ts 中的 GenerationTask
 */
export interface LegacyTask {
  id: string;
  type: 'image' | 'text' | 'video';
  source: string;
  model?: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  createdAt: number;
  finishedAt?: number;
  error?: string;
  resultPath?: string;
}

/**
 * 旧系统的任务状态
 */
export type LegacyTaskStatus = 'pending' | 'processing' | 'success' | 'error';

// ==================== LegacyAdapter 类 ====================

export class LegacyAdapter {
  // ==================== 类型转换映射 ====================

  /**
   * V3 状态到旧状态的映射表
   */
  private static readonly V3_TO_LEGACY_STATUS: Record<TaskStatus, LegacyTaskStatus> = {
    'Idle': 'pending',
    'Pending': 'pending',
    'Processing': 'processing',
    'Retrying': 'processing',
    'Completed': 'success',
    'Failed': 'error',
    'Cancelled': 'error',
  };

  /**
   * 旧状态到 V3 状态的映射表
   */
  private static readonly LEGACY_TO_V3_STATUS: Record<LegacyTaskStatus, TaskStatus> = {
    'pending': 'Pending',
    'processing': 'Processing',
    'success': 'Completed',
    'error': 'Failed',
  };

  // ==================== 从旧到新的转换 ====================

  /**
   * 将旧的 LegacyTask 转换为新的 TaskEntity
   * @param legacyTask 旧任务对象
   * @returns TaskEntity 实例
   */
  static fromLegacyTask(legacyTask: LegacyTask): TaskEntity {
    const params: CreateTaskParams = {
      type: this.mapLegacyType(legacyTask.type),
      params: {
        source: legacyTask.source,
        model: legacyTask.model || 'default',
      },
      priority: 50,
      maxRetries: 3,
      metadata: {
        legacyId: legacyTask.id,
        originalCreatedAt: legacyTask.createdAt,
      },
    };

    // 创建基础任务
    let task = TaskEntity.create(params);

    // 根据旧状态调整新任务的状态
    const targetStatus = this.LEGACY_TO_V3_STATUS[legacyTask.status];
    
    try {
      if (targetStatus === 'Pending' && task.status === 'Idle') {
        task = task.submit();
      } else if (targetStatus === 'Processing') {
        task = task.submit();
        task = task.markAsProcessing();
      } else if (targetStatus === 'Completed' && legacyTask.resultPath) {
        task = task.submit();
        task = task.markAsProcessing();
        task = task.markAsCompleted(legacyTask.resultPath);
      } else if (targetStatus === 'Failed' && legacyTask.error) {
        task = task.submit();
        task = task.markAsProcessing();
        task = task.markAsFailed(legacyTask.error);
      }
    } catch (error) {
      console.warn('Failed to transition legacy task to target status:', error);
    }

    return task;
  }

  /**
   * 将旧任务列表批量转换为 TaskEntity 数组
   * @param legacyTasks 旧任务列表
   * @returns TaskEntity 数组
   */
  static fromLegacyTaskList(legacyTasks: LegacyTask[]): TaskEntity[] {
    return legacyTasks.map(task => this.fromLegacyTask(task));
  }

  // ==================== 从新到旧的转换 ====================

  /**
   * 将新的 TaskEntity 转换回旧的 LegacyTask 格式（向后兼容）
   * @param task TaskEntity 实例
   * @returns LegacyTask 对象
   */
  static toLegacyTask(task: TaskEntity): LegacyTask {
    const plainObject = task.toPlainObject();
    
    return {
      id: plainObject.metadata?.legacyId || plainObject.id,
      type: this.mapV3Type(plainObject.type),
      source: plainObject.params.source || '',
      model: plainObject.params.model,
      status: this.V3_TO_LEGACY_STATUS[plainObject.status],
      createdAt: plainObject.metadata?.originalCreatedAt || plainObject.createdAt,
      finishedAt: plainObject.finishedAt,
      error: plainObject.error,
      resultPath: plainObject.resultPath,
    };
  }

  /**
   * 将 TaskEntity 数组批量转换为旧任务格式
   * @param tasks TaskEntity 数组
   * @returns LegacyTask 数组
   */
  static toLegacyTaskList(tasks: TaskEntity[]): LegacyTask[] {
    return tasks.map(task => this.toLegacyTask(task));
  }

  // ==================== 类型映射辅助方法 ====================

  /**
   * 映射旧任务类型到 V3 类型
   */
  private static mapLegacyType(legacyType: 'image' | 'text' | 'video'): 'image' | 'text' | 'video' {
    // 直接映射，因为类型名称相同
    return legacyType;
  }

  /**
   * 映射 V3 类型到旧任务类型
   */
  private static mapV3Type(v3Type: string): 'image' | 'text' | 'video' {
    // 处理 model_finetune 等新类型
    if (v3Type === 'model_finetune') {
      return 'image'; // 默认映射到 image
    }
    return v3Type as 'image' | 'text' | 'video';
  }

  // ==================== 状态检查辅助方法 ====================

  /**
   * 检查旧任务是否可以转换为新格式
   * @param legacyTask 旧任务
   * @returns 是否有效
   */
  static isValidLegacyTask(legacyTask: Partial<LegacyTask>): legacyTask is LegacyTask {
    return Boolean(
      legacyTask.id &&
      legacyTask.type &&
      legacyTask.source &&
      legacyTask.status &&
      legacyTask.createdAt
    );
  }

  /**
   * 检查 V3 任务是否可以转换为旧格式
   * @param task TaskEntity
   * @returns 是否有效
   */
  static canConvertToLegacy(task: TaskEntity): boolean {
    const plainObject = task.toPlainObject();
    const hasRequiredFields = Boolean(
      plainObject.id &&
      plainObject.type &&
      plainObject.params.source
    );
    
    return hasRequiredFields;
  }

  // ==================== 调试和日志 ====================

  /**
   * 比较新旧任务的差异（用于调试）
   * @param legacyTask 旧任务
   * @param v3Task V3 任务
   * @returns 差异报告
   */
  static compareTaskVersions(legacyTask: LegacyTask, v3Task: TaskEntity): Record<string, any> {
    const converted = this.toLegacyTask(v3Task);
    
    return {
      idMatch: legacyTask.id === converted.id,
      statusMatch: legacyTask.status === converted.status,
      typeMatch: legacyTask.type === converted.type,
      differences: {
        legacy: legacyTask,
        v3Converted: converted,
      },
    };
  }

  /**
   * 获取适配器统计信息
   */
  static getAdapterStats(): Record<string, any> {
    return {
      v3StatusCount: Object.keys(this.V3_TO_LEGACY_STATUS).length,
      legacyStatusCount: Object.keys(this.LEGACY_TO_V3_STATUS).length,
      supportedTypes: ['image', 'text', 'video'],
    };
  }
}

// ==================== 导出 ====================

export default LegacyAdapter;

