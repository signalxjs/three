/**
 * `useLoader` — value-first asset loading on a module-level cache.
 *
 * Not `useData` + `@sigx/cache`: GPU-backed assets (textures, geometries,
 * GLTF scenes) are non-serializable, must never load on the server, must be
 * shared BY IDENTITY across roots and components (two loads would be two GPU
 * uploads), and need an explicit `dispose()`. What this keeps from core's
 * async vocabulary: `value` / `loading` / `error` / `state`, and "the value
 * clears when the key changes".
 */
import { signal, watch } from '@sigx/reactivity';
import { isBrowser } from '../shared/scope.js';
import { toValue } from '../shared/to-value.js';
import { tryOnDispose } from '../shared/scope.js';
import type { MaybeSignal } from '../shared/types.js';

/** Any three.js loader: `new Loader()` with `loadAsync(url, onProgress)`. */
export interface LoaderLike<T> {
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<T>;
}
export type LoaderCtor<T = unknown> = new () => LoaderLike<T>;
export type LoaderResultOf<L> = L extends LoaderCtor<infer T> ? T : never;

export type LoadState = 'pending' | 'ready' | 'error';

/** The reactive result: getters over signals, so read it in render functions and effects. */
export interface LoaderResult<T> {
    /** The loaded asset, or `null` while pending / after an error / on a key change. */
    readonly value: T | null;
    readonly loading: boolean;
    readonly error: unknown;
    readonly state: LoadState;
    /** Drop the cache entry for the current url(s) and load again. */
    reload(): void;
}

export interface UseLoaderOptions<L extends LoaderCtor> {
    /** Configure the loader instance once (DRACO, KTX2, a manager). Identity-keyed: hoist it. */
    extensions?: (loader: InstanceType<L>) => void;
    onProgress?: (event: ProgressEvent) => void;
}

interface Entry {
    promise: Promise<unknown> | null;
    value: unknown;
    error: unknown;
    /** Bumped on every settle so waiters re-read. */
    generation: number;
}

// Loader instance per (constructor, extensions fn); assets per (constructor, url).
const loaders = new Map<LoaderCtor, Map<Function | null, LoaderLike<unknown>>>();
const cache = new Map<LoaderCtor, Map<string, Entry>>();

function loaderFor<L extends LoaderCtor>(Loader: L, extensions?: (l: any) => void): LoaderLike<unknown> {
    let byExt = loaders.get(Loader);
    if (byExt === undefined) loaders.set(Loader, (byExt = new Map()));
    const key = extensions ?? null;
    let instance = byExt.get(key);
    if (instance === undefined) {
        instance = new Loader();
        extensions?.(instance);
        byExt.set(key, instance);
    }
    return instance;
}

function entryFor(Loader: LoaderCtor, url: string): Entry {
    let byUrl = cache.get(Loader);
    if (byUrl === undefined) cache.set(Loader, (byUrl = new Map()));
    let entry = byUrl.get(url);
    if (entry === undefined) {
        entry = { promise: null, value: undefined, error: undefined, generation: 0 };
        byUrl.set(url, entry);
    }
    return entry;
}

/** Start (or join) the load of one url. */
function load(Loader: LoaderCtor, url: string, extensions?: (l: any) => void, onProgress?: (e: ProgressEvent) => void): Entry {
    const entry = entryFor(Loader, url);
    if (entry.value !== undefined || entry.promise !== null) return entry;
    const p = loaderFor(Loader, extensions)
        .loadAsync(url, onProgress)
        .then(
            (value) => {
                if (entry.promise === p) {
                    entry.value = value;
                    entry.error = undefined;
                    entry.promise = null;
                    entry.generation++;
                }
                return value;
            },
            (error: unknown) => {
                if (entry.promise === p) {
                    entry.error = error;
                    entry.promise = null;
                    entry.generation++;
                }
                throw error;
            }
        );
    entry.promise = p;
    return entry;
}

/**
 * Load assets ahead of use — e.g. at module top level, or on hover before a
 * route. Resolves when every url is cached.
 */
export function preload<L extends LoaderCtor>(Loader: L, url: string | string[], extensions?: (loader: InstanceType<L>) => void): Promise<void> {
    if (!isBrowser) return Promise.resolve();
    const urls = Array.isArray(url) ? url : [url];
    return Promise.all(urls.map((u) => {
        const e = load(Loader, u, extensions);
        return e.value !== undefined ? Promise.resolve() : e.promise!.then(() => {}, () => {});
    })).then(() => {});
}

