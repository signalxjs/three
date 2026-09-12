import { describe, expect, it } from 'vitest';
import { getDefaultMount } from '@sigx/runtime-core/internals';

describe('entry import safety', () => {
    it('importing the main entry registers no default mount and touches no globals', async () => {
        expect(typeof (globalThis as any).window).toBe('undefined');
        const before = getDefaultMount();
        const mod = await import('@sigx/runtime-three');
        expect(typeof mod.createRoot).toBe('function');
        expect(getDefaultMount()).toBe(before);
    });

    it('importing ./platform registers threeMount as the default mount', async () => {
        const { threeMount } = await import('@sigx/runtime-three');
        await import('@sigx/runtime-three/platform');
        expect(getDefaultMount()).toBe(threeMount);
    });
});
