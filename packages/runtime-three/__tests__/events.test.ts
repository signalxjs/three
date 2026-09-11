import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { jsx, component, defineApp } from '@sigx/runtime-core';
import { objectRef, type ThreeEvent } from '@sigx/runtime-three';
import { createTestRoot, type TestRoot } from './harness.js';

/** A unit plane at the origin facing the default camera at z = 5: the canvas centre hits it, a corner misses. */
function planeRoot(props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): TestRoot {
    const t = createTestRoot({ events: { target: undefined }, ...extra });
    t.render(jsx('mesh', { ...props, children: [jsx('planeGeometry', { args: [1, 1] }), jsx('meshBasicMaterial', {})] }));
    return t;
}

const CENTER = { clientX: 420, clientY: 280, pointerId: 1 };
const CORNER = { clientX: 5, clientY: 5, pointerId: 1 };
// The default camera (z = 5, fov 75) over an 800×600 canvas sees ~0.0128 world
// units per pixel at z = 0, so world (-2, 1.5) is at pixel (244, 183).
const SIDE = { clientX: 244, clientY: 183, pointerId: 1 };
const SIDE_POSITION: [number, number, number] = [-2, 1.5, 0];

describe('pointer events', () => {
    it('creates an event manager when a target is given and none without', () => {
        const t = createTestRoot();
        expect(t.root.events).toBeNull();
        const t2 = createTestRoot({ events: { target: undefined } });
        expect(t2.root.events).not.toBeNull();
        t.unmount();
        t2.unmount();
    });

    it('a click at the centre hits the plane, a click at the corner misses', () => {
        const onClick = vi.fn();
        const onPointerMissed = vi.fn();
        const t = planeRoot({ onClick, onPointerMissed });
        t.root.events!.handle('click', CENTER);
        expect(onClick).toHaveBeenCalledTimes(1);
        const e = onClick.mock.calls[0][0] as ThreeEvent;
        expect(e.object).toBeInstanceOf(THREE.Mesh);
        expect(e.eventObject).toBe(e.object);
        expect(e.point.z).toBeCloseTo(0);
        expect(e.intersections).toHaveLength(1);
        expect(e.camera).toBe(t.state.camera);
        expect(onPointerMissed).not.toHaveBeenCalled();
        t.root.events!.handle('click', CORNER);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onPointerMissed).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('only objects with handlers are raycast; handlers bubble to a group', () => {
        const t = createTestRoot({ events: { target: undefined } });
        const onClick = vi.fn();
        const plain = objectRef<THREE.Mesh>();
        t.render(jsx('group', {
            onClick,
            children: [
                jsx('mesh', { ref: plain, children: [jsx('planeGeometry', { args: [1, 1] })] }),
                jsx('mesh', { position: [10, 10, 10], children: [jsx('planeGeometry', { args: [1, 1] })] })
            ]
        }));
        expect(t.root.interactive.objects).toHaveLength(1);
        expect(t.root.interactive.objects[0]).toBeInstanceOf(THREE.Group);
        t.root.events!.handle('click', CENTER);
        expect(onClick).toHaveBeenCalledTimes(1);
        const e = onClick.mock.calls[0][0] as ThreeEvent;
        expect(e.object).toBe(plain.current);          // the hit
        expect(e.eventObject).toBeInstanceOf(THREE.Group); // the handler owner
        t.unmount();
    });

    it('stopPropagation ends bubbling and skips farther hits', () => {
        const t = createTestRoot({ events: { target: undefined } });
        const log: string[] = [];
        t.render(jsx('group', {
            onClick: () => log.push('group'),
            children: [
                jsx('mesh', { onClick: (e: ThreeEvent) => { log.push('front'); e.stopPropagation(); }, position: [0, 0, 1], children: [jsx('planeGeometry', { args: [1, 1] })] }),
                jsx('mesh', { onClick: () => log.push('back'), children: [jsx('planeGeometry', { args: [1, 1] })] })
            ]
        }));
        t.root.events!.handle('click', CENTER);
        expect(log).toEqual(['front']);
        t.unmount();
    });

    it('re-rendering swaps the handler without churning the registry', () => {
        const t = createTestRoot({ events: { target: undefined } });
        const a = vi.fn();
        const b = vi.fn();
        const App = component<{ handler: (e: ThreeEvent) => void }>((ctx) => () =>
            jsx('mesh', { onClick: ctx.props.handler, children: [jsx('planeGeometry', { args: [1, 1] })] })
        );
        t.render(jsx(App, { handler: a }));
        const node = t.root.interactive.nodes[0];
        const invoker = node.handlers![0];
        t.render(jsx(App, { handler: b }));
        expect(t.root.interactive.nodes[0]).toBe(node);
        expect(node.handlers![0]).toBe(invoker);
        t.root.events!.handle('click', CENTER);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledTimes(1);
        t.render(null);
        expect(t.root.interactive.objects).toHaveLength(0);
        t.unmount();
    });

    it('tracks hover: over/enter on entry, out/leave on exit and on pointerleave', () => {
        const log: string[] = [];
        const t = planeRoot({
            onPointerOver: () => log.push('over'),
            onPointerEnter: () => log.push('enter'),
            onPointerOut: () => log.push('out'),
            onPointerLeave: () => log.push('leave'),
            onPointerMove: () => log.push('move')
        });
        const ev = t.root.events!;
        ev.handle('pointermove', CENTER);
        expect(log.join()).toBe('over,enter,move');
        ev.handle('pointermove', { ...CENTER, clientX: 421 });
        expect(log.join()).toBe('over,enter,move,move');
        ev.handle('pointermove', CORNER);
        expect(log.join()).toBe('over,enter,move,move,out,leave');
        ev.handle('pointermove', CENTER);
        ev.handle('pointerleave', CORNER);
        expect(log.slice(6).join()).toBe('over,enter,move,out,leave');
        t.unmount();
    });

    it('delta measures pointer travel since pointerdown', () => {
        const onClick = vi.fn();
        const t = planeRoot({ onClick });
        const ev = t.root.events!;
        ev.handle('pointerdown', { clientX: 420, clientY: 280 });
        ev.handle('click', { clientX: 423, clientY: 284 });
        expect((onClick.mock.calls[0][0] as ThreeEvent).delta).toBe(5);
        t.unmount();
    });

    it('pointer capture routes events to the captor until pointerup', () => {
        const captured = vi.fn();
        const other = vi.fn();
        const t = createTestRoot({ events: { target: undefined } });
        t.render(jsx('group', {
            children: [
                jsx('mesh', { name: 'a', onPointerDown: (e: ThreeEvent) => e.setPointerCapture(1), onPointerMove: captured, children: [jsx('planeGeometry', { args: [1, 1] })] }),
                jsx('mesh', { name: 'b', position: SIDE_POSITION, onPointerMove: other, children: [jsx('planeGeometry', { args: [1, 1] })] })
            ]
        }));
        const ev = t.root.events!;
        ev.handle('pointerdown', CENTER);
        ev.handle('pointermove', SIDE); // over "b" geometrically, but captured by "a"
        expect(captured).toHaveBeenCalledTimes(1);
        expect(other).not.toHaveBeenCalled();
        expect((captured.mock.calls[0][0] as ThreeEvent).eventObject.name).toBe('a');
        ev.handle('pointerup', SIDE);
        ev.handle('pointermove', SIDE);
        expect(captured).toHaveBeenCalledTimes(1);
        expect(other).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('wheel, contextmenu and dblclick dispatch to their slots', () => {
        const onWheel = vi.fn();
        const onContextMenu = vi.fn();
        const onDoubleClick = vi.fn();
        const t = planeRoot({ onWheel, onContextMenu, onDoubleClick });
        t.root.events!.handle('wheel', { ...CENTER, deltaY: 3 });
        t.root.events!.handle('contextmenu', CENTER);
        t.root.events!.handle('dblclick', CENTER);
        expect(onWheel).toHaveBeenCalledTimes(1);
        expect(onContextMenu).toHaveBeenCalledTimes(1);
        expect(onDoubleClick).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('a filter can narrow the hits', () => {
        const onClick = vi.fn();
        const t = createTestRoot({ events: { target: undefined, filter: (hits) => hits.slice(0, 1) } });
        t.render(jsx('group', {
            children: [
                jsx('mesh', { onClick, position: [0, 0, 1], children: [jsx('planeGeometry', { args: [1, 1] })] }),
                jsx('mesh', { onClick, children: [jsx('planeGeometry', { args: [1, 1] })] })
            ]
        }));
        t.root.events!.handle('click', CENTER);
        expect(onClick).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('handler errors route through the app error handler', () => {
        const t = createTestRoot({ events: { target: undefined } });
        const app = defineApp(jsx('mesh', {}));
        const seen: unknown[] = [];
        app.onError((err) => { seen.push(err); return true; });
        t.render(jsx('mesh', { onClick: () => { throw new Error('click boom'); }, children: [jsx('planeGeometry', { args: [1, 1] })] }), app._context);
        expect(() => t.root.events!.handle('click', CENTER)).not.toThrow();
        expect(seen).toHaveLength(1);
        expect((seen[0] as Error).message).toBe('click boom');
        t.unmount();
    });

    it('listens on a real EventTarget and stops on unmount', () => {
        const target = new EventTarget() as EventTarget & { setPointerCapture?: () => void };
        const onClick = vi.fn();
        const t = createTestRoot({ events: { target } });
        t.render(jsx('mesh', { onClick, children: [jsx('planeGeometry', { args: [1, 1] })] }));
        const click = Object.assign(new Event('click'), CENTER);
        target.dispatchEvent(click);
        expect(onClick).toHaveBeenCalledTimes(1);
        t.unmount();
        target.dispatchEvent(Object.assign(new Event('click'), CENTER));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
