/**
 * Lazy construction of the three.js object behind a `ThreeNode`, and
 * reconstruction when `args` (or a primitive's `object`) change.
 */
import { toRaw } from '@sigx/reactivity';
import { NodeKind, type ThreeNode } from './node.js';
import { placeChild, unplaceChild } from './attach.js';
import { setProp } from './props.js';
import { stopBindings, rebindAll } from './bindings.js';
import { clearHandlers, reregisterHandlers } from './events.js';
import { sigxThreeError } from './utils.js';

function afterConstruct(node: ThreeNode): void {
    const o = node.object;
    node.isObject3D = o.isObject3D === true;
    o.__sigx = node;
}

/**
 * Construct `node.object` if it does not exist yet, then replay every prop
 * core patched before construction (in insertion order).
 */
export function ensureObject(node: ThreeNode): void {
    if (node.object !== null || node.kind !== NodeKind.Element) return;
    const props = node.props;
    if (node.isPrimitive) {
        const object = toRaw(props?.object) as object | undefined;
        if (!object) {
            throw sigxThreeError('<primitive> needs an `object` prop.');
        }
        node.object = object;
        node.disposeOnUnmount = false;
    } else {
        const args = (props?.args as unknown[] | null | undefined) ?? null;
        node.args = args;
        node.object = args === null ? new node.ctor!() : new node.ctor!(...args);
    }
    afterConstruct(node);
    if (props !== null) {
        for (const key in props) {
            if (key === 'args' || key === 'object') continue;
            setProp(node, key, null, props[key]);
        }
    }
}

/**
 * Swap the object behind a mounted node: `args` changed (or a primitive's
 * `object`). Detaches the old object, disposes it (unless opted out or
 * primitive), constructs the new one from the recorded props, and re-places
 * it and its children exactly where they were.
 */
export function reconstruct(node: ThreeNode): void {
    const parent = node.parent;
    const old = node.object;
    if (old === null) return;

    // Take the old object out of the scene / off its attach slot.
    if (parent !== null && parent.object !== null) unplaceChild(node);
    // Its children come along: unbind their three-side placement so the
    // re-place below starts clean.
    for (let c = node.firstChild; c !== null; c = c.next) {
        if (c.kind === NodeKind.Element && c.object !== null) unplaceChild(c);
    }

    stopBindings(node);
    clearHandlers(node);
    if (!node.isPrimitive && node.disposeOnUnmount && typeof old.dispose === 'function') old.dispose();
    old.__sigx = undefined;

    node.object = null;
    node.args = null;
    node.isObject3D = false;
    // Rebuild the primitive flag's disposal default; ensureObject re-derives it.
    if (!node.isPrimitive) node.disposeOnUnmount = node.props?.dispose !== null;

    ensureObject(node);
    rebindAll(node);
    reregisterHandlers(node);

    if (parent !== null && parent.object !== null) placeChild(parent, node);
    for (let c = node.firstChild; c !== null; c = c.next) {
        if (c.kind === NodeKind.Element && c.object !== null) placeChild(node, c);
    }
    node.root?.invalidate();
}
