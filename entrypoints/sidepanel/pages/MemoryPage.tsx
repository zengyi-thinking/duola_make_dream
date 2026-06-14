import { useEffect, useMemo, useState } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import type { GraphView } from '@/lib/graph/types';
import {
  createArchiveClearMessage,
  createArchiveDeleteMessage,
  createMemoryDeleteMessage,
  createPocketGraphLoadMessage,
  createPocketGraphSaveMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { EmptyCard } from '../components/ResultCard';

type SourceTypeFilter = 'all' | 'paper' | 'article' | 'idea';

/**
 * 记忆页（推倒重建自 ArchiveTab）。
 *
 * 核心变化：以全局力导向图为主体（scope='global' 的 GraphView），
 * 节点详情由 GraphCanvas 内置的 NodeDetailDrawer 承载；删节点走 pocket.graph.save
 * （scope='global' 时 background 走 replaceGlobalGraph，避免 append 重复）。
 * 笔记列表降为「列表视图」次面板（搜索/过滤/删除笔记）。
 */
export default function MemoryPage() {
  const { setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { memory, setMemory } = useMemory();

  const [globalGraph, setGlobalGraph] = useState<GraphView | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>('all');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

  async function loadGraph() {
    try {
      const response = await sendRuntimeMessage(createPocketGraphLoadMessage());
      if (response.success) {
        setGlobalGraph(response.payload.view);
        setMemory(response.payload.memorySummary);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '加载记忆图失败。');
    }
  }

  useEffect(() => {
    void loadGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeleteNode(nodeId: string) {
    if (!globalGraph) return;
    setBusyAction(`node-delete-${nodeId}`);
    try {
      const nextView: GraphView = {
        ...globalGraph,
        nodes: globalGraph.nodes.filter((n) => n.id !== nodeId),
        edges: globalGraph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      };
      const response = await sendRuntimeMessage(createPocketGraphSaveMessage(nextView));
      if (!response.success) { setErrorText(response.error ?? '删除节点失败。'); return; }
      setGlobalGraph(nextView);
      setMemory(response.payload);
      setNoticeText('节点已从记忆图移除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除节点失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (confirmDeleteNoteId !== noteId) {
      setConfirmDeleteNoteId(noteId);
      return;
    }
    setBusyAction(`note-delete-${noteId}`);
    try {
      const response = await sendRuntimeMessage(createArchiveDeleteMessage(noteId));
      if (!response.success) { setErrorText(response.error ?? '删除笔记失败。'); return; }
      setMemory(response.payload);
      setConfirmDeleteNoteId(null);
      setNoticeText('笔记已删除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除笔记失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleClearAll() {
    if (!window.confirm('确定要清空所有记忆笔记和记忆图吗？')) return;
    setBusyAction('memory-clear');
    try {
      const r1 = await sendRuntimeMessage(createArchiveClearMessage());
      if (!r1.success) { setErrorText(r1.error ?? '清空笔记失败。'); return; }
      const r2 = await sendRuntimeMessage(createMemoryDeleteMessage('graphViews'));
      if (!r2.success) { setErrorText(r2.error ?? '清空图失败。'); return; }
      setMemory(r2.payload);
      setGlobalGraph((g) => (g ? { ...g, nodes: [], edges: [] } : g));
      setNoticeText('记忆库与记忆图已清空。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '清空失败。');
    } finally {
      setBusyAction('');
    }
  }

  const allNotes = memory?.archiveNotes ?? [];
  const filteredNotes = useMemo(() => allNotes.filter((note) => {
    if (sourceTypeFilter !== 'all' && note.sourceType !== sourceTypeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return note.title.toLowerCase().includes(q) || note.summary.toLowerCase().includes(q);
    }
    return true;
  }), [allNotes, sourceTypeFilter, searchQuery]);

  const hasNodes = (globalGraph?.nodes.length ?? 0) > 0;

  return (
    <StaggerStack triggerKey="memory" className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Memory Graph</p>
            <h2>记忆图</h2>
          </div>
          <LineButton variant="ghost" onClick={handleClearAll} disabled={Boolean(busyAction) || (!hasNodes && allNotes.length === 0)}>
            清空记忆
          </LineButton>
        </div>
        {hasNodes && globalGraph ? (
          <GraphCanvas
            graph={globalGraph}
            onDeleteNode={handleDeleteNode}
            emptyHint="记忆图还没有节点。"
          />
        ) : (
          <p className="soft-text">还没有记忆节点。去发明或喂养几条，这里会长出关联图。点击节点可查看详情或删除。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Note Library</p>
            <h2>笔记库（列表视图）</h2>
          </div>
          <span className="micro-status">{allNotes.length} 条</span>
        </div>

        <input
          type="text"
          className="archive-search"
          placeholder="搜索笔记标题、摘要…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="filter-chips" style={{ margin: '8px 0' }}>
          {(['all', 'paper', 'article', 'idea'] as SourceTypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`filter-chip ${sourceTypeFilter === type ? 'filter-chip--active' : ''}`}
              onClick={() => setSourceTypeFilter(type)}
            >
              {type === 'all' ? '全部' : type === 'paper' ? '论文' : type === 'article' ? '文章' : '想法'}
            </button>
          ))}
        </div>

        {filteredNotes.length ? (
          <div className="archive-list">
            {filteredNotes.map((note) => (
              <div key={note.id} className="archive-item">
                <span className="archive-item__type">{note.sourceType}</span>
                <strong>{note.title}</strong>
                <p className="soft-text" style={{ margin: '4px 0 0' }}>{note.summary}</p>
                <div className="token-list archive-item__chips">
                  {note.tags.slice(0, 3).map((t) => <span key={t} className="token-chip">{t}</span>)}
                </div>
                <div className="inline-actions" style={{ marginTop: 6 }}>
                  <LineButton
                    variant={confirmDeleteNoteId === note.id ? 'primary' : 'ghost'}
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={Boolean(busyAction)}
                  >
                    {confirmDeleteNoteId === note.id ? '确认删除' : '删除'}
                  </LineButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyCard title="暂无笔记" body="去喂养页归档阅读笔记，或去发明页生成想法。" />
        )}
      </section>
    </StaggerStack>
  );
}
