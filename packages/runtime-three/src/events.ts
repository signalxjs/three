/**
 * Pointer-event handler slots on host nodes.
 *
 * This module owns the registry side: which `on*` props are pointer events,
 * the stable invoker per (node, event) so re-renders swap a function instead
 * of re-registering, and the root's list of interactive objects (only those
 * are ever raycast). Dispatch — canvas listeners, raycasting, bubbling,
 * hover bookkeeping — lands with the events PR.
 */
import type { AppContext } from '@sigx/runtime-core';
import type { EventInvoker, ThreeNode } from './node.js';

export const EVENT_NAMES = [
    'onClick',
    'onContextMenu',
    'onDoubleClick',
    'onPointerDown',
    'onPointerUp',
    'onPointerMove',
    'onPointerOver',
    'onPointerOut',
    'onPointerEnter',
    'onPointerLeave',
    'onPointerCancel',
    'onPointerMissed',
    'onWheel'
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** `onClick` → slot index in `node.handlers`. */
export const EVENT_INDEX: Record<string, number> = Object.create(null);
for (let i = 0; i < EVENT_NAMES.length; i++) EVENT_INDEX[EVENT_NAMES[i]] = i;

function countHandlers(node: ThreeNode): number {
    const h = node.handlers;
    if (h === null) return 0;
    let n = 0;
    for (let i = 0; i < h.length; i++) if (h[i] !== null) n++;
    return n;
}

/** Install / swap / remove a handler in a slot, keeping the invoker stable. */
export function setHandler(node: ThreeNode, slot: number, fn: ((event: any) => void) | null): void {
    let handlers = node.handlers;
    if (fn === null) {
        if (handlers === null || handlers[slot] === null) return;
        handlers[slot] = null;
        if (countHandlers(node) === 0) unregisterInteractive(node);
        return;
    }
    if (handlers === null) {
        handlers = node.handlers = Array.from({ length: EVENT_NAMES.length }, () => null);
    }
    const existing = handlers[slot];
    if (existing !== null) {
        existing.value = fn;
        existing.appContext = node.appContext;
        return;
    }
    const invoker: EventInvoker = { value: fn, appContext: node.appContext };
    handlers[slot] = invoker;
    if (node.object !== null && node.isObject3D) registerInteractive(node);
}

/** Drop every handler (unmount / reconstruction). */
export function clearHandlers(node: ThreeNode): void {
    if (node.handlers === null) return;
    unregisterInteractive(node);
    node.handlers = null;
}

/**
 * After reconstruction the props replay re-installed handlers through
 * `setProp` → `setHandler` on the new object; make sure the registry points
 * at it.
 */
export function reregisterHandlers(node: ThreeNode): void {
    if (node.handlers !== null && node.object !== null && node.isObject3D) registerInteractive(node);
}

// ---------------------------------------------------------------------------
// Interactive registry — a compact array per root, swap-remove.
// ---------------------------------------------------------------------------

export interface InteractiveRegistry {
    objects: any[];
    nodes: ThreeNode[];
}

export function createInteractiveRegistry(): InteractiveRegistry {
    return { objects: [], nodes: [] };
}

function registryOf(node: ThreeNode): InteractiveRegistry | null {
    return node.root?.interactive ?? null;
}

export function registerInteractive(node: ThreeNode): void {
    const registry = registryOf(node);
    if (registry === null) return;
    if (node.interactiveIndex !== -1) {
        // Reconstructed: keep the slot, point it at the new object.
        registry.objects[node.interactiveIndex] = node.object;
        return;
    }
    node.interactiveIndex = registry.objects.length;
    registry.objects.push(node.object);
    registry.nodes.push(node);
}

export function unregisterInteractive(node: ThreeNode): void {
    const i = node.interactiveIndex;
    if (i === -1) return;
    const registry = registryOf(node);
    node.interactiveIndex = -1;
    if (registry === null) return;
    const last = registry.objects.length - 1;
    if (i !== last) {
        registry.objects[i] = registry.objects[last];
        const moved = registry.nodes[last];
        registry.nodes[i] = moved;
        moved.interactiveIndex = i;
    }
    registry.objects.pop();
    registry.nodes.pop();
}

/** Called from `insert` once a node with handlers first learns its root. */
export function ensureRegistered(node: ThreeNode): void {
    if (node.handlers !== null && node.interactiveIndex === -1 && node.object !== null && node.isObject3D) {
        registerInteractive(node);
    }
}

export type { AppContext };
