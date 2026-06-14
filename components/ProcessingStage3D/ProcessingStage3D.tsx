import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { pocketAvatars } from '@/lib/brand/avatars';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type { PocketBuddyMood } from '@/lib/agent/types';
import './ProcessingStage3D.css';

interface Stage3D {
  label: string;
  mood: PocketBuddyMood;
}

interface ProcessingStage3DProps {
  active: boolean;
  avatar?: PocketAvatarId;
  mode?: 'invent' | 'image' | 'feed';
  stages: Stage3D[];
  currentStage: number;
  reducedMotion?: boolean;
}

/** mood → 主色（粒子 + 光照共用） */
const MOOD_COLOR: Record<PocketBuddyMood, number> = {
  idle: 0x9370db, // 紫
  warm: 0xf39c12, // 橙
  thinking: 0x2557da, // 蓝
  spark: 0xf1c40f, // 金
};

/**
 * three.js 真 3D 加工动画场景（产品重设计：旧版 PNG+CSS 太简陋，用户要求真 3D）。
 *
 * 组成：
 * - 3D mascot：avatar PNG 纹理贴 Plane（billboard），漂浮 + Y 轴摇摆（透视立体感）
 * - 粒子系统：~40 粒子环绕 mascot 圆形轨道，mood 色变，阶段切换爆发外扩
 * - 光照：AmbientLight + PointLight（mood 色）
 * - 阶段转场：currentStage 变化 → mascot 旋转 + 粒子爆发 + 光变色
 * - 生图模式（image）：mascot 庆祝旋转 + TorusGeometry 进度环
 * - reduced-motion：静态 3D（不漂浮/不旋转），粒子静止环绕
 */