/** Detach an entry: an in-flight load's settle handlers see a foreign promise and ignore the result. */
function cancel(entry: Entry): void {
    disposeValue(entry.value);
    entry.promise = null;
    entry.value = undefined;
    entry.error = undefined;
}

function disposeValue(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    const v = value as { dispose?: () => void; scene?: { traverse?: (fn: (o: any) => void) => void } };
    if (typeof v.dispose === 'function') {
        v.dispose();
        return;
    }
    // A GLTF result: dispose what its scene owns.
    v.scene?.traverse?.((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
    });
}

/**
 * Drop cached assets (and dispose them): everything, everything of one
 * loader, or one url. The next `useLoader` loads afresh.
 */
export function clearLoaderCache(Loader?: LoaderCtor, url?: string): void {
    if (Loader === undefined) {
        for (const byUrl of cache.values()) for (const e of byUrl.values()) cancel(e);
        cache.clear();
        return;
    }
    const byUrl = cache.get(Loader);
    if (byUrl === undefined) return;
    if (url === undefined) {
        for (const e of byUrl.values()) cancel(e);
        cache.delete(Loader);
        return;
    }
    const e = byUrl.get(url);
    if (e !== undefined) {
        cancel(e);
        byUrl.delete(url);
    }
}

/**
 * Load an asset (or a list) with a three.js loader, cached by url and shared
 * by identity. A reactive `url` reloads on change; a cache hit resolves
 * synchronously (no flash). On the server the result stays `pending`.
 *
 * @example
 * ```ts
 * const gltf = useLoader(GLTFLoader, '/ship.glb');
 * return () => gltf.value ? <primitive object={gltf.value.scene} /> : null;
 * ```
 */
export function useLoader<L extends LoaderCtor>(Loader: L, url: MaybeSignal<string>, options?: UseLoaderOptions<L>): LoaderResult<LoaderResultOf<L>>;
export function useLoader<L extends LoaderCtor>(Loader: L, url: MaybeSignal<string[]>, options?: UseLoaderOptions<L>): LoaderResult<LoaderResultOf<L>[]>;
export function useLoader<L extends LoaderCtor>(Loader: L, url: MaybeSignal<string | string[]>, options?: UseLoaderOptions<L>): LoaderResult<LoaderResultOf<L> | LoaderResultOf<L>[]>;
export function useLoader<L extends LoaderCtor>(Loader: L, url: MaybeSignal<string | string[]>, options: UseLoaderOptions<L> = {}): LoaderResult<unknown> {
    // The asset itself never enters a signal (it would be deep-proxied); only
    // a version counter is reactive, and the getters read the raw value.
    const version = signal(0);
    let current: unknown = null;
    let error: unknown = undefined;
    let state: LoadState = 'pending';
    let disposed = false;
    let run = 0;

    function settle(nextValue: unknown, nextError: unknown, nextState: LoadState): void {
        current = nextValue;
        error = nextError;
        state = nextState;
        version.value++;
    }

    function start(force = false): void {
        const resolved = toValue(url);
        const urls = Array.isArray(resolved) ? resolved : [resolved];
        const isList = Array.isArray(resolved);
        const token = ++run;
        if (!isBrowser) return;
        if (force) for (const u of urls) clearLoaderCache(Loader, u);
        const entries = urls.map((u) => load(Loader, u, options.extensions, options.onProgress));
        // Synchronous cache hit: no pending flash.
        if (entries.every((e) => e.value !== undefined)) {
            settle(isList ? entries.map((e) => e.value) : entries[0].value, undefined, 'ready');
            return;
        }
        if (state !== 'pending' || current !== null) settle(null, undefined, 'pending');
        Promise.all(entries.map((e) => (e.value !== undefined ? Promise.resolve(e.value) : e.promise!))).then(
            (values) => {
                if (disposed || token !== run) return;
                settle(isList ? values : values[0], undefined, 'ready');
            },
            (err: unknown) => {
                if (disposed || token !== run) return;
                settle(null, err, 'error');
            }
        );
    }

    const reactiveUrl = typeof url === 'function' || (typeof url === 'object' && url !== null && !Array.isArray(url));
    if (reactiveUrl) {
        const handle = watch(() => toValue(url), () => start(), { immediate: true });
        tryOnDispose(() => handle.stop());
    } else {
        start();
    }
    tryOnDispose(() => {
        disposed = true;
    });

    return {
        get value() {
            void version.value;
            return current;
        },
        get loading() {
            void version.value;
            return state === 'pending';
        },
        get error() {
            void version.value;
            return error;
        },
        get state() {
            void version.value;
            return state;
        },
        reload: () => start(true)
    };
}
