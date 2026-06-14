import { useEffect } from 'react';
import { LayoutGroup } from 'framer-motion';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import Aurora from '@/components/Aurora/Aurora';
import TabIndicator from '@/components/TabIndicator/TabIndicator';
import type { PocketBuddyMood } from '@/lib/agent/types';
import {
  AppProviders,
  useBusy,
  useMemory,
  useNavigation,
  useRuntimeConfig,
  useToast,
  useWorkspace,
  type AppPage,
} from './context';
import InventPage from './pages/InventPage';
import FeedPage from './pages/FeedPage';
import MemoryPage from './pages/MemoryPage';
import ObservePage from './pages/ObservePage';
import SettingsPage from './pages/SettingsPage';

const PAGE_DEFS: Array<{ key: AppPage; label: string }> = [
  { key: 'invent', label: '发明' },
  { key: 'feed', label: '喂养' },
  { key: 'memory', label: '记忆' },
  { key: 'observe', label: '观察' },
  { key: 'settings', label: '设置' },
];

/** 渲染单个页面（keep-alive 下所有页面常驻 mount）。 */
function renderPage(key: AppPage) {
  switch (key) {
    case 'invent': return <InventPage />;
    case 'feed': return <FeedPage />;
    case 'memory': return <MemoryPage />;
    case 'observe': return <ObservePage />;
    case 'settings': return <SettingsPage />;
    default: return null;
  }
}

/**
 * App 内壳：导航 + hero + 五页切换。
 *
 * keep-alive 渲染（产品重设计修复）：所有 5 页常驻 mount，用 CSS display 切换。
 * 切走不 unmount，各页 state 保留（解决"切换后看不到之前记录"）；New 按钮主动开新记录。
 * 所有状态由 6 个 Context 承载，无 props drilling。
 */
function AppShell() {
  const { page, setPage } = useNavigation();
  const { statusText, errorText, noticeText } = useToast();
  const { busyAction } = useBusy();
  const { memory, refresh: refreshMemory } = useMemory();
  const { config, refresh: refreshConfig } = useRuntimeConfig();
  const { refreshArtifacts, refreshImages } = useWorkspace();

  useEffect(() => {
    void Promise.all([refreshMemory(), refreshConfig(), refreshArtifacts(), refreshImages()]).catch((err) => {
      console.error('初始化工作区失败', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mood: PocketBuddyMood = busyAction
    ? 'thinking'
    : (memory?.recentArtifacts.length ?? 0) > 0 || (memory?.archiveNotes.length ?? 0) > 0
      ? 'spark'
      : 'warm';
  const avatarId = config?.avatarId ?? 'yunyu-main';
  const agentName = config?.agentName ?? 'PocketAgent';

  return (
    <div className="app-shell">
      <Aurora mood={mood} />

      <header className="hero-card">
        <PocketBuddyAvatar avatar={avatarId} mood={mood} size={52} useChibiWhenThinking />
        <div className="hero-copy">
          <p className="section-label">PocketAgent</p>
          <h1>{agentName}</h1>
          <p className="hero-text">{statusText}</p>
          {config ? <p className="hero-meta">默认语气：{config.defaultTone}</p> : null}
        </div>
      </header>

      <LayoutGroup>
        <nav className="tab-nav">
          {PAGE_DEFS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`tab-nav__item ${page === key ? 'tab-nav__item--active' : ''}`}
              onClick={() => setPage(key)}
            >
              {label}
              <TabIndicator active={page === key} />
            </button>
          ))}
        </nav>
      </LayoutGroup>

      {errorText ? <div className="banner banner--error">{errorText}</div> : null}
      {noticeText ? <div className="banner banner--info">{noticeText}</div> : null}

      <div className="tab-panel-wrap">
        {PAGE_DEFS.map(({ key }) => (
          <div
            key={key}
            className={`tab-panel-page${page === key ? ' tab-panel-page--active' : ''}`}
          >
            {renderPage(key)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
