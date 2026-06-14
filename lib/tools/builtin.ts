/**
 * 内置 Tool 注册表（声明式）。
 *
 * 3 个必选工具（plan/search/execute）对应现有 SubAgent 能力：
 * - plan（规划工具）-> planAgent：锁定输入与目标，路由意图
 * - search（搜索工具）-> researchAgent：召回记忆 + 内置知识调研
 * - execute（执行工具）-> structureAgent：编排概念/MVP/计划面板
 *
 * builtIn=true，默认 enabled=true，不可删除（用户可关开关）。
 * 用户自定义工具 category='custom'，promptHint 注入加工链路 system prompt。
 */
import { createToolDefinition } from './types';
import type { ToolDefinition } from './types';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  createToolDefinition({
    id: 'tool.plan',
    name: '规划工具',
    emoji: '🧭',
    description: '锁定想法输入与目标，路由到最合适的加工方向（浏览器插件/创作工具/学习工具等）。',
    category: 'plan',
    enabled: true,
    builtIn: true,
  }),
  createToolDefinition({
    id: 'tool.search',
    name: '搜索工具',
    emoji: '🔍',
    description: '召回相关记忆与历史产物，结合内置知识调研，为想法补充论据与参照。',
    category: 'search',
    enabled: true,
    builtIn: true,
  }),
  createToolDefinition({
    id: 'tool.execute',
    name: '执行工具',
    emoji: '⚙️',
    description: '把想法编排为产品概念、MVP 路径与下一步任务，生成可执行的计划面板。',
    category: 'execute',
    enabled: true,
    builtIn: true,
  }),
];
