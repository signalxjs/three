/** Read-only view of a signal-like value (`PrimitiveSignal`, `Computed`, a `toSignal` view). */
export interface ReadSignal<T> {
    readonly value: T;
}

/** What composables accept "as anything reactive-ish": a value, a `{ value }` handle, or a getter. */
export type MaybeSignal<T> = T | ReadSignal<T> | (() => T);

/** Detaches whatever the composable attached. */
export type Stop = () => void;
