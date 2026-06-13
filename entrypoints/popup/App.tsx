import { useEffect, useState } from 'react';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import { POCKET_AGENT_VOICE } from '@/lib/agent/personality';
import type {
  MemorySummary,
  PageAnalysisResult,
  PageContextRecord,
  PageReadResult,
  PocketBuddyMood,
  ProductArtifact,
} from '@/lib/agent/types';
import {
  createImageGenerateMessage,
  createMemoryGetMessage,
  createMindmapGenerateMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import CreativeTab from './tabs/CreativeTab';
import ReadingTab from './tabs/ReadingTab';
import ArchiveTab from './tabs/ArchiveTab';

type AppTab = 'creative' | 'reading' | 'archive';

export default function App() {
  // ===== 全局状态 =====
  const [activeTab, setActiveTab] = useState<AppTab>('creative');
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [statusText, setStatusText] = useState<string>(POCKET_AGENT_VOICE.intro);
  const [errorText, setErrorText] = useState<string>('');
  const [noticeText, setNoticeText] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string>('');

  // ===== 创意 Tab 状态 =====
  const [ideaText, setIdeaText] = useState('');
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedArchiveNoteIds, setSelectedArchiveNoteIds] = useState<string[]>([]);
  const [lastFeedback, setLastFeedback] = useState<string>('');

  // ===== 阅读 Tab 状态 =====
  const [pageRead, setPageRead] = useState<PageReadResult | null>(null);
  const [pageContext, setPageContext] = useState<PageContextRecord | null>(null);
  const [pageAnalysis, setPageAnalysis] = useState<PageAnalysisResult | null>(null);

  // ===== 归档 Tab 状态 =====
  const [selectedArchiveNoteId, setSelectedArchiveNoteId] = useState<string>('');

  // ===== 初始化 =====
  useEffect(() => { void refreshMemory(); }, []);

  const mood: PocketBuddyMood = busyAction ? 'thinking' : pageAnalysis || artifact ? 'spark' : 'warm';

  async function refreshMemory() {
    const response = await sendRuntimeMessage(createMemoryGetMessage());
    if (!response.success) { setErrorText(response.error ?? '读取本地记忆失败。'); return; }
    setMemory(response.payload);
  }

  // ===== 跨 Tab 共享操作 =====

  async function handleGenerateImage(input: {
    sourceType: 'idea' | 'page-summary' | 'paper-note' | 'article-note' | 'mindmap';
    title: string; content: string;
    style: 'line-art' | 'product-ui' | 'knowledge-card' | 'poster' | 'mindmap';
    relatedNoteId?: string;
  }) {
    setBusyAction(`image-${input.style}`);
    setErrorText('');
    const response = await sendRuntimeMessage(createImageGenerateMessage(input));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '图片请求生成失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText('图片请求已生成。当前阶段仍然使用 mock adapter。');
    setActiveTab('archive');
  }

  async function handleGenerateMindmap(input: {
    sourceId: string; sourceType: 'paper' | 'article' | 'idea';
    title: string; content: string; noteId?: string;
  }) {
    setBusyAction('mindmap-generate');
    setErrorText('');
    const response = await sendRuntimeMessage(createMindmapGenerateMessage(input));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '图谱生成失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText('图谱结构与图谱图片描述已生成。');
    setActiveTab('archive');
  }

  async function handleCopy(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNoticeText(successText);
    } catch {
      setErrorText('复制失败。当前环境可能不支持剪贴板写入。');
    }
  }

  // ===== 主布局 =====
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

      <nav className="tab-nav">
        {(['creative', 'reading', 'archive'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`tab-nav__item ${activeTab === key ? 'tab-nav__item--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {{ creative: '创意', reading: '阅读', archive: '归档' }[key]}
          </button>
        ))}
      </nav>

      {errorText ? <div className="banner banner--error">{errorText}</div> : null}
      {noticeText ? <div className="banner banner--info">{noticeText}</div> : null}

      {activeTab === 'creative' && (
        <CreativeTab
          memory={memory} artifact={artifact} ideaText={ideaText} setIdeaText={setIdeaText}
          selectedContextIds={selectedContextIds} setSelectedContextIds={setSelectedContextIds}
          selectedArchiveNoteIds={selectedArchiveNoteIds} setSelectedArchiveNoteIds={setSelectedArchiveNoteIds}
          lastFeedback={lastFeedback} setLastFeedback={setLastFeedback}
          busyAction={busyAction} setBusyAction={setBusyAction}
          setMemory={setMemory} setStatusText={setStatusText}
          setErrorText={setErrorText} setNoticeText={setNoticeText} setArtifact={setArtifact}
          onGenerateImage={handleGenerateImage} onGenerateMindmap={handleGenerateMindmap}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'reading' && (
        <ReadingTab
          memory={memory} pageRead={pageRead} pageContext={pageContext} pageAnalysis={pageAnalysis}
          busyAction={busyAction} setBusyAction={setBusyAction}
          setMemory={setMemory} setErrorText={setErrorText} setNoticeText={setNoticeText}
          setPageRead={setPageRead} setPageContext={setPageContext} setPageAnalysis={setPageAnalysis}
          setSelectedArchiveNoteId={setSelectedArchiveNoteId} setActiveTab={setActiveTab}
          onGenerateImage={handleGenerateImage} onGenerateMindmap={handleGenerateMindmap}
        />
      )}

      {activeTab === 'archive' && (
        <ArchiveTab
          memory={memory} selectedArchiveNoteId={selectedArchiveNoteId}
          setSelectedArchiveNoteId={setSelectedArchiveNoteId}
          busyAction={busyAction} setBusyAction={setBusyAction}
          setMemory={setMemory} setErrorText={setErrorText} setNoticeText={setNoticeText}
          onGenerateImage={handleGenerateImage} onGenerateMindmap={handleGenerateMindmap}
          onCopy={handleCopy}
        />
      )}
    </div>
  );
}
