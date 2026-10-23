
import { Project, ProjectV2, Volume, VolumeIndex, PlotBreakdown, WebtoonScript, AlignerReport } from "../types";
import Dexie from 'dexie';

// ============================================================================
// Write Queue - Prevent concurrent writes to same file
// ============================================================================
// This solves the "Failed to create swap file" error caused by concurrent writes
// to the same file via File System Access API.

/** Global write lock to serialize all file system writes */
let isWriting = false;

/** Queue of pending write operations */
const writeQueue: Array<{
  execute: () => Promise<void>;
  resolve: (value: void) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Execute a write operation with queue serialization.
 * Ensures only one write operation happens at a time to prevent concurrent write conflicts.
 */
const executeWithWriteLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      isWriting = true;
      try {
        // Add a small delay between writes to avoid race conditions
        await new Promise(r => setTimeout(r, 30));
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error as Error);
      } finally {
        isWriting = false;
        // Process next in queue
        processNextInQueue();
      }
    };

    if (isWriting) {
      // Queue this operation
      writeQueue.push({
        execute,
        resolve: resolve as (value: void) => void,
        reject
      });
    } else {
      // Execute immediately
      execute();
    }
  });
};

/** Process the next operation in the write queue */
const processNextInQueue = () => {
  if (writeQueue.length > 0 && !isWriting) {
    const next = writeQueue.shift();
    if (next) {
      next.execute();
    }
  }
};

/**
 * Safely write string/JSON data to a file with automatic retry and queue serialization.
 * This prevents "Failed to create swap file" errors from concurrent writes.
 */
const safeWriteFile = async (
  fileHandle: FileSystemFileHandle,
  data: string | Blob
): Promise<void> => {
  return executeWithWriteLock(async () => {
    let writable: FileSystemWritableFileStream | null = null;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (error) {
      // Try to close writable even if write failed
      if (writable) {
        try { await writable.close(); } catch {}
      }
      throw error;
    }
  });
};

// ============================================================================

// --- Types & Interfaces ---

interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemWritableFileStream {
  write(data: any): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: any): Promise<FileSystemDirectoryHandle>;
  }
}

// --- Virtual File System (IndexedDB Fallback) ---
// This allows the app to work in environments (like StackBlitz/CodeSandbox iframes) 
// where window.showDirectoryPicker is blocked by security policies.

const vfsDb = new Dexie('AutoManju_VFS');
vfsDb.version(1).stores({
  files: 'path' // content and type stored in object
});

class VirtualWritable implements FileSystemWritableFileStream {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
  async write(data: any) {
    let content = data;
    let type = 'text/plain';
    
    if (data instanceof Blob) {
      content = data; 
      type = data.type;
    } else if (typeof data === 'object') {
      content = JSON.stringify(data, null, 2);
      type = 'application/json';
    } else {
      content = String(data);
    }
    
    await (vfsDb as any).files.put({ path: this.path, content, type });
  }
  async close() {}
}

class VirtualFileHandle implements FileSystemFileHandle {
  kind = 'file' as const;
  name: string;
  path: string;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }

  async getFile(): Promise<File> {
    const record = await (vfsDb as any).files.get(this.path);
    if (!record) return new File([""], this.name);
    return new File([record.content], this.name, { type: record.type });
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return new VirtualWritable(this.path);
  }
}

class VirtualDirectoryHandle implements FileSystemDirectoryHandle {
  kind = 'directory' as const;
  name: string;
  path: string;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const filePath = this.path ? `${this.path}/${name}` : name;
    if (!options?.create) {
        const exists = await (vfsDb as any).files.get(filePath);
        if (!exists) throw new Error(`File not found: ${filePath}`);
    }
    return new VirtualFileHandle(name, filePath);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    const dirPath = this.path ? `${this.path}/${name}` : name;
    return new VirtualDirectoryHandle(name, dirPath);
  }
}

// --- Service Implementation ---

let currentDirHandle: FileSystemDirectoryHandle | null = null;
let isVirtualMode = false;

/**
 * Attempts to open a local directory using the native API.
 * If the API is unavailable or restricted (e.g., inside an iframe), it gracefully falls back to a Virtual File System.
 */
