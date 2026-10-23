/**
 * RxDBTaskRepository - 基于 RxDB 的任务仓储实现
 * 
 * 使用 RxDB 作为持久化存储，支持响应式查询和复合索引。
 */

import { Observable, from, map, switchMap } from 'rxjs';
import { RxCollection } from 'rxdb';
import { TaskEntity, TaskStatus, TaskPlainObject } from '../domain/TaskEntity';
import { 
  ITaskRepository, 
  TaskQueryOptions, 
  TaskQueryFilter 
} from '../application/ITaskRepository';
import { getTasksCollection, TaskDocument } from '../../../shared/infrastructure/db/database';

// ==================== Helper Functions ====================

/**
 * Convert TaskPlainObject to TaskDocument (for RxDB storage)
 */
function toDocument(task: TaskPlainObject): TaskDocument {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    priority: task.priority,
    params: task.params,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    lastHeartbeatAt: task.lastHeartbeatAt,
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    error: task.error,
    resultPath: task.resultPath,
    metadata: task.metadata,
  };
}

/**
 * Convert TaskDocument to TaskPlainObject (for domain layer)
 */
function fromDocument(doc: TaskDocument): TaskPlainObject {
  return {
    id: doc.id,
    type: doc.type,
    status: doc.status,
    priority: doc.priority,
    params: doc.params as Record<string, any>,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    lastHeartbeatAt: doc.lastHeartbeatAt,
    retryCount: doc.retryCount,
    maxRetries: doc.maxRetries,
    error: doc.error,
    resultPath: doc.resultPath,
    metadata: doc.metadata as Record<string, any> | undefined,
  };
}

// ==================== Repository Implementation ====================

/**
 * RxDBTaskRepository - RxDB 实现的任务仓储
 */
export class RxDBTaskRepository implements ITaskRepository {
  private collectionPromise: Promise<RxCollection<TaskDocument>> | null = null;

  /**
   * 获取 tasks collection（懒加载）
   */
  private async getCollection(): Promise<RxCollection<TaskDocument>> {
    if (!this.collectionPromise) {
      this.collectionPromise = getTasksCollection();
    }
    return this.collectionPromise;
  }

  // ==================== 基本 CRUD ====================

  async save(task: TaskEntity): Promise<void> {
    const collection = await this.getCollection();
    const doc = toDocument(task.toPlainObject());
    await collection.upsert(doc);
  }

  async saveMany(tasks: TaskEntity[]): Promise<void> {
    const collection = await this.getCollection();
    const docs = tasks.map(t => toDocument(t.toPlainObject()));
    await collection.bulkUpsert(docs);
  }

