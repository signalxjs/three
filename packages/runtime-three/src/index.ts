/**
 * @sigx/runtime-three — the three.js renderer for SignalX.
 *
 * This entry is import-safe under Node and registers nothing global: no
 * default mount, no platform element type. Three-only apps opt into those via
 * `@sigx/runtime-three/platform` (or `jsxImportSource: "@sigx/runtime-three"`);
 * DOM apps use `<Canvas>` from `@sigx/three`.
 */
export { createRoot } from './root.js';
export type { ThreeRoot, ThreeState, RootOptions, CameraOptions, Frameloop, ThreeSize, ThreeClock } from './root.js';
export { useThree, useFrame, useFixedUpdate, useSize, objectRef, ROOT_TOKEN } from './hooks.js';
export type { ObjectRef, UseFrameOptions } from './hooks.js';
export type { FrameCallback, FixedCallback, FixedHandle, FrameScheduler } from './loop.js';
export { extend, tagNameFor } from './catalog.js';
export { ThreeNode } from './node.js';
export type { ThreeConstructor, AttachType, AttachFn, EventInvoker } from './node.js';
export type { RendererLike, GlOption, GlFactory, ShadowsOption } from './gl.js';
export { threeMount } from './mount.js';
export type { ThreeMountTarget } from './mount.js';
export type { EventName, ThreeEvent, EventsOptions, EventManager, NativePointerLike } from './events.js';
export type { ThreeElement, ThreeElements, MathValue, Bindable, Mutable, EventHandlers, NodeProps, PrimitiveProps, DashedPaths, Tag } from './jsx-types.js';
// The global JSX.IntrinsicElements merge rides this side-effect import into dist/index.d.ts.
import './jsx-types.js';
export { render, mount, patch, unmount, mountComponent } from './render.js';