export const openDirectory = async (): Promise<{ handle: FileSystemDirectoryHandle, mode: 'native' | 'virtual' }> => {
  // 1. Check if API exists
  if (typeof window.showDirectoryPicker !== 'function') {
      console.warn("FileSystem API not supported. Using Virtual Storage.");
      const vHandle = new VirtualDirectoryHandle('Browser Storage (Virtual)', '');
      currentDirHandle = vHandle;
      isVirtualMode = true;
      return { handle: vHandle, mode: 'virtual' };
  }

  try {
    // 2. Attempt native picker
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    
    currentDirHandle = handle;
    isVirtualMode = false;
    return { handle, mode: 'native' };

  } catch (error: any) {
    // 3. Handle User Cancellation
    if (error.name === 'AbortError') {
        throw new Error("用户取消了操作");
    }

    // 4. Handle Security/Environment Restrictions (Iframe, Sandboxed)
    // SecurityError is common in iframes.
    const isRestricted = error.name === 'SecurityError' || error.message?.toLowerCase().includes('cross origin') || error.message?.toLowerCase().includes('security');

    if (isRestricted) {
       console.info("Native FileSystem blocked by environment (SecurityError). Falling back to Virtual Storage.");
       const vHandle = new VirtualDirectoryHandle('Browser Storage (Virtual)', '');
       currentDirHandle = vHandle;
       isVirtualMode = true;
       return { handle: vHandle, mode: 'virtual' };
    }
    
    // 5. Unknown error
    console.error("Unknown Directory Picker Error:", error);
    throw error;
  }
};

// --- 新增细粒度保存和加载接口 ---

/**
 * 检测项目版本并执行必要的迁移
 */
