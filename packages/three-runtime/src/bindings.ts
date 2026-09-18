/**
 * Signal-bound props: `<mesh position-x={x}>` where `x` is a signal, computed,
 * getter function or reactive object.
 *
 * Instead of re-rendering the component and diffing a vnode, one `effect`
 * per bound prop writes straight to the three.js object whenever the source
 * changes. Sources are identity-stable across renders, so core's `!==` prop
 * diff creates the binding once and never touches it again. Inline getters
 * (`() => x.value` written in JSX) are a fresh closure each render and
 * therefore rebind on every render — hoist them, or bind the signal itself.
 */
import { effect, isComputed, isReactive, isSignal } from '@sigx/reactivity';
import { handleComponentError } from '@sigx/runtime-core/internals';
import type { ThreeNode } from './node.js';
import { applyValue } from './props.js';

/** Bindable = signal | computed | reactive proxy | getter function. */
export function isBindable(value: unknown): boolean {
    return isSignal(value) || isComputed(value) || isReactive(value) || typeof value === 'function';
}

function readSource(source: any): unknown {
    if (typeof source === 'function') return source();
    if (isSignal(source) || isComputed(source)) return source.value;
    // A reactive proxy: applyValue's `copy()` reads its tracked fields.
    return source;
}

/** Bind `key` to a reactive source. Replaces an existing binding for the key. */
export function bindProp(node: ThreeNode, key: string, source: unknown): void {
    unbindProp(node, key);
    const runner = effect(() => {
        try {
            applyValue(node, key, readSource(source));
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (handleComponentError(node.appContext, err, null, `prop binding "${key}"`) !== true) throw e;
        }
    });
    (node.bindings ??= new Map()).set(key, runner);
}

/** Stop and forget the binding for `key`, if any. */
export function unbindProp(node: ThreeNode, key: string): void {
    const bindings = node.bindings;
    if (bindings === null) return;
    const runner = bindings.get(key);
    if (runner !== undefined) {
        runner.stop();
        bindings.delete(key);
    }
}

/** Stop every binding (unmount / before reconstruction). Keeps the map so `rebindAll` can restore. */
export function stopBindings(node: ThreeNode): void {
    const bindings = node.bindings;
    if (bindings === null) return;
    for (const runner of bindings.values()) runner.stop();
}

/**
 * After reconstruction: `ensureObject` has replayed `node.props`, which
 * re-created every binding through `setProp` → `bindProp` (a replayed
 * bindable source binds again). Nothing else to do — kept as an explicit
 * seam so the reconstruct sequence reads linearly.
 */
export function rebindAll(_node: ThreeNode): void {}
