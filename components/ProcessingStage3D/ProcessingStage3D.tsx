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
 * - 3D mascot：圆形徽章式 avatar 纹理，漂浮 + Y 轴摇摆（把方形头像感藏起来）
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
    let disposed = false;

    const width = container.clientWidth || 320;
    const height = 212;

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

    // ---- mascot（圆形悬浮徽章，替代方形头像贴图）----
    const loadingAvatarId = mode === 'image'
      ? avatar
      : (avatar === 'yunyu-main' ? 'yunyun-chibi' : avatar);
    const meta = pocketAvatars[loadingAvatarId] ?? pocketAvatars['yunyu-main'];
    const mascotGroup = new THREE.Group();
    mascotGroup.position.y = 0.06;
    scene.add(mascotGroup);

    const mascotShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 48),
      new THREE.MeshBasicMaterial({
        color: 0x2557da,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    mascotShadow.scale.set(1.9, 0.34, 1);
    mascotShadow.position.set(0, -1.66, -0.55);
    mascotGroup.add(mascotShadow);

    const badgeFrame = new THREE.Mesh(
      new THREE.CircleGeometry(1.68, 72),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
      }),
    );
    badgeFrame.position.z = 0.04;
    mascotGroup.add(badgeFrame);

    const badgeGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.86, 72),
      new THREE.MeshBasicMaterial({
        color: MOOD_COLOR.thinking,
        transparent: true,
        opacity: 0.10,
        depthWrite: false,
      }),
    );
    badgeGlow.position.z = -0.08;
    mascotGroup.add(badgeGlow);
    const badgeGlowMat = badgeGlow.material as THREE.MeshBasicMaterial;

    // mascot 背后柔光晕（更像一颗漂浮的口袋星球）
    const haloMat = new THREE.MeshBasicMaterial({
      color: MOOD_COLOR.thinking, transparent: true, opacity: 0.18, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), haloMat);
    halo.position.z = -0.3;
    scene.add(halo);

    let portraitMesh: THREE.Mesh | null = null;
    let portraitTexture: THREE.CanvasTexture | null = null;
    void (async () => {
      try {
        portraitTexture = await createPortraitBadgeTexture(meta.path, currentMood, mode);
        if (disposed) {
          portraitTexture.dispose();
          portraitTexture = null;
          return;
        }
        const portraitMat = new THREE.MeshBasicMaterial({
          map: portraitTexture,
          transparent: true,
          depthWrite: false,
        });
        portraitMesh = new THREE.Mesh(new THREE.CircleGeometry(1.46, 72), portraitMat);
        portraitMesh.position.z = 0.08;
        mascotGroup.add(portraitMesh);
      } catch (err) {
        console.warn('[ProcessingStage3D] 头像贴图加载失败：', err);
      }
    })();

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
      badgeGlowMat.color.copy(lightColor);
      pMat.color.copy(lightColor);
      ringMat.color.copy(lightColor);

      // mascot 漂浮 + 摇摆
      if (!reducedMotion) {
        mascotGroup.position.y = 0.06 + Math.sin(t * 1.6) * 0.14;
        const sway = Math.sin(t * 0.9) * 0.16; // ±9°
        mascotGroup.rotation.y = modeRef.current === 'image'
          ? t * 1.7 // 生图：轻快转动
          : sway + burstK * 1.5;
        mascotGroup.rotation.z = Math.sin(t * 1.2) * 0.05;
        mascotGroup.rotation.x = -0.12 + Math.sin(t * 0.75) * 0.03;
        // 阶段切换轻微缩放脉冲
        const pulse = 1 + burstK * 0.10;
        mascotGroup.scale.setScalar(pulse);
      }

      // halo 呼吸
      halo.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);
      mascotShadow.scale.set(1.9 + Math.sin(t * 1.4) * 0.03, 0.34 + Math.sin(t * 1.4) * 0.01, 1);

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
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (portraitMesh) {
        mascotGroup.remove(portraitMesh);
        portraitMesh.geometry.dispose();
        const portraitMaterial = portraitMesh.material;
        if (Array.isArray(portraitMaterial)) {
          portraitMaterial.forEach((m) => m.dispose());
        } else {
          portraitMaterial.dispose();
        }
        portraitMesh = null;
      }
      if (portraitTexture) {
        portraitTexture.dispose();
        portraitTexture = null;
      }
      mascotGroup.remove(mascotShadow);
      mascotGroup.remove(badgeFrame);
      mascotGroup.remove(badgeGlow);
      mascotShadow.geometry.dispose();
      (mascotShadow.material as THREE.Material).dispose();
      badgeFrame.geometry.dispose();
      (badgeFrame.material as THREE.Material).dispose();
      badgeGlow.geometry.dispose();
      (badgeGlow.material as THREE.Material).dispose();
      renderer.dispose();
      haloMat.dispose();
      halo.geometry.dispose();
      pMat.dispose();
      pGeo.dispose();
      pTex.dispose();
      ringMat.dispose();
      ring.geometry.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [active, avatar, mode, reducedMotion]);

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

