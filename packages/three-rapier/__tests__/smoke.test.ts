import { describe, expect, it } from 'vitest';

describe('@sigx/three-rapier (scaffold)', () => {
    it('the package entry resolves through the workspace alias', async () => {
        const mod = await import('@sigx/three-rapier');
        expect(typeof mod).toBe('object');
    });

    it('the rapier wasm build initialises under Node', async () => {
        const RAPIER = await import('@dimforge/rapier3d-compat');
        await RAPIER.init();
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        expect(world.gravity.y).toBeCloseTo(-9.81);
        world.free();
    });
});
