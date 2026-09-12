/**
 * Body pose ↔ three.js transform sync, allocation-free apart from Rapier's own
 * pose getters (`translation()` / `rotation()` return fresh objects — an API
 * limitation, one small object each per body per step).
 */
import { Quaternion, Vector3 } from 'three';
import type { RapierContext } from './context.js';

/** After a step: shift `curr` → `prev`, read the new pose into `curr`, and fire sleep/wake. */
export function snapshot(ctx: RapierContext): void {
    for (const rec of ctx.bodies.values()) {
        if (rec.fixed) continue;
        const { body, prev, curr } = rec;
        prev.set(curr);
        const t = body.translation();
        const r = body.rotation();
        curr[0] = t.x;
        curr[1] = t.y;
        curr[2] = t.z;
        curr[3] = r.x;
        curr[4] = r.y;
        curr[5] = r.z;
        curr[6] = r.w;
        const sleeping = body.isSleeping();
        if (sleeping !== rec.sleeping) {
            rec.sleeping = sleeping;
            if (sleeping) rec.onSleep?.();
            else rec.onWake?.();
        }
    }
}

const p0 = new Vector3();
const p1 = new Vector3();
const q0 = new Quaternion();
const q1 = new Quaternion();

/** Before rendering: write each body's (interpolated) pose to its group. */
export function writeTransforms(ctx: RapierContext, alpha: number): void {
    const interpolate = ctx.interpolate;
    for (const rec of ctx.bodies.values()) {
        if (rec.fixed && rec.written) continue;
        const { group, prev, curr } = rec;
        if (interpolate && !rec.fixed) {
            p0.set(prev[0], prev[1], prev[2]);
            p1.set(curr[0], curr[1], curr[2]);
            group.position.copy(p0.lerp(p1, alpha));
            q0.set(prev[3], prev[4], prev[5], prev[6]);
            q1.set(curr[3], curr[4], curr[5], curr[6]);
            group.quaternion.copy(q0.slerp(q1, alpha));
        } else {
            group.position.set(curr[0], curr[1], curr[2]);
            group.quaternion.set(curr[3], curr[4], curr[5], curr[6]);
        }
        rec.written = true;
    }
}

/** Seed both pose buffers from the body (at creation and after teleports). */
export function seedPose(rec: { body: { translation(): { x: number; y: number; z: number }; rotation(): { x: number; y: number; z: number; w: number } }; prev: Float32Array; curr: Float32Array; written: boolean }): void {
    const t = rec.body.translation();
    const r = rec.body.rotation();
    rec.curr[0] = t.x;
    rec.curr[1] = t.y;
    rec.curr[2] = t.z;
    rec.curr[3] = r.x;
    rec.curr[4] = r.y;
    rec.curr[5] = r.z;
    rec.curr[6] = r.w;
    rec.prev.set(rec.curr);
    rec.written = false;
}
