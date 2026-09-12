import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { preload, useLoader, type LoaderResult } from './use-loader.js';
import type { MaybeSignal } from '../shared/types.js';

export interface UseGLTFOptions {
    /** Enable DRACO-compressed meshes: `true` for the Google CDN decoder, or your own decoder path. */
    draco?: boolean | string;
    onProgress?: (event: ProgressEvent) => void;
}

const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

// One extensions fn per decoder path so the loader cache keys on it.
const dracoExtensions = new Map<string, (loader: GLTFLoader) => void>();
function extensionsFor(draco: boolean | string | undefined): ((loader: GLTFLoader) => void) | undefined {
    if (!draco) return undefined;
    const path = typeof draco === 'string' ? draco : DRACO_CDN;
    let fn = dracoExtensions.get(path);
    if (fn === undefined) {
        fn = (loader) => {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(path);
            loader.setDRACOLoader(dracoLoader);
        };
        dracoExtensions.set(path, fn);
    }
    return fn;
}

/**
 * Load a glTF/GLB scene, cached and shared by identity. Mount it with
 * `<primitive object={gltf.value.scene} />` (or clone it for several copies).
 *
 * @example
 * ```ts
 * const ship = useGLTF('/ship.glb', { draco: true });
 * return () => ship.value ? <primitive object={ship.value.scene} /> : null;
 * ```
 */
export function useGLTF(url: MaybeSignal<string>, options: UseGLTFOptions = {}): LoaderResult<GLTF> {
    return useLoader(GLTFLoader, url, { extensions: extensionsFor(options.draco), onProgress: options.onProgress });
}

/** Warm the cache: `useGLTF.preload('/ship.glb')`. */
useGLTF.preload = (url: string | string[], options: UseGLTFOptions = {}): Promise<void> =>
    preload(GLTFLoader, url, extensionsFor(options.draco));
