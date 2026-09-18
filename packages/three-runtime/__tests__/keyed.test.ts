import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { jsx, component, signal } from '@sigx/runtime-core';
import { createTestRoot } from './harness.js';

function names(scene: THREE.Scene): string[] {
    return (scene.children[0] as THREE.Group).children.map((c) => c.name);
}

describe('keyed children', () => {
    it('reversing and shuffling keeps object identity and matches the declared order', () => {
        const t = createTestRoot();
        const order = signal({ list: Array.from({ length: 200 }, (_, i) => i) });
        const List = component(() => () =>
            jsx('group', { children: order.list.map((i) => jsx('mesh', { key: i, name: `m${i}` })) })
        );
        t.render(jsx(List, {}));
        const group = t.scene.children[0] as THREE.Group;
        const byName = new Map(group.children.map((c) => [c.name, c]));
        const disposeSpies = group.children.map((c) => vi.spyOn(c as THREE.Mesh, 'removeFromParent'));

        order.list = order.list.slice().reverse();
        expect(names(t.scene)).toEqual(order.list.map((i) => `m${i}`));
        for (const c of group.children) expect(byName.get(c.name)).toBe(c);

        // deterministic shuffle
        let seed = 42;
        const shuffled = order.list.slice().sort(() => ((seed = (seed * 9301 + 49297) % 233280) / 233280) - 0.5);
        order.list = shuffled;
        expect(names(t.scene)).toEqual(shuffled.map((i) => `m${i}`));
        for (const c of group.children) expect(byName.get(c.name)).toBe(c);
        for (const s of disposeSpies) expect(s).not.toHaveBeenCalled();
        t.unmount();
    });

    it('insert at front, remove from the middle, append at end', () => {
        const t = createTestRoot();
        const order = signal({ list: [1, 2, 3] });
        const List = component(() => () =>
            jsx('group', { children: order.list.map((i) => jsx('mesh', { key: i, name: `m${i}` })) })
        );
        t.render(jsx(List, {}));
        order.list = [0, 1, 2, 3];
        expect(names(t.scene)).toEqual(['m0', 'm1', 'm2', 'm3']);
        order.list = [0, 1, 3];
        expect(names(t.scene)).toEqual(['m0', 'm1', 'm3']);
        order.list = [0, 1, 3, 4];
        expect(names(t.scene)).toEqual(['m0', 'm1', 'm3', 'm4']);
        t.unmount();
    });
});
