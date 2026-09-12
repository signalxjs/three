/**
 * The renderer instance and its primitives, in the shape `@sigx/runtime-dom`
 * exposes them (`render`, `patch`, `mount`, `unmount`, `mountComponent`).
 * Evaluating this module creates the renderer; it registers nothing global.
 */
import { createRenderer } from '@sigx/runtime-core/internals';
import type { ThreeNode } from './node.js';
import { nodeOps } from './nodeOps.js';

export const renderer = createRenderer<ThreeNode, ThreeNode>(nodeOps);

export const { render, patch, mount, unmount, mountComponent } = renderer;
