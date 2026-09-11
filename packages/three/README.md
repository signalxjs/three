# @sigx/three

[![npm](https://img.shields.io/npm/v/@sigx/three.svg?label=%40sigx%2Fthree&color=blue)](https://www.npmjs.com/package/@sigx/three)

three.js for [SignalX](https://sigx.dev) apps. Drop a `<Canvas>` into any
`sigx` component, write the scene as TSX (`<mesh>`, `<boxGeometry>`,
`<meshStandardMaterial>`), drive per-frame work with `useFrame`, bind signals
straight to three.js properties, and keep the HUD in ordinary HTML next to it.

This is a companion library like `@sigx/router` or `@sigx/store`: you keep
`jsxImportSource: "sigx"` and import `component`/`signal` from `sigx`. The
three.js intrinsic elements merge into the same JSX table as the DOM ones.

> 🚧 Pre-release. Asset loading, input and instancing composables and the
> physics package land in the follow-up PRs tracked from
> [signalxjs/three#1](https://github.com/signalxjs/three/issues/1).

## Install

```bash
pnpm add sigx @sigx/three three
pnpm add -D @types/three
```

`sigx` core (`@sigx/reactivity`, `@sigx/runtime-core`, `@sigx/runtime-dom`) and
`three` are peer dependencies — your app owns the single copy.

## Quick start

```tsx
import { component, signal, defineApp } from 'sigx';
import { Canvas, useFrame, objectRef } from '@sigx/three';
import type { Mesh } from 'three';

const wire = signal(false);

const Cube = component(() => {
    const mesh = objectRef<Mesh>();
    useFrame((_, dt) => { mesh.current!.rotation.y += dt; });   // per-frame: direct mutation
    return () => (
        <mesh ref={mesh}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="hotpink" wireframe={wire} />  {/* signal-bound prop */}
        </mesh>
    );
});

const App = component(() => () => (
    <>
        <button onClick={() => { wire.value = !wire.value; }}>Wireframe</button>
        <Canvas camera={{ position: [0, 0, 4] }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 3, 3]} />
            <Cube />
        </Canvas>
    </>
));

defineApp(<App />).mount('#app');
```

Run it: `pnpm dev:cube` (after `pnpm build`) — `examples/spinning-cube`.

## `<Canvas>`

A runtime-dom component that hosts a three root. It renders a wrapper `div`
(your `class`/`style`/`id` go there; it fills its parent) with a `canvas`,
creates the root on mount, and renders its children into the scene.
Provide/inject, `useAppContext()` and error scopes flow from the DOM ancestors
into the scene, so the HUD and the 3D tree can share signals, stores and
services freely.

| Prop | |
| --- | --- |
| `camera` | A camera instance or `{ fov, near, far, position, manual }` (default perspective at z = 5) |
| `gl` | A renderer instance, `WebGLRenderer` params, or a factory (`webgl()` / `webgpu()` from `@sigx/runtime-three/webgl` & `/webgpu`) |
| `scene`, `shadows`, `dpr`, `fixedStep` | Forwarded to `createRoot` |
| `frameloop` | `'always'` (default) · `'demand'` (render on `invalidate()`) · `'never'` (only `advance()`) |
| `events` | `false` to disable pointer events, or `{ filter, onPointerMissed }` |
| `onCreated(state, root)` | After the root exists |
| `ref` | `CanvasApi`: `root`, `store`, `invalidate()`, `advance()` |

Inside: `useThree()`, `useFrame()`, `useFixedUpdate()`, `useSize()`,
`objectRef()` and every three element — see the
[`@sigx/runtime-three` README](../runtime-three) for elements, props, `args`,
`attach`, signal-bound props, pointer events and the performance rules.

Server rendering: the wrapper and canvas render as markup; three never runs
on the server. Hydration mounts the root.
