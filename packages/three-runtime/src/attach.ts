/**
 * `attach` — how a non-Object3D child binds to its parent.
 *
 * `<boxGeometry>` under `<mesh>` becomes `mesh.geometry = geometry`;
 * `<meshStandardMaterial>` becomes `mesh.material = material`; textures need
 * an explicit path (`attach="map"` on a material, `attach="material-map"` on
 * a mesh). `attach` also takes a function `(parent, self) => cleanup`.
 */
import { NodeKind, type AttachType, type ThreeNode } from './node.js';
import { sigxThreeError } from './utils.js';

const pathCache = new Map<string, (string | number)[]>();

/** Split a dashed prop path once and cache it: `material-map` → `['material', 'map']`, `material-0` → `['material', 0]`. */
export function pathFor(key: string): (string | number)[] {
    let path = pathCache.get(key);
    if (path === undefined) {
        const parts = key.split('-');
        path = [];
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const n = Number(p);
            path.push(p !== '' && Number.isInteger(n) && String(n) === p ? n : p);
        }
        pathCache.set(key, path);
    }
    return path;
}

/**
 * The attach for a constructed child: its explicit prop, else inferred from
 * the object's kind. `null` means "a scene-graph child (`parent.add`)".
 * Throws for objects that can only be attached and carry no `attach`.
 */
export function resolveAttach(child: ThreeNode): AttachType | null {
    if (child.attach !== null) return child.attach;
    const o = child.object;
    if (o === null) return null;
    if (o.isObject3D) return null;
    if (o.isBufferGeometry) return 'geometry';
    if (o.isMaterial) return 'material';
    if (o.isFog || o.isFogExp2) return 'fog';
    throw sigxThreeError(
        `<${child.tag}> is not an Object3D and needs an explicit attach prop ` +
        `(e.g. attach="map" for a texture on a material, attach="attributes-position" for a buffer attribute).`
    );
}

/** Bind `child.object` onto `parent.object` according to `attach`. */
export function attachTo(parent: ThreeNode, child: ThreeNode, attach: AttachType): void {
    const parentObject = parent.object;
    if (typeof attach === 'function') {
        const cleanup = attach(parentObject, child.object);
        child.attachCleanup = typeof cleanup === 'function' ? cleanup : null;
    } else {
        const path = pathFor(attach);
        let target = parentObject;
        const last = path.length - 1;
        for (let i = 0; i < last; i++) {
            target = target[path[i]];
            if (target === null || target === undefined) {
                throw sigxThreeError(
                    `attach="${attach}" on <${child.tag}>: "${String(path[i])}" does not exist on <${parent.tag}>.`
                );
            }
        }
        const key = path[last];
        child.attachTarget = target;
        child.attachKey = key;
        child.attachPrev = target[key];
        target[key] = child.object;
        // A material whose texture slot changed must recompile its program.
        if (target.isMaterial === true) target.needsUpdate = true;
    }
    child.attached = true;
}

/** Undo `attachTo`, restoring the slot's previous value. */
export function detach(child: ThreeNode): void {
    if (!child.attached) return;
    if (child.attachCleanup !== null) {
        child.attachCleanup();
        child.attachCleanup = null;
    } else if (child.attachTarget !== null) {
        const target = child.attachTarget;
        target[child.attachKey!] = child.attachPrev;
        if (target.isMaterial === true) target.needsUpdate = true;
    }
    child.attachTarget = null;
    child.attachKey = null;
    child.attachPrev = undefined;
    child.attached = false;
}

// ---------------------------------------------------------------------------
// Scene-graph placement (the `parent.add` path)
// ---------------------------------------------------------------------------

// Hoisted event objects: three's own `add`/`remove` allocate one per call.
const ADDED_EVENT = { type: 'added' } as const;
const REMOVED_EVENT = { type: 'removed' } as const;
const CHILD_ADDED_EVENT: { type: 'childadded'; child: any } = { type: 'childadded', child: null };
const CHILD_REMOVED_EVENT: { type: 'childremoved'; child: any } = { type: 'childremoved', child: null };

/** Remove `object` from whatever three.js parent it currently has. */
export function removeFromParent(object: any): void {
    const p = object.parent;
    if (p === null || p === undefined) return;
    const children = p.children as any[];
    const i = children.indexOf(object);
    if (i !== -1) children.splice(i, 1);
    object.parent = null;
    object.dispatchEvent(REMOVED_EVENT);
    CHILD_REMOVED_EVENT.child = object;
    p.dispatchEvent(CHILD_REMOVED_EVENT);
    CHILD_REMOVED_EVENT.child = null;
}

/** `Object3D.add` without three's O(n) removal scan when the object is fresh, at a given index. */
export function insertObjectAt(parentObject: any, object: any, index: number): void {
    object.parent = parentObject;
    const children = parentObject.children as any[];
    if (index === -1 || index >= children.length) children.push(object);
    else children.splice(index, 0, object);
    object.dispatchEvent(ADDED_EVENT);
    CHILD_ADDED_EVENT.child = object;
    parentObject.dispatchEvent(CHILD_ADDED_EVENT);
    CHILD_ADDED_EVENT.child = null;
}

/**
 * The index in `parent.object.children` a scene-graph child should occupy so
 * three's child order matches the declared JSX order: the index of the next
 * scene-bearing shadow sibling, or -1 (append). O(1) for appends.
 */
export function indexFor(parent: ThreeNode, child: ThreeNode): number {
    let s = child.next;
    while (s !== null) {
        if (s.kind === NodeKind.Element && s.isObject3D && !s.attached && s.object !== null && s.object.parent === parent.object) {
            return (parent.object.children as any[]).indexOf(s.object);
        }
        s = s.next;
    }
    return -1;
}

/** Bind a constructed child to its constructed parent: `attach` or ordered `add`. Handles moves. */
export function placeChild(parent: ThreeNode, child: ThreeNode): void {
    const attach = resolveAttach(child);
    if (attach !== null) {
        if (child.attached) return;
        attachTo(parent, child, attach);
        return;
    }
    // A move (keyed reorder / re-parent): take it out first so `indexFor`
    // sees the post-removal array.
    removeFromParent(child.object);
    insertObjectAt(parent.object, child.object, indexFor(parent, child));
}

/** Undo `placeChild`. */
export function unplaceChild(child: ThreeNode): void {
    if (child.attached) detach(child);
    else if (child.isObject3D && child.object !== null) removeFromParent(child.object);
}
