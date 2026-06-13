/**
 * 百宝袋工具系统 — 类型定义
 */

/** 工具分类 */
export type ToolCategory = 'create' | 'play' | 'knowledge' | 'utility';

/** 工具执行状态 */
export type ToolStatus = 'idle' | 'running' | 'completed' | 'error';

/** 工具参数定义 */
export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 显示图标 (emoji) */
  emoji: string;
  /** 简短描述 */
  description: string;
  /** 分类 */
  category: ToolCategory;
  /** 参数列表 */
  params: ToolParam[];
  /** 是否需要网络 */
  requiresNetwork?: boolean;
}

/** 工具执行结果 */
export interface ToolResult<T = unknown> {
  /** 执行状态 */
  status: ToolStatus;
  /** 结果数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  duration: number;
}

/** 工具执行器函数签名 */
export type ToolExecutor<T = unknown> = (
  params: Record<string, unknown>,
) => Promise<ToolResult<T>>;
