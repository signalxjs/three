/**
 * The `RendererOptions` implementation core drives: create / insert / remove /
 * patch on `ThreeNode`s, mirrored into the three.js scene graph.
 */
import type { RendererOptions } from '@sigx/runtime-core/internals';
import { detach, placeChild, unplaceChild } from './attach.js';
import { stopBindings } from './bindings.js';
import { PRIMITIVE_TAG, resolveConstructor } from './catalog.js';
import { ensureObject } from './construct.js';
import { clearHandlers, ensureRegistered } from './events.js';
import { adoptRoot, linkBefore, NodeKind, ThreeNode, unlink } from './node.js';
import { setProp } from './props.js';
import { warnOnce } from './utils.js';

function invalidateFrom(node: ThreeNode): void {
    const root = node.root;
    if (root !== null) root.invalidate();
}

function warnText(parent: ThreeNode, text: string): void {
    if (!__DEV__) return;
    if (parent.kind !== NodeKind.Element || text.trim() === '') return;
    warnOnce(
        `text:${parent.tag}`,
        `<${parent.tag}> received text content ("${text.slice(0, 20)}") — three.js elements cannot render text. ` +
        `Use a text mesh (e.g. troika-three-text via extend()) or move the text outside <Canvas>.`
    );
}

export const nodeOps: RendererOptions<ThreeNode, ThreeNode> = {
    createElement(tag) {
        const node = new ThreeNode(NodeKind.Element, tag);
        if (tag === PRIMITIVE_TAG) node.isPrimitive = true;
        else node.ctor = resolveConstructor(tag);
        return node;
    },

    createText(text) {
        const node = new ThreeNode(NodeKind.Text, '#text');
        node.text = text;
        return node;
    },

    createComment() {
        return new ThreeNode(NodeKind.Anchor, '#anchor');
    },

    patchProp(el, key, prev, next, _ns, appContext) {
        if (appContext) el.appContext = appContext;
        (el.props ??= Object.create(null))[key] = next;
        if (el.object === null) return; // replayed by ensureObject
        setProp(el, key, prev, next);
    },

    insert(child, parent, anchor) {
        // Core can hand an anchor that has already been unmounted — degrade to append.
        if (anchor && anchor.parent !== parent) anchor = null;
        // A keyed move / re-parent: unlink first.
        if (child.parent !== null) unlink(child);
        linkBefore(parent, child, anchor ?? null);
        if (parent.root !== null && child.root !== parent.root) adoptRoot(child, parent.root, ensureRegistered);

        if (child.kind !== NodeKind.Element) {
            if (child.kind === NodeKind.Text) warnText(parent, child.text);
            invalidateFrom(parent);
            return;
        }
        // Children are mounted before their parent is inserted, so the parent
        // may still be unconstructed here; all its props are recorded by now.
        if (parent.kind === NodeKind.Element) ensureObject(parent);
        ensureObject(child);
        if (parent.object !== null) placeChild(parent, child);
        invalidateFrom(parent);
    },

    remove(child) {
        const parent = child.parent;
        unlink(child);
        if (parent !== null) {
            if (child.kind === NodeKind.Element && child.object !== null) {
                // Under an unmounting parent the whole subtree leaves the
                // scene with the parent's own removal — skip the O(n) child
                // splice. Attach cleanups (user functions, slot restores)
                // still run: they are cheap and may be observable.
                if (child.attached) detach(child);
                else if (!parent.unmounting) unplaceChild(child);
            }
            invalidateFrom(parent);
        }
        child.root = null;
    },

    setText(node, text) {
        node.text = text;
        if (node.parent !== null) warnText(node.parent, text);
    },

    setElementText(node, text) {
        warnText(node, text);
    },

    parentNode(node) {
        return node.parent;
    },

    nextSibling(node) {
        return node.next;
    },

    onElementUnmounted(node) {
        node.unmounting = true;
        stopBindings(node);
        node.bindings = null;
        clearHandlers(node);
        const object = node.object;
        if (object !== null && node.disposeOnUnmount && !node.isPrimitive && typeof object.dispose === 'function') {
            object.dispose();
        }
    }
};
