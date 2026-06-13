import type { ContextSnippet } from '../types';

export function runAnywhereDoor(snippet?: ContextSnippet): string | undefined {
  if (!snippet) return undefined;

  const compact = snippet.selectedText.replace(/\s+/g, ' ').trim();
  return `${snippet.pageTitle} / ${compact.slice(0, 48)}`;
}
