/**
 * `threeMount` — the `MountFn` for `defineApp(<App />).mount(target, threeMount)`.
 * Registered as the platform default only by the opt-in `./platform` entry.
 */
import type { MountFn } from '@sigx/runtime-core';
import { setProvided } from '@sigx/runtime-core/internals';
import { ROOT_TOKEN } from './hooks.js';
import { createRoot, type RootOptions } from './root.js';
import { sigxThreeError } from './utils.js';

export type ThreeMountTarget =
    | HTMLCanvasElement
    | HTMLElement
    | string
    | (RootOptions & { target?: HTMLCanvasElement | HTMLElement | string | null });

function resolveTarget(target: HTMLCanvasElement | HTMLElement | string | null | undefined): HTMLCanvasElement | HTMLElement | null {
    if (target === null || target === undefined) return null;
    if (typeof target === 'string') {
        const el = (globalThis as any).document?.querySelector(target) as HTMLElement | null;
        if (!el) throw sigxThreeError(`Mount target "${target}" not found.`);
        return el;
    }
    return target;
}

export const threeMount: MountFn<ThreeMountTarget> = (element, container, appContext) => {
    let options: RootOptions = {};
    let target: HTMLCanvasElement | HTMLElement | null;
    if (typeof container === 'string' || (container as HTMLElement)?.nodeType !== undefined) {
        target = resolveTarget(container as HTMLElement | string);
    } else {
        const { target: t, ...rest } = container as RootOptions & { target?: HTMLCanvasElement | HTMLElement | string | null };
        options = rest;
        target = resolveTarget(t);
    }
    const root = createRoot(target, options);
    if (appContext) setProvided(appContext.provides, ROOT_TOKEN, root.store);
    root.render(element, appContext);
    return () => root.unmount();
};
