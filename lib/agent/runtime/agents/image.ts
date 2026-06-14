/**
 * ImageAgent —— 发明链路生图阶段（计划图确认后单独触发）。
 * 调图片 API（gpt-image-2 等），mock/failed/done 三态降级。
 *
 * 产品重设计修复：旧版 content 只传 concept.tagline（一句话），生图内容浅薄。
 * 现在用 planBoard 组装信息密集型中文描述（产品名/定位/用户/问题/功能模块/技术/
 * 里程碑/竞品/风险 + 信息图风格指示），让生图模型产出知识密集的 16:9 计划图片。
 */
import type { PlanBoardData, ProductConcept, RuntimeConfig } from '@/lib/agent/types';
import type { GeneratedImageRecord, ImageGenerationStyle } from '@/lib/image/types';
import type { AgentRunResult, SubAgent } from '../types';
import { runImageGeneration } from '@/lib/image/service';
import { createGraphNode } from '@/lib/graph/types';

export interface ImageInput {
  concept: ProductConcept;
  /** 信息密集型计划面板数据，用于组装丰富生图 prompt */
  planBoard?: PlanBoardData;
  style: ImageGenerationStyle;
  runtimeConfig: RuntimeConfig;
}
export interface ImageOutput {
  imageRecord: GeneratedImageRecord;
}

export const imageAgent: SubAgent<ImageInput, ImageOutput> = {
  id: 'image',
  stage: 'generate',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<ImageOutput>> {
    ctx.emit({ agentId: 'image', status: 'running', stage: 'generate', message: 'Rendering Image…调用生图模型' });
    const { record } = await runImageGeneration(
      {
        sourceType: 'idea',
        title: input.concept.name,
        content: input.planBoard ? buildDenseImageContent(input.planBoard) : input.concept.tagline,
        style: input.style,
      },
      input.runtimeConfig,
    );
    const output: ImageOutput = { imageRecord: record };
    const stageNode = createGraphNode({
      type: 'image',
      title: record.request.title || input.concept.name,
      summary: (record.prompt ?? record.status).slice(0, 80),
      payload: record,
      sourceId: record.id,
    });
    ctx.emit({ agentId: 'image', status: 'done', stage: 'generate', message: `图片 ${record.status}`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: record.status === 'done'
        ? { outcome: 'success', agentId: 'image', summary: '生图成功', lesson: '图片代理可达，信息密集 prompt 生效' }
        : { outcome: 'failure', agentId: 'image', summary: `生图 ${record.status}`, lesson: record.status === 'mocked' ? '未配置图片档，走 mock' : '生图失败，检查 endpoint/apiKey' },
    };
  },
};

/**
 * 把 PlanBoardData 组装成信息密集型中文 prompt（喂给生图模型）。
 * 覆盖产品全貌 + 信息图视觉风格指示，引导模型产出 16:9 知识密集海报。
 */
function buildDenseImageContent(board: PlanBoardData): string {
  const parts: string[] = [
    `产品名：${board.name}`,
    board.tagline ? `一句话定位：${board.tagline}` : '',
    board.positioning ? `定位描述：${board.positioning}` : '',
    board.targetUser ? `目标用户：${board.targetUser}` : '',
    board.coreProblem ? `核心问题：${board.coreProblem}` : '',
    board.valueProposition ? `价值主张：${board.valueProposition}` : '',
    board.features.length ? `核心功能：${board.features.join('、')}` : '',
    board.modules.length ? `功能模块：${board.modules.map((m) => `${m.title}（${m.detail}）`).join('；')}` : '',
    board.techStack.length ? `技术路线分层：${board.techStack.map((m) => `${m.title}（${m.detail}）`).join('；')}` : '',
    board.milestones.length ? `里程碑：${board.milestones.map((m) => `${m.title}（${m.detail}）`).join('；')}` : '',
    board.competitors.length ? `竞品对比：${board.competitors.map((m) => `${m.title}（${m.detail}）`).join('；')}` : '',
    board.risks.length ? `风险与对策：${board.risks.map((m) => `${m.title}（${m.detail}）`).join('；')}` : '',
    '视觉风格：知识密集型产品信息图海报，16:9 横版，莫兰迪蓝白粉紫柔和配色，手绘涂鸦风，'
      + '模块化网格布局，圆角卡片分区，简笔图标，流程箭头与连接线，顶部大标题与吉祥物，大量留白，'
      + '中英文混合标题与标签，信息密集但不拥挤，专业 UI/UX 信息图设计风格。',
  ].filter(Boolean);
  return parts.join('\n');
}