function resolveAssetUrl(path: string): string {
  return new URL(path, window.location.href).toString();
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`头像加载失败：${src}`));
    img.src = src;
  });
}

async function createPortraitBadgeTexture(
  src: string,
  mood: PocketBuddyMood,
  mode: ProcessingStage3DProps['mode'],
): Promise<THREE.CanvasTexture> {
  const img = await loadImageElement(resolveAssetUrl(src));
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建头像画布');

  const center = size / 2;
  const portraitRadius = size * 0.34;
  const frameRadius = portraitRadius * 1.08;
  const accent = new THREE.Color(MOOD_COLOR[mood]);
  const accentRgb = `rgba(${Math.round(accent.r * 255)}, ${Math.round(accent.g * 255)}, ${Math.round(accent.b * 255)},`;
  const modeTint = mode === 'image' ? 'rgba(241, 196, 15,' : accentRgb;

  // 背景：一层干净的泡泡底
  const bg = ctx.createRadialGradient(center * 0.98, center * 0.82, size * 0.08, center, center, size * 0.55);
  bg.addColorStop(0, 'rgba(255,255,255,0.98)');
  bg.addColorStop(0.55, 'rgba(246,250,255,0.94)');
  bg.addColorStop(1, 'rgba(220,234,255,0.70)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const aura = ctx.createRadialGradient(center * 0.82, center * 0.72, 0, center, center * 0.48, size * 0.52);
  aura.addColorStop(0, `${modeTint}0.28)`);
  aura.addColorStop(0.55, `${modeTint}0.12)`);
  aura.addColorStop(1, `${modeTint}0)`);
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, size, size);

  // 下方漂浮影子
  ctx.fillStyle = 'rgba(37, 87, 218, 0.10)';
  ctx.beginPath();
  ctx.ellipse(center, size * 0.79, size * 0.23, size * 0.048, 0, 0, Math.PI * 2);
  ctx.fill();

  // 头像主体：圆形裁切，避免方块贴图感
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center * 0.52 + 20, portraitRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const frameFill = ctx.createRadialGradient(center * 0.88, center * 0.46, size * 0.08, center, center * 0.5, portraitRadius * 1.1);
  frameFill.addColorStop(0, 'rgba(255,255,255,0.86)');
  frameFill.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = frameFill;
  ctx.fillRect(center - frameRadius, center - frameRadius, frameRadius * 2, frameRadius * 2);

  drawImageCover(ctx, img, center - portraitRadius, center * 0.52 + 20 - portraitRadius, portraitRadius * 2, portraitRadius * 2);

  const shine = ctx.createRadialGradient(center * 0.78, center * 0.30, 0, center * 0.78, center * 0.30, portraitRadius * 0.85);
  shine.addColorStop(0, 'rgba(255,255,255,0.48)');
  shine.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(center - portraitRadius, center * 0.52 + 20 - portraitRadius, portraitRadius * 2, portraitRadius * 2);
  ctx.restore();

  // 外圈与高光
  ctx.lineWidth = size * 0.028;
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.beginPath();
  ctx.arc(center, center * 0.52 + 20, frameRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = size * 0.012;
  ctx.strokeStyle = 'rgba(37, 87, 218, 0.84)';
  ctx.beginPath();
  ctx.arc(center, center * 0.52 + 20, frameRadius + size * 0.006, 0, Math.PI * 2);
  ctx.stroke();

  // 轻轻加一点“口袋星尘”
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(size * 0.27, size * 0.22, size * 0.014, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.72, size * 0.18, size * 0.010, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
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
