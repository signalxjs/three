import { signal } from '@sigx/reactivity';
import { useThree } from '@sigx/runtime-three';
import { frameHook, PRIORITY_LAST } from '../shared/frame-hook.js';
import { isBrowser, noop, tryOnDispose } from '../shared/scope.js';
import type { ReadSignal, Stop } from '../shared/types.js';

export interface PointerLock {
    /** Reactive: whether the pointer is currently locked to the target. */
    readonly isLocked: ReadSignal<boolean>;
    /** Request the lock (must be called from a user gesture). */
    lock(): void;
    unlock(): void;
    /** Mouse movement since the previous frame while locked (`movementX/Y`), zeroed at frame end. */
    readonly movement: { readonly x: number; readonly y: number };
    stop: Stop;
}

export interface UsePointerLockOptions {
    /** The element to lock to. Default: the root's canvas. */
    target?: Element;
}

/**
 * Pointer lock for first-person / free-look controls: `lock()` on a click,
 * then read `movement.x/y` in `useFrame`. `Escape` (the browser's own
 * release) flips `isLocked` back.
 */
export function usePointerLock(options: UsePointerLockOptions = {}): PointerLock {
    const isLocked = signal(false);
    const movement = { x: 0, y: 0 };
    let stop: Stop = noop;
    let element: Element | null = null;

    if (isBrowser) {
        let canvas: HTMLCanvasElement | null = null;
        try {
            canvas = useThree().canvas;
        } catch {
            canvas = null;
        }
        element = options.target ?? canvas;
        const onChange = (): void => {
            isLocked.value = document.pointerLockElement === element && element !== null;
        };
        const onMove = (e: Event): void => {
            if (!isLocked.value) return;
            const me = e as MouseEvent;
            movement.x += me.movementX;
            movement.y += me.movementY;
        };
        document.addEventListener('pointerlockchange', onChange);
        document.addEventListener('mousemove', onMove);
        const offFrame = frameHook(() => {
            movement.x = 0;
            movement.y = 0;
        }, PRIORITY_LAST);
        stop = () => {
            document.removeEventListener('pointerlockchange', onChange);
            document.removeEventListener('mousemove', onMove);
            offFrame();
            stop = noop;
        };
        tryOnDispose(() => stop());
    }

    return {
        isLocked,
        lock() {
            const el = element as (Element & { requestPointerLock?: () => unknown }) | null;
            el?.requestPointerLock?.();
        },
        unlock() {
            if (isBrowser && document.pointerLockElement === element) document.exitPointerLock();
        },
        movement,
        stop: () => stop()
    };
}
