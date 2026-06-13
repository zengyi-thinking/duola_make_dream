import type { ArchiveNote } from '@/lib/agent/types';
import type { PageAnalysisResult, PageContextRecord } from '@/lib/page/types';

export function createArchiveNoteDraft(
  analysis: PageAnalysisResult,
  context: PageContextRecord,
): ArchiveNote {
  return {
    id: crypto.randomUUID(),
    sourceType: analysis.pageType === 'paper' ? 'paper' : analysis.pageType === 'article' ? 'article' : 'article',
    title: analysis.noteCard.title,
    sourceTitle: context.pageTitle,
    origin: context.origin,
    summary: analysis.noteCard.summary,
    bullets: analysis.noteCard.bullets,
    tags: analysis.noteCard.tags,
    createdAt: Date.now(),
    savedByUser: true,
    relatedContextIds: [context.id],
  };
}
