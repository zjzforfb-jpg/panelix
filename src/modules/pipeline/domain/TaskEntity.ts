/**
 * TaskEntity - 任务领域实体
 * 
 * 符合 DDD 原则的任务实体类，支持 V3.0 架构中的持久化作业队列和状态机管理。
 * 所有修改操作返回新的实例，保持不可变性。
 */

// ==================== 类型定义 ====================

/**
 * 任务状态枚举
 * 严格的状态机状态，用于控制任务生命周期
 */
export type TaskStatus = 
  | 'Idle'        // 空闲（初始状态）
  | 'Pending'      // 排队中
  | 'Processing'  // 处理中（持久化边界）
  | 'Retrying'    // 重试中
  | 'Completed'   // 已完成
  | 'Failed';     // 已失败

/**
 * 任务类型枚举
 * 支持扩展的任务类型
 */
export type TaskType = 
  | 'image'         // 图像生成
  | 'text'          // 文本生成
  | 'model_finetune' // 模型微调
  | 'video';        // 视频生成

/**
 * 创建任务的参数接口
 */
export interface CreateTaskParams {
  type: TaskType;
  priority?: number;  // 默认 50，范围 0-100
  params: Record<string, any>;
  maxRetries?: number;  // 默认 3
  metadata?: Record<string, any>;
}

/**
 * 序列化后的普通对象接口
 * 用于持久化到 RxDB
 */
export interface TaskPlainObject {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  params: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  lastHeartbeatAt?: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  resultPath?: string;
  metadata?: Record<string, any>;
}

/**
 * 状态转换映射表
 * 定义合法的状态转换路径
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Idle: ['Pending'],
  Pending: ['Processing'],
  Processing: ['Completed', 'Failed', 'Retrying'],
  Retrying: ['Processing'],
  Completed: [],  // 终态，不可转换
  Failed: ['Pending'],  // 允许手动重试
};

// ==================== TaskEntity 类 ====================

/**
 * TaskEntity - 任务领域实体
 * 
 * 核心职责：
 * 1. 封装任务的状态和业务逻辑
 * 2. 管理状态机的转换规则
 * 3. 支持持久化和故障恢复
 * 4. 提供不可变的业务方法
 */
export class TaskEntity {
  // ==================== 属性 ====================
  
  public readonly id: string;
  public readonly type: TaskType;
  public readonly status: TaskStatus;
  public readonly priority: number;
  public readonly params: Record<string, any>;
  public readonly createdAt: number;
  public readonly updatedAt: number;
  public readonly startedAt?: number;
  public readonly finishedAt?: number;
  public readonly lastHeartbeatAt?: number;
  public readonly retryCount: number;
  public readonly maxRetries: number;
  public readonly error?: string;
  public readonly resultPath?: string;
  public readonly metadata?: Record<string, any>;

  // ==================== 构造函数 ====================

  private constructor(data: TaskPlainObject) {
    this.id = data.id;
    this.type = data.type;
    this.status = data.status;
    this.priority = this.validatePriority(data.priority);
    this.params = data.params;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.startedAt = data.startedAt;
    this.finishedAt = data.finishedAt;
    this.lastHeartbeatAt = data.lastHeartbeatAt;
    this.retryCount = data.retryCount;
    this.maxRetries = data.maxRetries;
    this.error = data.error;
    this.resultPath = data.resultPath;
    this.metadata = data.metadata;
  }

  // ==================== 工厂方法 ====================

