/**
 * Both renderers' global `JSX.IntrinsicElements` declarations merge in one
 * program: a `<Canvas>` app has HTML and three elements in the same file.
 */
import '@sigx/runtime-dom';
import '@sigx/runtime-three';
import { expectTypeOf, test } from 'vitest';
import type * as THREE from 'three';
import { objectRef, type ThreeEvent } from '@sigx/runtime-three';
import { signal } from '@sigx/reactivity';

test('DOM and three intrinsics coexist', () => {
    const x = signal(1);
    const mesh = objectRef<THREE.Mesh>();
    const tree = (
        <div class="hud">
            <mesh ref={mesh} position={[0, 1, 0]} position-x={x} scale={2} onClick={(e: ThreeEvent) => e.stopPropagation()}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="hotpink" roughness={0.5} />
            </mesh>
            <threeLine />
            <lineSegments />
            <threeAudio args={[new (class {} as any)()]} />
            <line x1={0} />
            <audio src="a.mp3" />
            <primitive object={{}} />
        </div>
    );
    // (`JSX.Element` itself is not asserted: the published @sigx/runtime-core
    // 0.15.6 types are missing jsx-types.d.ts — fixed on core main.)
    void tree;
    expectTypeOf(mesh.current).toEqualTypeOf<THREE.Mesh | null>();

    // three's Line is `threeLine`; `line` is the SVG element
    // @ts-expect-error
    const bad = <line args={[]} />;
    // args are typed from the constructor
    // @ts-expect-error
    const badArgs = <boxGeometry args={['wide']} />;
    // a color rejects a boolean
    // @ts-expect-error
    const badColor = <meshBasicMaterial color={true} />;
    void bad;
    void badArgs;
    void badColor;
});
