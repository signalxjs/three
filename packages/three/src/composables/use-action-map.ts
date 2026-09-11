import { GamepadAxis, GamepadButton, useGamepad, type GamepadState } from './use-gamepad.js';
import { useKeyboard, type Keyboard } from './use-keyboard.js';
import type { Stop } from '../shared/types.js';

/** A keyboard `code` (`'KeyW'`, `'Space'`, …) or a gamepad button name (`'GamepadA'`, `'GamepadRT'`, `'GamepadUp'`, …). */
export type Binding =
    | (string & {})
    | 'GamepadA' | 'GamepadB' | 'GamepadX' | 'GamepadY'
    | 'GamepadLB' | 'GamepadRB' | 'GamepadLT' | 'GamepadRT'
    | 'GamepadBack' | 'GamepadStart' | 'GamepadLS' | 'GamepadRS'
    | 'GamepadUp' | 'GamepadDown' | 'GamepadLeft' | 'GamepadRight' | 'GamepadHome';

export interface AxisBinding {
    /** Bindings that pull the axis to -1. */
    neg?: Binding[];
    /** Bindings that push the axis to +1. */
    pos?: Binding[];
    /** A gamepad stick axis (`GamepadAxis.LeftX` …) that drives it analogically. */
    stick?: number;
    invert?: boolean;
}

export interface ActionMap<A extends string, X extends string> {
    isDown(action: A): boolean;
    justPressed(action: A): boolean;
    justReleased(action: A): boolean;
    /** -1..1: digital bindings give -1/0/1, a stick gives its value (digital wins when held). */
    axis(axis: X): number;
    readonly keyboard: Keyboard;
    readonly gamepad: GamepadState;
    stop: Stop;
}

export interface UseActionMapOptions<X extends string> {
    axes?: Record<X, AxisBinding>;
    /** Gamepad index. Default 0. */
    gamepad?: number;
    /** Forwarded to `useKeyboard`. */
    preventDefault?: boolean | ((code: string) => boolean);
}

const GAMEPAD_NAMES: Record<string, number> = {
    GamepadA: GamepadButton.A, GamepadB: GamepadButton.B, GamepadX: GamepadButton.X, GamepadY: GamepadButton.Y,
    GamepadLB: GamepadButton.LB, GamepadRB: GamepadButton.RB, GamepadLT: GamepadButton.LT, GamepadRT: GamepadButton.RT,
    GamepadBack: GamepadButton.Back, GamepadStart: GamepadButton.Start, GamepadLS: GamepadButton.LS, GamepadRS: GamepadButton.RS,
    GamepadUp: GamepadButton.Up, GamepadDown: GamepadButton.Down, GamepadLeft: GamepadButton.Left, GamepadRight: GamepadButton.Right,
    GamepadHome: GamepadButton.Home
};

interface Resolved {
    keys: string[];
    buttons: number[];
}

function resolve(bindings: Binding[] | undefined): Resolved {
    const r: Resolved = { keys: [], buttons: [] };
    if (!bindings) return r;
    for (const b of bindings) {
        const button = GAMEPAD_NAMES[b];
        if (button !== undefined) r.buttons.push(button);
        else r.keys.push(b);
    }
    return r;
}

/**
 * Name your controls once, read them by name in `useFrame`. Bindings are
 * keyboard codes and gamepad button names; axes combine digital bindings with
 * an optional analog stick. Pre-resolved at creation — every read is a short
 * loop, no lookups or allocations.
 *
 * @example
 * ```ts
 * const input = useActionMap(
 *     { thrust: ['KeyW', 'ArrowUp', 'GamepadA'], fire: ['Space', 'GamepadRT'] },
 *     { axes: { turn: { neg: ['KeyA', 'ArrowLeft'], pos: ['KeyD', 'ArrowRight'], stick: GamepadAxis.LeftX } } }
 * );
 * useFrame((_, dt) => {
 *     ship.rotation.y -= input.axis('turn') * dt * 2;
 *     if (input.isDown('thrust')) accelerate(dt);
 *     if (input.justPressed('fire')) fire();
 * });
 * ```
 */
export function useActionMap<A extends string, X extends string = never>(
    actions: Record<A, Binding[]>,
    options: UseActionMapOptions<X> = {}
): ActionMap<A, X> {
    const keyboard = useKeyboard({ preventDefault: options.preventDefault });
    const gamepad = useGamepad(options.gamepad ?? 0);

    const resolvedActions = Object.create(null) as Record<A, Resolved>;
    for (const name in actions) resolvedActions[name] = resolve(actions[name]);

    const resolvedAxes = Object.create(null) as Record<X, { neg: Resolved; pos: Resolved; stick: number; sign: number }>;
    if (options.axes) {
        for (const name in options.axes) {
            const a = options.axes[name];
            resolvedAxes[name] = { neg: resolve(a.neg), pos: resolve(a.pos), stick: a.stick ?? -1, sign: a.invert ? -1 : 1 };
        }
    }

    const any = (r: Resolved, key: (code: string) => boolean, button: (b: number) => boolean): boolean => {
        for (let i = 0; i < r.keys.length; i++) if (key(r.keys[i])) return true;
        for (let i = 0; i < r.buttons.length; i++) if (button(r.buttons[i])) return true;
        return false;
    };

    return {
        isDown: (action) => any(resolvedActions[action], keyboard.isDown, gamepad.isDown),
        justPressed: (action) => any(resolvedActions[action], keyboard.justPressed, gamepad.justPressed),
        justReleased: (action) => any(resolvedActions[action], keyboard.justReleased, gamepad.justReleased),
        axis: (axis) => {
            const a = resolvedAxes[axis];
            if (a === undefined) return 0;
            const neg = any(a.neg, keyboard.isDown, gamepad.isDown);
            const pos = any(a.pos, keyboard.isDown, gamepad.isDown);
            let v = (pos ? 1 : 0) - (neg ? 1 : 0);
            if (v === 0 && a.stick >= 0) v = gamepad.axis(a.stick);
            return v * a.sign;
        },
        keyboard,
        gamepad,
        stop: () => {
            keyboard.stop();
            gamepad.stop();
        }
    };
}

export { GamepadAxis, GamepadButton };
