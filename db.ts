import Dexie, { Table } from 'dexie';
import { Project, AppSettings, StoryBible } from './types';

// Workspace handle record type
interface WorkspaceRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
  path?: string; // Display name
  lastUsed: number;
}

// Project backup record type
export interface ProjectBackup {
  id: string;                    // backup_{projectId}_{timestamp}
  projectId: string;
  project: Project;
  createdAt: number;
  description: string;           // "自动备份" / "手动快照"
}

// Project history record type (for undo/redo)
export interface ProjectHistory {
  id: string;                    // history_{projectId}_{timestamp}
  projectId: string;
  project: Project;
  timestamp: number;
  description: string;           // "导入小说", "生成剧本EP1", "编辑分镜"
}

class AutoManjuDB extends Dexie {
  projects!: Table<Project>;
  settings!: Table<AppSettings>;
  workspace!: Table<WorkspaceRecord>;
  backups!: Table<ProjectBackup>;
  history!: Table<ProjectHistory>;

  constructor() {
    super('AutoManjuDB');
    
    // Version 1: Initial schema
    this.version(1).stores({
      projects: 'id, lastModified',
      settings: 'id'
    });
    
    // Version 2: Added workspace table
    this.version(2).stores({
      projects: 'id, lastModified',
      settings: 'id',
      workspace: 'id'
    });
    
    // Version 3: Keep backward compatibility
    this.version(3).stores({
      projects: 'id, lastModified',
      settings: 'id',
      workspace: 'id'
    });
    
    // Version 4: Added backups and history tables for data protection
    this.version(4).stores({
      projects: 'id, lastModified',
      settings: 'id',
      workspace: 'id',
      backups: 'id, projectId, createdAt',
      history: 'id, projectId, timestamp'
    });
  }
}

export const db = new AutoManjuDB();

/**
 * Reset the database completely
 * Use this when upgrade fails due to schema incompatibility
 */
export const resetDatabase = async (): Promise<void> => {
  try {
    await db.delete();
    console.log('[DB] Database reset successfully');
  } catch (error) {
    console.error('[DB] Failed to reset database:', error);
    throw error;
  }
};

/**
 * Initialize database with error handling for upgrade failures
 * Returns true if successful, false if upgrade error (user needs to reset)
 */
export const initializeDatabase = async (): Promise<boolean> => {
  try {
    await db.open();
    console.log('[DB] Database initialized successfully, version:', db.verno);
    return true;
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    if (err.name === 'UpgradeError' || err.message?.includes('primary key')) {
      console.error('[DB] Upgrade error detected:', error);
      console.warn('[DB] Database schema incompatible. User needs to reset database.');
      return false;
    }
    // For other errors, still return false to trigger reset dialog
    console.error('[DB] Database initialization failed:', error);
    return false;
  }
};

export const saveSettings = async (settings: AppSettings) => {
  await db.settings.put({ ...settings, id: 'global_settings' } as any);
};

export const loadSettings = async (): Promise<AppSettings | undefined> => {
  const s = await db.settings.get('global_settings');
  return s ? (s as unknown as AppSettings) : undefined;
};

export const saveProject = async (project: Project) => {
  await db.projects.put(project);
};

export const deleteProject = async (id: string) => {
  await db.projects.delete(id);
};

export const updateStoryBible = async (projectId: string, bible: StoryBible) => {
  const project = await db.projects.get(projectId);
  if (project) {
    project.storyBible = bible;
    await db.projects.put(project);
  }
};

export const loadProjects = async () => {
  const projects = await db.projects.orderBy('lastModified').reverse().toArray();
  // Ensure backward compatibility by initializing missing fields
  return projects.map(p => ({
      ...p,
      customStyles: p.customStyles || [],
      activeStyle: p.activeStyle || null,
      volumes: p.volumes || [],
      assets: p.assets || []
  }));
};

// --- Workspace Handle Storage ---

/**
 * Save workspace directory handle to IndexedDB
 * This allows restoring the workspace on next app launch
 */
export const saveWorkspaceHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  try {
    await db.workspace.put({
      id: 'current_workspace',
      handle: handle,
      path: handle.name,
      lastUsed: Date.now()
    });
    console.log('[Workspace] Saved handle:', handle.name);
  } catch (error) {
    console.error('[Workspace] Failed to save handle:', error);
    throw error;
  }
};

/**
 * Load and verify stored workspace handle
 * Returns null if no handle stored or permission denied
 */
export const loadWorkspaceHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const record = await db.workspace.get('current_workspace');
    if (!record?.handle) {
      console.log('[Workspace] No stored handle found');
      return null;
    }
    
    // Verify we still have permission
    const permission = await record.handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      console.log('[Workspace] Restored handle with permission:', record.path);
      return record.handle;
    }
    
    // Try to request permission again
    const newPermission = await record.handle.requestPermission({ mode: 'readwrite' });
    if (newPermission === 'granted') {
      console.log('[Workspace] Re-granted permission:', record.path);
      return record.handle;
    }
    
    console.log('[Workspace] Permission denied for stored handle');
    return null;
  } catch (error) {
    console.error('[Workspace] Failed to load handle:', error);
    return null;
  }
};

/**
 * Clear stored workspace handle
 */
export const clearWorkspaceHandle = async (): Promise<void> => {
  try {
    await db.workspace.delete('current_workspace');
    console.log('[Workspace] Cleared stored handle');
  } catch (error) {
    console.error('[Workspace] Failed to clear handle:', error);
  }
};

/**
 * Check if a workspace handle is stored
 */
export const hasStoredWorkspace = async (): Promise<boolean> => {
  const record = await db.workspace.get('current_workspace');
  return !!record?.handle;
};