interface PocketBuddyFabOptions {
  button: HTMLButtonElement;
  stage: HTMLElement;
  fallbackIconUrl: string;
  preferReducedMotion: boolean;
  onActivate: () => void | Promise<void>;
}

export async function mountPocketBuddyFab(options: PocketBuddyFabOptions): Promise<() => void> {
  const {
    button,
    stage,
    fallbackIconUrl,
    preferReducedMotion,
    onActivate,
  } = options;

  let disposed = false;
  let cleanupRenderer: (() => void) | null = null;

  button.setAttribute('aria-label', 'PocketBuddy');
  button.addEventListener('click', handleActivate);

  const applyFallback = () => {
    stage.replaceChildren(createFallbackIcon(fallbackIconUrl));
    button.dataset.mode = 'fallback';
    button.classList.remove('pb-fab--three');
    button.classList.add('pb-fab--fallback');
  };

  if (preferReducedMotion || !supportsWebGL()) {
    applyFallback();
    return () => {
      disposed = true;
      button.removeEventListener('click', handleActivate);
    };
  }

  applyFallback();

  try {
    const THREE = await import('three');
    if (disposed) {
      return () => {
        button.removeEventListener('click', handleActivate);
      };
    }

    cleanupRenderer = mountThreePocketBuddy({
      THREE,
      button,
      stage,
    });
    button.dataset.mode = 'three';
    button.classList.remove('pb-fab--fallback');
    button.classList.add('pb-fab--three');
  } catch {
    applyFallback();
  }

  return () => {
    disposed = true;
    cleanupRenderer?.();
    button.removeEventListener('click', handleActivate);
  };

  function handleActivate() {
    void onActivate();
  }
}

