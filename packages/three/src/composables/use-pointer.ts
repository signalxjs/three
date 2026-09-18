import { useThree } from '@sigx/three-runtime';
import { frameHook, PRIORITY_LAST } from '../shared/frame-hook.js';
import { isBrowser, noop, tryOnDispose } from '../shared/scope.js';
import type { Stop } from '../shared/types.js';

export interface PointerState {
    /** Normalized device coordinates, -1..1 (y up). */
    readonly x: number;
    readonly y: number;
    /** Pixels moved since the previous frame (zeroed at the end of every frame). */
    readonly dx: number;
    readonly dy: number;
    /** `PointerEvent.buttons` bitmask of the last event. */
    readonly buttons: number;
    /** Whether the pointer is over the target. */
    readonly over: boolean;
    isDown(button?: number): boolean;
    justPressed(button?: number): boolean;
    justReleased(button?: number): boolean;
    stop: Stop;
}

export interface UsePointerOptions {
    /** Where to listen. Default: the root's canvas, else `window`. */
    target?: EventTarget & { getBoundingClientRect?(): DOMRect };
}

/**
 * Polled pointer state for game loops: position in NDC, per-frame deltas,
 * button state with frame-accurate edges — a plain mutable object, no
 * allocation per event or frame. For per-object hit testing use the
 * `onPointer*` element props instead.
 */
export function usePointer(options: UsePointerOptions = {}): PointerState {
    const state = {
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
        buttons: 0,
        over: false
    };
    const down = new Uint8Array(5);
    const pressedEdge = new Uint8Array(5);
    const releasedEdge = new Uint8Array(5);
    let stop: Stop = noop;

    if (isBrowser) {
        let canvas: HTMLCanvasElement | null = null;
        try {
            canvas = useThree().canvas;
        } catch {
            canvas = null;
        }
        const target = options.target ?? canvas ?? window;
        const rectOf = (): { left: number; top: number; width: number; height: number } => {
            const t = target as { getBoundingClientRect?(): DOMRect };
            if (typeof t.getBoundingClientRect === 'function') return t.getBoundingClientRect();
            return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        };
        let lastX = NaN;
        let lastY = NaN;
        const onMove = (e: Event): void => {
            const pe = e as PointerEvent;
            const r = rectOf();
            state.x = ((pe.clientX - r.left) / (r.width || 1)) * 2 - 1;
            state.y = -((pe.clientY - r.top) / (r.height || 1)) * 2 + 1;
            if (!Number.isNaN(lastX)) {
                state.dx += pe.clientX - lastX;
                state.dy += pe.clientY - lastY;
            }
            lastX = pe.clientX;
            lastY = pe.clientY;
            state.buttons = pe.buttons;
            state.over = true;
        };
        const onDown = (e: Event): void => {
            const pe = e as PointerEvent;
            state.buttons = pe.buttons;
            const b = pe.button;
            if (b >= 0 && b < 5 && !down[b]) {
                down[b] = 1;
                pressedEdge[b] = 1;
            }
        };
        const onUp = (e: Event): void => {
            const pe = e as PointerEvent;
            state.buttons = pe.buttons;
            const b = pe.button;
            if (b >= 0 && b < 5 && down[b]) {
                down[b] = 0;
                releasedEdge[b] = 1;
            }
        };
        const onLeave = (): void => {
            state.over = false;
            lastX = lastY = NaN;
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerup', onUp);
        target.addEventListener('pointerleave', onLeave);
        const offFrame = frameHook(() => {
            state.dx = 0;
            state.dy = 0;
            pressedEdge.fill(0);
            releasedEdge.fill(0);
        }, PRIORITY_LAST);
        stop = () => {
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointerup', onUp);
            target.removeEventListener('pointerleave', onLeave);
            offFrame();
            stop = noop;
        };
        tryOnDispose(() => stop());
    }

    return {
        get x() {
            return state.x;
        },
        get y() {
            return state.y;
        },
        get dx() {
            return state.dx;
        },
        get dy() {
            return state.dy;
        },
        get buttons() {
            return state.buttons;
        },
        get over() {
            return state.over;
        },
        isDown: (button = 0) => down[button] === 1,
        justPressed: (button = 0) => pressedEdge[button] === 1,
        justReleased: (button = 0) => releasedEdge[button] === 1,
        stop: () => stop()
    };
}
