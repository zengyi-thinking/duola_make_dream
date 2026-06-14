/**
 * Tool 系统类型定义（声明式工具注册表）。
 *
 * 与 Skill 的边界（见 docs/reaction-plan.md）：
 * - Tool：原子能力声明（规划/搜索/执行 + 用户自定义提示词包），enabled 的工具
 *   注入 agent system prompt，作为「agent 感知到的可用工具/自定义规则」。
 * - Skill：组合能力（生图/网页提取等），见 lib/skills。
 *
 * 声明式阶段（用户已确认）：用户自定义工具只注入提示词（promptHint），
 * 不跑用户代码（安全可控）。运行时真执行器留后续 + 安全评审。
 * 零依赖，避免循环。
 */

export type ToolCategory = 'plan' | 'search' | 'execute' | 'custom';

export interface ToolDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: ToolCategory;
  enabled: boolean;
  builtIn: boolean;
  /** 自定义工具的提示词包：注入 agent system prompt 作为增强指令 */
  promptHint?: string;
  createdAt: number;
}

export function createToolDefinition(
  partial: Omit<ToolDefinition, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): ToolDefinition {
  return {
    ...partial,
    id: partial.id ?? crypto.randomUUID(),
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/** Tool 分类 -> 中文标签 */
export function labelToolCategory(category: ToolCategory): string {
  switch (category) {
    case 'plan': return '规划';
    case 'search': return '搜索';
    case 'execute': return '执行';
    case 'custom': return '自定义';
  }
}
