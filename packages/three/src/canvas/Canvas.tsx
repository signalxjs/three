/**
 * `<Canvas>` — a three.js root inside an ordinary sigx DOM app.
 *
 * A runtime-dom component: it renders a wrapper `<div>` with a `<canvas>`,
 * creates a three root on mount, and renders its default slot into that root
 * inside an effect (so a parent re-render patches the scene). The root render
 * receives the app context and this component's own setup context as the
 * DI parent, which is what lets `provide`/`inject`, `useAppContext()` and
 * error scopes flow from DOM ancestors into the scene.
 *
 * Nothing three-related runs on the server: `onMounted` never fires there,
 * and the markup SSRs as an empty canvas that hydration then fills.
 */
/** @jsxImportSource @sigx/runtime-core */
// ^ pinned per file: an example that resolves this package to SOURCE through
//   the workspace path aliases would otherwise compile it under its own
//   `jsxImportSource: "sigx"`, which does not resolve from here.
/// <reference types="@sigx/runtime-dom" />
import { effect, toRaw } from '@sigx/reactivity';
import { component, Fragment, jsx, useAppContext, type Define, type JSXElement } from '@sigx/runtime-core';
import type { ComponentSetupContext } from '@sigx/runtime-core/internals';
import {
    createRoot,
    type CameraOptions,
    type EventsOptions,
    type Frameloop,
    type GlOption,
    type RootOptions,
    type ShadowsOption,
    type ThreeRoot,
    type ThreeState
} from '@sigx/three-runtime';
import type { Camera, Scene } from 'three';

/** What `<Canvas ref={api}>` exposes. */
export interface CanvasApi {
    /** The three root, once mounted. */
    readonly root: ThreeRoot | null;
    /** The root's store (`gl`, `scene`, `camera`, `size`, `clock`, …), once mounted. */
    readonly store: ThreeState | null;
    invalidate(frames?: number): void;
    advance(dt?: number): void;
}

export type CanvasProps =
    & Define.Prop<'camera', Camera | CameraOptions>
    & Define.Prop<'gl', GlOption>
    & Define.Prop<'scene', Scene>
    & Define.Prop<'shadows', ShadowsOption>
    & Define.Prop<'frameloop', Frameloop>
    & Define.Prop<'dpr', number | [number, number]>
    & Define.Prop<'events', boolean | EventsOptions>
    & Define.Prop<'fixedStep', number>
    & Define.Prop<'onCreated', (state: ThreeState, root: ThreeRoot) => void>
    & Define.Slot<'default'>
    & Define.Expose<CanvasApi>
    & Define.Attrs;

/** Props consumed here; everything else is forwarded to the wrapper `<div>`. */
const OWN_PROPS = new Set(['camera', 'gl', 'scene', 'shadows', 'frameloop', 'dpr', 'events', 'fixedStep', 'onCreated', 'children', 'key', 'ref']);

const WRAPPER_STYLE = 'position:relative;width:100%;height:100%;';
const CANVAS_STYLE = 'display:block;width:100%;height:100%;';

function wrapperAttrs(props: Record<string, unknown>): Record<string, unknown> {
    const rest: Record<string, unknown> = {};
    for (const key in props) {
        if (!OWN_PROPS.has(key)) rest[key] = props[key];
    }
    const style = rest.style;
    if (typeof style === 'string') rest.style = WRAPPER_STYLE + style;
    else if (style && typeof style === 'object') rest.style = { position: 'relative', width: '100%', height: '100%', ...(style as object) };
    else rest.style = WRAPPER_STYLE;
    return rest;
}

export const Canvas = component<CanvasProps>((ctx) => {
    const { props, slots } = ctx;
    let canvasEl: HTMLCanvasElement | null = null;
    let root: ThreeRoot | null = null;
    let stopRender: (() => void) | null = null;
    // Resolved during setup, where the DOM tree's context is current.
    const appContext = useAppContext();

    ctx.expose({
        get root() {
            return root;
        },
        get store() {
            return root?.store ?? null;
        },
        invalidate: (frames?: number) => root?.invalidate(frames),
        advance: (dt?: number) => root?.advance(dt)
    });

    ctx.onMounted(() => {
        if (canvasEl === null || root !== null) return;
        // Component props are deep-proxied; three objects must reach the root raw.
        const options: RootOptions = {
            camera: toRaw(props.camera) as RootOptions['camera'],
            gl: toRaw(props.gl) as GlOption | undefined,
            scene: toRaw(props.scene) as Scene | undefined,
            shadows: props.shadows,
            dpr: toRaw(props.dpr) as RootOptions['dpr'],
            frameloop: props.frameloop,
            events: toRaw(props.events) as RootOptions['events'],
            fixedStep: props.fixedStep
        };
        const r = (root = createRoot(canvasEl, options));
        const parent = ctx as unknown as ComponentSetupContext;
        const runner = effect(() => {
            const children = slots.default?.() ?? [];
            r.render(jsx(Fragment, { children }) as JSXElement, appContext, parent);
        });
        stopRender = () => runner.stop();
        props.onCreated?.(r.store, r);
    });

    ctx.onUnmounted(() => {
        stopRender?.();
        stopRender = null;
        const r = root;
        root = null;
        if (r !== null) {
            // Children unmount (their useFrame/useFixedUpdate subscriptions,
            // physics bodies, …) while the root is still alive, then the root
            // tears down the loop, listeners and an owned renderer.
            r.render(null);
            r.unmount();
        }
    });

    return () => (
        <div {...wrapperAttrs(props as Record<string, unknown>)} data-sigx-canvas="">
            <canvas ref={(el: HTMLCanvasElement | null) => { canvasEl = el; }} style={CANVAS_STYLE} />
        </div>
    );
}, { name: 'Canvas' });
