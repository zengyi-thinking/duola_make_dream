import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from 'd3-force';
import type { GraphNode, GraphNodeType, GraphView } from '@/lib/graph/types';
import NodeDetailDrawer from './NodeDetailDrawer';

/**
 * 节点类型 → 颜色（沿用 App.css 的 --pb-primary 蓝色系 + timeline-badge 语义色）。
 * 注意：SVG 用 CSS 变量字符串色，不再需要 three.js 数字色，但保留映射供类型推断。
 */
const NODE_COLOR_CSS: Record<GraphNodeType, string> = {
  idea: '#2557da',
  plan: '#4a90e2',
  research: '#7b68ee',
  reflect: '#9370db',
  structure: '#6a5acd',
  note: '#2e8b57',
  image: '#e67e22',
  mindmap: '#16a085',
  memory: '#8e44ad',
  success: '#27ae60',
  failure: '#c0392b',
  tool: '#34495e',
  skill: '#2980b9',
  profile: '#f39c12',
  feedback: '#e74c3c',
};

const NODE_EMOJI: Partial<Record<GraphNodeType, string>> = {
  idea: '💡', plan: '🧭', research: '🔍', reflect: '🪞', structure: '🧩',
  note: '📝', image: '🖼️', mindmap: '🗂️', memory: '🧠', success: '✅',
  failure: '⚠️', tool: '🔧', skill: '⚡', profile: '👤', feedback: '💬',
};

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
}
interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  id: string;
}

interface GraphCanvasProps {
  graph: GraphView;
  /** 空图时显示的占位文案 */
  emptyHint?: string;
  onDeleteNode?: (nodeId: string) => void;
}

/**
 * 力导向图渲染层（SVG 版）。
 *
 * 产品重设计修复：旧版用 three.js Sprite 渲染节点，CanvasTexture 文字在扩展页面
 * 不可靠（节点完全不显示）。改为 SVG：<g><rect/><text/></g> 渲染节点，<line> 渲染边。
 * 优势：文字/emoji/中文渲染可靠、原生 DOM 事件（点选拖拽）、无 WebGL 依赖、可 CSS 样式。
 * d3-force 物理仿真保留；tick 时用 ref 直接更新 DOM transform（不触发 React re-render）。
 */
export default function GraphCanvas({ graph, emptyHint, onDeleteNode }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeGRefs = useRef<Map<string, SVGGElement>>(new Map());
  const edgeRefs = useRef<Map<string, SVGLineElement>>(new Map());
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dims, setDims] = useState({ width: 360, height: 300 });

  // 测量容器尺寸（SVG viewBox 用）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setDims({ width: container.clientWidth || 360, height: 300 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const { nodes, links } = useMemo(() => {
    const { width, height } = dims;
    const ns: SimNode[] = graph.nodes.map((n, i) => {
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * 110,
        y: height / 2 + Math.sin(angle) * 110,
        vx: 0,
        vy: 0,
      };
    });
    const nodeMap = new Map(ns.map((n) => [n.id, n]));
    const ls: SimLink[] = graph.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, id: e.id }));
    return { nodes: ns, links: ls };
  }, [graph, dims]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const { width, height } = dims;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const simulation = forceSimulation<SimNode>(nodes)
      .force('charge', forceManyBody().strength(-300))
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(95).strength(0.5))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(48))
      .alphaDecay(0.04);
    simRef.current = simulation;

    const syncDoms = () => {
      nodes.forEach((n) => {
        const g = nodeGRefs.current.get(n.id);
        if (g) g.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
      });
      links.forEach((l) => {
        const s = typeof l.source === 'string' ? nodeMap.get(l.source) : (l.source as SimNode);
        const t = typeof l.target === 'string' ? nodeMap.get(l.target) : (l.target as SimNode);
        const line = edgeRefs.current.get(l.id);
        if (s && t && line) {
          line.setAttribute('x1', s.x.toFixed(1));
          line.setAttribute('y1', s.y.toFixed(1));
          line.setAttribute('x2', t.x.toFixed(1));
          line.setAttribute('y2', t.y.toFixed(1));
        }
      });
    };
    simulation.on('tick', syncDoms);
    syncDoms();

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [nodes, links, dims]);

  // pointer 坐标 → SVG 坐标
  const toSvgPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  // 拖拽
  const dragRef = useRef<{ node: SimNode; moved: boolean } | null>(null);
  const onNodePointerDown = (e: React.PointerEvent, node: SimNode) => {
    e.stopPropagation();
    const sim = simRef.current;
    if (!sim) return;
    dragRef.current = { node, moved: false };
    node.fx = node.x;
    node.fy = node.y;
    sim.alphaTarget(0.3).restart();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onSvgPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    if (!p) return;
    drag.moved = true;
    drag.node.fx = p.x;
    drag.node.fy = p.y;
  };
  const onSvgPointerUp = () => {
    const drag = dragRef.current;
    const sim = simRef.current;
    if (drag) {
      drag.node.fx = null;
      drag.node.fy = null;
      dragRef.current = null;
    }
    if (sim) sim.alphaTarget(0);
  };
  const onNodeClick = (e: React.MouseEvent, node: SimNode) => {
    if (dragRef.current?.moved) return; // 拖拽产生的 click 不算选择
    e.stopPropagation();
    setSelected(node);
  };

  const hasNodes = nodes.length > 0;

  return (
    <div className="graph-canvas-wrap">
      <div className="graph-canvas" ref={containerRef}>
        {hasNodes ? (
          <svg
            ref={svgRef}
            className="graph-canvas__svg"
            width={dims.width}
            height={dims.height}
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerUp}
          >
            <g className="graph-canvas__edges">
              {links.map((l) => (
                <line
                  key={l.id}
                  ref={(el) => {
                    if (el) edgeRefs.current.set(l.id, el);
                    else edgeRefs.current.delete(l.id);
                  }}
                  className="graph-canvas__edge"
                  x1={0} y1={0} x2={0} y2={0}
                />
              ))}
            </g>
            <g className="graph-canvas__nodes">
              {nodes.map((n) => {
                const color = NODE_COLOR_CSS[n.type] ?? '#2557da';
                const emoji = NODE_EMOJI[n.type] ?? '●';
                const label = truncateLabel(n.title, 5);
                return (
                  <g
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeGRefs.current.set(n.id, el);
                      else nodeGRefs.current.delete(n.id);
                    }}
                    transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}
                    className={`graph-canvas__node${selected?.id === n.id ? ' graph-canvas__node--selected' : ''}`}
                    onPointerDown={(e) => onNodePointerDown(e, n)}
                    onClick={(e) => onNodeClick(e, n)}
                  >
                    <rect x={-40} y={-13} width={80} height={26} rx={13} fill={color} />
                    <text x={-30} y={1} className="graph-canvas__node-emoji" dominantBaseline="middle">{emoji}</text>
                    <text x={-12} y={1} className="graph-canvas__node-label" dominantBaseline="middle">{label}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className="graph-canvas__empty">
            <p className="soft-text">{emptyHint ?? '暂无图节点，发起一次发明或喂养后这里会长出计划图。'}</p>
          </div>
        )}
      </div>
      <NodeDetailDrawer node={selected} onClose={() => setSelected(null)} onDelete={onDeleteNode} />
    </div>
  );
}

function truncateLabel(title: string, max = 5): string {
  const t = (title ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
