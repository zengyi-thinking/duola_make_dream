import { TimeNotebook } from '../gadgets/time-notebook';
import type { PageAnalysisResult, PageContextRecord } from '@/lib/page/types';

export function buildArchiveNoteFromAnalysis(
  analysis: PageAnalysisResult,
  context: PageContextRecord,
) {
  return TimeNotebook.createArchiveNoteDraft(analysis, context);
}
