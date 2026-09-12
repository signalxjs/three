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

// The renderer's own API, so an app needs one import.
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
