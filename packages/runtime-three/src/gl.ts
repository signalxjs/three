/**
 * Resolving the `gl` option into a renderer instance.
 */
import {
    BasicShadowMap,
    PCFShadowMap,
    VSMShadowMap,
    WebGLRenderer,
    type WebGLRendererParameters
} from 'three';
import type { Camera, Scene } from 'three';

/** The subset of a three.js renderer the loop and root need. `WebGLRenderer` and `WebGPURenderer` both satisfy it. */
export interface RendererLike {
    render(scene: Scene, camera: Camera): unknown;
    setSize?(width: number, height: number, updateStyle?: boolean): void;
    setPixelRatio?(dpr: number): void;
    dispose?(): void;
    domElement?: HTMLCanvasElement;
    shadowMap?: { enabled: boolean; type: number };
}

export type GlFactory = (canvas: HTMLCanvasElement | null) => RendererLike | Promise<RendererLike>;
export type GlOption = RendererLike | WebGLRendererParameters | GlFactory;

/** `true` and `'pcf'` are PCF (three r186 removed PCFSoft); `'basic'`, `'vsm'`. */
export type ShadowsOption = boolean | 'basic' | 'pcf' | 'vsm';

export interface ResolvedGl {
    /** The renderer, or `null` while an async factory is pending. */
    value: RendererLike | null;
    promise: Promise<RendererLike> | null;
    /** Whether the root created it (and therefore disposes it). */
    owned: boolean;
}

function isRendererLike(value: unknown): value is RendererLike {
    return value !== null && typeof value === 'object' && typeof (value as RendererLike).render === 'function';
}

export function resolveGl(option: GlOption | undefined, canvas: HTMLCanvasElement | null): ResolvedGl {
    if (isRendererLike(option)) return { value: option, promise: null, owned: false };
    if (typeof option === 'function') {
        const result = option(canvas);
        if (result instanceof Promise) return { value: null, promise: result, owned: true };
        return { value: result, promise: null, owned: true };
    }
    const renderer = new WebGLRenderer({
        canvas: canvas ?? undefined,
        antialias: true,
        ...(option as WebGLRendererParameters | undefined)
    });
    return { value: renderer, promise: null, owned: true };
}

export function applyShadows(gl: RendererLike, shadows: ShadowsOption | undefined): void {
    if (!shadows || !gl.shadowMap) return;
    gl.shadowMap.enabled = true;
    switch (shadows) {
        case 'basic':
            gl.shadowMap.type = BasicShadowMap;
            break;
        case 'vsm':
            gl.shadowMap.type = VSMShadowMap;
            break;
        default:
            gl.shadowMap.type = PCFShadowMap;
    }
}