  /**
   * 创建新任务
   * @param params 创建参数
   * @returns 新的 TaskEntity 实例
   */
  public static create(params: CreateTaskParams): TaskEntity {
    const now = Date.now();
    const id = `task_${now}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new TaskEntity({
      id,
      type: params.type,
      status: 'Idle',
      priority: params.priority ?? 50,
      params: params.params,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      metadata: params.metadata,
    });
  }

  /**
   * 从普通对象反序列化
   * @param data 序列化的数据
   * @returns TaskEntity 实例
   */
  public static fromPlainObject(data: TaskPlainObject): TaskEntity {
    return new TaskEntity(data);
  }

  // ==================== 状态转换方法 ====================

  /**
   * 验证状态转换是否合法
   * @param newStatus 目标状态
   * @returns 是否允许转换
   */
  public canTransitionTo(newStatus: TaskStatus): boolean {
    const allowedTransitions = VALID_TRANSITIONS[this.status];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * 转换到新状态（不可变）
   * @param newStatus 目标状态
   * @returns 新的 TaskEntity 实例
   * @throws 如果状态转换不合法
   */
  public transitionTo(newStatus: TaskStatus): TaskEntity {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid state transition: ${this.status} → ${newStatus}. ` +
        `Allowed transitions from ${this.status}: ${VALID_TRANSITIONS[this.status].join(', ')}`
      );
    }

    const now = Date.now();
    const updates: Partial<TaskPlainObject> = {
      status: newStatus,
      updatedAt: now,
    };

    // 根据状态设置特定字段
    if (newStatus === 'Processing' && !this.startedAt) {
      updates.startedAt = now;
    }

    if (newStatus === 'Completed') {
      updates.finishedAt = now;
      updates.resultPath = updates.resultPath || this.resultPath;
    }

    if (newStatus === 'Failed') {
      // 保留错误信息（如果已设置）
      if (!updates.error && this.error) {
        updates.error = this.error;
      }
    }

    if (newStatus === 'Retrying') {
      updates.retryCount = this.retryCount + 1;
    }

    return new TaskEntity({
      ...this.toPlainObject(),
      ...updates,
    });
  }

  // ==================== 业务方法 ====================

  /**
   * 标记为处理中（持久化边界）
   * 这是 WAL 模式的关键点，状态转换到 Processing 时必须持久化
   * @returns 新的 TaskEntity 实例
   */
  public markAsProcessing(): TaskEntity {
    return this.transitionTo('Processing');
  }

  /**
   * 标记为完成
   * @param resultPath 结果文件路径（OPFS 路径）
   * @returns 新的 TaskEntity 实例
   */
  public markAsCompleted(resultPath: string): TaskEntity {
    if (!resultPath) {
      throw new Error('Result path is required when marking task as completed');
    }

    const updated = this.transitionTo('Completed');
    return new TaskEntity({
      ...updated.toPlainObject(),
      resultPath,
    });
  }

  /**
   * 标记为失败
   * @param error 错误信息
   * @returns 新的 TaskEntity 实例
   */
  public markAsFailed(error: string): TaskEntity {
    if (!error) {
      throw new Error('Error message is required when marking task as failed');
    }

    const updated = this.transitionTo('Failed');
    return new TaskEntity({
      ...updated.toPlainObject(),
      error,
      finishedAt: Date.now(),
    });
  }

  /**
   * 重试任务
   * 将状态从 Failed 或 Processing 转换为 Retrying，然后自动转为 Processing
   * @returns 新的 TaskEntity 实例
   */
  public retry(): TaskEntity {
    if (this.retryCount >= this.maxRetries) {
      throw new Error(
        `Cannot retry task: maximum retries (${this.maxRetries}) exceeded. ` +
        `Current retry count: ${this.retryCount}`
      );
    }

    if (this.status === 'Failed') {
      // 从 Failed 转到 Pending，然后可以重新处理
      return this.transitionTo('Pending');
    }

    if (this.status === 'Processing') {
      // 从 Processing 转到 Retrying
      return this.transitionTo('Retrying');
    }

    throw new Error(`Cannot retry task in status: ${this.status}`);
  }

  /**
   * 更新心跳时间
   * 用于故障恢复机制，Worker 在处理任务时应定期调用此方法
   * @returns 新的 TaskEntity 实例
   */
  public updateHeartbeat(): TaskEntity {
    if (this.status !== 'Processing') {
      throw new Error(`Cannot update heartbeat for task in status: ${this.status}`);
    }

    return new TaskEntity({
      ...this.toPlainObject(),
      lastHeartbeatAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * 检查是否为僵尸任务（心跳超时）
   * 用于故障恢复，检测上次崩溃遗留的 processing 任务
   * @param heartbeatTimeout 心跳超时时间（毫秒），默认 5 分钟
   * @returns 是否为僵尸任务
   */
  public isStale(heartbeatTimeout: number = 5 * 60 * 1000): boolean {
    if (this.status !== 'Processing') {
      return false;
    }

    if (!this.lastHeartbeatAt) {
      // 如果没有心跳记录，检查是否超过超时时间
      const timeSinceStart = Date.now() - (this.startedAt || this.createdAt);
      return timeSinceStart > heartbeatTimeout;
    }

    const timeSinceHeartbeat = Date.now() - this.lastHeartbeatAt;
    return timeSinceHeartbeat > heartbeatTimeout;
  }

  /**
   * 检查任务是否可以执行
   * @returns 是否可以执行
   */
  public canExecute(): boolean {
    return this.status === 'Pending' || this.status === 'Retrying';
  }

  /**
   * 检查任务是否已完成（成功或失败）
   * @returns 是否已完成
   */
  public isFinished(): boolean {
    return this.status === 'Completed' || this.status === 'Failed';
  }

  /**
   * 检查是否可以重试
   * @returns 是否可以重试
   */
  public canRetry(): boolean {
    if (this.status === 'Failed') {
      return true;  // Failed 状态总是可以重试（手动）
    }
    if (this.status === 'Processing') {
      return this.retryCount < this.maxRetries;
    }
    return false;
  }

  // ==================== 持久化方法 ====================

  /**
   * 序列化为普通对象（用于持久化）
   * @returns 普通对象
   */
  public toPlainObject(): TaskPlainObject {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      priority: this.priority,
      params: this.params,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      error: this.error,
      resultPath: this.resultPath,
      metadata: this.metadata,
    };
  }

  // ==================== 验证方法 ====================

  /**
   * 验证优先级范围
   * @param priority 优先级值
   * @returns 验证后的优先级
   * @throws 如果优先级超出范围
   */
  private validatePriority(priority: number): number {
    if (priority < 0 || priority > 100) {
      throw new Error(`Priority must be between 0 and 100, got: ${priority}`);
    }
    return priority;
  }

  // ==================== 工具方法 ====================

  /**
   * 获取任务执行时长（毫秒）
   * @returns 执行时长，如果未开始则返回 0
   */
  public getDuration(): number {
    if (!this.startedAt) {
      return 0;
    }
    const endTime = this.finishedAt || Date.now();
    return endTime - this.startedAt;
  }

  /**
   * 获取任务等待时长（毫秒）
   * @returns 等待时长，从创建到开始处理的时间
   */
  public getWaitTime(): number {
    if (!this.startedAt) {
      return Date.now() - this.createdAt;
    }
    return this.startedAt - this.createdAt;
  }

  /**
   * 创建副本并更新部分属性
   * @param updates 要更新的属性
   * @returns 新的 TaskEntity 实例
   */
  public update(updates: Partial<Pick<TaskPlainObject, 'params' | 'priority' | 'metadata'>>): TaskEntity {
    return new TaskEntity({
      ...this.toPlainObject(),
      ...updates,
      updatedAt: Date.now(),
    });
  }
}

