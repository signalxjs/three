/**
 * Module augmentation for the three.js platform: `ctx.el` / `onMounted(({ el }))`
 * resolve to the host node. Imported only by `./platform` (three-only apps) —
 * see the note there.
 */
import type { ThreeNode } from './node.js';

declare module '@sigx/runtime-core' {
    interface PlatformTypes {
        // A program holding both renderers (this repo's root typecheck, a
        // `<Canvas>` app) also sees runtime-dom's `element: HTMLElement`.
        // Which declaration is flagged depends on file order, so silence
        // it here; three-only apps never load runtime-dom's augmentation.
        // oxlint-disable-next-line ban-ts-comment
        // @ts-ignore TS2717 — conflicts with runtime-dom's PlatformTypes.element
        element: ThreeNode;
    }
}

// oxlint-disable-next-line no-useless-empty-export -- makes this a module so the augmentation applies
export {};
