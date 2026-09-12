/**
 * Module augmentation for the three.js platform: `ctx.el` / `onMounted(({ el }))`
 * resolve to the host node. Imported only by `./platform` (three-only apps) —
 * see the note there.
 */
import type { ThreeNode } from './node.js';

declare module '@sigx/runtime-core' {
    interface PlatformTypes {
        element: ThreeNode;
    }
}

// oxlint-disable-next-line no-useless-empty-export -- makes this a module so the augmentation applies
export {};
