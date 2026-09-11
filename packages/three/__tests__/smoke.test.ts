import { describe, expect, it } from 'vitest';

describe('@sigx/three (scaffold)', () => {
    it('the package entry resolves through the workspace alias', async () => {
        const mod = await import('@sigx/three');
        expect(typeof mod).toBe('object');
    });
});
