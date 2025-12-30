import * as THREE from 'three';

// 慢热风格：不直接点明“喜欢”，你可以改成她的昵称/名字或留空
const GIRL_NAME = '她';
const YEAR_FROM = 2025;
const YEAR_TO = 2026;

// 每次“你主动放的烟花”绽放时，会浮现一句小夸夸/小祝福（更有陪伴感）
const LOVE_NOTES = [
    '愿你新的一年，被温柔稳稳接住',
    '你值得所有偏爱与例外',
    '把闪闪发光当作日常',
    '愿你心里有光，脚下有路',
    '愿你永远可爱，也永远被爱',
    '把烦恼交给风，把快乐留给你',
    '愿你所求皆如愿，所行皆坦途',
    '愿你被世界温柔以待',
    '愿你自信、自由、且丰盛',
    '你很好，真的很好',
    '愿你今晚做个甜甜的梦',
    '新年快乐，愿你平安喜乐',
];
const MAX_FLOATING_NOTES = 8;

// 背景音乐（可填入联网音频直链，比如 mp3/m4a/ogg）。留空则不启用。
// 注意：移动端浏览器通常要求“用户手势”才能开始播放，这里会在第一次成功“双击放烟花”时尝试播放。
const MUSIC_URL = '';
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

type FireworkPattern = 'sphere' | 'heart' | 'ring';

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
    audio.crossOrigin = 'anonymous';
    audio.src = trimmed;
    audio.preload = 'auto';
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
        '#ff6fb7',
        '#ff4fb1',
        '#cbbcff',
        '#77d6ff',
        '#ffd6a6',
        '#a9e8ff',
        '#b7ffd6',
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
    if (pattern === 'ring') {
        // 环形：主要在水平面，带少量上下厚度
        const theta = rand(0, Math.PI * 2);
        const y = rand(-0.18, 0.18);
        return new THREE.Vector3(
            Math.cos(theta),
            y,
            Math.sin(theta)
        ).normalize();
    }

    if (pattern === 'heart') {
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
        if (r < 0.32) return 'heart';
        if (r < 0.46) return 'ring';
        return 'sphere';
    }
    if (r < 0.16) return 'heart';
    if (r < 0.32) return 'ring';
    return 'sphere';
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
        'ontouchstart' in window ||
        (navigator.maxTouchPoints ?? 0) > 0 ||
        // @ts-expect-error - older webkit.
        (navigator.msMaxTouchPoints ?? 0) > 0
    );
}