function createFallbackIcon(url: string) {
  const img = document.createElement('img');
  img.className = 'pb-fab__fallback';
  img.src = url;
  img.alt = '';
  img.draggable = false;
  return img;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function mountThreePocketBuddy({
  THREE,
  button,
  stage,
}: {
  THREE: typeof import('three');
  button: HTMLButtonElement;
  stage: HTMLElement;
}): () => void {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
    precision: 'mediump',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'pb-fab__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 5.2);

  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(2, 4, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xb7d8ff, 1.25);
  fillLight.position.set(-3, 1, 4);
  scene.add(fillLight);

  const pet = new THREE.Group();
  scene.add(pet);

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcedff,
    transparent: true,
    opacity: 0.16,
    roughness: 0.08,
    metalness: 0.05,
    emissive: 0xc7e3ff,
    emissiveIntensity: 0.18,
  });
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.36, 32, 24),
    shellMaterial,
  );
  pet.add(shell);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.96, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.08,
      emissive: 0xebf6ff,
      emissiveIntensity: 0.12,
    }),
  );
  body.scale.set(1.02, 1.08, 0.95);
  pet.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0xe6f7ff,
      roughness: 0.42,
      metalness: 0.02,
    }),
  );
  belly.position.set(0, -0.12, 0.38);
  belly.scale.set(1.0, 0.92, 0.84);
  pet.add(belly);

  const earMaterial = new THREE.MeshStandardMaterial({
    color: 0xfdfefe,
    roughness: 0.3,
    metalness: 0.04,
    emissive: 0xeaf4ff,
    emissiveIntensity: 0.08,
  });
  const leftEar = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.44, 5), earMaterial);
  leftEar.position.set(-0.35, 0.82, -0.06);
  leftEar.rotation.z = -0.22;
  leftEar.rotation.x = -0.08;
  pet.add(leftEar);

  const rightEar = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.44, 5), earMaterial);
  rightEar.position.set(0.35, 0.82, -0.06);
  rightEar.rotation.z = 0.22;
  rightEar.rotation.x = -0.08;
  pet.add(rightEar);

  const face = new THREE.Group();
  face.position.set(0, 0.02, 0.88);
  pet.add(face);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x18324d, roughness: 0.45, metalness: 0.02 });
  const highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.02 });
  const cheekMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7bfd2,
    transparent: true,
    opacity: 0.55,
    roughness: 0.6,
  });

  const eyeGeometry = new THREE.SphereGeometry(0.085, 16, 16);
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.23, 0.05, 0);
  face.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.23, 0.05, 0);
  face.add(rightEye);

  const leftHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), highlightMaterial);
  leftHighlight.position.set(-0.2, 0.08, 0.06);
  face.add(leftHighlight);

  const rightHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), highlightMaterial);
  rightHighlight.position.set(0.26, 0.08, 0.06);
  face.add(rightHighlight);

  const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 14), cheekMaterial);
  leftCheek.position.set(-0.31, -0.1, -0.02);
  face.add(leftCheek);

  const rightCheek = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 14), cheekMaterial);
  rightCheek.position.set(0.31, -0.1, -0.02);
  face.add(rightCheek);

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x7f5a7c, roughness: 0.7 }),
  );
  mouth.position.set(0, -0.13, 0.04);
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.z = Math.PI;
  face.add(mouth);

  const tail = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.03, 10, 18),
    new THREE.MeshStandardMaterial({
      color: 0xcfe7ff,
      roughness: 0.35,
      metalness: 0.03,
      emissive: 0xd9f0ff,
      emissiveIntensity: 0.08,
    }),
  );
  tail.position.set(0, -0.55, -0.78);
  tail.rotation.x = Math.PI / 2;
  tail.rotation.z = Math.PI / 4;
  pet.add(tail);

  const sparkles = new THREE.Group();
  scene.add(sparkles);
  const sparkleMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dc8ff,
    roughness: 0.35,
    metalness: 0.12,
    emissive: 0x9dd8ff,
    emissiveIntensity: 0.5,
  });
  const sparkleGeometry = new THREE.OctahedronGeometry(0.06, 0);
  const sparkleMeshes: Array<import('three').Mesh> = [];
  for (let index = 0; index < 3; index += 1) {
    const sparkle = new THREE.Mesh(sparkleGeometry, sparkleMaterial.clone());
    sparkle.userData.phase = (Math.PI * 2 * index) / 3;
    sparkles.add(sparkle);
    sparkleMeshes.push(sparkle);
  }

  const clock = new THREE.Clock();
  let rafId = 0;
  let disposed = false;
  let hovered = false;
  let pressed = false;
  let targetTiltX = 0;
  let targetTiltY = 0;
  let blinkStart = clock.getElapsedTime() + 1.8 + Math.random() * 2.2;
  let nextBlink = blinkStart + 0.18;
  let blinkActive = false;
  const resizeObserver = new ResizeObserver(() => resizeRenderer());
  resizeObserver.observe(button);

  const handlePointerEnter = () => {
    hovered = true;
    button.dataset.state = 'hover';
  };
  const handlePointerLeave = () => {
    hovered = false;
    pressed = false;
    targetTiltX = 0;
    targetTiltY = 0;
    button.dataset.state = 'idle';
  };
  const handlePointerMove = (event: PointerEvent) => {
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetTiltX = clamp(x, -1, 1);
    targetTiltY = clamp(y, -1, 1);
  };
  const handlePointerDown = () => {
    pressed = true;
    button.dataset.state = 'pressed';
  };
  const handlePointerUp = () => {
    pressed = false;
    if (hovered) button.dataset.state = 'hover';
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      button.dataset.state = 'idle';
    }
  };

  button.addEventListener('pointerenter', handlePointerEnter);
  button.addEventListener('pointerleave', handlePointerLeave);
  button.addEventListener('pointermove', handlePointerMove);
  button.addEventListener('pointerdown', handlePointerDown);
  button.addEventListener('pointerup', handlePointerUp);
  button.addEventListener('pointercancel', handlePointerLeave);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
  animate();

  return () => {
    disposed = true;
    window.cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    button.removeEventListener('pointerenter', handlePointerEnter);
    button.removeEventListener('pointerleave', handlePointerLeave);
    button.removeEventListener('pointermove', handlePointerMove);
    button.removeEventListener('pointerdown', handlePointerDown);
    button.removeEventListener('pointerup', handlePointerUp);
    button.removeEventListener('pointercancel', handlePointerLeave);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('resize', resizeRenderer);
    renderer.dispose();
    disposeThreeObject(scene);
    stage.replaceChildren();
  };

  function animate() {
    if (disposed) return;
    rafId = window.requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();
    if (!blinkActive && elapsed >= blinkStart) {
      blinkActive = true;
      nextBlink = elapsed + 0.15;
    }
    if (blinkActive && elapsed >= nextBlink) {
      blinkActive = false;
      blinkStart = elapsed + 2.6 + Math.random() * 3.4;
    }

    const bob = Math.sin(elapsed * 2.1) * 0.06;
    const hoverScale = hovered ? 1.05 : 1;
    const pressScale = pressed ? 0.94 : 1;
    const scale = hoverScale * pressScale;

    pet.position.y = 0.02 + bob + (hovered ? 0.02 : 0);
    pet.rotation.y = lerp(pet.rotation.y, targetTiltX * 0.42 + Math.sin(elapsed * 0.45) * 0.16, 0.08);
    pet.rotation.x = lerp(pet.rotation.x, -targetTiltY * 0.22 + Math.sin(elapsed * 0.72) * 0.06, 0.08);
    pet.rotation.z = lerp(pet.rotation.z, -targetTiltX * 0.08, 0.08);
    pet.scale.setScalar(scale);

    leftEar.rotation.z = lerp(leftEar.rotation.z, -0.22 - targetTiltX * 0.04 + Math.sin(elapsed * 3.8) * 0.03, 0.08);
    rightEar.rotation.z = lerp(rightEar.rotation.z, 0.22 - targetTiltX * 0.04 - Math.sin(elapsed * 3.8) * 0.03, 0.08);

    const blinkValue = blinkActive ? smoothstep(0, 1, 1 - Math.min(1, (elapsed - blinkStart) / 0.15)) : 1;
    const eyeScaleY = 0.25 + blinkValue * 0.75;
    leftEye.scale.y = eyeScaleY;
    rightEye.scale.y = eyeScaleY;
    leftHighlight.scale.y = eyeScaleY;
    rightHighlight.scale.y = eyeScaleY;

    shellMaterial.opacity = hovered ? 0.24 : 0.16;
    shell.rotation.y = elapsed * 0.12;

    tail.rotation.z = Math.PI / 4 + Math.sin(elapsed * 2.8) * 0.12;
    tail.position.y = -0.55 + Math.sin(elapsed * 2.2) * 0.03;

    sparkles.rotation.y = elapsed * 0.42;
    sparkles.rotation.x = Math.sin(elapsed * 0.36) * 0.14;
    sparklesMeshPulse(elapsed);

    renderer.render(scene, camera);
  }

  function sparklesMeshPulse(elapsed: number) {
    sparkleMeshes.forEach((sparkle, index) => {
      const phase = elapsed * 1.25 + index * 2.2;
      const orbit = 1.46 + Math.sin(elapsed * 0.95 + index) * 0.08;
      sparkle.position.set(
        Math.cos(phase) * orbit,
        0.05 + Math.sin(phase * 0.9) * 0.14,
        Math.sin(phase) * 0.22,
      );
      sparkle.rotation.x = elapsed + index;
      sparkle.rotation.y = elapsed * 0.7 + index;
      const pulse = 0.85 + Math.sin(elapsed * 2.4 + index) * 0.15;
      sparkle.scale.setScalar(pulse);
    });
  }

  function resizeRenderer() {
    const rect = button.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 64));
    const height = Math.max(1, Math.round(rect.height || 64));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function disposeThreeObject(root: import('three').Object3D) {
  root.traverse((obj) => {
    const mesh = obj as import('three').Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current: number, target: number, alpha: number) {
  return current + (target - current) * alpha;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