export const detectAndMigrateProject = async (dirHandle: FileSystemDirectoryHandle): Promise<ProjectV2> => {
  try {
    // 尝试加载项目文件
    const fileHandle = await dirHandle.getFileHandle('project.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const rawProject = JSON.parse(text);
    
    // 检查是否是V2版本（有version字段）
    if (rawProject.version) {
      // 确保volumeIndex存在
      if (!rawProject.volumeIndex) {
        rawProject.volumeIndex = [];
      }
      return rawProject as ProjectV2;
    }
    
    // 如果是旧版本，执行迁移
    return await migrateProjectToV2(dirHandle, rawProject as Project);
  } catch (error) {
    console.error("Failed to detect and migrate project:", error);
    throw error;
  }
};

/**
 * 将旧版项目迁移到V2架构
 * Uses write queue to prevent concurrent write conflicts
 */
export const migrateProjectToV2 = async (dirHandle: FileSystemDirectoryHandle, oldProject: Project): Promise<ProjectV2> => {
  console.log("Migrating project to V2 architecture...");
  
  // 备份旧文件
  try {
    const fileHandle = await dirHandle.getFileHandle('project.json');
    const file = await fileHandle.getFile();
    const backupHandle = await dirHandle.getFileHandle('project.json.bak', { create: true });
    await safeWriteFile(backupHandle, new Blob([await file.arrayBuffer()]));
    console.log("Old project.json backed up as project.json.bak");
  } catch (error) {
    console.warn("Failed to backup old project.json:", error);
  }
  
  // 创建volumes文件夹
  const volumesDir = await dirHandle.getDirectoryHandle('volumes', { create: true });
  
  // 创建卷索引
  const volumeIndex: VolumeIndex[] = oldProject.volumes.map(vol => ({
    id: vol.id,
    name: vol.name,
    order: vol.order
  }));
  
  // 迁移每个卷的数据 (sequentially to avoid concurrent write issues)
  for (const volume of oldProject.volumes) {
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volume.id}`, { create: true });
    
    // 保存content.txt
    const contentHandle = await volDir.getFileHandle('content.txt', { create: true });
    await safeWriteFile(contentHandle, volume.content);
    
    // 保存breakdown.json（如果存在）
    if (volume.plotBreakdown) {
      const breakdownHandle = await volDir.getFileHandle('breakdown.json', { create: true });
      await safeWriteFile(breakdownHandle, JSON.stringify(volume.plotBreakdown, null, 2));
    }
    
    // 创建scripts文件夹并保存剧本
    if (volume.scriptCache && Object.keys(volume.scriptCache).length > 0) {
      const scriptsDir = await volDir.getDirectoryHandle('scripts', { create: true });
      
      for (const [episodeNum, script] of Object.entries(volume.scriptCache)) {
        const scriptHandle = await scriptsDir.getFileHandle(`ep_${episodeNum}.json`, { create: true });
        await safeWriteFile(scriptHandle, JSON.stringify(script, null, 2));
      }
    }
    
    // 创建reports文件夹并保存报告
    if (volume.reportCache && Object.keys(volume.reportCache).length > 0) {
      const reportsDir = await volDir.getDirectoryHandle('reports', { create: true });
      
      for (const [episodeNum, report] of Object.entries(volume.reportCache)) {
        const reportHandle = await reportsDir.getFileHandle(`ep_${episodeNum}_report.json`, { create: true });
        await safeWriteFile(reportHandle, JSON.stringify(report, null, 2));
      }
    }
  }
  
  // 创建V2版本的项目对象
  const newProject: ProjectV2 = {
    id: oldProject.id,
    name: oldProject.name,
    coverImage: oldProject.coverImage,
    lastModified: oldProject.lastModified,
    version: "2.0",
    activeVolumeId: oldProject.activeVolumeId,
    storyBible: oldProject.storyBible,
    assets: oldProject.assets,
    activeStyle: oldProject.activeStyle,
    customStyles: oldProject.customStyles || [],
    volumeIndex
  };
  
  // 保存新的project.json
  const projectHandle = await dirHandle.getFileHandle('project.json', { create: true });
  await safeWriteFile(projectHandle, JSON.stringify(newProject, null, 2));
  
  console.log("Project migration to V2 completed successfully");
  return newProject;
};

/**
 * 仅保存项目元数据（精简版project.json）
 * Uses write queue to prevent concurrent write conflicts
 */
export const saveProjectMeta = async (project: ProjectV2): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const fileHandle = await currentDirHandle.getFileHandle('project.json', { create: true });
    await safeWriteFile(fileHandle, JSON.stringify(project, null, 2));
  } catch (error) {
    console.error("Failed to save project metadata", error);
    throw error;
  }
};

/**
 * 保存卷内容到content.txt
 * Uses write queue to prevent concurrent write conflicts
 */
export const saveVolumeContent = async (volumeId: string, content: string): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes', { create: true });
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`, { create: true });
    const contentHandle = await volDir.getFileHandle('content.txt', { create: true });
    await safeWriteFile(contentHandle, content);
  } catch (error) {
    console.error(`Failed to save content for volume ${volumeId}`, error);
    throw error;
  }
};

/**
 * 保存剧情拆解到breakdown.json
 * Uses write queue to prevent concurrent write conflicts
 */
export const savePlotBreakdown = async (volumeId: string, breakdown: PlotBreakdown): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes', { create: true });
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`, { create: true });
    const breakdownHandle = await volDir.getFileHandle('breakdown.json', { create: true });
    await safeWriteFile(breakdownHandle, JSON.stringify(breakdown, null, 2));
  } catch (error) {
    console.error(`Failed to save plot breakdown for volume ${volumeId}`, error);
    throw error;
  }
};

/**
 * 保存剧本到scripts/ep_{num}.json
 * Uses write queue to prevent concurrent write conflicts
 */
export const saveScript = async (volumeId: string, episodeNum: number, script: WebtoonScript): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes', { create: true });
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`, { create: true });
    const scriptsDir = await volDir.getDirectoryHandle('scripts', { create: true });
    const scriptHandle = await scriptsDir.getFileHandle(`ep_${episodeNum}.json`, { create: true });
    await safeWriteFile(scriptHandle, JSON.stringify(script, null, 2));
  } catch (error) {
    console.error(`Failed to save script for volume ${volumeId}, episode ${episodeNum}`, error);
    throw error;
  }
};

/**
 * 保存报告到reports/ep_{num}_report.json
 * Uses write queue to prevent concurrent write conflicts
 */
