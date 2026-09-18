# Changelog

All notable changes to `@sigx/three` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `<Canvas>`: a runtime-dom component hosting a three root inside a `sigx`
  app — wrapper `div` + `canvas`, root created on mount, default slot
  rendered into the scene reactively, provide/inject and the app context
  bridged from DOM ancestors, `CanvasApi` via `ref`, ordered teardown.
- The entry registers the whole `three` namespace as JSX elements and
  re-exports `@sigx/three-runtime`'s API (`useThree`, `useFrame`,
  `useFixedUpdate`, `useSize`, `objectRef`, `extend`, `createRoot`,
  `threeMount`, types). It deliberately does not re-export
  `@sigx/reactivity` / `@sigx/runtime-core`.
- `examples/spinning-cube`.
- Assets: `useLoader` (module-level cache shared by identity, value-first
  state, reactive url, `reload`), `preload`, `clearLoaderCache`, `useTexture`,
  `useGLTF` (+ DRACO, `useGLTF.preload`), `useAudio`.
- Input: `useKeyboard`, `useGamepad` (+ `GamepadButton`/`GamepadAxis`),
  `usePointer`, `usePointerLock`, `useActionMap` — polled, frame-accurate
  edges, allocation-free; fall back to `requestAnimationFrame` outside a root.
- `useInstances` (typed-array transforms → instance matrices), `useHelper`,
  `useAnimations`.
- `toValue` and the `MaybeSignal` / `ReadSignal` / `Stop` vocabulary.
- `examples/game-hud`.

### Changed

- Aligned with sigx core 1.0: peers on `@sigx/reactivity`, `@sigx/runtime-core` and `@sigx/runtime-dom` at `^1.0.0`.
