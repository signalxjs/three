/**
 * Collision / intersection event dispatch from Rapier's event queue.
 */
import type { CollisionHandlers, CollisionPayload, ColliderRecord, RapierContext } from './context.js';

// One payload object, reused for every dispatch.
const payload: CollisionPayload = {
    target: null,
    other: null,
    targetCollider: null as unknown as CollisionPayload['targetCollider'],
    otherCollider: null as unknown as CollisionPayload['otherCollider']
};

function fire(handlers: CollisionHandlers | null | undefined, sensor: boolean, started: boolean): void {
    if (!handlers) return;
    const fn = sensor
        ? started ? handlers.onIntersectionEnter : handlers.onIntersectionExit
        : started ? handlers.onCollisionEnter : handlers.onCollisionExit;
    fn?.(payload);
}

function dispatchSide(self: ColliderRecord, other: ColliderRecord, sensor: boolean, started: boolean): void {
    payload.target = self.body?.api ?? null;
    payload.other = other.body?.api ?? null;
    payload.targetCollider = self.collider;
    payload.otherCollider = other.collider;
    fire(self.handlers, sensor, started);
    fire(self.body?.handlers, sensor, started);
}

/** Drain the queue and call the handlers on both sides of every event. */
export function drainEvents(ctx: RapierContext): void {
    const queue = ctx.eventQueue;
    if (queue === null) return;
    queue.drainCollisionEvents((h1, h2, started) => {
        const a = ctx.colliders.get(h1);
        const b = ctx.colliders.get(h2);
        if (a === undefined || b === undefined) return;
        const sensor = a.collider.isSensor() || b.collider.isSensor();
        dispatchSide(a, b, sensor, started);
        dispatchSide(b, a, sensor, started);
    });
    payload.target = payload.other = null;
}
