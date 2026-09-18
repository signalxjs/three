/**
 * Pointer events on three.js objects, by raycasting.
 *
 * Registry side: which `on*` props are pointer events, one stable invoker per
 * (node, event) so re-renders swap a function instead of re-registering, and
 * the root's compact list of interactive objects — only those are raycast.
 *
 * Dispatch side (`createEventManager`): one set of listeners on the canvas per
 * root; on a native event the pointer is projected to NDC from the cached
 * size, the interactive objects are raycast once, and the hits bubble up the
 * `__sigx` parent chain (deduped per event object) until `stopPropagation()`.
 * Hover (`over`/`out`/`enter`/`leave`) is tracked in reused sets. Nothing runs
 * per frame — only per native event.
 */
import type { AppContext } from '@sigx/runtime-core';
import { handleComponentError } from '@sigx/runtime-core/internals';
import { Vector3 } from 'three';
import type { Camera, Intersection, Object3D, Ray, Vector2 } from 'three';
import { nodeOf, type EventInvoker, type ThreeNode } from './node.js';
import type { ThreeRoot, ThreeState } from './root.js';

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

const SLOT_CLICK = 0;
const SLOT_CONTEXT_MENU = 1;
const SLOT_DOUBLE_CLICK = 2;
const SLOT_POINTER_DOWN = 3;
const SLOT_POINTER_UP = 4;
const SLOT_POINTER_MOVE = 5;
const SLOT_POINTER_OVER = 6;
const SLOT_POINTER_OUT = 7;
const SLOT_POINTER_ENTER = 8;
const SLOT_POINTER_LEAVE = 9;
const SLOT_POINTER_CANCEL = 10;
const SLOT_POINTER_MISSED = 11;
const SLOT_WHEEL = 12;

/** The subset of a native pointer/mouse/wheel event the manager reads. Tests pass plain objects. */
export interface NativePointerLike {
    type?: string;
    clientX: number;
    clientY: number;
    pointerId?: number;
    button?: number;
    buttons?: number;
    deltaX?: number;
    deltaY?: number;
    preventDefault?(): void;
}

/** The event a handler receives: the intersection plus dispatch context. */
export interface ThreeEvent<E = NativePointerLike> extends Intersection<Object3D> {
    nativeEvent: E;
    /** The object whose handler is running (bubbling walks up from `object`). */
    eventObject: Object3D;
    /** Every hit of this raycast, nearest first. */
    intersections: Intersection<Object3D>[];
    pointer: Vector2;
    ray: Ray;
    camera: Camera;
    /** Pixels the pointer travelled since `pointerdown` — ignore clicks that were drags. */
    delta: number;
    stopped: boolean;
    stopPropagation(): void;
    setPointerCapture(pointerId: number): void;
    releasePointerCapture(pointerId: number): void;
}

export interface EventsOptions {
    /** Where to listen. Default: the root's canvas. Tests pass a stub; `handle()` also works without one. */
    target?: EventTarget & { setPointerCapture?(id: number): void; releasePointerCapture?(id: number): void };
    /** Post-process the raycast hits (sort, cull, take the first). */
    filter?(hits: Intersection<Object3D>[], state: ThreeState): Intersection<Object3D>[];
    /** Fired on `click` with no handled hit. */
    onPointerMissed?(event: NativePointerLike): void;
}

// ---------------------------------------------------------------------------
// Handler slots
// ---------------------------------------------------------------------------

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

/** After reconstruction the replay re-installed the handlers; point the registry at the new object. */
export function reregisterHandlers(node: ThreeNode): void {
    if (node.handlers !== null && node.object !== null && node.isObject3D) registerInteractive(node);
}

// ---------------------------------------------------------------------------
// Interactive registry — a compact array per root, swap-remove.
// ---------------------------------------------------------------------------

export interface InteractiveRegistry {
    objects: Object3D[];
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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface EventManager {
    /** Feed a native-like event of the given type. What the listeners call; tests call it directly. */
    handle(type: string, native: NativePointerLike): void;
    dispose(): void;
}

const NATIVE_TYPES = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerleave', 'click', 'dblclick', 'contextmenu', 'wheel'] as const;

function invoke(invoker: EventInvoker, event: unknown): void {
    try {
        invoker.value(event);
    } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (handleComponentError(invoker.appContext, err, null, 'event handler') !== true) throw e;
    }
}

