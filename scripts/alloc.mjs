#!/usr/bin/env node
/**
 * alloc.mjs — per-frame heap growth of the two hot update paths.
 *
 * Runs 10k meshes for 200 frames through (a) useFrame + refs and (b)
 * signal-bound props, forcing a GC before and after, and reports the heap
 * delta per frame. The renderer's own code must contribute 0 B/frame; the
 * threshold below leaves room for three's math and V8 noise.
 *
 * Needs a built dist: `pnpm build && pnpm bench:alloc` (node --expose-gc).
 */
import * as THREE from 'three';
import { batch, signal } from '@sigx/reactivity';
import { jsx, Fragment } from '@sigx/runtime-core';
import { createRoot, extend, objectRef } from '../packages/three-runtime/dist/index.js';

if (typeof globalThis.gc !== 'function') {
    console.error('alloc: run with node --expose-gc (pnpm bench:alloc)');
    process.exit(2);
}

extend({ Mesh: THREE.Mesh, BoxGeometry: THREE.BoxGeometry, MeshBasicMaterial: THREE.MeshBasicMaterial });

const N = 10_000;
const FRAMES = 200;
const LIMIT_BYTES_PER_FRAME = 2048; // three's own Math.sin / V8 noise; the renderer adds nothing

function root() {
    return createRoot(null, {
        gl: { render() {} },
        scheduler: { request: () => 0, cancel() {}, now: () => 0 },
        size: { width: 800, height: 600 },
        frameloop: 'never'
    });
}

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial();

function measure(label, setup) {
    const step = setup();
    for (let i = 0; i < 20; i++) step(); // warm up
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < FRAMES; i++) step();
    globalThis.gc();
    const after = process.memoryUsage().heapUsed;
    const perFrame = (after - before) / FRAMES;
    const ok = perFrame <= LIMIT_BYTES_PER_FRAME;
    console.log(`${ok ? '✅' : '❌'} ${label}: ${perFrame.toFixed(0)} B/frame retained (${FRAMES} frames, ${N} meshes)`);
    return ok;
}

let allOk = true;

allOk = measure('(a) useFrame + objectRef', () => {
    const r = root();
    const refs = Array.from({ length: N }, () => objectRef());
    r.render(jsx(Fragment, { children: refs.map((ref, i) => jsx('mesh', { key: i, ref, geometry, material })) }));
    const objects = refs.map((x) => x.current);
    let t = 0;
    r.subscribe(() => {
        t += 0.016;
        for (let i = 0; i < objects.length; i++) objects[i].position.x = Math.sin(t + i);
    });
    return () => r.advance(0.016);
}) && allOk;

allOk = measure('(b) signal-bound position-x (batched)', () => {
    const r = root();
    const signals = Array.from({ length: N }, () => signal(0));
    r.render(jsx(Fragment, { children: signals.map((s, i) => jsx('mesh', { key: i, 'position-x': s, geometry, material })) }));
    let t = 0;
    return () => {
        t += 0.016;
        batch(() => {
            for (let i = 0; i < signals.length; i++) signals[i].value = Math.sin(t + i);
        });
        r.advance(0.016);
    };
}) && allOk;

process.exit(allOk ? 0 : 1);