  async findById(id: string): Promise<TaskEntity | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne(id).exec();
    if (!doc) return null;
    return TaskEntity.fromPlainObject(fromDocument(doc.toJSON()));
  }

  async delete(id: string): Promise<void> {
    const collection = await this.getCollection();
    const doc = await collection.findOne(id).exec();
    if (doc) {
      await doc.remove();
    }
  }

  async deleteMany(ids: string[]): Promise<void> {
    const collection = await this.getCollection();
    await collection.bulkRemove(ids);
  }

  // ==================== 查询方法 ====================

  async findAll(options?: TaskQueryOptions): Promise<TaskEntity[]> {
    const collection = await this.getCollection();
    
    let query = collection.find();
    
    // Apply filters
    if (options?.filter) {
      query = this.applyFilter(query, options.filter);
    }
    
    // Apply sorting
    if (options?.sort) {
      const sortObj: Record<string, 'asc' | 'desc'> = {
        [options.sort.field]: options.sort.direction,
      };
      query = query.sort(sortObj);
    }
    
    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    const docs = await query.exec();
    return docs.map(doc => TaskEntity.fromPlainObject(fromDocument(doc.toJSON())));
  }

  async findByStatus(status: TaskStatus): Promise<TaskEntity[]> {
    const collection = await this.getCollection();
    const docs = await collection.find({
      selector: { status },
    }).exec();
    return docs.map(doc => TaskEntity.fromPlainObject(fromDocument(doc.toJSON())));
  }

  async findPendingTasks(limit?: number): Promise<TaskEntity[]> {
    const collection = await this.getCollection();
    
    // Use composite index [status, priority] for efficient query
    let query = collection.find({
      selector: {
        status: { $in: ['Pending', 'Retrying'] },
      },
    }).sort({ priority: 'desc', createdAt: 'asc' });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const docs = await query.exec();
    return docs.map(doc => TaskEntity.fromPlainObject(fromDocument(doc.toJSON())));
  }

  async countByStatus(): Promise<Record<TaskStatus, number>> {
    const collection = await this.getCollection();
    const allDocs = await collection.find().exec();
    
    const counts: Record<TaskStatus, number> = {
      Idle: 0,
      Pending: 0,
      Processing: 0,
      Retrying: 0,
      Completed: 0,
      Failed: 0,
    };
    
    allDocs.forEach(doc => {
      const status = doc.status as TaskStatus;
      counts[status]++;
    });
    
    return counts;
  }

  // ==================== 故障恢复 ====================

  async findStaleTasks(heartbeatTimeout: number): Promise<TaskEntity[]> {
    const collection = await this.getCollection();
    const now = Date.now();
    const cutoffTime = now - heartbeatTimeout;
    
    // Find Processing tasks that haven't sent heartbeat recently
    const docs = await collection.find({
      selector: {
        status: 'Processing',
        $or: [
          // No heartbeat and started too long ago
          {
            lastHeartbeatAt: { $exists: false },
            startedAt: { $lt: cutoffTime },
          },
          // Heartbeat too old
          {
            lastHeartbeatAt: { $lt: cutoffTime },
          },
        ],
      },
    }).exec();
    
    return docs.map(doc => TaskEntity.fromPlainObject(fromDocument(doc.toJSON())));
  }

  // ==================== 实时订阅 ====================

  observeAll(): Observable<TaskEntity[]> {
    return from(this.getCollection()).pipe(
      switchMap(collection => 
        collection.find().$.pipe(
          map(docs => docs.map(doc => 
            TaskEntity.fromPlainObject(fromDocument(doc.toJSON()))
          ))
        )
      )
    );
  }

  observeByStatus(status: TaskStatus): Observable<TaskEntity[]> {
    return from(this.getCollection()).pipe(
      switchMap(collection => 
        collection.find({ selector: { status } }).$.pipe(
          map(docs => docs.map(doc => 
            TaskEntity.fromPlainObject(fromDocument(doc.toJSON()))
          ))
        )
      )
    );
  }

  observePendingTasks(): Observable<TaskEntity[]> {
    return from(this.getCollection()).pipe(
      switchMap(collection => 
        collection.find({
          selector: {
            status: { $in: ['Pending', 'Retrying'] },
          },
        }).sort({ priority: 'desc', createdAt: 'asc' }).$.pipe(
          map(docs => docs.map(doc => 
            TaskEntity.fromPlainObject(fromDocument(doc.toJSON()))
          ))
        )
      )
    );
  }

  observeById(id: string): Observable<TaskEntity | null> {
    return from(this.getCollection()).pipe(
      switchMap(collection => 
        collection.findOne(id).$.pipe(
          map(doc => {
            if (!doc) return null;
            return TaskEntity.fromPlainObject(fromDocument(doc.toJSON()));
          })
        )
      )
    );
  }

  // ==================== 清理方法 ====================

  async cleanupCompleted(olderThan: number): Promise<number> {
    const collection = await this.getCollection();
    const cutoffTime = Date.now() - olderThan;
    
    const docs = await collection.find({
      selector: {
        status: 'Completed',
        finishedAt: { $lt: cutoffTime },
      },
    }).exec();
    
    const ids = docs.map(doc => doc.id);
    if (ids.length > 0) {
      await collection.bulkRemove(ids);
    }
    
    return ids.length;
  }

  async cleanupFailed(olderThan: number): Promise<number> {
    const collection = await this.getCollection();
    const cutoffTime = Date.now() - olderThan;
    
    const docs = await collection.find({
      selector: {
        status: 'Failed',
        finishedAt: { $lt: cutoffTime },
      },
    }).exec();
    
    const ids = docs.map(doc => doc.id);
    if (ids.length > 0) {
      await collection.bulkRemove(ids);
    }
    
    return ids.length;
  }

  // ==================== 私有方法 ====================

  private applyFilter(query: any, filter: TaskQueryFilter): any {
    const selector: Record<string, any> = {};
    
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selector.status = { $in: filter.status };
      } else {
        selector.status = filter.status;
      }
    }
    
    if (filter.type) {
      if (Array.isArray(filter.type)) {
        selector.type = { $in: filter.type };
      } else {
        selector.type = filter.type;
      }
    }
    
    if (filter.createdAfter !== undefined) {
      selector.createdAt = { ...selector.createdAt, $gte: filter.createdAfter };
    }
    
    if (filter.createdBefore !== undefined) {
      selector.createdAt = { ...selector.createdAt, $lte: filter.createdBefore };
    }
    
    if (Object.keys(selector).length > 0) {
      return query.where(selector);
    }
    
    return query;
  }
}

// ==================== 单例导出 ====================

/**
 * 默认的 TaskRepository 实例
 * 使用单例模式，避免重复创建数据库连接
 */
let defaultRepository: RxDBTaskRepository | null = null;

/**
 * 获取默认的 TaskRepository 实例
 */
export function getTaskRepository(): ITaskRepository {
  if (!defaultRepository) {
    defaultRepository = new RxDBTaskRepository();
  }
  return defaultRepository;
}

/**
 * 重置 TaskRepository 实例（主要用于测试）
 */
export function resetTaskRepository(): void {
  defaultRepository = null;
}