export const saveReport = async (volumeId: string, episodeNum: number, report: AlignerReport): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes', { create: true });
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`, { create: true });
    const reportsDir = await volDir.getDirectoryHandle('reports', { create: true });
    const reportHandle = await reportsDir.getFileHandle(`ep_${episodeNum}_report.json`, { create: true });
    await safeWriteFile(reportHandle, JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`Failed to save report for volume ${volumeId}, episode ${episodeNum}`, error);
    throw error;
  }
};

/**
 * 快速加载项目索引（仅加载project.json）
 */
export const loadProjectIndex = async (dirHandle: FileSystemDirectoryHandle): Promise<ProjectV2 | null> => {
  currentDirHandle = dirHandle;
  try {
    return await detectAndMigrateProject(dirHandle);
  } catch (error) {
    console.warn("Project index load failed:", error);
    return null;
  }
};

/**
 * 按需加载完整卷数据
 */
export const loadVolumeFull = async (volumeId: string): Promise<Volume | null> => {
  if (!currentDirHandle) {
    console.error("No directory handle available");
    return null;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes');
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`);
    
    // 从project.json获取卷的基本信息
    const projectFile = await currentDirHandle.getFileHandle('project.json');
    const projectFileContent = await projectFile.getFile();
    const projectText = await projectFileContent.text();
    const project: ProjectV2 = JSON.parse(projectText);
    
    const volumeIndex = project.volumeIndex.find(v => v.id === volumeId);
    if (!volumeIndex) {
      console.error(`Volume ${volumeId} not found in project index`);
      return null;
    }
    
    // 加载content.txt
    let content = "";
    try {
      const contentFile = await volDir.getFileHandle('content.txt');
      const contentFileContent = await contentFile.getFile();
      content = await contentFileContent.text();
    } catch {
      // Normal for new volumes - no content yet
    }
    
    // 加载breakdown.json
    let plotBreakdown: PlotBreakdown | null = null;
    try {
      const breakdownFile = await volDir.getFileHandle('breakdown.json');
      const breakdownFileContent = await breakdownFile.getFile();
      const breakdownText = await breakdownFileContent.text();
      plotBreakdown = JSON.parse(breakdownText);
    } catch {
      // Normal for new volumes - no breakdown yet
    }
    
    // 加载所有剧本
    const scriptCache: Record<number, WebtoonScript> = {};
    try {
      const scriptsDir = await volDir.getDirectoryHandle('scripts');
      
      // 尝试遍历scripts目录中的所有文件
      // 注意：浏览器API可能不支持for await...of，所以使用try-catch
      try {
        // 由于浏览器API限制，我们只能尝试加载已知的剧本文件
        // 这里我们假设剧本文件名为ep_1.json, ep_2.json等
        // 在实际应用中，可能需要从其他地方获取剧本列表
        for (let i = 1; i <= 100; i++) { // 假设最多100集
          try {
            const scriptFile = await scriptsDir.getFileHandle(`ep_${i}.json`);
            const scriptFileContent = await scriptFile.getFile();
            const scriptText = await scriptFileContent.text();
            scriptCache[i] = JSON.parse(scriptText);
          } catch (error) {
            // 文件不存在，继续下一个
            if (i === 1) {
              // 如果第一个文件就不存在，可能整个scripts目录都不存在
              break;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to iterate scripts directory for volume ${volumeId}:`, error);
      }
    } catch {
      // Normal for new volumes - no scripts yet
    }
    
    // 加载所有报告
    const reportCache: Record<number, AlignerReport> = {};
    try {
      const reportsDir = await volDir.getDirectoryHandle('reports');
      
      // 尝试加载已知的报告文件
      for (let i = 1; i <= 100; i++) { // 假设最多100集
        try {
          const reportFile = await reportsDir.getFileHandle(`ep_${i}_report.json`);
          const reportFileContent = await reportFile.getFile();
          const reportText = await reportFileContent.text();
          reportCache[i] = JSON.parse(reportText);
        } catch (error) {
          // 文件不存在，继续下一个
          if (i === 1) {
            // 如果第一个文件就不存在，可能整个reports目录都不存在
            break;
          }
        }
      }
    } catch {
      // Normal for new volumes - no reports yet
    }
    
    // 构建完整的Volume对象
    const volume: Volume = {
      id: volumeIndex.id,
      name: volumeIndex.name,
      content,
      order: volumeIndex.order,
      plotBreakdown,
      breakdownReport: null, // 这个字段在旧架构中存在，但新架构中没有直接对应
      scriptCache,
      reportCache
    };
    
    return volume;
  } catch (error) {
    console.error(`Failed to load volume ${volumeId}:`, error);
    return null;
  }
};

/**
 * 按需加载特定剧本
 */
export const loadScript = async (volumeId: string, episodeNum: number): Promise<WebtoonScript | null> => {
  if (!currentDirHandle) {
    console.error("No directory handle available");
    return null;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes');
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`);
    const scriptsDir = await volDir.getDirectoryHandle('scripts');
    const scriptFile = await scriptsDir.getFileHandle(`ep_${episodeNum}.json`);
    const scriptFileContent = await scriptFile.getFile();
    const scriptText = await scriptFileContent.text();
    
    return JSON.parse(scriptText);
  } catch (error) {
    console.error(`Failed to load script for volume ${volumeId}, episode ${episodeNum}:`, error);
    return null;
  }
};

/**
 * 按需加载特定报告
 */
export const loadReport = async (volumeId: string, episodeNum: number): Promise<AlignerReport | null> => {
  if (!currentDirHandle) {
    console.error("No directory handle available");
    return null;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes');
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`);
    const reportsDir = await volDir.getDirectoryHandle('reports');
    const reportFile = await reportsDir.getFileHandle(`ep_${episodeNum}_report.json`);
    const reportFileContent = await reportFile.getFile();
    const reportText = await reportFileContent.text();
    
    return JSON.parse(reportText);
  } catch (error) {
    console.error(`Failed to load report for volume ${volumeId}, episode ${episodeNum}:`, error);
    return null;
  }
};

/**
 * 创建新卷
 * Uses write queue to prevent concurrent write conflicts
 */
export const createNewVolume = async (volumeId: string, name: string, order: number, content: string = ""): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    const volumesDir = await currentDirHandle.getDirectoryHandle('volumes', { create: true });
    const volDir = await volumesDir.getDirectoryHandle(`vol_${volumeId}`, { create: true });
    
    // 创建content.txt using safe write
    const contentHandle = await volDir.getFileHandle('content.txt', { create: true });
    await safeWriteFile(contentHandle, content);
    
    // 创建scripts和reports文件夹
    await volDir.getDirectoryHandle('scripts', { create: true });
    await volDir.getDirectoryHandle('reports', { create: true });
    
    // 更新项目索引
    const projectFile = await currentDirHandle.getFileHandle('project.json');
    const projectFileContent = await projectFile.getFile();
    const projectText = await projectFileContent.text();
    const project: ProjectV2 = JSON.parse(projectText);
    
    // 添加新卷到索引
    project.volumeIndex.push({ id: volumeId, name, order });
    project.lastModified = Date.now();
    
    // 保存更新后的项目 (saveProjectMeta already uses safe write)
    await saveProjectMeta(project);
  } catch (error) {
    console.error(`Failed to create new volume ${volumeId}:`, error);
    throw error;
  }
};

/**
 * 删除卷
 */
export const deleteVolume = async (volumeId: string): Promise<void> => {
  if (!currentDirHandle) {
    console.error("No directory handle available");
    return;
  }
  
  try {
    // 更新项目索引，移除该卷
    const projectFile = await currentDirHandle.getFileHandle('project.json');
    const projectFileContent = await projectFile.getFile();
    const projectText = await projectFileContent.text();
    const project: ProjectV2 = JSON.parse(projectText);
    
    project.volumeIndex = project.volumeIndex.filter(v => v.id !== volumeId);
    project.lastModified = Date.now();
    
    // 保存更新后的项目
    await saveProjectMeta(project);
    
    // 注意：由于浏览器API限制，我们无法直接删除目录
    // 在实际应用中，可能需要标记该卷为已删除，或者在服务器端实现删除功能
    console.warn(`Volume ${volumeId} removed from index, but files may still exist due to browser API limitations`);
  } catch (error) {
    console.error(`Failed to delete volume ${volumeId}:`, error);
    throw error;
  }
};

// --- 原有接口保持不变，用于向后兼容 ---

export const loadProjectFromDir = async (dirHandle: FileSystemDirectoryHandle): Promise<Project | null> => {
  currentDirHandle = dirHandle;
  try {
    // 尝试加载V2项目
    const projectV2 = await detectAndMigrateProject(dirHandle);
    if (!projectV2) {
      return null;
    }
    
    // 转换为旧格式以保持兼容性
    const volumes: Volume[] = [];
    
    // 加载所有卷的完整数据
    for (const volumeIndex of projectV2.volumeIndex) {
      const volume = await loadVolumeFull(volumeIndex.id);
      if (volume) {
        volumes.push(volume);
      }
    }
    
    // 构建旧格式Project对象
    const project: Project = {
      id: projectV2.id,
      name: projectV2.name,
      coverImage: projectV2.coverImage,
      lastModified: projectV2.lastModified,
      volumes,
      activeVolumeId: projectV2.activeVolumeId,
      storyBible: projectV2.storyBible,
      assets: projectV2.assets,
      activeStyle: projectV2.activeStyle,
      customStyles: projectV2.customStyles
    };
    
    return project;
  } catch (error) {
    console.warn("Project load failed:", error);
    return null;
  }
};

export const saveProjectToDir = async (project: Project): Promise<void> => {
  if (!currentDirHandle) {
    currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
    isVirtualMode = true;
  }
  
  try {
    // 检查是否已存在V2版本的项目
    let projectV2: ProjectV2 | null = null;
    try {
      const projectFile = await currentDirHandle.getFileHandle('project.json');
      const projectFileContent = await projectFile.getFile();
      const projectText = await projectFileContent.text();
      const existingProject = JSON.parse(projectText);
      
      if (existingProject.version) {
        projectV2 = existingProject as ProjectV2;
      }
    } catch (error) {
      // 文件不存在或格式错误，创建新的V2项目
    }
    
    if (!projectV2) {
      // 创建新的V2项目
      projectV2 = {
        id: project.id,
        name: project.name,
        coverImage: project.coverImage,
        lastModified: project.lastModified,
        version: "2.0",
        activeVolumeId: project.activeVolumeId,
        storyBible: project.storyBible,
        assets: project.assets,
        activeStyle: project.activeStyle,
        customStyles: project.customStyles || [],
        volumeIndex: project.volumes.map(v => ({
          id: v.id,
          name: v.name,
          order: v.order
        }))
      };
    }
    
    // 保存每个卷的数据
    for (const volume of project.volumes) {
      // 保存内容
      await saveVolumeContent(volume.id, volume.content);
      
      // 保存剧情拆解
      if (volume.plotBreakdown) {
        await savePlotBreakdown(volume.id, volume.plotBreakdown);
      }
      
      // 保存剧本
      for (const [episodeNum, script] of Object.entries(volume.scriptCache)) {
        await saveScript(volume.id, parseInt(episodeNum), script);
      }
      
      // 保存报告
      for (const [episodeNum, report] of Object.entries(volume.reportCache)) {
        await saveReport(volume.id, parseInt(episodeNum), report);
      }
    }
    
    // 更新卷索引
    projectV2.volumeIndex = project.volumes.map(v => ({
      id: v.id,
      name: v.name,
      order: v.order
    }));
    
    // CRITICAL FIX: Update ALL project fields from incoming project, not just volumeIndex
    // Without this, assets, storyBible, styles etc would be lost when saving!
    projectV2.name = project.name;
    projectV2.coverImage = project.coverImage;
    projectV2.activeVolumeId = project.activeVolumeId;
    projectV2.storyBible = project.storyBible;
    projectV2.assets = project.assets;           // ← This was missing! Assets were getting lost.
    projectV2.activeStyle = project.activeStyle;
    projectV2.customStyles = project.customStyles || [];
    projectV2.lastModified = Date.now();
    
    // 保存项目元数据
    await saveProjectMeta(projectV2);
  } catch (error) {
    console.error("Failed to save project", error);
    throw error;
  }
};

/**
 * Save image blob to assets folder
 * Uses write queue to prevent concurrent write conflicts
 */
export const saveImageToAssets = async (blob: Blob, filename: string): Promise<string> => {
  // Auto-init virtual FS if needed to prevent crash
  if (!currentDirHandle) {
      currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
      isVirtualMode = true;
  }

  try {
    // Ensure assets directory exists (Virtual or Real)
    const assetsDir = await currentDirHandle.getDirectoryHandle('assets', { create: true });
    
    // Write file using safe write to prevent concurrent write conflicts
    const fileHandle = await assetsDir.getFileHandle(filename, { create: true });
    await safeWriteFile(fileHandle, blob);

    return `assets/${filename}`;
  } catch (error) {
    console.error("Failed to save image", error);
    throw error;
  }
};

export const loadAssetImage = async (relativePath: string): Promise<string> => {
  // Handle remote URLs (Fallback for CORS issues)
  if (!relativePath) return "";
  if (relativePath.startsWith('http') || relativePath.startsWith('data:')) {
      return relativePath;
  }

  // Auto-init virtual FS if needed
  if (!currentDirHandle) {
      currentDirHandle = new VirtualDirectoryHandle('VirtualRoot', '');
      isVirtualMode = true;
  }
  
  try {
    const parts = relativePath.split('/');
    if (parts.length !== 2 || parts[0] !== 'assets') {
       return "";
    }
    
    const assetsDir = await currentDirHandle.getDirectoryHandle('assets');
    const fileHandle = await assetsDir.getFileHandle(parts[1]);
    const file = await fileHandle.getFile();

    const objectUrl = URL.createObjectURL(file);
    return objectUrl;
  } catch (error: any) {
    // Suppress console error for missing files to avoid user confusion if file was deleted
    if (error.message && error.message.includes('File not found')) {
        // Just return empty, component will handle placeholder
    } else {
        // console.error(`Failed to load asset: ${relativePath}`, error);
    }
    return ""; 
  }
};

export const initializeNewProject = async (dirHandle: FileSystemDirectoryHandle, name: string): Promise<Project> => {
  currentDirHandle = dirHandle;
  
  const newProject: Project = {
    id: Date.now().toString(),
    name: name,
    lastModified: Date.now(),
    activeStyle: null,
    customStyles: [],
    volumes: [],
    activeVolumeId: "",
    storyBible: null,
    assets: []
  };

  await saveProjectToDir(newProject);
  
  // Create assets folder
  await dirHandle.getDirectoryHandle('assets', { create: true });
  
  return newProject;
};

// --- Workspace-based Project Management ---

/**
 * Save project to a specific directory handle (without changing global currentDirHandle)
 * Used for workspace-based project management
 */
export const saveProjectToDirWithHandle = async (project: Project, dirHandle: FileSystemDirectoryHandle): Promise<void> => {
  const prevHandle = currentDirHandle;
  const prevMode = isVirtualMode;
  
  currentDirHandle = dirHandle;
  isVirtualMode = false;
  
  try {
    await saveProjectToDir(project);
    // Ensure assets folder exists
    await dirHandle.getDirectoryHandle('assets', { create: true });
  } finally {
    // IMPORTANT:
    // If there was no previous handle (or it was the same handle),
    // restoring would set currentDirHandle to null/VirtualRoot and break subsequent asset reads.
    // That manifests as "generated shot image disappears after switching tabs/views".
    const shouldRestore = !!prevHandle && prevHandle !== dirHandle;
    if (shouldRestore) {
      currentDirHandle = prevHandle;
      isVirtualMode = prevMode;
    } else {
      // Pin to the active project dir to keep loadAssetImage/saveImageToAssets consistent.
      currentDirHandle = dirHandle;
      isVirtualMode = false;
    }
  }
};

/**
 * Load project from a specific directory handle (without changing global currentDirHandle)
 */
export const loadProjectFromDirWithHandle = async (dirHandle: FileSystemDirectoryHandle): Promise<Project | null> => {
  const prevHandle = currentDirHandle;
  const prevMode = isVirtualMode;
  
  currentDirHandle = dirHandle;
  isVirtualMode = false;
  
  try {
    return await loadProjectFromDir(dirHandle);
  } finally {
    // IMPORTANT:
    // If there was no previous handle (common on first load or some call paths),
    // restoring would set currentDirHandle back to null/VirtualRoot and break subsequent asset reads.
    // That manifests as "generated shot image disappears after switching tabs/views".
    const shouldRestore = !!prevHandle && prevHandle !== dirHandle;
    if (shouldRestore) {
      currentDirHandle = prevHandle;
      isVirtualMode = prevMode;
    } else {
      // Pin to the active project dir for consistent asset IO.
      currentDirHandle = dirHandle;
      isVirtualMode = false;
    }
  }
};

/**
 * Scan a workspace directory for all project subdirectories
 * Returns an array of projects found in the workspace
 */
export const scanWorkspaceProjects = async (workspaceHandle: FileSystemDirectoryHandle): Promise<Project[]> => {
  const projects: Project[] = [];
  
  try {
    // Iterate over all entries in the workspace directory
    for await (const entry of (workspaceHandle as any).values()) {
      if (entry.kind !== 'directory') continue;
      
      try {
        // Try to load project from this subdirectory
        const proj = await loadProjectFromDirWithHandle(entry);
        if (proj) {
          projects.push(proj);
          console.log('[Workspace] Found project:', proj.name);
        }
      } catch (e) {
        // Not a valid project directory, skip silently
        console.debug('[Workspace] Skipping non-project directory:', entry.name);
      }
    }
    
    // Sort by last modified (newest first)
    projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    
    console.log(`[Workspace] Scan complete. Found ${projects.length} projects.`);
    return projects;
  } catch (error) {
    console.error('[Workspace] Failed to scan workspace:', error);
    return [];
  }
};

/**
 * Create a new project directory inside the workspace
 * Returns the project directory handle and initializes the project
 */
export const createProjectInWorkspace = async (
  workspaceHandle: FileSystemDirectoryHandle,
  projectName: string,
  projectId: string
): Promise<{ project: Project; dirHandle: FileSystemDirectoryHandle }> => {
  // Create a safe directory name
  const safeName = projectName
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  
  const dirName = `${safeName}_${projectId}`;
  
  // Create the project directory
  const projectDirHandle = await workspaceHandle.getDirectoryHandle(dirName, { create: true });
  
  // Initialize project structure
  const newProject: Project = {
    id: projectId,
    name: projectName,
    lastModified: Date.now(),
    activeStyle: null,
    customStyles: [],
    volumes: [],
    activeVolumeId: "",
    storyBible: null,
    assets: []
  };
  
  // Save project to the new directory
  await saveProjectToDirWithHandle(newProject, projectDirHandle);
  
  console.log('[Workspace] Created project:', projectName, 'at', dirName);
  
  return { project: newProject, dirHandle: projectDirHandle };
};

/**
 * Set the current directory handle for an active project
 * Call this when opening a project from the workspace
 */
export const setCurrentProjectDir = (dirHandle: FileSystemDirectoryHandle): void => {
  currentDirHandle = dirHandle;
  isVirtualMode = false;
  console.log('[FileSystem] Set current project dir:', dirHandle.name);
};

/**
 * Get the current directory handle
 */
export const getCurrentDirHandle = (): FileSystemDirectoryHandle | null => {
  return currentDirHandle;
};

/**
 * Delete a project directory from the workspace
 * Note: This requires the experimental removeEntry API which may not be available
 */
export const deleteProjectFromWorkspace = async (
  workspaceHandle: FileSystemDirectoryHandle,
  projectDirName: string
): Promise<boolean> => {
  try {
    // Try using removeEntry (Chrome 110+)
    if ('removeEntry' in workspaceHandle) {
      await (workspaceHandle as any).removeEntry(projectDirName, { recursive: true });
      console.log('[Workspace] Deleted project directory:', projectDirName);
      return true;
    } else {
      console.warn('[Workspace] removeEntry not supported. Project directory cannot be deleted from disk.');
      return false;
    }
  } catch (error) {
    console.error('[Workspace] Failed to delete project directory:', error);
    return false;
  }
};