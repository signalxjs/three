import { AnimationMixer, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { useThree, type ObjectRef } from '@sigx/three-runtime';
import { tryOnDispose } from '../shared/scope.js';
import { toValue } from '../shared/to-value.js';
import type { MaybeSignal } from '../shared/types.js';

export interface PlayOptions {
    /** Cross-fade from the currently playing action, in seconds. */
    fade?: number;
    loop?: THREE_LoopMode;
    repetitions?: number;
    /** Playback speed. Default 1. */
    timeScale?: number;
}
type THREE_LoopMode = typeof LoopRepeat | 2200 | 2201 | 2202;

export interface Animations {
    readonly mixer: AnimationMixer | null;
    /** Actions by clip name, once the root object exists. */
    readonly actions: Record<string, AnimationAction>;
    readonly names: string[];
    /** Play a clip by name (cross-fading from the previous one with `fade`). */
    play(name: string, options?: PlayOptions): AnimationAction | null;
    /** Stop one clip, or everything. */
    stop(name?: string): void;
    /** The clip currently playing via `play()`, if any. */
    readonly current: string | null;
}

/**
 * Drive `AnimationClip`s (from `useGLTF(...).value.animations`, say) on a
 * root object with an `AnimationMixer` advanced by the frame loop.
 *
 * @example
 * ```ts
 * const gltf = useGLTF('/character.glb');
 * const model = objectRef<Group>();
 * const anims = useAnimations(() => gltf.value?.animations ?? [], model);
 * useFrame(() => { if (input.isDown('run')) anims.play('Run', { fade: 0.2 }); else anims.play('Idle', { fade: 0.2 }); });
 * ```
 */
export function useAnimations(clips: MaybeSignal<AnimationClip[]>, root: ObjectRef<Object3D> | MaybeSignal<Object3D | null | undefined>): Animations {
    const state = useThree();
    let mixer: AnimationMixer | null = null;
    let rootObject: Object3D | null = null;
    let actions: Record<string, AnimationAction> = {};
    let names: string[] = [];
    let current: string | null = null;
    let currentAction: AnimationAction | null = null;

    const readRoot = (): Object3D | null => {
        if (typeof root === 'function' && 'current' in root) return (root as ObjectRef<Object3D>).current;
        return toValue(root as MaybeSignal<Object3D | null | undefined>) ?? null;
    };

    function ensure(): AnimationMixer | null {
        const object = readRoot();
        if (object === null) return null;
        if (mixer === null || rootObject !== object) {
            mixer?.stopAllAction();
            rootObject = object;
            mixer = new AnimationMixer(object);
            actions = {};
            names = [];
            for (const clip of toValue(clips)) {
                actions[clip.name] = mixer.clipAction(clip);
                names.push(clip.name);
            }
            current = null;
            currentAction = null;
        }
        return mixer;
    }

    const off = state.subscribe((_, dt) => {
        const m = ensure();
        if (m !== null) m.update(dt);
    }, -1);
    tryOnDispose(() => {
        off();
        mixer?.stopAllAction();
        if (mixer !== null && rootObject !== null) mixer.uncacheRoot(rootObject);
        mixer = null;
    });

    return {
        get mixer() {
            return ensure();
        },
        get actions() {
            ensure();
            return actions;
        },
        get names() {
            ensure();
            return names;
        },
        get current() {
            return current;
        },
        play(name, options = {}) {
            if (ensure() === null) return null;
            const action = actions[name];
            if (action === undefined) return null;
            if (current === name && action.isRunning()) return action;
            action.reset();
            action.setLoop(options.loop ?? LoopRepeat, options.repetitions ?? Infinity);
            action.timeScale = options.timeScale ?? 1;
            action.enabled = true;
            if (options.fade !== undefined && currentAction !== null && currentAction !== action) {
                action.crossFadeFrom(currentAction, options.fade, true);
            } else if (currentAction !== null && currentAction !== action) {
                currentAction.stop();
            }
            action.play();
            current = name;
            currentAction = action;
            return action;
        },
        stop(name) {
            if (mixer === null) return;
            if (name === undefined) {
                mixer.stopAllAction();
                current = null;
                currentAction = null;
                return;
            }
            actions[name]?.stop();
            if (current === name) {
                current = null;
                currentAction = null;
            }
        }
    };
}
