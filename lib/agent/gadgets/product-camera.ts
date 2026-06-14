import type { ProductConcept } from '../types';
import type { LlmClient } from '@/lib/llm';

/** 把产品概念翻译为图片生成 Prompt（英文），失败抛错。 */
export async function runProductCamera(concept: ProductConcept, client: LlmClient, hint?: string): Promise<string> {
  const prompt = await generatePromptWithLlm(concept, client, hint);
  if (prompt) return prompt;
  throw new Error('ProductCamera 未能生成图片 Prompt');
}

async function generatePromptWithLlm(concept: ProductConcept, client: LlmClient, hint?: string): Promise<string | null> {
  if (hint) console.log('[ProductCamera] 应用自学习提示:', hint.slice(0, 50));
  const system = [
    hint,
    '你是图像生成 Prompt 专家。根据产品概念输出一段高质量的英文 image generation prompt。',
    '风格约束：极简线条插画、蓝白配色、口袋感、柔和纸质纹理、产品级构图。',
    '禁止：任何版权卡通形象、吉祥物、铃铛、胡须、圆胖猫轮廓。',
    '直接输出 prompt 文本，不要解释、不要 JSON、不要引号包裹。',
  ].join('');

  const userContent = [
    `产品名：${concept.name}`,
    `定位：${concept.tagline}`,
    `目标用户：${concept.targetUser}`,
    `视觉方向：${concept.visualDirection.join('、')}`,
    `功能：${concept.features.join('、')}`,
  ].join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 600,
  });

  const text = response.text.trim();
  return text ? text : null;
}
