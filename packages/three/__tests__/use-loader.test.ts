// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { effect, signal } from '@sigx/reactivity';
import { clearLoaderCache, preload, useLoader } from '@sigx/three';

/** A loader whose loads resolve on demand. */
class StubLoader {
    static pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
    static instances = 0;
    constructor() {
        StubLoader.instances++;
    }
    loadAsync(url: string): Promise<unknown> {
        return new Promise((resolve, reject) => StubLoader.pending.set(url, { resolve, reject }));
    }
    static settle(url: string, value: unknown): Promise<void> {
        StubLoader.pending.get(url)!.resolve(value);
        StubLoader.pending.delete(url);
        return Promise.resolve();
    }
    static fail(url: string, error: unknown): Promise<void> {
        StubLoader.pending.get(url)!.reject(error);
        StubLoader.pending.delete(url);
        return Promise.resolve();
    }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('useLoader', () => {
    it('loads, exposes value-first state, and reacts', async () => {
        clearLoaderCache();
        const result = useLoader(StubLoader, '/a.glb');
        const seen: string[] = [];
        effect(() => { seen.push(result.state); });
        expect(result.loading).toBe(true);
        expect(result.value).toBeNull();
        const asset = { id: 'a' };
        await StubLoader.settle('/a.glb', asset);
        await flush();
        expect(result.state).toBe('ready');
        expect(result.value).toBe(asset);
        expect(result.loading).toBe(false);
        expect(seen).toEqual(['pending', 'ready']);
    });

    it('dedupes concurrent loads and hits the cache synchronously afterwards', async () => {
        clearLoaderCache();
        StubLoader.instances = 0;
        const a = useLoader(StubLoader, '/shared.glb');
        const b = useLoader(StubLoader, '/shared.glb');
        expect(StubLoader.pending.size).toBe(1);
        expect(StubLoader.instances).toBeLessThanOrEqual(1); // one loader instance per constructor, reused across tests
        const asset = { id: 'shared' };
        await StubLoader.settle('/shared.glb', asset);
        await flush();
        expect(a.value).toBe(asset);
        expect(b.value).toBe(asset);
        const c = useLoader(StubLoader, '/shared.glb');
        expect(c.state).toBe('ready'); // no pending flash
        expect(c.value).toBe(asset);
    });

    it('reports errors', async () => {
        clearLoaderCache();
        const result = useLoader(StubLoader, '/bad.glb');
        await StubLoader.fail('/bad.glb', new Error('404'));
        await flush();
        expect(result.state).toBe('error');
        expect((result.error as Error).message).toBe('404');
        expect(result.value).toBeNull();
    });

    it('a reactive url clears the value and reloads; a stale load is ignored', async () => {
        clearLoaderCache();
        const url = signal('/one.glb');
        const result = useLoader(StubLoader, url);
        const one = { id: 1 };
        await StubLoader.settle('/one.glb', one);
        await flush();
        expect(result.value).toBe(one);
        url.value = '/two.glb';
        expect(result.value).toBeNull();
        expect(result.state).toBe('pending');
        const two = { id: 2 };
        await StubLoader.settle('/two.glb', two);
        await flush();
        expect(result.value).toBe(two);
        url.value = '/one.glb'; // cache hit: synchronous
        expect(result.value).toBe(one);
    });

    it('loads a list, and preload warms the cache', async () => {
        clearLoaderCache();
        const p = preload(StubLoader, ['/x', '/y']);
        await StubLoader.settle('/x', 'X');
        await StubLoader.settle('/y', 'Y');
        await p;
        const result = useLoader(StubLoader, ['/x', '/y']);
        expect(result.state).toBe('ready');
        expect(result.value).toEqual(['X', 'Y']);
    });

    it('clearLoaderCache disposes owned assets and reload fetches afresh', async () => {
        clearLoaderCache();
        const dispose = vi.fn();
        const result = useLoader(StubLoader, '/tex');
        await StubLoader.settle('/tex', { dispose });
        await flush();
        expect(result.state).toBe('ready');
        result.reload();
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(result.state).toBe('pending');
        await StubLoader.settle('/tex', { dispose: vi.fn() });
        await flush();
        expect(result.state).toBe('ready');
        clearLoaderCache(StubLoader);
    });

    it('passes the extensions hook once per loader instance', async () => {
        clearLoaderCache();
        StubLoader.instances = 0;
        const ext = vi.fn();
        useLoader(StubLoader, '/e1', { extensions: ext });
        useLoader(StubLoader, '/e2', { extensions: ext });
        expect(ext).toHaveBeenCalledTimes(1);
        expect(StubLoader.instances).toBe(1);
        await StubLoader.settle('/e1', 1);
        await StubLoader.settle('/e2', 2);
    });
});
