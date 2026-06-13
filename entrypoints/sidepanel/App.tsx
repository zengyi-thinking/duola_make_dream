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
  RuntimeConfig,
} from '@/lib/agent/types';
import {
  createImageGenerateMessage,
  createMemoryGetMessage,
  createMindmapGenerateMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { getRuntimeConfig } from '@/lib/storage/local';
import CreativeTab from './tabs/CreativeTab';
import ReadingTab from './tabs/ReadingTab';
import ArchiveTab from './tabs/ArchiveTab';
import ObservationTab from './tabs/ObservationTab';
import SettingsTab from './tabs/SettingsTab';

type AppTab = 'creative' | 'reading' | 'archive' | 'observation' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('creative');
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [statusText, setStatusText] = useState<string>(POCKET_AGENT_VOICE.intro);
  const [errorText, setErrorText] = useState<string>('');
  const [noticeText, setNoticeText] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string>('');

  const [ideaText, setIdeaText] = useState('');
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedArchiveNoteIds, setSelectedArchiveNoteIds] = useState<string[]>([]);
  const [lastFeedback, setLastFeedback] = useState<string>('');

  const [pageRead, setPageRead] = useState<PageReadResult | null>(null);
  const [pageContext, setPageContext] = useState<PageContextRecord | null>(null);
  const [pageAnalysis, setPageAnalysis] = useState<PageAnalysisResult | null>(null);
  const [selectedArchiveNoteId, setSelectedArchiveNoteId] = useState<string>('');

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  const mood: PocketBuddyMood = busyAction ? 'thinking' : pageAnalysis || artifact ? 'spark' : 'warm';
  const avatarId = runtimeConfig?.avatarId ?? 'yunyu-main';
  const agentName = runtimeConfig?.agentName ?? 'PocketBuddy';

  async function refreshWorkspace() {
    await Promise.all([refreshMemory(), refreshConfig()]);
  }

  async function refreshMemory() {
    const response = await sendRuntimeMessage(createMemoryGetMessage());
    if (!response.success) {
      setErrorText(response.error ?? '读取本地记忆失败。');
      return;
    }
    setMemory(response.payload);
  }

  async function refreshConfig() {
    try {
      setRuntimeConfig(await getRuntimeConfig());
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '读取设置失败。');
    }
  }

  async function handleGenerateImage(input: Parameters<typeof createImageGenerateMessage>[0]) {
    setBusyAction(`image-${input.style}`);
    setErrorText('');
    const response = await sendRuntimeMessage(createImageGenerateMessage(input));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '图片请求生成失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText('图片请求已生成。');
    setActiveTab('observation');
  }

  async function handleGenerateMindmap(input: Parameters<typeof createMindmapGenerateMessage>[0]) {
    setBusyAction('mindmap-generate');
    setErrorText('');
    const response = await sendRuntimeMessage(createMindmapGenerateMessage(input));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '图谱生成失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText('图谱已生成。');
    setActiveTab('observation');
  }

  async function handleCopy(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNoticeText(successText);
    } catch {
      setErrorText('复制失败。');
    }
  }

  function resetWorkspaceState() {
    setStatusText(POCKET_AGENT_VOICE.intro);
    setArtifact(null);
    setIdeaText('');
    setSelectedContextIds([]);
    setSelectedArchiveNoteIds([]);
    setLastFeedback('');
    setPageRead(null);
    setPageContext(null);
    setPageAnalysis(null);
    setSelectedArchiveNoteId('');
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <PocketBuddyAvatar avatar={avatarId} mood={mood} size={52} useChibiWhenThinking />
        <div className="hero-copy">
          <p className="section-label">PocketBuddy</p>
          <h1>{agentName}</h1>
          <p className="hero-text">{statusText}</p>
          {runtimeConfig ? <p className="hero-meta">默认语气：{runtimeConfig.defaultTone}</p> : null}
        </div>
      </header>

      <nav className="tab-nav">
        {[
          { key: 'creative' as const, label: '发明' },
          { key: 'reading' as const, label: '喂养' },
          { key: 'archive' as const, label: '归档' },
          { key: 'observation' as const, label: '观察' },
          { key: 'settings' as const, label: '设置' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`tab-nav__item ${activeTab === key ? 'tab-nav__item--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {errorText ? <div className="banner banner--error">{errorText}</div> : null}
      {noticeText ? <div className="banner banner--info">{noticeText}</div> : null}

      {activeTab === 'creative' && (
        <CreativeTab
          memory={memory}
          artifact={artifact}
          ideaText={ideaText}
          setIdeaText={setIdeaText}
          selectedContextIds={selectedContextIds}
          setSelectedContextIds={setSelectedContextIds}
          selectedArchiveNoteIds={selectedArchiveNoteIds}
          setSelectedArchiveNoteIds={setSelectedArchiveNoteIds}
          lastFeedback={lastFeedback}
          setLastFeedback={setLastFeedback}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setMemory={setMemory}
          setStatusText={setStatusText}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          setArtifact={setArtifact}
          onGenerateImage={handleGenerateImage}
          onGenerateMindmap={handleGenerateMindmap}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'reading' && (
        <ReadingTab
          memory={memory}
          pageRead={pageRead}
          pageContext={pageContext}
          pageAnalysis={pageAnalysis}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setMemory={setMemory}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          setPageRead={setPageRead}
          setPageContext={setPageContext}
          setPageAnalysis={setPageAnalysis}
          setSelectedArchiveNoteId={setSelectedArchiveNoteId}
          setActiveTab={(t) => setActiveTab(t as AppTab)}
          onGenerateImage={handleGenerateImage}
          onGenerateMindmap={handleGenerateMindmap}
        />
      )}

      {activeTab === 'archive' && (
        <ArchiveTab
          memory={memory}
          selectedArchiveNoteId={selectedArchiveNoteId}
          setSelectedArchiveNoteId={setSelectedArchiveNoteId}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setMemory={setMemory}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          onGenerateImage={handleGenerateImage}
          onGenerateMindmap={handleGenerateMindmap}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'observation' && (
        <ObservationTab
          memory={memory}
          runtimeConfig={runtimeConfig}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          refreshMemory={refreshMemory}
          refreshConfig={refreshConfig}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          config={runtimeConfig}
          setConfig={setRuntimeConfig}
          setMemory={setMemory}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          refreshConfig={refreshConfig}
          resetWorkspaceState={resetWorkspaceState}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
        />
      )}
    </div>
  );
}
