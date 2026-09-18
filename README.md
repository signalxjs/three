# SignalX three

[![npm](https://img.shields.io/npm/v/@sigx/three.svg?label=%40sigx%2Fthree&color=blue)](https://www.npmjs.com/package/@sigx/three)
[![license](https://img.shields.io/npm/l/@sigx/three.svg)](./LICENSE)
[![ci](https://github.com/signalxjs/three/actions/workflows/ci.yml/badge.svg)](https://github.com/signalxjs/three/actions/workflows/ci.yml)

**three.js for [SignalX](https://sigx.dev)** — write 3D scenes and games as TSX
on signals. A `<Canvas>` drops into any `sigx` app; the scene graph is
declarative (`<mesh>`, `<boxGeometry>`, `<meshStandardMaterial>`), per-frame
work runs in `useFrame` against real three.js objects, and signals bind
straight to object properties without re-rendering a component. The HUD stays
ordinary HTML next to it.

> 🚧 Pre-release scaffold (`0.1.0` in progress). The renderer, `<Canvas>`,
> composables and physics land PR by PR — follow
> [signalxjs/three#1](https://github.com/signalxjs/three/issues/1).

## 📚 Documentation

Guides, API reference and live examples → **<https://sigx.dev/three/>**

## Packages

| Package | Description |
| --- | --- |
| [`@sigx/three`](./packages/three) | Install this. `<Canvas>` for any `sigx` app, `useFrame`/`useThree`, asset loading, input, instancing and animation composables. |
| [`@sigx/three-runtime`](./packages/three-runtime) | The three.js renderer: scene-graph host ops, frame loop, raycast pointer events, JSX intrinsics, `createRoot`/`threeMount`. Pulled in by `@sigx/three`. |
| [`@sigx/three-rapier`](./packages/three-rapier) | Rapier physics: `<Physics>`, `<RigidBody>`, `<Collider>`, collision events, debug renderer. |

## Install

```bash
pnpm add sigx @sigx/three three
pnpm add -D @types/three
```

The SignalX core packages (`sigx`, `@sigx/reactivity`, `@sigx/runtime-core`,
`@sigx/runtime-dom`) and `three` are **peer dependencies** — your app installs
them once and every `@sigx/*` package shares that single copy, so signals and
effects always run on the same reactivity engine.

## Quick start

Keep `"jsxImportSource": "sigx"` in your `tsconfig.json` — the three.js
elements merge into the same JSX table as the HTML ones:

```tsx
import { component, signal, defineApp } from 'sigx';
import { Canvas, useFrame, objectRef } from '@sigx/three';
import type { Mesh } from 'three';

const Cube = component(() => {
    const mesh = objectRef<Mesh>();
    useFrame((_, dt) => { mesh.current!.rotation.y += dt; });
    return () => (
        <mesh ref={mesh}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="hotpink" />
        </mesh>
    );
});

const App = component(() => {
    const wire = signal(false);
    return () => (
        <>
            <button onClick={() => { wire.value = !wire.value; }}>Wireframe</button>
            <Canvas camera={{ position: [0, 0, 4] }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[3, 3, 3]} />
                <Cube />
            </Canvas>
        </>
    );
});

defineApp(<App />).mount('#app');
```

## Performance model

Three ways to update the scene, fastest first:

1. **`useFrame` + refs** — mutate three.js objects directly every frame. Zero framework cost.
2. **Signal-bound props** — `<mesh position-x={x}>` binds one effect that writes to the object when `x` changes. No component re-render, no vnode diff.
3. **Render-function reads** — a signal read in a component's render re-diffs that component. Use it for structural or infrequent state.

Rendering is on demand when you ask for it (`frameloop="demand"`), pointer
events raycast only objects that have handlers, and the renderer's per-frame
code allocates nothing.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`AGENTS.md`](./AGENTS.md) — the
sigx standard workflow (issue → worktree → PR → review → squash), build/test
commands and the `main`/`branches` git-worktree layout.

## Part of SignalX

This repo is one of the [`signalxjs`](https://github.com/signalxjs) family.
Core lives in [`signalxjs/core`](https://github.com/signalxjs/core); the docs
site is [`signalxjs/signalxjs.github.io`](https://github.com/signalxjs/signalxjs.github.io).

## License

MIT © Andreas Ekdahl
