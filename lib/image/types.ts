export type ImageGenerationSourceType =
  | 'idea'
  | 'page-summary'
  | 'paper-note'
  | 'article-note'
  | 'mindmap';

export type ImageGenerationStyle =
  | 'line-art'
  | 'product-ui'
  | 'knowledge-card'
  | 'poster'
  | 'mindmap';

export type ImageGenerationRequest = {
  id: string;
  sourceType: ImageGenerationSourceType;
  title: string;
  content: string;
  style: ImageGenerationStyle;
  relatedNoteId?: string;
  createdAt: number;
};

export type GeneratedImageRecord = {
  id: string;
  requestId: string;
  prompt: string;
  status: 'mocked' | 'queued' | 'done' | 'failed';
  previewText?: string;
  model?: string;
  createdAt: number;
};
