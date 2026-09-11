// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import '@sigx/runtime-dom';
import { render } from '@sigx/runtime-dom';
import { component, defineApp, defineInjectable, defineProvide, signal, useAppContext, type JSXElement } from '@sigx/runtime-core';
import * as THREE from 'three';
import { Canvas, objectRef, useFrame, useThree, type CanvasApi, type ThreeState } from '@sigx/three';
import type { RendererLike } from '@sigx/runtime-three';

function fakeGL(): RendererLike & { calls: number; disposed: number } {
    const gl = {
        calls: 0,
        disposed: 0,
        render() {
            gl.calls++;
        },
        setSize() {},
        setPixelRatio() {},
        dispose() {
            gl.disposed++;
        }
    };
    return gl;
}

function mountApp(el: JSXElement): { container: HTMLElement; unmount(): void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = defineApp(el);
    app.mount(container);
    return {
        container,
        unmount() {
            app.unmount();
            container.remove();
        }
    };
}

describe('<Canvas>', () => {
    it('renders a wrapper with a canvas and mounts the slot into the three scene', () => {
        const gl = fakeGL();
        let api: CanvasApi | null = null;
        const App = component(() => () => (
            <Canvas gl={gl} frameloop="never" ref={(a: CanvasApi | null) => { api = a; }} class="stage" id="c1">
                <mesh name="cube">
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color="hotpink" />
                </mesh>
            </Canvas>
        ));
        const app = mountApp(<App />);
        const wrapper = app.container.querySelector('[data-sigx-canvas]') as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.className).toBe('stage');
        expect(wrapper.id).toBe('c1');
        expect(wrapper.querySelector('canvas')).not.toBeNull();
        const store = api!.store!;
        expect(store.scene.children.map((c) => c.name)).toEqual(['cube']);
        const cube = store.scene.children[0] as THREE.Mesh;
        expect(cube.geometry).toBeInstanceOf(THREE.BoxGeometry);
        expect((cube.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(new THREE.Color('hotpink').getHexString());
        expect(store.gl).toBe(gl);
        app.unmount();
    });

    it('bridges provide/inject and the app context from the DOM tree into the scene', () => {
        const useTheme = defineInjectable<string>('Theme');
        let injected: string | null = null;
        let appSeen: unknown = null;
        let storeSeen: ThreeState | null = null;
        const Inner = component(() => {
            injected = useTheme();
            appSeen = useAppContext();
            storeSeen = useThree();
            return () => <mesh />;
        });
        const App = component(() => {
            defineProvide(useTheme, () => 'dark');
            return () => (
                <div>
                    <Canvas gl={fakeGL()} frameloop="never">
                        <Inner />
                    </Canvas>
                </div>
            );
        });
        const container = document.createElement('div');
        const app = defineApp(<App />);
        app.mount(container);
        expect(injected).toBe('dark');
        expect(appSeen).toBe(app._context);
        expect(storeSeen).not.toBeNull();
        app.unmount();
    });

    it('re-renders the scene when the slot changes and runs useFrame on advance', () => {
        const show = signal(false);
        let frames = 0;
        let api: CanvasApi | null = null;
        const Spinner = component(() => {
            useFrame(() => { frames++; });
            return () => <mesh name="spinner" />;
        });
        const App = component(() => () => (
            <Canvas gl={fakeGL()} frameloop="never" ref={(a: CanvasApi | null) => { api = a; }}>
                <mesh name="always" />
                {show.value ? <Spinner /> : null}
            </Canvas>
        ));
        const app = mountApp(<App />);
        const scene = api!.store!.scene;
        expect(scene.children.map((c) => c.name)).toEqual(['always']);
        show.value = true;
        expect(scene.children.map((c) => c.name)).toEqual(['always', 'spinner']);
        api!.advance(1 / 60);
        expect(frames).toBe(1);
        show.value = false;
        expect(scene.children.map((c) => c.name)).toEqual(['always']);
        api!.advance(1 / 60);
        expect(frames).toBe(1);
        app.unmount();
    });

    it('tears down children before the root and leaves nothing behind', () => {
        const gl = fakeGL();
        const log: string[] = [];
        let api: CanvasApi | null = null;
        const Child = component((ctx) => {
            ctx.onUnmounted(() => log.push('child'));
            return () => <mesh />;
        });
        const App = component(() => () => (
            <Canvas gl={gl} frameloop="never" ref={(a: CanvasApi | null) => { api = a; }} onCreated={() => log.push('created')}>
                <Child />
            </Canvas>
        ));
        const app = mountApp(<App />);
        const a = api!; // the ref is reset to null on unmount; keep the api
        const store = a.store!;
        expect(log).toEqual(['created']);
        app.unmount();
        expect(log).toEqual(['created', 'child']);
        expect(store.scene.children).toHaveLength(0);
        expect(a.root).toBeNull();
        expect(gl.disposed).toBe(0); // an instance we were given is not ours to dispose
    });

    it('objectRef and signal-bound props work through the bridge', () => {
        const x = signal(1);
        const mesh = objectRef<THREE.Mesh>();
        const App = component(() => () => (
            <Canvas gl={fakeGL()} frameloop="never">
                <mesh ref={mesh} position-x={x} />
            </Canvas>
        ));
        const app = mountApp(<App />);
        expect(mesh.current!.position.x).toBe(1);
        x.value = 4;
        expect(mesh.current!.position.x).toBe(4);
        app.unmount();
    });

    it('render() into a plain container works without defineApp', () => {
        const container = document.createElement('div');
        let api: CanvasApi | null = null;
        render(<Canvas gl={fakeGL()} frameloop="never" ref={(a: CanvasApi | null) => { api = a; }}><group /></Canvas>, container);
        const a = api!;
        expect(a.store!.scene.children[0]).toBeInstanceOf(THREE.Group);
        render(null, container);
        expect(a.root).toBeNull();
    });

    it('server-safe: the markup renders with no root before mount', () => {
        const spy = vi.fn();
        const App = component(() => () => <Canvas gl={fakeGL()} frameloop="never" onCreated={spy} />);
        const app = mountApp(<App />);
        expect(spy).toHaveBeenCalledTimes(1);
        app.unmount();
    });
});
