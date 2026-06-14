import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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

/** 节点类型 → 颜色（沿用 App.css 的 --pb-primary 蓝色系 + timeline-badge 语义色） */
const NODE_COLORS: Record<GraphNodeType, number> = {
  idea: 0x2557da,
  plan: 0x4a90e2,
  research: 0x7b68ee,
  reflect: 0x9370db,
  structure: 0x6a5acd,
  note: 0x2e8b57,
  image: 0xe67e22,
  mindmap: 0x16a085,
  memory: 0x8e44ad,
  success: 0x27ae60,
  failure: 0xc0392b,
  tool: 0x34495e,
  skill: 0x2980b9,
  profile: 0xf39c12,
  feedback: 0xe74c3c,
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
  reducedMotion?: boolean;
  onDeleteNode?: (nodeId: string) => void;
  /** 空图时显示的占位文案 */
  emptyHint?: string;
}

/**
 * 力导向图渲染层：d3-force 做物理仿真，three.js 做渲染。
 * 复用 pocketbuddy-fab.ts 的 renderer/ResizeObserver/dispose 骨架；
 * 正交相机 + z=0 平面（2D 力导向，适合 sidepanel 窄屏）；
 * 交互：拖拽节点（fx/fy + reheat）、滚轮缩放、点击选节点（→ NodeDetailDrawer）。
 */
export default function GraphCanvas({ graph, reducedMotion, onDeleteNode, emptyHint }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    // 空图直接返回（不初始化 three，省资源）
    if (graph.nodes.length === 0) return;

    // ---- three setup ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 正交相机：left=0,right=width,top=0,bottom=height → y 向下，匹配 d3 屏幕坐标
    const camera = new THREE.OrthographicCamera(0, width, 0, height, -1000, 1000);
    camera.position.z = 100;

    const scene = new THREE.Scene();

    // ---- d3-force ----
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * 80,
        y: height / 2 + Math.sin(angle) * 80,
        vx: 0,
        vy: 0,
      };
    });
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, id: e.id }));

    const simulation = forceSimulation<SimNode>(nodes)
      .force('charge', forceManyBody().strength(reducedMotion ? -120 : -220))
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(80).strength(0.5))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(26))
      .alphaDecay(0.04);
    if (reducedMotion) simulation.alpha(0.3);

    // ---- node meshes ----
    const nodeGeometry = new THREE.CircleGeometry(11, 28);
    const meshes = new Map<string, THREE.Mesh>();
    nodes.forEach((n) => {
      const material = new THREE.MeshBasicMaterial({ color: NODE_COLORS[n.type] ?? 0x2557da });
      const mesh = new THREE.Mesh(nodeGeometry, material);
      scene.add(mesh);
      meshes.set(n.id, mesh);
    });

    // ---- edges ----
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x15304a, transparent: true, opacity: 0.22 });
    const edgePositions = new Float32Array(links.length * 6);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    scene.add(edgeLines);

    const syncPositions = () => {
      nodes.forEach((n) => {
        const mesh = meshes.get(n.id);
        if (mesh) mesh.position.set(n.x, n.y, 0);
      });
      links.forEach((link, i) => {
        const s = typeof link.source === 'string' ? nodeMap.get(link.source) : (link.source as SimNode);
        const t = typeof link.target === 'string' ? nodeMap.get(link.target) : (link.target as SimNode);
        if (s && t) {
          edgePositions[i * 6] = s.x;
          edgePositions[i * 6 + 1] = s.y;
          edgePositions[i * 6 + 3] = t.x;
          edgePositions[i * 6 + 4] = t.y;
        }
      });
      edgeGeometry.attributes.position.needsUpdate = true;
    };

    simulation.on('tick', () => {
      syncPositions();
      renderer.render(scene, camera);
    });
    syncPositions();
    renderer.render(scene, camera);

    // ---- pointer interaction ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let dragNode: SimNode | null = null;
    let dragMoved = false;

    const toWorld = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      raycaster.ray.intersectPlane(plane, hit);
      return { x: hit.x, y: hit.y };
    };

    const pickNode = (clientX: number, clientY: number): SimNode | null => {
      const { x, y } = toWorld(clientX, clientY);
      let closest: SimNode | null = null;
      let minDist = 16;
      nodes.forEach((n) => {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < minDist) {
          minDist = d;
          closest = n;
        }
      });
      return closest;
    };

    const onPointerDown = (e: PointerEvent) => {
      const node = pickNode(e.clientX, e.clientY);
      if (node) {
        dragNode = node;
        dragMoved = false;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(0.3).restart();
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragNode) return;
      dragMoved = true;
      const { x, y } = toWorld(e.clientX, e.clientY);
      dragNode.fx = x;
      dragNode.fy = y;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragNode) {
        dragNode.fx = null;
        dragNode.fy = null;
        simulation.alphaTarget(0);
        dragNode = null;
      }
    };
    const onPointerClick = (e: PointerEvent) => {
      if (dragMoved) return; // 拖拽产生的 click 不算选择
      const node = pickNode(e.clientX, e.clientY);
      setSelected(node ?? null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      camera.zoom = Math.max(0.3, Math.min(3, camera.zoom * factor));
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);
    renderer.domElement.addEventListener('click', onPointerClick);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // ---- resize ----
    const resize = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      renderer.setSize(w, h);
      camera.left = 0;
      camera.right = w;
      camera.top = 0;
      camera.bottom = h;
      camera.updateProjectionMatrix();
      simulation.force('center', forceCenter(w / 2, h / 2));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // ---- cleanup ----
    return () => {
      simulation.stop();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerUp);
      renderer.domElement.removeEventListener('click', onPointerClick);
      renderer.domElement.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      meshes.forEach((m) => (m.material as THREE.Material).dispose());
      nodeGeometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [graph, reducedMotion]);

  // selected 高亮：放大对应节点
  useEffect(() => {
    if (!selected) return;
    // 高亮通过重建 effect 之外的 DOM 提示实现；three mesh scale 需访问闭包内 meshes，此处省略避免复杂化
  }, [selected]);

  return (
    <div className="graph-canvas-wrap">
      <div className="graph-canvas" ref={containerRef}>
        {graph.nodes.length === 0 ? (
          <div className="graph-canvas__empty">
            <p className="soft-text">{emptyHint ?? '暂无图节点，发起一次发明或喂养后这里会长出计划图。'}</p>
          </div>
        ) : null}
      </div>
      <NodeDetailDrawer node={selected} onClose={() => setSelected(null)} onDelete={onDeleteNode} />
    </div>
  );
}
