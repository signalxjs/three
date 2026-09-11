import { Audio, AudioListener, AudioLoader, PositionalAudio, type Camera } from 'three';
import { useThree } from '@sigx/runtime-three';
import { useLoader, type LoaderResult } from './use-loader.js';
import { tryOnDispose } from '../shared/scope.js';
import type { MaybeSignal } from '../shared/types.js';

export interface UseAudioOptions {
    /** A positional (3D) source — attach the returned `audio` to an object. */
    positional?: boolean;
    loop?: boolean;
    /** 0..1 */
    volume?: number;
    /** Use your own listener; default: one shared listener attached to the root camera. */
    listener?: AudioListener;
}

export interface UseAudioResult {
    /** The decoded buffer's load state. */
    readonly buffer: LoaderResult<AudioBuffer>;
    /** The source. Null until the buffer is ready; mount a positional one with `<primitive object={audio} />`. */
    readonly audio: Audio | PositionalAudio | null;
    /** Plays once the buffer is ready (queued otherwise). */
    play(): void;
    stop(): void;
    readonly playing: boolean;
}

const listeners = new WeakMap<Camera, AudioListener>();

/** One `AudioListener` per camera, attached on first use. */
export function listenerFor(camera: Camera): AudioListener {
    let l = listeners.get(camera);
    if (l === undefined) {
        l = new AudioListener();
        camera.add(l);
        listeners.set(camera, l);
    }
    return l;
}

/**
 * Load a sound and get a three.js `Audio` (or `PositionalAudio`) bound to
 * the root camera's listener. `play()` before the buffer is ready plays as
 * soon as it lands.
 */
export function useAudio(url: MaybeSignal<string>, options: UseAudioOptions = {}): UseAudioResult {
    const buffer = useLoader(AudioLoader, url);
    let audio: Audio<any> | null = null;
    let wantPlay = false;
    let listener = options.listener ?? null;

    function ensure(): Audio | PositionalAudio | null {
        const data = buffer.value;
        if (data === null) return null;
        if (audio === null) {
            if (listener === null) listener = listenerFor(useThreeCamera());
            const a: Audio<any> = options.positional ? new PositionalAudio(listener) : new Audio(listener);
            a.setBuffer(data);
            if (options.loop) a.setLoop(true);
            if (options.volume !== undefined) a.setVolume(options.volume);
            audio = a;
            if (wantPlay) {
                wantPlay = false;
                a.play();
            }
        }
        return audio;
    }

    let camera: Camera | null = null;
    function useThreeCamera(): Camera {
        if (camera === null) camera = useThree().camera;
        return camera;
    }
    try {
        camera = useThree().camera;
    } catch {
        camera = null;
    }

    tryOnDispose(() => {
        if (audio !== null && audio.isPlaying) audio.stop();
        audio?.disconnect();
        audio = null;
    });

    return {
        buffer,
        get audio() {
            return ensure();
        },
        play() {
            const a = ensure();
            if (a === null) {
                wantPlay = true;
                return;
            }
            if (!a.isPlaying) a.play();
        },
        stop() {
            wantPlay = false;
            if (audio !== null && audio.isPlaying) audio.stop();
        },
        get playing() {
            return audio !== null && audio.isPlaying;
        }
    };
}
