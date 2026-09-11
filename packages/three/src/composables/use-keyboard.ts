import { frameHook, PRIORITY_LAST } from '../shared/frame-hook.js';
import { isBrowser, noop, tryOnDispose } from '../shared/scope.js';
import type { Stop } from '../shared/types.js';

export interface Keyboard {
    /** Held right now (`KeyboardEvent.code`: `'KeyW'`, `'Space'`, `'ArrowUp'`, …). */
    isDown(code: string): boolean;
    /** Went down since the previous frame. */
    justPressed(code: string): boolean;
    /** Came up since the previous frame. */
    justReleased(code: string): boolean;
    /** Every held code. Do not mutate. */
    readonly pressed: ReadonlySet<string>;
    /** Whether the keyboard is being tracked (false on the server). */
    readonly active: boolean;
    stop: Stop;
}

export interface UseKeyboardOptions {
    /** Where to listen. Default `window`. */
    target?: EventTarget;
    /** Call `preventDefault()` on tracked keys (stops the page scrolling on Space/arrows). Default false. */
    preventDefault?: boolean | ((code: string) => boolean);
}

/**
 * Polled keyboard state for game loops: `isDown` for held keys, `justPressed`
 * / `justReleased` for frame-accurate edges (cleared at the end of every
 * frame — read them in `useFrame`). Auto-repeat is ignored; losing focus
 * releases everything. Stops with the component / scope.
 *
 * @example
 * ```ts
 * const keys = useKeyboard();
 * useFrame((_, dt) => {
 *     if (keys.isDown('KeyW')) ship.position.z -= dt * speed;
 *     if (keys.justPressed('Space')) fire();
 * });
 * ```
 */
export function useKeyboard(options: UseKeyboardOptions = {}): Keyboard {
    const pressed = new Set<string>();
    const pressedEdge = new Set<string>();
    const releasedEdge = new Set<string>();
    let active = false;
    let stop: Stop = noop;

    if (isBrowser) {
        const target = options.target ?? window;
        const shouldPrevent = (code: string): boolean =>
            typeof options.preventDefault === 'function' ? options.preventDefault(code) : options.preventDefault === true;
        const onDown = (e: Event): void => {
            const ke = e as KeyboardEvent;
            if (ke.repeat) {
                if (shouldPrevent(ke.code)) ke.preventDefault();
                return;
            }
            if (!pressed.has(ke.code)) {
                pressed.add(ke.code);
                pressedEdge.add(ke.code);
            }
            if (shouldPrevent(ke.code)) ke.preventDefault();
        };
        const onUp = (e: Event): void => {
            const ke = e as KeyboardEvent;
            if (pressed.delete(ke.code)) releasedEdge.add(ke.code);
        };
        const onBlur = (): void => {
            for (const code of pressed) releasedEdge.add(code);
            pressed.clear();
        };
        target.addEventListener('keydown', onDown);
        target.addEventListener('keyup', onUp);
        window.addEventListener('blur', onBlur);
        const offFrame = frameHook(() => {
            pressedEdge.clear();
            releasedEdge.clear();
        }, PRIORITY_LAST);
        active = true;
        stop = () => {
            if (!active) return;
            active = false;
            target.removeEventListener('keydown', onDown);
            target.removeEventListener('keyup', onUp);
            window.removeEventListener('blur', onBlur);
            offFrame();
            pressed.clear();
            pressedEdge.clear();
            releasedEdge.clear();
        };
        tryOnDispose(stop);
    }

    return {
        isDown: (code) => pressed.has(code),
        justPressed: (code) => pressedEdge.has(code),
        justReleased: (code) => releasedEdge.has(code),
        pressed,
        get active() {
            return active;
        },
        stop: () => stop()
    };
}
