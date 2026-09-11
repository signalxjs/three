import { component, defineApp, signal } from 'sigx';
import { Canvas, useFrame, useThree, objectRef } from '@sigx/three';
import type { Mesh } from 'three';

// Shared between the HUD (HTML) and the scene (three): ordinary signals.
const wire = signal(false);
const speed = signal(1);
const fps = signal(0);

const Cube = component(() => {
    const mesh = objectRef<Mesh>();
    // Per-frame work: mutate the real three object. Zero framework cost.
    useFrame((_, dt) => {
        const m = mesh.current;
        if (!m) return;
        m.rotation.x += dt * 0.5 * speed.value;
        m.rotation.y += dt * speed.value;
    });
    return () => (
        <mesh ref={mesh}>
            <boxGeometry args={[1.4, 1.4, 1.4]} />
            {/* A signal bound to a prop: the material updates, nothing re-renders. */}
            <meshStandardMaterial color="hotpink" wireframe={wire} />
        </mesh>
    );
});

const FpsMeter = component(() => {
    const state = useThree();
    let acc = 0;
    let frames = 0;
    useFrame((_, dt) => {
        acc += dt;
        frames++;
        if (acc >= 0.5) {
            fps.value = Math.round(frames / acc);
            acc = 0;
            frames = 0;
        }
        void state;
    });
    return () => null;
});

const App = component(() => () => (
    <>
        <header>
            <h1>@sigx/three · spinning cube</h1>
            <button onClick={() => { wire.value = !wire.value; }}>{wire.value ? 'Solid' : 'Wireframe'}</button>
            <button onClick={() => { speed.value = speed.value === 1 ? 4 : 1; }}>Speed ×{speed.value}</button>
            <span class="fps">{fps.value} fps</span>
        </header>
        <Canvas camera={{ position: [0, 0, 4] }} shadows>
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 3, 3]} intensity={2} />
            <Cube />
            <FpsMeter />
        </Canvas>
    </>
));

defineApp(<App />).mount('#app');
