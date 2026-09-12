# @sigx/runtime-three

[![npm](https://img.shields.io/npm/v/@sigx/runtime-three.svg?label=%40sigx%2Fruntime-three&color=blue)](https://www.npmjs.com/package/@sigx/runtime-three)

The three.js renderer for [SignalX](https://sigx.dev): scene-graph host ops on
top of `@sigx/runtime-core`'s renderer-agnostic component model, a
priority-sorted frame loop with fixed-step updates and demand rendering,
signal-bound props, and (coming) raycast pointer events and the JSX intrinsic
element types.

Most apps install [`@sigx/three`](../three) instead — it pulls this package in,
registers the whole `three` namespace as JSX elements, and adds `<Canvas>` for
ordinary `sigx` DOM apps plus the composables. Reach for `@sigx/runtime-three`
directly when you mount a three root yourself (`createRoot`), run without a
DOM, or want to register only the three.js classes you use.

## Install

```bash
pnpm add @sigx/runtime-three three @sigx/reactivity @sigx/runtime-core
pnpm add -D @types/three
```

`@sigx/reactivity`, `@sigx/runtime-core` (one copy, owned by your app) and
`three` (`>=0.160`) are peer dependencies.

## Usage

```tsx
/** @jsxImportSource @sigx/runtime-three */
import * as THREE from 'three';
import { component } from '@sigx/runtime-core';
import { signal } from '@sigx/reactivity';
import { createRoot, extend, useFrame, objectRef } from '@sigx/runtime-three';

extend({ Mesh: THREE.Mesh, BoxGeometry: THREE.BoxGeometry, MeshStandardMaterial: THREE.MeshStandardMaterial, DirectionalLight: THREE.DirectionalLight });

const Cube = component(() => {
    const mesh = objectRef<THREE.Mesh>();
    const hue = signal(0);
    useFrame((state, dt) => { mesh.current!.rotation.y += dt; });
    return () => (
        <mesh ref={mesh} position-x={hue}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="hotpink" />
        </mesh>
    );
});

const root = createRoot(document.querySelector('canvas')!, { camera: { position: [0, 0, 4] } });
root.render(<><directionalLight position={[3, 3, 3]} /><Cube /></>);
```

Or, as an app: `defineApp(<App />).mount({ target: '#canvas', shadows: true }, threeMount)`.
Importing `@sigx/runtime-three/platform` (which `jsxImportSource: "@sigx/runtime-three"`
does for you) makes `threeMount` the default mount, so plain `.mount('#canvas')` works.

### Elements

Every registered three.js class is a JSX element under its lowerFirst name:
`<mesh>`, `<group>`, `<boxGeometry>`, `<meshStandardMaterial>`,
`<directionalLight>`, `<instancedMesh>`, … Four names collide with DOM/SVG
elements (both renderers share one JSX table when `<Canvas>` sits in a DOM app),
so `Line`, `Audio`, `Path` and `Source` become `<threeLine>`, `<threeAudio>`,
`<threePath>`, `<threeSource>`. `<primitive object={obj}>` mounts any existing
object (never disposed, never reconstructed).

- **`args`** — constructor arguments. Changing them after mount reconstructs
  the object in place (children re-attach, bindings re-bind); keep the array
  stable or use a `key` for intentional remounts.
- **`attach`** — how a non-`Object3D` child binds to its parent. Geometries,
  materials and fog attach by kind; anything else needs a path
  (`attach="map"` on a material, `attach="material-map"` on a mesh,
  `attach="material-0"` into an array, `attach="attributes-position"`) or a
  function `(parent, self) => cleanup`.
- **Props** are applied eagerly and in place: `position={[x, y, z]}`,
  `scale={2}`, `rotation={[0, Math.PI, 0, 'YXZ']}`, `color="hotpink"`,
  `quaternion={q}` — tuples, scalars, instances. Dashed paths reach into
  nested objects: `position-x`, `material-color`, `shadow-mapSize-width`.
  Removing a prop restores the class default. `userData` merges.
- **Signal-bound props** — pass a signal, computed, getter or reactive object
  instead of a value (`position-x={x}`, `color={theme}`): one effect writes
  straight to the three object on change; the component never re-renders.
- **`dispose={null}`** keeps geometry/material/texture alive past unmount.
  **`raycast={null}`** takes an object out of picking.
- **`ref`** receives the *host node*; `objectRef()` gives you a ref whose
  `.current` is the three.js object (resolved lazily, so it survives `args`
  reconstruction). Three's own hooks (`onBeforeRender`, `onAfterRender`,
  `onBeforeCompile`) are plain props.

### Root & frame loop

`createRoot(canvasOrElement | null, options)` → `{ store, scene, render, unmount, invalidate, advance, setSize, subscribe, subscribeFixed, ready }`.

Options: `gl` (instance, factory — `webgl()` / `webgpu()` from the subpath
entries — or `WebGLRenderer` params), `camera` (instance or
`{ fov, near, far, position, manual }`), `scene`, `shadows`, `dpr`, `frameloop`
(`'always' | 'demand' | 'never'`), `size`, `fixedStep`, `maxDelta`, `raycaster`,
`scheduler`, `onCreated`.

Inside the tree: `useThree()` (the store: `gl`, `scene`, `camera`, `size`,
`clock`, `pointer`, `invalidate()`, …), `useFrame(cb, { priority })`,
`useFixedUpdate(cb, { step, maxSubSteps })` → `{ stop, alpha }`, `useSize()`
(reactive width/height/dpr for render functions).

Demand mode: every prop write, tree change and `invalidate()` requests a
frame; requests coalesce. A subscriber with `priority > 0` takes over
rendering (call `state.gl.render` yourself).

## Performance rules

1. Per-frame work goes in `useFrame` / `useFixedUpdate` against real objects
   via `objectRef()` — zero framework cost.
2. Bind signals to props (`position-x={sig}`) for values that change often:
   no re-render, no vnode diff. Write bursts inside `batch()`.
3. A signal read in a render function re-renders that component and diffs
   its vnode — use it for structural or infrequent state only.
4. Keep three objects out of `signal()` state and component props (they get
   deep-proxied). Hold them in closures and refs.
5. Prefer `frameloop="demand"` for static scenes; the renderer invalidates for you.
6. `args` changes reconstruct; hoist the array.
7. Thousands of the same thing → `<instancedMesh>` / `<batchedMesh>`.
8. The renderer's own per-frame path allocates nothing; keep yours that way too.

## Entries

| Import | What |
| --- | --- |
| `@sigx/runtime-three` | Everything above. Import-safe under Node; registers nothing global. |
| `@sigx/runtime-three/platform` | Side effects: default mount + platform element type. Three-only apps. |
| `@sigx/runtime-three/jsx-runtime` | For `jsxImportSource: "@sigx/runtime-three"` (imports `./platform`). |
| `@sigx/runtime-three/webgl`, `/webgpu` | `gl` factories (`webgpu()` is async and keeps `three/webgpu` out of the main bundle). |
| `@sigx/runtime-three/internals` | Low-level seams for `@sigx/three`, tests and benches. Unstable. |
