/**
 * FeedAgent —— 喂养链路：页面提取 + 结构化分析，产出知识节点。
 * 平移自 buildPageAnalysisResult orchestrator（analyzePageContextAsync）。
 * 调 LLM（页面分析），降级到模板分析。归档（buildArchiveNoteFromAnalysis）由 Director 在用户确认后做。
 */
import type { UserProfile } from '@/lib/agent/types';
import type { PageAnalysisResult, PageContextRecord, PageReadResult } from '@/lib/page/types';
import type { AgentRunResult, SubAgent } from '../types';
import { analyzePageContextAsync } from '@/lib/page/analyzer';
import { createGraphNode } from '@/lib/graph/types';

export interface FeedInput {
  page: PageReadResult;
  context: PageContextRecord;
  profile: UserProfile;
}
export interface FeedOutput {
  analysis: PageAnalysisResult;
}

export const feedAgent: SubAgent<FeedInput, FeedOutput> = {
  id: 'feed',
  stage: 'research',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<FeedOutput>> {
    ctx.emit({ agentId: 'feed', status: 'running', stage: 'research', message: 'Reading Page…提取与结构化分析' });
    const analysis = await analyzePageContextAsync(input.page, input.profile, ctx.client, ctx.hint);
    const output: FeedOutput = { analysis };
    const stageNode = createGraphNode({
      type: 'note',
      title: analysis.noteCard.title || input.page.pageTitle,
      summary: analysis.noteCard.summary,
      payload: analysis,
      sourceId: input.context.id,
    });
    ctx.emit({ agentId: 'feed', status: 'done', stage: 'research', message: `喂养笔记就绪：${analysis.noteCard.title}`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: {
        outcome: 'success',
        agentId: 'feed',
        summary: `分析 ${input.page.pageType} 页面`,
        lesson: `${analysis.memoryCandidates.length} 条记忆候选 · ${ctx.client.kind === 'mock' ? 'mock 模板' : '真实 LLM'}`,
      },
    };
  },
};
