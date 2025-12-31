import * as THREE from "three";

// 慢热风格：不直接点明“喜欢”，你可以改成她的昵称/名字或留空
const GIRL_NAME = "她";
const YEAR_FROM = 2025;
const YEAR_TO = 2026;

// 每次“你主动放的烟花”绽放时，会浮现一句小夸夸/小祝福（更有陪伴感）
const LOVE_NOTES = [
  "愿你新的一年，被温柔稳稳接住",
  "你值得所有偏爱与例外",
  "把闪闪发光当作日常",
  "愿你心里有光，脚下有路",
  "愿你永远可爱，也永远被爱",
  "把烦恼交给风，把快乐留给你",
  "愿你所求皆如愿，所行皆坦途",
  "愿你被世界温柔以待",
  "愿你自信、自由、且丰盛",
  "你很好，真的很好",
  "愿你今晚做个甜甜的梦",
  "新年快乐，愿你平安喜乐",
];
const MAX_FLOATING_NOTES = 5; // 减少同时显示的数量，避免堆积

// 背景音乐（可填入联网音频直链，比如 mp3/m4a/ogg）。留空则不启用。
// 注意：移动端浏览器通常要求“用户手势”才能开始播放，这里会在第一次成功“双击放烟花”时尝试播放。
const MUSIC_URL = "";
const MUSIC_VOLUME = 0.42;

type Disposable = { dispose: () => void };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function rand(min: number, max: number): number {
  return lerp(min, max, Math.random());
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pickOne<T>(items: readonly T[]): T {
  return items[randInt(0, Math.max(0, items.length - 1))];
}

type FireworkPattern = "sphere" | "heart" | "ring";

function nowMs(): number {
  return performance.now();
}

function createBackgroundMusic(url: string): {
  enabled: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
} {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      enabled: false,
      start: () => void 0,
      pause: () => void 0,
      resume: () => void 0,
    };
  }

  const audio = new Audio();
  // 仅播放不做音频分析，crossOrigin 对多数情况不是必须；但设置为 anonymous 不会伤害。
  // 若音频源不允许跨域，播放通常仍可正常进行。
  audio.crossOrigin = "anonymous";
  audio.src = trimmed;
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = clamp(MUSIC_VOLUME, 0, 1);
  // iOS Safari
  (audio as any).playsInline = true;

  let started = false;

  async function tryPlay(): Promise<void> {
    try {
      await audio.play();
      started = true;
    } catch {
      // 用户手势/系统策略不允许时会抛异常：忽略即可
    }
  }

  return {
    enabled: true,
    start: () => {
      if (started) return;
      void tryPlay();
    },
    pause: () => {
      if (!started) return;
      audio.pause();
    },
    resume: () => {
      if (!started) return;
      void tryPlay();
    },
  };
}

function pickPastelFireworkColor(): THREE.Color {
  // 偏“浪漫”的柔和色系：粉 / 紫 / 蓝 / 香槟金 / 薄荷
  const palette = [
    "#ff6fb7",
    "#ff4fb1",
    "#cbbcff",
    "#77d6ff",
    "#ffd6a6",
    "#a9e8ff",
    "#b7ffd6",
  ];
  return new THREE.Color(palette[randInt(0, palette.length - 1)]);
}

function heartCurve2D(t: number): { x: number; y: number } {
  // 经典心形参数方程（缩放后用于方向采样）
  // x=16sin^3(t)
  // y=13cos(t)-5cos(2t)-2cos(3t)-cos(4t)
  const s = Math.sin(t);
  const x = 16 * s * s * s;
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return { x, y };
}

function randomDirectionForPattern(pattern: FireworkPattern): THREE.Vector3 {
  if (pattern === "ring") {
    // 环形：主要在水平面，带少量上下厚度
    const theta = rand(0, Math.PI * 2);
    const y = rand(-0.18, 0.18);
    return new THREE.Vector3(Math.cos(theta), y, Math.sin(theta)).normalize();
  }

  if (pattern === "heart") {
    // 心形：在局部平面上采样，然后随机旋转到 3D
    const t = rand(0, Math.PI * 2);
    const h = heartCurve2D(t);

    // 归一化 + 少量厚度（避免过“纸片”）
    const v = new THREE.Vector3(h.x, h.y, rand(-2.2, 2.2));
    v.multiplyScalar(0.06);
    v.normalize();

    // 随机旋转，让心形不总是正对镜头
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rand(-0.35, 0.35), rand(0, Math.PI * 2), 0)
    );
    v.applyQuaternion(q);
    return v;
  }

  // sphere
  const theta = rand(0, Math.PI * 2);
  const phi = Math.acos(rand(-1, 1));
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

function chooseFireworkPattern(isUserTriggered: boolean): FireworkPattern {
  // 点击/轻触更容易出现“心形”小心意
  const r = Math.random();
  if (isUserTriggered) {
    if (r < 0.32) return "heart";
    if (r < 0.46) return "ring";
    return "sphere";
  }
  if (r < 0.16) return "heart";
  if (r < 0.32) return "ring";
  return "sphere";
}

function getViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv) {
    // iOS Safari 地址栏/底栏会影响 innerHeight，用 visualViewport 更稳。
    return {
      width: Math.max(1, Math.floor(vv.width)),
      height: Math.max(1, Math.floor(vv.height)),
    };
  }
  return {
    width: Math.max(1, Math.floor(window.innerWidth)),
    height: Math.max(1, Math.floor(window.innerHeight)),
  };
}

function isTouchDevice(): boolean {
  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    // @ts-expect-error - older webkit.
    (navigator.msMaxTouchPoints ?? 0) > 0
  );
}

function setupOverlay(): void {
  const title = document.querySelector<HTMLDivElement>("#title");
  const subtitle = document.querySelector<HTMLDivElement>("#subtitle");
  const hint = document.querySelector<HTMLDivElement>("#hint");

  if (title) title.textContent = `${YEAR_TO} 新年快乐`;
  if (subtitle)
    subtitle.textContent = `写给${GIRL_NAME}：愿新岁不疾不徐，心安常伴。`;
  if (hint)
    // 有音乐时提示一下（不额外加按钮，靠双击手势触发播放）
    hint.textContent = isTouchDevice()
      ? MUSIC_URL.trim().length > 0
        ? "拖动旋转视角 · 拖拽中心图案 · 双指缩放 · 双击放烟花（小祝福·开启音乐）"
        : "拖动旋转视角 · 拖拽中心图案 · 双指缩放 · 双击放烟花（小祝福）"
      : MUSIC_URL.trim().length > 0
      ? "拖动旋转视角 · 拖拽中心图案 · 滚轮缩放 · 双击放烟花（小祝福·开启音乐）"
      : "拖动旋转视角 · 拖拽中心图案 · 滚轮缩放 · 双击放烟花（小祝福）";
}

class TouchOrbitControls implements Disposable {
  private readonly dom: HTMLElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3(0, 1.1, 0);
  private readonly spherical = new THREE.Spherical(
    6.2,
    Math.PI * 0.38,
    Math.PI * 0.25
  );
  private readonly desired = new THREE.Spherical(
    6.2,
    Math.PI * 0.38,
    Math.PI * 0.25
  );
  private isDragging = false;
  private pointerId: number | null = null;
  private readonly blockedPointers = new Set<number>();
  private lastX = 0;
  private lastY = 0;
  private autoSpin = true;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    this.dom.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
    });
    window.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", this.onPointerUp, {
      passive: true,
    });
    window.addEventListener("pointercancel", this.onPointerUp, {
      passive: true,
    });
  }

  setAutoSpin(enabled: boolean): void {
    this.autoSpin = enabled;
  }

  blockPointer(pointerId: number): void {
    this.blockedPointers.add(pointerId);
    // 如果当前正在用同一个 pointer 拖动相机，立刻释放
    if (this.pointerId === pointerId) {
      this.pointerId = null;
      this.isDragging = false;
    }
  }

  unblockPointer(pointerId: number): void {
    this.blockedPointers.delete(pointerId);
  }

  setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
  }

  setRadius(radius: number): void {
    this.desired.radius = radius;
    // 立即贴近，避免切换横竖屏时闪跳
    this.spherical.radius = radius;
  }

  setPhi(phi: number): void {
    this.desired.phi = phi;
    this.spherical.phi = phi;
  }

  update(dtSeconds: number): void {
    if (this.autoSpin && !this.isDragging) {
      this.desired.theta += dtSeconds * 0.18;
    }

    const follow = 1.0 - Math.pow(0.00001, dtSeconds);
    this.spherical.radius = lerp(
      this.spherical.radius,
      this.desired.radius,
      follow
    );
    this.spherical.theta = lerp(
      this.spherical.theta,
      this.desired.theta,
      follow
    );
    this.spherical.phi = lerp(this.spherical.phi, this.desired.phi, follow);
    this.spherical.phi = clamp(this.spherical.phi, 0.15, Math.PI * 0.48);
    this.spherical.radius = clamp(this.spherical.radius, 4.4, 10.0);

    const pos = new THREE.Vector3()
      .setFromSpherical(this.spherical)
      .add(this.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.blockedPointers.has(e.pointerId)) return;
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.blockedPointers.has(e.pointerId)) return;
    if (!this.isDragging || this.pointerId !== e.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    const rotSpeed = 0.0042;
    this.desired.theta -= dx * rotSpeed;
    this.desired.phi -= dy * rotSpeed;
    this.desired.phi = clamp(this.desired.phi, 0.15, Math.PI * 0.48);
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.blockedPointers.has(e.pointerId)) return;
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    this.isDragging = false;
  }

  dispose(): void {
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }
}

function createTextSprite(
  text: string,
  options?: {
    fontSize?: number;
    paddingX?: number;
    paddingY?: number;
    color?: string;
    glowColor?: string;
    maxWidth?: number;
  }
): THREE.Sprite {
  const fontSize = options?.fontSize ?? 72;
  const paddingX = options?.paddingX ?? 48;
  const paddingY = options?.paddingY ?? 36;
  const color = options?.color ?? "rgba(255,255,255,0.95)";
  const glowColor = options?.glowColor ?? "rgba(255, 110, 200, 0.85)";
  const maxWidth = options?.maxWidth ?? 1600;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  const font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.font = font;
  const metrics = ctx.measureText(text);

  const rawW = Math.min(maxWidth, Math.ceil(metrics.width));
  const w = rawW + paddingX * 2;
  const h = fontSize + paddingY * 2;

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const x = w * 0.5;
  const y = h * 0.5;

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = fontSize * 0.55;
  ctx.fillStyle = glowColor;
  ctx.fillText(text, x, y + 1);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = fontSize * 0.28;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    // 祝福文字不应该被任何 3D 图案遮挡
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1000;
  const worldHeight = 1.0;
  const aspect = w / h;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}

// 高质量庆祝文字 - 修复压缩问题
function createCelebrationText(
  text: string,
  options?: {
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    glowColor?: string;
    worldHeight?: number;
  }
): THREE.Sprite {
  const fontSize = options?.fontSize ?? 100;
  const color = options?.color ?? "#ffffff";
  const strokeColor = options?.strokeColor ?? "#ff6fb7";
  const glowColor = options?.glowColor ?? "rgba(255, 111, 183, 0.6)";
  const targetWorldHeight = options?.worldHeight ?? 0.8;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  const dpr = 2;
  const paddingX = fontSize * 0.6;
  const paddingY = fontSize * 0.5;

  const font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);

  const textWidth = metrics.width;
  const w = textWidth + paddingX * 2;
  const h = fontSize * 1.4 + paddingY * 2;

  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);

  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const x = w / 2;
  const y = h / 2;

  // 发光
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = fontSize * 0.15;

  // 描边
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = fontSize * 0.03;
  ctx.strokeText(text, x, y);

  // 填充
  ctx.shadowBlur = fontSize * 0.08;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1000;
  const aspect = w / h;
  sprite.scale.set(targetWorldHeight * aspect, targetWorldHeight, 1);
  return sprite;
}

// 创建3D星星装饰
function createCelebStar(size: number, color: THREE.Color): THREE.Mesh {
  const points = 5;
  const outerR = size;
  const innerR = size * 0.4;
  const starShape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI * 0.5 + (i * Math.PI) / points;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) starShape.moveTo(px, py);
    else starShape.lineTo(px, py);
  }
  starShape.closePath();

  const geometry = new THREE.ExtrudeGeometry(starShape, {
    depth: size * 0.12,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: size * 0.02,
    bevelThickness: size * 0.02,
  });
  geometry.center();

  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.6,
    metalness: 0.4,
    roughness: 0.3,
  });
  return new THREE.Mesh(geometry, material);
}

// 创建3D心形装饰
function createCelebHeart(size: number, color: THREE.Color): THREE.Mesh {
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, 0.22);
  heartShape.bezierCurveTo(0, 0.22, -0.25, -0.06, -0.48, 0.12);
  heartShape.bezierCurveTo(-0.78, 0.36, -0.78, 0.78, -0.48, 0.98);
  heartShape.bezierCurveTo(-0.2, 1.18, 0.15, 1.0, 0, 0.75);
  heartShape.bezierCurveTo(0.15, 1.0, 0.5, 1.18, 0.78, 0.98);
  heartShape.bezierCurveTo(1.08, 0.78, 1.08, 0.36, 0.78, 0.12);
  heartShape.bezierCurveTo(0.55, -0.06, 0, 0.22, 0, 0.22);

  const geometry = new THREE.ExtrudeGeometry(heartShape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.04,
    bevelThickness: 0.04,
  });
  geometry.center();
  geometry.scale(size, size, size);

  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.7,
    metalness: 0.2,
    roughness: 0.25,
  });
  return new THREE.Mesh(geometry, material);
}

// 创建钻石装饰
function createCelebGem(size: number, color: THREE.Color): THREE.Mesh {
  const geometry = new THREE.OctahedronGeometry(size, 0);
  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.5,
    metalness: 0.1,
    roughness: 0.15,
  });
  return new THREE.Mesh(geometry, material);
}