function setupOverlay(): void {
    const title = document.querySelector<HTMLDivElement>('#title');
    const subtitle = document.querySelector<HTMLDivElement>('#subtitle');
    const hint = document.querySelector<HTMLDivElement>('#hint');

    if (title) title.textContent = `${YEAR_TO} 新年快乐`;
    if (subtitle)
        subtitle.textContent = `写给${GIRL_NAME}：愿新岁不疾不徐，心安常伴。`;
    if (hint)
        // 有音乐时提示一下（不额外加按钮，靠双击手势触发播放）
        hint.textContent = isTouchDevice()
            ? MUSIC_URL.trim().length > 0
                ? '拖动旋转视角 · 拖拽中心图案 · 双指缩放 · 双击放烟花（小祝福·开启音乐）'
                : '拖动旋转视角 · 拖拽中心图案 · 双指缩放 · 双击放烟花（小祝福）'
            : MUSIC_URL.trim().length > 0
            ? '拖动旋转视角 · 拖拽中心图案 · 滚轮缩放 · 双击放烟花（小祝福·开启音乐）'
            : '拖动旋转视角 · 拖拽中心图案 · 滚轮缩放 · 双击放烟花（小祝福）';
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

        this.dom.addEventListener('pointerdown', this.onPointerDown, {
            passive: true,
        });
        window.addEventListener('pointermove', this.onPointerMove, {
            passive: true,
        });
        window.addEventListener('pointerup', this.onPointerUp, {
            passive: true,
        });
        window.addEventListener('pointercancel', this.onPointerUp, {
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
        this.dom.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
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
    const color = options?.color ?? 'rgba(255,255,255,0.95)';
    const glowColor = options?.glowColor ?? 'rgba(255, 110, 200, 0.85)';
    const maxWidth = options?.maxWidth ?? 1600;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');

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
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

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
    const color = options?.color ?? 'rgba(255,255,255,0.94)';
    const glowColor = options?.glowColor ?? 'rgba(140, 210, 255, 0.85)';
    const maxWidth = options?.maxWidth ?? 1400;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');

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
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

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
        color: new THREE.Color('#ff4fb1'),
        emissive: new THREE.Color('#ff2a9d'),
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

type CenterMotif = 'infinity' | 'heart' | 'gem' | 'star' | 'girl';

// 中间三维图案：想换造型就改这里
const CENTER_MOTIF: CenterMotif = 'girl';

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
        color: new THREE.Color('#ff4fb1'),
        emissive: new THREE.Color('#ff2a9d'),
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
        color: new THREE.Color('#ff4fb1'),
        emissive: new THREE.Color('#ff2a9d'),
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
        color: new THREE.Color('#ffd6f2'),
        emissive: new THREE.Color('#ff48b8'),
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
    head: THREE.Object3D;
    blushL: THREE.Mesh;
    blushR: THREE.Mesh;
};

function createShyGirlRig(): ShyGirlRig {
    const root = new THREE.Group();
    root.name = 'shy-girl';

    const skin = new THREE.MeshStandardMaterial({
        // 肤色提亮、减少粉色自发光：避免和腮红/粉色元素糊在一起
        color: new THREE.Color('#fff1e6'),
        emissive: new THREE.Color('#ffd6f2'),
        emissiveIntensity: 0.02,
        metalness: 0.0,
        roughness: 0.85,
    });

    // 非黑色描边：让脸部轮廓更清楚
    const faceOutlineMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ffd6a6'),
        emissive: new THREE.Color('#ffd6a6'),
        emissiveIntensity: 0.02,
        metalness: 0.0,
        roughness: 0.95,
        side: THREE.BackSide,
    });
    // 头发别太黑：否则会和深色背景糊在一起。这里复用现有的薰衣草色系。
    const hair = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#cbbcff'),
        emissive: new THREE.Color('#cbbcff'),
        emissiveIntensity: 0.03,
        metalness: 0.0,
        roughness: 0.9,
    });
    const sweater = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ffd6a6'),
        emissive: new THREE.Color('#ffd6a6'),
        emissiveIntensity: 0.05,
        metalness: 0.0,
        roughness: 0.85,
    });
    // 不使用黑色：用更丰富的莓果粉做下装，整体更“甜”
    const skirtMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ff4fb1'),
        emissive: new THREE.Color('#ff2a9d'),
        emissiveIntensity: 0.07,
        metalness: 0.02,
        roughness: 0.7,
    });
    const tightsMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#cbbcff'),
        emissive: new THREE.Color('#cbbcff'),
        emissiveIntensity: 0.03,
        metalness: 0.0,
        roughness: 0.9,
    });
    const eyeIrisMat = new THREE.MeshStandardMaterial({
        // 眼睛用“更浅的蓝”，避免与脸部粉紫混色
        color: new THREE.Color('#a9e8ff'),
        emissive: new THREE.Color('#a9e8ff'),
        emissiveIntensity: 0.05,
        metalness: 0.0,
        roughness: 0.45,
    });
    const pupilMat = new THREE.MeshStandardMaterial({
        // 瞳孔用“更深一点的蓝”，不再用粉色
        color: new THREE.Color('#77d6ff'),
        emissive: new THREE.Color('#77d6ff'),
        emissiveIntensity: 0.03,
        metalness: 0.0,
        roughness: 0.5,
    });
    const blushMat = new THREE.MeshBasicMaterial({
        // 腮红改为更暖的香槟桃色：脸部不再一片紫粉
        color: new THREE.Color('#ffd6a6'),
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
    });

    const eyeWhiteMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
    });

    const browMat = new THREE.MeshStandardMaterial({
        // 不用黑色：用暖焦糖色做眉毛，脸部层次更清晰
        color: new THREE.Color('#d8a17d'),
        emissive: new THREE.Color('#d8a17d'),
        emissiveIntensity: 0.01,
        metalness: 0.0,
        roughness: 0.6,
    });
    const glassesMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#a9e8ff'),
        emissive: new THREE.Color('#77d6ff'),
        emissiveIntensity: 0.2,
        metalness: 0.1,
        roughness: 0.25,
    });
    const lensMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#a9e8ff'),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
    });

    const girl = new THREE.Group();
    root.add(girl);

    // Body
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.36, 6, 12),
        sweater
    );
    body.position.set(0, 0.42, 0);
    girl.add(body);

    const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.28, 0.18, 20),
        skirtMat
    );
    skirt.position.set(0, 0.18, 0);
    girl.add(skirt);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.22, 14);
    const legL = new THREE.Mesh(legGeo, tightsMat);
    const legR = new THREE.Mesh(legGeo, tightsMat);
    legL.position.set(-0.11, 0.02, 0);
    legR.position.set(0.11, 0.02, 0);
    girl.add(legL, legR);

    // Arms (slightly inward = shy)
    const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 14);
    const armL = new THREE.Mesh(armGeo, sweater);
    const armR = new THREE.Mesh(armGeo, sweater);
    armL.position.set(-0.25, 0.52, 0.05);
    armR.position.set(0.25, 0.52, 0.05);
    armL.rotation.z = Math.PI * 0.18;
    armR.rotation.z = -Math.PI * 0.18;
    armL.rotation.x = -Math.PI * 0.06;
    armR.rotation.x = -Math.PI * 0.06;
    girl.add(armL, armR);

    // Head + hair
    const head = new THREE.Group();
    head.position.set(0, 0.98, 0);
    head.rotation.z = -Math.PI * 0.035;
    girl.add(head);

    const faceGeo = new THREE.SphereGeometry(0.34, 28, 22);
    const face = new THREE.Mesh(faceGeo, skin);
    face.scale.set(1, 1.04, 1);
    head.add(face);

    const faceOutline = new THREE.Mesh(faceGeo, faceOutlineMat);
    faceOutline.scale.copy(face.scale).multiplyScalar(1.035);
    head.add(faceOutline);

    const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(
            0.355,
            28,
            22,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.72
        ),
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

    // Overall vibe: slightly closer
    girl.rotation.x = Math.PI * 0.02;
    girl.position.set(0, 0.0, 0.18);
    girl.scale.setScalar(0.95);

    // 初始位置：保持与中心图案大致一致；具体会在 applyLayout() 里按屏幕再微调
    root.position.set(0, 1.12, 0);

    return { root, head, blushL, blushR };
}

