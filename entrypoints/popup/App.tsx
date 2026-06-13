import { useEffect, useState } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import ToolGrid from '@/components/ToolGrid/ToolGrid';
import { POCKET_AGENT_VOICE } from '@/lib/agent/personality';
import type {
  FeedbackAction,
  MemorySummary,
  PocketBuddyMood,
  ProductArtifact,
} from '@/lib/agent/types';
import {
  createFeedbackMessage,
  createIdeaSubmitMessage,
  createMemoryDeleteMessage,
  createMemoryGetMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';

const FEEDBACK_OPTIONS: Array<{ label: string; action: FeedbackAction }> = [
  { label: '更极简', action: 'more-minimal' },
  { label: '更可爱', action: 'cuter' },
  { label: '更产品化', action: 'more-productized' },
  { label: '更有科技感', action: 'more-tech' },
  { label: '不喜欢这个方向', action: 'dislike-direction' },
];

export default function App() {
  const [ideaText, setIdeaText] = useState('');
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [statusText, setStatusText] = useState<string>(POCKET_AGENT_VOICE.intro);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);

  useEffect(() => {
    void refreshMemory();
  }, []);

  const mood: PocketBuddyMood = isSubmitting ? 'thinking' : artifact ? 'spark' : 'warm';

  async function refreshMemory() {
    const response = await sendRuntimeMessage(createMemoryGetMessage());
    if (response.success) {
      setMemory(response.payload);
      return;
    }

    setErrorText(response.error ?? '读取本地记忆失败。');
  }

  async function handleSubmit() {
    if (!ideaText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorText('');
    setStatusText('PocketAgent 正在把这句话展开成一个可讨论的小产品草图。');
    setLastFeedback('');

    const response = await sendRuntimeMessage(createIdeaSubmitMessage(ideaText, selectedContextIds));
    setIsSubmitting(false);

    if (!response.success) {
      const message = response.error ?? '这次没有成功放进口袋，请再试一次。';
      setStatusText(message);
      setErrorText(message);
      return;
    }

    setArtifact(response.payload.artifact);
    setMemory(response.payload.memorySummary);
    setStatusText(response.payload.assistantSummary);
    setIdeaText('');
    setSelectedContextIds([]);
  }

  async function handleFeedback(action: FeedbackAction) {
    if (!artifact) return;

    const response = await sendRuntimeMessage(createFeedbackMessage(artifact.id, action));
    if (!response.success) {
      setErrorText(response.error ?? '反馈没有记录成功。');
      return;
    }

    setMemory(response.payload.memorySummary);
    setLastFeedback(`已记录：${FEEDBACK_OPTIONS.find((item) => item.action === action)?.label ?? action}`);
  }

  async function handleClearMemory() {
    const response = await sendRuntimeMessage(createMemoryDeleteMessage('all'));
    if (response.success) {
      setMemory(response.payload);
      setArtifact(null);
      setStatusText('口袋已经清空。新的想法可以重新开始。');
      setLastFeedback('');
      setSelectedContextIds([]);
      setErrorText('');
      return;
    }

    setErrorText(response.error ?? '清空本地记忆失败。');
  }

  function toggleContext(id: string) {
    setSelectedContextIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      return [...current, id];
    });
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <PocketBuddyAvatar mood={mood} />
        <div className="hero-copy">
          <p className="hero-kicker">Wonder Pocket</p>
          <h1>PocketBuddy</h1>
          <p className="hero-text">{statusText}</p>
        </div>
      </header>

      <section className="idea-panel">
        <label className="section-label" htmlFor="idea-textarea">
          把想法放进口袋
        </label>
        <textarea
          id="idea-textarea"
          className="idea-textarea"
          value={ideaText}
          onChange={(event) => setIdeaText(event.target.value)}
          placeholder="例如：我想做一个能把网页划词灵感自动拆成插件创意和 MVP 的小工具"
        />
        <div className="context-select-panel">
          <div className="context-select-head">
            <span className="section-label">本次要带上的网页片段</span>
            <span className="context-count">
              {selectedContextIds.length > 0 ? `已选择 ${selectedContextIds.length} 条` : '默认不带入任何片段'}
            </span>
          </div>
          <div className="context-chip-wrap">
            {memory?.recentContextSnippets.length ? (
              memory.recentContextSnippets.map((snippet) => {
                const isSelected = selectedContextIds.includes(snippet.id);
                return (
                  <button
                    key={snippet.id}
                    type="button"
                    className={`context-chip ${isSelected ? 'context-chip--selected' : ''}`}
                    onClick={() => toggleContext(snippet.id)}
                  >
                    <span className="context-chip__title">{snippet.pageTitle}</span>
                    <span className="context-chip__text">{snippet.selectedText}</span>
                  </button>
                );
              })
            ) : (
              <p className="context-empty">还没有片段。先去网页里划词，再点“放进口袋”。</p>
            )}
          </div>
        </div>
        <div className="idea-actions">
          <span className="idea-hint">第一阶段使用本地 mock Agent，不会调用真实模型。</span>
          <LineButton variant="primary" onClick={handleSubmit} disabled={isSubmitting || !ideaText.trim()}>
            {isSubmitting ? 'PocketAgent 思考中' : '生成产品雏形'}
          </LineButton>
        </div>
        {errorText ? <p className="error-banner">{errorText}</p> : null}
      </section>

      <section className="tool-panel">
        <ToolGrid />
      </section>

      {artifact ? (
        <main className="result-stack">
          <section className="result-card">
            <div className="card-topline">Product Concept</div>
            <h2>{artifact.concept.name}</h2>
            <p className="card-tagline">{artifact.concept.tagline}</p>
            <p className="card-body">{artifact.concept.positioning}</p>
            <dl className="detail-grid">
              <div>
                <dt>核心问题</dt>
                <dd>{artifact.concept.coreProblem}</dd>
              </div>
              <div>
                <dt>目标用户</dt>
                <dd>{artifact.concept.targetUser}</dd>
              </div>
              <div>
                <dt>价值主张</dt>
                <dd>{artifact.concept.valueProposition}</dd>
              </div>
            </dl>
            <div className="chip-row">
              {artifact.concept.features.map((feature) => (
                <span key={feature} className="info-chip">
                  {feature}
                </span>
              ))}
            </div>
          </section>

          <section className="result-card">
            <div className="card-topline">Image Prompt</div>
            <pre className="prompt-block">{artifact.imagePrompt}</pre>
          </section>

          <section className="result-card">
            <div className="card-topline">MVP Plan</div>
            <ol className="bullet-list">
              {artifact.mvpPlan.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="subsection">
              <h3>下一步迭代</h3>
              <ul className="bullet-list bullet-list--plain">
                {artifact.nextTasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="result-card">
            <div className="card-topline">Feedback</div>
            <div className="feedback-grid">
              {FEEDBACK_OPTIONS.map((item) => (
                <LineButton key={item.action} variant="secondary" onClick={() => handleFeedback(item.action)}>
                  {item.label}
                </LineButton>
              ))}
            </div>
            {lastFeedback ? <p className="feedback-note">{lastFeedback}</p> : null}
          </section>
        </main>
      ) : (
        <section className="empty-card">
          <p className="empty-title">先给 PocketBuddy 一句想法。</p>
          <p className="empty-text">它会先返回一个产品概念、一个图片 Prompt，以及一个 3 步 MVP 草图。</p>
        </section>
      )}

      <aside className="memory-card">
        <div className="memory-head">
          <div>
            <p className="section-label">记忆摘要</p>
            <p className="memory-subtitle">所有记忆都保存在本地，可查看、可删除。</p>
          </div>
          <LineButton variant="ghost" onClick={handleClearMemory}>
            清空记忆
          </LineButton>
        </div>
        <div className="memory-grid">
          <div>
            <span className="memory-label">喜欢的视觉</span>
            <p>{memory?.profile.visualLikes.join('、') || '暂无'}</p>
          </div>
          <div>
            <span className="memory-label">常做方向</span>
            <p>{memory?.profile.productPreferences.join('、') || '暂无'}</p>
          </div>
          <div>
            <span className="memory-label">不喜欢</span>
            <p>{memory?.profile.visualDislikes.join('、') || '暂无'}</p>
          </div>
          <div>
            <span className="memory-label">最近放进口袋</span>
            <p>{memory?.recentContextSnippets[0] ? '可在上方选择带入本次想法' : '还没有来自网页的主动片段'}</p>
          </div>
        </div>
        <div className="memory-footer">
          <span>Ideas {memory?.counts.ideas ?? 0}</span>
          <span>Artifacts {memory?.counts.artifacts ?? 0}</span>
          <span>Feedback {memory?.counts.feedback ?? 0}</span>
          <span>Pending Patches {memory?.pendingPatches.length ?? 0}</span>
        </div>
      </aside>
    </div>
  );
}