// 创建3D花瓣
function createPetal(size: number, color: THREE.Color): THREE.Mesh {
  // 花瓣形状：椭圆形拉伸
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.quadraticCurveTo(size * 0.5, size * 0.3, size * 0.15, size);
  petalShape.quadraticCurveTo(0, size * 1.1, -size * 0.15, size);
  petalShape.quadraticCurveTo(-size * 0.5, size * 0.3, 0, 0);

  const geometry = new THREE.ExtrudeGeometry(petalShape, {
    depth: size * 0.02,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: size * 0.015,
    bevelThickness: size * 0.01,
  });
  geometry.center();

  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.4,
    metalness: 0.1,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

// 创建完整的3D花朵
function create3DFlower(
  size: number,
  petalColor: THREE.Color,
  centerColor: THREE.Color
): THREE.Group {
  const flower = new THREE.Group();

  // 花瓣数量
  const petalCount = 8;
  for (let i = 0; i < petalCount; i++) {
    const petal = createPetal(size, petalColor);
    const angle = (i / petalCount) * Math.PI * 2;
    petal.rotation.z = angle;
    petal.rotation.x = Math.PI * 0.15; // 花瓣稍微向外倾斜
    petal.position.set(
      Math.cos(angle) * size * 0.1,
      Math.sin(angle) * size * 0.1,
      0
    );
    flower.add(petal);
  }

  // 第二层花瓣（内层，角度错开）
  for (let i = 0; i < petalCount; i++) {
    const petal = createPetal(
      size * 0.7,
      petalColor.clone().lerp(new THREE.Color("#ffffff"), 0.3)
    );
    const angle = (i / petalCount) * Math.PI * 2 + Math.PI / petalCount;
    petal.rotation.z = angle;
    petal.rotation.x = Math.PI * 0.25;
    petal.position.set(
      Math.cos(angle) * size * 0.05,
      Math.sin(angle) * size * 0.05,
      size * 0.02
    );
    flower.add(petal);
  }

  // 花蕊（中心）
  const centerGeo = new THREE.SphereGeometry(size * 0.15, 16, 16);
  const centerMat = new THREE.MeshStandardMaterial({
    color: centerColor,
    emissive: centerColor,
    emissiveIntensity: 0.6,
    metalness: 0.2,
    roughness: 0.3,
  });
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.position.z = size * 0.03;
  flower.add(center);

  // 小花蕊点
  for (let i = 0; i < 5; i++) {
    const dotGeo = new THREE.SphereGeometry(size * 0.03, 8, 8);
    const dotMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffd6a6"),
      emissive: new THREE.Color("#ffd6a6"),
      emissiveIntensity: 0.8,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    const angle = (i / 5) * Math.PI * 2;
    const radius = size * 0.08;
    dot.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      size * 0.05
    );
    flower.add(dot);
  }

  return flower;
}

function createTextPlane(
  text: string,
  options?: {
    fontSize?: number;
    paddingX?: number;
    paddingY?: number;
    color?: string;
    glowColor?: string;
    maxWidth?: number;
  }
): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const fontSize = options?.fontSize ?? 60;
  const paddingX = options?.paddingX ?? 48;
  const paddingY = options?.paddingY ?? 34;
  const color = options?.color ?? "rgba(255,255,255,0.94)";
  const glowColor = options?.glowColor ?? "rgba(140, 210, 255, 0.85)";
  const maxWidth = options?.maxWidth ?? 1400;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  const font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.font = font;
  const metrics = ctx.measureText(text);

  const rawW = Math.min(maxWidth, Math.ceil(metrics.width));
  const w = rawW + paddingX * 2;
  const h = fontSize + paddingY * 2;

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const x = w * 0.5;
  const y = h * 0.5;

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = fontSize * 0.55;
  ctx.fillStyle = glowColor;
  ctx.fillText(text, x, y + 1);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = fontSize * 0.25;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });

  const aspect = w / h;
  const worldHeight = 0.62;
  const geometry = new THREE.PlaneGeometry(worldHeight * aspect, worldHeight);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 900;
  return { mesh, material };
}

function createHeartMesh(): THREE.Mesh {
  const x = 0;
  const y = 0;

  const heartShape = new THREE.Shape();
  heartShape.moveTo(x + 0.0, y + 0.22);
  heartShape.bezierCurveTo(
    x + 0.0,
    y + 0.22,
    x - 0.25,
    y - 0.06,
    x - 0.48,
    y + 0.12
  );
  heartShape.bezierCurveTo(
    x - 0.78,
    y + 0.36,
    x - 0.78,
    y + 0.78,
    x - 0.48,
    y + 0.98
  );
  heartShape.bezierCurveTo(
    x - 0.2,
    y + 1.18,
    x + 0.15,
    y + 1.0,
    x + 0.0,
    y + 0.75
  );
  heartShape.bezierCurveTo(
    x + 0.15,
    y + 1.0,
    x + 0.5,
    y + 1.18,
    x + 0.78,
    y + 0.98
  );
  heartShape.bezierCurveTo(
    x + 1.08,
    y + 0.78,
    x + 1.08,
    y + 0.36,
    x + 0.78,
    y + 0.12
  );
  heartShape.bezierCurveTo(
    x + 0.55,
    y - 0.06,
    x + 0.0,
    y + 0.22,
    x + 0.0,
    y + 0.22
  );

  const geometry = new THREE.ExtrudeGeometry(heartShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.08,
  });
  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ff4fb1"),
    emissive: new THREE.Color("#ff2a9d"),
    emissiveIntensity: 0.75,
    metalness: 0.15,
    roughness: 0.25,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(1.18);
  mesh.rotation.x = Math.PI * 0.08;
  mesh.rotation.y = Math.PI * 0.18;
  mesh.position.set(0, 1.15, 0);
  return mesh;
}

type CenterMotif = "infinity" | "heart" | "gem" | "star" | "girl";

// 中间三维图案：想换造型就改这里
const CENTER_MOTIF: CenterMotif = "star";

function createStarMesh(): THREE.Mesh {
  // 3D 五角星：2D 轮廓 + 挤出，观感更“礼物感”
  const points = 5;
  const outerR = 0.92;
  const innerR = 0.42;

  const starShape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI * 0.5 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();

  const geometry = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  });
  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ff4fb1"),
    emissive: new THREE.Color("#ff2a9d"),
    emissiveIntensity: 0.75,
    metalness: 0.16,
    roughness: 0.22,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 1.15, 0);
  mesh.rotation.x = Math.PI * 0.14;
  mesh.rotation.y = Math.PI * 0.2;
  mesh.scale.setScalar(0.98);
  return mesh;
}

function createInfinityMesh(): THREE.Mesh {
  // TorusKnot 很像“无限”的纠缠形态，3D 质感更强
  const geometry = new THREE.TorusKnotGeometry(0.62, 0.16, 220, 28, 2, 3);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ff4fb1"),
    emissive: new THREE.Color("#ff2a9d"),
    emissiveIntensity: 0.85,
    metalness: 0.22,
    roughness: 0.22,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 1.15, 0);
  mesh.rotation.x = Math.PI * 0.18;
  mesh.rotation.y = Math.PI * 0.15;
  mesh.scale.setScalar(1.05);
  return mesh;
}

function createGemMesh(): THREE.Mesh {
  // “水晶/宝石”风格：更清透、像小礼物
  const geometry = new THREE.IcosahedronGeometry(0.78, 0);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ffd6f2"),
    emissive: new THREE.Color("#ff48b8"),
    emissiveIntensity: 0.55,
    metalness: 0.05,
    roughness: 0.06,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 1.15, 0);
  mesh.rotation.x = Math.PI * 0.14;
  mesh.rotation.y = Math.PI * 0.22;
  mesh.scale.setScalar(1.02);
  return mesh;
}

type ShyGirlRig = {
  root: THREE.Group;
  head: THREE.Group;
  blushL: THREE.Mesh;
  blushR: THREE.Mesh;
};

function createShyGirlRig(): ShyGirlRig {
  const root = new THREE.Group();
  root.name = "shy-girl";

  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#fff1e6"),
    emissive: new THREE.Color("#ffd6f2"),
    emissiveIntensity: 0.02,
    metalness: 0.0,
    roughness: 0.85,
  });

  const faceOutlineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ffd6a6"),
    emissive: new THREE.Color("#ffd6a6"),
    emissiveIntensity: 0.02,
    metalness: 0.0,
    roughness: 0.95,
    side: THREE.BackSide,
  });

  const hair = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#cbbcff"),
    emissive: new THREE.Color("#cbbcff"),
    emissiveIntensity: 0.03,
    metalness: 0.0,
    roughness: 0.9,
  });

  const eyeIrisMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a9e8ff"),
    emissive: new THREE.Color("#a9e8ff"),
    emissiveIntensity: 0.05,
    metalness: 0.0,
    roughness: 0.45,
  });

  const pupilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#77d6ff"),
    emissive: new THREE.Color("#77d6ff"),
    emissiveIntensity: 0.03,
    metalness: 0.0,
    roughness: 0.5,
  });

  const blushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#ffb6c1"),
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });

  const eyeWhiteMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#ffffff"),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  const browMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#d8a17d"),
    emissive: new THREE.Color("#d8a17d"),
    emissiveIntensity: 0.01,
    metalness: 0.0,
    roughness: 0.6,
  });

  const glassesMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a9e8ff"),
    emissive: new THREE.Color("#77d6ff"),
    emissiveIntensity: 0.2,
    metalness: 0.1,
    roughness: 0.25,
  });

  const lensMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#a9e8ff"),
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });

  // ========== 只保留头部 ==========
  const head = new THREE.Group();
  head.position.set(0, 0, 0);
  root.add(head);

  const faceGeo = new THREE.SphereGeometry(0.34, 28, 22);
  const face = new THREE.Mesh(faceGeo, skin);
  face.scale.set(1, 1.04, 1);
  head.add(face);

  const faceOutline = new THREE.Mesh(faceGeo, faceOutlineMat);
  faceOutline.scale.copy(face.scale).multiplyScalar(1.035);
  head.add(faceOutline);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.355, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.72),
    hair
  );
  hairCap.position.set(0, 0.02, 0);
  head.add(hairCap);

  const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.22), hair);
  bangs.position.set(0, 0.11, 0.26);
  bangs.rotation.x = -Math.PI * 0.12;
  head.add(bangs);

  // 更多头发：后发 + 两侧发束 + 小小马尾，让轮廓更清晰
  const hairBack = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.42, 6, 12),
    hair
  );
  hairBack.position.set(0, -0.18, -0.14);
  hairBack.rotation.x = Math.PI * 0.08;
  head.add(hairBack);

  const sideLockGeo = new THREE.CapsuleGeometry(0.06, 0.26, 6, 10);
  const sideLockL = new THREE.Mesh(sideLockGeo, hair);
  const sideLockR = new THREE.Mesh(sideLockGeo, hair);
  sideLockL.position.set(-0.28, -0.08, 0.14);
  sideLockR.position.set(0.28, -0.08, 0.14);
  sideLockL.rotation.z = Math.PI * 0.12;
  sideLockR.rotation.z = -Math.PI * 0.12;
  sideLockL.rotation.x = -Math.PI * 0.08;
  sideLockR.rotation.x = -Math.PI * 0.08;
  head.add(sideLockL, sideLockR);

  const pony = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), hair);
  pony.position.set(0.22, -0.26, -0.28);
  head.add(pony);

  // Eyes
  const eyeWhiteGeo = new THREE.SphereGeometry(0.048, 12, 10);
  const eyeWhiteL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  const eyeWhiteR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeWhiteL.position.set(-0.11, 0.03, 0.3);
  eyeWhiteR.position.set(0.11, 0.03, 0.3);
  head.add(eyeWhiteL, eyeWhiteR);

  const eyeGeo = new THREE.SphereGeometry(0.034, 10, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeIrisMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeIrisMat);
  eyeL.position.set(-0.11, 0.03, 0.315);
  eyeR.position.set(0.11, 0.03, 0.315);
  head.add(eyeL, eyeR);

  const pupilGeo = new THREE.SphereGeometry(0.018, 10, 8);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.11, 0.02, 0.335);
  pupilR.position.set(0.11, 0.02, 0.335);
  head.add(pupilL, pupilR);

  const highlightGeo = new THREE.SphereGeometry(0.01, 10, 8);
  const highlightL = new THREE.Mesh(highlightGeo, eyeWhiteMat);
  const highlightR = new THREE.Mesh(highlightGeo, eyeWhiteMat);
  highlightL.position.set(-0.125, 0.04, 0.345);
  highlightR.position.set(0.095, 0.04, 0.345);
  (highlightL.material as THREE.MeshBasicMaterial).opacity = 0.9;
  (highlightR.material as THREE.MeshBasicMaterial).opacity = 0.9;
  head.add(highlightL, highlightR);

  // Blush
  const blushGeo = new THREE.CircleGeometry(0.078, 18);
  const blushL = new THREE.Mesh(blushGeo, blushMat);
  const blushR = new THREE.Mesh(blushGeo, blushMat);
  blushL.position.set(-0.18, -0.06, 0.315);
  blushR.position.set(0.18, -0.06, 0.315);
  head.add(blushL, blushR);

  // Eyebrows (soft)
  const browGeo = new THREE.BoxGeometry(0.09, 0.02, 0.02);
  const browL = new THREE.Mesh(browGeo, browMat);
  const browR = new THREE.Mesh(browGeo, browMat);
  browL.position.set(-0.11, 0.1, 0.3);
  browR.position.set(0.11, 0.1, 0.3);
  browL.rotation.z = -Math.PI * 0.06;
  browR.rotation.z = Math.PI * 0.06;
  head.add(browL, browR);

  // Nose (tiny)
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 10),
    blushMat
  );
  nose.position.set(0, -0.04, 0.33);
  (nose.material as THREE.MeshBasicMaterial).opacity = 0.16;
  head.add(nose);

  // Mouth (tiny shy smile)
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.04, 0.008, 10, 24, Math.PI),
    blushMat
  );
  mouth.position.set(0, -0.12, 0.315);
  mouth.rotation.z = Math.PI;
  (mouth.material as THREE.MeshBasicMaterial).opacity = 0.26;
  head.add(mouth);

  // Glasses (round)
  const glasses = new THREE.Group();
  glasses.position.set(0, 0.04, 0.325);
  head.add(glasses);

  const frameGeo = new THREE.TorusGeometry(0.135, 0.012, 12, 24);
  const lensGeo = new THREE.CircleGeometry(0.125, 24);

  const frameL = new THREE.Mesh(frameGeo, glassesMat);
  const frameR = new THREE.Mesh(frameGeo, glassesMat);
  frameL.position.set(-0.165, 0, 0);
  frameR.position.set(0.165, 0, 0);
  glasses.add(frameL, frameR);

  const lensL = new THREE.Mesh(lensGeo, lensMat);
  const lensR = new THREE.Mesh(lensGeo, lensMat);
  lensL.position.set(-0.165, 0, 0.002);
  lensR.position.set(0.165, 0, 0.002);
  glasses.add(lensL, lensR);

  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.07, 12),
    glassesMat
  );
  bridge.rotation.z = Math.PI * 0.5;
  bridge.position.set(0, 0, 0);
  glasses.add(bridge);

  // 头部整体微调
  head.rotation.z = -Math.PI * 0.02;
  head.scale.setScalar(1.2); // 放大头部

  // 初始位置
  root.position.set(0, 1.0, 0);

  return {
    root,
    head,
    blushL,
    blushR,
  };
}

function createCenterMotifObject(): {
  object: THREE.Object3D;
  shyGirl: ShyGirlRig | null;
} {
  if (CENTER_MOTIF === "girl") {
    const shyGirl = createShyGirlRig();
    return { object: shyGirl.root, shyGirl };
  }
  if (CENTER_MOTIF === "heart")
    return { object: createHeartMesh(), shyGirl: null };
  if (CENTER_MOTIF === "gem") return { object: createGemMesh(), shyGirl: null };
  if (CENTER_MOTIF === "star")
    return { object: createStarMesh(), shyGirl: null };
  return { object: createInfinityMesh(), shyGirl: null };
}

function createStarField(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = rand(12, 42);
    const theta = rand(0, Math.PI * 2);
    const phi = Math.acos(rand(-1, 1));
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi) * 0.62;
    const z = r * Math.sin(phi) * Math.sin(theta);

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y + 10;
    positions[i * 3 + 2] = z;

    const hue = rand(0.55, 0.95);
    const sat = rand(0.25, 0.55);
    const light = rand(0.65, 0.95);
    color.setHSL(hue, sat, light);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}

