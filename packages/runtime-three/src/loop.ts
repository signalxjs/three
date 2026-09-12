/**
 * The frame loop: one rAF per root, priority-sorted subscribers, fixed-step
 * accumulators, demand rendering. Nothing here allocates per frame.
 */
import type { ThreeState } from './root.js';

export type FrameCallback = (state: ThreeState, delta: number) => void;
export type FixedCallback = (step: number, state: ThreeState) => void;

/** How frames are scheduled. Tests pass a manual one; the default is rAF (or a 16 ms timeout without it). */
export interface FrameScheduler {
    request(cb: (timestamp: number) => void): unknown;
    cancel(id: unknown): void;
    now(): number;
}

export function defaultScheduler(): FrameScheduler {
    const g = globalThis as any;
    if (typeof g.requestAnimationFrame === 'function') {
        return {
            request: (cb) => g.requestAnimationFrame(cb),
            cancel: (id) => g.cancelAnimationFrame(id),
            now: () => (typeof g.performance !== 'undefined' ? g.performance.now() : Date.now())
        };
    }
    return {
        request: (cb) => setTimeout(() => cb(Date.now()), 16),
        cancel: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        now: () => Date.now()
    };
}

interface FrameSub {
    cb: FrameCallback;
    priority: number;
}

interface FixedSub {
    cb: FixedCallback;
    step: number;
    maxSubSteps: number;
    accumulator: number;
    alpha: number;
}

export interface FixedHandle {
    stop(): void;
    /** Interpolation factor: how far into the next fixed step the last frame was, 0..1. */
    alpha(): number;
}

/** Cap on frames queued by `invalidate(n)`. */
const MAX_PENDING_FRAMES = 60;

export class FrameLoop {
    /** Sorted by priority (ascending). Copy-on-write: iteration never sees a mutating array. */
    private subs: FrameSub[] = [];
    private fixed: FixedSub[] = [];
    /** Number of subscribers with priority > 0: any of them takes over rendering (r3f semantics). */
    manualRender = 0;
    private pendingFrames = 0;
    private frameId: unknown = null;
    private last = -1;
    private stopped = false;

    constructor(
        private readonly state: ThreeState,
        private readonly scheduler: FrameScheduler,
        private readonly maxDelta: number,
        private readonly onError: (error: unknown, info: string) => void
    ) {}

