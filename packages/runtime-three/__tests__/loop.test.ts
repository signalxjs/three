import { describe, expect, it, vi } from 'vitest';
import { jsx, component } from '@sigx/runtime-core';
import { useFrame, useFixedUpdate, useThree } from '@sigx/runtime-three';
import { createTestRoot } from './harness.js';

describe('frame loop', () => {
    it('frameloop="always" schedules a frame after every tick and renders', () => {
        const t = createTestRoot({ frameloop: 'always' });
        expect(t.scheduler.pending).toBe(1);
        t.scheduler.flush();
        expect(t.gl.calls).toHaveLength(1);
        expect(t.scheduler.pending).toBe(1);
        t.scheduler.flush();
        expect(t.gl.calls).toHaveLength(2);
        t.unmount();
        expect(t.scheduler.pending).toBe(0);
    });

    it('frameloop="demand" renders once per invalidate and then stops', () => {
        const t = createTestRoot({ frameloop: 'demand' });
        // createRoot itself invalidates once (initial paint)
        t.scheduler.flush();
        expect(t.gl.calls).toHaveLength(1);
        expect(t.scheduler.pending).toBe(0);
        t.state.invalidate();
        t.state.invalidate();
        expect(t.scheduler.pending).toBe(1);
        t.scheduler.flush();
        expect(t.gl.calls).toHaveLength(2);
        expect(t.scheduler.pending).toBe(0);
        t.state.invalidate(3);
        t.scheduler.flush();
        t.scheduler.flush();
        t.scheduler.flush();
        expect(t.gl.calls).toHaveLength(5);
        expect(t.scheduler.flush()).toBe(false);
        t.unmount();
    });

    it('frameloop="never" only renders on advance()', () => {
        const t = createTestRoot();
        t.state.invalidate();
        expect(t.scheduler.pending).toBe(0);
        t.state.advance(1 / 60);
        expect(t.gl.calls).toHaveLength(1);
        expect(t.state.clock.delta).toBeCloseTo(1 / 60);
        t.state.advance(1 / 60);
        expect(t.state.clock.frame).toBe(2);
        expect(t.state.clock.elapsed).toBeCloseTo(2 / 60);
        expect(t.scheduler.pending).toBe(0);
        t.unmount();
    });

    it('runs subscribers in priority order with the delta, and priority > 0 takes over rendering', () => {
        const t = createTestRoot();
        const log: string[] = [];
        const offA = t.state.subscribe(() => log.push('a'), 0);
        t.state.subscribe(() => log.push('early'), -10);
        t.state.subscribe(() => log.push('b'), 0);
        t.state.advance(0.5);
        expect(log).toEqual(['early', 'a', 'b']);
        expect(t.gl.calls).toHaveLength(1);
        const offRender = t.state.subscribe((s) => { log.push('render'); s.gl!.render(s.scene, s.camera); }, 1);
        t.state.advance(0.5);
        expect(log.slice(3)).toEqual(['early', 'a', 'b', 'render']);
        expect(t.gl.calls).toHaveLength(2); // the subscriber rendered, the loop did not
        offRender();
        offA();
        offA();
        t.state.advance(0.5);
        expect(log.slice(7)).toEqual(['early', 'b']);
        expect(t.gl.calls).toHaveLength(3);
        t.unmount();
    });

    it('clamps the delta', () => {
        const t = createTestRoot({ maxDelta: 0.1 });
        t.state.advance(5);
        expect(t.state.clock.delta).toBe(0.1);
        t.state.advance(0.02);
        expect(t.state.clock.delta).toBeCloseTo(0.02);
        t.unmount();
    });

    it('fixed updates accumulate and cap sub-steps; alpha reports the remainder', () => {
        const t = createTestRoot();
        const steps: number[] = [];
        const handle = t.state.subscribeFixed((step) => steps.push(step), { step: 0.1, maxSubSteps: 3 });
        t.state.advance(0.05);
        expect(steps).toHaveLength(0);
        expect(handle.alpha()).toBeCloseTo(0.5);
        t.state.advance(0.05);
        expect(steps).toHaveLength(1);
        expect(handle.alpha()).toBeCloseTo(0);
        t.state.advance(0.1);   // clamped to maxDelta 0.1 → 1 step
        t.state.advance(0.1);
        expect(steps).toHaveLength(3);
        handle.stop();
        t.state.advance(0.1);
        expect(steps).toHaveLength(3);
        t.unmount();
    });

    it('a throwing subscriber is reported and the loop survives', () => {
        const t = createTestRoot({ frameloop: 'always' });
        vi.useFakeTimers();
        const log: string[] = [];
        t.state.subscribe(() => { throw new Error('boom'); });
        t.state.subscribe(() => log.push('after'));
        t.scheduler.flush();
        expect(log).toEqual(['after']);
        expect(t.scheduler.pending).toBe(1);
        expect(() => vi.runAllTimers()).toThrow(/boom/);
        vi.useRealTimers();
        t.unmount();
    });

    it('unsubscribing during a tick is safe', () => {
        const t = createTestRoot();
        const log: string[] = [];
        let offB: () => void = () => {};
        t.state.subscribe(() => { log.push('a'); offB(); });
        offB = t.state.subscribe(() => log.push('b'));
        t.state.subscribe(() => log.push('c'));
        t.state.advance(0.01);
        expect(log).toEqual(['a', 'b', 'c']);
        t.state.advance(0.01);
        expect(log).toEqual(['a', 'b', 'c', 'a', 'c']);
        t.unmount();
    });

    it('useFrame / useFixedUpdate unsubscribe on component unmount', () => {
        const t = createTestRoot();
        let frames = 0;
        let fixed = 0;
        const Spinner = component(() => {
            useFrame(() => { frames++; });
            useFixedUpdate(() => { fixed++; }, { step: 0.01 });
            const state = useThree();
            expect(state.scene).toBe(t.scene);
            return () => jsx('mesh', {});
        });
        t.render(jsx(Spinner, {}));
        t.state.advance(0.02);
        expect(frames).toBe(1);
        expect(fixed).toBe(2);
        t.render(null);
        t.state.advance(0.02);
        expect(frames).toBe(1);
        expect(fixed).toBe(2);
        t.unmount();
    });
});
