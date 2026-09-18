/** A tagged error so users can tell renderer errors from three.js's own. */
export function sigxThreeError(message: string): Error {
    return new Error(`[sigx/three] ${message}`);
}

const warned = new Set<string>();

/** Dev-only console warning, emitted once per key. */
export function warnOnce(key: string, message: string): void {
    if (!__DEV__) return;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[sigx/three] ${message}`);
}

/** Shallow, element-wise `===` comparison of two args arrays. */
export function sameArgs(a: unknown[] | null, b: unknown[] | null): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