function createCenterMotifObject(): {
    object: THREE.Object3D;
    shyGirl: ShyGirlRig | null;
} {
    if (CENTER_MOTIF === 'girl') {
        const shyGirl = createShyGirlRig();
        return { object: shyGirl.root, shyGirl };
    }
    if (CENTER_MOTIF === 'heart')
        return { object: createHeartMesh(), shyGirl: null };
    if (CENTER_MOTIF === 'gem')
        return { object: createGemMesh(), shyGirl: null };
    if (CENTER_MOTIF === 'star')
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
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
            'position',
            new THREE.BufferAttribute(this.positions, 3)
        );
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
            this.positions[idx + 0] +=
                (this.velocities[idx + 0] + swirl) * dtSeconds;
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
            this.points.geometry.getAttribute(
                'position'
            ) as THREE.BufferAttribute
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
                glowColor: 'rgba(130, 220, 255, 0.9)',
                color: 'rgba(255,255,255,0.92)',
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
            const twinkle =
                0.85 + 0.15 * Math.sin(timeSeconds * 1.6 + i * 1.37);
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
};

class Fireworks implements Disposable {
    private readonly bursts: FireworkBurst[] = [];
    private readonly scene: THREE.Scene;
    private readonly maxBursts: number;
    private readonly particlesPerBurst: number;

    constructor(
        scene: THREE.Scene,
        options?: { maxBursts?: number; particlesPerBurst?: number }
    ) {
        this.scene = scene;
        this.maxBursts = options?.maxBursts ?? 8;
        this.particlesPerBurst = options?.particlesPerBurst ?? 700;
    }

