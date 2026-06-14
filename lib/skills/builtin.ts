/**
 * 内置 Skill 注册表。
 *
 * 内置 skill 是对现有服务（image/page/mindmap/archive/idea-lens）的声明式包装，
 * 供设置页 Skill 面板展示，以及未来子 Agent / 用户手动调用时按 id 解析 executor。
 *
 * 设计（见 docs/reaction-plan.md 第 4.4 节）：
 * - 这里只定义 SkillDefinition（声明），执行体不持久化；
 * - 用户自定义 skill 不能覆盖内置（按 id 去重，内置优先）；
 * - 真正的"动态执行器"留后续 + 安全评审，首版只支持声明式组合。
 */
import { createSkillDefinition } from './types';
import type { SkillDefinition } from './types';

export const BUILTIN_SKILLS: SkillDefinition[] = [
  createSkillDefinition({
    id: 'skill.image-generation',
    name: '图片生成',
    emoji: '🎨',
    description: '把想法/笔记/图谱生成为产品 UI、知识卡或海报图片。',
    category: 'generate',
    builtIn: true,
    inputs: [
      { name: 'title', type: 'string', description: '图片标题', required: true },
      { name: 'content', type: 'string', description: '生图内容 / Prompt', required: true },
      { name: 'style', type: 'string', description: '风格：line-art / product-ui / knowledge-card / poster', required: true },
    ],
  }),
  createSkillDefinition({
    id: 'skill.page-extraction',
    name: '页面提取',
    emoji: '📄',
    description: '读取当前页面的标题、正文、标题层级，结构化为 PageReadResult。',
    category: 'extract',
    builtIn: true,
    inputs: [],
  }),
  createSkillDefinition({
    id: 'skill.mindmap-generation',
    name: '图谱生成',
    emoji: '🗂️',
    description: '把文本 / 笔记生成为思维导图结构。',
    category: 'structure',
    builtIn: true,
    inputs: [
      { name: 'title', type: 'string', description: '图谱标题', required: true },
      { name: 'content', type: 'string', description: '图谱内容', required: true },
    ],
  }),
  createSkillDefinition({
    id: 'skill.archive-note',
    name: '归档笔记',
    emoji: '📝',
    description: '把页面分析结果归档为长期记忆笔记。',
    category: 'export',
    builtIn: true,
    inputs: [
      { name: 'analysis', type: 'object', description: '页面分析结果', required: true },
    ],
  }),
  createSkillDefinition({
    id: 'skill.idea-concept',
    name: '想法概念化',
    emoji: '💡',
    description: '把一句话想法加工为产品概念 + MVP 路径（IdeaLens + ProductCamera + ShrinkLight）。',
    category: 'generate',
    builtIn: true,
    inputs: [
      { name: 'idea', type: 'string', description: '原始想法', required: true },
    ],
  }),
];