export default function ProcessingStage3D({
  active,
  avatar = 'yunyu-main',
  mode = 'invent',
  stages,
  currentStage,
  reducedMotion = false,
}: ProcessingStage3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 用 ref 透传动态值给 3D 渲染循环（避免重建 scene）
  const stageRef = useRef(currentStage);
  const moodRef = useRef<PocketBuddyMood>(stages[Math.min(currentStage, stages.length - 1)]?.mood ?? 'thinking');
  const modeRef = useRef(mode);
  const burstRef = useRef(0); // 阶段切换爆发计数

  stageRef.current = currentStage;
  modeRef.current = mode;
  const currentMood = stages[Math.min(currentStage, stages.length - 1)]?.mood ?? 'thinking';
  moodRef.current = currentMood;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !active) return;

    const width = container.clientWidth || 320;
    const height = 200;

    // ---- renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ---- scene + 透视相机 ----
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 6);

    // ---- 光照 ----
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(MOOD_COLOR.thinking, 1.4, 20);
    pointLight.position.set(0, 2, 3);
    scene.add(pointLight);

    // ---- mascot（PNG 纹理 Plane，billboard）----
    const meta = pocketAvatars[avatar] ?? pocketAvatars['yunyu-main'];
    const loader = new THREE.TextureLoader();
    const tex = loader.load(meta.path);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mascotMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mascot = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mascotMat);
    scene.add(mascot);

    // mascot 背后柔光晕（同色大平面，模糊感）
    const haloMat = new THREE.MeshBasicMaterial({
      color: MOOD_COLOR.thinking, transparent: true, opacity: 0.18, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), haloMat);
    halo.position.z = -0.3;
    scene.add(halo);

    // ---- 粒子系统（~40 粒子环绕）----
    const PARTICLE_COUNT = 44;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const orbit = new Float32Array(PARTICLE_COUNT * 3); // [radius, speed, phase]
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const radius = 1.9 + (i % 5) * 0.35;
      orbit[i * 3] = radius;
      orbit[i * 3 + 1] = 0.3 + (i % 7) * 0.12; // 角速度
      orbit[i * 3 + 2] = (i / PARTICLE_COUNT) * Math.PI * 2; // 初始相位
      positions[i * 3] = Math.cos(orbit[i * 3 + 2]) * radius;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(orbit[i * 3 + 2]) * radius;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // 用 Canvas 生成圆形粒子贴图（避免方块）
    const pTex = makeCircleTexture();
    const pMat = new THREE.PointsMaterial({
      size: 0.28,
      map: pTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: MOOD_COLOR.thinking,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ---- 生图进度环（TorusGeometry，image 模式）----
    const ringMat = new THREE.MeshBasicMaterial({ color: MOOD_COLOR.spark, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 16, 64), ringMat);
    scene.add(ring);

    // ---- 动画循环 ----
    let raf = 0;
    let prevStage = stageRef.current;
    let burstT = 0; // 爆发动效剩余帧
    const clock = new THREE.Clock();
    let lightColor = new THREE.Color(MOOD_COLOR.thinking);
    let targetLightColor = new THREE.Color(MOOD_COLOR.thinking);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const mood = moodRef.current;
      targetLightColor.set(MOOD_COLOR[mood]);

      // 阶段切换检测 → 触发爆发
      if (stageRef.current !== prevStage) {
        burstT = 30; // ~0.5s 爆发
        prevStage = stageRef.current;
        burstRef.current += 1;
      }
      if (burstT > 0) burstT -= 1;
      const burstK = burstT / 30; // 1→0

      // 光色 lerp
      lightColor.lerp(targetLightColor, 0.06);
      pointLight.color.copy(lightColor);
      haloMat.color.copy(lightColor);
      pMat.color.copy(lightColor);
      ringMat.color.copy(lightColor);

      // mascot 漂浮 + 摇摆
      if (!reducedMotion) {
        mascot.position.y = Math.sin(t * 1.6) * 0.18;
        const sway = Math.sin(t * 0.9) * 0.18; // ±10°
        mascot.rotation.y = modeRef.current === 'image'
          ? t * 2.2 // 生图：快速旋转庆祝
          : sway + burstK * Math.PI * 2; // 阶段切换：旋转一周
        mascot.rotation.z = Math.sin(t * 1.2) * 0.04;
        // 阶段切换轻微缩放脉冲
        const pulse = 1 + burstK * 0.12;
        mascot.scale.setScalar(pulse);
      }

      // halo 呼吸
      halo.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);

      // 粒子轨道运动
      const posAttr = pGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const r0 = orbit[i * 3];
        const speed = orbit[i * 3 + 1];
        const phase = orbit[i * 3 + 2];
        const angle = phase + t * speed;
        const burstExpand = 1 + burstK * 0.5; // 爆发外扩
        const r = r0 * burstExpand;
        posAttr.setX(i, Math.cos(angle) * r);
        posAttr.setZ(i, Math.sin(angle) * r);
        posAttr.setY(i, Math.sin(t * 1.8 + phase) * 0.3);
      }
      posAttr.needsUpdate = true;

      // 生图模式：进度环显形 + 旋转
      if (modeRef.current === 'image') {
        ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, 0.7, 0.08);
        ring.rotation.z = t * 1.5;
        ring.rotation.x = Math.PI / 2.4;
      } else {
        ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, 0, 0.1);
      }

      renderer.render(scene, camera);
    };
    animate();

    // ---- resize ----
    const resize = () => {
      const w = container.clientWidth || width;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ---- cleanup ----
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mascotMat.dispose();
      mascot.geometry.dispose();
      haloMat.dispose();
      halo.geometry.dispose();
      pMat.dispose();
      pGeo.dispose();
      pTex.dispose();
      ringMat.dispose();
      ring.geometry.dispose();
      tex.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [active, avatar, reducedMotion]);

  return (
    <div className={`processing-3d${mode === 'image' ? ' processing-3d--image' : ''}`}>
      <div className="processing-3d__canvas" ref={containerRef} />
      {mode !== 'image' && stages.length > 0 ? (
        <div className="processing-3d__rail">
          {stages.map((s, i) => {
            const done = i < currentStage;
            const isCurrent = i === currentStage;
            const cls = [
              'processing-3d__step',
              done ? 'processing-3d__step--done' : '',
              isCurrent ? 'processing-3d__step--current' : '',
            ].filter(Boolean).join(' ');
            return (
              <div key={s.label} className={cls}>
                <span className="processing-3d__step-dot">{done ? '✓' : i + 1}</span>
                <span className="processing-3d__step-label">{s.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** 用 Canvas 生成圆形渐变粒子贴图（避免方块粒子）。 */
function makeCircleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
