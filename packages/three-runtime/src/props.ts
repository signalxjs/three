/**
 * Eager, allocation-free prop application onto three.js objects.
 *
 * Core calls `patchProp` only for keys whose value identity changed, so this
 * is not a hot loop per frame — but a keyed list of thousands of meshes still
 * funnels through here on mount, and `applyValue` is what signal-bound props
 * run on every change. Nothing here allocates per call once the dashed-path
 * cache is warm.
 */
import { toRaw } from '@sigx/reactivity';
import { pathFor, placeChild, unplaceChild } from './attach.js';
import { bindProp, isBindable, unbindProp } from './bindings.js';
import { reconstruct } from './construct.js';
import { EVENT_INDEX, setHandler } from './events.js';
import { findRoot, type ThreeNode } from './node.js';
import { sameArgs, warnOnce } from './utils.js';

/** three.js callback hooks that look like events but are plain properties. */
const THREE_CALLBACKS: ReadonlySet<string> = new Set([
    'onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow', 'onBeforeCompile', 'onBuild'
]);

const noopRaycast = (): void => {};

function isMathValue(cur: any): boolean {
    return cur.isVector3 === true || cur.isVector2 === true || cur.isVector4 === true ||
        cur.isEuler === true || cur.isQuaternion === true ||
        cur.isMatrix4 === true || cur.isMatrix3 === true;
}

/** Resolve a (possibly dashed) key against `node.object` to its final target and property. */
function resolveTarget(node: ThreeNode, key: string): { target: any; prop: string | number } | null {
    let target = node.object;
    if (key.indexOf('-') === -1) return { target, prop: key };
    const path = pathFor(key);
    const last = path.length - 1;
    for (let i = 0; i < last; i++) {
        target = target[path[i]];
        if (target === null || target === undefined) return null;
    }
    return { target, prop: path[last] };
}

// One scratch record reused by applyValue to avoid allocating per call.
const scratch: { target: any; prop: string | number } = { target: null, prop: '' };

function resolveInto(node: ThreeNode, key: string): boolean {
    let target = node.object;
    if (key.indexOf('-') === -1) {
        scratch.target = target;
        scratch.prop = key;
        return true;
    }
    const path = pathFor(key);
    const last = path.length - 1;
    for (let i = 0; i < last; i++) {
        target = target[path[i]];
        if (target === null || target === undefined) return false;
    }
    scratch.target = target;
    scratch.prop = path[last];
    return true;
}

/**
 * Write one value onto the object. Math values (vectors, euler, quaternion,
 * matrices, colors, layers) are updated IN PLACE from tuples, scalars or
 * instances; everything else is assigned. Invalidates the root for demand
 * rendering.
 */
export function applyValue(node: ThreeNode, key: string, value: unknown): void {
    if (!resolveInto(node, key)) {
        warnOnce(`path:${node.tag}:${key}`, `<${node.tag}>: prop "${key}" — an intermediate object on the path is missing; ignored.`);
        return;
    }
    const target = scratch.target;
    const prop = scratch.prop;
    scratch.target = null;

    const cur = target[prop];
    if (cur !== null && cur !== undefined && typeof cur === 'object') {
        if (cur.isColor === true) {
            cur.set(value);
            invalidate(node);
            return;
        }
        if (cur.isLayers === true) {
            if (typeof value === 'number') cur.set(value);
            else if (value !== null && typeof value === 'object') cur.mask = (value as { mask: number }).mask;
            invalidate(node);
            return;
        }
        if (isMathValue(cur)) {
            if (Array.isArray(value)) {
                // `set.apply` writes the tuple without a spread allocation.
                cur.set.apply(cur, value);
            } else if (typeof value === 'number') {
                if (typeof cur.setScalar === 'function') cur.setScalar(value);
                else warnOnce(`scalar:${node.tag}:${key}`, `<${node.tag}>: prop "${key}" does not accept a bare number; ignored.`);
            } else if (value !== null && typeof value === 'object' && typeof cur.copy === 'function') {
                // Read THROUGH a reactive proxy on purpose: inside a binding
                // effect that is what tracks `pos.x`/`pos.y`/`pos.z`.
                cur.copy(value);
            } else {
                target[prop] = toRaw(value);
            }
            invalidate(node);
            return;
        }
    }
    // Assignment hands the object to three: never a proxy (identity-keyed
    // WeakMaps inside the renderer would see a different key).
    target[prop] = toRaw(value);
    invalidate(node);
}

