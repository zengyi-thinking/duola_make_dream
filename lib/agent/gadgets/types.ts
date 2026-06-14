import type { LlmClient } from '@/lib/llm';
import type { UserProfile } from '../types';

/** gadget 执行时注入的公共依赖。 */
export interface GadgetContext {
  client: LlmClient;
  /** 自学习提示（harness 补丁）+ 语气提示，注入 system prompt。 */
  hint?: string;
  profile: UserProfile;
}

/** gadget 元数据（注册表项），供 Agent Core 列举与决策。 */
export interface GadgetMeta {
  id: string;
  name: string;
  describe: string;
  /** 是否需要 LLM client（false = 纯本地计算）。 */
  needsLlm: boolean;
}

/**
 * gadget 统一契约。
 * 注：批2 暂以注册表（GadgetMeta）形式建立元数据层；批3 Agent Core 接入调度时，
 * 各 gadget 完整迁移到 Gadget 对象的 run(input, ctx) 形态。当前 orchestrator 仍直接调各 run 函数。
 */
export interface Gadget<I, O> {
  id: string;
  name: string;
  describe: string;
  needsLlm: boolean;
  run(input: I, ctx: GadgetContext): Promise<O>;
}
