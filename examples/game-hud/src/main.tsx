import { component, defineApp, signal } from 'sigx';
import { Canvas, useFrame, useThree, useActionMap, useInstances, usePointerLock, objectRef, GamepadAxis } from '@sigx/three';
import * as THREE from 'three';

// ---- game state: ordinary signals shared by the HUD (HTML) and the scene ----
const score = signal(0);
const hull = signal(100);
const dead = signal(false);
const paused = signal(false);
const hitFlash = signal(false);

const ASTEROIDS = 500;
const FIELD = 60;
const SHIP_SPEED = 14;
const TURN_SPEED = 2.6;

const asteroidGeometry = new THREE.IcosahedronGeometry(1, 0);
const asteroidMaterial = new THREE.MeshStandardMaterial({ color: '#8a8f9a', flatShading: true, roughness: 0.9 });
const bulletGeometry = new THREE.SphereGeometry(0.15, 6, 6);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: '#7dd3fc' });

function wrap(v: number): number {
    const half = FIELD / 2;
    if (v > half) return v - FIELD;
    if (v < -half) return v + FIELD;
    return v;
}

/** 500 asteroids in one draw call, driven from typed arrays. */
const Asteroids = component(() => {
    const rocks = useInstances(ASTEROIDS);
    const velocity = new Float32Array(ASTEROIDS * 3);
    const spin = new Float32Array(ASTEROIDS);
    const radius = new Float32Array(ASTEROIDS);
    for (let i = 0; i < ASTEROIDS; i++) {
        rocks.setPosition(i, (Math.random() - 0.5) * FIELD, 0, (Math.random() - 0.5) * FIELD);
        const s = 0.5 + Math.random() * 1.5;
        radius[i] = s;
        rocks.setScale(i, s, s, s);
        velocity[i * 3] = (Math.random() - 0.5) * 3;
        velocity[i * 3 + 2] = (Math.random() - 0.5) * 3;
        spin[i] = (Math.random() - 0.5) * 2;
    }
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);

    useFrame((_, dt) => {
        if (paused.value || dead.value) return;
        const pos = rocks.position;
        const quat = rocks.quaternion;
        for (let i = 0; i < ASTEROIDS; i++) {
            const o = i * 3;
            pos[o] = wrap(pos[o] + velocity[o] * dt);
            pos[o + 2] = wrap(pos[o + 2] + velocity[o + 2] * dt);
            q.setFromAxisAngle(axis, spin[i] * dt);
            const qo = i * 4;
            const x = quat[qo], y = quat[qo + 1], z = quat[qo + 2], w = quat[qo + 3];
            // quat = q * quat (in place, no allocation)
            quat[qo] = q.w * x + q.x * w + q.y * z - q.z * y;
            quat[qo + 1] = q.w * y - q.x * z + q.y * w + q.z * x;
            quat[qo + 2] = q.w * z + q.x * y - q.y * x + q.z * w;
            quat[qo + 3] = q.w * w - q.x * x - q.y * y - q.z * z;
        }
        rocks.commit();
    });

    // Expose the collision surface to the ship through module state.
    world.rockPosition = rocks.position;
    world.rockRadius = radius;
    world.destroyRock = (i: number) => {
        rocks.setPosition(i, (Math.random() - 0.5) * FIELD, 0, (Math.random() - 0.5) * FIELD);
        velocity[i * 3] = (Math.random() - 0.5) * 4;
        velocity[i * 3 + 2] = (Math.random() - 0.5) * 4;
    };

    return () => <instancedMesh ref={rocks.ref} args={[asteroidGeometry, asteroidMaterial, ASTEROIDS]} frustumCulled={false} castShadow receiveShadow />;
});

const world = {
    rockPosition: null as Float32Array | null,
    rockRadius: null as Float32Array | null,
    destroyRock: (_i: number) => {},
    lock: null as ReturnType<typeof usePointerLock> | null
};

const MAX_BULLETS = 32;

