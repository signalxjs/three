# Changelog

All notable changes to `@sigx/runtime-three` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The renderer core on `createRenderer` from `@sigx/runtime-core`: `ThreeNode`
  shadow host nodes with lazily constructed three.js objects; `extend()`
  catalog (`<mesh>`, `<boxGeometry>`, …; `threeLine`/`threeAudio`/`threePath`/
  `threeSource` aliases for DOM-colliding names; `<primitive object>`);
  ordered scene-graph insertion, keyed moves, unmount fast path.
- Props: eager in-place application (vector/euler/quaternion/matrix/color/
  layers from tuples, scalars or instances), dashed paths, `args`
  reconstruction, `attach` (by kind, dashed paths, arrays, functions),
  `dispose={null}`, `raycast={null}`, `userData` merge, three callback hooks,
  default restore on removal.
- Signal-bound props: a signal/computed/getter/reactive-object prop value
  binds one effect that writes to the object without re-rendering.
- `createRoot()` with a `ThreeState` store, `gl` resolution (instance /
  factory / params; `webgl()` and `webgpu()` factories), shadows, dpr, resize
  handling, camera projection updates.
- Frame loop: priority-sorted copy-on-write subscribers, fixed-step
  accumulators with `alpha`, `frameloop: 'always' | 'demand' | 'never'`,
  coalescing `invalidate()`, synchronous `advance()`, delta clamping,
  error routing through `handleComponentError`.
- Hooks: `useThree`, `useFrame`, `useFixedUpdate`, `useSize`, `objectRef`;
  `ROOT_TOKEN`; `threeMount` (default mount only via `./platform`).
- Entries: `.`, `./internals`, `./platform`, `./jsx-runtime`,
  `./jsx-dev-runtime`, `./webgl`, `./webgpu`.
- Pointer events by raycast: one listener set per root, only objects with
  handlers are raycast, bubbling with `stopPropagation`, hover
  over/out/enter/leave tracking, `delta` since pointerdown, pointer capture,
  `onPointerMissed`, `onWheel`/`onContextMenu`/`onDoubleClick`, a hit
  `filter`, errors routed through `handleComponentError`.
- JSX intrinsic element types for the whole `three` namespace
  (`ThreeElement`, `ThreeElements` augmentation seam, `Bindable`, `MathValue`)
  merged into the global `JSX.IntrinsicElements`; a mixed-renderer type test
  with `@sigx/runtime-dom`.
- Benchmarks (`pnpm bench`: mount, per-frame update paths, keyed reorder,
  instancing) and the per-frame allocation check (`pnpm bench:alloc`).
