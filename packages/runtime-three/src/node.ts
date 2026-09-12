/**
 * The host node of the three.js renderer.
 *
 * Core's renderer contract (`RendererOptions` in `@sigx/runtime-core`) creates
 * an element with `createElement(tag)` BEFORE it patches any prop, so the
 * three.js object — whose constructor may need `args` — cannot exist yet. The
 * host node is therefore a stable shadow record that OWNS a lazily constructed
 * three object. That also lets `args` / `<primitive object>` changes swap the
 * object in place (the vnode keeps the same host handle), keeps anchors and
 * text nodes monomorphic with elements, and gives `nextSibling`/`parentNode`
 * O(1) field reads through a doubly-linked shadow tree.
 *
 * Anchors (core's comment nodes: fragment/component boundaries and falsy
 * children placeholders) and text nodes live ONLY in this shadow tree; the
 * three.js scene graph never sees them.
 */
import type { AppContext } from '@sigx/runtime-core';
import type { EffectRunner } from '@sigx/reactivity';
import type { ThreeRoot } from './root.js';

/** Anything `new`-able into a three.js object. */
export type ThreeConstructor = new (...args: any[]) => any;

/** A function attach: return a cleanup to run on detach. */
export type AttachFn = (parent: any, self: any) => (() => void) | void;
/**
 * How a non-Object3D child binds to its parent: a dashed property path
 * (`"material"`, `"material-map"`, `"material-0"`, `"attributes-position"`)
 * or a function.
 */
export type AttachType = string | AttachFn;

export const NodeKind = {
    Root: 0,
    Element: 1,
    Anchor: 2,
    Text: 3
} as const;
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

/** A stable pointer-event handler slot; re-renders swap `.value` (runtime-dom pattern). */
export interface EventInvoker {
    value: (event: any) => void;
    appContext: AppContext | null;
}

export class ThreeNode<T = any> {
    readonly kind: NodeKind;
    readonly tag: string;

    /** The three.js object. `null` until construction (see `ensureObject`). */
    object: T | null = null;
    /** Resolved at `createElement`; `null` for `<primitive>`, anchors and text. */
    ctor: ThreeConstructor | null = null;
    /** `<primitive object={…}>` — user-owned, never disposed, never reconstructed from args. */
    isPrimitive = false;
    /** `object.isObject3D === true`, cached at construction. */
    isObject3D = false;

    // ---- shadow tree -------------------------------------------------------
    parent: ThreeNode | null = null;
    prev: ThreeNode | null = null;
    next: ThreeNode | null = null;
    firstChild: ThreeNode | null = null;
    lastChild: ThreeNode | null = null;
    /** The root this node lives under. Cached lazily; `null` before first insertion. */
    root: ThreeRoot | null = null;

    // ---- props state -------------------------------------------------------
    /**
     * Every prop core has patched onto this node, by key, in insertion order
     * (a null-prototype dictionary). Before construction it is the replay
     * queue; after construction it is what `reconstruct()` replays when
     * `args` change. Removed props are stored as `null` so a replay restores
     * the default too.
     */
    props: Record<string, unknown> | null = null;
    /** The constructor args the current object was built with. */
    args: unknown[] | null = null;

    // ---- attach state ------------------------------------------------------
    /** Explicit `attach` prop, if any; `null` means "infer from the object's kind". */
    attach: AttachType | null = null;
    /** Whether this node is currently bound to its parent through `attach` (vs. `parent.add`). */
    attached = false;
    attachTarget: any = null;
    attachKey: string | number | null = null;
    attachPrev: unknown = undefined;
    attachCleanup: (() => void) | null = null;

    // ---- reactivity & events -------------------------------------------------
    /** Signal-bound props: one effect per key, stopped on unmount / rebind. */
    bindings: Map<string, EffectRunner> | null = null;
    /** Pointer-event handlers by `EVENT_INDEX` slot; allocated on the first handler. */
    handlers: Array<EventInvoker | null> | null = null;
    /** Position in the root's interactive-object registry, or -1. */
    interactiveIndex = -1;

    // ---- lifecycle ---------------------------------------------------------
    /** `dispose={null}` opts out; primitives never dispose. */
    disposeOnUnmount = true;
    /** Set by `onElementUnmounted`; children skip their own three.js removal under an unmounting parent. */
    unmounting = false;
    appContext: AppContext | null = null;

    /** Text nodes only. */
    text = '';

    constructor(kind: NodeKind, tag: string) {
        this.kind = kind;
        this.tag = tag;
    }
}

/** Link `child` into `parent` before `anchor` (append when `anchor` is null). */
export function linkBefore(parent: ThreeNode, child: ThreeNode, anchor: ThreeNode | null): void {
    child.parent = parent;
    if (anchor === null) {
        const last = parent.lastChild;
        child.prev = last;
        child.next = null;
        if (last) last.next = child;
        else parent.firstChild = child;
        parent.lastChild = child;
    } else {
        const prev = anchor.prev;
        child.prev = prev;
        child.next = anchor;
        anchor.prev = child;
        if (prev) prev.next = child;
        else parent.firstChild = child;
    }
}

/** Unlink `child` from its parent's shadow list. No-op when it has no parent. */
export function unlink(child: ThreeNode): void {
    const parent = child.parent;
    if (parent === null) return;
    const { prev, next } = child;
    if (prev) prev.next = next;
    else parent.firstChild = next;
    if (next) next.prev = prev;
    else parent.lastChild = prev;
    child.parent = child.prev = child.next = null;
}

/** Resolve (and cache) the root a node lives under by walking up the shadow tree. */
export function findRoot(node: ThreeNode): ThreeRoot | null {
    let n: ThreeNode | null = node;
    while (n !== null) {
        if (n.root !== null) {
            if (n !== node) node.root = n.root;
            return n.root;
        }
        n = n.parent;
    }
    return null;
}

/**
 * A subtree learns its root when its top node is inserted (children mount
 * bottom-up, before their parent is placed). Walk it once: cache `root` on
 * every node and let `onAdopt` register the ones that need the root (pointer
 * handlers). Skipped for moves within the same root.
 */
export function adoptRoot(node: ThreeNode, root: ThreeRoot, onAdopt: (node: ThreeNode) => void): void {
    if (node.root === root) return;
    node.root = root;
    onAdopt(node);
    let child = node.firstChild;
    while (child !== null) {
        adoptRoot(child, root, onAdopt);
        child = child.next;
    }
}

/** The host node a three.js object was created by, if any. */
export function nodeOf(object: unknown): ThreeNode | null {
    return (object as { __sigx?: ThreeNode } | null)?.__sigx ?? null;
}