    spawn(
        origin: THREE.Vector3,
        intensity = 1.0,
        pattern: FireworkPattern = 'sphere'
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
        const color = new THREE.Color();
        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = origin.x;
            positions[i * 3 + 1] = origin.y;
            positions[i * 3 + 2] = origin.z;

            const dir = randomDirectionForPattern(pattern);
            const speed =
                pattern === 'heart'
                    ? rand(3.0, 5.2)
                    : pattern === 'ring'
                    ? rand(3.4, 5.6)
                    : rand(3.2, 6.0);

            const s = speed * intensity;
            velocities[i * 3 + 0] = dir.x * s;
            velocities[i * 3 + 1] = dir.y * s;
            velocities[i * 3 + 2] = dir.z * s;

            // 颜色：围绕柔和基色做轻微偏移
            color.copy(base);
            const hsl = { h: 0, s: 0, l: 0 };
            color.getHSL(hsl);
            hsl.h = (hsl.h + rand(-0.035, 0.035) + 1) % 1;
            hsl.s = clamp(hsl.s + rand(0.05, 0.18), 0.45, 0.92);
            hsl.l = clamp(hsl.l + rand(-0.04, 0.12), 0.55, 0.85);
            color.setHSL(hsl.h, hsl.s, hsl.l);
            colors[i * 3 + 0] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            seed[i] = Math.random();
            // 一部分粒子作为“星屑闪光”
            spark[i] = seed[i] > 0.72 ? 1.0 : 0.0;

            const baseLife =
                pattern === 'heart' ? rand(0.85, 1.05) : rand(0.75, 1.0);
            life[i] = baseLife;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
        );
        geometry.setAttribute(
            'aVelocity',
            new THREE.BufferAttribute(velocities, 3)
        );
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        geometry.setAttribute('aSpark', new THREE.BufferAttribute(spark, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: 86.0 },
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
					// uTime 由外部累加，aLife 用于细微随机差异
                    float t = uTime * (0.85 + 0.3 * aLife);
                    // 轻微空气阻力，让轨迹更“丝滑”
                    float k = 1.45;
                    float drag = (1.0 - exp(-k * t)) / k;
                    vec3 p = position + aVelocity * drag;
                    // 重力
                    p.y += -1.75 * t * t;

					vLife = clamp(1.0 - t / (1.25 + 0.8 * aLife), 0.0, 1.0);
					vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
					gl_Position = projectionMatrix * mvPosition;

                    float sparkSize = mix(1.0, 0.55, vSpark);
                    float lifeSize = 0.45 + 0.55 * pow(vLife, 0.65);
                    float size = uSize * (0.72 + 0.78 * aLife) * sparkSize * lifeSize;
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
                    // 柔和光斑
                    float core = exp(-d * 2.6);
                    // 星屑：带一点“十字尖”
                    float cross = exp(-abs(uv.x) * 4.5) * exp(-abs(uv.y) * 4.5);
                    float shape = mix(core, max(core, cross), vSpark);

                    float twinkle = 0.86 + 0.14 * sin(uTime * (18.0 + 12.0 * vSpark) + vSeed * 44.0);
                    float a = shape * pow(vLife, 0.9) * uOpacity * twinkle;
					vec3 c = vColor;
                    // 小幅提亮中心 + 星屑更亮
                    c += (1.0 - d) * (0.28 + 0.25 * vSpark);
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
            duration:
                pattern === 'heart' ? 1.95 : pattern === 'ring' ? 1.85 : 1.75,
        });
    }

    update(dtSeconds: number): void {
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const burst = this.bursts[i];
            burst.age += dtSeconds;
            const material = burst.points.material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = burst.age;
            material.uniforms.uOpacity.value = clamp(
                1.0 - burst.age / burst.duration,
                0,
                1
            );

            if (burst.age >= burst.duration) {
                this.removeBurst(burst);
                this.bursts.splice(i, 1);
            }
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
    }
}

