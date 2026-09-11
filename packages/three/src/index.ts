/**
 * @sigx/three — three.js for SignalX apps.
 *
 * A companion library, not an umbrella: keep `jsxImportSource: "sigx"` and
 * `component`/`signal` from `sigx`; import `<Canvas>`, the composables and
 * the three element types from here. Importing this entry registers every
 * class of the `three` namespace as a JSX element (`extend(THREE)`), so
 * `<mesh>`, `<boxGeometry>`, `<meshStandardMaterial>`, … work out of the box.
 */
import * as THREE from 'three';
import { extend } from '@sigx/runtime-three';
// The JSX intrinsic types ride the runtime-three types entry into ours.
import '@sigx/runtime-three';

extend(THREE);

export { Canvas } from './canvas/Canvas.js';
export type { CanvasProps, CanvasApi } from './canvas/Canvas.js';

// ---- assets ----------------------------------------------------------------
export { useLoader, preload, clearLoaderCache } from './composables/use-loader.js';
export type { LoaderResult, LoaderLike, LoaderCtor, LoaderResultOf, LoadState, UseLoaderOptions } from './composables/use-loader.js';
export { useTexture, preloadTexture } from './composables/use-texture.js';
export type { UseTextureOptions } from './composables/use-texture.js';
export { useGLTF } from './composables/use-gltf.js';
export type { UseGLTFOptions } from './composables/use-gltf.js';
export { useAudio, listenerFor } from './composables/use-audio.js';
export type { UseAudioOptions, UseAudioResult } from './composables/use-audio.js';

// ---- input -----------------------------------------------------------------
export { useKeyboard } from './composables/use-keyboard.js';
export type { Keyboard, UseKeyboardOptions } from './composables/use-keyboard.js';
export { useGamepad, GamepadButton, GamepadAxis } from './composables/use-gamepad.js';
export type { GamepadState, UseGamepadOptions } from './composables/use-gamepad.js';
export { usePointer } from './composables/use-pointer.js';
export type { PointerState, UsePointerOptions } from './composables/use-pointer.js';
export { usePointerLock } from './composables/use-pointer-lock.js';
export type { PointerLock, UsePointerLockOptions } from './composables/use-pointer-lock.js';
export { useActionMap } from './composables/use-action-map.js';
export type { ActionMap, Binding, AxisBinding, UseActionMapOptions } from './composables/use-action-map.js';

// ---- instancing, helpers, animation ------------------------------------------
export { useInstances } from './composables/use-instances.js';
export type { Instances, UseInstancesOptions } from './composables/use-instances.js';
export { useHelper } from './composables/use-helper.js';
export { useAnimations } from './composables/use-animations.js';
export type { Animations, PlayOptions } from './composables/use-animations.js';

// ---- shared vocabulary ---------------------------------------------------------
export type { MaybeSignal, ReadSignal, Stop } from './shared/types.js';
export { toValue } from './shared/to-value.js';

// ---- the renderer's own API, so an app needs one import ------------------------
export {
    useThree,
    useFrame,
    useFixedUpdate,
    useSize,
    objectRef,
    extend,
    createRoot,
    threeMount,
    ROOT_TOKEN
} from '@sigx/runtime-three';
export type {
    ThreeRoot,
    ThreeState,
    RootOptions,
    CameraOptions,
    Frameloop,
    ThreeSize,
    ThreeClock,
    ObjectRef,
    UseFrameOptions,
    FrameCallback,
    FixedCallback,
    FixedHandle,
    FrameScheduler,
    ThreeNode,
    AttachType,
    AttachFn,
    RendererLike,
    GlOption,
    GlFactory,
    ShadowsOption,
    ThreeMountTarget,
    ThreeEvent,
    EventsOptions,
    EventName,
    ThreeElement,
    ThreeElements,
    MathValue,
    Bindable,
    EventHandlers,
    NodeProps,
    PrimitiveProps
} from '@sigx/runtime-three';