class ConfettiSystem implements Disposable {
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly count: number;

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 0] = rand(-7, 7);
      this.positions[i * 3 + 1] = rand(0, 10);
      this.positions[i * 3 + 2] = rand(-7, 7);

      this.velocities[i * 3 + 0] = rand(-0.18, 0.18);
      this.velocities[i * 3 + 1] = rand(-1.2, -0.35);
      this.velocities[i * 3 + 2] = rand(-0.18, 0.18);

      color.setHSL(rand(0, 1), rand(0.75, 0.95), rand(0.55, 0.7));
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3)
    );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
  }

  object3d(): THREE.Object3D {
    return this.points;
  }

  update(dtSeconds: number, timeSeconds: number): void {
    const swirl = Math.sin(timeSeconds * 0.7) * 0.12;
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      this.positions[idx + 0] += (this.velocities[idx + 0] + swirl) * dtSeconds;
      this.positions[idx + 1] += this.velocities[idx + 1] * dtSeconds;
      this.positions[idx + 2] += this.velocities[idx + 2] * dtSeconds;

      if (this.positions[idx + 1] < -1.8) {
        this.positions[idx + 0] = rand(-7, 7);
        this.positions[idx + 1] = rand(7.5, 12);
        this.positions[idx + 2] = rand(-7, 7);
        this.velocities[idx + 0] = rand(-0.22, 0.22);
        this.velocities[idx + 1] = rand(-1.35, -0.45);
        this.velocities[idx + 2] = rand(-0.22, 0.22);
      }
    }
    (
      this.points.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

class AnglePhraseRing implements Disposable {
  private readonly group: THREE.Group;
  private readonly items: Array<{
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    baseOpacity: number;
  }> = [];
  private readonly center: THREE.Vector3;

  constructor(options: {
    phrases: string[];
    center: THREE.Vector3;
    radius: number;
    y: number;
    fontSize?: number;
  }) {
    this.group = new THREE.Group();
    this.center = options.center.clone();

    const n = Math.max(1, options.phrases.length);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const { mesh, material } = createTextPlane(options.phrases[i], {
        fontSize: options.fontSize ?? 54,
        glowColor: "rgba(130, 220, 255, 0.9)",
        color: "rgba(255,255,255,0.92)",
      });

      mesh.position.set(
        this.center.x + Math.cos(a) * options.radius,
        options.y,
        this.center.z + Math.sin(a) * options.radius
      );
      // 让平面朝向中心：正面(+Z)朝外，因此只有相机在对应角度外侧时才清晰
      mesh.lookAt(this.center);

      this.group.add(mesh);
      this.items.push({ mesh, material, baseOpacity: 0.9 });
    }

    this.group.renderOrder = 850;
  }

  object3d(): THREE.Object3D {
    return this.group;
  }

  update(camera: THREE.Camera, timeSeconds: number): void {
    const camPos = (camera as any).position as THREE.Vector3;
    const view = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // +Z 方向（平面正面）
      it.mesh.getWorldDirection(normal);
      view.copy(camPos).sub(it.mesh.position).normalize();
      const facing = normal.dot(view); // 1: 正面, -1: 背面

      // 只有接近正面时才淡入
      const a = smoothstep(0.25, 0.7, facing);
      const twinkle = 0.85 + 0.15 * Math.sin(timeSeconds * 1.6 + i * 1.37);
      it.material.opacity = it.baseOpacity * a * twinkle;
    }
  }

  dispose(): void {
    for (const it of this.items) {
      it.mesh.geometry.dispose();
      it.material.map?.dispose();
      it.material.dispose();
    }
    this.items.length = 0;
  }
}

type FireworkBurst = {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  seed: Float32Array;
  spark: Float32Array;
  age: number;
  duration: number;
  // 二次爆发
  secondarySpawned: boolean;
  origin: THREE.Vector3;
  pattern: FireworkPattern;
  intensity: number;
};

// 烟花拖尾粒子
type TrailParticle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
};

class Fireworks implements Disposable {
  private readonly bursts: FireworkBurst[] = [];
  private readonly trailParticles: TrailParticle[] = [];
  private trailPoints: THREE.Points | null = null;
  private trailGeometry: THREE.BufferGeometry | null = null;
  private readonly scene: THREE.Scene;
  private readonly maxBursts: number;
  private readonly particlesPerBurst: number;
  private readonly maxTrailParticles = 2000;
  private onSecondaryBurst?: (origin: THREE.Vector3, intensity: number) => void;

  constructor(
    scene: THREE.Scene,
    options?: { maxBursts?: number; particlesPerBurst?: number }
  ) {
    this.scene = scene;
    this.maxBursts = options?.maxBursts ?? 8;
    this.particlesPerBurst = options?.particlesPerBurst ?? 700;
    this.initTrailSystem();
  }

  setSecondaryBurstCallback(
    cb: (origin: THREE.Vector3, intensity: number) => void
  ): void {
    this.onSecondaryBurst = cb;
  }

