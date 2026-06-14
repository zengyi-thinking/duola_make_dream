import type { GadgetMeta } from './types';

export { runAnywhereDoor } from './anywhere-door';
export { runIdeaLens } from './idea-lens';
export { runResearchLens } from './research-lens';
export { runMemoryBread } from './memory-bread';
export { runProductCamera } from './product-camera';
export { runShrinkLight } from './shrink-light';
export { TimeNotebook } from './time-notebook';
export type { Gadget, GadgetContext, GadgetMeta } from './types';

/**
 * gadget 注册表：集中描述所有道具的能力。
 * 供 Agent Core（批3）列举可用道具、根据意图决策调度。MapImager（死代码）已移除。
 */
export const gadgetRegistry: GadgetMeta[] = [
  { id: 'idea-lens', name: '灵感放大镜', describe: '把模糊想法收束为清晰可讨论的产品概念', needsLlm: true },
  { id: 'product-camera', name: '产品相机', describe: '把产品概念翻译为图片生成 Prompt', needsLlm: true },
  { id: 'shrink-light', name: '缩小灯', describe: '把概念压缩为可立即执行的 MVP 计划', needsLlm: true },
  { id: 'memory-bread', name: '记忆面包', describe: '从用户画像提炼记忆与偏好提示', needsLlm: false },
  { id: 'anywhere-door', name: '任意门', describe: '拼接选中的网页片段作为上下文', needsLlm: false },
  { id: 'time-notebook', name: '时光笔记本', describe: '把页面分析转成归档笔记草稿', needsLlm: false },
  { id: 'research-lens', name: '调研放大镜', describe: '基于内置知识做调研发现（不联网，兜底关联图）', needsLlm: true },
];

export function listGadgets(): GadgetMeta[] {
  return gadgetRegistry.map((g) => ({ ...g }));
}
