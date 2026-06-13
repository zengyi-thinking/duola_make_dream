import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import type { MemorySummary } from '@/lib/agent/types';
import { createMemoryDeleteMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import { ResultCard } from '../components/ResultCard';
import { ListBlock } from '../components/ListBlock';

type LlmProvider = 'mock' | 'openai' | 'anthropic' | 'custom';
type ImageProvider = 'mock' | 'openai-dall-e' | 'custom-proxy';

interface SettingsTabProps {
  memory: MemorySummary | null;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
}

export default function SettingsTab(props: SettingsTabProps) {
  const { memory, setMemory, setErrorText, setNoticeText, busyAction, setBusyAction } = props;

  const [llmProvider, setLlmProvider] = useState<LlmProvider>('mock');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [imageProvider, setImageProvider] = useState<ImageProvider>('mock');
  const [imageApiKey, setImageApiKey] = useState('');
  const [imageEndpoint, setImageEndpoint] = useState('');
  const [showMemory, setShowMemory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function handleClearAll() {
    if (!window.confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return;
    setBusyAction('clear-all');
    const response = await sendRuntimeMessage(createMemoryDeleteMessage('all'));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '清除失败。'); return; }
    setMemory(response.payload);
    setNoticeText('所有本地数据已清除。');
  }

  return (
    <div className="tab-panel">
      {/* ===== LLM 供应商 ===== */}
      <section className="panel-card">
        <h2>LLM 供应商</h2>
        <div className="settings-section">
          <label>选择供应商</label>
          <select className="settings-select" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LlmProvider)}>
            <option value="mock">Mock（本地模拟，无需 API）</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">自定义端点</option>
          </select>
        </div>

        {llmProvider !== 'mock' ? (
          <>
            <div className="settings-section">
              <label>API Key</label>
              <input
                type="password"
                className="settings-input"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            {llmProvider === 'custom' && (
              <div className="settings-section">
                <label>API 端点</label>
                <input
                  type="text"
                  className="settings-input"
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                  placeholder="https://your-llm-proxy.example.com/v1/chat/completions"
                />
              </div>
            )}
          </>
        ) : (
          <p className="soft-text">当前使用本地 Mock Agent，不会调用任何外部 API。</p>
        )}
      </section>

      {/* ===== 图片供应商 ===== */}
      <section className="panel-card">
        <h2>图片生成</h2>
        <div className="settings-section">
          <label>选择供应商</label>
          <select className="settings-select" value={imageProvider} onChange={(e) => setImageProvider(e.target.value as ImageProvider)}>
            <option value="mock">Mock（本地模拟）</option>
            <option value="openai-dall-e">OpenAI DALL·E</option>
            <option value="custom-proxy">自定义代理</option>
          </select>
        </div>

        {imageProvider !== 'mock' ? (
          <>
            <div className="settings-section">
              <label>API Key</label>
              <input
                type="password"
                className="settings-input"
                value={imageApiKey}
                onChange={(e) => setImageApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            {imageProvider === 'custom-proxy' && (
              <div className="settings-section">
                <label>代理端点</label>
                <input
                  type="text"
                  className="settings-input"
                  value={imageEndpoint}
                  onChange={(e) => setImageEndpoint(e.target.value)}
                  placeholder="https://your-image-proxy.example.com/generate"
                />
              </div>
            )}
          </>
        ) : (
          <p className="soft-text">当前使用 Mock 图片生成，仅生成 Prompt 文本。</p>
        )}
      </section>

      {/* ===== Agent 记忆 ===== */}
      <section className="panel-card">
        <div className="panel-head">
          <h2>Agent 记忆</h2>
          <LineButton variant="ghost" onClick={() => setShowMemory(!showMemory)}>
            {showMemory ? '收起' : '查看'}
          </LineButton>
        </div>

        <div className="settings-row">
          <span>已记住偏好</span>
          <span className="settings-value">{memory?.profile.visualLikes.length ?? 0} 项</span>
        </div>
        <div className="settings-row">
          <span>已批准记忆</span>
          <span className="settings-value">{memory?.counts.approvedMemories ?? 0} 条</span>
        </div>
        <div className="settings-row">
          <span>记忆候选</span>
          <span className="settings-value">{memory?.counts.memoryCandidates ?? 0} 条</span>
        </div>

        {showMemory && memory ? (
          <div style={{ marginTop: 8 }}>
            {memory.profile.visualLikes.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <span className="memory-label">偏好</span>
                <div className="token-list" style={{ marginTop: 2 }}>
                  {memory.profile.visualLikes.map((v) => <span key={v} className="token-chip">{v}</span>)}
                </div>
              </div>
            )}
            {memory.profile.recentThemes.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <span className="memory-label">近期主题</span>
                <div className="token-list" style={{ marginTop: 2 }}>
                  {memory.profile.recentThemes.map((t) => <span key={t} className="token-chip">{t}</span>)}
                </div>
              </div>
            )}
            {memory.approvedMemories.length > 0 && (
              <div>
                <span className="memory-label">长期记忆</span>
                <div className="stack" style={{ marginTop: 4 }}>
                  {memory.approvedMemories.map((m) => (
                    <div key={m.id} className="candidate-card">
                      <div className="candidate-head">
                        <strong>{m.title}</strong>
                        <span className="status-pill status-pill--approved">{m.category}</span>
                      </div>
                      <p className="soft-text">{m.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {memory.approvedMemories.length === 0 && memory.profile.visualLikes.length === 0 && (
              <p className="soft-text">还没有积累记忆。使用越多，Agent 越懂你。</p>
            )}
          </div>
        ) : null}
      </section>

      {/* ===== 工作历史 ===== */}
      <section className="panel-card">
        <div className="panel-head">
          <h2>工作历史</h2>
          <LineButton variant="ghost" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? '收起' : '查看'}
          </LineButton>
        </div>

        <div className="settings-row">
          <span>生成创意</span>
          <span className="settings-value">{memory?.counts.ideas ?? 0} 条</span>
        </div>
        <div className="settings-row">
          <span>产品雏形</span>
          <span className="settings-value">{memory?.counts.artifacts ?? 0} 个</span>
        </div>
        <div className="settings-row">
          <span>阅读页面</span>
          <span className="settings-value">{memory?.counts.pageContexts ?? 0} 页</span>
        </div>
        <div className="settings-row">
          <span>归档笔记</span>
          <span className="settings-value">{memory?.counts.notes ?? 0} 条</span>
        </div>
        <div className="settings-row">
          <span>反馈记录</span>
          <span className="settings-value">{memory?.counts.feedback ?? 0} 条</span>
        </div>
        <div className="settings-row">
          <span>图片请求</span>
          <span className="settings-value">{memory?.counts.images ?? 0} 个</span>
        </div>
        <div className="settings-row">
          <span>图谱</span>
          <span className="settings-value">{memory?.counts.mindmaps ?? 0} 个</span>
        </div>

        {showHistory && memory && memory.archiveNotes.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span className="memory-label">最近笔记</span>
            <div className="stack" style={{ marginTop: 4 }}>
              {memory.archiveNotes.slice(0, 5).map((note) => (
                <div key={note.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--pb-line)' }}>
                  <strong style={{ fontSize: 12 }}>{note.title}</strong>
                  <p className="soft-text">{note.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== 危险操作 ===== */}
      <section className="panel-card">
        <h2>数据管理</h2>
        <div className="inline-actions">
          <LineButton variant="ghost" onClick={handleClearAll} disabled={Boolean(busyAction)}>
            清除所有本地数据
          </LineButton>
        </div>
        <p className="soft-text" style={{ marginTop: 4 }}>所有数据仅存储在本地浏览器中，不会上传到任何服务器。</p>
      </section>
    </div>
  );
}
