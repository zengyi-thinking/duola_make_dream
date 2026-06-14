import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import type { MemorySummary } from '@/lib/agent/types';
import {
  createArchiveClearMessage,
  createArchiveDeleteMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { EmptyCard } from '../components/ResultCard';
import { ListBlock } from '../components/ListBlock';
import PipelineFlow from '../components/PipelineFlow';

type SourceTypeFilter = 'all' | 'paper' | 'article' | 'idea';

interface ArchiveTabProps {
  memory: MemorySummary | null;
  selectedArchiveNoteId: string;
  setSelectedArchiveNoteId: Dispatch<SetStateAction<string>>;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  onGenerateImage: (input: {
    sourceType: 'idea' | 'page-summary' | 'paper-note' | 'article-note' | 'mindmap';
    title: string; content: string;
    style: 'line-art' | 'product-ui' | 'knowledge-card' | 'poster' | 'mindmap';
    relatedNoteId?: string;
  }) => void;
  onGenerateMindmap: (input: {
    sourceId: string; sourceType: 'paper' | 'article' | 'idea';
    title: string; content: string; noteId?: string;
  }) => void;
  onCopy: (text: string, successText: string) => void;
}

export default function ArchiveTab(props: ArchiveTabProps) {
  const {
    memory, selectedArchiveNoteId, setSelectedArchiveNoteId,
    busyAction, setBusyAction, setMemory, setErrorText, setNoticeText,
    onGenerateImage, onGenerateMindmap, onCopy,
  } = props;

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [drawerNoteId, setDrawerNoteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allNotes = memory?.archiveNotes ?? [];

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allNotes.forEach((note) => note.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [allNotes]);

  const filteredNotes = useMemo(() => {
    return allNotes.filter((note) => {
      if (sourceTypeFilter !== 'all' && note.sourceType !== sourceTypeFilter) return false;
      if (tagFilter && !note.tags.includes(tagFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return note.title.toLowerCase().includes(q)
          || note.summary.toLowerCase().includes(q)
          || note.sourceTitle.toLowerCase().includes(q)
          || note.bullets.some((b) => b.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allNotes, sourceTypeFilter, tagFilter, searchQuery]);

  const selectedNote = drawerNoteId ? allNotes.find((n) => n.id === drawerNoteId) ?? null : null;
  const activeFilterKey = `${sourceTypeFilter}-${tagFilter}`;

  async function handleDeleteArchiveNote(noteId: string) {
    if (confirmDeleteId !== noteId) {
      setConfirmDeleteId(noteId);
      return;
    }

    setBusyAction(`archive-delete-${noteId}`);
    try {
      const response = await sendRuntimeMessage(createArchiveDeleteMessage(noteId));
      if (!response.success) { setErrorText(response.error ?? '删除笔记失败。'); return; }

      setMemory(response.payload);
      if (selectedArchiveNoteId === noteId) setSelectedArchiveNoteId('');
      setDrawerNoteId(null);
      setNoticeText('笔记已删除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除笔记失败。');
    } finally {
      setBusyAction('');
      setConfirmDeleteId(null);
    }
  }

  async function handleClearArchive() {
    if (!window.confirm('确定要清空所有记忆吗？')) return;

    setBusyAction('archive-clear');
    try {
      const response = await sendRuntimeMessage(createArchiveClearMessage());
      if (!response.success) { setErrorText(response.error ?? '清空笔记失败。'); return; }

      setMemory(response.payload);
      setSelectedArchiveNoteId('');
      setDrawerNoteId(null);
      setNoticeText('记忆库已清空。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '清空笔记失败。');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <StaggerStack triggerKey={`${activeFilterKey}-${searchQuery}`} className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Memory Library</p>
            <h2>记忆库</h2>
          </div>
          <LineButton variant="ghost" onClick={handleClearArchive} disabled={Boolean(busyAction) || allNotes.length === 0}>
            清空记忆库
          </LineButton>
        </div>

        <div className="archive-filters">
          <input
            type="text"
            className="archive-search"
            placeholder="搜索笔记标题、摘要、要点..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="archive-filter-row">
            <div className="filter-chips">
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
            {allTags.length > 0 ? (
              <select
                className="filter-select"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">全部标签</option>
                {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            ) : null}
          </div>
        </div>

        <div className="archive-grid">
          <div className="archive-list">
            {filteredNotes.length ? filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={`archive-item ${drawerNoteId === note.id ? 'archive-item--active' : ''}`}
                onClick={() => setDrawerNoteId(drawerNoteId === note.id ? null : note.id)}
              >
                <span className="archive-item__type">{note.sourceType}</span>
                <strong>{note.title}</strong>
                <div className="token-list archive-item__chips">
                  <span className="token-chip">{note.tags[0] ?? '无标签'}</span>
                  <span className="token-chip">{note.bullets.length} 要点</span>
                  <span className="token-chip">{formatDate(note.createdAt)}</span>
                </div>
                <div className="signal-meter archive-item__meter" aria-hidden="true">
                  <span style={{ width: `${getArchiveRichness(note)}%` }} />
                </div>
              </button>
            )) : (
              <p className="soft-text">{searchQuery || sourceTypeFilter !== 'all' || tagFilter ? '没有匹配的记忆。' : '还没有保存的记忆。'}</p>
            )}
          </div>

          <div className={`archive-detail ${drawerNoteId ? 'archive-detail--open' : ''}`}>
            {selectedNote ? (
              <div className="drawer">
                <div className="drawer-header">
                  <h3>{selectedNote.title}</h3>
                  <button type="button" className="drawer-close" onClick={() => setDrawerNoteId(null)}>✕</button>
                </div>
                <div className="drawer-body">
                  <div className="archive-note-summary">
                    <div className="archive-note-summary__top">
                      <span className="memory-label">摘要快照</span>
                      <div className="signal-chip-row">
                        <span className="signal-chip">{selectedNote.savedByUser ? '用户保存' : '自动归档'}</span>
                        <span className="signal-chip">{selectedNote.sourceType}</span>
                        <span className="signal-chip">{formatHost(selectedNote.origin)}</span>
                        <span className="signal-chip">{selectedNote.bullets.length} 要点</span>
                      </div>
                    </div>
                    <div className="signal-meter archive-note-summary__meter" aria-hidden="true">
                      <span style={{ width: `${getArchiveRichness(selectedNote)}%` }} />
                    </div>
                    <p className="reading-summary__preview">{selectedNote.summary}</p>
                    {selectedNote.summary.length > 180 ? (
                      <details className="reading-accordion">
                        <summary>展开完整摘要</summary>
                        <p className="micro-copy" style={{ marginTop: 8 }}>{selectedNote.summary}</p>
                      </details>
                    ) : null}
                  </div>

                  <div className="archive-metrics-grid">
                    <MetricCard
                      label="来源"
                      value={shorten(selectedNote.sourceTitle, 18)}
                      hint="原始标题"
                      fill={Math.min(1, selectedNote.sourceTitle.length / 40)}
                    />
                    <MetricCard
                      label="要点"
                      value={`${selectedNote.bullets.length}`}
                      hint={selectedNote.bullets[0] ? shorten(selectedNote.bullets[0], 22) : '暂无'}
                      fill={Math.min(1, selectedNote.bullets.length / 8)}
                    />
                    <MetricCard
                      label="标签"
                      value={`${selectedNote.tags.length}`}
                      hint={selectedNote.tags[0] ?? '暂无'}
                      fill={Math.min(1, selectedNote.tags.length / 6)}
                    />
                    <MetricCard
                      label="回流"
                      value={`${selectedNote.relatedContextIds.length}`}
                      hint={selectedNote.relatedContextIds.length > 0 ? '可回流' : '无回流'}
                      fill={Math.min(1, selectedNote.relatedContextIds.length / 6)}
                    />
                  </div>

                  {selectedNote.pipelineTrace ? <PipelineFlow trace={selectedNote.pipelineTrace} /> : null}
                  <div className="drawer-section">
                    <span className="memory-label">要点</span>
                    <div className="token-list">
                      {selectedNote.bullets.slice(0, 5).map((bullet, index) => (
                        <span key={`${index}-${bullet}`} className="token-chip">{shorten(bullet, 20)}</span>
                      ))}
                    </div>
                    {selectedNote.bullets.length > 5 ? (
                      <details className="reading-accordion" style={{ marginTop: 8 }}>
                        <summary>展开完整要点</summary>
                        <ListBlock items={selectedNote.bullets} />
                      </details>
                    ) : null}
                  </div>
                  <div className="drawer-section">
                    <span className="memory-label">标签</span>
                    <div className="token-list">
                      {selectedNote.tags.map((tag) => <span key={tag} className="token-chip">{tag}</span>)}
                    </div>
                  </div>
                </div>
                <div className="drawer-footer">
                  <LineButton
                    variant={confirmDeleteId === selectedNote.id ? 'primary' : 'ghost'}
                    onClick={() => handleDeleteArchiveNote(selectedNote.id)}
                    disabled={Boolean(busyAction)}
                  >
                    {confirmDeleteId === selectedNote.id ? '确认删除' : '删除笔记'}
                  </LineButton>
                  <LineButton variant="secondary" onClick={() => onGenerateImage({
                    sourceType: selectedNote.sourceType === 'paper' ? 'paper-note' : 'article-note',
                    title: selectedNote.title,
                    content: `${selectedNote.summary}\n${selectedNote.bullets.join('\n')}`,
                    style: 'knowledge-card',
                    relatedNoteId: selectedNote.id,
                  })}>
                    生成知识卡片图
                  </LineButton>
                  <LineButton variant="ghost" onClick={() => onGenerateMindmap({
                    sourceId: selectedNote.id,
                    sourceType: selectedNote.sourceType,
                    title: `${selectedNote.title} 图谱`,
                    content: [selectedNote.summary, ...selectedNote.bullets].join('；'),
                    noteId: selectedNote.id,
                  })}>
                    生成思维导图
                  </LineButton>
                </div>
              </div>
            ) : (
              <EmptyCard title="选择一条记忆" body="点击左侧条目查看详情，支持搜索、过滤和删除。" />
            )}
          </div>
        </div>
      </section>

    </StaggerStack>
  );
}

function MetricCard({
  label,
  value,
  hint,
  fill = 0.5,
}: {
  label: string;
  value: string;
  hint: string;
  fill?: number;
}) {
  return (
    <div className="stat-card archive-metric-card">
      <p className="section-label">{label}</p>
      <strong>{value}</strong>
      <div className="signal-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(8, Math.round(fill * 100))}%` }} />
      </div>
      <span className="micro-copy">{hint}</span>
    </div>
  );
}

function formatHost(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function shorten(text: string, max: number) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function getArchiveRichness(note: MemorySummary['archiveNotes'][number]) {
  const score = (note.bullets.length * 12)
    + (note.tags.length * 8)
    + (note.relatedContextIds.length * 10)
    + (note.savedByUser ? 12 : 4);
  return Math.min(100, Math.max(12, score));
}
