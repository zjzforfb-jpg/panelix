/**
 * ITaskRepository - 任务仓储接口
 * 
 * 定义任务持久化的契约，遵循依赖倒置原则。
 * 具体实现可以是 RxDB、IndexedDB 或其他存储方案。
 */

import { Observable } from 'rxjs';
import { TaskEntity, TaskStatus, TaskType } from '../domain/TaskEntity';

// ==================== 查询参数接口 ====================

/**
 * 任务查询过滤条件
 */
export interface TaskQueryFilter {
  status?: TaskStatus | TaskStatus[];
  type?: TaskType | TaskType[];
  createdAfter?: number;
  createdBefore?: number;
}

/**
 * 任务查询排序选项
 */
export interface TaskQuerySort {
  field: 'priority' | 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
}

/**
 * 任务查询选项
 */
export interface TaskQueryOptions {
  filter?: TaskQueryFilter;
  sort?: TaskQuerySort;
  limit?: number;
}

// ==================== 仓储接口 ====================

/**
 * ITaskRepository - 任务仓储接口
 * 
 * 核心职责：
 * 1. 提供任务的 CRUD 操作
 * 2. 支持按条件查询任务
 * 3. 支持实时订阅任务变化
 * 4. 支持故障恢复（查找僵尸任务）
 */
export interface ITaskRepository {
  // ==================== 基本 CRUD ====================

  /**
   * 保存任务（新增或更新）
   * @param task 任务实体
   */
  save(task: TaskEntity): Promise<void>;

  /**
   * 批量保存任务
   * @param tasks 任务实体数组
   */
  saveMany(tasks: TaskEntity[]): Promise<void>;

  /**
   * 根据 ID 查找任务
   * @param id 任务 ID
   * @returns 任务实体，不存在时返回 null
   */
  findById(id: string): Promise<TaskEntity | null>;

  /**
   * 删除任务
   * @param id 任务 ID
   */
  delete(id: string): Promise<void>;

  /**
   * 批量删除任务
   * @param ids 任务 ID 数组
   */
  deleteMany(ids: string[]): Promise<void>;

  // ==================== 查询方法 ====================

  /**
   * 查找所有任务
   * @param options 查询选项
   * @returns 任务实体数组
   */
  findAll(options?: TaskQueryOptions): Promise<TaskEntity[]>;

  /**
   * 按状态查找任务
   * @param status 任务状态
   * @returns 任务实体数组
   */
  findByStatus(status: TaskStatus): Promise<TaskEntity[]>;

  /**
   * 查找待执行的任务（Pending + Retrying），按优先级降序排列
   * 这是任务队列的核心查询方法
   * @param limit 返回数量限制
   * @returns 任务实体数组
   */
  findPendingTasks(limit?: number): Promise<TaskEntity[]>;

  /**
   * 统计各状态的任务数量
   * @returns 状态 -> 数量的映射
   */
  countByStatus(): Promise<Record<TaskStatus, number>>;

  // ==================== 故障恢复 ====================

  /**
   * 查找僵尸任务（心跳超时的 Processing 任务）
   * 用于故障恢复，检测上次崩溃遗留的任务
   * @param heartbeatTimeout 心跳超时时间（毫秒）
   * @returns 僵尸任务数组
   */
  findStaleTasks(heartbeatTimeout: number): Promise<TaskEntity[]>;

  // ==================== 实时订阅 ====================

  /**
   * 订阅所有任务变化
   * @returns Observable<TaskEntity[]>
   */
  observeAll(): Observable<TaskEntity[]>;

  /**
   * 订阅指定状态的任务变化
   * @param status 任务状态
   * @returns Observable<TaskEntity[]>
   */
  observeByStatus(status: TaskStatus): Observable<TaskEntity[]>;

  /**
   * 订阅待执行任务（Pending + Retrying）
   * @returns Observable<TaskEntity[]>
   */
  observePendingTasks(): Observable<TaskEntity[]>;

  /**
   * 订阅单个任务的变化
   * @param id 任务 ID
   * @returns Observable<TaskEntity | null>
   */
  observeById(id: string): Observable<TaskEntity | null>;

  // ==================== 清理方法 ====================

  /**
   * 清理已完成的任务
   * @param olderThan 清理多久之前的任务（毫秒）
   * @returns 被清理的任务数量
   */
  cleanupCompleted(olderThan: number): Promise<number>;

  /**
   * 清理失败的任务
   * @param olderThan 清理多久之前的任务（毫秒）
   * @returns 被清理的任务数量
   */
  cleanupFailed(olderThan: number): Promise<number>;
}

