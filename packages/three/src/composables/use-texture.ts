import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { useLoader, type LoaderResult } from './use-loader.js';
import type { MaybeSignal } from '../shared/types.js';

export interface UseTextureOptions {
    /** Color space for the loaded textures. Default sRGB (right for `map`); pass `NoColorSpace` for data maps. */
    colorSpace?: string;
    anisotropy?: number;
}

/**
 * Load a texture (or several, as a list or a keyed record) with
 * `TextureLoader`, cached and shared by identity. Loaded textures get
 * `colorSpace` (default sRGB) and `anisotropy` applied once.
 *
 * @example
 * ```ts
 * const maps = useTexture({ map: '/color.jpg', normalMap: '/normal.jpg' }, { colorSpace: NoColorSpace });
 * return () => <meshStandardMaterial map={maps.value?.map} normalMap={maps.value?.normalMap} />;
 * ```
 */
export function useTexture(url: MaybeSignal<string>, options?: UseTextureOptions): LoaderResult<Texture>;
export function useTexture(url: MaybeSignal<string[]>, options?: UseTextureOptions): LoaderResult<Texture[]>;
export function useTexture<K extends string>(url: Record<K, string>, options?: UseTextureOptions): LoaderResult<Record<K, Texture>>;
export function useTexture(url: MaybeSignal<string | string[]> | Record<string, string>, options: UseTextureOptions = {}): LoaderResult<unknown> {
    const colorSpace = options.colorSpace ?? SRGBColorSpace;
    const configure = (t: Texture): Texture => {
        if (t.colorSpace !== colorSpace) {
            t.colorSpace = colorSpace as Texture['colorSpace'];
            t.needsUpdate = true;
        }
        if (options.anisotropy !== undefined && t.anisotropy !== options.anisotropy) {
            t.anisotropy = options.anisotropy;
            t.needsUpdate = true;
        }
        return t;
    };

    const isRecord = typeof url === 'object' && url !== null && !Array.isArray(url) && !('value' in url);
    if (isRecord) {
        const record = url as Record<string, string>;
        const keys = Object.keys(record);
        const inner = useLoader(TextureLoader, keys.map((k) => record[k]));
        let cached: Record<string, Texture> | null = null;
        let cachedFrom: unknown = null;
        return {
            get value() {
                const list = inner.value;
                if (list === null) return null;
                if (cachedFrom !== list) {
                    cached = {};
                    for (let i = 0; i < keys.length; i++) cached[keys[i]] = configure(list[i]);
                    cachedFrom = list;
                }
                return cached;
            },
            get loading() {
                return inner.loading;
            },
            get error() {
                return inner.error;
            },
            get state() {
                return inner.state;
            },
            reload: inner.reload
        };
    }

    const inner = useLoader(TextureLoader, url as MaybeSignal<string | string[]>);
    return {
        get value() {
            const v = inner.value;
            if (v === null) return null;
            if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i++) configure(v[i]);
                return v;
            }
            return configure(v);
        },
        get loading() {
            return inner.loading;
        },
        get error() {
            return inner.error;
        },
        get state() {
            return inner.state;
        },
        reload: inner.reload
    };
}

/** Warm the texture cache. */
export function preloadTexture(url: string | string[]): Promise<void> {
    const urls = Array.isArray(url) ? url : [url];
    return Promise.all(urls.map((u) => new TextureLoader().loadAsync(u).then(() => {}, () => {}))).then(() => {});
}

