/**
 * @sigx/runtime-three internal APIs
 *
 * ⚠️ Low-level seams for `@sigx/three`, tests and benchmarks. NOT part of
 * the public API and may change without notice.
 *
 * @internal
 */
export { nodeOps } from './nodeOps.js';
export { renderer, render, patch, mount, unmount, mountComponent } from './render.js';
export { applyValue, setProp, restoreDefault } from './props.js';
export { ensureObject, reconstruct } from './construct.js';
export { attachTo, detach, resolveAttach, placeChild, unplaceChild, pathFor, indexFor } from './attach.js';
export { bindProp, unbindProp, isBindable } from './bindings.js';
export { EVENT_NAMES, EVENT_INDEX, setHandler, createInteractiveRegistry } from './events.js';
export type { InteractiveRegistry } from './events.js';
export { resolveConstructor, isRegistered, clearCatalog, DOM_COLLISIONS, PRIMITIVE_TAG } from './catalog.js';
export { FrameLoop, defaultScheduler } from './loop.js';
export { linkBefore, unlink, findRoot, nodeOf, NodeKind } from './node.js';
export { resolveGl, applyShadows } from './gl.js';