function invalidate(node: ThreeNode): void {
    const root = node.root ?? findRoot(node);
    if (root !== null) root.invalidate();
}

// ---------------------------------------------------------------------------
// Defaults (for prop removal)
// ---------------------------------------------------------------------------

const DEFAULTS = new Map<Function, any>();

/** A pristine instance of the node's class, built once per constructor, for reading default values. */
function defaultInstance(ctor: Function | null): any {
    if (ctor === null) return null;
    if (DEFAULTS.has(ctor)) return DEFAULTS.get(ctor);
    let instance: any = null;
    try {
        instance = new (ctor as new () => any)();
    } catch {
        instance = null;
    }
    DEFAULTS.set(ctor, instance);
    return instance;
}

/** Restore a removed prop to the class default (or delete an own property when no default exists). */
export function restoreDefault(node: ThreeNode, key: string): void {
    const def = defaultInstance(node.isPrimitive ? null : node.ctor);
    let value: unknown = undefined;
    if (def !== null) {
        const r = resolveTarget({ object: def } as ThreeNode, key);
        if (r !== null) value = r.target[r.prop];
    }
    if (value === undefined) {
        const r = resolveTarget(node, key);
        if (r !== null && Object.prototype.hasOwnProperty.call(r.target, r.prop)) delete r.target[r.prop];
        invalidate(node);
        return;
    }
    applyValue(node, key, value);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Apply one prop change to a constructed node. Called by `patchProp` after
 * construction and by `ensureObject`/`reconstruct` when replaying.
 */
export function setProp(node: ThreeNode, key: string, _prev: unknown, next: unknown): void {
    const object = node.object;
    switch (key) {
        case 'args': {
            if (node.isPrimitive) return;
            const args = (next as unknown[] | null | undefined) ?? null;
            if (!sameArgs(node.args, args)) {
                if (__DEV__ && args !== null && node.args !== null && args.length === node.args.length) {
                    warnOnce(`args:${node.tag}`, `<${node.tag}>: args changed after mount — the object is reconstructed. Keep args stable (hoist the array) or use a key for intentional remounts.`);
                }
                reconstruct(node);
            }
            return;
        }
        case 'object': {
            if (!node.isPrimitive) break;
            if (toRaw(next) !== object) reconstruct(node);
            return;
        }
        case 'attach': {
            const attach = (next as typeof node.attach) ?? null;
            if (attach === node.attach) return;
            node.attach = attach;
            const parent = node.parent;
            if (parent !== null && parent.object !== null && object !== null) {
                unplaceChild(node);
                placeChild(parent, node);
            }
            invalidate(node);
            return;
        }
        case 'dispose':
            node.disposeOnUnmount = !node.isPrimitive && next !== null;
            return;
        case 'raycast':
            // `raycast={null}` disables picking (the r3f idiom). A removed
            // prop also arrives as null (core's removal value), so it stays
            // disabled; re-enable by passing a function, e.g. the class's
            // own `Mesh.prototype.raycast`.
            if (next === null) object.raycast = noopRaycast;
            else if (typeof next === 'function') object.raycast = next;
            else delete object.raycast;
            invalidate(node);
            return;
        case 'userData':
            if (next !== null && next !== undefined) Object.assign(object.userData, toRaw(next));
            invalidate(node);
            return;
    }

    // on* — three callbacks, pointer events, or (dev-warned) plain assignment.
    if (key.charCodeAt(0) === 111 /* o */ && key.charCodeAt(1) === 110 /* n */ && key.length > 2) {
        const c = key.charCodeAt(2);
        if (c >= 65 && c <= 90) {
            if (THREE_CALLBACKS.has(key)) {
                if (next === null || next === undefined) delete object[key];
                else object[key] = next;
                return;
            }
            const slot = EVENT_INDEX[key];
            if (slot !== undefined) {
                setHandler(node, slot, (next as ((e: any) => void) | null | undefined) ?? null);
                return;
            }
            warnOnce(`on:${key}`, `"${key}" is neither a three.js callback nor a pointer event; assigned as a plain property.`);
        }
    }

    if (next !== null && next !== undefined && isBindable(next)) {
        bindProp(node, key, next);
        return;
    }
    if (node.bindings !== null) unbindProp(node, key);
    if (next === null || next === undefined) restoreDefault(node, key);
    else applyValue(node, key, next);
}
