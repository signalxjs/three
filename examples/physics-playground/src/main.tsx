import { component, defineApp, signal } from 'sigx';
import { Canvas, type ThreeEvent } from '@sigx/three';
import { Physics, RigidBody, Collider, type RigidBodyApi, type CollisionPayload } from '@sigx/three-rapier';

// Shared between the HUD and the scene.
const debug = signal(false);
const paused = signal(false);
const inZone = signal(0);
const entered = signal(0);
const balls = signal({ list: [] as Array<{ id: number; x: number; z: number }> });
let nextBall = 0;

const Ground = component(() => () => (
    <RigidBody type="fixed" colliders="cuboid" friction={0.8}>
        <mesh position={[0, -0.5, 0]} receiveShadow>
            <boxGeometry args={[30, 1, 30]} />
            <meshStandardMaterial color="#1c2230" />
        </mesh>
    </RigidBody>
));

/** A cube you can shove: click applies an impulse along the hit normal. */
const Crate = component<{ position: [number, number, number]; color?: string }>((ctx) => {
    let api: RigidBodyApi | null = null;
    const shove = (e: ThreeEvent): void => {
        e.stopPropagation();
        const n = e.face?.normal;
        api?.applyImpulse({ x: (n?.x ?? 0) * -6, y: 4, z: (n?.z ?? 0) * -6 });
    };
    return () => (
        <RigidBody ref={(a: RigidBodyApi | null) => { api = a; }} position={ctx.props.position} colliders="cuboid" restitution={0.1}>
            <mesh castShadow receiveShadow onClick={shove}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={ctx.props.color ?? '#f97316'} />
            </mesh>
        </RigidBody>
    );
});

/** A convex-hull collider generated from an icosahedron mesh. */
const Rock = component<{ position: [number, number, number] }>((ctx) => () => (
    <RigidBody position={ctx.props.position} colliders="hull" restitution={0.3} angularDamping={0.5}>
        <mesh castShadow receiveShadow>
            <icosahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial color="#8a8f9a" flatShading />
        </mesh>
    </RigidBody>
));

const Ball = component<{ x: number; z: number }>((ctx) => () => (
    <RigidBody position={[ctx.props.x, 8, ctx.props.z]} colliders="ball" restitution={0.7} ccd>
        <mesh castShadow>
            <sphereGeometry args={[0.4, 16, 16]} />
            <meshStandardMaterial color="#7dd3fc" />
        </mesh>
    </RigidBody>
));

/** A sensor: counts bodies inside without pushing them. */
const Zone = component(() => () => (
    <>
        <Collider
            shape="cuboid"
            args={[2.5, 1.5, 2.5]}
            position={[-6, 1.5, 0]}
            sensor
            onIntersectionEnter={(_: CollisionPayload) => { inZone.value++; entered.value++; }}
            onIntersectionExit={() => { inZone.value--; }}
        />
        <mesh position={[-6, 1.5, 0]}>
            <boxGeometry args={[5, 3, 5]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.12} depthWrite={false} />
        </mesh>
    </>
));

const Scene = component(() => () => (
    <>
        <color attach="background" args={['#0b0e14']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 8]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <Physics gravity={[0, -9.81, 0]} paused={paused.value} debug={debug.value}>
            <Ground />
            <Zone />
            {[0, 1, 2, 3, 4].map((i) => <Crate key={`c${i}`} position={[0, 0.5 + i * 1.02, 0]} />)}
            {[0, 1, 2].map((i) => <Crate key={`d${i}`} position={[3, 0.5 + i * 1.02, -2]} color="#a3e635" />)}
            <Rock position={[-2, 4, 3]} />
            <Rock position={[5, 6, 4]} />
            {balls.list.map((b) => <Ball key={b.id} x={b.x} z={b.z} />)}
        </Physics>
    </>
));

function spawnBall(): void {
    balls.list = [...balls.list, { id: nextBall++, x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }].slice(-40);
}

const Hud = component(() => () => (
    <>
        <div class="hud">
            <button onClick={spawnBall}>Drop a ball</button>
            <button onClick={() => { debug.value = !debug.value; }}>{debug.value ? 'Hide' : 'Show'} colliders</button>
            <button onClick={() => { paused.value = !paused.value; }}>{paused.value ? 'Resume' : 'Pause'}</button>
            <span>In zone <strong>{inZone.value}</strong> · entered <strong>{entered.value}</strong> · balls <strong>{balls.list.length}</strong></span>
            <span class="right">@sigx/three-rapier</span>
        </div>
        <div class="help">Click a crate to shove it · the blue box is a sensor</div>
    </>
));

const App = component(() => () => (
    <>
        <Canvas camera={{ position: [10, 10, 14], fov: 45 }} shadows>
            <Scene />
        </Canvas>
        <Hud />
    </>
));

defineApp(<App />).mount('#app');
