import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import LineButton from '@/components/LineArt/LineButton';
import type { ArchiveNote, ProductArtifact } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import { createGraphEdge, createGraphNode, createGraphView } from '@/lib/graph/types';
import type { GraphView } from '@/lib/graph/types';
import { createArchiveDeleteMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import { useMemory } from '../context/MemoryContext';

/**
 * 记忆页（产品重设计重做版）。
 *
 * 拆两个子图（idea 成果 + 网页笔记），每个用 GraphCanvas SVG 渲染：
 * - **idea 成果子图**（agent 想法生成成果）：artifacts → structure 节点（payload=ProductArtifact，含 planBoard）；generatedImages → image 节点（关联 artifact）。点开看 PlanBoard + 图片（NodeDetailDrawer）。
 * - **笔记子图**（网页/划词归纳保存的笔记）：archiveNotes → note 节点（payload=ArchiveNote，summary/bullets/tags）。点开看精美笔记卡片。
 * 笔记列表（搜索/过滤/删除）保留为次面板。
 */
export default function MemoryPage() {
  const { memory, setMemory, refresh: refreshMemory } = useMemory();

  const [allNotes, setAllNotes] = useState<ArchiveNote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'paper' | 'article' | 'idea'>('all');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

  useEffect(() => {
    void refreshMemory();
  }, [refreshMemory]);

  const artifacts: ProductArtifact[] = memory?.recentArtifacts ?? [];
  const images: GeneratedImageRecord[] = memory?.generatedImages ?? [];
  const storeNotes: ArchiveNote[] = memory?.archiveNotes ?? [];

  // 笔记子图：archiveNotes → note 节点 + 关联（idea 子图 artifact 通过 relatedContextIds）
  const notesGraph = useMemo<GraphView>(() => {
    const filtered = storeNotes.filter((n) => {
      if (sourceTypeFilter !== 'all' && n.sourceType !== sourceTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q);
      }
      return true;
    });
    return buildNotesGraph(filtered, artifacts);
  }, [storeNotes, artifacts, sourceTypeFilter, searchQuery]);

  // idea 成果子图：artifacts + images 关联
  const ideaGraph = useMemo<GraphView>(() => buildIdeaGraph(artifacts, images), [artifacts, images]);

  const filteredNotes = notesGraph.nodes
    .map((n) => storeNotes.find((note) => note.id === n.sourceId))
    .filter((n): n is ArchiveNote => Boolean(n));

  const hasIdeaNodes = ideaGraph.nodes.length > 0;
  const hasNoteNodes = notesGraph.nodes.length > 0;

  async function handleDeleteNote(noteId: string) {
    if (confirmDeleteNoteId !== noteId) {
      setConfirmDeleteNoteId(noteId);
      return;
    }
    try {
      const next = await sendRuntimeMessage(createArchiveDeleteMessage(noteId));
      if (next.success) {
        setMemory(next.payload);
        setAllNotes((cur) => cur.filter((n) => n.id !== noteId));
        setConfirmDeleteNoteId(null);
        await refreshMemory();
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="tab-panel">
      {/* idea 成果子图 */}
      <motion.section
        className="panel-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="panel-head">
          <div>
            <p className="section-label">Idea Graph</p>
            <h2>idea 成果</h2>
          </div>
          <span className="timeline-badge timeline-badge--pipeline">{ideaGraph.nodes.length} 节点</span>
        </div>
        {hasIdeaNodes ? (
          <>
            <GraphCanvas graph={ideaGraph} emptyHint="还没有 idea 成果，去发明页生成想法。" />
            <p className="soft-text" style={{ marginTop: 8 }}>
              节点是 agent 发明产物（点开看 PlanBoard 执行计划+图片）；蓝边节点是生图模型返回的成品。
            </p>
          </>
        ) : (
          <p className="soft-text">还没有 idea 成果。点发明页输入想法，生成后会在此展示。</p>
        )}
      </motion.section>

      {/* 笔记子图 */}
      <motion.section
        className="panel-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="panel-head">
          <div>
            <p className="section-label">Notes Graph</p>
            <h2>网页笔记</h2>
          </div>
          <span className="timeline-badge timeline-badge--pipeline">{notesGraph.nodes.length} 节点</span>
        </div>
        {hasNoteNodes ? (
          <GraphCanvas graph={notesGraph} emptyHint="还没有网页笔记，去喂养页归档或划词归纳。" />
        ) : (
          <p className="soft-text">还没有网页笔记。点喂养页归档阅读笔记，或划词积累后归纳成文档。</p>
        )}
      </motion.section>

      {/* 笔记列表（次面板：搜索/过滤/删除） */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Note Library</p>
            <h2>笔记库（列表视图）</h2>
          </div>
          <span className="micro-status">{allNotes.length || storeNotes.length} 条</span>
        </div>

        <input
          type="text"
          className="archive-search"
          placeholder="搜索笔记标题、摘要…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="filter-chips" style={{ margin: '8px 0' }}>
          {(['all', 'paper', 'article', 'idea'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`filter-chip ${sourceTypeFilter === type ? 'filter-chip--active' : ''}`}
              onClick={() => setSourceTypeFilter(type)}
            >
              {type === 'all' ? '全部' : type === 'paper' ? '论文' : type === 'article' ? '文章' : '想法/划词'}
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
                    disabled={false}
                  >
                    {confirmDeleteNoteId === note.id ? '确认删除' : '删除'}
                  </LineButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="soft-text">暂无匹配的笔记。</p>
        )}
      </section>
    </div>
  );
}

/** idea 成果子图：artifacts → structure + images → image（按 ideaId 关联）。 */
function buildIdeaGraph(artifacts: ProductArtifact[], images: GeneratedImageRecord[]): GraphView {
  const nodes = artifacts.map((a) =>
    createGraphNode({
      type: 'structure',
      title: a.concept.name,
      summary: a.concept.tagline,
      payload: a,
      sourceId: a.id,
    }),
  );
  const edges = [];
  for (const img of images) {
    const imgNode = createGraphNode({
      type: 'image',
      title: img.request.title || '计划图片',
      summary: (img.prompt ?? img.status).slice(0, 60),
      payload: img,
      sourceId: img.id,
    });
    nodes.push(imgNode);
    // 关联到 artifact（按 ideaId 或 relatedNoteId 匹配）
    const relatedArtifact = artifacts.find(
      (a) => a.id === img.request.relatedNoteId || a.ideaId === (img.request as { relatedIdeaId?: string }).relatedIdeaId,
    );
    if (relatedArtifact) {
      const related = nodes.find((n) => n.sourceId === relatedArtifact.id);
      if (related) edges.push(createGraphEdge(imgNode.id, related.id, 'produces'));
    }
  }
  return createGraphView({ scope: 'memory', title: 'idea 成果', nodes, edges });
}

/** 笔记子图：archiveNotes → note 节点。同 sourceType 相邻连 relates 边（聚簇约束）。 */
function buildNotesGraph(notes: ArchiveNote[], _artifacts: ProductArtifact[]): GraphView {
  const nodes = notes.map((n) =>
    createGraphNode({
      type: 'note',
      title: n.title,
      summary: n.summary,
      payload: n,
      sourceId: n.id,
    }),
  );
  // 补 relates 边：同 sourceType 相邻连边（同类聚簇），让力导向有聚拢约束，避免无边失衡抖动
  const edges = [];
  const byType = new Map<string, ArchiveNote[]>();
  for (const n of notes) {
    const arr = byType.get(n.sourceType) ?? [];
    arr.push(n);
    byType.set(n.sourceType, arr);
  }
  const nodeByNoteId = new Map(notes.map((n, i) => [n.id, nodes[i]]));
  for (const arr of byType.values()) {
    for (let k = 0; k < arr.length - 1; k++) {
      const a = nodeByNoteId.get(arr[k].id);
      const b = nodeByNoteId.get(arr[k + 1].id);
      if (a && b) edges.push(createGraphEdge(a.id, b.id, 'relates'));
    }
  }
  return createGraphView({ scope: 'memory', title: '网页笔记', nodes, edges });
}
