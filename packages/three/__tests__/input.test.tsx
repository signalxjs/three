// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { component, jsx } from '@sigx/runtime-core';
import { useActionMap, useKeyboard, useGamepad, usePointer, GamepadAxis, type Keyboard, type ActionMap, type PointerState } from '@sigx/three';
import { createTestRoot } from '../../runtime-three/__tests__/harness.js';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): void {
    window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
}

describe('useKeyboard', () => {
    it('tracks held keys and frame-accurate edges inside a three root', () => {
        const t = createTestRoot();
        let keys: Keyboard | null = null;
        const Probe = component(() => {
            keys = useKeyboard();
            return () => null;
        });
        t.render(jsx(Probe, {}));
        const k = keys!;
        expect(k.active).toBe(true);
        key('keydown', 'KeyW');
        expect(k.isDown('KeyW')).toBe(true);
        expect(k.justPressed('KeyW')).toBe(true);
        key('keydown', 'KeyW', true); // auto-repeat is ignored
        t.state.advance(1 / 60);       // frame end clears edges
        expect(k.isDown('KeyW')).toBe(true);
        expect(k.justPressed('KeyW')).toBe(false);
        key('keyup', 'KeyW');
        expect(k.isDown('KeyW')).toBe(false);
        expect(k.justReleased('KeyW')).toBe(true);
        t.state.advance(1 / 60);
        expect(k.justReleased('KeyW')).toBe(false);
        key('keydown', 'Space');
        window.dispatchEvent(new Event('blur'));
        expect(k.isDown('Space')).toBe(false);
        expect(k.justReleased('Space')).toBe(true);
        t.render(null); // unmount stops listening
        key('keydown', 'KeyA');
        expect(k.isDown('KeyA')).toBe(false);
        t.unmount();
    });

    it('works outside a three root on requestAnimationFrame', () => {
        const k = useKeyboard();
        key('keydown', 'KeyQ');
        expect(k.isDown('KeyQ')).toBe(true);
        k.stop();
        key('keydown', 'KeyE');
        expect(k.isDown('KeyE')).toBe(false);
    });
});

describe('useGamepad', () => {
    it('polls the standard mapping into typed arrays with deadzone and edges', () => {
        const pad = {
            buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
            axes: [0, 0, 0, 0],
            connected: true
        };
        const getGamepads = vi.fn(() => [pad, null, null, null]);
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads });
        const t = createTestRoot();
        let g: ReturnType<typeof useGamepad> | null = null;
        const Probe = component(() => {
            g = useGamepad(0, { deadzone: 0.2 });
            return () => null;
        });
        t.render(jsx(Probe, {}));
        const gp = g!;
        expect(gp.connected.value).toBe(false);
        pad.buttons[0].value = 1;
        pad.axes[0] = 0.1;
        pad.axes[1] = -0.7;
        t.state.advance(1 / 60);
        expect(gp.connected.value).toBe(true);
        expect(gp.isDown(0)).toBe(true);
        expect(gp.justPressed(0)).toBe(true);
        expect(gp.axis(GamepadAxis.LeftX)).toBe(0);
        expect(gp.axis(GamepadAxis.LeftY)).toBeCloseTo(-0.7);
        t.state.advance(1 / 60);
        expect(gp.justPressed(0)).toBe(false);
        pad.buttons[0].value = 0;
        t.state.advance(1 / 60);
        expect(gp.justReleased(0)).toBe(true);
        expect(gp.isDown(0)).toBe(false);
        t.unmount();
    });
});

describe('useActionMap', () => {
    it('maps keyboard and gamepad bindings to named actions and axes', () => {
        const pad = {
            buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
            axes: [0, 0, 0, 0],
            connected: true
        };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
        const t = createTestRoot();
        let input: ActionMap<'thrust' | 'fire', 'turn'> | null = null;
        const Probe = component(() => {
            input = useActionMap(
                { thrust: ['KeyW', 'GamepadA'], fire: ['Space', 'GamepadRT'] },
                { axes: { turn: { neg: ['KeyA'], pos: ['KeyD'], stick: GamepadAxis.LeftX } } }
            );
            return () => null;
        });
        t.render(jsx(Probe, {}));
        const i = input!;
        expect(i.isDown('thrust')).toBe(false);
        key('keydown', 'KeyW');
        expect(i.isDown('thrust')).toBe(true);
        expect(i.justPressed('thrust')).toBe(true);
        key('keydown', 'KeyD');
        expect(i.axis('turn')).toBe(1);
        key('keyup', 'KeyD');
        key('keydown', 'KeyA');
        expect(i.axis('turn')).toBe(-1);
        key('keyup', 'KeyA');
        pad.axes[0] = 0.5;
        t.state.advance(1 / 60);
        expect(i.axis('turn')).toBeCloseTo(0.5);
        pad.buttons[7].value = 1; // RT
        t.state.advance(1 / 60);
        expect(i.isDown('fire')).toBe(true);
        expect(i.justPressed('fire')).toBe(true);
        t.unmount();
    });
});

describe('usePointer', () => {
    it('tracks NDC position, per-frame deltas and button edges on a target', () => {
        const target = document.createElement('div');
        Object.defineProperty(target, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100 }) });
        const t = createTestRoot();
        let p: PointerState | null = null;
        const Probe = component(() => {
            p = usePointer({ target });
            return () => null;
        });
        t.render(jsx(Probe, {}));
        const ptr = p!;
        target.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 25, buttons: 0 }));
        expect(ptr.x).toBeCloseTo(0.5);
        expect(ptr.y).toBeCloseTo(0.5);
        target.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, clientY: 30 }));
        expect(ptr.dx).toBe(10);
        expect(ptr.dy).toBe(5);
        target.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1 }));
        expect(ptr.isDown()).toBe(true);
        expect(ptr.justPressed()).toBe(true);
        t.state.advance(1 / 60);
        expect(ptr.dx).toBe(0);
        expect(ptr.justPressed()).toBe(false);
        window.dispatchEvent(new PointerEvent('pointerup', { button: 0, buttons: 0 }));
        expect(ptr.isDown()).toBe(false);
        expect(ptr.justReleased()).toBe(true);
        t.unmount();
    });
});
