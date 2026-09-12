# @sigx/three

[![npm](https://img.shields.io/npm/v/@sigx/three.svg?label=%40sigx%2Fthree&color=blue)](https://www.npmjs.com/package/@sigx/three)

three.js for [SignalX](https://sigx.dev) apps. Drop a `<Canvas>` into any
`sigx` component, write the scene as TSX (`<mesh>`, `<boxGeometry>`,
`<meshStandardMaterial>`), drive per-frame work with `useFrame`, bind signals
straight to three.js properties, and keep the HUD in ordinary HTML next to it.

This is a companion library like `@sigx/router` or `@sigx/store`: you keep
`jsxImportSource: "sigx"` and import `component`/`signal` from `sigx`. The
three.js intrinsic elements merge into the same JSX table as the DOM ones.

> 🚧 Scaffold. `<Canvas>`, the composables and examples land in the follow-up
> PRs tracked from [signalxjs/three#1](https://github.com/signalxjs/three/issues/1).

## Install

```bash
pnpm add @sigx/three three
pnpm add -D @types/three
```

`sigx` core (`@sigx/reactivity`, `@sigx/runtime-core`, `@sigx/runtime-dom`) and
`three` are peer dependencies — your app owns the single copy.
