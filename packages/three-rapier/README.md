# @sigx/three-rapier

[![npm](https://img.shields.io/npm/v/@sigx/three-rapier.svg?label=%40sigx%2Fthree-rapier&color=blue)](https://www.npmjs.com/package/@sigx/three-rapier)

[Rapier](https://rapier.rs) physics for [`@sigx/three`](../three): `<Physics>`
owns a world stepped on the frame loop's **fixed timestep** with
interpolation; `<RigidBody>` drives a `<group>` from a body, with colliders
generated from its meshes; `<Collider>` adds explicit shapes; collision and
sensor events call your handlers; `<Debug>` draws the collider outlines.

## Install

```bash
pnpm add @sigx/three-rapier @dimforge/rapier3d-compat
```

Rapier's wasm build is a peer and is imported lazily by `<Physics>`, which
mounts its children only once the world exists.

## Usage

```tsx
import { component, signal } from 'sigx';
import { Canvas } from '@sigx/three';
import { Physics, RigidBody, Collider, type RigidBodyApi } from '@sigx/three-rapier';

const Crate = component(() => {
    let api: RigidBodyApi | null = null;
    return () => (
        <RigidBody ref={(a) => { api = a; }} position={[0, 4, 0]} colliders="cuboid" restitution={0.2}>
            <mesh castShadow onClick={() => api?.applyImpulse({ x: 0, y: 5, z: 0 })}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="orange" />
            </mesh>
        </RigidBody>
    );
});

const App = component(() => () => (
    <Canvas shadows>
        <Physics gravity={[0, -9.81, 0]}>
            <RigidBody type="fixed" colliders="cuboid">
                <mesh position-y={-0.5}><boxGeometry args={[20, 1, 20]} /><meshStandardMaterial /></mesh>
            </RigidBody>
            <Crate />
            <Collider shape="cuboid" args={[2, 1, 2]} position={[5, 1, 0]} sensor onIntersectionEnter={() => console.log('in')} />
        </Physics>
    </Canvas>
));
```

Run the playground: `pnpm dev:physics` (after `pnpm build`).

## API

**`<Physics>`** — `gravity` (`[x, y, z]`, default `[0, -9.81, 0]`), `timeStep`
(default the root's `fixedStep`, 1/60), `maxSubSteps` (5), `interpolate`
(true: poses are interpolated between steps for rendering), `paused`,
`debug` (renders `<Debug>`), `onReady(ctx)`. Children mount once the wasm
module and world exist.

**`<RigidBody>`** — renders a `<group>` the body drives. `type`: `'dynamic'`
(default) · `'fixed'` · `'kinematicPosition'` · `'kinematicVelocity'`.
`colliders`: `'cuboid'` (default) · `'ball'` · `'hull'` · `'trimesh'` ·
`false` — generated from every mesh under the body, each relative to the
group (scale applied). `position`, `rotation` (euler) / `quaternion`,
`linvel`, `angvel`, `mass`, `linearDamping`, `angularDamping`,
`gravityScale`, `ccd`, `canSleep`, `lockRotations`, `enabledRotations`,
`friction`, `restitution`, `density`, `sensor`, `userData`. Events:
`onCollisionEnter/Exit`, `onIntersectionEnter/Exit` (sensors),
`onSleep`/`onWake`. `ref` receives a `RigidBodyApi`: `raw`, `group`,
`applyImpulse`, `applyTorqueImpulse`, `addForce`, `resetForces`,
`setLinvel`, `setAngvel`, `setTranslation`, `setRotation`,
`setNextKinematicTranslation/Rotation`, `linvel(out)`, `angvel(out)`,
`translation(out)`, `rotation(out)`, `sleep`, `wakeUp`, `isSleeping`.

Place bodies directly under `<Physics>` (or untransformed parents): the body
is simulated in world space and its pose is written to the group's local
transform.

**`<Collider>`** — `shape`: `cuboid [hx, hy, hz]` · `ball [r]` ·
`capsule [halfHeight, r]` · `cylinder` · `cone` · `hull [Float32Array]` ·
`trimesh [vertices, indices]`; `position`, `rotation`, `sensor`, `friction`,
`restitution`, `density`, the four event handlers. Inside a `<RigidBody>` it
attaches to that body; alone it is a fixed collider in the world.

**Events** — handlers receive `{ target, other, targetCollider,
otherCollider }` (`RigidBodyApi`s and Rapier colliders). The payload object
is reused between calls; copy what you keep. Collision events are enabled
on a body's colliders when it declares any handler.

**`useRapier()`** — `{ rapier, world, eventQueue, bodies, colliders, ready,
step, interpolate }` for raycasts, joints and anything else Rapier offers.

## Performance notes

- Stepping is on the fixed timestep with a sub-step cap; rendering
  interpolates between the last two steps (`interpolate={false}` to snap).
- Transform sync uses scratch vectors; the one allocation per body per step
  is Rapier's own pose getters.
- `<Debug>` allocates per frame (`world.debugRender()`) — development only.
- Keep collider counts sane: `hull` for rocks and props, `trimesh` only for
  static level geometry, primitives wherever they fit.
