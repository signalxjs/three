/**
 * `gl={webgl({ antialias: false })}` — an explicit `WebGLRenderer` factory.
 * (The default `gl` already creates one; this entry exists for symmetry with
 * `webgpu()` and for passing parameters.)
 */
import { WebGLRenderer, type WebGLRendererParameters } from 'three';
import type { GlFactory } from './gl.js';

export function webgl(params?: WebGLRendererParameters): GlFactory {
    return (canvas) => new WebGLRenderer({ canvas: canvas ?? undefined, antialias: true, ...params });
}
