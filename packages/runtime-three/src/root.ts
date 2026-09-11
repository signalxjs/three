/**
 * `createRoot` — a three.js scene, camera, renderer and frame loop bound to a
 * canvas, that sigx components render into.
 */
import { batch, signal } from '@sigx/reactivity';
import { component, defineProvide, jsx, type AppContext, type JSXElement } from '@sigx/runtime-core';
import { handleComponentError, setCurrentInstance, type ComponentSetupContext } from '@sigx/runtime-core/internals';
import { PerspectiveCamera, Raycaster, Scene, Vector2, type Camera } from 'three';
import { createEventManager, createInteractiveRegistry, type EventManager, type EventsOptions, type InteractiveRegistry } from './events.js';
import { applyShadows, resolveGl, type GlOption, type RendererLike, type ShadowsOption } from './gl.js';
import { useThree } from './hooks.js';
import { defaultScheduler, FrameLoop, type FixedCallback, type FixedHandle, type FrameCallback, type FrameScheduler } from './loop.js';
import { NodeKind, ThreeNode } from './node.js';
import { render as renderVNode } from './render.js';

export type Frameloop = 'always' | 'demand' | 'never';

export interface CameraOptions {
    fov?: number;
    near?: number;
    far?: number;
    position?: [number, number, number];
    /** Skip the automatic aspect/projection update on resize. */
    manual?: boolean;
}

export interface RootOptions {
    /**
     * The renderer: an instance (not disposed by the root), a factory
     * `(canvas) => renderer | Promise<renderer>` (see `webgl()` / `webgpu()`),
     * or `WebGLRenderer` parameters. Default: a `WebGLRenderer` with antialias.
     */
    gl?: GlOption;
    /** A camera instance, or options for the default `PerspectiveCamera(75, aspect, 0.1, 1000)` at z = 5. */
    camera?: Camera | CameraOptions;
    scene?: Scene;
    shadows?: ShadowsOption;
    /** Device pixel ratio, or a `[min, max]` clamp for `window.devicePixelRatio`. Default `[1, 2]`. */
    dpr?: number | [number, number];
    /** `always` (default) renders every frame; `demand` renders on `invalidate()`; `never` only on `advance()`. */
    frameloop?: Frameloop;
    /** Raycast pointer events on the canvas. Default: on when there is a canvas. Pass options to customise. */
    events?: boolean | EventsOptions;
    /** Default step for `useFixedUpdate`, in seconds. Default 1/60. */
    fixedStep?: number;
    /** A fixed size: no ResizeObserver. Tests and headless roots use this. */
    size?: { width: number; height: number };
    scheduler?: FrameScheduler;
    /** Clamp for the per-frame delta, in seconds. Default 0.1. */
    maxDelta?: number;
    raycaster?: Raycaster;
    onCreated?(state: ThreeState): void;
}

export interface ThreeSize {
    width: number;
    height: number;
    dpr: number;
    top: number;
    left: number;
}

export interface ThreeClock {
    /** Seconds since the root started ticking. */
    elapsed: number;
    /** Seconds since the previous frame (clamped). */
    delta: number;
    frame: number;
    /** Fixed-step interpolation factor of the last fixed subscriber, 0..1. */
    alpha: number;
}

/**
 * The root's state. A plain mutable object — NEVER placed inside `signal()`;
 * the only reactive part is `reactive` (primitives only), safe to read in
 * render functions.
 */
export interface ThreeState {
    gl: RendererLike | null;
    scene: Scene;
    camera: Camera;
    raycaster: Raycaster;
    pointer: Vector2;
    canvas: HTMLCanvasElement | null;
    size: ThreeSize;
    clock: ThreeClock;
    frameloop: Frameloop;
    fixedStep: number;
    reactive: { width: number; height: number; dpr: number; frameloop: Frameloop };
    invalidate(frames?: number): void;
    advance(dt?: number): void;
    setFrameloop(mode: Frameloop): void;
    setCamera(camera: Camera): void;
    setSize(width: number, height: number, dpr?: number): void;
    /**
     * Run `cb` every frame, ordered by ascending `priority`. A `manual`
     * subscriber takes over rendering: the loop stops calling `gl.render`
     * while one exists.
     */
    subscribe(cb: FrameCallback, priority?: number, manual?: boolean): () => void;
    subscribeFixed(cb: FixedCallback, opts?: { step?: number; maxSubSteps?: number }): FixedHandle;
}