    subscribe(cb: FrameCallback, priority = 0): () => void {
        const sub: FrameSub = { cb, priority };
        const prev = this.subs;
        let i = prev.length;
        while (i > 0 && prev[i - 1].priority > priority) i--;
        const next = prev.slice(0, i);
        next.push(sub);
        for (let j = i; j < prev.length; j++) next.push(prev[j]);
        this.subs = next;
        if (priority > 0) this.manualRender++;
        this.invalidate();
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            const cur = this.subs;
            const k = cur.indexOf(sub);
            if (k !== -1) {
                const copy = cur.slice();
                copy.splice(k, 1);
                this.subs = copy;
            }
            if (priority > 0) this.manualRender--;
        };
    }

    subscribeFixed(cb: FixedCallback, step: number, maxSubSteps: number): FixedHandle {
        const sub: FixedSub = { cb, step, maxSubSteps, accumulator: 0, alpha: 0 };
        this.fixed = this.fixed.concat(sub);
        this.invalidate();
        let active = true;
        return {
            stop: () => {
                if (!active) return;
                active = false;
                const cur = this.fixed;
                const k = cur.indexOf(sub);
                if (k !== -1) {
                    const copy = cur.slice();
                    copy.splice(k, 1);
                    this.fixed = copy;
                }
            },
            alpha: () => sub.alpha
        };
    }

    /** The per-frame body. One closure per root, allocated once. */
    readonly tick = (timestamp: number): void => {
        this.frameId = null;
        if (this.stopped) return;
        const state = this.state;
        // This frame consumes one pending request. An `invalidate()` raised
        // DURING the frame (a bound prop written from useFrame, say) then
        // counts towards the next one.
        if (state.frameloop !== 'always' && this.pendingFrames > 0) this.pendingFrames--;
        const clock = state.clock;
        const delta = this.last < 0 ? 0 : Math.min((timestamp - this.last) / 1000, this.maxDelta);
        this.last = timestamp;
        clock.delta = delta;
        clock.elapsed += delta;
        clock.frame++;

        const fixed = this.fixed;
        for (let i = 0; i < fixed.length; i++) {
            const f = fixed[i];
            f.accumulator += delta;
            let n = 0;
            while (f.accumulator >= f.step && n < f.maxSubSteps) {
                try {
                    f.cb(f.step, state);
                } catch (e) {
                    this.onError(e, 'fixed update');
                }
                f.accumulator -= f.step;
                n++;
            }
            // Ran out of sub-steps: drop the backlog rather than spiral.
            if (f.accumulator >= f.step) f.accumulator = f.accumulator % f.step;
            f.alpha = f.accumulator / f.step;
            clock.alpha = f.alpha;
        }

        const subs = this.subs;
        for (let i = 0; i < subs.length; i++) {
            try {
                subs[i].cb(state, delta);
            } catch (e) {
                this.onError(e, 'frame');
            }
        }

        if (this.manualRender === 0 && state.gl !== null) {
            try {
                state.gl.render(state.scene, state.camera);
            } catch (e) {
                this.onError(e, 'render');
            }
        }

        if (state.frameloop === 'always' || this.pendingFrames > 0) this.schedule();
    };

    private schedule(): void {
        if (this.frameId !== null || this.stopped || this.state.frameloop === 'never') return;
        this.frameId = this.scheduler.request(this.tick);
    }

    /** Start the loop: continuous in `always`, one initial paint in `demand`, nothing in `never`. */
    start(): void {
        const mode = this.state.frameloop;
        if (mode === 'always') this.schedule();
        else if (mode === 'demand') this.invalidate();
    }

    /**
     * Demand mode: make sure at least `frames` more frames render. Requests
     * COALESCE (a burst of prop writes before the next frame is one frame),
     * they do not accumulate. A no-op in `never` mode.
     */
    invalidate(frames = 1): void {
        if (this.stopped) return;
        const mode = this.state.frameloop;
        if (mode === 'never') return;
        if (mode === 'always') {
            this.schedule();
            return;
        }
        this.pendingFrames = Math.min(MAX_PENDING_FRAMES, Math.max(this.pendingFrames, frames));
        this.schedule();
    }

    /** Run one frame synchronously. `dt` in seconds; omitted → wall-clock delta. */
    advance(dt?: number): void {
        if (this.stopped) return;
        if (this.frameId !== null) {
            this.scheduler.cancel(this.frameId);
            this.frameId = null;
        }
        let t: number;
        if (dt === undefined) {
            t = this.scheduler.now();
        } else {
            if (this.last < 0) this.last = 0;
            t = this.last + dt * 1000;
        }
        // A manual advance is one frame; it consumes one pending request.
        if (this.state.frameloop !== 'always') this.pendingFrames = Math.max(this.pendingFrames, 1);
        this.tick(t);
    }

    /** Mode changed: (re)start, paint once, or cancel the pending frame. */
    modeChanged(): void {
        const mode = this.state.frameloop;
        if (mode === 'always') this.schedule();
        else if (mode === 'demand') this.invalidate();
        else if (this.frameId !== null) {
            this.scheduler.cancel(this.frameId);
            this.frameId = null;
        }
    }

    stop(): void {
        this.stopped = true;
        if (this.frameId !== null) {
            this.scheduler.cancel(this.frameId);
            this.frameId = null;
        }
        this.subs = [];
        this.fixed = [];
        this.manualRender = 0;
        this.pendingFrames = 0;
    }
}