const Ship = component(() => {
    const ship = objectRef<THREE.Group>();
    const input = useActionMap(
        { thrust: ['KeyW', 'ArrowUp', 'GamepadA'], fire: ['Space', 'GamepadRT'], pause: ['KeyP', 'GamepadStart'] },
        { axes: { turn: { neg: ['KeyA', 'ArrowLeft'], pos: ['KeyD', 'ArrowRight'], stick: GamepadAxis.LeftX } }, preventDefault: (code) => code === 'Space' || code.startsWith('Arrow') }
    );
    const state = useThree();
    const bullets = useInstances(MAX_BULLETS);
    const bulletVel = new Float32Array(MAX_BULLETS * 3);
    const bulletLife = new Float32Array(MAX_BULLETS);
    let nextBullet = 0;
    let cooldown = 0;
    let vx = 0;
    let vz = 0;
    let invulnerable = 0;
    const forward = new THREE.Vector3();

    useFrame((_, dt) => {
        if (input.justPressed('pause')) paused.value = !paused.value;
        const s = ship.current;
        if (!s || paused.value || dead.value) return;

        // steer
        s.rotation.y -= input.axis('turn') * TURN_SPEED * dt;
        forward.set(0, 0, -1).applyQuaternion(s.quaternion);
        if (input.isDown('thrust')) {
            vx += forward.x * SHIP_SPEED * dt * 2;
            vz += forward.z * SHIP_SPEED * dt * 2;
        }
        vx *= 1 - Math.min(1, dt * 0.8);
        vz *= 1 - Math.min(1, dt * 0.8);
        s.position.x = wrap(s.position.x + vx * dt);
        s.position.z = wrap(s.position.z + vz * dt);

        // camera follows
        state.camera.position.set(s.position.x, 26, s.position.z + 14);
        state.camera.lookAt(s.position.x, 0, s.position.z);

        // fire
        cooldown -= dt;
        if (input.isDown('fire') && cooldown <= 0) {
            cooldown = 0.18;
            const i = nextBullet++ % MAX_BULLETS;
            bullets.setPosition(i, s.position.x + forward.x, 0, s.position.z + forward.z);
            bulletVel[i * 3] = forward.x * 40 + vx;
            bulletVel[i * 3 + 2] = forward.z * 40 + vz;
            bulletLife[i] = 1.2;
        }

        // bullets + collisions
        const rocks = world.rockPosition;
        const radius = world.rockRadius;
        const bp = bullets.position;
        for (let i = 0; i < MAX_BULLETS; i++) {
            if (bulletLife[i] <= 0) {
                bp[i * 3 + 1] = -100;
                continue;
            }
            bulletLife[i] -= dt;
            bp[i * 3] = wrap(bp[i * 3] + bulletVel[i * 3] * dt);
            bp[i * 3 + 2] = wrap(bp[i * 3 + 2] + bulletVel[i * 3 + 2] * dt);
            if (rocks && radius) {
                for (let r = 0; r < ASTEROIDS; r++) {
                    const dx = rocks[r * 3] - bp[i * 3];
                    const dz = rocks[r * 3 + 2] - bp[i * 3 + 2];
                    if (dx * dx + dz * dz < radius[r] * radius[r]) {
                        world.destroyRock(r);
                        bulletLife[i] = 0;
                        score.value += 10;
                        break;
                    }
                }
            }
        }
        bullets.commit();

        // ship vs rocks
        invulnerable -= dt;
        if (rocks && radius && invulnerable <= 0) {
            for (let r = 0; r < ASTEROIDS; r++) {
                const dx = rocks[r * 3] - s.position.x;
                const dz = rocks[r * 3 + 2] - s.position.z;
                const hit = radius[r] + 0.8;
                if (dx * dx + dz * dz < hit * hit) {
                    hull.value = Math.max(0, hull.value - 20);
                    invulnerable = 1.5;
                    hitFlash.value = true;
                    setTimeout(() => { hitFlash.value = false; }, 60);
                    if (hull.value === 0) dead.value = true;
                    break;
                }
            }
        }
    });

    return () => (
        <>
            <group ref={ship}>
                <mesh rotation-x={Math.PI / 2} castShadow>
                    <coneGeometry args={[0.6, 1.8, 3]} />
                    <meshStandardMaterial color="#f97316" flatShading />
                </mesh>
                <pointLight color="#7dd3fc" intensity={8} distance={8} position-y={1} />
            </group>
            <instancedMesh ref={bullets.ref} args={[bulletGeometry, bulletMaterial, MAX_BULLETS]} frustumCulled={false} />
        </>
    );
});

const Scene = component(() => {
    const lock = usePointerLock();
    world.lock = lock;
    return () => (
        <>
            <color attach="background" args={['#05070c']} />
            <fog attach="fog" args={['#05070c', 30, 70]} />
            <ambientLight intensity={0.35} />
            <directionalLight position={[20, 30, 10]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <gridHelper args={[FIELD, 30, '#1c2230', '#131722']} position-y={-1} />
            <Asteroids />
            <Ship />
        </>
    );
});

const Hud = component(() => () => (
    <>
        <div class="hud">
            <span>Score <strong>{score.value}</strong></span>
            <span>Hull <strong>{hull.value}%</strong></span>
            <span class="right">{paused.value ? 'PAUSED' : ''}</span>
            <button onClick={() => { paused.value = !paused.value; }}>{paused.value ? 'Resume' : 'Pause'}</button>
        </div>
        <div class={hitFlash.value ? 'flash hit' : 'flash'} />
        <div class="help">W / ↑ thrust · A D / ← → turn · Space fire · P pause · gamepad works too</div>
        {dead.value ? (
            <div class="dead">
                <div>
                    Hull breached — {score.value} points
                    <br />
                    <button onClick={restart}>Play again</button>
                </div>
            </div>
        ) : null}
    </>
));

function restart(): void {
    score.value = 0;
    hull.value = 100;
    dead.value = false;
    paused.value = false;
}

const App = component(() => () => (
    <>
        <Canvas camera={{ position: [0, 26, 14], fov: 50 }} shadows>
            <Scene />
        </Canvas>
        <Hud />
    </>
));

defineApp(<App />).mount('#app');
