/**
 * Bridge Module - 桥接层统一导出
 * 
 * 提供旧系统与 V3 架构之间的桥接功能
 */

export { LegacyAdapter } from './LegacyAdapter';
export type { LegacyTask, LegacyTaskStatus } from './LegacyAdapter';

export { TaskBridge } from './TaskBridge';
export type { TaskBridgeConfig } from './TaskBridge';

// 便捷导出
export { default as Adapter } from './LegacyAdapter';
export { default as Bridge } from './TaskBridge';

