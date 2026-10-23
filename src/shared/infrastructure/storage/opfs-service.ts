/**
 * OPFSService - Origin Private File System 服务
 * 
 * 单例类，提供 OPFS 文件系统的读写操作。
 * 使用 navigator.storage.getDirectory() 获取根目录句柄。
 * 
 * 特性：
 * - 单例模式，确保全局唯一实例
 * - 浏览器兼容性检查
 * - 异步文件操作
 * - 错误处理和重试机制
 */

// ==================== 类型定义 ====================

/**
 * 使用浏览器原生的 FileSystemDirectoryHandle 类型
 * 如果浏览器不支持，则使用类型断言
 */
type OPFSDirectoryHandle = FileSystemDirectoryHandle;
type OPFSFileHandle = FileSystemFileHandle;
type OPFSWritableStream = FileSystemWritableFileStream;

// ==================== OPFSService 类 ====================

/**
 * OPFSService - OPFS 文件系统服务单例
 * 
 * 提供文件保存和加载功能，所有操作都是异步的。
 */
export class OPFSService {
  private static instance: OPFSService | null = null;
  private rootHandle: OPFSDirectoryHandle | null = null;
  private initializationPromise: Promise<void> | null = null;
  private isSupported: boolean = false;

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    this.checkSupport();
  }

  /**
   * 获取单例实例
   * @returns OPFSService 实例
   */
  public static getInstance(): OPFSService {
    if (!OPFSService.instance) {
      OPFSService.instance = new OPFSService();
    }
    return OPFSService.instance;
  }

  /**
   * 检查浏览器是否支持 OPFS
   * @returns 是否支持
   */
  public checkSupport(): boolean {
    if (typeof navigator === 'undefined') {
      this.isSupported = false;
      return false;
    }

    // 检查 navigator.storage 和 getDirectory 方法
    if (
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    ) {
      this.isSupported = true;
      return true;
    }

    this.isSupported = false;
    return false;
  }

  /**
   * 获取浏览器支持状态
   * @returns 是否支持 OPFS
   */
  public isOPFSSupported(): boolean {
    return this.isSupported;
  }

  /**
   * 初始化 OPFS 根目录句柄
   * 使用懒加载模式，只在首次使用时初始化
   * @returns Promise<void>
   * @throws 如果浏览器不支持 OPFS
   */
  private async initialize(): Promise<void> {
    // 如果已经初始化，直接返回
    if (this.rootHandle) {
      return;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 检查浏览器支持
    if (!this.isSupported) {
      throw new Error(
        'OPFS is not supported in this browser. ' +
        'Please use a modern browser that supports Origin Private File System API.'
      );
    }

    // 开始初始化
    this.initializationPromise = (async () => {
      try {
        // 获取 OPFS 根目录句柄
        this.rootHandle = await navigator.storage.getDirectory() as OPFSDirectoryHandle;
      } catch (error: any) {
        this.initializationPromise = null;
        throw new Error(
          `Failed to initialize OPFS: ${error.message || 'Unknown error'}`
        );
      }
    })();

    return this.initializationPromise;
  }

  /**
   * 保存文件到 OPFS 根目录
   * @param fileName 文件名（可以包含路径，如 "images/photo.png"）
   * @param blob 要保存的 Blob 数据
   * @returns Promise<string> 返回文件路径（相对于根目录）
   * @throws 如果浏览器不支持或保存失败
   */
  public async saveFile(fileName: string, blob: Blob): Promise<string> {
    // 确保已初始化
    await this.initialize();

    if (!this.rootHandle) {
      throw new Error('OPFS root handle is not available');
    }

    // 处理路径分隔符，确保使用正斜杠
    const normalizedPath = fileName.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/').filter(part => part.length > 0);

    if (pathParts.length === 0) {
      throw new Error('Invalid file name: empty path');
    }

    try {
      // 如果路径包含目录，需要先创建目录结构
      let currentDir = this.rootHandle;
      
      // 遍历路径的目录部分（除了最后一个文件名）
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
      }

      // 获取文件名（路径的最后一部分）
      const finalFileName = pathParts[pathParts.length - 1];

      // 创建或获取文件句柄
      const fileHandle = await currentDir.getFileHandle(finalFileName, { create: true });

      // 创建可写流
      const writable = await fileHandle.createWritable({ keepExistingData: false }) as OPFSWritableStream;

      try {
        // 写入 Blob 数据
        await writable.write(blob);
        // 关闭流
        await writable.close();
      } catch (writeError: any) {
        // 如果写入失败，尝试关闭流（如果可能）
        try {
          await writable.close();
        } catch {
          // 忽略关闭错误
        }
        throw new Error(`Failed to write file: ${writeError.message || 'Unknown error'}`);
      }

      // 返回文件路径（相对于根目录）
      return normalizedPath;
    } catch (error: any) {
      if (error.message) {
        throw error;
      }
      throw new Error(
        `Failed to save file "${fileName}": ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * 从 OPFS 加载文件
   * @param filePath 文件路径（相对于根目录，如 "images/photo.png"）
   * @returns Promise<Blob> 返回文件的 Blob 数据
   * @throws 如果文件不存在或加载失败
   */
  public async loadFile(filePath: string): Promise<Blob> {
    // 确保已初始化
    await this.initialize();

    if (!this.rootHandle) {
      throw new Error('OPFS root handle is not available');
    }

    // 处理路径分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/').filter(part => part.length > 0);

    if (pathParts.length === 0) {
      throw new Error('Invalid file path: empty path');
    }

    try {
      // 遍历路径的目录部分
      let currentDir = this.rootHandle;
      
      // 遍历路径的目录部分（除了最后一个文件名）
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        currentDir = await currentDir.getDirectoryHandle(dirName);
      }

      // 获取文件名（路径的最后一部分）
      const finalFileName = pathParts[pathParts.length - 1];

      // 获取文件句柄
      const fileHandle = await currentDir.getFileHandle(finalFileName);

      // 获取文件对象
      const file = await fileHandle.getFile();

      // 返回文件的 Blob（File 是 Blob 的子类）
      return file;
    } catch (error: any) {
      // 检查是否是文件不存在的错误
      if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      throw new Error(
        `Failed to load file "${filePath}": ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns Promise<boolean> 文件是否存在
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.loadFile(filePath);
      return true;
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return false;
      }
      // 其他错误也返回 false（保守处理）
      return false;
    }
  }

  /**
   * 删除文件
   * @param filePath 文件路径
   * @returns Promise<void>
   * @throws 如果文件不存在或删除失败
   */
  public async deleteFile(filePath: string): Promise<void> {
    // 确保已初始化
    await this.initialize();

    if (!this.rootHandle) {
      throw new Error('OPFS root handle is not available');
    }

    // 处理路径分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/').filter(part => part.length > 0);

    if (pathParts.length === 0) {
      throw new Error('Invalid file path: empty path');
    }

    try {
      // 遍历路径的目录部分
      let currentDir = this.rootHandle;
      
      // 遍历路径的目录部分（除了最后一个文件名）
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        currentDir = await currentDir.getDirectoryHandle(dirName);
      }

      // 获取文件名（路径的最后一部分）
      const finalFileName = pathParts[pathParts.length - 1];

      // 删除文件
      await currentDir.removeEntry(finalFileName);
    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      throw new Error(
        `Failed to delete file "${filePath}": ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * 重置服务（主要用于测试）
   * 清除根目录句柄和初始化状态
   */
  public reset(): void {
    this.rootHandle = null;
    this.initializationPromise = null;
  }
}

// ==================== 导出单例实例 ====================

/**
 * 导出单例实例的便捷访问函数
 * @returns OPFSService 实例
 */
export const getOPFSService = (): OPFSService => {
  return OPFSService.getInstance();
};

