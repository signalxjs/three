# @sigx/runtime-three

[![npm](https://img.shields.io/npm/v/@sigx/runtime-three.svg?label=%40sigx%2Fruntime-three&color=blue)](https://www.npmjs.com/package/@sigx/runtime-three)

The three.js renderer for [SignalX](https://sigx.dev): scene-graph host ops on
top of `@sigx/runtime-core`'s renderer-agnostic component model, a
priority-sorted frame loop, raycast pointer events and the JSX intrinsic
element types (`<mesh>`, `<boxGeometry>`, `<meshStandardMaterial>`, …).

Most apps install [`@sigx/three`](../three) instead — it pulls this package in
and adds `<Canvas>` for ordinary `sigx` DOM apps, plus the composables. Reach
for `@sigx/runtime-three` directly when you mount a three root yourself
(`createRoot`) or run without a DOM.

> 🚧 Scaffold. The renderer lands in the follow-up PRs tracked from
> [signalxjs/three#1](https://github.com/signalxjs/three/issues/1).

## Peer dependencies

`@sigx/reactivity`, `@sigx/runtime-core` (one copy, installed by your app) and
`three` (`>=0.160`).