export function createEventManager(root: ThreeRoot, options: EventsOptions): EventManager {
    const state = root.store;
    const target = options.target ?? (state.canvas as EventsOptions['target'] | null) ?? null;

    // Reused per dispatch — no per-event allocation beyond the event objects
    // handed to handlers and three's own intersection array.
    let hits: Intersection<Object3D>[] = [];
    const visited = new Set<ThreeNode>();
    let hovered = new Set<ThreeNode>();
    let hoveredNext = new Set<ThreeNode>();
    const captured = new Map<number, ThreeNode>();
    // Reused for the captured-pointer path: no per-event allocation.
    const captureHit = { distance: 0, point: new Vector3(), object: null as unknown as Object3D } as Intersection<Object3D>;
    const captureList: Intersection<Object3D>[] = [captureHit];
    let downX = 0;
    let downY = 0;

    function project(native: NativePointerLike): void {
        const size = state.size;
        state.pointer.set(
            ((native.clientX - size.left) / size.width) * 2 - 1,
            -((native.clientY - size.top) / size.height) * 2 + 1
        );
    }

    function raycast(native: NativePointerLike): Intersection<Object3D>[] {
        project(native);
        // The renderer refreshes world matrices every frame; before the first
        // frame (or a camera moved between frames) they are stale. The camera
        // is cheap to refresh always; the whole scene only until it has rendered.
        state.camera.updateMatrixWorld();
        if (state.clock.frame === 0) state.scene.updateMatrixWorld();
        state.raycaster.setFromCamera(state.pointer, state.camera);
        let result = state.raycaster.intersectObjects(root.interactive.objects, true);
        if (options.filter) result = options.filter(result, state);
        const pointerId = native.pointerId ?? 0;
        const captor = captured.get(pointerId);
        if (captor !== undefined && captor.object !== null) {
            // A captured pointer only ever reports the captor (its own hit if
            // any, else a synthetic one at the ray origin).
            let own: Intersection<Object3D> | null = null;
            for (let i = 0; i < result.length; i++) {
                let o: Object3D | null = result[i].object;
                while (o !== null) {
                    if (o === captor.object) {
                        own = result[i];
                        break;
                    }
                    o = o.parent;
                }
                if (own !== null) break;
            }
            if (own === null) {
                captureHit.distance = 0;
                captureHit.point.copy(state.raycaster.ray.origin);
                captureHit.object = captor.object;
                captureList[0] = captureHit;
            } else {
                captureList[0] = own;
            }
            result = captureList;
        }
        hits = result;
        return result;
    }

    function makeEvent(hit: Intersection<Object3D>, native: NativePointerLike, eventObject: Object3D): ThreeEvent {
        const event = Object.assign({}, hit) as ThreeEvent;
        event.nativeEvent = native;
        event.eventObject = eventObject;
        event.intersections = hits;
        event.pointer = state.pointer;
        event.ray = state.raycaster.ray;
        event.camera = state.camera;
        event.delta = Math.hypot(native.clientX - downX, native.clientY - downY);
        event.stopped = false;
        event.stopPropagation = () => {
            event.stopped = true;
        };
        event.setPointerCapture = (id: number) => {
            const node = nodeOf(eventObject);
            if (node !== null) captured.set(id, node);
            target?.setPointerCapture?.(id);
        };
        event.releasePointerCapture = (id: number) => {
            captured.delete(id);
            target?.releasePointerCapture?.(id);
        };
        return event;
    }

    /**
     * Bubble `slot` up from each hit's object. Returns whether any handler
     * ran. `stopPropagation()` ends the walk for the current hit AND skips the
     * remaining (farther) hits — r3f semantics.
     */
    function dispatch(slot: number, native: NativePointerLike, hitList: Intersection<Object3D>[]): boolean {
        visited.clear();
        let handled = false;
        outer: for (let i = 0; i < hitList.length; i++) {
            const hit = hitList[i];
            let object: Object3D | null = hit.object;
            while (object !== null) {
                const node = nodeOf(object);
                if (node !== null && node.handlers !== null && !visited.has(node)) {
                    visited.add(node);
                    const invoker = node.handlers[slot];
                    if (invoker !== null) {
                        handled = true;
                        const event = makeEvent(hit, native, object);
                        invoke(invoker, event);
                        if (event.stopped) break outer;
                    }
                }
                object = object.parent;
            }
        }
        return handled;
    }

    /** Hover bookkeeping for a pointermove: over/enter for new objects, out/leave for gone ones. */
    function updateHover(native: NativePointerLike, hitList: Intersection<Object3D>[]): void {
        hoveredNext.clear();
        for (let i = 0; i < hitList.length; i++) {
            let object: Object3D | null = hitList[i].object;
            while (object !== null) {
                const node = nodeOf(object);
                if (node !== null && node.handlers !== null) hoveredNext.add(node);
                object = object.parent;
            }
        }
        for (const node of hovered) {
            if (!hoveredNext.has(node) && node.object !== null) {
                const hit = { distance: 0, point: state.raycaster.ray.origin, object: node.object } as Intersection<Object3D>;
                const out = node.handlers?.[SLOT_POINTER_OUT];
                if (out) invoke(out, makeEvent(hit, native, node.object));
                const leave = node.handlers?.[SLOT_POINTER_LEAVE];
                if (leave) invoke(leave, makeEvent(hit, native, node.object));
            }
        }
        for (let i = 0; i < hitList.length; i++) {
            let object: Object3D | null = hitList[i].object;
            while (object !== null) {
                const node = nodeOf(object);
                if (node !== null && node.handlers !== null && !hovered.has(node) && hoveredNext.has(node)) {
                    hovered.add(node); // guard against double-firing through a second hit on the same chain
                    const over = node.handlers[SLOT_POINTER_OVER];
                    if (over) invoke(over, makeEvent(hitList[i], native, object));
                    const enter = node.handlers[SLOT_POINTER_ENTER];
                    if (enter) invoke(enter, makeEvent(hitList[i], native, object));
                }
                object = object.parent;
            }
        }
        const prev = hovered;
        hovered = hoveredNext;
        hoveredNext = prev;
    }

    function flushHover(native: NativePointerLike): void {
        for (const node of hovered) {
            if (node.object === null) continue;
            const hit = { distance: 0, point: state.raycaster.ray.origin, object: node.object } as Intersection<Object3D>;
            const out = node.handlers?.[SLOT_POINTER_OUT];
            if (out) invoke(out, makeEvent(hit, native, node.object));
            const leave = node.handlers?.[SLOT_POINTER_LEAVE];
            if (leave) invoke(leave, makeEvent(hit, native, node.object));
        }
        hovered.clear();
    }

    function missed(native: NativePointerLike): void {
        const nodes = root.interactive.nodes;
        for (let i = 0; i < nodes.length; i++) {
            const invoker = nodes[i].handlers?.[SLOT_POINTER_MISSED];
            if (invoker) invoke(invoker, native);
        }
        options.onPointerMissed?.(native);
    }

    function handle(type: string, native: NativePointerLike): void {
        switch (type) {
            case 'pointerdown': {
                downX = native.clientX;
                downY = native.clientY;
                dispatch(SLOT_POINTER_DOWN, native, raycast(native));
                return;
            }
            case 'pointerup': {
                dispatch(SLOT_POINTER_UP, native, raycast(native));
                captured.delete(native.pointerId ?? 0);
                return;
            }
            case 'pointermove': {
                const list = raycast(native);
                updateHover(native, list);
                dispatch(SLOT_POINTER_MOVE, native, list);
                return;
            }
            case 'pointercancel': {
                dispatch(SLOT_POINTER_CANCEL, native, raycast(native));
                captured.delete(native.pointerId ?? 0);
                return;
            }
            case 'pointerleave': {
                flushHover(native);
                return;
            }
            case 'click': {
                if (!dispatch(SLOT_CLICK, native, raycast(native))) missed(native);
                return;
            }
            case 'dblclick': {
                dispatch(SLOT_DOUBLE_CLICK, native, raycast(native));
                return;
            }
            case 'contextmenu': {
                dispatch(SLOT_CONTEXT_MENU, native, raycast(native));
                return;
            }
            case 'wheel': {
                dispatch(SLOT_WHEEL, native, raycast(native));
                return;
            }
        }
    }

    const listener = (e: Event): void => handle(e.type, e as unknown as NativePointerLike);
    if (target !== null && typeof target.addEventListener === 'function') {
        for (const type of NATIVE_TYPES) {
            target.addEventListener(type, listener, type === 'wheel' ? { passive: true } : undefined);
        }
    }

    return {
        handle,
        dispose() {
            if (target !== null && typeof target.removeEventListener === 'function') {
                for (const type of NATIVE_TYPES) target.removeEventListener(type, listener);
            }
            hovered.clear();
            hoveredNext.clear();
            captured.clear();
            hits = [];
        }
    };
}

export type { AppContext };
