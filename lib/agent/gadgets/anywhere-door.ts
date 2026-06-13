import type { ContextSnippet } from '../types';

export function runAnywhereDoor(snippets: ContextSnippet[] = []): string | undefined {
  if (snippets.length === 0) return undefined;

  return snippets
    .slice(0, 2)
    .map((snippet) => {
      const compact = snippet.selectedText.replace(/\s+/g, ' ').trim();
      return `${snippet.pageTitle} / ${compact.slice(0, 48)}`;
    })
    .join(' + ');
}
