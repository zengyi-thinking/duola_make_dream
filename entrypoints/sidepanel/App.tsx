import { useEffect } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import Aurora from '@/components/Aurora/Aurora';
import TabIndicator from '@/components/TabIndicator/TabIndicator';
import type { PocketBuddyMood } from '@/lib/agent/types';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
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

/**
 * App 内壳：导航 + hero + 五页切换。所有状态由 6 个 Context 承载，无 props drilling。
 * 初始化时刷新记忆/配置/产物/图片四个数据源（各 Context 自管）。
 */
function AppShell() {
  const reduced = usePocketReducedMotion();
  const { page, setPage } = useNavigation();
  const { statusText, errorText, noticeText } = useToast();
  const { busyAction } = useBusy();
  const { memory, refresh: refreshMemory } = useMemory();
  const { config, refresh: refreshConfig } = useRuntimeConfig();
  const { refreshArtifacts, refreshImages } = useWorkspace();

  useEffect(() => {
    void Promise.all([refreshMemory(), refreshConfig(), refreshArtifacts(), refreshImages()]).catch((err) => {
      // 初始化失败不阻塞渲染，错误会在 banner 显示
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            className="tab-panel-anim"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: PB_EASE }}
          >
            {page === 'invent' && <InventPage />}
            {page === 'feed' && <FeedPage />}
            {page === 'memory' && <MemoryPage />}
            {page === 'observe' && <ObservePage />}
            {page === 'settings' && <SettingsPage />}
          </motion.div>
        </AnimatePresence>
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
