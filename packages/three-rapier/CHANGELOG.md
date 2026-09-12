# Changelog

All notable changes to `@sigx/three-rapier` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `<Physics>`: lazy Rapier init, world + event queue, children gated on
  `ready`, stepping on `useFixedUpdate` with a sub-step cap, interpolated
  pose writes before the app's frame callbacks, `paused`, reactive `gravity`,
  `debug`, `onReady`.
- `<RigidBody>`: body types, auto-colliders (cuboid / ball / hull / trimesh)
  from mesh descendants relative to the group, mass/damping/gravityScale/
  ccd/sleep/rotation-lock options, initial velocities, collision and sensor
  events, sleep/wake callbacks, `RigidBodyApi` via `ref`.
- `<Collider>`: explicit shapes attached to the enclosing body (queued until
  it exists) or standalone fixed colliders, with events.
- `<Debug>` line renderer, `useRapier()`, `useBodyHandle()`.
- `examples/physics-playground`.
