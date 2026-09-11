# Examples

Runnable `sigx` apps that use `<Canvas>` from `@sigx/three`. Each is a private
workspace package; run one from the repo root after `pnpm install`:

| Example | Command | Shows |
| --- | --- | --- |
| `spinning-cube` | `pnpm dev:cube` | The hello world: `<Canvas>`, lights, a `useFrame`-driven cube, a DOM button toggling a signal-bound material prop. |
| `game-hud` | `pnpm dev:hud` | A HUD in HTML sharing signals with the scene, keyboard/gamepad input via `useActionMap`, 500 instanced asteroids, pointer lock. |
| `physics-playground` | `pnpm dev:physics` | `@sigx/three-rapier`: rigid bodies, auto-colliders, a sensor zone, impulses from a click, the debug renderer. |

The examples arrive with the PRs that add the features they demonstrate —
see [signalxjs/three#1](https://github.com/signalxjs/three/issues/1).

Every example has its own `tsconfig.json` extending the root config with
`jsxImportSource: "sigx"`, its own `exclude` (the root excludes `examples`), and
`../../env.d.ts` in `include`. `pnpm typecheck:examples` checks each one.
