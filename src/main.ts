import * as THREE from 'three';

// 慢热风格：不直接点明“喜欢”，你可以改成她的昵称/名字或留空
const GIRL_NAME = '她';
const YEAR_FROM = 2025;
const YEAR_TO = 2026;

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

function nowMs(): number {
    return performance.now();
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
        subtitle.textContent = `写给${GIRL_NAME}：愿新的一年，日子慢慢变好。`;
    if (hint)
        hint.textContent = isTouchDevice()
            ? '拖动旋转视角 · 轻触屏幕放烟花'
            : '拖动旋转视角 · 点击放烟花';
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
        if (this.pointerId !== null) return;
        this.pointerId = e.pointerId;
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }

    private onPointerMove(e: PointerEvent): void {
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

    spawn(origin: THREE.Vector3, intensity = 1.0): void {
        if (this.bursts.length >= this.maxBursts) {
            const old = this.bursts.shift();
            if (old) this.removeBurst(old);
        }

        const count = this.particlesPerBurst;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const life = new Float32Array(count);

        const baseHue = rand(0, 1);
        const color = new THREE.Color();
        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = origin.x;
            positions[i * 3 + 1] = origin.y;
            positions[i * 3 + 2] = origin.z;

            const theta = rand(0, Math.PI * 2);
            const phi = Math.acos(rand(-1, 1));
            const speed = rand(3.2, 6.0) * intensity;
            velocities[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * speed;
            velocities[i * 3 + 1] = Math.cos(phi) * speed;
            velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;

            const hue = (baseHue + rand(-0.07, 0.07) + 1) % 1;
            color.setHSL(hue, rand(0.85, 1.0), rand(0.55, 0.75));
            colors[i * 3 + 0] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            life[i] = rand(0.75, 1.0);
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

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: 80.0 },
                uOpacity: { value: 1.0 },
            },
            vertexShader: `
				attribute vec3 aVelocity;
				attribute vec3 aColor;
				attribute float aLife;
				uniform float uTime;
				uniform float uSize;
				varying vec3 vColor;
				varying float vLife;
				void main() {
					vColor = aColor;
					// uTime 由外部累加，aLife 用于细微随机差异
					float t = uTime * (0.85 + 0.3 * aLife);
					vec3 p = position + aVelocity * t;
					// 重力
					p.y += -1.8 * t * t;

					vLife = clamp(1.0 - t / (1.25 + 0.8 * aLife), 0.0, 1.0);
					vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
					gl_Position = projectionMatrix * mvPosition;

					float size = uSize * (0.75 + 0.75 * aLife);
					gl_PointSize = size / max(0.8, -mvPosition.z);
				}
			`,
            fragmentShader: `
				precision highp float;
				varying vec3 vColor;
				varying float vLife;
				uniform float uOpacity;
				void main() {
					vec2 uv = gl_PointCoord * 2.0 - 1.0;
					float d = dot(uv, uv);
					float edge = smoothstep(1.0, 0.0, d);
					float a = edge * vLife * uOpacity;
					vec3 c = vColor;
					// 小幅提亮中心
					c += (1.0 - d) * 0.35;
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
            age: 0,
            duration: 1.75,
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
    age: number;
    duration: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    intensity: number;
};

class FireworkRockets implements Disposable {
    private readonly scene: THREE.Scene;
    private readonly fireworks: Fireworks;
    private readonly rockets: Rocket[] = [];
    private readonly maxRockets: number;

    constructor(scene: THREE.Scene, fireworks: Fireworks, maxRockets = 6) {
        this.scene = scene;
        this.fireworks = fireworks;
        this.maxRockets = maxRockets;
    }

    launch(targetXZ: THREE.Vector3, intensity = 1.0): void {
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
            color: new THREE.Color('#fff6d6'),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.22, 0.22, 1);
        sprite.position.copy(start);
        sprite.renderOrder = 50;

        const segs = 14;
        const trailPositions = new Float32Array((segs + 1) * 3);
        for (let i = 0; i <= segs; i++) {
            trailPositions[i * 3 + 0] = start.x;
            trailPositions[i * 3 + 1] = start.y;
            trailPositions[i * 3 + 2] = start.z;
        }
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(trailPositions, 3)
        );
        const trailMat = new THREE.LineBasicMaterial({
            color: new THREE.Color('#a9e8ff'),
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
            age: 0,
            duration: rand(0.75, 1.05),
            start,
            end,
            intensity,
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

            const fade = clamp(1.0 - r.age / r.duration, 0, 1);
            (r.sprite.material as THREE.SpriteMaterial).opacity =
                0.35 + 0.6 * fade;
            (r.trail.material as THREE.LineBasicMaterial).opacity =
                0.12 + 0.5 * fade;

            if (r.age >= r.duration) {
                // 顶点绽放
                this.fireworks.spawn(r.end, r.intensity);
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

    // Heart
    const heart = createHeartMesh();
    scene.add(heart);

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

    const wishSprite = createTextSprite(`愿你新岁安好`, {
        fontSize: 64,
        glowColor: 'rgba(255, 120, 210, 0.9)',
    });
    wishSprite.position.set(0, 2.0, 0);
    scene.add(wishSprite);

    const subSprite = createTextSprite('把温柔藏进每一天', {
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
        heartBaseScale: 1.18,
    };

    let layoutTitleY = base.titleY;
    let layoutWishY = base.wishY;
    let layoutSubY = base.subY;
    let layoutHeartScale = base.heartBaseScale;

    function applyLayout(): void {
        const size = getViewportSize();
        const aspect = size.width / size.height;
        const portrait = aspect < 0.86;

        // 竖屏：扩大视野 + 拉远一点，避免 3D 文字被裁切
        camera.fov = portrait ? 62 : base.cameraFov;
        camera.updateProjectionMatrix();

        controls.setRadius(portrait ? 7.6 : base.radius);
        controls.setPhi(portrait ? Math.PI * 0.36 : base.phi);

        const textScale = portrait ? 0.72 : isMobile ? 0.85 : 1.0;
        titleSprite.scale.copy(base.titleScale).multiplyScalar(textScale);
        wishSprite.scale.copy(base.wishScale).multiplyScalar(textScale);
        subSprite.scale.copy(base.subScale).multiplyScalar(textScale);

        layoutTitleY = portrait ? 2.28 : base.titleY;
        layoutWishY = portrait ? 1.82 : base.wishY;
        layoutSubY = portrait ? 1.48 : base.subY;

        // 主体在手机上略微收一点，避免贴边
        layoutHeartScale = portrait
            ? base.heartBaseScale * 0.96
            : base.heartBaseScale;

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

    // Rockets: lift-off -> burst
    const rockets = new FireworkRockets(scene, fireworks, isMobile ? 5 : 7);

    // Angle phrases: rotate to reveal different lines
    const phraseRing = new AnglePhraseRing({
        phrases: [
            '愿你新岁安好',
            '把温柔藏进每一天',
            '慢慢来，也会很美',
            '愿你被世界轻轻拥抱',
        ],
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

    function spawnAtScreen(clientX: number, clientY: number): void {
        const size = getViewportSize();
        ndc.x = (clientX / size.width) * 2 - 1;
        ndc.y = -(clientY / size.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const has = raycaster.ray.intersectPlane(groundPlane, hit);
        const origin = new THREE.Vector3(
            has ? clamp(hit.x, -5, 5) : rand(-2, 2),
            rand(2.0, 4.2),
            has ? clamp(hit.z, -5, 5) : rand(-2, 2)
        );
        rockets.launch(new THREE.Vector3(origin.x, 0, origin.z), 1.0);
    }

    // 轻触放烟花：与拖动旋转区分（移动距离阈值 + 时长）
    const tap = {
        pointerId: null as number | null,
        startX: 0,
        startY: 0,
        startMs: 0,
        moved: false,
    };
    const tapMoveThreshold = isMobile ? 10 : 6;
    const tapMaxDurationMs = isMobile ? 320 : 260;

    renderer.domElement.addEventListener(
        'pointerdown',
        (e) => {
            tap.pointerId = e.pointerId;
            tap.startX = e.clientX;
            tap.startY = e.clientY;
            tap.startMs = nowMs();
            tap.moved = false;
        },
        { passive: true }
    );
    window.addEventListener(
        'pointermove',
        (e) => {
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
            if (tap.pointerId === null || e.pointerId !== tap.pointerId) return;
            const duration = nowMs() - tap.startMs;
            const shouldSpawn = !tap.moved && duration <= tapMaxDurationMs;
            tap.pointerId = null;
            if (shouldSpawn) spawnAtScreen(e.clientX, e.clientY);
        },
        { passive: true }
    );
    window.addEventListener(
        'pointercancel',
        (e) => {
            if (tap.pointerId === null || e.pointerId !== tap.pointerId) return;
            tap.pointerId = null;
        },
        { passive: true }
    );

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
            rand(0.85, 1.15)
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
        heart.scale.setScalar(layoutHeartScale * pulse);
        heart.rotation.y += dt * 0.22;
        ring.rotation.z += dt * 0.35;
        ring.material.opacity = 0.45 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.35));

        // Text float
        titleSprite.position.y = layoutTitleY + Math.sin(t * 0.9) * 0.04;
        wishSprite.position.y = layoutWishY + Math.sin(t * 1.1 + 1.2) * 0.035;
        subSprite.position.y = layoutSubY + Math.sin(t * 1.15 + 2.4) * 0.03;

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

        renderer.render(scene, camera);
    }
    frame();
}

main();
