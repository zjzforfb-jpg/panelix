/**
 * Database - RxDB 数据库初始化
 * 
 * 使用免费的 IndexedDB 存储方案（基于 Dexie.js）。
 * 提供数据库实例的创建和导出。
 */

import { createRxDatabase, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { addRxPlugin } from 'rxdb/plugins/core';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';

// ==================== 类型定义 ====================

/**
 * Asset 文档类型
 */
export interface AssetDocument {
  id: string;
  fileName: string;
  createdAt: number;
  mimeType: string;
}

/**
 * Task 文档类型
 * 对应 TaskPlainObject，用于 RxDB 持久化
 */
export interface TaskDocument {
  id: string;
  type: 'image' | 'text' | 'model_finetune' | 'video';
  status: 'Idle' | 'Pending' | 'Processing' | 'Retrying' | 'Completed' | 'Failed';
  priority: number;
  params: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  lastHeartbeatAt?: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  resultPath?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 数据库集合类型
 */
export interface DatabaseCollections {
  assets: RxCollection<AssetDocument>;
  tasks: RxCollection<TaskDocument>;
}

/**
 * 数据库实例类型
 */
export type Database = RxDatabase<DatabaseCollections>;

// ==================== Schema 定义 ====================

/**
 * Asset Schema 定义
 * 包含 id (primary), fileName, createdAt, mimeType
 */
const assetSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100,
    },
    fileName: {
      type: 'string',
      maxLength: 500,
    },
    createdAt: {
      type: 'number',
    },
    mimeType: {
      type: 'string',
      maxLength: 100,
    },
  },
  required: ['id', 'fileName', 'createdAt', 'mimeType'],
  indexes: ['fileName', 'createdAt'],
} as const;

/**
 * Task Schema 定义
 * 支持复合索引 [status, priority] 用于高效的任务队列查询
 */
const taskSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100,
    },
    type: {
      type: 'string',
      enum: ['image', 'text', 'model_finetune', 'video'],
      maxLength: 20,
    },
    status: {
      type: 'string',
      enum: ['Idle', 'Pending', 'Processing', 'Retrying', 'Completed', 'Failed'],
      maxLength: 20,
    },
    priority: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },
    params: {
      type: 'object',
    },
    createdAt: {
      type: 'number',
    },
    updatedAt: {
      type: 'number',
    },
    startedAt: {
      type: 'number',
    },
    finishedAt: {
      type: 'number',
    },
    lastHeartbeatAt: {
      type: 'number',
    },
    retryCount: {
      type: 'number',
      default: 0,
    },
    maxRetries: {
      type: 'number',
      default: 3,
    },
    error: {
      type: 'string',
      maxLength: 2000,
    },
    resultPath: {
      type: 'string',
      maxLength: 500,
    },
    metadata: {
      type: 'object',
    },
  },
  required: ['id', 'type', 'status', 'priority', 'params', 'createdAt', 'updatedAt', 'retryCount', 'maxRetries'],
  indexes: [
    'status',
    'createdAt',
    'updatedAt',
    // Composite index for efficient queue queries (find pending tasks sorted by priority)
    ['status', 'priority'],
  ],
} as const;

// ==================== 数据库配置 ====================

/**
 * 数据库名称
 */
const DATABASE_NAME = 'automanju_db';

/**
 * 数据库版本
 */
const DATABASE_VERSION = 1;

// ==================== 插件初始化 ====================

/**
 * 初始化 RxDB 插件
 * 使用免费的更新和查询构建器插件
 */
function initializePlugins(): void {
  try {
    // 添加更新插件（用于更新文档）
    addRxPlugin(RxDBUpdatePlugin);
    // 添加查询构建器插件（用于复杂查询）
    addRxPlugin(RxDBQueryBuilderPlugin);
  } catch (error) {
    // 插件可能已经添加，忽略错误
    console.warn('RxDB plugins initialization warning:', error);
  }
}

// ==================== 数据库创建函数 ====================

/**
 * 创建并初始化 RxDB 数据库实例
 * 
 * 使用免费的 IndexedDB 存储方案（基于 Dexie.js）。
 * 
 * @returns Promise<Database> 数据库实例
 * @throws 如果数据库创建失败
 */
export async function createDatabase(): Promise<Database> {
  // 初始化插件
  initializePlugins();

  try {
    // 创建数据库实例
    // 使用免费的 Dexie 存储适配器（基于 IndexedDB）
    const database = await createRxDatabase<DatabaseCollections>({
      name: DATABASE_NAME,
      storage: getRxStorageDexie(),
    });

    // 创建 collections
    await database.addCollections({
      assets: {
        schema: assetSchema,
        migrationStrategies: {
          // 版本迁移策略
          // 当前版本为 0，未来如果需要迁移可以在这里添加策略
        },
      },
      tasks: {
        schema: taskSchema,
        migrationStrategies: {
          // 版本迁移策略
          // 当前版本为 0，未来如果需要迁移可以在这里添加策略
        },
      },
    });

    console.log('RxDB database initialized successfully');
    return database;
  } catch (error: any) {
    console.error('Failed to create RxDB database:', error);
    throw new Error(
      `Database initialization failed: ${error.message || 'Unknown error'}`
    );
  }
}

// ==================== 数据库实例导出 ====================

/**
 * 数据库实例的 Promise
 * 使用懒加载模式，只在首次访问时创建数据库
 */
let databasePromise: Promise<Database> | null = null;

/**
 * 获取数据库实例
 * 如果数据库尚未初始化，则创建新的实例
 * 
 * @returns Promise<Database> 数据库实例
 */
export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = createDatabase();
  }
  return databasePromise;
}

/**
 * 重置数据库实例（主要用于测试）
 */
export function resetDatabase(): void {
  databasePromise = null;
}

// ==================== 便捷访问函数 ====================

/**
 * 获取 assets 集合
 * 
 * @returns Promise<RxCollection<AssetDocument>> assets 集合
 */
export async function getAssetsCollection(): Promise<RxCollection<AssetDocument>> {
  const db = await getDatabase();
  return db.assets;
}

/**
 * 获取 tasks 集合
 * 
 * @returns Promise<RxCollection<TaskDocument>> tasks 集合
 */
export async function getTasksCollection(): Promise<RxCollection<TaskDocument>> {
  const db = await getDatabase();
  return db.tasks;
}