export interface ThreeRoot {
    readonly store: ThreeState;
    readonly scene: Scene;
    /** The host container; `mount`/`patch` primitives target it. */
    readonly container: ThreeNode;
    /** Resolves once an async `gl` factory has settled (already resolved otherwise). */
    readonly ready: Promise<void>;
    /** @internal objects with pointer handlers */
    readonly interactive: InteractiveRegistry;
    /** The pointer-event manager (`handle(type, event)` feeds a synthetic event), or `null` when events are off. */
    readonly events: EventManager | null;
    /**
     * Render (or re-render) an element into the scene. `parentInstance` links
     * the tree's DI parent chain to a component of another renderer (how
     * `<Canvas>` lets provide/inject cross from the DOM into the scene).
     */
    render(element: JSXElement | null, appContext?: AppContext | null, parentInstance?: ComponentSetupContext | null): void;
    /** Total teardown: unmount the tree, stop the loop, disconnect observers, dispose an owned renderer. Idempotent. */
    unmount(): void;
    invalidate(frames?: number): void;
    advance(dt?: number): void;
    setSize(width: number, height: number, dpr?: number): void;
    subscribe(cb: FrameCallback, priority?: number, manual?: boolean): () => void;
    subscribeFixed(cb: FixedCallback, opts?: { step?: number; maxSubSteps?: number }): FixedHandle;
}

// The store a RootProvider captures during `root.render()`. Passed through a
// module variable, never through component props (those are deep-proxied).
let providingStore: ThreeState | null = null;

/** Internal: provides the root's store to the tree via `useThree`. */
const RootProvider = component<{ children?: unknown }>((ctx) => {
    const store = providingStore;
    defineProvide(useThree, () => store!);
    return () => ((ctx.slots as { default?: () => unknown }).default?.() ?? undefined) as JSXElement | undefined;
}, { name: 'ThreeRoot' });

function clampDpr(dpr: number | [number, number] | undefined): number {
    const device = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;
    if (typeof dpr === 'number') return dpr;
    if (Array.isArray(dpr)) return Math.min(Math.max(device, dpr[0]), dpr[1]);
    return Math.min(Math.max(device, 1), 2);
}

function isCanvas(el: unknown): el is HTMLCanvasElement {
    return typeof HTMLCanvasElement !== 'undefined' && el instanceof HTMLCanvasElement;
}

