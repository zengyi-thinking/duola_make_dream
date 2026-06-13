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
    if (!window.confirm('确定要清空所有归档笔记吗？')) return;

    setBusyAction('archive-clear');
    try {
      const response = await sendRuntimeMessage(createArchiveClearMessage());
      if (!response.success) { setErrorText(response.error ?? '清空笔记失败。'); return; }

      setMemory(response.payload);
      setSelectedArchiveNoteId('');
      setDrawerNoteId(null);
      setNoticeText('归档笔记已清空。');
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
            <p className="section-label">Archive Notes</p>
            <h2>归档与笔记</h2>
          </div>
          <LineButton variant="ghost" onClick={handleClearArchive} disabled={Boolean(busyAction) || allNotes.length === 0}>
            清空笔记
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
                <span className="soft-text">{note.summary}</span>
              </button>
            )) : (
              <p className="soft-text">{searchQuery || sourceTypeFilter !== 'all' || tagFilter ? '没有匹配的笔记。' : '还没有保存的笔记。'}</p>
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
                  <InfoRow label="来源标题" value={selectedNote.sourceTitle} />
                  <InfoRow label="来源网址" value={selectedNote.origin} />
                  <InfoRow label="类型" value={selectedNote.sourceType} />
                  <InfoRow label="摘要" value={selectedNote.summary} />
                  <div className="drawer-section">
                    <span className="memory-label">要点</span>
                    <ListBlock items={selectedNote.bullets} />
                  </div>
                  <div className="drawer-section">
                    <span className="memory-label">标签</span>
                    <div className="token-list">
                      {selectedNote.tags.map((tag) => <span key={tag} className="token-chip">{tag}</span>)}
                    </div>
                  </div>
                  <InfoRow label="保存时间" value={new Date(selectedNote.createdAt).toLocaleString('zh-CN')} />
                  <InfoRow label="关联上下文" value={selectedNote.relatedContextIds.length > 0 ? selectedNote.relatedContextIds.join(', ') : '无'} />
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
              <EmptyCard title="选择一条笔记" body="点击左侧笔记查看详情，支持搜索、过滤和删除。" />
            )}
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Archive Tips</p>
            <h2>这里放什么</h2>
          </div>
        </div>
        <p className="soft-text">归档页只负责整理笔记与它们的上下文。长期记忆、图片记录、图谱记录和历史回放已经移到观察页。</p>
      </section>
    </StaggerStack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span className="memory-label">{label}</span>
      <p>{value}</p>
    </div>
  );
}
