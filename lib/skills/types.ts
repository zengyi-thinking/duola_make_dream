/**
 * Skill 系统类型定义。
 *
 * 与 Tool 的边界（见 docs/reaction-plan.md 第三节）：
 * - Tool（lib/tools）：原子可执行函数，签名固定（params → ToolResult）；
 * - Skill：组合能力（生图 / 网页提取 / 图谱生成 / 归档），可被子 Agent 或用户手动调用，
 *   产出 graphDelta 直接并入当前 GraphView。
 *
 * 首版只支持"内置 skill"和"声明式组合内置工具/skill"的用户导入；运行时动态执行器留后续。
 * 零依赖，避免循环。
 */

export type SkillCategory = 'generate' | 'extract' | 'structure' | 'export';

export type SkillParamType = 'string' | 'number' | 'boolean' | 'object';

export interface SkillParam {
  name: string;
  type: SkillParamType;
  description: string;
  required?: boolean;
  default?: unknown;
}

/**
 * Skill 定义（存储形态）。
 * 执行体不持久化（函数不可序列化），builtIn skill 通过 builtin registry 解析 executor；
 * 用户导入的 skill 暂只支持声明式组合（compose 字段引用其它 skill/tool id）。
 */
export interface SkillDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: SkillCategory;
  inputs: SkillParam[];
  builtIn: boolean;
  /** 声明式组合：引用其它已注册 skill/tool id，按顺序执行并把 graphDelta 合并 */
  compose?: string[];
  createdAt: number;
}

export function createSkillDefinition(
  partial: Omit<SkillDefinition, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): SkillDefinition {
  return {
    id: partial.id ?? crypto.randomUUID(),
    createdAt: partial.createdAt ?? Date.now(),
    ...partial,
  };
}

/** Skill 分类 → 中文标签（设置页 SkillRegistryPanel 用） */
export function labelSkillCategory(category: SkillCategory): string {
  switch (category) {
    case 'generate': return '生成';
    case 'extract': return '提取';
    case 'structure': return '编排';
    case 'export': return '导出';
  }
}
