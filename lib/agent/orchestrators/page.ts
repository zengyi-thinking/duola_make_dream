import type { UserProfile } from '@/lib/agent/types';
import { analyzePageContext } from '@/lib/page/analyzer';
import type { PageAnalysisResult, PageContextRecord, PageReadResult } from '@/lib/page/types';

export function buildPageAnalysisResult(
  page: PageReadResult,
  context: PageContextRecord,
  profile: UserProfile,
): PageAnalysisResult {
  const analysis = analyzePageContext(page, profile);
  return {
    ...analysis,
    sourceContextId: context.id,
    memoryCandidates: analysis.memoryCandidates.map((candidate) => ({
      ...candidate,
      relatedContextId: context.id,
    })),
  };
}
