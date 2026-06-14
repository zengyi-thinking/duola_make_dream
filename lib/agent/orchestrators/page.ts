import type { UserProfile } from '@/lib/agent/types';
import { analyzePageContextAsync } from '@/lib/page/analyzer';
import { getLlmClient } from '@/lib/llm';
import { getActiveHarnessPatches, markHarnessPatchesApplied } from '@/lib/memory';
import { buildHarnessHint } from '../harness';
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

  return {
    ...analysis,
    sourceContextId: context.id,
    memoryCandidates: analysis.memoryCandidates.map((candidate) => ({
      ...candidate,
      relatedContextId: context.id,
    })),
  };
}
