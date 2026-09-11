import { signal } from '@sigx/reactivity';
import { frameHook, PRIORITY_FIRST } from '../shared/frame-hook.js';
import { isBrowser, noop, tryOnDispose } from '../shared/scope.js';
import type { ReadSignal, Stop } from '../shared/types.js';

/** Standard-mapping button indices. */
export const GamepadButton = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5, LT: 6, RT: 7,
    Back: 8, Start: 9, LS: 10, RS: 11,
    Up: 12, Down: 13, Left: 14, Right: 15, Home: 16
} as const;

/** Standard-mapping axis indices. */
export const GamepadAxis = { LeftX: 0, LeftY: 1, RightX: 2, RightY: 3 } as const;

export interface GamepadState {
    /** Reactive: whether the pad at `index` is connected. */
    readonly connected: ReadSignal<boolean>;
    /** Button values 0..1, standard mapping, refreshed at the start of every frame. */
    readonly buttons: Float32Array;
    /** Axis values -1..1 with the deadzone applied. */
    readonly axes: Float32Array;
    isDown(button: number): boolean;
    justPressed(button: number): boolean;
    justReleased(button: number): boolean;
    axis(index: number): number;
    stop: Stop;
}

export interface UseGamepadOptions {
    /** Axis magnitude below which a stick reads 0. Default 0.1. */
    deadzone?: number;
    /** Button value above which a button counts as down. Default 0.5. */
    threshold?: number;
}

/**
 * Polled gamepad state for game loops. The pad at `index` (default 0) is
 * read into preallocated typed arrays at the start of every frame — nothing
 * allocates per frame. `justPressed` / `justReleased` are frame-accurate
 * edges. On the server / without the Gamepad API everything reads 0.
 */
export function useGamepad(index = 0, options: UseGamepadOptions = {}): GamepadState {
    const deadzone = options.deadzone ?? 0.1;
    const threshold = options.threshold ?? 0.5;
    const buttons = new Float32Array(17);
    const axes = new Float32Array(4);
    const down = new Uint8Array(17);
    const pressedEdge = new Uint8Array(17);
    const releasedEdge = new Uint8Array(17);
    const connected = signal(false);
    let stop: Stop = noop;

    if (isBrowser && typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const poll = (): void => {
            const pads = navigator.getGamepads();
            const pad = pads[index];
            pressedEdge.fill(0);
            releasedEdge.fill(0);
            if (pad === null || pad === undefined) {
                if (connected.value) {
                    connected.value = false;
                    for (let i = 0; i < 17; i++) {
                        if (down[i]) releasedEdge[i] = 1;
                        down[i] = 0;
                        buttons[i] = 0;
                    }
                    axes.fill(0);
                }
                return;
            }
            if (!connected.value) connected.value = true;
            const b = pad.buttons;
            for (let i = 0; i < 17; i++) {
                const v = i < b.length ? b[i].value : 0;
                buttons[i] = v;
                const isDown = v > threshold ? 1 : 0;
                if (isDown !== down[i]) {
                    if (isDown) pressedEdge[i] = 1;
                    else releasedEdge[i] = 1;
                    down[i] = isDown;
                }
            }
            const a = pad.axes;
            for (let i = 0; i < 4; i++) {
                const v = i < a.length ? a[i] : 0;
                axes[i] = Math.abs(v) < deadzone ? 0 : v;
            }
        };
        const offFrame = frameHook(poll, PRIORITY_FIRST);
        stop = () => {
            offFrame();
            stop = noop;
        };
        tryOnDispose(() => stop());
    }

    return {
        connected,
        buttons,
        axes,
        isDown: (button) => down[button] === 1,
        justPressed: (button) => pressedEdge[button] === 1,
        justReleased: (button) => releasedEdge[button] === 1,
        axis: (i) => axes[i],
        stop: () => stop()
    };
}