  private initTrailSystem(): void {
    const positions = new Float32Array(this.maxTrailParticles * 3);
    const colors = new Float32Array(this.maxTrailParticles * 3);
    const sizes = new Float32Array(this.maxTrailParticles);
    const alphas = new Float32Array(this.maxTrailParticles);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.trailGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    this.trailGeometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(sizes, 1)
    );
    this.trailGeometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(alphas, 1)
    );

    const trailMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uBaseSize: { value: 32.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uBaseSize;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uBaseSize * aSize / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          float glow = exp(-d * 3.5);
          gl_FragColor = vec4(vColor, glow * vAlpha);
        }
      `,
      vertexColors: true,
    });

    this.trailPoints = new THREE.Points(this.trailGeometry, trailMaterial);
    this.trailPoints.frustumCulled = false;
    this.scene.add(this.trailPoints);
  }

  spawn(
    origin: THREE.Vector3,
    intensity = 1.0,
    pattern: FireworkPattern = "sphere"
  ): void {
    if (this.bursts.length >= this.maxBursts) {
      const old = this.bursts.shift();
      if (old) this.removeBurst(old);
    }

    const count = this.particlesPerBurst;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const seed = new Float32Array(count);
    const spark = new Float32Array(count);

    const base = pickPastelFireworkColor();

    // 双色渐变烟花 - 增加颜色丰富度
    const secondaryColor = pickPastelFireworkColor();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      const dir = randomDirectionForPattern(pattern);
      // 增加速度变化范围，让烟花更有层次感
      const speedBase =
        pattern === "heart"
          ? rand(2.5, 6.0)
          : pattern === "ring"
          ? rand(3.0, 6.5)
          : rand(2.8, 7.0);

      const s = speedBase * intensity;
      velocities[i * 3 + 0] = dir.x * s;
      velocities[i * 3 + 1] = dir.y * s;
      velocities[i * 3 + 2] = dir.z * s;

      // 颜色：根据速度混合双色，速度快的偏向 base，慢的偏向 secondary
      const colorMix = (speedBase - 2.5) / 4.5;
      color.copy(base).lerp(secondaryColor, 1 - colorMix);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.h = (hsl.h + rand(-0.05, 0.05) + 1) % 1;
      hsl.s = clamp(hsl.s + rand(0.08, 0.22), 0.55, 0.98);
      hsl.l = clamp(hsl.l + rand(-0.02, 0.15), 0.6, 0.92);
      color.setHSL(hsl.h, hsl.s, hsl.l);
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      seed[i] = Math.random();
      // 增加星屑比例，让烟花更闪亮
      spark[i] = seed[i] > 0.6 ? 1.0 : 0.0;

      const baseLife = pattern === "heart" ? rand(0.82, 1.1) : rand(0.7, 1.05);
      life[i] = baseLife;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      "aVelocity",
      new THREE.BufferAttribute(velocities, 3)
    );
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSpark", new THREE.BufferAttribute(spark, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 95.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: `
				attribute vec3 aVelocity;
				attribute vec3 aColor;
				attribute float aLife;
                attribute float aSeed;
                attribute float aSpark;
				uniform float uTime;
				uniform float uSize;
				varying vec3 vColor;
				varying float vLife;
                varying float vSeed;
                varying float vSpark;
                varying vec3 vWorldPos;
				void main() {
					vColor = aColor;
                    vSeed = aSeed;
                    vSpark = aSpark;
					
                    // 时间变化：每个粒子有轻微的时间偏移
                    float t = uTime * (0.85 + 0.3 * aLife);
                    
                    // === 更真实的物理模型 ===
                    // 空气阻力系数（与速度成正比的阻力）
                    float dragCoeff = 1.6 + aSeed * 0.4; // 不同粒子阻力略有不同
                    
                    // 使用积分形式计算位置：v(t) = v0 * e^(-k*t)
                    // 位置 = v0/k * (1 - e^(-k*t))
                    float expDecay = exp(-dragCoeff * t);
                    float dragDisplacement = (1.0 - expDecay) / dragCoeff;
                    
                    vec3 p = position + aVelocity * dragDisplacement;
                    
                    // 重力：g = 4.5 (场景单位)
                    // 位置 = -0.5 * g * t^2 (但考虑阻力后的修正)
                    float gravity = 4.5;
                    // 重力在有阻力情况下的位移：g/k^2 * (k*t - 1 + e^(-k*t))
                    float gravityDisplacement = gravity / (dragCoeff * dragCoeff) * 
                        (dragCoeff * t - 1.0 + expDecay);
                    p.y -= gravityDisplacement;
                    
                    // 微小的湍流/风效果
                    float turbulence = 0.08;
                    p.x += sin(t * 3.0 + aSeed * 20.0) * turbulence * t;
                    p.z += cos(t * 2.5 + aSeed * 15.0) * turbulence * t;
                    
                    vWorldPos = p;

                    // 生命值计算：考虑阻力后的自然衰减
                    float lifetime = 1.6 + 0.8 * aLife;
					vLife = clamp(1.0 - t / lifetime, 0.0, 1.0);
                    
					vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
					gl_Position = projectionMatrix * mvPosition;

                    // 粒子大小：随速度减小而变小（冷却效果）
                    float currentSpeed = length(aVelocity) * expDecay;
                    float initialSpeed = length(aVelocity);
                    float speedRatio = currentSpeed / max(0.1, initialSpeed);
                    
                    float sparkSize = mix(1.0, 0.5, vSpark);
                    float lifeSize = 0.3 + 0.7 * pow(vLife, 0.5);
                    float speedSize = 0.6 + 0.4 * speedRatio;
                    float sizeVariation = 0.7 + 0.6 * aSeed;
                    float size = uSize * sizeVariation * sparkSize * lifeSize * speedSize;
                    gl_PointSize = size / max(0.7, -mvPosition.z);
				}
			`,
      fragmentShader: `
				precision highp float;
				varying vec3 vColor;
				varying float vLife;
                varying float vSeed;
                varying float vSpark;
				uniform float uOpacity;
                uniform float uTime;
				void main() {
					vec2 uv = gl_PointCoord * 2.0 - 1.0;
                    float d = dot(uv, uv);
                    
                    // 更柔和的光斑核心
                    float core = exp(-d * 2.2);
                    
                    // 星芒效果 - 十字 + 对角线
                    float cross = exp(-abs(uv.x) * 5.0) * exp(-abs(uv.y) * 5.0);
                    float diagonal = exp(-abs(uv.x + uv.y) * 3.5) * exp(-abs(uv.x - uv.y) * 3.5);
                    float starBurst = max(cross, diagonal * 0.6);
                    
                    // 外圈光晕
                    float halo = exp(-d * 0.8) * 0.3;
                    
                    float shape = mix(core + halo, max(core, starBurst) + halo, vSpark);

                    // 更明显的闪烁
                    float twinkleSpeed = 22.0 + 18.0 * vSpark;
                    float twinkle = 0.75 + 0.25 * sin(uTime * twinkleSpeed + vSeed * 50.0);
                    twinkle *= 0.85 + 0.15 * sin(uTime * 7.0 + vSeed * 30.0);
                    
                    float a = shape * pow(vLife, 0.75) * uOpacity * twinkle;
                    
                    // 颜色随生命值变化 - 从亮到暗，色相微移
                    vec3 c = vColor;
                    // 生命值高时更亮更白
                    c = mix(c, vec3(1.0), (1.0 - d) * 0.35 * vLife);
                    // 星屑额外提亮
                    c += (1.0 - d) * (0.32 + 0.3 * vSpark) * vLife;
                    // 快消失时颜色变暖（偏橙红）
                    vec3 warmTint = vec3(1.0, 0.6, 0.3);
                    c = mix(c, c * warmTint, (1.0 - vLife) * 0.4);
                    
					gl_FragColor = vec4(c, a);
				}
			`,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    this.bursts.push({
      points,
      positions,
      velocities,
      life,
      seed,
      spark,
      age: 0,
      duration: pattern === "heart" ? 2.2 : pattern === "ring" ? 2.1 : 2.0,
      secondarySpawned: false,
      origin: origin.clone(),
      pattern,
      intensity,
    });
  }

  // 生成小型二次爆发
  private spawnSecondary(origin: THREE.Vector3, intensity: number): void {
    const count = Math.floor(this.particlesPerBurst * 0.25);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const seed = new Float32Array(count);
    const spark = new Float32Array(count);

    const base = pickPastelFireworkColor();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      const dir = randomDirectionForPattern("sphere");
      const speed = rand(1.5, 3.5) * intensity;
      velocities[i * 3 + 0] = dir.x * speed;
      velocities[i * 3 + 1] = dir.y * speed;
      velocities[i * 3 + 2] = dir.z * speed;

      color.copy(base);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.l = clamp(hsl.l + rand(0.1, 0.25), 0.7, 0.95);
      color.setHSL(hsl.h, hsl.s, hsl.l);
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      seed[i] = Math.random();
      spark[i] = seed[i] > 0.5 ? 1.0 : 0.0;
      life[i] = rand(0.6, 0.9);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      "aVelocity",
      new THREE.BufferAttribute(velocities, 3)
    );
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSpark", new THREE.BufferAttribute(spark, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 65.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: `
        attribute vec3 aVelocity;
        attribute vec3 aColor;
        attribute float aLife;
        attribute float aSeed;
        attribute float aSpark;
        uniform float uTime;
        uniform float uSize;
        varying vec3 vColor;
        varying float vLife;
        varying float vSeed;
        varying float vSpark;
        void main() {
          vColor = aColor;
          vSeed = aSeed;
          vSpark = aSpark;
          float t = uTime * (0.9 + 0.2 * aLife);
          
          // 二次爆发使用更强的阻力（更小的粒子）
          float dragCoeff = 2.2 + aSeed * 0.5;
          float expDecay = exp(-dragCoeff * t);
          float dragDisplacement = (1.0 - expDecay) / dragCoeff;
          vec3 p = position + aVelocity * dragDisplacement;
          
          // 重力
          float gravity = 5.0;
          float gravityDisplacement = gravity / (dragCoeff * dragCoeff) * 
              (dragCoeff * t - 1.0 + expDecay);
          p.y -= gravityDisplacement;
          
          // 微小湍流
          p.x += sin(t * 4.0 + aSeed * 25.0) * 0.05 * t;
          p.z += cos(t * 3.5 + aSeed * 20.0) * 0.05 * t;
          vLife = clamp(1.0 - t / (0.9 + 0.5 * aLife), 0.0, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float size = uSize * (0.6 + 0.8 * aLife) * (0.4 + 0.6 * vLife);
          gl_PointSize = size / max(0.8, -mvPosition.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vLife;
        varying float vSeed;
        varying float vSpark;
        uniform float uOpacity;
        uniform float uTime;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          float core = exp(-d * 3.0);
          float twinkle = 0.8 + 0.2 * sin(uTime * 25.0 + vSeed * 40.0);
          float a = core * pow(vLife, 0.8) * uOpacity * twinkle;
          vec3 c = vColor + (1.0 - d) * 0.4;
          gl_FragColor = vec4(c, a);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    this.bursts.push({
      points,
      positions,
      velocities,
      life,
      seed,
      spark,
      age: 0,
      duration: 1.0,
      secondarySpawned: true,
      origin: origin.clone(),
      pattern: "sphere",
      intensity: intensity * 0.5,
    });
  }

  update(dtSeconds: number): void {
    // 更新烟花爆发
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.age += dtSeconds;
      const material = burst.points.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = burst.age;

      // 更平滑的淡出
      const fadeStart = 0.6;
      const fadeProgress = clamp(
        (burst.age / burst.duration - fadeStart) / (1 - fadeStart),
        0,
        1
      );
      material.uniforms.uOpacity.value = 1.0 - easeOutCubic(fadeProgress);

      // 在生命周期中段触发二次爆发（30%概率）
      if (
        !burst.secondarySpawned &&
        burst.age > burst.duration * 0.4 &&
        burst.age < burst.duration * 0.6
      ) {
        if (Math.random() < 0.35) {
          // 随机选取几个粒子位置作为二次爆发点
          const numSecondary = randInt(2, 4);
          for (let j = 0; j < numSecondary; j++) {
            const pIdx = randInt(0, Math.floor(burst.positions.length / 3) - 1);
            // 计算粒子当前位置
            const t = burst.age * (0.8 + 0.35 * burst.life[pIdx]);
            const k = 1.3;
            const drag = (1.0 - Math.exp(-k * t)) / k;
            const px = burst.origin.x + burst.velocities[pIdx * 3 + 0] * drag;
            const py =
              burst.origin.y +
              burst.velocities[pIdx * 3 + 1] * drag -
              1.5 * t * t;
            const pz = burst.origin.z + burst.velocities[pIdx * 3 + 2] * drag;

            this.spawnSecondary(
              new THREE.Vector3(px, py, pz),
              burst.intensity * 0.6
            );
          }
          burst.secondarySpawned = true;
        } else {
          burst.secondarySpawned = true;
        }
      }

      // 生成拖尾粒子
      if (
        burst.age < burst.duration * 0.7 &&
        this.trailParticles.length < this.maxTrailParticles
      ) {
        const spawnCount = Math.min(
          8,
          this.maxTrailParticles - this.trailParticles.length
        );
        for (let j = 0; j < spawnCount; j++) {
          const pIdx = randInt(0, Math.floor(burst.positions.length / 3) - 1);
          const t = burst.age * (0.85 + 0.3 * burst.life[pIdx]);

          // 使用与着色器相同的物理公式
          const dragCoeff = 1.6 + burst.seed[pIdx] * 0.4;
          const expDecay = Math.exp(-dragCoeff * t);
          const dragDisplacement = (1.0 - expDecay) / dragCoeff;

          const vx = burst.velocities[pIdx * 3 + 0];
          const vy = burst.velocities[pIdx * 3 + 1];
          const vz = burst.velocities[pIdx * 3 + 2];

          const px = burst.origin.x + vx * dragDisplacement;
          const gravity = 4.5;
          const gravityDisplacement =
            (gravity / (dragCoeff * dragCoeff)) *
            (dragCoeff * t - 1.0 + expDecay);
          const py =
            burst.origin.y + vy * dragDisplacement - gravityDisplacement;
          const pz = burst.origin.z + vz * dragDisplacement;

          // 余烬的初速度：继承一部分父粒子的速度
          const inheritVelocity = 0.15;
          const currentVx = vx * expDecay * inheritVelocity;
          const currentVy = vy * expDecay * inheritVelocity - 0.3;
          const currentVz = vz * expDecay * inheritVelocity;

          this.trailParticles.push({
            position: new THREE.Vector3(
              px + rand(-0.05, 0.05),
              py + rand(-0.05, 0.05),
              pz + rand(-0.05, 0.05)
            ),
            velocity: new THREE.Vector3(
              currentVx + rand(-0.08, 0.08),
              currentVy + rand(-0.15, 0.05),
              currentVz + rand(-0.08, 0.08)
            ),
            color: new THREE.Color().setHSL(
              rand(0.02, 0.12), // 偏橙红的余烬色
              rand(0.7, 0.95),
              rand(0.5, 0.75)
            ),
            life: 0,
            maxLife: rand(0.35, 0.7),
            size: rand(0.25, 0.65),
          });
        }
      }

      if (burst.age >= burst.duration) {
        this.removeBurst(burst);
        this.bursts.splice(i, 1);
      }
    }

    // 更新拖尾粒子（更真实的物理）
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life += dtSeconds;

      // 更新位置
      p.position.add(p.velocity.clone().multiplyScalar(dtSeconds));

      // 重力
      p.velocity.y -= 3.8 * dtSeconds;

      // 空气阻力（与速度成正比）
      const dragCoeff = 2.5;
      p.velocity.multiplyScalar(Math.exp(-dragCoeff * dtSeconds));

      // 微小的随机湍流
      p.velocity.x += (Math.random() - 0.5) * 0.02;
      p.velocity.z += (Math.random() - 0.5) * 0.02;

      if (p.life >= p.maxLife) {
        this.trailParticles.splice(i, 1);
      }
    }

    // 更新拖尾几何体
    if (this.trailGeometry) {
      const posAttr = this.trailGeometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const colAttr = this.trailGeometry.getAttribute(
        "color"
      ) as THREE.BufferAttribute;
      const sizeAttr = this.trailGeometry.getAttribute(
        "aSize"
      ) as THREE.BufferAttribute;
      const alphaAttr = this.trailGeometry.getAttribute(
        "aAlpha"
      ) as THREE.BufferAttribute;

      for (let i = 0; i < this.maxTrailParticles; i++) {
        if (i < this.trailParticles.length) {
          const p = this.trailParticles[i];
          const lifeRatio = 1 - p.life / p.maxLife;
          posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
          colAttr.setXYZ(i, p.color.r, p.color.g, p.color.b);
          sizeAttr.setX(i, p.size * lifeRatio);
          alphaAttr.setX(i, lifeRatio * 0.6);
        } else {
          alphaAttr.setX(i, 0);
        }
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
  }

  private removeBurst(burst: FireworkBurst): void {
    this.scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
  }

  dispose(): void {
    for (const b of this.bursts) this.removeBurst(b);
    this.bursts.length = 0;
    if (this.trailPoints) {
      this.scene.remove(this.trailPoints);
      this.trailGeometry?.dispose();
      (this.trailPoints.material as THREE.Material).dispose();
    }
    this.trailParticles.length = 0;
  }
}

// 上升火花粒子 - 每个火花保存历史轨迹用于绘制尾焰
type RocketSparkParticle = {
  positions: THREE.Vector3[]; // 历史位置，用于绘制尾焰
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseSize: number;
  color: THREE.Color;
};

type Rocket = {
  // 发光火星头部 (Sprite 始终面向摄像机)
  spark: THREE.Sprite;
  // 尾迹：记录历史位置的发光轨迹
  trail: THREE.Line;
  trailPositions: Float32Array;
  // 上升时喷射的火花粒子（带尾焰）
  sparkParticles: RocketSparkParticle[];
  age: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  intensity: number;
  pattern: FireworkPattern;
  userTriggered: boolean;
  color: THREE.Color;
};

class FireworkRockets implements Disposable {
  private readonly scene: THREE.Scene;
  private readonly fireworks: Fireworks;
  private readonly rockets: Rocket[] = [];
  private readonly maxRockets: number;
  private readonly onBurst?: (
    world: THREE.Vector3,
    pattern: FireworkPattern,
    intensity: number,
    userTriggered: boolean
  ) => void;

  // 上升火花尾焰渲染系统 - 使用大量粒子点模拟每个火花的拖尾
  private sparkPoints: THREE.Points | null = null;
  private sparkGeometry: THREE.BufferGeometry | null = null;
  // 每个火花有多个尾焰点，总共需要更多的渲染粒子
  private readonly sparkTrailLength = 8; // 每个火花的尾焰长度
  private readonly maxSparkParticles = 3000; // 总渲染粒子数

  constructor(
    scene: THREE.Scene,
    fireworks: Fireworks,
    maxRockets = 6,
    onBurst?: (
      world: THREE.Vector3,
      pattern: FireworkPattern,
      intensity: number,
      userTriggered: boolean
    ) => void
  ) {
    this.scene = scene;
    this.fireworks = fireworks;
    this.maxRockets = maxRockets;
    this.onBurst = onBurst;
    this.initSparkSystem();
  }

  private initSparkSystem(): void {
    const positions = new Float32Array(this.maxSparkParticles * 3);
    const colors = new Float32Array(this.maxSparkParticles * 3);
    const sizes = new Float32Array(this.maxSparkParticles);
    const alphas = new Float32Array(this.maxSparkParticles);

    this.sparkGeometry = new THREE.BufferGeometry();
    this.sparkGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.sparkGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    this.sparkGeometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(sizes, 1)
    );
    this.sparkGeometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(alphas, 1)
    );

    const sparkMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uBaseSize: { value: 45.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uBaseSize;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uBaseSize * aSize / max(1.0, -mvPosition.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          // 火花核心 - 更亮更集中
          float core = exp(-d * 5.0);
          // 外层光晕 - 柔和扩散
          float glow = exp(-d * 2.0) * 0.5;
          // 闪烁感
          float shape = core + glow;
          // 颜色：核心更亮（偏白）
          vec3 c = mix(vColor, vec3(1.0), core * 0.6);
          gl_FragColor = vec4(c, shape * vAlpha);
        }
      `,
      vertexColors: true,
    });

    this.sparkPoints = new THREE.Points(this.sparkGeometry, sparkMaterial);
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 45;
    this.scene.add(this.sparkPoints);
  }

  launch(
    targetXZ: THREE.Vector3,
    intensity = 1.0,
    pattern: FireworkPattern = "sphere",
    userTriggered = false
  ): void {
    if (this.rockets.length >= this.maxRockets) {
      const old = this.rockets.shift();
      if (old) this.remove(old);
    }

    const start = new THREE.Vector3(targetXZ.x, -0.8, targetXZ.z);
    const end = new THREE.Vector3(
      targetXZ.x * 0.7 + rand(-0.15, 0.15),
      rand(2.2, 3.8),
      targetXZ.z * 0.7 + rand(-0.15, 0.15)
    );

    // 火星颜色 - 亮橙/金/白色调
    const color = new THREE.Color().setHSL(
      rand(0.06, 0.12),
      0.95,
      rand(0.7, 0.9)
    );

    // 发光火星头部 - 使用 Sprite（始终面向摄像机）
    const sparkCanvas = document.createElement("canvas");
    sparkCanvas.width = 64;
    sparkCanvas.height = 64;
    const ctx = sparkCanvas.getContext("2d")!;

    // 绘制发光火星
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(
      0.2,
      `rgba(${Math.floor(color.r * 255)}, ${Math.floor(
        color.g * 255
      )}, ${Math.floor(color.b * 255)}, 0.9)`
    );
    gradient.addColorStop(
      0.5,
      `rgba(${Math.floor(color.r * 200)}, ${Math.floor(
        color.g * 150
      )}, ${Math.floor(color.b * 100)}, 0.4)`
    );
    gradient.addColorStop(1, "rgba(255, 150, 50, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const sparkTexture = new THREE.CanvasTexture(sparkCanvas);
    sparkTexture.needsUpdate = true;

    const sparkMaterial = new THREE.SpriteMaterial({
      map: sparkTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spark = new THREE.Sprite(sparkMaterial);
    spark.scale.set(0.25, 0.25, 1);
    spark.position.copy(start);
    spark.renderOrder = 50;

    // 尾迹 - 使用 Line 记录历史位置
    const trailLength = 20;
    const trailPositions = new Float32Array(trailLength * 3);
    const trailColors = new Float32Array(trailLength * 3);

    // 初始化所有点在起始位置
    for (let i = 0; i < trailLength; i++) {
      trailPositions[i * 3 + 0] = start.x;
      trailPositions[i * 3 + 1] = start.y;
      trailPositions[i * 3 + 2] = start.z;

      // 颜色从亮到暗渐变
      const t = i / (trailLength - 1);
      const fade = Math.pow(1 - t, 2.0);
      trailColors[i * 3 + 0] = color.r * fade + (1 - fade) * 0.3;
      trailColors[i * 3 + 1] = color.g * fade * 0.6;
      trailColors[i * 3 + 2] = color.b * fade * 0.3;
    }

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trailPositions, 3)
    );
    trailGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(trailColors, 3)
    );

    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });

    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.renderOrder = 40;

    this.scene.add(trail);
    this.scene.add(spark);

    this.rockets.push({
      spark,
      trail,
      trailPositions,
      sparkParticles: [],
      age: 0,
      duration: rand(0.7, 1.0),
      start,
      end,
      intensity,
      pattern,
      userTriggered,
      color,
    });
  }

  update(dtSeconds: number): void {
    // 收集所有火花粒子用于渲染
    const allSparkParticles: RocketSparkParticle[] = [];

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dtSeconds;
      const progress = clamp(r.age / r.duration, 0, 1);
      const t = easeOutCubic(progress);

      // 当前位置
      const currentPos = new THREE.Vector3().lerpVectors(r.start, r.end, t);

      // 更新火星位置
      r.spark.position.copy(currentPos);

      // 火星闪烁效果
      const flicker = 0.8 + 0.2 * Math.sin(r.age * 40);
      const sparkMat = r.spark.material as THREE.SpriteMaterial;
      sparkMat.opacity = flicker * (0.5 + 0.5 * (1 - progress));

      // 火星大小随高度略微变化
      const sparkSize = 0.25 * (0.8 + 0.2 * Math.sin(r.age * 25));
      r.spark.scale.set(sparkSize, sparkSize, 1);

      // 更新尾迹：把所有点往后推一格，头部写入当前位置
      const posAttr = r.trail.geometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const trailLength = r.trailPositions.length / 3;

      // 从尾部开始，每个点继承前一个点的位置
      for (let j = trailLength - 1; j > 0; j--) {
        r.trailPositions[j * 3 + 0] = r.trailPositions[(j - 1) * 3 + 0];
        r.trailPositions[j * 3 + 1] = r.trailPositions[(j - 1) * 3 + 1];
        r.trailPositions[j * 3 + 2] = r.trailPositions[(j - 1) * 3 + 2];
      }
      // 头部写入当前位置
      r.trailPositions[0] = currentPos.x;
      r.trailPositions[1] = currentPos.y;
      r.trailPositions[2] = currentPos.z;

      // 更新顶点缓冲
      for (let j = 0; j < trailLength; j++) {
        posAttr.setXYZ(
          j,
          r.trailPositions[j * 3],
          r.trailPositions[j * 3 + 1],
          r.trailPositions[j * 3 + 2]
        );
      }
      posAttr.needsUpdate = true;

      // 尾迹透明度
      const trailMat = r.trail.material as THREE.LineBasicMaterial;
      trailMat.opacity = 0.6 + 0.4 * (1 - progress);

      // === 生成上升火花粒子（密集喷射，带尾焰） ===
      // 大量火花从火箭尾部喷射
      const sparkSpawnRate = 80; // 每秒生成的火花数量（大幅增加）
      const sparkSpawnChance = sparkSpawnRate * dtSeconds;
      const numToSpawn =
        Math.floor(sparkSpawnChance) +
        (Math.random() < sparkSpawnChance % 1 ? 1 : 0);

      for (let s = 0; s < numToSpawn; s++) {
        // 火花初始速度：主要向下喷射，有一定散开角度
        const angle = rand(0, Math.PI * 2);
        const spreadAngle = rand(0.1, 0.4); // 喷射锥角
        const outwardSpeed = rand(0.2, 0.6) * spreadAngle;
        const downSpeed = rand(1.2, 2.8); // 向下喷射更快

        const sparkColor = r.color.clone();
        // 火花颜色变化：从亮白到橙红
        const hsl = { h: 0, s: 0, l: 0 };
        sparkColor.getHSL(hsl);
        hsl.h = (hsl.h + rand(-0.03, 0.02) + 1) % 1; // 偏红/橙
        hsl.s = clamp(hsl.s + rand(0, 0.15), 0.8, 1.0);
        hsl.l = clamp(hsl.l + rand(0.05, 0.25), 0.65, 0.98);
        sparkColor.setHSL(hsl.h, hsl.s, hsl.l);

        const startPos = currentPos.clone().add(
          new THREE.Vector3(
            rand(-0.03, 0.03),
            rand(-0.05, 0.02), // 稍微偏下
            rand(-0.03, 0.03)
          )
        );

        // 初始化历史位置数组（用于尾焰）
        const positions: THREE.Vector3[] = [];
        for (let p = 0; p < this.sparkTrailLength; p++) {
          positions.push(startPos.clone());
        }

        r.sparkParticles.push({
          positions,
          velocity: new THREE.Vector3(
            Math.cos(angle) * outwardSpeed,
            -downSpeed + rand(-0.3, 0.2),
            Math.sin(angle) * outwardSpeed
          ),
          life: 0,
          maxLife: rand(0.2, 0.45),
          baseSize: rand(0.5, 1.2),
          color: sparkColor,
        });
      }

      // === 更新现有火花粒子 ===
      for (let j = r.sparkParticles.length - 1; j >= 0; j--) {
        const sp = r.sparkParticles[j];
        sp.life += dtSeconds;

        // 物理更新：重力 + 空气阻力
        sp.velocity.y -= 4.5 * dtSeconds; // 重力
        sp.velocity.multiplyScalar(1 - dtSeconds * 2.0); // 空气阻力

        // 更新头部位置
        const head = sp.positions[0];
        head.add(sp.velocity.clone().multiplyScalar(dtSeconds));

        // 尾焰：每个后续点逐渐追向前一个点（形成拖尾）
        for (let p = sp.positions.length - 1; p > 0; p--) {
          const prev = sp.positions[p - 1];
          const curr = sp.positions[p];
          // 平滑追随
          curr.lerp(prev, 0.5);
        }

        // 移除已消亡的火花
        if (sp.life >= sp.maxLife) {
          r.sparkParticles.splice(j, 1);
        }
      }

      // 收集该火箭的所有火花粒子
      allSparkParticles.push(...r.sparkParticles);

      if (r.age >= r.duration) {
        // 顶点绽放
        this.onBurst?.(r.end.clone(), r.pattern, r.intensity, r.userTriggered);
        this.fireworks.spawn(r.end, r.intensity, r.pattern);
        this.remove(r);
        this.rockets.splice(i, 1);
      }
    }

    // === 更新火花粒子渲染缓冲区（每个火花渲染多个尾焰点） ===
    if (this.sparkGeometry) {
      const posAttr = this.sparkGeometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const colAttr = this.sparkGeometry.getAttribute(
        "color"
      ) as THREE.BufferAttribute;
      const sizeAttr = this.sparkGeometry.getAttribute(
        "aSize"
      ) as THREE.BufferAttribute;
      const alphaAttr = this.sparkGeometry.getAttribute(
        "aAlpha"
      ) as THREE.BufferAttribute;

      let idx = 0;
      for (const sp of allSparkParticles) {
        if (idx >= this.maxSparkParticles) break;

        const lifeRatio = 1 - sp.life / sp.maxLife;
        const baseAlpha = Math.pow(lifeRatio, 0.4);

        // 渲染这个火花的所有尾焰点
        for (
          let p = 0;
          p < sp.positions.length && idx < this.maxSparkParticles;
          p++
        ) {
          const pos = sp.positions[p];
          // 尾焰渐变：头部最亮最大，尾部逐渐变暗变小
          const tailRatio = 1 - p / sp.positions.length;
          const tailFade = Math.pow(tailRatio, 0.6);

          posAttr.setXYZ(idx, pos.x, pos.y, pos.z);

          // 颜色：头部偏白/亮黄，尾部偏橙红
          const colorFade = tailRatio;
          const r =
            sp.color.r * (0.7 + 0.3 * colorFade) + (1 - colorFade) * 0.15;
          const g = sp.color.g * colorFade;
          const b = sp.color.b * colorFade * 0.5;
          colAttr.setXYZ(idx, Math.min(1, r + tailRatio * 0.3), g, b);

          // 大小：头部大，尾部小
          const size = sp.baseSize * tailFade * lifeRatio;
          sizeAttr.setX(idx, size);

          // 透明度：头部亮，尾部暗
          const alpha = baseAlpha * tailFade;
          alphaAttr.setX(idx, alpha);

          idx++;
        }
      }

      // 清空剩余的粒子
      for (; idx < this.maxSparkParticles; idx++) {
        alphaAttr.setX(idx, 0);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
  }

  private remove(r: Rocket): void {
    this.scene.remove(r.spark);
    this.scene.remove(r.trail);
    const sparkMat = r.spark.material as THREE.SpriteMaterial;
    sparkMat.map?.dispose();
    sparkMat.dispose();
    r.trail.geometry.dispose();
    (r.trail.material as THREE.Material).dispose();
  }

  dispose(): void {
    for (const r of this.rockets) this.remove(r);
    this.rockets.length = 0;

    // 清理火花粒子系统
    if (this.sparkPoints) {
      this.scene.remove(this.sparkPoints);
      this.sparkGeometry?.dispose();
      (this.sparkPoints.material as THREE.Material).dispose();
      this.sparkPoints = null;
      this.sparkGeometry = null;
    }
  }
}

class PerformanceScaler {
  private readonly renderer: THREE.WebGLRenderer;
  private targetPixelRatio: number;
  private currentPixelRatio: number;
  private accMs = 0;
  private samples = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.targetPixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
    this.currentPixelRatio = this.targetPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
  }

  update(frameMs: number): void {
    this.accMs += frameMs;
    this.samples += 1;
    if (this.samples < 30) return;

    const avg = this.accMs / this.samples;
    this.accMs = 0;
    this.samples = 0;

    // 目标：移动端尽量维持 50~60fps
    if (avg > 22) {
      this.targetPixelRatio = Math.max(0.9, this.targetPixelRatio - 0.15);
    } else if (avg < 16) {
      this.targetPixelRatio = Math.min(
        clamp(window.devicePixelRatio || 1, 1, 2),
        this.targetPixelRatio + 0.08
      );
    }

    const next = lerp(this.currentPixelRatio, this.targetPixelRatio, 0.35);
    if (Math.abs(next - this.currentPixelRatio) > 0.03) {
      this.currentPixelRatio = next;
      this.renderer.setPixelRatio(this.currentPixelRatio);
    }
  }
}

function main(): void {
  setupOverlay();

  // ======== 底部按钮功能 ========
  const btnGoto2026 =
    document.querySelector<HTMLButtonElement>("#btn-goto-2026");
  const btnFirework =
    document.querySelector<HTMLButtonElement>("#btn-firework");
  const progressFill = document.querySelector<HTMLDivElement>("#progress-fill");

  let fireworkCount = 0;
  const TARGET_FIREWORK_COUNT = 26;

  function updateFireworkCounter(): void {
    // 更新进度条填充
    const progress = Math.min(
      (fireworkCount / TARGET_FIREWORK_COUNT) * 100,
      100
    );
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }

    // 达到26次后激活"去往2026"按钮
    if (fireworkCount >= TARGET_FIREWORK_COUNT && btnGoto2026) {
      btnGoto2026.disabled = false;
      btnGoto2026.classList.add("active");

      // 播放庆祝动画
      btnGoto2026.classList.add("celebrate");
      setTimeout(() => {
        btnGoto2026.classList.remove("celebrate");
      }, 600);
    }
  }

  // ======== 场景切换状态 ========
  type ScenePhase = "countdown" | "transition" | "celebration";
  let scenePhase: ScenePhase = "countdown";
  let transitionProgress = 0;
  let celebrationStartTime = 0;
  let celebrationFireworkTimer = 0;

  // 新年祝福文字（将在切换后创建）
  let newYearSprite: THREE.Sprite | null = null;
  let wishSprite2: THREE.Sprite | null = null;
  let wishSprite3: THREE.Sprite | null = null;

  // 返回按钮
  const btnBack = document.querySelector<HTMLButtonElement>("#btn-back");

  // 存储新场景创建的对象，便于返回时清理
  let celebrationObjects: THREE.Object3D[] = [];

  // 场景切换函数
  function startSceneTransition(): void {
    if (scenePhase !== "countdown") return;
    scenePhase = "transition";
    transitionProgress = 0;

    // 隐藏按钮容器
    const buttonsContainer =
      document.querySelector<HTMLDivElement>("#buttons-container");
    if (buttonsContainer) {
      buttonsContainer.style.transition = "opacity 0.5s ease";
      buttonsContainer.style.opacity = "0";
      buttonsContainer.style.pointerEvents = "none";
    }

    // 隐藏提示文字
    const hint = document.querySelector<HTMLDivElement>("#hint");
    if (hint) {
      hint.style.transition = "opacity 0.5s ease";
      hint.style.opacity = "0";
    }

    // 尝试开启音乐
    bgm.start();
  }

  // "去往2026"按钮点击事件
  if (btnGoto2026) {
    btnGoto2026.addEventListener("click", () => {
      if (fireworkCount >= TARGET_FIREWORK_COUNT) {
        startSceneTransition();
      }
    });
  }

  // 返回初始场景的函数
  function returnToCountdown(): void {
    if (scenePhase !== "celebration") return;

    // 隐藏返回按钮
    if (btnBack) {
      btnBack.classList.remove("visible");
    }

    // 清理新场景创建的对象
    celebrationObjects.forEach((obj) => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    celebrationObjects = [];

    // 清理window上存储的引用
    delete (window as any).__flowersGroup;
    delete (window as any).__decorGroup;
    delete (window as any).__torusRing;
    delete (window as any).__torusRing2;

    // 重置祝福文字
    if (newYearSprite) {
      scene.remove(newYearSprite);
      newYearSprite = null;
    }
    if (wishSprite2) {
      scene.remove(wishSprite2);
      wishSprite2 = null;
    }
    if (wishSprite3) {
      scene.remove(wishSprite3);
      wishSprite3 = null;
    }

    // 恢复场景阶段
    scenePhase = "countdown";
    transitionProgress = 0;

    // 恢复原始场景元素可见性和透明度
    motif.visible = true;
    motif.scale.setScalar(1);
    ring.visible = true;
    ring.material.opacity = 0.5;
    titleSprite.visible = true;
    (titleSprite.material as THREE.SpriteMaterial).opacity = 1;
    wishSprite.visible = true;
    (wishSprite.material as THREE.SpriteMaterial).opacity = 1;
    subSprite.visible = true;
    (subSprite.material as THREE.SpriteMaterial).opacity = 0.85;

    // 恢复摄像机位置
    camera.position.set(0, 3.2, 6.2);
    camera.lookAt(0, 1.8, 0);

    // 恢复场景氛围
    scene.fog = new THREE.Fog(new THREE.Color("#050512"), 6.0, 28.0);
    renderer.setClearColor(new THREE.Color("#050512"), 1);

    // 恢复HTML覆盖层
    const titleEl = document.querySelector<HTMLDivElement>("#title");
    const subtitleEl = document.querySelector<HTMLDivElement>("#subtitle");
    const buttonsContainer =
      document.querySelector<HTMLDivElement>("#buttons-container");
    const hint = document.querySelector<HTMLDivElement>("#hint");

    if (titleEl) {
      titleEl.style.display = "";
      titleEl.style.opacity = "1";
    }
    if (subtitleEl) {
      subtitleEl.style.display = "";
      subtitleEl.style.opacity = "1";
    }
    if (buttonsContainer) {
      buttonsContainer.style.transition = "opacity 0.5s ease";
      buttonsContainer.style.opacity = "1";
      buttonsContainer.style.pointerEvents = "auto";
    }
    if (hint) {
      hint.style.transition = "opacity 0.5s ease";
      hint.style.opacity = "1";
    }

    // 重置烟花计数
    fireworkCount = 0;
    updateFireworkCounter();
  }

  // 返回按钮点击事件
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      returnToCountdown();
    });
  }

  const bgm = createBackgroundMusic(MUSIC_URL);

  const viewport = getViewportSize();
  const isMobile =
    isTouchDevice() || Math.min(viewport.width, viewport.height) < 600;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color("#050512"), 6.0, 28.0);

  const camera = new THREE.PerspectiveCamera(
    55,
    viewport.width / viewport.height,
    0.1,
    120
  );
  camera.position.set(0, 3.2, 6.2);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setSize(viewport.width, viewport.height);
  renderer.setClearColor(new THREE.Color("#050512"), 1);

  // 固定 canvas 在底层，避免遮挡 HTML overlay 字体
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "0";
  renderer.domElement.style.display = "block";
  // 移动端：避免页面滚动/缩放手势干扰 3D 操作
  renderer.domElement.style.touchAction = "none";
  (renderer.domElement.style as any).webkitTapHighlightColor = "transparent";
  document.body.appendChild(renderer.domElement);

  const perf = new PerformanceScaler(renderer);
  const controls = new TouchOrbitControls(camera, renderer.domElement);
  controls.setTarget(new THREE.Vector3(0, 1.1, 0));

  // 交互增强：捏合/滚轮缩放会叠加在布局半径之上
  let userZoomOffset = 0;

  // Lights
  scene.add(new THREE.AmbientLight(new THREE.Color("#cbbcff"), 0.55));

  const key = new THREE.DirectionalLight(new THREE.Color("#ffd6f2"), 1.05);
  key.position.set(4, 6, 3);
  scene.add(key);

  const fill = new THREE.PointLight(new THREE.Color("#77d6ff"), 0.9, 40, 2);
  fill.position.set(-4, 2.5, -3);
  scene.add(fill);

  const glow = new THREE.PointLight(new THREE.Color("#ff48b8"), 1.35, 20, 2);
  glow.position.set(0, 2.4, 2.5);
  scene.add(glow);

  // Background stars
  const stars = createStarField(isMobile ? 1200 : 1800);
  scene.add(stars);

  // Center motif
  const motifBuilt = createCenterMotifObject();
  const motif = motifBuilt.object;
  const shyGirl = motifBuilt.shyGirl;
  scene.add(motif);

  function collectEmissiveMaterials(
    root: THREE.Object3D
  ): THREE.MeshStandardMaterial[] {
    const out: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of mats) {
        if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          out.push(m as THREE.MeshStandardMaterial);
        }
      }
    });
    return out;
  }

  const motifEmissiveMats = collectEmissiveMaterials(motif);
  const motifEmissiveBase = motifEmissiveMats.map((m) => m.emissiveIntensity);
  function setMotifEmissiveMultiplier(mult: number): void {
    for (let i = 0; i < motifEmissiveMats.length; i++) {
      motifEmissiveMats[i].emissiveIntensity = motifEmissiveBase[i] * mult;
    }
  }

  // Halo ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.65, 0.03, 16, 120),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color("#a9e8ff"),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    })
  );
  ring.position.set(0, 1.06, 0);
  ring.rotation.x = Math.PI * 0.5;
  scene.add(ring);

  // Text sprites
  const titleSprite = createTextSprite(`${YEAR_FROM} → ${YEAR_TO}`, {
    fontSize: 86,
    glowColor: "rgba(120, 210, 255, 0.9)",
  });
  titleSprite.position.set(0, 2.55, 0);
  scene.add(titleSprite);

  const wishSprite = createTextSprite(`愿你岁岁安澜`, {
    fontSize: 64,
    glowColor: "rgba(255, 120, 210, 0.9)",
  });
  wishSprite.position.set(0, 2.0, 0);
  scene.add(wishSprite);

  const subSprite = createTextSprite("愿你温柔而笃定", {
    fontSize: 50,
    glowColor: "rgba(255, 210, 120, 0.85)",
    color: "rgba(255,255,255,0.9)",
  });
  subSprite.position.set(0, 1.62, 0);
  scene.add(subSprite);

  // --- 响应式布局（移动端竖屏优先） ---
  const base = {
    cameraFov: 55,
    radius: 6.2,
    phi: Math.PI * 0.38,
    titleY: 2.55,
    wishY: 2.0,
    subY: 1.62,
    titleScale: titleSprite.scale.clone(),
    wishScale: wishSprite.scale.clone(),
    subScale: subSprite.scale.clone(),
    motifBaseScale: 1.18,
  };

  let layoutTitleY = base.titleY;
  let layoutWishY = base.wishY;
  let layoutSubY = base.subY;
  let layoutMotifScale = base.motifBaseScale;

  function applyLayout(): void {
    const size = getViewportSize();
    const aspect = size.width / size.height;
    const portrait = aspect < 0.86;

    // 竖屏：扩大视野 + 拉远一点，避免 3D 文字被裁切
    camera.fov = portrait ? 62 : base.cameraFov;
    camera.updateProjectionMatrix();

    const layoutRadius = portrait ? 7.6 : base.radius;
    controls.setRadius(layoutRadius + userZoomOffset);
    controls.setPhi(portrait ? Math.PI * 0.36 : base.phi);

    const textScale = portrait ? 0.72 : isMobile ? 0.85 : 1.0;
    titleSprite.scale.copy(base.titleScale).multiplyScalar(textScale);
    wishSprite.scale.copy(base.wishScale).multiplyScalar(textScale);
    subSprite.scale.copy(base.subScale).multiplyScalar(textScale);

    layoutTitleY = portrait ? 2.28 : base.titleY;
    layoutWishY = portrait ? 1.82 : base.wishY;
    layoutSubY = portrait ? 1.48 : base.subY;

    // 女孩作为中心主体时：把三行祝福整体上移，确保不压在女孩头部上
    if (shyGirl) {
      const wishLift = portrait ? 0.42 : 0.32;
      const titleLift = portrait ? 0.2 : 0.14;
      layoutTitleY += titleLift;
      layoutWishY += wishLift;
      layoutSubY += wishLift * 0.9;
    }

    // 避免三行文字上下浮动时互相重叠：拉开基础间距
    if (isMobile || portrait) {
      const extraTitleGap = portrait ? 0.07 : 0.05;
      const extraWishGap = portrait ? 0.03 : 0.02;
      const extraSubDrop = portrait ? 0.07 : 0.055;
      layoutTitleY += extraTitleGap;
      layoutWishY += extraWishGap;
      layoutSubY -= extraSubDrop;
    }

    // 主体在手机上略微收一点，避免贴边
    layoutMotifScale = portrait
      ? base.motifBaseScale * 0.96
      : base.motifBaseScale;

    // 若中心是女孩：再收一点点并下移，避免与祝福文字重叠
    const motifYOffset = shyGirl ? (portrait ? -0.86 : -0.74) : 0.0;
    const motifScaleMult = shyGirl ? (portrait ? 0.92 : 0.94) : 1.0;
    motif.position.y = 1.12 + motifYOffset;
    ring.position.y = motif.position.y - 0.09;
    layoutMotifScale *= motifScaleMult;

    // 同步一次位置（浮动动画会在 frame() 里叠加）
    titleSprite.position.y = layoutTitleY;
    wishSprite.position.y = layoutWishY;
    subSprite.position.y = layoutSubY;
  }

  // Confetti
  const confetti = new ConfettiSystem(isMobile ? 650 : 900);
  scene.add(confetti.object3d());

  // Fireworks
  const fireworks = new Fireworks(scene, {
    maxBursts: isMobile ? 8 : 10,
    particlesPerBurst: isMobile ? 520 : 720,
  });

  // Floating love notes（仅在你主动放烟花时出现）
  // 固定显示区域：Y 坐标范围（在 "2025 → 2026" 标题上方更高的位置）
  const NOTE_ZONE_MIN_Y = 3.0; // 区域底部
  const NOTE_ZONE_MAX_Y = 4.2; // 区域顶部

  type FloatingNote = {
    sprite: THREE.Sprite;
    worldPos: THREE.Vector3;
    velocityY: number;
    age: number;
    duration: number;
    baseScale: THREE.Vector3;
    slot: number; // 分配的槽位，避免重叠
  };
  const floatingNotes: FloatingNote[] = [];

  // 用于分配槽位，避免重叠
  let noteSpawnIndex = 0;
  const NOTE_SLOTS = 5; // 同时最多显示的槽位数
  const usedSlots = new Set<number>();

  function getAvailableSlot(): number {
    // 找一个没被占用的槽位
    for (let i = 0; i < NOTE_SLOTS; i++) {
      const slot = (noteSpawnIndex + i) % NOTE_SLOTS;
      if (!usedSlots.has(slot)) {
        return slot;
      }
    }
    // 都被占用了，用下一个
    return noteSpawnIndex % NOTE_SLOTS;
  }

  function spawnFloatingNote(world: THREE.Vector3, text: string): void {
    // 当数量达到上限时，移除最老的
    if (floatingNotes.length >= MAX_FLOATING_NOTES) {
      const old = floatingNotes.shift();
      if (old) {
        usedSlots.delete(old.slot);
        scene.remove(old.sprite);
        const mat = old.sprite.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    }

    const sprite = createTextSprite(text, {
      fontSize: isMobile ? 40 : 46,
      glowColor: "rgba(255, 150, 220, 0.9)",
      color: "rgba(255,255,255,0.98)",
      maxWidth: isMobile ? 550 : 750,
    });

    // 分配槽位，每个槽位在不同的垂直位置
    const slot = getAvailableSlot();
    usedSlots.add(slot);
    noteSpawnIndex++;

    // 每个槽位有固定的垂直起始位置，间隔足够大
    const slotSpacing = (NOTE_ZONE_MAX_Y - NOTE_ZONE_MIN_Y) / NOTE_SLOTS;
    const slotY = NOTE_ZONE_MIN_Y + slot * slotSpacing;

    const startPos = new THREE.Vector3(
      rand(-0.1, 0.1), // 几乎居中
      slotY,
      0
    );
    sprite.position.copy(startPos);
    sprite.renderOrder = 1100;

    const mat = sprite.material as THREE.SpriteMaterial;
    mat.opacity = 0.0;

    const baseScale = sprite.scale
      .clone()
      .multiplyScalar(isMobile ? 0.35 : 0.42);
    sprite.scale.copy(baseScale);

    scene.add(sprite);

    floatingNotes.push({
      sprite,
      worldPos: startPos.clone(),
      // 上升速度：慢慢飘
      velocityY: rand(0.08, 0.12),
      age: 0,
      duration: rand(3.5, 4.5),
      baseScale,
      slot,
    });
  }

  // Rockets: lift-off -> burst
  const rockets = new FireworkRockets(
    scene,
    fireworks,
    isMobile ? 5 : 7,
    (world, _pattern, _intensity, userTriggered) => {
      if (!userTriggered) return;

      // 轻微震动（若系统允许），增强"触感"但不打扰
      if (isMobile && "vibrate" in navigator) {
        try {
          (navigator as any).vibrate?.(14);
        } catch {
          // ignore
        }
      }

      spawnFloatingNote(world, pickOne(LOVE_NOTES));
    }
  );

  // 保存到 window 供按钮使用
  (window as any).__happyRockets = rockets;

  // "放烟花"按钮点击事件
  if (btnFirework) {
    btnFirework.addEventListener("click", () => {
      // 尝试开启音乐
      bgm.start();

      // 放一次烟花（范围收紧，确保在屏幕内绽放）
      const origin = new THREE.Vector3(
        rand(-2, 2),
        rand(2.2, 3.5),
        rand(-1.5, 1.5)
      );
      rockets.launch(
        new THREE.Vector3(origin.x, 0, origin.z),
        rand(0.95, 1.15),
        chooseFireworkPattern(true),
        true
      );

      // 增加计数
      fireworkCount++;
      updateFireworkCounter();

      // 按钮点击动效
      btnFirework.style.transform = "scale(0.95)";
      setTimeout(() => {
        btnFirework.style.transform = "";
      }, 100);
    });
  }

  // Angle phrases: rotate to reveal different lines
  const phraseRing = new AnglePhraseRing({
    phrases: ["愿你岁岁安澜", "灯火可亲", "风起有归处", "心安即良辰"],
    center: new THREE.Vector3(0, 1.1, 0),
    radius: 3.2,
    y: 2.25,
    fontSize: isMobile ? 50 : 56,
  });
  scene.add(phraseRing.object3d());

  // Tap / click to spawn fireworks near the heart
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
  const hit = new THREE.Vector3();

  // 点击反馈：3D 扩散光环
  type Ripple = { mesh: THREE.Mesh; age: number; duration: number };
  const ripples: Ripple[] = [];
  function spawnRippleAt(world: THREE.Vector3): void {
    if (ripples.length > (isMobile ? 10 : 14)) {
      const old = ripples.shift();
      if (old) {
        scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        (old.mesh.material as THREE.Material).dispose();
      }
    }

    const geometry = new THREE.RingGeometry(0.12, 0.17, 64);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#a9e8ff"),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(world);
    mesh.rotation.x = Math.PI * 0.5;
    mesh.renderOrder = 60;
    scene.add(mesh);
    ripples.push({ mesh, age: 0, duration: 0.85 });
  }

  // 交互增强：拖拽中心图案（抓取旋转） + 双指捏合缩放 + 滚轮缩放
  const pointers = new Map<number, { x: number; y: number }>();
  const pinch = {
    active: false,
    startDist: 0,
    startZoomOffset: 0,
  };
  const motifDrag = {
    pointerId: null as number | null,
    lastX: 0,
    lastY: 0,
    active: false,
  };
  let suppressTapPointerId: number | null = null;

  function setNdcFromClient(clientX: number, clientY: number): void {
    const size = getViewportSize();
    ndc.x = (clientX / size.width) * 2 - 1;
    ndc.y = -(clientY / size.height) * 2 + 1;
  }

  function spawnAtScreen(clientX: number, clientY: number): void {
    setNdcFromClient(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    const has = raycaster.ray.intersectPlane(groundPlane, hit);

    if (has) {
      // 在点击位置给一点“触感反馈”
      spawnRippleAt(new THREE.Vector3(hit.x, 1.02, hit.z));
    }

    const origin = new THREE.Vector3(
      has ? clamp(hit.x, -2.5, 2.5) : rand(-1.5, 1.5),
      rand(2.0, 3.5),
      has ? clamp(hit.z, -2, 2) : rand(-1.5, 1.5)
    );
    rockets.launch(
      new THREE.Vector3(origin.x, 0, origin.z),
      1.0,
      chooseFireworkPattern(true),
      true
    );
  }

  // 轻触放烟花：与拖动旋转区分（移动距离阈值 + 时长）
  const tap = {
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startMs: 0,
    moved: false,
  };
  const doubleTap = {
    lastMs: 0,
    lastX: 0,
    lastY: 0,
  };
  const tapMoveThreshold = isMobile ? 10 : 6;
  const tapMaxDurationMs = isMobile ? 320 : 260;
  const doubleTapMaxDelayMs = isMobile ? 360 : 320;

  renderer.domElement.addEventListener(
    "pointerdown",
    (e) => {
      if (suppressTapPointerId === e.pointerId) return;
      tap.pointerId = e.pointerId;
      tap.startX = e.clientX;
      tap.startY = e.clientY;
      tap.startMs = nowMs();
      tap.moved = false;
    },
    { passive: true }
  );

  // 抓取中心图案：用 capture 确保先于相机控制拿到事件
  renderer.domElement.addEventListener(
    "pointerdown",
    (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 如果已经进入捏合，不再尝试抓取
      if (pointers.size >= 2) {
        pinch.active = true;
        const ids = Array.from(pointers.keys());
        const a = pointers.get(ids[0])!;
        const b = pointers.get(ids[1])!;
        pinch.startDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinch.startZoomOffset = userZoomOffset;
        controls.blockPointer(ids[0]);
        controls.blockPointer(ids[1]);
        suppressTapPointerId = e.pointerId;
        tap.moved = true;
        return;
      }

      // 尝试命中中心图案
      setNdcFromClient(e.clientX, e.clientY);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(motif, true);
      if (hits.length > 0) {
        motifDrag.pointerId = e.pointerId;
        motifDrag.lastX = e.clientX;
        motifDrag.lastY = e.clientY;
        motifDrag.active = true;

        controls.blockPointer(e.pointerId);
        controls.setAutoSpin(false);

        // 轻微高亮，告诉用户“抓住了”
        setMotifEmissiveMultiplier(1.25);

        suppressTapPointerId = e.pointerId;
        tap.moved = true;
      }
    },
    { passive: true, capture: true }
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      const p = pointers.get(e.pointerId);
      if (p) {
        p.x = e.clientX;
        p.y = e.clientY;
      }

      // 捏合缩放
      if (pinch.active && pointers.size >= 2) {
        const ids = Array.from(pointers.keys());
        const a = pointers.get(ids[0])!;
        const b = pointers.get(ids[1])!;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const delta = dist - pinch.startDist;

        // 距离变大 => 拉近；变小 => 拉远
        userZoomOffset = clamp(
          pinch.startZoomOffset - delta * 0.008,
          -2.4,
          2.2
        );
        applyLayout();
        tap.moved = true;
        return;
      }

      // 抓取旋转中心图案
      if (motifDrag.active && motifDrag.pointerId === e.pointerId) {
        const dx = e.clientX - motifDrag.lastX;
        const dy = e.clientY - motifDrag.lastY;
        motifDrag.lastX = e.clientX;
        motifDrag.lastY = e.clientY;

        const speed = 0.009;
        motif.rotation.y += dx * speed;
        motif.rotation.x += dy * speed;
        motif.rotation.x = clamp(motif.rotation.x, -0.75, 0.75);
        tap.moved = true;
        return;
      }

      if (tap.pointerId === null || e.pointerId !== tap.pointerId) return;
      const dx = e.clientX - tap.startX;
      const dy = e.clientY - tap.startY;
      if (dx * dx + dy * dy > tapMoveThreshold * tapMoveThreshold) {
        tap.moved = true;
      }
    },
    { passive: true }
  );
  window.addEventListener(
    "pointerup",
    (e) => {
      pointers.delete(e.pointerId);

      // 结束捏合
      if (pinch.active && pointers.size < 2) {
        pinch.active = false;
        controls.unblockPointer(e.pointerId);
        suppressTapPointerId = null;
        tap.pointerId = null;
      }

      // 结束抓取
      if (motifDrag.active && motifDrag.pointerId === e.pointerId) {
        motifDrag.active = false;
        motifDrag.pointerId = null;
        controls.unblockPointer(e.pointerId);
        suppressTapPointerId = null;
        setMotifEmissiveMultiplier(1.0);
        controls.setAutoSpin(true);
        tap.pointerId = null;
        return;
      }

      if (tap.pointerId === null || e.pointerId !== tap.pointerId) return;
      const duration = nowMs() - tap.startMs;
      const shouldSpawn = !tap.moved && duration <= tapMaxDurationMs;
      tap.pointerId = null;
      if (!shouldSpawn) return;

      // 改为“双击/双点”放烟花：两次轻触间隔和距离都要足够近
      const ms = nowMs();
      const dx = e.clientX - doubleTap.lastX;
      const dy = e.clientY - doubleTap.lastY;
      const near =
        dx * dx + dy * dy <= tapMoveThreshold * 2 * (tapMoveThreshold * 2);
      const fast = ms - doubleTap.lastMs <= doubleTapMaxDelayMs;

      // 双击放烟花功能已禁用，只能通过底部按钮放烟花
      // if (doubleTap.lastMs > 0 && fast && near) {
      //   doubleTap.lastMs = 0;
      //   bgm.start();
      //   spawnAtScreen(e.clientX, e.clientY);
      //   return;
      // }

      doubleTap.lastMs = ms;
      doubleTap.lastX = e.clientX;
      doubleTap.lastY = e.clientY;
    },
    { passive: true }
  );
  window.addEventListener(
    "pointercancel",
    (e) => {
      pointers.delete(e.pointerId);
      if (motifDrag.pointerId === e.pointerId) {
        motifDrag.active = false;
        motifDrag.pointerId = null;
        controls.unblockPointer(e.pointerId);
        suppressTapPointerId = null;
        setMotifEmissiveMultiplier(1.0);
        controls.setAutoSpin(true);
      }
      if (tap.pointerId === null || e.pointerId !== tap.pointerId) return;
      tap.pointerId = null;
    },
    { passive: true }
  );

  // 桌面端：滚轮缩放
  if (!isMobile) {
    renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        // deltaY > 0 通常是“向下滚” => 拉远
        userZoomOffset = clamp(userZoomOffset + e.deltaY * 0.0022, -2.4, 2.2);
        applyLayout();
      },
      { passive: true }
    );
  }

  // 自动放烟花功能已禁用，只能通过底部按钮放烟花
  // let autoTimer = 0;
  // function spawnAuto(): void {
  //   const origin = new THREE.Vector3(
  //     rand(-3.8, 3.8),
  //     rand(2.2, 4.4),
  //     rand(-3.2, 2.8)
  //   );
  //   rockets.launch(
  //     new THREE.Vector3(origin.x, 0, origin.z),
  //     rand(0.85, 1.15),
  //     chooseFireworkPattern(false),
  //     false
  //   );
  // }
  // for (let i = 0; i < 3; i++) spawnAuto();

  // Resize
  function onResize(): void {
    const size = getViewportSize();
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
    applyLayout();
  }
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });
  window.visualViewport?.addEventListener("resize", onResize, {
    passive: true,
  });

  // 初始布局
  applyLayout();

  // Pause when hidden
  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState === "visible";
    if (!running) bgm.pause();
    else bgm.resume();
  });

  // Animation loop
  let last = nowMs();
  let t = 0;
  function frame(): void {
    requestAnimationFrame(frame);
    if (!running) return;

    const ms = nowMs();
    const dt = clamp((ms - last) / 1000, 0, 0.05);
    last = ms;
    t += dt;

    perf.update(dt * 1000);

    controls.update(dt);

    // Heart breathing + gentle spin
    const pulse = 1.0 + Math.sin(t * 2.1) * 0.03;
    motif.scale.setScalar(layoutMotifScale * pulse);
    if (shyGirl) {
      // 女孩不要一直自转，否则会背对镜头导致“看不清”
      if (!motifDrag.active) {
        const faceFollow = 1.0 - Math.exp(-dt * 2.8);
        motif.rotation.y = lerp(motif.rotation.y, 0.0, faceFollow);
      }
    } else {
      motif.rotation.y += dt * 0.22;
    }

    // 女孩模式稍微提亮主体，增加与背景对比
    if (shyGirl) {
      key.intensity = 1.18;
      fill.intensity = 1.05;
    } else {
      key.intensity = 1.05;
      fill.intensity = 0.9;
    }

    // 如果当前中心图案是女孩头部：可爱的晃动动画
    if (shyGirl) {
      const danceBeat = t * 2.0; // 轻柔的节拍
      const bounce = Math.sin(danceBeat) * 0.03; // 轻微上下浮动
      const sway = Math.sin(danceBeat * 0.6) * 0.04; // 轻微左右摇摆

      // 头部位置浮动
      shyGirl.head.position.y = bounce;

      // 头部轻轻晃动，可爱地看着
      shyGirl.head.rotation.x = Math.sin(danceBeat * 0.5 + 1.1) * 0.06;
      shyGirl.head.rotation.y = Math.sin(danceBeat * 0.3 + 0.4) * 0.1;
      shyGirl.head.rotation.z = -Math.PI * 0.02 + sway * 0.15;

      // 腮红呼吸感
      const blush = 0.22 + 0.08 * (0.5 + 0.5 * Math.sin(danceBeat * 0.5));
      (shyGirl.blushL.material as THREE.MeshBasicMaterial).opacity = blush;
      (shyGirl.blushR.material as THREE.MeshBasicMaterial).opacity = blush;
    }
    ring.rotation.z += dt * 0.35;
    ring.material.opacity = 0.45 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.35));

    // Text float
    // 同频轻浮动：保证三行相对间距恒定，不会“飘着飘着叠在一起”
    const textBob = Math.sin(t * 0.95) * (isMobile ? 0.022 : 0.03);
    titleSprite.position.y = layoutTitleY + textBob;
    wishSprite.position.y = layoutWishY + textBob;
    subSprite.position.y = layoutSubY + textBob;

    // Stars slow drift
    stars.rotation.y += dt * 0.02;
    stars.rotation.x = Math.sin(t * 0.05) * 0.03;

    confetti.update(dt, t);

    rockets.update(dt);
    phraseRing.update(camera, t);

    // 自动放烟花功能已禁用
    // autoTimer -= dt;
    // if (autoTimer <= 0) {
    //   autoTimer = rand(0.75, 1.35);
    //   spawnAuto();
    // }
    fireworks.update(dt);

    // Floating notes - 在固定区域内竖直慢慢往上飘
    for (let i = floatingNotes.length - 1; i >= 0; i--) {
      const n = floatingNotes[i];
      n.age += dt;
      const tt = clamp(n.age / n.duration, 0, 1);

      // 竖直慢慢往上飘
      n.worldPos.y += n.velocityY * dt;

      // 限制在区域内：到达顶部就停止上升
      if (n.worldPos.y > NOTE_ZONE_MAX_Y) {
        n.worldPos.y = NOTE_ZONE_MAX_Y;
        n.velocityY = 0;
      }

      // 更新精灵位置
      n.sprite.position.copy(n.worldPos);

      // 计算在区域内的位置比例（用于淡出）
      const zoneProgress =
        (n.worldPos.y - NOTE_ZONE_MIN_Y) / (NOTE_ZONE_MAX_Y - NOTE_ZONE_MIN_Y);

      // 淡入淡出：快速淡入，接近顶部时开始淡出
      const fadeIn = smoothstep(0.0, 0.1, tt);
      const fadeOutTime = 1.0 - smoothstep(0.7, 1.0, tt);
      const fadeOutZone = 1.0 - smoothstep(0.7, 1.0, zoneProgress); // 接近顶部淡出
      (n.sprite.material as THREE.SpriteMaterial).opacity =
        fadeIn * Math.min(fadeOutTime, fadeOutZone) * 0.9;

      // 入场动画
      const pop = 0.9 + 0.15 * easeOutCubic(Math.min(1, tt * 3.0));
      const shrink = tt > 0.8 ? 1.0 - ((tt - 0.8) / 0.2) * 0.3 : 1.0;
      n.sprite.scale.copy(n.baseScale).multiplyScalar(pop * shrink);

      // 时间到或者到达顶部后一段时间就消失
      const shouldRemove = tt >= 1 || (zoneProgress >= 0.95 && n.age > 1.5);
      if (shouldRemove) {
        usedSlots.delete(n.slot); // 释放槽位
        scene.remove(n.sprite);
        const mat = n.sprite.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
        floatingNotes.splice(i, 1);
      }
    }

    // Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      const tt = clamp(r.age / r.duration, 0, 1);
      const s = lerp(0.25, 2.25, easeOutCubic(tt));
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1.0 - tt) * 0.55;
      r.mesh.rotation.z += dt * 1.2;

      if (tt >= 1) {
        scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        ripples.splice(i, 1);
      }
    }

    // ======== 场景切换动画 ========
    if (scenePhase === "transition") {
      transitionProgress += dt * 0.5; // 约2秒完成过渡
      const p = smoothstep(0, 1, Math.min(transitionProgress, 1));

      // 保存初始摄像机位置（只在开始时记录）
      if (transitionProgress < dt * 2) {
        (camera as any).__transitionStartPos = camera.position.clone();
        (camera as any).__transitionStartLookAt = new THREE.Vector3(0, 1.1, 0);
      }

      const startPos =
        (camera as any).__transitionStartPos || camera.position.clone();

      // 目标位置：先向上飞，再向前靠近新场景中心
      const phase1End = 0.5; // 前半段向上飞

      let targetPos: THREE.Vector3;
      let targetLookAt: THREE.Vector3;

      if (p < phase1End) {
        // 阶段1：向上飞升，穿过云层的感觉
        const p1 = p / phase1End;
        const smoothP1 = smoothstep(0, 1, p1);
        targetPos = new THREE.Vector3(
          lerp(startPos.x, 0, smoothP1 * 0.5),
          lerp(startPos.y, 15, smoothP1),
          lerp(startPos.z, startPos.z + 5, smoothP1)
        );
        targetLookAt = new THREE.Vector3(0, lerp(1.1, 8, smoothP1), 0);
      } else {
        // 阶段2：向前俯冲进入新场景
        const p2 = (p - phase1End) / (1 - phase1End);
        const smoothP2 = smoothstep(0, 1, p2);
        targetPos = new THREE.Vector3(
          lerp(0, 0, smoothP2),
          lerp(15, 3.5, smoothP2),
          lerp(startPos.z + 5, 8, smoothP2)
        );
        targetLookAt = new THREE.Vector3(0, lerp(8, 2.5, smoothP2), 0);
      }

      // 平滑插值摄像机位置
      camera.position.lerp(targetPos, 0.08);
      const currentLookAt = new THREE.Vector3();
      camera.getWorldDirection(currentLookAt);
      camera.lookAt(targetLookAt);

      // 淡出旧场景元素
      const fadeOut = 1 - smoothstep(0, 0.4, p);
      (titleSprite.material as THREE.SpriteMaterial).opacity = fadeOut;
      (wishSprite.material as THREE.SpriteMaterial).opacity = fadeOut;
      (subSprite.material as THREE.SpriteMaterial).opacity = fadeOut;
      motif.scale.setScalar(layoutMotifScale * fadeOut);
      ring.material.opacity = 0.5 * fadeOut;

      // 更新 HTML overlay
      const titleEl = document.querySelector<HTMLDivElement>("#title");
      const subtitleEl = document.querySelector<HTMLDivElement>("#subtitle");
      if (titleEl) titleEl.style.opacity = String(fadeOut);
      if (subtitleEl) subtitleEl.style.opacity = String(fadeOut);

      // 过渡完成，进入庆祝阶段
      if (transitionProgress >= 1) {
        scenePhase = "celebration";
        celebrationStartTime = t;
        celebrationFireworkTimer = 0;

        // 设置摄像机到最终位置 - 正对文字
        camera.position.set(0, 2.2, 6.5);
        camera.lookAt(0, 2.0, 0);
        controls.setAutoSpin(false);

        // 隐藏旧元素
        motif.visible = false;
        ring.visible = false;
        titleSprite.visible = false;
        wishSprite.visible = false;
        subSprite.visible = false;
        phraseRing.object3d().visible = false;

        // 清除所有浮动祝福语
        for (const n of floatingNotes) {
          scene.remove(n.sprite);
          const mat = n.sprite.material as THREE.SpriteMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
        floatingNotes.length = 0;
        usedSlots.clear();

        // ===== 创建丰富的3D新场景 =====

        // 显示返回按钮
        if (btnBack) {
          btnBack.classList.add("visible");
        }

        // 隐藏 HTML overlay
        if (titleEl) titleEl.style.display = "none";
        if (subtitleEl) subtitleEl.style.display = "none";

        // 增强灯光
        const celebLight1 = new THREE.PointLight(
          new THREE.Color("#ff6fb7"),
          2,
          15
        );
        celebLight1.position.set(-3, 3, 2);
        scene.add(celebLight1);
        celebrationObjects.push(celebLight1);

        const celebLight2 = new THREE.PointLight(
          new THREE.Color("#77d6ff"),
          2,
          15
        );
        celebLight2.position.set(3, 3, 2);
        scene.add(celebLight2);
        celebrationObjects.push(celebLight2);

        const celebLight3 = new THREE.PointLight(
          new THREE.Color("#ffd6a6"),
          1.5,
          12
        );
        celebLight3.position.set(0, 4, 3);
        scene.add(celebLight3);
        celebrationObjects.push(celebLight3);

        // ===== 3D装饰物组 =====
        const decorGroup = new THREE.Group();
        scene.add(decorGroup);
        celebrationObjects.push(decorGroup);
        (window as any).__decorGroup = decorGroup;

        // 左侧：3D星星群
        for (let i = 0; i < 5; i++) {
          const star = createCelebStar(
            0.15 + rand(0, 0.1),
            new THREE.Color("#ffd6a6")
          );
          star.position.set(
            -3 - rand(0, 1.5),
            1.5 + i * 0.6 + rand(-0.2, 0.2),
            rand(-0.5, 0.5)
          );
          star.rotation.set(
            rand(0, Math.PI),
            rand(0, Math.PI),
            rand(0, Math.PI)
          );
          decorGroup.add(star);
        }

        // 右侧：3D星星群
        for (let i = 0; i < 5; i++) {
          const star = createCelebStar(
            0.15 + rand(0, 0.1),
            new THREE.Color("#a9e8ff")
          );
          star.position.set(
            3 + rand(0, 1.5),
            1.5 + i * 0.6 + rand(-0.2, 0.2),
            rand(-0.5, 0.5)
          );
          star.rotation.set(
            rand(0, Math.PI),
            rand(0, Math.PI),
            rand(0, Math.PI)
          );
          decorGroup.add(star);
        }

        // 3D心形装饰
        const heart1 = createCelebHeart(0.25, new THREE.Color("#ff6fb7"));
        heart1.position.set(-2.5, 3.2, 0.3);
        heart1.rotation.z = 0.2;
        decorGroup.add(heart1);

        const heart2 = createCelebHeart(0.18, new THREE.Color("#ff4fb1"));
        heart2.position.set(2.8, 2.8, 0.2);
        heart2.rotation.z = -0.15;
        decorGroup.add(heart2);

        const heart3 = createCelebHeart(0.12, new THREE.Color("#ffd6f2"));
        heart3.position.set(-1.8, 0.6, 0.4);
        heart3.rotation.z = 0.3;
        decorGroup.add(heart3);

        // 3D钻石/宝石装饰
        const gem1 = createCelebGem(0.12, new THREE.Color("#77d6ff"));
        gem1.position.set(2.2, 3.5, 0.5);
        decorGroup.add(gem1);

        const gem2 = createCelebGem(0.1, new THREE.Color("#cbbcff"));
        gem2.position.set(-2.0, 2.5, 0.3);
        decorGroup.add(gem2);

        const gem3 = createCelebGem(0.08, new THREE.Color("#b7ffd6"));
        gem3.position.set(1.5, 0.8, 0.4);
        decorGroup.add(gem3);

        // 中心发光托勒斯环
        const torusRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.8, 0.03, 16, 100),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color("#ff6fb7"),
            emissive: new THREE.Color("#ff6fb7"),
            emissiveIntensity: 0.8,
            metalness: 0.5,
            roughness: 0.3,
          })
        );
        torusRing.position.set(0, 1.8, -0.3);
        torusRing.rotation.x = Math.PI * 0.5;
        decorGroup.add(torusRing);
        (window as any).__torusRing = torusRing;

        // 第二个环
        const torusRing2 = new THREE.Mesh(
          new THREE.TorusGeometry(2.2, 0.02, 16, 100),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color("#77d6ff"),
            emissive: new THREE.Color("#77d6ff"),
            emissiveIntensity: 0.6,
            metalness: 0.5,
            roughness: 0.3,
          })
        );
        torusRing2.position.set(0, 1.8, -0.3);
        torusRing2.rotation.x = Math.PI * 0.5;
        decorGroup.add(torusRing2);
        (window as any).__torusRing2 = torusRing2;

        // 主标题 - 更大更清晰
        newYearSprite = createCelebrationText("2026 元旦快乐", {
          fontSize: isMobile ? 80 : 100,
          color: "#ffffff",
          strokeColor: "#ff6fb7",
          glowColor: "rgba(255, 111, 183, 0.6)",
          worldHeight: isMobile ? 1.0 : 1.3,
        });
        newYearSprite.position.set(0, 2.8, 0);
        (newYearSprite.material as THREE.SpriteMaterial).opacity = 0;
        scene.add(newYearSprite);

        // 副标题
        wishSprite2 = createCelebrationText("新的一年 愿你万事胜意", {
          fontSize: isMobile ? 48 : 60,
          color: "#ffffff",
          strokeColor: "#cbbcff",
          glowColor: "rgba(203, 188, 255, 0.5)",
          worldHeight: isMobile ? 0.7 : 0.9,
        });
        wishSprite2.position.set(0, 1.8, 0);
        (wishSprite2.material as THREE.SpriteMaterial).opacity = 0;
        scene.add(wishSprite2);

        // 第三行
        wishSprite3 = createCelebrationText("愿你被世界温柔以待", {
          fontSize: isMobile ? 42 : 52,
          color: "#ffffff",
          strokeColor: "#77d6ff",
          glowColor: "rgba(119, 214, 255, 0.5)",
          worldHeight: isMobile ? 0.6 : 0.75,
        });
        wishSprite3.position.set(0, 0.9, 0);
        (wishSprite3.material as THREE.SpriteMaterial).opacity = 0;
        scene.add(wishSprite3);

        // 场景氛围
        scene.fog = new THREE.Fog(new THREE.Color("#030308"), 8.0, 30.0);
        renderer.setClearColor(new THREE.Color("#030308"), 1);

        // ===== 底部3D浪漫花开效果 =====
        const flowersGroup = new THREE.Group();
        flowersGroup.position.set(0, -0.5, 0);
        scene.add(flowersGroup);
        celebrationObjects.push(flowersGroup);
        (window as any).__flowersGroup = flowersGroup;

        // 创建多朵花，分布在底部
        const flowerColors = [
          {
            petal: new THREE.Color("#ff6fb7"),
            center: new THREE.Color("#ffd6a6"),
          },
          {
            petal: new THREE.Color("#ff4fb1"),
            center: new THREE.Color("#ffb6c1"),
          },
          {
            petal: new THREE.Color("#ffd6f2"),
            center: new THREE.Color("#ffd6a6"),
          },
          {
            petal: new THREE.Color("#cbbcff"),
            center: new THREE.Color("#ffffff"),
          },
          {
            petal: new THREE.Color("#a9e8ff"),
            center: new THREE.Color("#ffd6a6"),
          },
        ];

        // 中央大花
        const mainFlower = create3DFlower(
          0.5,
          flowerColors[0].petal,
          flowerColors[0].center
        );
        mainFlower.position.set(0, 0, 0.5);
        mainFlower.rotation.x = -Math.PI * 0.3;
        mainFlower.scale.setScalar(0.01); // 开始时很小
        flowersGroup.add(mainFlower);

        // 左右两侧的花
        for (let i = 0; i < 4; i++) {
          const colorIdx = (i + 1) % flowerColors.length;
          const flower = create3DFlower(
            0.3 + rand(0, 0.15),
            flowerColors[colorIdx].petal,
            flowerColors[colorIdx].center
          );
          const side = i % 2 === 0 ? -1 : 1;
          const xOffset = (Math.floor(i / 2) + 1) * 1.2;
          flower.position.set(
            side * xOffset + rand(-0.2, 0.2),
            rand(-0.3, 0.2),
            rand(0.3, 0.8)
          );
          flower.rotation.x = -Math.PI * 0.25 + rand(-0.1, 0.1);
          flower.rotation.z = rand(-0.2, 0.2);
          flower.scale.setScalar(0.01);
          flowersGroup.add(flower);
        }

        // 更多小花点缀
        for (let i = 0; i < 6; i++) {
          const colorIdx = randInt(0, flowerColors.length - 1);
          const flower = create3DFlower(
            0.15 + rand(0, 0.1),
            flowerColors[colorIdx].petal,
            flowerColors[colorIdx].center
          );
          flower.position.set(rand(-3.5, 3.5), rand(-0.5, 0), rand(0, 0.6));
          flower.rotation.x = -Math.PI * 0.2 + rand(-0.15, 0.15);
          flower.rotation.z = rand(-0.3, 0.3);
          flower.scale.setScalar(0.01);
          flowersGroup.add(flower);
        }

        // 立即放一大波烟花庆祝（收紧范围确保在屏幕内）
        for (let i = 0; i < 15; i++) {
          setTimeout(() => {
            const angle = (i / 15) * Math.PI * 2;
            const radius = rand(1.5, 3);
            const origin = new THREE.Vector3(
              Math.cos(angle) * radius,
              rand(2.5, 4),
              Math.sin(angle) * radius * 0.4
            );
            rockets.launch(
              new THREE.Vector3(origin.x, 0, origin.z),
              rand(1.0, 1.4),
              chooseFireworkPattern(true),
              true
            );
          }, i * 120);
        }
      }
    }

    // ======== 庆祝阶段动画 ========
    if (scenePhase === "celebration") {
      const celebTime = t - celebrationStartTime;

      // 摄像机：稳定正对，轻微呼吸感
      const targetY = 1.8 + Math.sin(celebTime * 0.35) * 0.08;
      const targetZ = 5.0 + Math.sin(celebTime * 0.25) * 0.15;

      camera.position.x = lerp(camera.position.x, 0, 0.04);
      camera.position.y = lerp(camera.position.y, targetY, 0.04);
      camera.position.z = lerp(camera.position.z, targetZ, 0.04);
      camera.lookAt(0, 1.6, 0);

      // 3D装饰物动画
      const decorGroup = (window as any).__decorGroup as
        | THREE.Group
        | undefined;
      const torusRing = (window as any).__torusRing as THREE.Mesh | undefined;
      const torusRing2 = (window as any).__torusRing2 as THREE.Mesh | undefined;

      if (decorGroup) {
        decorGroup.children.forEach((child, i) => {
          if (
            child instanceof THREE.Mesh &&
            child !== torusRing &&
            child !== torusRing2
          ) {
            child.rotation.y += dt * (0.4 + i * 0.03);
            child.rotation.x += dt * 0.15;
          }
        });
      }

      if (torusRing) {
        torusRing.rotation.z = celebTime * 0.25;
        const pulse = 1 + Math.sin(celebTime * 1.8) * 0.03;
        torusRing.scale.setScalar(pulse);
      }
      if (torusRing2) {
        torusRing2.rotation.z = -celebTime * 0.18;
        const pulse = 1 + Math.sin(celebTime * 1.4 + 1) * 0.025;
        torusRing2.scale.setScalar(pulse);
      }

      // 花朵绽放动画
      const flowersGroup = (window as any).__flowersGroup as
        | THREE.Group
        | undefined;
      if (flowersGroup) {
        flowersGroup.children.forEach((flower, i) => {
          // 依次绽放动画
          const bloomDelay = 0.3 + i * 0.15;
          const bloomDuration = 1.2;
          const bloomProgress = smoothstep(
            0,
            1,
            (celebTime - bloomDelay) / bloomDuration
          );

          // 从小变大（绽放效果）
          const targetScale = i === 0 ? 1.0 : 0.6 + (i % 3) * 0.15;
          flower.scale.setScalar(bloomProgress * targetScale);

          // 轻微旋转
          flower.rotation.z += dt * 0.1 * (i % 2 === 0 ? 1 : -1);

          // 轻微浮动
          flower.position.y += Math.sin(celebTime * 1.2 + i * 0.7) * 0.0008;
        });
      }

      // 主标题动画
      if (newYearSprite) {
        const entryDelay = 0.1;
        const entryDuration = 0.6;
        const entryProgress = smoothstep(
          0,
          1,
          (celebTime - entryDelay) / entryDuration
        );
        const startY = 3.8;
        const endY = 2.8;
        newYearSprite.position.y =
          lerp(startY, endY, entryProgress) + Math.sin(celebTime * 0.8) * 0.01;
        (newYearSprite.material as THREE.SpriteMaterial).opacity =
          entryProgress;
      }

      // 第二行祝福
      if (wishSprite2) {
        const entryDelay = 0.4;
        const entryDuration = 0.5;
        const entryProgress = smoothstep(
          0,
          1,
          (celebTime - entryDelay) / entryDuration
        );
        const startY = 2.4;
        const endY = 1.8;
        wishSprite2.position.y =
          lerp(startY, endY, entryProgress) +
          Math.sin(celebTime * 0.7 + 1) * 0.008;
        (wishSprite2.material as THREE.SpriteMaterial).opacity = entryProgress;
      }

      // 第三行祝福
      if (wishSprite3) {
        const entryDelay = 0.7;
        const entryDuration = 0.5;
        const entryProgress = smoothstep(
          0,
          1,
          (celebTime - entryDelay) / entryDuration
        );
        const startY = 1.4;
        const endY = 0.9;
        wishSprite3.position.y =
          lerp(startY, endY, entryProgress) +
          Math.sin(celebTime * 0.6 + 2) * 0.008;
        (wishSprite3.material as THREE.SpriteMaterial).opacity =
          entryProgress * 0.95;
      }

      // 持续放丰富烟花
      celebrationFireworkTimer -= dt;
      if (celebrationFireworkTimer <= 0) {
        celebrationFireworkTimer = rand(0.15, 0.35); // 更频繁

        // 多种发射位置模式（收紧范围，确保在屏幕内绽放）
        const pattern = randInt(0, 3);
        let origin: THREE.Vector3;

        if (pattern === 0) {
          // 左右两侧
          const side = Math.random() > 0.5 ? 1 : -1;
          origin = new THREE.Vector3(
            side * rand(1.5, 3),
            rand(2.5, 4),
            rand(-1, 1)
          );
        } else if (pattern === 1) {
          // 环形分布
          const angle = Math.random() * Math.PI * 2;
          const radius = rand(1.5, 2.5);
          origin = new THREE.Vector3(
            Math.cos(angle) * radius,
            rand(2.5, 4),
            Math.sin(angle) * radius * 0.4
          );
        } else if (pattern === 2) {
          // 斜角发射
          origin = new THREE.Vector3(
            rand(-2.5, 2.5),
            rand(2, 3.5),
            rand(-1.5, 0)
          );
        } else {
          // 远处高空
          origin = new THREE.Vector3(rand(-2, 2), rand(3, 4.5), rand(-2, -0.5));
        }

        rockets.launch(
          new THREE.Vector3(origin.x, 0, origin.z),
          rand(0.8, 1.3),
          chooseFireworkPattern(true),
          true
        );

        // 25%概率同时发射第二发
        if (Math.random() < 0.25) {
          const side2 = Math.random() > 0.5 ? 1 : -1;
          setTimeout(() => {
            rockets.launch(
              new THREE.Vector3(side2 * rand(1.2, 2.5), 0, rand(-1, 1)),
              rand(0.9, 1.2),
              chooseFireworkPattern(true),
              true
            );
          }, rand(50, 150));
        }

        // 15%概率三连发
        if (Math.random() < 0.15) {
          for (let burst = 0; burst < 3; burst++) {
            setTimeout(() => {
              const angle = (burst / 3) * Math.PI * 2 + Math.random() * 0.5;
              rockets.launch(
                new THREE.Vector3(
                  Math.cos(angle) * 1.8,
                  0,
                  Math.sin(angle) * 1.2
                ),
                rand(0.8, 1.1),
                chooseFireworkPattern(true),
                true
              );
            }, burst * 100);
          }
        }
      }
    }

    renderer.render(scene, camera);
  }
  frame();
}

main();
