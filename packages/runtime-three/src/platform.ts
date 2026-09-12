/**
 * three.js platform identity — the side effects that make this package THE
 * platform of an app: the default mount registration and the platform
 * element type. Built as its own dist entry (`@sigx/runtime-three/platform`)
 * and named in `sideEffects`.
 *
 * Only three-only apps reach this (through `./jsx-runtime`); a `<Canvas>`
 * inside a DOM app must NOT import it — core's default mount and
 * `PlatformTypes.element` are single global slots that `@sigx/runtime-dom`
 * already fills there.
 */
import './types.js';
import './render.js';
import { declareLiveClient, setDefaultMount } from '@sigx/runtime-core/internals';
import { threeMount } from './mount.js';

setDefaultMount(threeMount);
declareLiveClient();
