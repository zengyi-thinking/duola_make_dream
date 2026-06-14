/**
 * FeedAgent —— 喂养链路：页面提取 + 结构化分析，产出知识节点。
 * 平移自 buildPageAnalysisResult orchestrator（analyzePageContextAsync）。
 * 调 LLM（页面分析），降级到模板分析。归档（buildArchiveNoteFromAnalysis）由 Director 在用户确认后做。
 *
 * 产品重设计修复：旧版只产 1 个 note 节点，知识图单调。现在把 PageAnalysisResult 拆成
 * note 中心节点 + 多个分析子节点（关键点/结论/产品机会/对想法/论文深读），形成丰富的知识图谱。
 */
import type { UserProfile } from '@/lib/agent/types';
import type { PageAnalysisResult, PageContextRecord, PageReadResult } from '@/lib/page/types';
import type { AgentRunResult, SubAgent } from '../types';
import { analyzePageContextAsync } from '@/lib/page/analyzer';
import { createGraphEdge, createGraphNode } from '@/lib/graph/types';
import type { GraphEdge, GraphNode } from '@/lib/graph/types';

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

    // note 中心节点（笔记主体）
    const noteNode = createGraphNode({
      type: 'note',
      title: analysis.noteCard.title || input.page.pageTitle,
      summary: analysis.noteCard.summary,
      payload: analysis,
      sourceId: input.context.id,
    });

    // 分析子节点（关键点/结论/机会/对想法/论文深读），连到 note 中心
    const { subNodes, subEdges } = buildAnalysisSubNodes(analysis, noteNode.id);

    ctx.emit({
      agentId: 'feed',
      status: 'done',
      stage: 'research',
      message: `喂养笔记就绪：${analysis.noteCard.title}（${1 + subNodes.length} 节点）`,
      partial: noteNode,
    });

    return {
      output,
      stageNode: noteNode,
      stageNodes: subNodes,
      stageEdges: subEdges,
      experience: {
        outcome: 'success',
        agentId: 'feed',
        summary: `分析 ${input.page.pageType} 页面，生成 ${1 + subNodes.length} 个知识节点`,
        lesson: `${subNodes.length} 个分析子节点 · ${ctx.client.kind === 'mock' ? 'mock 模板' : '真实 LLM'}`,
      },
    };
  },
};

/**
 * 把 PageAnalysisResult 拆成多个分析子节点，每个连到 note 中心（relates）。
 * - keyIdeas / keyTakeaways / paperInsights → research 节点（紫，分析发现）
 * - productOpportunities / usefulForCurrentIdea → idea 节点（蓝，想法/机会）
 * 空数组跳过，保证节点都有实质内容。
 */
function buildAnalysisSubNodes(
  analysis: PageAnalysisResult,
  noteId: string,
): { subNodes: GraphNode[]; subEdges: GraphEdge[] } {
  const subNodes: GraphNode[] = [];
  const subEdges: GraphEdge[] = [];

  const addSub = (
    type: GraphNode['type'],
    title: string,
    summary: string,
    payload: unknown,
  ) => {
    const node = createGraphNode({ type, title, summary, payload });
    subNodes.push(node);
    subEdges.push(createGraphEdge(node.id, noteId, 'relates'));
  };

  if (analysis.keyIdeas.length > 0) {
    addSub('research', '关键点', `${analysis.keyIdeas.length} 条 · ${firstLine(analysis.keyIdeas)}`, { kind: 'keyIdeas', items: analysis.keyIdeas });
  }
  if (analysis.keyTakeaways.length > 0) {
    addSub('research', '核心结论', `${analysis.keyTakeaways.length} 条 · ${firstLine(analysis.keyTakeaways)}`, { kind: 'keyTakeaways', items: analysis.keyTakeaways });
  }
  if (analysis.productOpportunities.length > 0) {
    addSub('idea', '产品机会', `${analysis.productOpportunities.length} 条 · ${firstLine(analysis.productOpportunities)}`, { kind: 'productOpportunities', items: analysis.productOpportunities });
  }
  if (analysis.usefulForCurrentIdea.length > 0) {
    addSub('idea', '对当前想法', `${analysis.usefulForCurrentIdea.length} 条 · ${firstLine(analysis.usefulForCurrentIdea)}`, { kind: 'usefulForCurrentIdea', items: analysis.usefulForCurrentIdea });
  }
  if (analysis.paperInsights) {
    const pi = analysis.paperInsights;
    addSub('research', '论文深读', pi.contribution || pi.problem || '论文结构化摘要', { kind: 'paperInsights', ...pi });
  }

  return { subNodes, subEdges };
}

function firstLine(items: string[]): string {
  const first = (items[0] ?? '').trim();
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}
