import type { ProductConcept } from '../types';

export function runProductCamera(concept: ProductConcept): string {
  return [
    'Design a browser extension popup UI for an original pocket-style creative assistant.',
    `Product name: ${concept.name}.`,
    `Core mood: ${concept.tagline}.`,
    `Visual direction: ${concept.visualDirection.join(', ')}.`,
    'Palette: powder blue, white, deep ink blue.',
    'Style: minimalist line art, soft paper texture, precise product framing, subtle pocket metaphor.',
    'Show: input area, concept cards, prompt card, MVP checklist, feedback chips.',
    'No copyrighted cartoon characters, no mascot resemblance, no bell, no whiskers, no round cat silhouette.',
  ].join(' ');
}