type Rocket = {
    sprite: THREE.Sprite;
    trail: THREE.Line;
    trailPositions: Float32Array;
    trailColors: Float32Array;
    age: number;
    duration: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    intensity: number;
    pattern: FireworkPattern;
    userTriggered: boolean;
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
    }

    launch(
        targetXZ: THREE.Vector3,
        intensity = 1.0,
        pattern: FireworkPattern = 'sphere',
        userTriggered = false
    ): void {
        if (this.rockets.length >= this.maxRockets) {
            const old = this.rockets.shift();
            if (old) this.remove(old);
        }

        const start = new THREE.Vector3(targetXZ.x, -0.8, targetXZ.z);
        const end = new THREE.Vector3(
            targetXZ.x + rand(-0.25, 0.25),
            rand(2.4, 4.6),
            targetXZ.z + rand(-0.25, 0.25)
        );

        const spriteMat = new THREE.SpriteMaterial({
            color: new THREE.Color('#ffd6f2'),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.22, 0.22, 1);
        sprite.position.copy(start);
        sprite.renderOrder = 50;

        const segs = 22;
        const trailPositions = new Float32Array((segs + 1) * 3);
        const trailColors = new Float32Array((segs + 1) * 3);
        for (let i = 0; i <= segs; i++) {
            trailPositions[i * 3 + 0] = start.x;
            trailPositions[i * 3 + 1] = start.y;
            trailPositions[i * 3 + 2] = start.z;

            // 初始给一条“香槟金 -> 薄荷蓝”的柔和彩尾（通过亮度衰减实现渐隐）
            const t = i / segs;
            const c0 = new THREE.Color('#ffd6a6');
            const c1 = new THREE.Color('#a9e8ff');
            const c = c0.clone().lerp(c1, t);
            const fade = Math.pow(1.0 - t, 1.7);
            trailColors[i * 3 + 0] = c.r * fade;
            trailColors[i * 3 + 1] = c.g * fade;
            trailColors[i * 3 + 2] = c.b * fade;
        }
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(trailPositions, 3)
        );
        trailGeo.setAttribute(
            'color',
            new THREE.BufferAttribute(trailColors, 3)
        );
        const trailMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
        });
        const trail = new THREE.Line(trailGeo, trailMat);
        trail.renderOrder = 40;

        this.scene.add(trail);
        this.scene.add(sprite);

        this.rockets.push({
            sprite,
            trail,
            trailPositions,
            trailColors,
            age: 0,
            duration: rand(0.75, 1.05),
            start,
            end,
            intensity,
            pattern,
            userTriggered,
        });
    }

    update(dtSeconds: number): void {
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const r = this.rockets[i];
            r.age += dtSeconds;
            const t = easeOutCubic(r.age / r.duration);

            const p = new THREE.Vector3().lerpVectors(r.start, r.end, t);
            // 轻微摆动更“活”
            p.x += Math.sin(r.age * 18.0) * 0.03;
            p.z += Math.cos(r.age * 17.0) * 0.03;
            r.sprite.position.copy(p);

            // trail：把旧点往后推，头部写入当前位置
            const pos = r.trail.geometry.getAttribute(
                'position'
            ) as THREE.BufferAttribute;
            for (let k = (pos.count - 1) * 3; k >= 3; k--) {
                (pos.array as Float32Array)[k + 0] = (
                    pos.array as Float32Array
                )[k - 3 + 0];
                (pos.array as Float32Array)[k + 1] = (
                    pos.array as Float32Array
                )[k - 3 + 1];
                (pos.array as Float32Array)[k + 2] = (
                    pos.array as Float32Array
                )[k - 3 + 2];
            }
            (pos.array as Float32Array)[0] = p.x;
            (pos.array as Float32Array)[1] = p.y;
            (pos.array as Float32Array)[2] = p.z;
            pos.needsUpdate = true;

            // 彩尾亮度衰减（用颜色“变暗”模拟渐隐）
            const col = r.trail.geometry.getAttribute(
                'color'
            ) as THREE.BufferAttribute;
            const segs = col.count - 1;
            const c0 = new THREE.Color('#ffd6a6');
            const c1 = new THREE.Color('#a9e8ff');
            for (let vi = 0; vi <= segs; vi++) {
                const tt = vi / segs;
                const c = c0.clone().lerp(c1, tt);
                const fade =
                    Math.pow(1.0 - tt, 1.75) *
                    (0.6 + 0.4 * clamp(1.0 - r.age / r.duration, 0, 1));
                (col.array as Float32Array)[vi * 3 + 0] = c.r * fade;
                (col.array as Float32Array)[vi * 3 + 1] = c.g * fade;
                (col.array as Float32Array)[vi * 3 + 2] = c.b * fade;
            }
            col.needsUpdate = true;

            const fade = clamp(1.0 - r.age / r.duration, 0, 1);
            (r.sprite.material as THREE.SpriteMaterial).opacity =
                0.35 + 0.6 * fade;
            (r.trail.material as THREE.LineBasicMaterial).opacity =
                0.12 + 0.5 * fade;

            if (r.age >= r.duration) {
                // 顶点绽放
                this.onBurst?.(
                    r.end.clone(),
                    r.pattern,
                    r.intensity,
                    r.userTriggered
                );
                this.fireworks.spawn(r.end, r.intensity, r.pattern);
                this.remove(r);
                this.rockets.splice(i, 1);
            }
        }
    }

    private remove(r: Rocket): void {
        this.scene.remove(r.sprite);
        this.scene.remove(r.trail);
        r.sprite.material.dispose();
        r.trail.geometry.dispose();
        (r.trail.material as THREE.Material).dispose();
    }

    dispose(): void {
        for (const r of this.rockets) this.remove(r);
        this.rockets.length = 0;
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

    const bgm = createBackgroundMusic(MUSIC_URL);

    const viewport = getViewportSize();
    const isMobile =
        isTouchDevice() || Math.min(viewport.width, viewport.height) < 600;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color('#050512'), 6.0, 28.0);

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
        powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setSize(viewport.width, viewport.height);
    renderer.setClearColor(new THREE.Color('#050512'), 1);

    // 固定 canvas 在底层，避免遮挡 HTML overlay 字体
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.zIndex = '0';
    renderer.domElement.style.display = 'block';
    // 移动端：避免页面滚动/缩放手势干扰 3D 操作
    renderer.domElement.style.touchAction = 'none';
    (renderer.domElement.style as any).webkitTapHighlightColor = 'transparent';
    document.body.appendChild(renderer.domElement);

    const perf = new PerformanceScaler(renderer);
    const controls = new TouchOrbitControls(camera, renderer.domElement);
    controls.setTarget(new THREE.Vector3(0, 1.1, 0));

    // 交互增强：捏合/滚轮缩放会叠加在布局半径之上
    let userZoomOffset = 0;

    // Lights
    scene.add(new THREE.AmbientLight(new THREE.Color('#cbbcff'), 0.55));

    const key = new THREE.DirectionalLight(new THREE.Color('#ffd6f2'), 1.05);
    key.position.set(4, 6, 3);
    scene.add(key);

    const fill = new THREE.PointLight(new THREE.Color('#77d6ff'), 0.9, 40, 2);
    fill.position.set(-4, 2.5, -3);
    scene.add(fill);

    const glow = new THREE.PointLight(new THREE.Color('#ff48b8'), 1.35, 20, 2);
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
            motifEmissiveMats[i].emissiveIntensity =
                motifEmissiveBase[i] * mult;
        }
    }

    // Halo ring
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.65, 0.03, 16, 120),
        new THREE.MeshBasicMaterial({
            color: new THREE.Color('#a9e8ff'),
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
        glowColor: 'rgba(120, 210, 255, 0.9)',
    });
    titleSprite.position.set(0, 2.55, 0);
    scene.add(titleSprite);

    const wishSprite = createTextSprite(`愿你岁岁安澜`, {
        fontSize: 64,
        glowColor: 'rgba(255, 120, 210, 0.9)',
    });
    wishSprite.position.set(0, 2.0, 0);
    scene.add(wishSprite);

    const subSprite = createTextSprite('愿你温柔而笃定', {
        fontSize: 50,
        glowColor: 'rgba(255, 210, 120, 0.85)',
        color: 'rgba(255,255,255,0.9)',
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
    type FloatingNote = {
        sprite: THREE.Sprite;
        ndcY: number;
        targetNdcY: number;
        ndcVelY: number;
        ndcZ: number;
        age: number;
        duration: number;
        baseScale: THREE.Vector3;
    };
    const floatingNotes: FloatingNote[] = [];

    // 屏幕空间队列：固定 X，Y 只往上加（视觉上就是垂直往上）
    const NOTE_MARGIN = 0.08;
    // 让烟花文字稳定落在「中间祝福语上方」且不与上方标题重叠：动态计算 band
    let noteMinY = -0.06;
    let noteMaxY = 0.55;
    function updateNoteBand(): void {
        const wishY = wishSprite.position.clone().project(camera).y;
        const titleY = titleSprite.position.clone().project(camera).y;

        // NDC: y 越大越靠上。让烟花文字处于 wish 上方、title 下方。
        const padding = isMobile ? 0.14 : 0.12;
        let minY = wishY + padding;
        let maxY = titleY - padding;

        // 兜底：如果空间太窄，至少保证在 wish 上方的一小段区域
        if (!Number.isFinite(minY)) minY = -0.06;
        if (!Number.isFinite(maxY)) maxY = 0.55;
        if (maxY - minY < 0.18) {
            minY = wishY + 0.06;
            maxY = Math.min(0.78, minY + 0.28);
        }

        noteMinY = clamp(minY, -0.65, 0.72);
        noteMaxY = clamp(maxY, noteMinY + 0.12, 0.85);
    }

    function getNoteNdcZ(): number {
        // 取一个稳定的“场景中间深度”，保证 unproject 不会跑偏
        const p = new THREE.Vector3(0, 1.6, 0).project(camera);
        return Number.isFinite(p.z) ? p.z : 0.2;
    }

    function applyNoteNdc(
        sprite: THREE.Sprite,
        ndcY: number,
        ndcZ: number
    ): void {
        const y = ndcY;
        const z = Number.isFinite(ndcZ) ? ndcZ : 0.2;
        sprite.position.copy(new THREE.Vector3(0, y, z).unproject(camera));
    }

    function shiftExistingNotesUp(ndcDeltaY: number): void {
        for (const n of floatingNotes) {
            n.targetNdcY += ndcDeltaY;
        }
    }

    function spawnFloatingNote(world: THREE.Vector3, text: string): void {
        if (floatingNotes.length >= MAX_FLOATING_NOTES) {
            const old = floatingNotes.shift();
            if (old) {
                scene.remove(old.sprite);
                const mat = old.sprite.material as THREE.SpriteMaterial;
                mat.map?.dispose();
                mat.dispose();
            }
        }

        const sprite = createTextSprite(text, {
            fontSize: isMobile ? 56 : 64,
            glowColor: 'rgba(255, 110, 200, 0.85)',
            color: 'rgba(255,255,255,0.96)',
            maxWidth: isMobile ? 980 : 1200,
        });
        sprite.position
            .copy(world)
            .add(
                new THREE.Vector3(
                    rand(-0.25, 0.25),
                    rand(0.35, 0.55),
                    rand(-0.25, 0.25)
                )
            );
        sprite.renderOrder = 1100;

        const mat = sprite.material as THREE.SpriteMaterial;
        mat.opacity = 0.0;

        // 浮动祝福：手机端更小一点，避免挡画面
        const baseScale = sprite.scale
            .clone()
            .multiplyScalar(isMobile ? 0.4 : 0.6);
        sprite.scale.copy(baseScale);

        // 队列排队：旧的往上挪一点，新的一条从固定位置出现（居中、只往上飘）
        const queueGap = isMobile ? 0.13 : 0.11; // NDC gap
        shiftExistingNotesUp(queueGap);

        const ndcZ = getNoteNdcZ();
        // 固定在「中间祝福语」上方
        const spawnNdcY = noteMinY + (isMobile ? 0.05 : 0.04);
        applyNoteNdc(sprite, spawnNdcY, ndcZ);

        scene.add(sprite);

        floatingNotes.push({
            sprite,
            ndcY: spawnNdcY,
            targetNdcY: spawnNdcY,
            // 视觉垂直上飘：用 NDC 的 y 速度
            ndcVelY: rand(0.07, 0.1),
            ndcZ,
            age: 0,
            // 停留更久一些，不要太快消失
            duration: rand(3.8, 4.8),
            baseScale,
        });
    }

    // Rockets: lift-off -> burst
    const rockets = new FireworkRockets(
        scene,
        fireworks,
        isMobile ? 5 : 7,
        (world, _pattern, _intensity, userTriggered) => {
            if (!userTriggered) return;

            // 轻微震动（若系统允许），增强“触感”但不打扰
            if (isMobile && 'vibrate' in navigator) {
                try {
                    (navigator as any).vibrate?.(14);
                } catch {
                    // ignore
                }
            }

            spawnFloatingNote(world, pickOne(LOVE_NOTES));
        }
    );

    // Angle phrases: rotate to reveal different lines
    const phraseRing = new AnglePhraseRing({
        phrases: ['愿你岁岁安澜', '灯火可亲', '风起有归处', '心安即良辰'],
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
            color: new THREE.Color('#a9e8ff'),
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
            has ? clamp(hit.x, -5, 5) : rand(-2, 2),
            rand(2.0, 4.2),
            has ? clamp(hit.z, -5, 5) : rand(-2, 2)
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
        'pointerdown',
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
        'pointerdown',
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
        'pointermove',
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
        'pointerup',
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
                dx * dx + dy * dy <=
                tapMoveThreshold * 2 * (tapMoveThreshold * 2);
            const fast = ms - doubleTap.lastMs <= doubleTapMaxDelayMs;

            if (doubleTap.lastMs > 0 && fast && near) {
                doubleTap.lastMs = 0;

                // 双击放烟花时尝试开启音乐（用户手势）
                bgm.start();
                spawnAtScreen(e.clientX, e.clientY);
                return;
            }

            doubleTap.lastMs = ms;
            doubleTap.lastX = e.clientX;
            doubleTap.lastY = e.clientY;
        },
        { passive: true }
    );
    window.addEventListener(
        'pointercancel',
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
            'wheel',
            (e) => {
                // deltaY > 0 通常是“向下滚” => 拉远
                userZoomOffset = clamp(
                    userZoomOffset + e.deltaY * 0.0022,
                    -2.4,
                    2.2
                );
                applyLayout();
            },
            { passive: true }
        );
    }

    // Periodic fireworks
    let autoTimer = 0;
    function spawnAuto(): void {
        const origin = new THREE.Vector3(
            rand(-3.8, 3.8),
            rand(2.2, 4.4),
            rand(-3.2, 2.8)
        );
        rockets.launch(
            new THREE.Vector3(origin.x, 0, origin.z),
            rand(0.85, 1.15),
            chooseFireworkPattern(false),
            false
        );
    }
    for (let i = 0; i < 3; i++) spawnAuto();

    // Resize
    function onResize(): void {
        const size = getViewportSize();
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        renderer.setSize(size.width, size.height);
        applyLayout();
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, {
        passive: true,
    });

    // 初始布局
    applyLayout();

    // Pause when hidden
    let running = true;
    document.addEventListener('visibilitychange', () => {
        running = document.visibilityState === 'visible';
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

        // 如果当前中心图案是女孩：轻微点头 + 腮红呼吸
        if (shyGirl) {
            shyGirl.head.rotation.x = Math.sin(t * 0.85 + 1.1) * 0.04;
            shyGirl.head.rotation.y = Math.sin(t * 0.6 + 0.4) * 0.06;
            const blush = 0.16 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.25 + 0.2));
            (shyGirl.blushL.material as THREE.MeshBasicMaterial).opacity =
                blush;
            (shyGirl.blushR.material as THREE.MeshBasicMaterial).opacity =
                blush;
        }
        ring.rotation.z += dt * 0.35;
        ring.material.opacity = 0.45 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.35));

        // Text float
        // 同频轻浮动：保证三行相对间距恒定，不会“飘着飘着叠在一起”
        const textBob = Math.sin(t * 0.95) * (isMobile ? 0.022 : 0.03);
        titleSprite.position.y = layoutTitleY + textBob;
        wishSprite.position.y = layoutWishY + textBob;
        subSprite.position.y = layoutSubY + textBob;

        // 更新烟花文字的安全显示区域：保证在中间祝福语上方且不顶到标题
        updateNoteBand();

        // Stars slow drift
        stars.rotation.y += dt * 0.02;
        stars.rotation.x = Math.sin(t * 0.05) * 0.03;

        confetti.update(dt, t);

        rockets.update(dt);
        phraseRing.update(camera, t);

        autoTimer -= dt;
        if (autoTimer <= 0) {
            autoTimer = rand(0.75, 1.35);
            spawnAuto();
        }
        fireworks.update(dt);

        // Floating notes
        for (let i = floatingNotes.length - 1; i >= 0; i--) {
            const n = floatingNotes[i];
            n.age += dt;
            const tt = clamp(n.age / n.duration, 0, 1);

            // 屏幕空间垂直上飘：只改 ndcY
            n.targetNdcY += n.ndcVelY * dt;
            // 逐步减速：更像“缓缓上浮”
            n.ndcVelY *= Math.max(0.0, 1.0 - dt * 0.25);

            // band 约束放在 target 上，避免硬夹紧导致“突变”
            n.targetNdcY = clamp(n.targetNdcY, noteMinY, noteMaxY);

            // 平滑趋近目标（队列上移/带宽变化时不会瞬移）
            const follow = 1.0 - Math.exp(-dt * 12.0);
            n.ndcY = lerp(n.ndcY, n.targetNdcY, follow);
            applyNoteNdc(n.sprite, n.ndcY, n.ndcZ);

            const fadeIn = smoothstep(0.0, 0.12, tt);
            const fadeOut = 1.0 - smoothstep(0.82, 1.0, tt);
            (n.sprite.material as THREE.SpriteMaterial).opacity =
                fadeIn * fadeOut;

            const pop = 0.92 + 0.16 * easeOutCubic(Math.min(1, tt * 2.0));
            n.sprite.scale.copy(n.baseScale).multiplyScalar(pop);

            if (tt >= 1) {
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
            (r.mesh.material as THREE.MeshBasicMaterial).opacity =
                (1.0 - tt) * 0.55;
            r.mesh.rotation.z += dt * 1.2;

            if (tt >= 1) {
                scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                (r.mesh.material as THREE.Material).dispose();
                ripples.splice(i, 1);
            }
        }

        renderer.render(scene, camera);
    }
    frame();
}

main();
