/**
 * `gl={webgpu()}` — a `WebGPURenderer` factory (async: awaits `init()`).
 * Its own dist entry so `three/webgpu` stays out of the main bundle.
 */
import { WebGPURenderer } from 'three/webgpu';
import type { GlFactory, RendererLike } from './gl.js';

export function webgpu(params?: ConstructorParameters<typeof WebGPURenderer>[0]): GlFactory {
    return async (canvas) => {
        const renderer = new WebGPURenderer({ canvas: canvas ?? undefined, antialias: true, ...params });
        await renderer.init();
        return renderer as unknown as RendererLike;
    };
}
