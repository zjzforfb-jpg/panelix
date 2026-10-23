/**
 * Asset - 资产领域实体
 * 
 * 符合 DDD 原则的资产实体接口。
 * 纯 TypeScript 接口，不依赖任何框架。
 */

// ==================== 类型定义 ====================

/**
 * Asset 实体接口
 * 
 * 表示一个资产（如图片、视频等）的领域模型。
 * 
 * @property id - 资产的唯一标识符
 * @property url - 用于 UI 展示的 Blob URL（通过 URL.createObjectURL 创建）
 * @property storagePath - 资产在 OPFS 中的存储路径
 */
export interface Asset {
  id: string;
  url: string;
  storagePath: string;
}

/**
 * 创建 Asset 的参数接口
 * 
 * 用于工厂函数，允许灵活创建 Asset 实例。
 */
export interface CreateAssetParams {
  id?: string;  // 可选，如果不提供则自动生成
  file: File;
  storagePath: string;  // OPFS 中的存储路径
}

// ==================== 工具函数 ====================

/**
 * 生成唯一的资产 ID
 * 
 * @returns 唯一的 ID 字符串
 */
function generateAssetId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `asset_${timestamp}_${random}`;
}

/**
 * 从 File 对象创建 Blob URL
 * 
 * @param file - File 对象
 * @returns Blob URL 字符串
 */
function createBlobUrl(file: File): string {
  return URL.createObjectURL(file);
}

// ==================== 工厂函数 ====================

/**
 * 创建 Asset 实体
 * 
 * 工厂函数，从 File 对象创建 Asset 实例。
 * 会自动生成 ID、Blob URL 和存储路径。
 * 
 * @param file - File 对象
 * @returns Asset 实体
 * 
 * @example
 * ```typescript
 * const file = new File(['content'], 'image.png', { type: 'image/png' });
 * const asset = createAsset(file);
 * // asset.storagePath 将基于 file.name 生成，如 "assets/image.png"
 * ```
 */
export function createAsset(file: File): Asset {
  // 验证参数
  if (!file) {
    throw new Error('File is required to create an Asset');
  }

  // 生成 ID
  const assetId = generateAssetId();

  // 创建 Blob URL
  const blobUrl = createBlobUrl(file);

  // 从文件名生成存储路径
  // 默认存储在 assets 目录下，使用原始文件名
  const fileName = file.name || `file_${Date.now()}`;
  const storagePath = `assets/${fileName}`;

  // 创建并返回 Asset 实例
  return {
    id: assetId,
    url: blobUrl,
    storagePath,
  };
}

/**
 * 创建 Asset 实体（带自定义参数）
 * 
 * 允许指定自定义的 ID 和存储路径。
 * 
 * @param params - 创建参数
 * @param params.file - File 对象
 * @param params.storagePath - OPFS 中的存储路径（如 "images/photo.png"）
 * @param params.id - 可选的 ID，如果不提供则自动生成
 * @returns Asset 实体
 * 
 * @example
 * ```typescript
 * const file = new File(['content'], 'image.png', { type: 'image/png' });
 * const asset = createAssetWithParams({
 *   file,
 *   storagePath: 'images/custom-image.png',
 *   id: 'custom-id'
 * });
 * ```
 */
export function createAssetWithParams(params: CreateAssetParams): Asset {
  const { file, storagePath, id } = params;

  // 验证参数
  if (!file) {
    throw new Error('File is required to create an Asset');
  }

  if (!storagePath || storagePath.trim().length === 0) {
    throw new Error('Storage path is required to create an Asset');
  }

  // 生成 ID（如果未提供）
  const assetId = id || generateAssetId();

  // 创建 Blob URL
  const blobUrl = createBlobUrl(file);

  // 创建并返回 Asset 实例
  return {
    id: assetId,
    url: blobUrl,
    storagePath: storagePath.trim(),
  };
}

/**
 * 从已有数据创建 Asset 实体
 * 
 * 用于从持久化数据（如数据库）恢复 Asset 实例。
 * 注意：此函数不会创建新的 Blob URL，因为文件可能已经从内存中释放。
 * 
 * @param data - Asset 数据
 * @returns Asset 实体
 */
export function createAssetFromData(data: {
  id: string;
  url?: string;  // 可选，如果未提供则需要在外部重新创建
  storagePath: string;
}): Asset {
  if (!data.id) {
    throw new Error('ID is required to create an Asset from data');
  }

  if (!data.storagePath || data.storagePath.trim().length === 0) {
    throw new Error('Storage path is required to create an Asset from data');
  }

  return {
    id: data.id,
    url: data.url || '',  // 如果未提供 URL，返回空字符串（需要在外部重新创建）
    storagePath: data.storagePath.trim(),
  };
}

/**
 * 释放 Asset 的 Blob URL
 * 
 * 当 Asset 不再需要时，应该调用此函数释放 Blob URL 以释放内存。
 * 
 * @param asset - Asset 实体
 */
export function revokeAssetUrl(asset: Asset): void {
  if (asset.url && asset.url.startsWith('blob:')) {
    URL.revokeObjectURL(asset.url);
  }
}

/**
 * 检查 Asset 是否有效
 * 
 * @param asset - Asset 实体
 * @returns 是否有效
 */
export function isValidAsset(asset: Asset): boolean {
  return !!(
    asset &&
    asset.id &&
    asset.id.trim().length > 0 &&
    asset.storagePath &&
    asset.storagePath.trim().length > 0
  );
}

