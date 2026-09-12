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

## Composables

All tree-shakable, one per file. They stop with the owning component (or
reactive scope) and also return an explicit `stop`. On the server every one
is an inert no-op. Inputs accept a value, a signal or a getter (`toValue`).

### Assets

| | |
| --- | --- |
| `useLoader(Loader, url \| url[], { extensions, onProgress })` | Any three loader. Returns `{ value, loading, error, state, reload }` (getters — read them in render functions). Cached by url and **shared by identity** across roots and components; a cache hit resolves synchronously; a reactive `url` clears and reloads. |
| `preload(Loader, urls, extensions?)` | Warm the cache ahead of time. |
| `clearLoaderCache(Loader?, url?)` | Drop and dispose cached assets. |
| `useTexture(url \| url[] \| { map, normalMap, … }, { colorSpace, anisotropy })` | `TextureLoader`; sRGB by default. |
| `useGLTF(url, { draco })` + `useGLTF.preload` | `GLTFLoader`, optional DRACO. Mount with `<primitive object={gltf.value.scene} />`. |
| `useAudio(url, { positional, loop, volume })` | `AudioLoader` → an `Audio`/`PositionalAudio` on the camera's listener; `play()` before the buffer lands is queued. |

Why not `useData`: GPU assets are non-serializable, never load on the server,
must be shared by identity, and need `dispose()`. The vocabulary is the same.

### Input

Polled state for game loops — read it inside `useFrame`. Edges
(`justPressed` / `justReleased`) are frame-accurate and cleared at the end of
each frame. Nothing allocates per event or frame.

| | |
| --- | --- |
| `useKeyboard({ target, preventDefault })` | `isDown(code)`, `justPressed`, `justReleased`, `pressed`. Auto-repeat ignored; blur releases all. |
| `useGamepad(index, { deadzone, threshold })` | Standard mapping into `buttons: Float32Array(17)` / `axes: Float32Array(4)`, `isDown`, `justPressed`, `axis`, reactive `connected`. `GamepadButton` / `GamepadAxis` name the indices. |
| `usePointer({ target })` | NDC `x`/`y`, per-frame `dx`/`dy`, `buttons`, `isDown`/`justPressed`/`justReleased`, `over`. For per-object hits use the `onPointer*` props. |
| `usePointerLock({ target })` | `lock()` from a gesture, reactive `isLocked`, per-frame `movement.x/y`. |
| `useActionMap({ jump: ['Space', 'GamepadA'] }, { axes: { turn: { neg: ['KeyA'], pos: ['KeyD'], stick: GamepadAxis.LeftX } } })` | Named actions and axes over keyboard + gamepad; bindings pre-resolved. |

Works in a DOM component above `<Canvas>` too (then it polls on
`requestAnimationFrame` instead of the root's loop).

### Instancing, helpers, animation

| | |
| --- | --- |
| `useInstances(count, { color })` | Typed-array `position` / `quaternion` / `scale` (/ `color`); `commit()` composes every instance matrix with one scratch `Matrix4`. `<instancedMesh ref={inst.ref} args={[geometry, material, inst.count]} />`. |
| `useHelper(objectRef \| signal, Helper, ...args)` | Adds a helper to the scene, updates it per frame, removes it when the target changes or the scope ends. |
| `useAnimations(clips, root)` | `AnimationMixer` on the frame loop: `play(name, { fade, loop, timeScale })`, `stop()`, `actions`, `names`. |

`examples/game-hud` (`pnpm dev:hud`) puts it together: an HTML HUD sharing
signals with the scene, `useActionMap` steering, 500 asteroids in one draw
call, pointer lock.
