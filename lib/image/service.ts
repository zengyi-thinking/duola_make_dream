import type { RuntimeConfig } from '@/lib/agent/types';
import { generateImageWithAdapter } from './adapter';
import type { GeneratedImageRecord, ImageGenerationRequest } from './types';

export function createImageGenerationRequest(
  input: Omit<ImageGenerationRequest, 'id' | 'createdAt'>,
): ImageGenerationRequest {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...input,
  };
}

export async function runImageGeneration(
  input: Omit<ImageGenerationRequest, 'id' | 'createdAt'>,
  runtimeConfig: RuntimeConfig,
): Promise<{ request: ImageGenerationRequest; record: GeneratedImageRecord }> {
  const request = createImageGenerationRequest(input);
  const record = await generateImageWithAdapter(request, runtimeConfig);
  return { request, record };
}