export function createRoot(target: HTMLCanvasElement | HTMLElement | null, options: RootOptions = {}): ThreeRoot {
    // ---- canvas ------------------------------------------------------------
    let canvas: HTMLCanvasElement | null = null;
    if (target !== null) {
        if (isCanvas(target)) {
            canvas = target;
        } else if (typeof (target as HTMLElement).appendChild === 'function') {
            canvas = (target as HTMLElement).ownerDocument.createElement('canvas');
            canvas.style.display = 'block';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            (target as HTMLElement).appendChild(canvas);
        }
    }

    // ---- scene / camera / raycaster ----------------------------------------
    const scene = options.scene ?? new Scene();
    const initialWidth = options.size?.width ?? (canvas ? canvas.clientWidth || canvas.width || 1 : 1);
    const initialHeight = options.size?.height ?? (canvas ? canvas.clientHeight || canvas.height || 1 : 1);
    let camera: Camera;
    let cameraManual = false;
    if (options.camera && (options.camera as Camera).isCamera === true) {
        camera = options.camera as Camera;
        cameraManual = (options.camera as CameraOptions).manual === true;
    } else {
        const o = (options.camera as CameraOptions | undefined) ?? {};
        const cam = new PerspectiveCamera(o.fov ?? 75, initialWidth / initialHeight, o.near ?? 0.1, o.far ?? 1000);
        if (o.position) cam.position.set(o.position[0], o.position[1], o.position[2]);
        else cam.position.z = 5;
        cameraManual = o.manual === true;
        camera = cam;
    }
    const raycaster = options.raycaster ?? new Raycaster();

    // ---- gl ----------------------------------------------------------------
    const resolved = resolveGl(options.gl, canvas);
    if (resolved.value !== null) applyShadows(resolved.value, options.shadows);

    const dpr = clampDpr(options.dpr);
    const reactive = signal({ width: initialWidth, height: initialHeight, dpr, frameloop: options.frameloop ?? 'always' as Frameloop });

    let appContextForErrors: AppContext | null = null;
    const onError = (e: unknown, info: string): void => {
        const err = e instanceof Error ? e : new Error(String(e));
        if (handleComponentError(appContextForErrors, err, null, info) !== true) {
            // Rethrow asynchronously: the loop must not die with one bad subscriber.
            setTimeout(() => { throw err; }, 0);
        }
    };

    // ---- state -------------------------------------------------------------
    const state: ThreeState = {
        gl: resolved.value,
        scene,
        camera,
        raycaster,
        pointer: new Vector2(),
        canvas,
        size: { width: initialWidth, height: initialHeight, dpr, top: 0, left: 0 },
        clock: { elapsed: 0, delta: 0, frame: 0, alpha: 0 },
        frameloop: options.frameloop ?? 'always',
        fixedStep: options.fixedStep ?? 1 / 60,
        reactive,
        invalidate: (frames) => loop.invalidate(frames),
        advance: (dt) => loop.advance(dt),
        setFrameloop: (mode) => {
            state.frameloop = mode;
            reactive.frameloop = mode;
            loop.modeChanged();
        },
        setCamera: (next) => {
            state.camera = next;
            updateCamera();
            loop.invalidate();
        },
        setSize: (width, height, nextDpr) => setSize(width, height, nextDpr),
        subscribe: (cb, priority, manual) => loop.subscribe(cb, priority, manual),
        subscribeFixed: (cb, opts) => loop.subscribeFixed(cb, opts?.step ?? state.fixedStep, opts?.maxSubSteps ?? 5)
    };

    const loop = new FrameLoop(state, options.scheduler ?? defaultScheduler(), options.maxDelta ?? 0.1, onError);

    function updateCamera(): void {
        if (cameraManual) return;
        const cam = state.camera as any;
        const { width, height } = state.size;
        if (cam.isPerspectiveCamera) {
            cam.aspect = width / height;
            cam.updateProjectionMatrix();
        } else if (cam.isOrthographicCamera) {
            cam.left = -width / 2;
            cam.right = width / 2;
            cam.top = height / 2;
            cam.bottom = -height / 2;
            cam.updateProjectionMatrix();
        }
    }

    function applySize(): void {
        const gl = state.gl;
        if (gl !== null) {
            gl.setPixelRatio?.(state.size.dpr);
            gl.setSize?.(state.size.width, state.size.height, false);
        }
        updateCamera();
    }

    function setSize(width: number, height: number, nextDpr?: number): void {
        const size = state.size;
        if (nextDpr !== undefined) size.dpr = nextDpr;
        if (size.width === width && size.height === height && (nextDpr === undefined || reactive.dpr === nextDpr)) return;
        size.width = width;
        size.height = height;
        if (canvas) {
            const rect = canvas.getBoundingClientRect?.();
            if (rect) {
                size.top = rect.top;
                size.left = rect.left;
            }
        }
        applySize();
        batch(() => {
            reactive.width = width;
            reactive.height = height;
            reactive.dpr = size.dpr;
        });
        loop.invalidate();
    }

    // ---- container & rendering ---------------------------------------------
    const container = new ThreeNode(NodeKind.Root, '#root');
    container.object = scene;

    let unmounted = false;
    let ready: Promise<void> = Promise.resolve();
    if (resolved.promise !== null) {
        ready = resolved.promise.then((gl) => {
            if (unmounted) {
                gl.dispose?.();
                return;
            }
            state.gl = gl;
            applyShadows(gl, options.shadows);
            applySize();
            loop.invalidate();
        });
    }

    // ---- resize ------------------------------------------------------------
    let stopResize: (() => void) | null = null;
    if (canvas !== null && options.size === undefined) {
        const measure = (): void => {
            const el = canvas!.parentElement ?? canvas!;
            const w = el.clientWidth || canvas!.clientWidth || state.size.width;
            const h = el.clientHeight || canvas!.clientHeight || state.size.height;
            setSize(w, h, clampDpr(options.dpr));
        };
        const g = globalThis as any;
        if (typeof g.ResizeObserver === 'function') {
            const ro = new g.ResizeObserver(measure);
            ro.observe(canvas.parentElement ?? canvas);
            stopResize = () => ro.disconnect();
        } else if (typeof g.addEventListener === 'function') {
            g.addEventListener('resize', measure);
            stopResize = () => g.removeEventListener('resize', measure);
        }
        measure();
    }
    applySize();

    const root: ThreeRoot = {
        store: state,
        scene,
        container,
        ready,
        interactive: createInteractiveRegistry(),
        events: null,
        render(element, appContext, parentInstance) {
            if (unmounted) return;
            appContextForErrors = appContext ?? appContextForErrors;
            const vnode = element === null || element === undefined ? null : jsx(RootProvider, { children: element });
            providingStore = state;
            const prev = parentInstance ? setCurrentInstance(parentInstance) : undefined;
            try {
                renderVNode(vnode as JSXElement, container, appContext ?? undefined);
            } finally {
                if (parentInstance) setCurrentInstance(prev ?? null);
                providingStore = null;
            }
            loop.invalidate();
        },
        unmount() {
            if (unmounted) return;
            unmounted = true;
            renderVNode(null as unknown as JSXElement, container);
            loop.stop();
            root.events?.dispose();
            stopResize?.();
            stopResize = null;
            if (resolved.owned) state.gl?.dispose?.();
            state.gl = null;
        },
        invalidate: state.invalidate,
        advance: state.advance,
        setSize: state.setSize,
        subscribe: state.subscribe,
        subscribeFixed: state.subscribeFixed
    };
    container.root = root;

    // On by default when there is a canvas; an options object opts in even
    // without one (tests feed `events.handle()` directly).
    const eventsOption = options.events;
    if (eventsOption !== false && (canvas !== null || typeof eventsOption === 'object')) {
        (root as { events: EventManager | null }).events = createEventManager(root, typeof eventsOption === 'object' ? eventsOption : {});
    }

    options.onCreated?.(state);
    loop.start();
    return root;
}
