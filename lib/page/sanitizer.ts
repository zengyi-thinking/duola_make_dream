const REMOVABLE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'nav',
  'footer',
  '[hidden]',
  '[aria-hidden="true"]',
  '[contenteditable]',
  '[contenteditable="true"]',
].join(',');

const BLOCKED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'SVG',
  'CANVAS',
  'FORM',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
]);

export function createSanitizedDocumentClone(sourceDocument: Document): HTMLElement {
  const clone = sourceDocument.documentElement.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(REMOVABLE_SELECTORS).forEach((node) => node.remove());
  pruneNavigationHeaders(clone);
  pruneEmptyBlocks(clone);

  return clone;
}

export function extractHeadings(root: ParentNode, limit = 20): string[] {
  return Array.from(root.querySelectorAll('h1, h2, h3'))
    .map((node) => normalizeText(node.textContent ?? ''))
    .filter(Boolean)
    .slice(0, limit);
}

export function extractReadableText(root: ParentNode, maxChars: number): string {
  const host = root instanceof HTMLElement ? root : root.querySelector('body') ?? root;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let currentLength = 0;

  while (walker.nextNode()) {
    const current = walker.currentNode;
    const parent = current.parentElement;
    if (!parent || BLOCKED_TAGS.has(parent.tagName)) continue;

    const text = normalizeText(current.textContent ?? '');
    if (!text) continue;

    parts.push(text);
    currentLength += text.length + 1;
    if (currentLength >= maxChars) break;
  }

  return parts.join(' ').slice(0, maxChars).trim();
}

export function selectReadableRoot(root: HTMLElement): ParentNode {
  return root.querySelector('article, main, [role="main"]') ?? root.querySelector('body') ?? root;
}

function pruneNavigationHeaders(root: HTMLElement) {
  root.querySelectorAll('header').forEach((header) => {
    const linkCount = header.querySelectorAll('a').length;
    const hasNav = header.querySelector('nav');
    const text = normalizeText(header.textContent ?? '');

    if (hasNav || linkCount >= 4 || text.length < 24) {
      header.remove();
    }
  });
}

function pruneEmptyBlocks(root: HTMLElement) {
  root.querySelectorAll('section, div, aside').forEach((node) => {
    const text = normalizeText(node.textContent ?? '');
    if (!text && !node.querySelector('img, picture, video')) {
      node.remove();
    }
  });
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
