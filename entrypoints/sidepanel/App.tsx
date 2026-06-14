import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import Aurora from '@/components/Aurora/Aurora';
import TabIndicator from '@/components/TabIndicator/TabIndicator';
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
  createArtifactListMessage,
  createImageGenerateMessage,
  createImageListMessage,
  createMemoryGetMessage,
  createMindmapGenerateMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import type { GeneratedImageRecord } from '@/lib/image/types';
import { getRuntimeConfig } from '@/lib/storage/local';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import CreativeTab from './tabs/CreativeTab';
import ReadingTab from './tabs/ReadingTab';
import ArchiveTab from './tabs/ArchiveTab';
import ObservationTab from './tabs/ObservationTab';
import SettingsTab from './tabs/SettingsTab';

type AppTab = 'creative' | 'reading' | 'archive' | 'observation' | 'settings';

const TAB_DEFS: Array<{ key: AppTab; label: string }> = [
  { key: 'creative', label: '发明' },
  { key: 'reading', label: '喂养' },
  { key: 'archive', label: '记忆' },
  { key: 'observation', label: '观察' },
  { key: 'settings', label: '设置' },
];

export default function App() {
  const reduced = usePocketReducedMotion();
  const [activeTab, setActiveTab] = useState<AppTab>('creative');
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [artifactHistory, setArtifactHistory] = useState<ProductArtifact[]>([]);
  const [imageHistory, setImageHistory] = useState<GeneratedImageRecord[]>([]);
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
    void refreshWorkspace().catch((err) => {
      setErrorText(err instanceof Error ? err.message : '初始化工作区失败。');
    });
  }, []);

  const mood: PocketBuddyMood = busyAction ? 'thinking' : pageAnalysis || artifact ? 'spark' : 'warm';
  const avatarId = runtimeConfig?.avatarId ?? 'yunyu-main';
  const agentName = runtimeConfig?.agentName ?? 'PocketBuddy';

  async function refreshWorkspace() {
    await Promise.all([
      refreshMemory(),
      refreshConfig(),
      refreshArtifactHistory(),
      refreshImageHistory(),
    ]);
  }

  async function refreshMemory() {
    const response = await sendRuntimeMessage(createMemoryGetMessage());
    if (!response.success) {
      setErrorText(response.error ?? '读取本地记忆失败。');
      return;
    }
    setMemory(response.payload);
  }

  async function refreshArtifactHistory() {
    const response = await sendRuntimeMessage(createArtifactListMessage());
    if (!response.success) {
      setErrorText(response.error ?? '读取产物历史失败。');
      return;
    }
    setArtifactHistory(response.payload.records);
  }

  async function refreshImageHistory() {
    const response = await sendRuntimeMessage(createImageListMessage());
    if (!response.success) {
      setErrorText(response.error ?? '读取图片历史失败。');
      return;
    }
    setImageHistory(response.payload.records);
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
    try {
      const response = await sendRuntimeMessage(createImageGenerateMessage(input));
      if (!response.success) { setErrorText(response.error ?? '图片请求生成失败。'); return; }
      setMemory(response.payload.memorySummary);
      setImageHistory((current) => [
        response.payload.record,
        ...current.filter((record) => record.id !== response.payload.record.id),
      ]);
      setNoticeText('图片请求已生成。');
      setActiveTab('observation');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '图片请求生成失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleGenerateMindmap(input: Parameters<typeof createMindmapGenerateMessage>[0]) {
    setBusyAction('mindmap-generate');
    setErrorText('');
    try {
      const response = await sendRuntimeMessage(createMindmapGenerateMessage(input));
      if (!response.success) { setErrorText(response.error ?? '图谱生成失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText('图谱已生成。');
      setActiveTab('observation');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '图谱生成失败。');
    } finally {
      setBusyAction('');
    }
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
    setArtifactHistory([]);
    setImageHistory([]);
    setPageRead(null);
    setPageContext(null);
    setPageAnalysis(null);
    setSelectedArchiveNoteId('');
  }

  return (
    <div className="app-shell">
      {/* 特效1：跟随 mood 的光晕呼吸背景 */}
      <Aurora mood={mood} />

      <header className="hero-card">
        <PocketBuddyAvatar avatar={avatarId} mood={mood} size={52} useChibiWhenThinking />
        <div className="hero-copy">
          <p className="section-label">PocketBuddy</p>
          <h1>{agentName}</h1>
          <p className="hero-text">{statusText}</p>
          {runtimeConfig ? <p className="hero-meta">默认语气：{runtimeConfig.defaultTone}</p> : null}
        </div>
      </header>

      {/* 特效5：LayoutGroup 让 TabIndicator 通过 layoutId 自动迁移 */}
      <LayoutGroup>
        <nav className="tab-nav">
          {TAB_DEFS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`tab-nav__item ${activeTab === key ? 'tab-nav__item--active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
              <TabIndicator active={activeTab === key} />
            </button>
          ))}
        </nav>
      </LayoutGroup>

      {errorText ? <div className="banner banner--error">{errorText}</div> : null}
      {noticeText ? <div className="banner banner--info">{noticeText}</div> : null}

      {/* Tab 切换 fade 过渡 */}
      <div className="tab-panel-wrap">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            className="tab-panel-anim"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: PB_EASE }}
          >
            {activeTab === 'creative' && (
              <CreativeTab
                memory={memory}
                artifact={artifact}
                artifactHistory={artifactHistory}
                imageHistory={imageHistory}
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
              setArtifactHistory={setArtifactHistory}
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
                artifactHistory={artifactHistory}
                imageHistory={imageHistory}
                setIdeaText={setIdeaText}
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
                artifactHistory={artifactHistory}
                imageHistory={imageHistory}
                busyAction={busyAction}
                setBusyAction={setBusyAction}
                setErrorText={setErrorText}
                setNoticeText={setNoticeText}
                refreshWorkspace={refreshWorkspace}
                resetWorkspaceState={resetWorkspaceState}
                onCopy={handleCopy}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsTab
                config={runtimeConfig}
                memory={memory}
                setConfig={setRuntimeConfig}
                setMemory={setMemory}
                setErrorText={setErrorText}
                setNoticeText={setNoticeText}
                refreshMemory={refreshMemory}
                refreshConfig={refreshConfig}
                resetWorkspaceState={resetWorkspaceState}
                busyAction={busyAction}
                setBusyAction={setBusyAction}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
