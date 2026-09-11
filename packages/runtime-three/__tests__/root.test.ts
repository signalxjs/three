import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { jsx, component, defineInjectable, defineProvide, useAppContext, defineApp } from '@sigx/runtime-core';
import { createRoot, useThree, threeMount, ROOT_TOKEN } from '@sigx/runtime-three';
import { getProvided } from '@sigx/runtime-core/internals';
import { createTestRoot, fakeGL, manualScheduler } from './harness.js';

describe('root', () => {
    it('setSize updates the renderer, the camera aspect and the reactive size', () => {
        const t = createTestRoot();
        const cam = t.state.camera as THREE.PerspectiveCamera;
        expect(cam.aspect).toBeCloseTo(800 / 600);
        expect(t.gl.sizes.at(-1)).toEqual([800, 600]);
        t.state.setSize(400, 400, 2);
        expect(cam.aspect).toBe(1);
        expect(t.gl.sizes.at(-1)).toEqual([400, 400]);
        expect(t.gl.pixelRatios.at(-1)).toBe(2);
        expect(t.state.reactive.width).toBe(400);
        expect(t.state.reactive.dpr).toBe(2);
        t.unmount();
    });

    it('an orthographic camera gets its bounds from the size unless manual', () => {
        const ortho = new THREE.OrthographicCamera();
        const t = createTestRoot({ camera: ortho });
        expect(ortho.left).toBe(-400);
        expect(ortho.top).toBe(300);
        const manual = new THREE.OrthographicCamera(-1, 1, 1, -1);
        const t2 = createTestRoot({ camera: Object.assign(manual, { manual: true }) });
        expect(manual.left).toBe(-1);
        t.unmount();
        t2.unmount();
    });

    it('camera options build a PerspectiveCamera at the given position, looking at a point', () => {
        const t = createTestRoot({ camera: { fov: 50, position: [0, 0, 10], near: 1, far: 100, lookAt: [10, 0, 10] } });
        const cam = t.state.camera as THREE.PerspectiveCamera;
        expect(cam.fov).toBe(50);
        expect(cam.near).toBe(1);
        expect(cam.position.toArray()).toEqual([0, 0, 10]);
        const dir = cam.getWorldDirection(new THREE.Vector3());
        expect(dir.x).toBeCloseTo(1);
        expect(dir.z).toBeCloseTo(0);
        t.unmount();
    });

    it('applies shadows to the renderer', () => {
        const t = createTestRoot({ shadows: 'vsm' });
        expect(t.gl.shadowMap.enabled).toBe(true);
        expect(t.gl.shadowMap.type).toBe(THREE.VSMShadowMap);
        t.unmount();
    });

    it('accepts an async gl factory and renders once it resolves', async () => {
        const gl = fakeGL();
        const root = createRoot(null, {
            gl: () => Promise.resolve(gl),
            scheduler: manualScheduler(),
            size: { width: 10, height: 10 },
            frameloop: 'never'
        });
        expect(root.store.gl).toBeNull();
        root.advance(0.01);
        expect(gl.calls).toHaveLength(0);
        await root.ready;
        expect(root.store.gl).toBe(gl);
        root.advance(0.01);
        expect(gl.calls).toHaveLength(1);
        root.unmount();
        expect(gl.disposed).toBe(1);
    });

    it('does not dispose a renderer instance it was given', () => {
        const t = createTestRoot();
        t.unmount();
        expect(t.gl.disposed).toBe(0);
        t.unmount(); // idempotent
    });

    it('useThree resolves the store inside the tree and throws outside', () => {
        const t = createTestRoot();
        let seen: unknown = null;
        const Probe = component(() => {
            seen = useThree();
            return () => null;
        });
        t.render(jsx(Probe, {}));
        expect(seen).toBe(t.state);
        expect(() => useThree()).toThrow(/sigx:three:root/);
        t.unmount();
    });

    it('parentInstance bridges provide/inject and the app context from another tree', () => {
        const t = createTestRoot();
        const useTheme = defineInjectable<string>('Theme');
        let injected: string | null = null;
        let appSeen: unknown = 'unset';
        const Inner = component(() => {
            injected = useTheme();
            appSeen = useAppContext();
            return () => jsx('mesh', {});
        });
        const app = defineApp(jsx('mesh', {}));
        let outerCtx: any = null;
        const Outer = component((ctx) => {
            outerCtx = ctx;
            defineProvide(useTheme, () => 'dark');
            return () => null;
        });
        // Mount Outer in its own (headless) three root just to get a live instance.
        const host = createTestRoot();
        host.render(jsx(Outer, {}), app._context);
        expect(outerCtx).not.toBeNull();
        t.render(jsx(Inner, {}), app._context, outerCtx);
        expect(injected).toBe('dark');
        expect(appSeen).toBe(app._context);
        host.unmount();
        t.unmount();
    });

    it('threeMount provides the store at app level and returns an unmount', () => {
        const gl = fakeGL();
        const app = defineApp(jsx('mesh', { name: 'root-mesh' }));
        const off = threeMount(jsx('mesh', { name: 'root-mesh' }), { target: null, gl, scheduler: manualScheduler(), size: { width: 1, height: 1 }, frameloop: 'never' }, app._context);
        expect(getProvided(app._context.provides, ROOT_TOKEN)).toBeDefined();
        const store = getProvided(app._context.provides, ROOT_TOKEN)!;
        expect(store.scene.children[0].name).toBe('root-mesh');
        off?.();
        expect(store.scene.children).toHaveLength(0);
    });
});
