import { signal, watch } from '@sigx/reactivity';
import { useThree, type ObjectRef } from '@sigx/three-runtime';
import type { Object3D } from 'three';
import { frameHook } from '../shared/frame-hook.js';
import { tryOnDispose } from '../shared/scope.js';
import { toValue } from '../shared/to-value.js';
import type { MaybeSignal, ReadSignal } from '../shared/types.js';

type HelperCtor<H extends Object3D> = new (target: any, ...args: any[]) => H;

/**
 * Add a three.js helper (`BoxHelper`, `CameraHelper`, `DirectionalLightHelper`,
 * …) for an object to the scene, update it every frame, and remove it when
 * the target changes or the scope ends. The target is an `objectRef()` or a
 * signal/getter of an object.
 *
 * @example
 * ```ts
 * const light = objectRef<DirectionalLight>();
 * useHelper(light, DirectionalLightHelper, 1, 'red');
 * ```
 */
export function useHelper<H extends Object3D>(
    target: ObjectRef<Object3D> | MaybeSignal<Object3D | null | undefined>,
    Helper: HelperCtor<H>,
    ...args: unknown[]
): ReadSignal<H | null> {
    const state = useThree();
    // The helper is a three object: keep it raw, make only a version reactive.
    const version = signal(0);
    let current: H | null = null;

    const read = (): Object3D | null => {
        if (typeof target === 'function' && 'current' in target) return (target as ObjectRef<Object3D>).current;
        return toValue(target as MaybeSignal<Object3D | null | undefined>) ?? null;
    };

    const remove = (): void => {
        if (current !== null) {
            state.scene.remove(current);
            (current as { dispose?: () => void }).dispose?.();
            current = null;
            version.value++;
        }
    };

    // An objectRef is not reactive: resolve it on the first frame and keep it.
    let resolved: Object3D | null = null;
    const attach = (object: Object3D | null): void => {
        if (object === resolved) return;
        remove();
        resolved = object;
        if (object !== null) {
            current = new Helper(object, ...args);
            state.scene.add(current);
            version.value++;
        }
    };

    if (!(typeof target === 'function' && 'current' in target)) {
        const handle = watch(() => read(), (o) => attach(o ?? null), { immediate: true });
        tryOnDispose(() => handle.stop());
    }
    const offFrame = frameHook(() => {
        attach(read());
        (current as { update?: () => void } | null)?.update?.();
    }, -1);
    tryOnDispose(() => {
        offFrame();
        remove();
    });
    return {
        get value() {
            void version.value;
            return current;
        }
    } as ReadSignal<H | null>;
}
