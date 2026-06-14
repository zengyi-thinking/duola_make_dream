/**
 * Legacy 数据 → Graph 自动迁移（一次性、幂等）。
 *
 * 把现有列表式产物（archiveNotes/artifacts/generatedImages/generatedMindmaps/approvedMemories）
 * 转成 GraphNode + GraphEdge，合并进 scope='global' 的全局记忆图。
 *
 * 幂等保证：每个迁移节点用稳定 id `migrated:${kind}:${sourceId}`，
 * mergeIntoGlobalGraph 按 node.id 去重 —— SW 多次启动、多次迁移都不会产生重复节点。
 *
 * 边的 source 沿用现有 id 引用（selectedArchiveNoteIds / ideaId / relatedNoteId 等），
 * 与 recall.ts 的关系图引擎同一套边源，零数据迁移成本。
 */
import {
  getApprovedMemories,
  getArchiveNotes,
  getArtifactHistory,
  getGeneratedImages,
  getGeneratedMindmaps,
  mergeIntoGlobalGraph,
} from '@/lib/memory';
import {
  createGraphEdge,
  createGraphNode,
  type GraphEdge,
  type GraphNode,
} from './types';

const MIGRATED_PREFIX = 'migrated';

function migratedId(kind: string, sourceId: string): string {
  return `${MIGRATED_PREFIX}:${kind}:${sourceId}`;
}

export interface MigrationResult {
  nodes: number;
  edges: number;
  skipped: boolean;
}

export async function migrateLegacyToGraph(): Promise<MigrationResult> {
  const [notes, artifacts, images, mindmaps, memories] = await Promise.all([
    getArchiveNotes(),
    getArtifactHistory(),
    getGeneratedImages(),
    getGeneratedMindmaps(),
    getApprovedMemories(),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 归档笔记 → note 节点
  for (const note of notes) {
    nodes.push(
      createGraphNode({
        id: migratedId('note', note.id),
        type: 'note',
        title: note.title,
        summary: note.summary,
        payload: note,
        createdAt: note.createdAt,
        sourceId: note.id,
      }),
    );
  }

  // 产物 → idea + plan(plan) 节点，并连 idea→artifact(derives)、artifact→note(cites)
  for (const artifact of artifacts) {
    const ideaNodeId = migratedId('idea', artifact.ideaId);
    const planNodeId = migratedId('plan', artifact.id);
    nodes.push(
      createGraphNode({
        id: ideaNodeId,
        type: 'idea',
        title: artifact.concept.name,
        summary: artifact.concept.tagline || artifact.concept.positioning,
        payload: { intent: artifact.intent },
        createdAt: artifact.createdAt,
        sourceId: artifact.ideaId,
      }),
      createGraphNode({
        id: planNodeId,
        type: 'plan',
        title: artifact.concept.name,
        summary: artifact.concept.tagline,
        payload: artifact,
        createdAt: artifact.createdAt,
        sourceId: artifact.id,
      }),
    );
    edges.push(createGraphEdge(planNodeId, ideaNodeId, 'derives'));
    for (const noteId of artifact.selectedArchiveNoteIds) {
      edges.push(createGraphEdge(planNodeId, migratedId('note', noteId), 'cites'));
    }
  }

  // 图片 → image 节点，关联 note(cites)
  for (const image of images) {
    const imageNodeId = migratedId('image', image.id);
    nodes.push(
      createGraphNode({
        id: imageNodeId,
        type: 'image',
        title: image.request.title || '未命名图片',
        summary: image.prompt || image.request.content,
        payload: image,
        createdAt: image.createdAt,
        sourceId: image.id,
      }),
    );
    if (image.request.relatedNoteId) {
      edges.push(createGraphEdge(imageNodeId, migratedId('note', image.request.relatedNoteId), 'cites'));
    }
  }

  // 图谱 → mindmap 节点
  for (const mindmap of mindmaps) {
    nodes.push(
      createGraphNode({
        id: migratedId('mindmap', mindmap.id),
        type: 'mindmap',
        title: mindmap.result.title,
        summary: mindmap.imagePrompt || '',
        payload: mindmap,
        createdAt: mindmap.createdAt,
        sourceId: mindmap.id,
      }),
    );
  }

  // 已批准记忆 → memory 节点，关联 note/context(relates)
  for (const memory of memories) {
    const memoryNodeId = migratedId('memory', memory.id);
    nodes.push(
      createGraphNode({
        id: memoryNodeId,
        type: 'memory',
        title: memory.title,
        summary: memory.content,
        payload: memory,
        createdAt: memory.createdAt,
        sourceId: memory.id,
      }),
    );
    if (memory.relatedNoteId) {
      edges.push(createGraphEdge(memoryNodeId, migratedId('note', memory.relatedNoteId), 'relates'));
    }
  }

  if (nodes.length === 0) {
    return { nodes: 0, edges: 0, skipped: true };
  }

  await mergeIntoGlobalGraph(nodes, edges);
  return { nodes: nodes.length, edges: edges.length, skipped: false };
}
