import type { ToolDefinition, ToolExecutor, ToolResult } from './types';

/**
 * 百宝袋工具注册表
 *
 * 管理所有可用工具的注册、查找和执行
 * 类比哆啦A梦的四次元百宝袋 — 按需取出道具
 */

/** 已注册的工具 */
const registry = new Map<string, { definition: ToolDefinition; executor: ToolExecutor }>();

/**
 * 注册一个工具到百宝袋
 */
export function registerTool(
  definition: ToolDefinition,
  executor: ToolExecutor,
): void {
  if (registry.has(definition.id)) {
    console.warn(`[ToolBox] 工具 "${definition.id}" 已存在，将被覆盖`);
  }
  registry.set(definition.id, { definition, executor });
}

/**
 * 获取工具定义
 */
export function getTool(id: string): ToolDefinition | undefined {
  return registry.get(id)?.definition;
}

/**
 * 获取所有已注册的工具
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values()).map((t) => t.definition);
}

/**
 * 按分类获取工具
 */
export function getToolsByCategory(category: string): ToolDefinition[] {
  return getAllTools().filter((t) => t.category === category);
}

/**
 * 执行指定工具
 */
export async function executeTool(
  id: string,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
  const tool = registry.get(id);
  if (!tool) {
    return {
      status: 'error',
      error: `工具 "${id}" 不存在`,
      duration: 0,
    };
  }

  const startTime = Date.now();
  try {
    return await tool.executor(params);
  } catch (err) {
    return {
      status: 'error',
      error: String(err),
      duration: Date.now() - startTime,
    };
  }
}
