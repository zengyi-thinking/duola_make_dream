import type { UserProfile } from '@/lib/agent/types';
import { analyzePageContextAsync } from '@/lib/page/analyzer';
import { getLlmClient } from '@/lib/llm';
import { getActiveHarnessPatches, markHarnessPatchesApplied } from '@/lib/memory';
import { buildHarnessHint } from '../harness';
import { buildPipelineTrace, createPipelineStage } from '../pipeline';
import type { PageAnalysisResult, PageContextRecord, PageReadResult } from '@/lib/page/types';

export async function buildPageAnalysisResult(
  page: PageReadResult,
  context: PageContextRecord,
  profile: UserProfile,
): Promise<PageAnalysisResult> {
  // 与 idea 链路对称：真实 LLM + harness 自学习补丁注入
  const client = await getLlmClient();
  const activePatches = await getActiveHarnessPatches();
  const hint = buildHarnessHint(activePatches);
  const analysis = await analyzePageContextAsync(page, profile, client, hint);
  if (activePatches.length > 0) {
    await markHarnessPatchesApplied(activePatches.map((p) => p.id));
  }

  const pipelineTrace = buildPipelineTrace({
    kind: 'page',
    title: context.pageTitle,
    summary: analysis.noteCard.summary.slice(0, 80),
    sourceId: context.id,
    stages: [
      createPipelineStage('plan', '规划', '锁定页面类型与分析目标', `${page.mode} · ${page.pageType}`),
      createPipelineStage('research', '调研', '读取正文并调用模型', `${(page.mainText ?? page.textExcerpt ?? '').length} 字`),
      createPipelineStage('reflect', '反思', '结合画像与近期主题', profile.recentThemes.slice(0, 2).join(' / ') || '暂无近期主题'),
      createPipelineStage('outline', '信息编排', '组织摘要、要点和候选记忆', `${analysis.memoryCandidates.length} 条候选`),
      createPipelineStage('generate', '生成', '输出结构化分析结果', analysis.noteCard.title),
    ],
  });

  return {
    ...analysis,
    sourceContextId: context.id,
    memoryCandidates: analysis.memoryCandidates.map((candidate) => ({
      ...candidate,
      relatedContextId: context.id,
    })),
    pipelineTrace,
  };
}
