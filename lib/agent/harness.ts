import type { FeedbackAction, FeedbackRecord, HarnessPatch } from './types';

const DEFAULT_AUTO_APPLY_THRESHOLD = 0.5;

/**
 * 给一个 harness 补丁打分（0-1），反映"这次自调优的可信度"。
 *
 * 打分公式：
 *   score = base(riskLevel) + feedbackBoost - decayPenalty
 *   - base(riskLevel):
 *       low 0.6 / medium 0.4 / high 0.2
 *   - feedbackBoost:
 *       用户对同一方向累计点过 dislike-direction 越多分越高（每次 +0.1，上限 +0.3）
 *   - decayPenalty:
 *       超过 30 天的补丁每多 30 天 -0.1
 *
 * 评分 >= autoApplyThreshold（默认 0.5）且 !requireUserApproval → 后端自动 apply。
 */
export interface PatchEvaluation {
  score: number;
  shouldApply: boolean;
  reason: string;
  source: 'init' | 'feedback-escalation' | 'decay';
}

export function scoreHarnessPatch(
  patch: HarnessPatch,
  feedbackLog: FeedbackRecord[],
  autoApplyThreshold: number = DEFAULT_AUTO_APPLY_THRESHOLD,
): PatchEvaluation {
  const base = patch.riskLevel === 'low' ? 0.6
    : patch.riskLevel === 'medium' ? 0.4
    : 0.2;

  const dislikeCount = feedbackLog.filter((f) => f.action === 'dislike-direction').length;
  const feedbackBoost = Math.min(0.3, dislikeCount * 0.1);

  const ageDays = Math.max(0, (Date.now() - patch.createdAt) / 86_400_000);
  const decayPenalty = ageDays > 30 ? 0.1 * Math.floor((ageDays - 30) / 30) : 0;

  const raw = base + feedbackBoost - decayPenalty;
  const score = Math.max(0, Math.min(1, raw));

  const shouldApply = !patch.requireUserApproval && score >= autoApplyThreshold;

  const reasonParts = [
    `基础 ${base.toFixed(2)}（${patch.riskLevel} 风险）`,
    feedbackBoost > 0 ? `反馈加成 +${feedbackBoost.toFixed(2)}（${dislikeCount} 次 dislike）` : null,
    decayPenalty > 0 ? `时间衰减 -${decayPenalty.toFixed(2)}（${Math.floor(ageDays)} 天）` : null,
  ].filter(Boolean).join(' · ');

  const source: PatchEvaluation['source'] = feedbackBoost > 0.15
    ? 'feedback-escalation'
    : decayPenalty > 0
      ? 'decay'
      : 'init';

  return { score, shouldApply, reason: reasonParts, source };
}

/**
 * 当用户反馈"不喜欢"达到阈值时，新建一个 harness 补丁。
 * 初始 score 由"基础分 + dislike 累计加成"直接得到（用户已经踩了 N 次）。
 */
export function buildHarnessPatchFromFeedback(action: FeedbackAction): HarnessPatch | null {
  if (action !== 'dislike-direction') {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    target: 'prompt',
    scope: 'runtime-config',
    reason: '用户明确表示不喜欢当前方向，建议降低发散感并提高产品聚焦度。',
    before: '默认输出：鼓励发散并同时给出多个想法切面。',
    after: '默认输出：先聚焦一个最强产品方向，再补充 1 个保守备选。',
    riskLevel: 'low',
    requireUserApproval: false,
    status: 'pending',
    createdAt: Date.now(),
    score: undefined, // 由 background 在创建时补算
    autoApplyThreshold: DEFAULT_AUTO_APPLY_THRESHOLD,
    scoreSource: undefined,
  };
}

export function shouldCreateHarnessPatch(
  action: FeedbackAction,
  feedbackLog: FeedbackRecord[],
  pendingPatches: HarnessPatch[],
): boolean {
  if (action !== 'dislike-direction') {
    return false;
  }

  const hasPendingPromptPatch = pendingPatches.some(
    (patch) => patch.status === 'pending' && patch.target === 'prompt',
  );

  if (hasPendingPromptPatch) {
    return false;
  }

  const recentFive = feedbackLog.slice(0, 5).filter((item) => item.action === 'dislike-direction').length;
  const lastThree = feedbackLog.slice(0, 3);
  const threeConsecutive = lastThree.length === 3 && lastThree.every((item) => item.action === 'dislike-direction');

  return threeConsecutive || recentFive >= 3;
}

/**
 * 把有效（未拒绝）且通过评分筛选的 harness 补丁转成 system prompt 提示片段，
 * 供 gadget 调真实 LLM 时注入。零按钮方案下，"批准"完全由评分函数决定。
 */
export function buildHarnessHint(patches: HarnessPatch[]): string {
  const active = patches
    .filter((p) => p.status !== 'rejected')
    // 只注入真正进入"applied"或评分 >= 阈值的补丁，避免 pending 阶段的中间态污染输出
    .filter((p) => p.status === 'applied' || p.status === 'approved')
    .slice(0, 3);
  if (active.length === 0) return '';
  return `【来自用户反馈的自学习提示】请遵循以下调整方向：${active.map((p) => p.after).join('；')}`;
}

/**
 * 批量评估一组 pending 补丁，返回应该被自动 apply 的 id 列表。
 * background 在每次 idea.submit / page.analyze 之后调用。
 */
export function pickAutoApplicablePatches(
  patches: HarnessPatch[],
  feedbackLog: FeedbackRecord[],
  autoApplyThreshold: number = DEFAULT_AUTO_APPLY_THRESHOLD,
): { patchId: string; evaluation: PatchEvaluation }[] {
  return patches
    .filter((p) => p.status === 'pending')
    .map((patch) => ({ patch, evaluation: scoreHarnessPatch(patch, feedbackLog, autoApplyThreshold) }))
    .filter(({ evaluation }) => evaluation.shouldApply)
    .map(({ patch, evaluation }) => ({ patchId: patch.id, evaluation }));
}

/**
 * 把评分结果回写到 patch（持久化），便于 Observation Tab 解释"为啥这条生效了"。
 * background 在 markHarnessPatchesApplied 之前先调它。
 */
export function annotatePatchWithScore(
  patch: HarnessPatch,
  feedbackLog: FeedbackRecord[],
): HarnessPatch {
  const evaluation = scoreHarnessPatch(patch, feedbackLog);
  return {
    ...patch,
    score: evaluation.score,
    scoreSource: evaluation.source,
  };
}