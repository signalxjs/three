import { describe, expect, it } from 'vitest';

describe('@sigx/runtime-three (scaffold)', () => {
    it('the package entry resolves through the workspace alias', async () => {
        const mod = await import('@sigx/runtime-three');
        expect(typeof mod).toBe('object');
    });

    it('three resolves as a peer in the node environment', async () => {
        const { Scene, Mesh } = await import('three');
        const scene = new Scene();
        scene.add(new Mesh());
        expect(scene.children).toHaveLength(1);
    });
});
