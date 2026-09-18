/**
 * Test harness: a root with a recording fake renderer and a manual frame
 * scheduler, so the scene graph, props and loop are exercised without WebGL
 * or a DOM. three's scene graph is pure JS.
 */
import { beforeEach } from 'vitest';
import * as THREE from 'three';
import { createRoot, extend, type RootOptions, type ThreeRoot, type ThreeState } from '@sigx/three-runtime';
import { clearCatalog } from '@sigx/three-runtime/internals';
import type { FrameScheduler } from '@sigx/three-runtime';
import type { RendererLike } from '@sigx/three-runtime';

export interface FakeGL extends RendererLike {
    calls: Array<[THREE.Scene, THREE.Camera]>;
    sizes: Array<[number, number]>;
    pixelRatios: number[];
    disposed: number;
    shadowMap: { enabled: boolean; type: number };
}

export function fakeGL(): FakeGL {
    const gl: FakeGL = {
        calls: [],
        sizes: [],
        pixelRatios: [],
        disposed: 0,
        shadowMap: { enabled: false, type: 0 },
        render(scene, camera) {
            // A real renderer refreshes world matrices before drawing.
            scene.updateMatrixWorld();
            camera.updateMatrixWorld();
            gl.calls.push([scene, camera]);
        },
        setSize(w, h) {
            gl.sizes.push([w, h]);
        },
        setPixelRatio(dpr) {
            gl.pixelRatios.push(dpr);
        },
        dispose() {
            gl.disposed++;
        }
    };
    return gl;
}

export interface ManualScheduler extends FrameScheduler {
    /** Run the pending frame (if any) with the clock advanced by `dt` seconds. */
    flush(dt?: number): boolean;
    pending: number;
    time: number;
}

export function manualScheduler(): ManualScheduler {
    let next: ((t: number) => void) | null = null;
    let id = 0;
    const s: ManualScheduler = {
        pending: 0,
        time: 0,
        request(cb) {
            next = cb;
            s.pending = 1;
            return ++id;
        },
        cancel() {
            next = null;
            s.pending = 0;
        },
        now: () => s.time,
        flush(dt = 1 / 60) {
            const cb = next;
            if (cb === null) return false;
            next = null;
            s.pending = 0;
            s.time += dt * 1000;
            cb(s.time);
            return true;
        }
    };
    return s;
}

export interface TestRoot {
    root: ThreeRoot;
    state: ThreeState;
    gl: FakeGL;
    scheduler: ManualScheduler;
    scene: THREE.Scene;
    render: ThreeRoot['render'];
    unmount(): void;
}

export function createTestRoot(options: Partial<RootOptions> = {}): TestRoot {
    const gl = fakeGL();
    const scheduler = manualScheduler();
    const root = createRoot(null, {
        gl,
        scheduler,
        size: { width: 800, height: 600 },
        frameloop: 'never',
        ...options
    });
    return {
        root,
        state: root.store,
        gl,
        scheduler,
        scene: root.scene,
        render: root.render,
        unmount: () => root.unmount()
    };
}

/** Register the classes the tests use; runs before each test in files that import the harness. */
export function registerTestCatalog(): void {
    extend({
        Mesh: THREE.Mesh,
        Group: THREE.Group,
        Object3D: THREE.Object3D,
        Scene: THREE.Scene,
        BoxGeometry: THREE.BoxGeometry,
        PlaneGeometry: THREE.PlaneGeometry,
        SphereGeometry: THREE.SphereGeometry,
        BufferGeometry: THREE.BufferGeometry,
        MeshBasicMaterial: THREE.MeshBasicMaterial,
        MeshStandardMaterial: THREE.MeshStandardMaterial,
        PerspectiveCamera: THREE.PerspectiveCamera,
        OrthographicCamera: THREE.OrthographicCamera,
        DirectionalLight: THREE.DirectionalLight,
        AmbientLight: THREE.AmbientLight,
        InstancedMesh: THREE.InstancedMesh,
        Texture: THREE.Texture,
        Fog: THREE.Fog,
        Line: THREE.Line,
        LineSegments: THREE.LineSegments,
        Points: THREE.Points
    });
}

beforeEach(() => {
    clearCatalog();
    registerTestCatalog();
});
