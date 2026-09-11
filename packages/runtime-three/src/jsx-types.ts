/**
 * The JSX intrinsic element types: every class exported by `three` under its
 * lowerFirst tag (`<mesh>`, `<boxGeometry>`, …), with the four DOM-colliding
 * names prefixed (`<threeLine>`, `<threeAudio>`, `<threePath>`,
 * `<threeSource>`) and the reserved `<primitive>`.
 *
 * Merged into the global `JSX.IntrinsicElements` alongside whatever other
 * renderer is loaded (`@sigx/runtime-dom` in a `<Canvas>` app), so no key may
 * collide — `catalog.test.ts` sweeps the three namespace for that.
 *
 * A `.ts` module (not `.d.ts`) so tsgo emits `dist/jsx-types.d.ts`, and
 * `index.ts`'s side-effect import keeps it reachable from the package's
 * `types` entry.
 *
 * Note: core types `JSX.Element` as one union for every tag, so a `<div>`
 * inside `<mesh>` cannot be a type error; the renderer throws a descriptive
 * runtime error instead.
 */
import type * as THREE from 'three';
import type { JSXChildren } from '@sigx/runtime-core';
import type { ThreeEvent } from './events.js';
import type { ObjectRef } from './hooks.js';
import type { AttachType, ThreeNode } from './node.js';

type Ctor = abstract new (...args: any[]) => any;

/** What a three.js math-typed property accepts: the instance, a tuple, or (vectors) a scalar. */
export type MathValue<T> =
    T extends THREE.Color ? THREE.ColorRepresentation
    : T extends THREE.Vector4 ? THREE.Vector4 | [number, number, number, number] | number
    : T extends THREE.Vector3 ? THREE.Vector3 | [number, number, number] | number
    : T extends THREE.Vector2 ? THREE.Vector2 | [number, number] | number
    : T extends THREE.Euler ? THREE.Euler | [number, number, number, THREE.EulerOrder?]
    : T extends THREE.Quaternion ? THREE.Quaternion | [number, number, number, number]
    : T extends THREE.Matrix4 ? THREE.Matrix4 | number[]
    : T extends THREE.Matrix3 ? THREE.Matrix3 | number[]
    : T extends THREE.Layers ? THREE.Layers | number
    : T;

/** A prop value or a reactive source of it: signal / computed (`{ value }`), getter, or the value itself. */
export type Bindable<T> = T | { readonly value: T } | (() => T);

type NonFunctionKeys<O> = { [K in keyof O]: O[K] extends (...args: any[]) => any ? never : K }[keyof O];

/** Every non-function property, optional and bindable, with math coercion. */
export type Mutable<O> = { [K in NonFunctionKeys<O>]?: Bindable<MathValue<O[K]>> };

/** Pointer events, by raycast. Only objects with handlers are raycast. */
export interface EventHandlers {
    onClick?: (event: ThreeEvent) => void;
    onContextMenu?: (event: ThreeEvent) => void;
    onDoubleClick?: (event: ThreeEvent) => void;
    onPointerDown?: (event: ThreeEvent) => void;
    onPointerUp?: (event: ThreeEvent) => void;
    onPointerMove?: (event: ThreeEvent) => void;
    onPointerOver?: (event: ThreeEvent) => void;
    onPointerOut?: (event: ThreeEvent) => void;
    onPointerEnter?: (event: ThreeEvent) => void;
    onPointerLeave?: (event: ThreeEvent) => void;
    onPointerCancel?: (event: ThreeEvent) => void;
    /** A click that hit nothing with a handler. Receives the native event. */
    onPointerMissed?: (event: Event) => void;
    onWheel?: (event: ThreeEvent<WheelEvent>) => void;
}

/**
 * Constructor arguments. `ConstructorParameters` sees only the LAST overload,
 * which for `Color` is `(r, g, b)` — so the `ColorRepresentation` form is
 * added back explicitly (`<color attach="background" args={['#05070c']} />`).
 */
export type ArgsOf<T extends Ctor> =
    T extends typeof THREE.Color ? ConstructorParameters<T> | [color: THREE.ColorRepresentation] : ConstructorParameters<T>;

/** Props every three element accepts besides its own properties. */
export interface NodeProps<T extends Ctor> {
    /** Constructor arguments. Changing them reconstructs the object. */
    args?: ArgsOf<T>;
    /** How a non-Object3D binds to its parent: `"map"`, `"material-0"`, `"attributes-position"`, or a function. */
    attach?: AttachType;
    /** `null` keeps the object alive past unmount. */
    dispose?: null;
    /** `null` takes the object out of picking; a function replaces `Object3D.raycast`. */
    raycast?: THREE.Object3D['raycast'] | null;
    /** Merged into `object.userData`. */
    userData?: Record<string, unknown>;
    /** The HOST node (see `objectRef()` for the three object). */
    ref?: ObjectRef<InstanceType<T>> | ((node: ThreeNode<InstanceType<T>> | null) => void);
    key?: string | number | null;
    children?: JSXChildren;
}

/** Dashed paths into nested objects: `position-x`, `material-color`, `shadow-mapSize-width`. */
export type DashedPaths = { [K in `${string}-${string}`]?: unknown };

/** The props of the JSX element for a three.js class. */
export type ThreeElement<T extends Ctor> =
    & Mutable<InstanceType<T>>
    & NodeProps<T>
    & (InstanceType<T> extends THREE.Object3D ? EventHandlers : {})
    & DashedPaths;

/** `<primitive object={obj}>`: an existing object, never disposed or reconstructed. */
export interface PrimitiveProps extends EventHandlers, DashedPaths {
    object: object;
    attach?: AttachType;
    ref?: ObjectRef<any> | ((node: ThreeNode | null) => void);
    key?: string | number | null;
    children?: JSXChildren;
    [prop: string]: unknown;
}

// ---- catalog-derived tags ----------------------------------------------------

type ThreeNS = typeof THREE;
type ClassKeys = { [K in keyof ThreeNS]: ThreeNS[K] extends Ctor ? K : never }[keyof ThreeNS];

/** lowerFirst, with the DOM-colliding names prefixed. Mirrors `tagNameFor()`. */
export type Tag<K extends string> = Uncapitalize<K> extends 'line' | 'audio' | 'path' | 'source' ? `three${K}` : Uncapitalize<K>;

// A conditional, not `ThreeNS[K] & Ctor`: intersecting with the abstract
// constructor would widen `ConstructorParameters` to `any[]`.
type ThreeCatalogElements = { [K in ClassKeys as Tag<K & string>]: ThreeNS[K] extends Ctor ? ThreeElement<ThreeNS[K]> : never };

/**
 * All three.js intrinsic elements. Augment it for classes you `extend()`:
 *
 *     declare module '@sigx/runtime-three' {
 *         interface ThreeElements { orbitControls: ThreeElement<typeof OrbitControls> }
 *     }
 */
export interface ThreeElements extends ThreeCatalogElements {
    primitive: PrimitiveProps;
}

declare global {
    namespace JSX {
        interface IntrinsicElements extends ThreeElements {}
    }
}

// oxlint-disable-next-line no-useless-empty-export -- makes this a module so the global merge applies
export {};
