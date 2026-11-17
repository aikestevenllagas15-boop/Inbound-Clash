import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARENA_HALF_X, ARENA_HALF_Z, FLOOR_Y } from './fighters';
import type { FighterRuntime, GraphicsSettings, MatchState, ParticleDensity, StageSpec } from './types';

const _vec3 = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

interface StickmanRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group; // waist / lower spine
  chest: THREE.Group; // upper ribcage / shoulders
  neck: THREE.Group;
  headGroup: THREE.Group;
  lShoulder: THREE.Group;
  lElbow: THREE.Group;
  lWrist: THREE.Group;
  rShoulder: THREE.Group;
  rElbow: THREE.Group;
  rWrist: THREE.Group;
  lHip: THREE.Group;
  lKnee: THREE.Group;
  lAnkle: THREE.Group;
  rHip: THREE.Group;
  rKnee: THREE.Group;
  rAnkle: THREE.Group;
  scarfA?: THREE.Mesh;
  scarfB?: THREE.Mesh;
  cryoHalo?: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  shieldDome: THREE.Mesh;
  counterRing: THREE.Mesh;
  iceCage: THREE.Mesh;
  ultRing: THREE.Mesh;
  playerRing: THREE.Mesh;
  shadowDisc: THREE.Mesh;
  poseInitialized: boolean;
}

function createFloorTexture(stage: StageSpec, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = stage.floorColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle tactile stone / tatami tile lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Subtle surface grain
  for (let i = 0; i < 650; i++) {
    const gx = Math.random() * 512;
    const gy = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(gx, gy, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 5);
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function buildStickmanRig(
  f: FighterRuntime,
  shadowTex: THREE.CanvasTexture,
  castShadows: boolean,
): StickmanRig {
  const isHeavy = f.spec.id === 'bram';
  const limbRadius = isHeavy ? 0.24 : 0.19;
  const torsoRadius = isHeavy ? 0.34 : 0.26;
  const headRadius = isHeavy ? 0.56 : 0.50;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: f.spec.color,
    roughness: 0.42,
    metalness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: f.spec.accentColor,
    roughness: 0.24,
    metalness: 0.65,
    emissive: f.spec.accentColor,
    emissiveIntensity: 0.18,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#191716',
    roughness: 0.65,
    metalness: 0.1,
  });

  const root = new THREE.Group();

  // Ground contact shadow + P1/P2 indicator ring (positioned separately in world at y=0.02)
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), shadowMat);
  shadowDisc.rotation.x = -Math.PI * 0.5;
  shadowDisc.position.y = 0.02;

  const playerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.15, 32),
    new THREE.MeshBasicMaterial({
      color: f.slot === 1 ? '#f7f3eb' : '#d65b45',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  playerRing.rotation.x = -Math.PI * 0.5;
  playerRing.position.y = 0.03;

  const ultRing = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.48, 32),
    new THREE.MeshBasicMaterial({
      color: '#ffca57',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  ultRing.rotation.x = -Math.PI * 0.5;
  ultRing.position.y = 0.035;
  ultRing.visible = false;

  // Pelvis / Hips pivot at ~1.65 units up (total height ~3.8 units)
  const hips = new THREE.Group();
  hips.position.y = 1.65;
  root.add(hips);

  const pelvisMesh = new THREE.Mesh(
    new THREE.SphereGeometry(torsoRadius * 0.92, 14, 12),
    darkMat,
  );
  pelvisMesh.scale.set(1.12, 0.85, 0.92);
  hips.add(pelvisMesh);

  // Flexible Waist / Lower Abdomen
  const torso = new THREE.Group();
  torso.position.y = 0.08;
  hips.add(torso);

  const waistMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(torsoRadius * 0.84, 0.36, 5, 12),
    bodyMat,
  );
  waistMesh.position.y = 0.28;
  waistMesh.castShadow = castShadows;
  torso.add(waistMesh);

  // Sash / martial belt around waist
  const sashMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoRadius * 0.98, torsoRadius * 0.94, 0.22, 14),
    accentMat,
  );
  sashMesh.position.y = 0.14;
  torso.add(sashMesh);

  // Flexible Upper Ribcage / Chest
  const chest = new THREE.Group();
  chest.position.y = 0.54;
  torso.add(chest);

  const chestMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(torsoRadius * 1.06, 0.44, 6, 12),
    bodyMat,
  );
  chestMesh.scale.set(1.16, 1.0, 0.92);
  chestMesh.position.y = 0.34;
  chestMesh.castShadow = castShadows;
  chest.add(chestMesh);

  // Neck + Head Group
  const neck = new THREE.Group();
  neck.position.y = 0.74;
  chest.add(neck);

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(limbRadius * 0.65, limbRadius * 0.78, 0.22, 10),
    bodyMat,
  );
  neckMesh.position.y = 0.1;
  neck.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.28;
  neck.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 20, 16), bodyMat);
  headMesh.castShadow = castShadows;
  headGroup.add(headMesh);

  // Expressive glowing visor facing +Z
  const visorMat = new THREE.MeshStandardMaterial({
    color: f.spec.id === 'lyra' ? '#0e2838' : f.spec.id === 'hecker' ? '#082413' : '#fff8eb',
    emissive: f.spec.id === 'lyra' ? '#8de7ff' : f.spec.id === 'hecker' ? '#7dffb3' : '#fff4d9',
    emissiveIntensity: f.spec.id === 'hecker' ? 0.95 : 0.75,
    roughness: 0.2,
  });
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.16), visorMat);
  visorMesh.position.set(0, 0.04, headRadius * 0.86);
  headGroup.add(visorMesh);

  // Articulated Arms helper (shoulder -> upper arm -> elbow joint -> forearm -> wrist -> fist)
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (torsoRadius + 0.24), 0.56, 0);
    chest.add(shoulder);

    const shoulderJoint = new THREE.Mesh(
      new THREE.SphereGeometry(limbRadius * 1.08, 10, 10),
      bodyMat,
    );
    shoulder.add(shoulderJoint);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(limbRadius, 0.48, 4, 10), bodyMat);
    upper.position.y = -0.32;
    upper.castShadow = castShadows;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.64;
    shoulder.add(elbow);

    const elbowJoint = new THREE.Mesh(
      new THREE.SphereGeometry(limbRadius * 0.98, 10, 10),
      bodyMat,
    );
    elbow.add(elbowJoint);

    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(limbRadius * 0.86, 0.48, 4, 10),
      bodyMat,
    );
    lower.position.y = -0.30;
    lower.castShadow = castShadows;
    elbow.add(lower);

    const wrist = new THREE.Group();
    wrist.position.y = -0.60;
    elbow.add(wrist);

    const fist = new THREE.Mesh(
      new THREE.SphereGeometry(isHeavy ? 0.33 : 0.22, 12, 10),
      isHeavy ? accentMat : darkMat,
    );
    fist.position.y = -0.08;
    fist.castShadow = castShadows;
    wrist.add(fist);

    return { shoulder, elbow, wrist, fist };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Articulated Legs helper (hip -> thigh -> knee joint -> shin -> ankle -> foot)
  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.25, -0.04, 0);
    hips.add(hip);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(limbRadius * 1.05, 0.56, 4, 10),
      bodyMat,
    );
    thigh.position.y = -0.38;
    thigh.castShadow = castShadows;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.74;
    hip.add(knee);

    const kneeJoint = new THREE.Mesh(
      new THREE.SphereGeometry(limbRadius * 1.0, 10, 10),
      bodyMat,
    );
    knee.add(kneeJoint);

    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(limbRadius * 0.88, 0.56, 4, 10),
      bodyMat,
    );
    shin.position.y = -0.36;
    shin.castShadow = castShadows;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -0.72;
    knee.add(ankle);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.56), darkMat);
    foot.position.set(0, -0.07, 0.12);
    foot.castShadow = castShadows;
    ankle.add(foot);

    return { hip, knee, ankle };
  };

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Character-specific 3D silhouette accessories
  let scarfA: THREE.Mesh | undefined;
  let scarfB: THREE.Mesh | undefined;
  let cryoHalo: THREE.Mesh | undefined;

  if (f.spec.id === 'kael') {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(headRadius * 1.05, headRadius * 1.05, 0.18, 18),
      accentMat,
    );
    band.position.y = 0.2;
    headGroup.add(band);

    scarfA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.95), bodyMat);
    scarfA.position.set(0, 0.18, -headRadius - 0.35);
    headGroup.add(scarfA);

    scarfB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.75), accentMat);
    scarfB.position.set(0, 0.1, -headRadius - 0.85);
    headGroup.add(scarfB);
  } else if (f.spec.id === 'veyra') {
    // Dual wind tonfa blades on forearms
    [leftArm.elbow, rightArm.elbow].forEach((elbow) => {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.95, 6), accentMat);
      blade.rotation.x = Math.PI * 0.5;
      blade.position.set(0, -0.52, 0.36);
      elbow.add(blade);
    });
    scarfA = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 1.05), accentMat);
    scarfA.position.set(0, 0.5, -0.65);
    chest.add(scarfA);
  } else if (f.spec.id === 'bram') {
    // Heavy shoulder pauldrons
    [leftArm.shoulder, rightArm.shoulder].forEach((sh) => {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), accentMat);
      pauldron.scale.set(1.15, 0.75, 1.1);
      sh.add(pauldron);
    });
  } else if (f.spec.id === 'sora') {
    // Ronin bamboo kasa hat
    const hatMat = new THREE.MeshStandardMaterial({
      color: '#d4b87e',
      roughness: 0.72,
      metalness: 0.08,
    });
    const kasa = new THREE.Mesh(new THREE.ConeGeometry(1.08, 0.52, 20), hatMat);
    kasa.position.y = 0.42;
    kasa.castShadow = castShadows;
    headGroup.add(kasa);

    // Glowing Katana in right wrist
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.48, 8), darkMat);
    hilt.rotation.x = Math.PI * 0.5;
    hilt.position.set(0, -0.06, 0.22);
    rightArm.wrist.add(hilt);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 1.75), accentMat);
    blade.position.set(0, -0.04, 1.22);
    blade.castShadow = castShadows;
    rightArm.wrist.add(blade);
  } else if (f.spec.id === 'lyra') {
    // Floating cryo halo behind head
    cryoHalo = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.06, 8, 24), accentMat);
    cryoHalo.position.set(0, 0.24, -0.35);
    headGroup.add(cryoHalo);

    // Cryo staff in right wrist
    const staffMat = new THREE.MeshStandardMaterial({
      color: '#b9e8f7',
      roughness: 0.25,
      metalness: 0.75,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), staffMat);
    shaft.rotation.x = Math.PI * 0.32;
    shaft.position.set(0, 0.1, 0.38);
    rightArm.wrist.add(shaft);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), accentMat);
    gem.position.set(0, 0.82, 1.48);
    rightArm.wrist.add(gem);
  } else if (f.spec.id === 'hecker') {
    // Sleek cyber headset band & earcups
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(headRadius * 1.04, 0.065, 8, 20, Math.PI),
      darkMat,
    );
    band.position.y = 0.06;
    headGroup.add(band);

    [-1, 1].forEach((side) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), accentMat);
      cup.rotation.z = Math.PI * 0.5;
      cup.position.set(side * (headRadius + 0.02), 0.04, 0);
      headGroup.add(cup);
    });

    // Hacking Laptop Weapon mounted in right wrist
    const laptopGroup = new THREE.Group();
    laptopGroup.position.set(0, -0.08, 0.34);
    rightArm.wrist.add(laptopGroup);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: '#1b2229',
      roughness: 0.32,
      metalness: 0.78,
    });
    const screenMat = new THREE.MeshStandardMaterial({
      color: '#0e331f',
      emissive: '#38f28d',
      emissiveIntensity: 0.95,
      roughness: 0.15,
    });

    // Base + glowing keyboard
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.5), chassisMat);
    base.castShadow = castShadows;
    laptopGroup.add(base);

    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.02, 0.34), screenMat);
    keys.position.set(0, 0.035, 0.02);
    laptopGroup.add(keys);

    // Hinged open display lid tilted toward fighter
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.02, -0.24);
    lidPivot.rotation.x = -0.32;
    laptopGroup.add(lidPivot);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.04), chassisMat);
    lid.position.set(0, 0.24, 0);
    lid.castShadow = castShadows;
    lidPivot.add(lid);

    const display = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.02), screenMat);
    display.position.set(0, 0.24, 0.02);
    lidPivot.add(display);

    // Back-lid glowing hacker emblem bar
    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.02), accentMat);
    emblem.position.set(0, 0.25, -0.025);
    lidPivot.add(emblem);
  }

  // Active status meshes (shield dome, counter ring, ice cage)
  const shieldDome = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 20, 16),
    new THREE.MeshStandardMaterial({
      color: '#f5d27a',
      emissive: '#d99a38',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
      depthWrite: false,
    }),
  );
  shieldDome.position.y = 1.8;
  shieldDome.visible = false;
  root.add(shieldDome);

  const counterRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.08, 10, 28),
    new THREE.MeshBasicMaterial({ color: '#8ad8ff' }),
  );
  counterRing.rotation.x = Math.PI * 0.5;
  counterRing.position.y = 1.75;
  counterRing.visible = false;
  root.add(counterRing);

  const iceCage = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.85, 0),
    new THREE.MeshStandardMaterial({
      color: '#9ce8ff',
      emissive: '#5ec4e6',
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.2,
      depthWrite: false,
    }),
  );
  iceCage.scale.set(0.85, 1.35, 0.85);
  iceCage.position.y = 1.8;
  iceCage.visible = false;
  root.add(iceCage);

  return {
    root,
    hips,
    torso,
    chest,
    neck,
    headGroup,
    lShoulder: leftArm.shoulder,
    lElbow: leftArm.elbow,
    lWrist: leftArm.wrist,
    rShoulder: rightArm.shoulder,
    rElbow: rightArm.elbow,
    rWrist: rightArm.wrist,
    lHip: leftLeg.hip,
    lKnee: leftLeg.knee,
    lAnkle: leftLeg.ankle,
    rHip: rightLeg.hip,
    rKnee: rightLeg.knee,
    rAnkle: rightLeg.ankle,
    scarfA,
    scarfB,
    cryoHalo,
    bodyMat,
    accentMat,
    shieldDome,
    counterRing,
    iceCage,
    ultRing,
    playerRing,
    shadowDisc,
    poseInitialized: false,
  };
}

function dampRot(
  obj: THREE.Object3D,
  rx: number,
  ry: number,
  rz: number,
  lambda: number,
  dt: number,
  snap: boolean,
): void {
  if (snap) {
    obj.rotation.set(rx, ry, rz);
  } else {
    obj.rotation.x = THREE.MathUtils.damp(obj.rotation.x, rx, lambda, dt);
    obj.rotation.y = THREE.MathUtils.damp(obj.rotation.y, ry, lambda, dt);
    obj.rotation.z = THREE.MathUtils.damp(obj.rotation.z, rz, lambda, dt);
  }
}

function animateStickmanRig(rig: StickmanRig, f: FighterRuntime, dt: number): void {
  rig.root.position.set(f.x, f.y, f.z);

  // World-grounded shadow & foot rings
  rig.shadowDisc.position.set(f.x, 0.02, f.z);
  const shadowScale = Math.max(0.45, 1 - f.y * 0.08);
  rig.shadowDisc.scale.setScalar(shadowScale);
  rig.playerRing.position.set(f.x, 0.03, f.z);
  rig.ultRing.position.set(f.x, 0.035, f.z);
  rig.ultRing.visible = f.energy >= 100 && f.action !== 'ko';
  if (rig.ultRing.visible) {
    const pulse = 1 + Math.sin(f.animTime * 7) * 0.08;
    rig.ultRing.scale.setScalar(pulse);
  }

  // Hit flash
  if (f.hitFlashTimer > 0) {
    rig.bodyMat.emissive.set('#ffffff');
    rig.bodyMat.emissiveIntensity = 0.85;
  } else {
    rig.bodyMat.emissive.set('#000000');
    rig.bodyMat.emissiveIntensity = 0;
  }

  // Status effects
  rig.shieldDome.visible = f.shieldTimer > 0;
  rig.counterRing.visible = f.counterArmed;
  if (f.counterArmed) {
    rig.counterRing.rotation.z = f.animTime * 6;
  }
  rig.iceCage.visible = f.frozenTimer > 0;

  const t = f.animTime;
  const p =
    f.actionDuration > 0 ? 1 - Math.max(0, f.actionTimer) / f.actionDuration : 0;
  const safeDt = Math.min(0.05, Math.max(0.001, dt));
  const snap = !rig.poseInitialized;
  rig.poseInitialized = true;

  // Target pose accumulators for human articulated joints
  let rootRx = 0;
  let rootRy = f.facingAngle;
  let rootRz = 0;
  let hipsY = 1.65;
  let hipsRx = 0;
  let hipsRy = 0;
  let hipsRz = 0;

  let waistRx = 0;
  let waistRy = 0;
  let waistRz = 0;
  let chestRx = 0;
  let chestRy = 0;
  let chestRz = 0;
  let neckRx = 0;
  let neckRy = 0;
  let neckRz = 0;
  let headRx = 0;
  let headRy = 0;
  let headRz = 0;

  let lShX = -0.3;
  let lShY = 0;
  let lShZ = 0.22;
  let lElX = -0.5;
  let lWrX = 0;
  let lWrZ = 0;

  let rShX = -0.3;
  let rShY = 0;
  let rShZ = -0.22;
  let rElX = -0.5;
  let rWrX = 0;
  let rWrZ = 0;

  let lHipX = 0;
  let lHipY = 0;
  let lHipZ = 0.06;
  let lKneeX = 0.1;
  let lAnkX = 0;

  let rHipX = 0;
  let rHipY = 0;
  let rHipZ = -0.06;
  let rKneeX = 0.1;
  let rAnkX = 0;

  let lambda = 16;

  if (f.action === 'idle') {
    // Authentic martial-arts staggered fighting stance with rhythmic weight shift
    const breathe = Math.sin(t * 4.2);
    const sway = Math.cos(t * 2.1);
    hipsY = 1.54 + breathe * 0.04;
    hipsRy = -0.34 + sway * 0.04;
    waistRx = 0.08;
    waistRy = 0.18;
    chestRx = 0.1 + breathe * 0.03;
    chestRy = 0.22;
    neckRx = -0.08;
    headRy = -0.14 + sway * 0.05;

    // Guard hands protecting chin & ribs
    lShX = -0.92 + breathe * 0.06;
    lShY = 0.25;
    lShZ = 0.22;
    lElX = -1.55;
    rShX = -1.12 - breathe * 0.06;
    rShY = -0.2;
    rShZ = -0.22;
    rElX = -1.68;

    // Staggered knees bent & rooted
    lHipX = -0.36;
    lHipZ = 0.12;
    lKneeX = 0.58;
    lAnkX = -0.22;
    rHipX = 0.24;
    rHipZ = -0.14;
    rKneeX = 0.42;
    rAnkX = -0.18;
    lambda = 12;
  } else if (f.action === 'run') {
    // Athletic human sprint with hip/chest counter-twist and high knee drive
    const cycle = t * 14.5;
    const s = Math.sin(cycle);
    const c = Math.cos(cycle);
    hipsY = 1.54 + Math.abs(c) * 0.14;
    hipsRy = s * 0.2;
    waistRx = 0.16;
    waistRy = -s * 0.24;
    chestRx = 0.22;
    chestRy = -s * 0.28;
    neckRx = -0.24;
    headRx = -0.08;

    lHipX = s * 0.95 - 0.12;
    lKneeX = Math.max(0.08, -s * 1.2 + 0.35);
    lAnkX = -s * 0.35;

    rHipX = -s * 0.95 - 0.12;
    rKneeX = Math.max(0.08, s * 1.2 + 0.35);
    rAnkX = s * 0.35;

    lShX = -s * 1.05 - 0.2;
    lShZ = 0.18;
    lElX = -1.35;
    rShX = s * 1.05 - 0.2;
    rShZ = -0.18;
    rElX = -1.35;
    lambda = 20;
  } else if (f.action === 'jump' || f.action === 'fall') {
    const rising = f.vy > 0;
    hipsY = 1.62;
    waistRx = rising ? 0.18 : 0.08;
    chestRx = rising ? 0.15 : 0.22;
    neckRx = -0.15;
    lHipX = rising ? -0.82 : -0.42;
    lKneeX = rising ? 1.35 : 0.72;
    lAnkX = rising ? 0.35 : -0.25;
    rHipX = rising ? -0.45 : -0.22;
    rKneeX = rising ? 0.95 : 0.48;
    rAnkX = rising ? 0.25 : -0.15;
    lShX = rising ? -1.4 : -0.45;
    lShZ = 0.65;
    lElX = -0.85;
    rShX = rising ? -1.4 : -0.45;
    rShZ = -0.65;
    rElX = -0.85;
    lambda = 16;
  } else if (f.action === 'dash') {
    // Low aerodynamic burst lunge
    hipsY = 1.38;
    hipsRy = -0.25;
    waistRx = 0.28;
    chestRx = 0.34;
    neckRx = -0.35;
    lHipX = -0.68;
    lKneeX = 1.05;
    lAnkX = -0.3;
    rHipX = 0.65;
    rKneeX = 0.32;
    rAnkX = 0.35;
    lShX = 0.95;
    lShZ = 0.24;
    lElX = -0.45;
    rShX = 0.95;
    rShZ = -0.24;
    rElX = -0.45;
    lambda = 26;
  } else if (f.action === 'block') {
    // Tight cross-guard defensive shell with planted knees
    hipsY = 1.42;
    hipsRy = -0.22;
    waistRx = 0.14;
    chestRx = 0.16;
    chestRy = 0.15;
    neckRx = 0.12;
    headRx = 0.12;
    lShX = -1.25;
    lShY = 0.52;
    lShZ = 0.08;
    lElX = -1.55;
    rShX = -1.25;
    rShY = -0.52;
    rShZ = -0.08;
    rElX = -1.55;
    lHipX = -0.45;
    lKneeX = 0.82;
    lAnkX = -0.32;
    rHipX = -0.28;
    rKneeX = 0.68;
    rAnkX = -0.28;
    lambda = 24;
  } else if (f.action === 'attack1') {
    // Lead Cross / Jab: hip coil -> explosive torso whip & arm extension -> recoil
    const windup = Math.min(1, p / 0.24);
    const snapAmt = p < 0.24 ? -0.35 * windup : Math.sin(Math.min(1, (p - 0.24) / 0.56) * Math.PI);
    hipsY = 1.52;
    hipsRy = -0.45 + snapAmt * 0.65;
    waistRx = 0.12;
    waistRy = -0.2 + snapAmt * 0.55;
    chestRx = 0.18;
    chestRy = -0.25 + snapAmt * 0.65;
    neckRy = -chestRy * 0.7;

    rShX = -1.55 * Math.max(0, snapAmt) - 0.45;
    rShY = 0.15 * snapAmt;
    rElX = snapAmt > 0.25 ? -0.08 : -1.55;
    rWrX = snapAmt * 0.2;

    // Left hand tucks defensively near chin
    lShX = -1.05;
    lShY = 0.35;
    lElX = -1.75;

    lHipX = -0.38;
    lKneeX = 0.62;
    rHipX = 0.32;
    rKneeX = 0.36;
    lambda = 30;
  } else if (f.action === 'attack2') {
    // High Roundhouse Kick: planted left leg, hip tilt, torso counterbalance lean, snapping kick
    const kickCurve = Math.sin(Math.min(1, p / 0.85) * Math.PI);
    hipsY = 1.58 + kickCurve * 0.12;
    hipsRx = -0.22 * kickCurve;
    hipsRz = -0.28 * kickCurve;
    waistRz = -0.24 * kickCurve;
    chestRz = -0.22 * kickCurve;
    chestRy = 0.45 * kickCurve;
    neckRz = 0.3 * kickCurve;

    // Planted left leg
    lHipX = -0.15;
    lKneeX = 0.24;
    // Snapping right roundhouse leg
    rHipX = -1.48 * kickCurve;
    rHipZ = -0.42 * kickCurve;
    rKneeX = p < 0.3 ? 1.45 * (p / 0.3) : 0.14 + (1 - kickCurve) * 0.9;
    rAnkX = 0.45 * kickCurve;

    lShX = -0.85;
    lShZ = 0.45;
    lElX = -1.35;
    rShX = -0.75;
    rShZ = -0.55 * kickCurve - 0.2;
    rElX = -1.2;
    lambda = 28;
  } else if (f.action === 'attack3') {
    // Spinning / Lunging Finisher: deep coil -> explosive full-body whip & smash
    if (p < 0.28) {
      const k = p / 0.28;
      hipsY = 1.54 - 0.24 * k;
      waistRx = 0.25 * k;
      waistRy = -0.5 * k;
      chestRy = -0.45 * k;
      rShX = -2.2 * k;
      lShX = -1.6 * k;
      lHipX = -0.52 * k;
      lKneeX = 0.92 * k;
      rHipX = 0.25 * k;
      rKneeX = 0.6 * k;
    } else {
      const k = Math.sin(Math.min(1, (p - 0.28) / 0.62) * Math.PI);
      hipsY = 1.58 + k * 0.22;
      rootRy = f.facingAngle + Math.min(1, (p - 0.28) / 0.45) * Math.PI * 2;
      waistRx = 0.26 * k;
      chestRx = 0.28 * k;
      chestRy = 0.55 * k;
      rShX = -2.45 * k - 0.3;
      rElX = -0.15;
      lShX = -2.0 * k - 0.3;
      lElX = -0.25;
      lHipX = -0.42 * k;
      lKneeX = 0.72 * k;
      rHipX = 0.35 * k;
      rKneeX = 0.42 * k;
    }
    lambda = 28;
  } else if (f.action === 'power1' || f.action === 'power2' || f.action === 'ultimate') {
    // Unique, expressive human casting choreography per fighter & skill
    const id = f.spec.id;
    const act = f.action;

    if (id === 'kael') {
      if (act === 'power1') {
        // Two-handed Ember Lance waist-coil -> forward double-palm thrust
        const thrust = p < 0.35 ? 0 : Math.min(1, (p - 0.35) / 0.35);
        hipsY = 1.46;
        hipsRy = -0.35 + thrust * 0.35;
        waistRx = 0.16 + thrust * 0.12;
        chestRx = 0.18;
        lShX = thrust > 0 ? -1.52 : -0.6;
        lShY = thrust > 0 ? 0.2 : -0.45;
        lElX = thrust > 0 ? -0.12 : -1.5;
        rShX = thrust > 0 ? -1.52 : -0.6;
        rShY = thrust > 0 ? -0.2 : -0.35;
        rElX = thrust > 0 ? -0.12 : -1.5;
        lHipX = -0.48;
        lKneeX = 0.85;
        rHipX = 0.34;
        rKneeX = 0.45;
      } else if (act === 'power2') {
        // Meteor Slam: airborne tuck -> crushing downward fist-and-knee slam
        const slam = p > 0.5 ? Math.min(1, (p - 0.5) / 0.25) : 0;
        hipsY = slam > 0 ? 1.25 : 1.72;
        waistRx = slam > 0 ? 0.38 : -0.15;
        chestRx = slam > 0 ? 0.42 : -0.1;
        lShX = slam > 0 ? -0.9 : -2.6;
        rShX = slam > 0 ? -0.9 : -2.6;
        lElX = -0.25;
        rElX = -0.25;
        lHipX = -0.68;
        lKneeX = 1.22;
        rHipX = -0.35;
        rKneeX = 0.85;
      } else {
        // Solar Flare Ultimate: deep charge -> roaring skyward burst
        const burst = p < 0.35 ? 0 : Math.min(1, (p - 0.35) / 0.4);
        hipsY = burst > 0 ? 1.66 : 1.32;
        waistRx = burst > 0 ? -0.18 : 0.3;
        chestRx = burst > 0 ? -0.16 : 0.28;
        headRx = burst > 0 ? -0.28 : 0.2;
        lShX = burst > 0 ? -2.35 : -0.85;
        lShZ = burst > 0 ? 0.85 : 0.2;
        rShX = burst > 0 ? -2.35 : -0.85;
        rShZ = burst > 0 ? -0.85 : -0.2;
        lElX = burst > 0 ? -0.15 : -1.5;
        rElX = burst > 0 ? -0.15 : -1.5;
        lHipX = -0.45;
        lKneeX = 0.78;
        rHipX = 0.25;
        rKneeX = 0.52;
      }
    } else if (id === 'veyra') {
      if (act === 'power1') {
        // Flash Step: deep forward ninja sprint lean with swept tonfas
        hipsY = 1.34;
        waistRx = 0.35;
        chestRx = 0.38;
        neckRx = -0.42;
        lShX = 1.15;
        lShZ = 0.35;
        lElX = -0.35;
        rShX = 1.15;
        rShZ = -0.35;
        rElX = -0.35;
        lHipX = -0.75;
        lKneeX = 1.12;
        rHipX = 0.7;
        rKneeX = 0.35;
      } else if (act === 'power2') {
        // Cyclone Trap: spinning tornado kick summon
        rootRy = f.facingAngle + p * Math.PI * 4;
        hipsY = 1.65;
        waistRx = 0.14;
        lShX = -0.45;
        lShZ = 1.25;
        rShX = -0.45;
        rShZ = -1.25;
        rHipX = -1.25;
        rHipZ = -0.45;
        rKneeX = 0.25;
        lHipX = -0.25;
        lKneeX = 0.45;
      } else {
        // Skybreak Barrage: rapid alternating cross-slash blitz pose
        const slashWave = Math.sin(p * Math.PI * 6);
        hipsY = 1.48;
        waistRx = 0.28;
        chestRy = slashWave * 0.75;
        lShX = -1.45;
        lShY = slashWave * 0.85;
        lElX = -0.25;
        rShX = -1.45;
        rShY = -slashWave * 0.85;
        rElX = -0.25;
        lHipX = -0.52;
        lKneeX = 0.88;
        rHipX = 0.42;
        rKneeX = 0.45;
      }
    } else if (id === 'bram') {
      if (act === 'power1') {
        // Boulder Hurl: deep squat lift -> overhead two-handed heave forward
        const throwAmt = p < 0.32 ? 0 : Math.min(1, (p - 0.32) / 0.35);
        hipsY = throwAmt > 0 ? 1.64 : 1.32;
        waistRx = throwAmt > 0 ? 0.22 : -0.18;
        chestRx = throwAmt > 0 ? 0.24 : -0.15;
        lShX = throwAmt > 0 ? -1.45 : -2.65;
        lShZ = 0.22;
        rShX = throwAmt > 0 ? -1.45 : -2.65;
        rShZ = -0.22;
        lElX = -0.2;
        rElX = -0.2;
        lHipX = -0.46;
        lKneeX = 0.82;
        rHipX = 0.32;
        rKneeX = 0.48;
      } else if (act === 'power2') {
        // Aegis Guard: wide armored chest-brace
        hipsY = 1.38;
        waistRx = 0.14;
        chestRx = 0.12;
        lShX = -1.2;
        lShY = 0.55;
        lElX = -1.5;
        rShX = -1.2;
        rShY = -0.55;
        rElX = -1.5;
        lHipX = -0.5;
        lHipZ = 0.2;
        lKneeX = 0.88;
        rHipX = -0.5;
        rHipZ = -0.2;
        rKneeX = 0.88;
      } else {
        // Tectonic Crater: colossal overhead double-fist floor smash
        const smash = p < 0.42 ? 0 : Math.min(1, (p - 0.42) / 0.28);
        hipsY = smash > 0 ? 1.26 : 1.72;
        waistRx = smash > 0 ? 0.42 : -0.15;
        chestRx = smash > 0 ? 0.38 : -0.12;
        lShX = smash > 0 ? -0.82 : -2.75;
        lShZ = 0.25;
        rShX = smash > 0 ? -0.82 : -2.75;
        rShZ = -0.25;
        lElX = -0.2;
        rElX = -0.2;
        lHipX = -0.56;
        lKneeX = 1.02;
        rHipX = 0.25;
        rKneeX = 0.55;
      }
    } else if (id === 'sora') {
      if (act === 'power1') {
        // Iaijutsu hip draw -> blinding single-hand katana slash
        const draw = p < 0.3 ? 0 : Math.min(1, (p - 0.3) / 0.4);
        hipsY = 1.42;
        hipsRy = -0.5 + draw * 1.15;
        waistRx = 0.22;
        waistRy = -0.3 + draw * 0.85;
        chestRy = -0.25 + draw * 0.75;
        rShX = -1.35;
        rShY = -0.9 + draw * 1.85;
        rElX = -0.18;
        rWrZ = -0.45 * draw;
        lShX = -0.6;
        lElX = -1.3;
        lHipX = -0.52;
        lKneeX = 0.88;
        rHipX = 0.38;
        rKneeX = 0.42;
      } else if (act === 'power2') {
        // Thunder Counter ready crouch
        hipsY = 1.42;
        hipsRy = -0.35;
        waistRx = 0.2;
        chestRx = 0.16;
        rShX = -1.1;
        rShY = 0.45;
        rElX = -1.3;
        lShX = -0.85;
        lElX = -1.4;
        lHipX = -0.48;
        lKneeX = 0.82;
        rHipX = 0.3;
        rKneeX = 0.48;
      } else {
        // Heavenly Bolt: skyward katana raise summoning lightning
        hipsY = 1.6;
        waistRx = -0.12;
        chestRx = -0.14;
        headRx = -0.22;
        rShX = -2.85;
        rElX = -0.12;
        lShX = -0.7;
        lShZ = 0.45;
        lElX = -1.1;
        lHipX = -0.3;
        lKneeX = 0.48;
        rHipX = 0.22;
        rKneeX = 0.35;
      }
    } else if (id === 'lyra') {
      // Lyra
      if (act === 'power1') {
        // Frost Volley graceful sweeping staff cast
        const sweep = Math.sin(p * Math.PI);
        hipsY = 1.58;
        waistRy = -0.3 + sweep * 0.7;
        chestRy = -0.2 + sweep * 0.55;
        rShX = -1.45;
        rShY = -0.5 + sweep * 1.1;
        rElX = -0.2;
        lShX = -0.8;
        lShZ = 0.45;
        lHipX = -0.25;
        lKneeX = 0.42;
      } else if (act === 'power2') {
        // Glacial Nova double-arm chest burst outward
        const open = p < 0.3 ? 0 : Math.min(1, (p - 0.3) / 0.4);
        hipsY = 1.56;
        chestRx = open > 0 ? -0.12 : 0.18;
        lShX = -1.2;
        lShZ = open * 1.15;
        lElX = open > 0 ? -0.15 : -1.5;
        rShX = -1.2;
        rShZ = -open * 1.15;
        rElX = open > 0 ? -0.15 : -1.5;
      } else {
        // Absolute Zero Ultimate: levitating spin with staff raised skyward
        rootRy = f.facingAngle + p * Math.PI * 2;
        hipsY = 1.95;
        waistRx = -0.1;
        rShX = -2.6;
        rElX = -0.18;
        lShX = -1.1;
        lShZ = 0.72;
        lElX = -0.35;
        lHipX = 0.18;
        rHipX = -0.22;
        rKneeX = 0.45;
      }
    } else {
      // Hecker: rapid laptop typing, breach command execute, and root override
      const typeJitter = Math.sin(t * 48) * 0.12;
      if (act === 'power1') {
        // Holds laptop steady while left hand types & flicks encrypted packet
        const flick = p < 0.35 ? 0 : Math.min(1, (p - 0.35) / 0.35);
        hipsY = 1.52;
        waistRx = 0.12;
        chestRy = 0.25 - flick * 0.4;
        rShX = -0.95;
        rShY = -0.25;
        rElX = -1.25;
        lShX = flick > 0 ? -1.55 : -1.05 + typeJitter;
        lShY = flick > 0 ? 0.15 : 0.35;
        lElX = flick > 0 ? -0.15 : -1.45;
        lHipX = -0.38;
        lKneeX = 0.66;
        rHipX = 0.28;
        rKneeX = 0.42;
      } else if (act === 'power2') {
        // Frantic typing crouch -> slams Enter on the laptop to breach firewall
        const exec = p > 0.55 ? Math.min(1, (p - 0.55) / 0.22) : 0;
        hipsY = 1.44 - exec * 0.14;
        waistRx = 0.22 + exec * 0.12;
        chestRx = 0.2;
        rShX = -0.92;
        rElX = -1.35;
        lShX = exec > 0 ? -1.45 : -0.95 + typeJitter;
        lElX = exec > 0 ? -0.95 : -1.4 + typeJitter;
        lHipX = -0.5;
        lKneeX = 0.88;
        rHipX = -0.32;
        rKneeX = 0.65;
      } else {
        // System Override: levitates while typing furiously then spreads arms for orbital beams
        const cast = p > 0.48 ? Math.min(1, (p - 0.48) / 0.28) : 0;
        hipsY = 1.88 + Math.sin(t * 14) * 0.06;
        chestRx = cast > 0 ? -0.16 : 0.18;
        rShX = cast > 0 ? -2.25 : -1.05;
        rShZ = cast > 0 ? -0.75 : -0.2;
        rElX = cast > 0 ? -0.2 : -1.35;
        lShX = cast > 0 ? -2.25 : -1.05 + typeJitter;
        lShZ = cast > 0 ? 0.75 : 0.2;
        lElX = cast > 0 ? -0.2 : -1.35 - typeJitter;
        lHipX = -0.28;
        lKneeX = 0.58;
        rHipX = 0.16;
        rKneeX = 0.34;
      }
    }
    lambda = 24;
  } else if (f.action === 'hitstun') {
    const launchSpeed = Math.hypot(f.vx, f.vz);
    const launchFactor = Math.min(1, Math.max(0, (launchSpeed - 6) / 14));
    rootRx = -launchFactor * 0.58;
    hipsY = 1.54 - launchFactor * 0.08;
    waistRx = -0.32 - launchFactor * 0.24;
    chestRx = -0.38 - launchFactor * 0.22;
    neckRx = -0.25 - launchFactor * 0.14;
    headRx = -0.25 - launchFactor * 0.14;
    lShX = -0.25 - launchFactor * 0.65;
    lShZ = 0.82 + launchFactor * 0.45;
    lElX = -0.85 + launchFactor * 0.4;
    rShX = -0.25 - launchFactor * 0.65;
    rShZ = -0.82 - launchFactor * 0.45;
    rElX = -0.85 + launchFactor * 0.4;
    lHipX = -0.22 - launchFactor * 0.35;
    lKneeX = 0.42 + launchFactor * 0.28;
    rHipX = 0.18 - launchFactor * 0.3;
    rKneeX = 0.28 + launchFactor * 0.35;
    lambda = 28;
  } else if (f.action === 'ko') {
    rootRx = -Math.PI * 0.48;
    hipsY = 0.5;
    lShX = -0.4;
    lShZ = 0.6;
    rShX = -0.3;
    rShZ = -0.7;
    lKneeX = 0.35;
    rKneeX = 0.25;
    lambda = 14;
  } else if (f.action === 'victory') {
    const id = f.spec.id;
    const ease = Math.min(1, Math.max(0, p));

    if (id === 'kael') {
      if (ease < 0.35) {
        const k = ease / 0.35;
        hipsY = 1.65 - 0.25 * k;
        waistRx = 0.24 * k;
        rShX = 0.45 * k;
        rShZ = -0.3;
        rElX = -1.2;
      } else if (ease < 0.72) {
        const k = (ease - 0.35) / 0.37;
        hipsY = 1.4 + 0.36 * k;
        waistRx = -0.1 * k;
        chestRy = -0.25 * k;
        rShX = -2.95 * k;
        rShZ = -0.18;
        rElX = -0.12;
        lShX = 0.35;
        lShZ = 0.42;
      } else {
        hipsY = 1.68 + Math.sin(t * 3.2) * 0.04;
        waistRx = -0.06;
        chestRy = -0.22;
        rShX = -2.68 + Math.sin(t * 3.2) * 0.05;
        rShZ = -0.24;
        rElX = -0.22;
        lShX = -0.25;
        lShY = 0.35;
        lShZ = 0.48;
        lElX = -1.15;
      }
    } else if (id === 'veyra') {
      if (ease < 0.55) {
        const spin = ease / 0.55;
        rootRy = f.facingAngle + spin * Math.PI * 2;
        hipsY = 1.65 + Math.sin(spin * Math.PI) * 0.55;
        lShX = -0.35;
        lShZ = 1.18;
        rShX = -0.35;
        rShZ = -1.18;
        lElX = -0.25;
        rElX = -0.25;
      } else {
        hipsY = 1.52 + Math.sin(t * 3.5) * 0.03;
        waistRx = 0.14;
        lShX = -1.12;
        lShY = 0.58;
        lShZ = 0.12;
        lElX = -1.35;
        rShX = -1.12;
        rShY = -0.58;
        rShZ = -0.12;
        rElX = -1.35;
        lHipX = -0.25;
        lHipZ = 0.18;
        lKneeX = 0.42;
        rHipX = -0.25;
        rHipZ = -0.18;
        rKneeX = 0.42;
      }
    } else if (id === 'bram') {
      if (ease < 0.4) {
        const k = ease / 0.4;
        hipsY = 1.65 + 0.08 * k;
        chestRx = -0.15 * k;
        lShX = -2.55 * k;
        lShZ = 0.35;
        rShX = -2.55 * k;
        rShZ = -0.35;
      } else if (ease < 0.68) {
        const k = Math.sin(((ease - 0.4) / 0.28) * Math.PI * 0.5);
        hipsY = 1.65 - 0.36 * k;
        waistRx = 0.22 * k;
        chestRx = 0.2 * k;
        lShX = -0.85;
        lShZ = 0.38;
        rShX = -0.85;
        rShZ = -0.38;
        lHipX = -0.48 * k;
        lKneeX = 0.88 * k;
        rHipX = -0.48 * k;
        rKneeX = 0.88 * k;
      } else {
        hipsY = 1.66 + Math.sin(t * 2.4) * 0.03;
        chestRx = -0.08;
        lShX = -0.42;
        lShZ = 0.88;
        lElX = -1.38;
        rShX = -0.42;
        rShZ = -0.88;
        rElX = -1.38;
      }
    } else if (id === 'sora') {
      if (ease < 0.48) {
        const sw = ease / 0.48;
        waistRy = -0.3 + sw * 0.6;
        chestRy = -0.35 + sw * 0.7;
        chestRx = 0.16;
        rShX = -1.25 - Math.sin(sw * Math.PI) * 0.75;
        rShY = 0.45 - sw * 0.95;
        rShZ = -0.35;
        rElX = -0.2;
        lShX = -0.3;
        lShZ = 0.45;
      } else {
        const k = Math.min(1, (ease - 0.48) / 0.3);
        waistRx = 0.12 * k;
        chestRy = 0.18 * k;
        neckRx = 0.12 * k;
        headRx = 0.12 * k;
        rShX = -0.52;
        rShY = 0.74 * k;
        rShZ = -0.15;
        rElX = -1.08;
        lShX = -0.35;
        lShZ = 0.25;
        lElX = -0.6;
      }
    } else if (id === 'lyra') {
      const lift = ease < 0.55 ? Math.sin((ease / 0.55) * Math.PI * 0.5) : 1;
      hipsY = 1.65 + lift * 0.44 + (ease >= 0.55 ? Math.sin(t * 3.0) * 0.09 : 0);
      chestRx = -0.06;
      headRz = Math.sin(t * 2.0) * 0.04;
      rShX = -2.15 * lift - 0.25;
      rShZ = -0.28;
      rElX = -0.25;
      lShX = -0.92 * lift;
      lShZ = 0.58 * lift;
      lElX = -0.45;
      lHipX = 0.15 * lift;
      rHipX = -0.1 * lift;
      rKneeX = 0.28 * lift;
    } else {
      // Hecker: frantic final hack -> cool one-key Enter tap & confident nod
      if (ease < 0.55) {
        const tap = Math.sin(t * 34) * 0.14;
        hipsY = 1.56;
        waistRx = 0.14;
        chestRy = 0.2;
        rShX = -1.05;
        rShY = -0.2;
        rElX = -1.28;
        lShX = -1.02 + tap;
        lShY = 0.35;
        lElX = -1.35 - tap;
      } else {
        const k = Math.min(1, (ease - 0.55) / 0.25);
        hipsY = 1.62 + Math.sin(t * 2.8) * 0.03;
        waistRx = -0.05 * k;
        chestRy = -0.22 * k;
        headRx = Math.sin(t * 2.8) * 0.06;
        rShX = -0.95;
        rShY = -0.35 * k;
        rElX = -1.05;
        lShX = -0.25;
        lShZ = 0.38;
        lElX = -1.35;
      }
    }
    lambda = 14;
  }

  // Smooth exponential damping across all articulated joints for organic human motion
  if (snap) {
    rig.hips.position.y = hipsY;
    rig.root.rotation.set(rootRx, rootRy, rootRz);
  } else {
    rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, hipsY, lambda, safeDt);
    rig.root.rotation.x = THREE.MathUtils.damp(rig.root.rotation.x, rootRx, lambda, safeDt);
    rig.root.rotation.z = THREE.MathUtils.damp(rig.root.rotation.z, rootRz, lambda, safeDt);
    // Shortest-angle wrap for root.rotation.y unless spinning
    if (Math.abs(rootRy - rig.root.rotation.y) > 4) {
      rig.root.rotation.y = rootRy;
    } else {
      rig.root.rotation.y = THREE.MathUtils.damp(rig.root.rotation.y, rootRy, 22, safeDt);
    }
  }

  dampRot(rig.hips, hipsRx, hipsRy, hipsRz, lambda, safeDt, snap);
  dampRot(rig.torso, waistRx, waistRy, waistRz, lambda, safeDt, snap);
  dampRot(rig.chest, chestRx, chestRy, chestRz, lambda, safeDt, snap);
  dampRot(rig.neck, neckRx, neckRy, neckRz, lambda, safeDt, snap);
  dampRot(rig.headGroup, headRx, headRy, headRz, lambda, safeDt, snap);

  dampRot(rig.lShoulder, lShX, lShY, lShZ, lambda, safeDt, snap);
  dampRot(rig.lElbow, lElX, 0, 0, lambda, safeDt, snap);
  dampRot(rig.lWrist, lWrX, 0, lWrZ, lambda, safeDt, snap);
  dampRot(rig.rShoulder, rShX, rShY, rShZ, lambda, safeDt, snap);
  dampRot(rig.rElbow, rElX, 0, 0, lambda, safeDt, snap);
  dampRot(rig.rWrist, rWrX, 0, rWrZ, lambda, safeDt, snap);

  dampRot(rig.lHip, lHipX, lHipY, lHipZ, lambda, safeDt, snap);
  dampRot(rig.lKnee, lKneeX, 0, 0, lambda, safeDt, snap);
  dampRot(rig.lAnkle, lAnkX, 0, 0, lambda, safeDt, snap);
  dampRot(rig.rHip, rHipX, rHipY, rHipZ, lambda, safeDt, snap);
  dampRot(rig.rKnee, rKneeX, 0, 0, lambda, safeDt, snap);
  dampRot(rig.rAnkle, rAnkX, 0, 0, lambda, safeDt, snap);

  if (rig.scarfA) {
    rig.scarfA.rotation.x = Math.sin(t * 9) * 0.22 - 0.14;
  }
  if (rig.scarfB) {
    rig.scarfB.rotation.x = Math.cos(t * 10) * 0.26 - 0.16;
  }
  if (rig.cryoHalo) {
    rig.cryoHalo.rotation.z = t * 1.8;
  }
}

export class Arena3DController {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private disposables: Array<{ dispose: () => void }> = [];

  private stageGroup = new THREE.Group();
  private dynamicGroup = new THREE.Group();
  private rigs: [StickmanRig, StickmanRig] | null = null;
  private currentStageId: string | null = null;
  private currentFighterIds: string = '';

  private camPos = new THREE.Vector3(0, 7.5, 16);
  private camLook = new THREE.Vector3(0, 2.0, 0);

  private spriteCache = new Map<string, THREE.CanvasTexture>();
  private shadowTex: THREE.CanvasTexture;
  private keyLight: THREE.DirectionalLight;
  private particleDensity: ParticleDensity = 'normal';
  private renderScale = 1.0;
  private viewportW = 0;
  private viewportH = 0;

  constructor(
    container: HTMLElement,
    onContextLost: () => void,
    onContextRestored: () => void,
  ) {
    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      onContextLost();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      onContextRestored();
    });

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 220);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Studio environment reflection map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.disposables.push(envRT);
    pmrem.dispose();

    // Warm/cool 3-point lighting rig
    const hemi = new THREE.HemisphereLight('#b5d4eb', '#3b2e26', 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff2db', 2.0);
    keyLight.position.set(12, 22, 14);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 65;
      keyLight.shadow.camera.left = -18;
      keyLight.shadow.camera.right = 18;
      keyLight.shadow.camera.top = 18;
      keyLight.shadow.camera.bottom = -18;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.keyLight = keyLight;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#8ac4f2', 0.9);
    rimLight.position.set(-14, 10, -14);
    this.scene.add(rimLight);

    this.shadowTex = createContactShadowTexture();
    this.disposables.push(this.shadowTex);

    this.scene.add(this.stageGroup);
    this.scene.add(this.dynamicGroup);
  }

  public applyGraphicsSettings(gfx: GraphicsSettings): void {
    this.renderScale = Math.max(0.5, Math.min(1.0, gfx.renderScale));
    const baseDpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.max(0.5, baseDpr * this.renderScale));
    if (this.viewportW > 0 && this.viewportH > 0) {
      this.renderer.setSize(this.viewportW, this.viewportH, false);
    }

    this.renderer.toneMappingExposure = 1.12 * Math.max(0.75, Math.min(1.35, gfx.brightness));
    const enableShadows = !this.isSoftwareGl && gfx.shadows;
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.autoUpdate = enableShadows;
    this.keyLight.castShadow = enableShadows;
    if (enableShadows) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.particleDensity = gfx.particleDensity;
  }

  public isSoftware(): boolean {
    return this.isSoftwareGl;
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.viewportW = width;
    this.viewportH = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public getGlContext(): WebGL2RenderingContext | null {
    return this.renderer.getContext() as WebGL2RenderingContext | null;
  }

  private ensureStageBuilt(stage: StageSpec): void {
    if (this.currentStageId === stage.id) return;
    this.currentStageId = stage.id;

    // Clear old stage meshes
    while (this.stageGroup.children.length > 0) {
      const child = this.stageGroup.children[0];
      this.stageGroup.remove(child);
    }

    _color.set(stage.skyBottom);
    this.scene.background = _color.clone();
    this.scene.fog = new THREE.FogExp2(stage.skyBottom, 0.014);

    // Continuous extended outdoor terrain (no boxed void)
    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({
        color: stage.horizonColor,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    outerGround.rotation.x = -Math.PI * 0.5;
    outerGround.position.y = -0.18;
    outerGround.receiveShadow = !this.isSoftwareGl;
    this.stageGroup.add(outerGround);

    // Main playable arena dais with textured floor & beveled perimeter rim
    const floorTex = createFloorTexture(stage, this.renderer.capabilities.getMaxAnisotropy());
    this.disposables.push(floorTex);

    const daisGeo = new THREE.BoxGeometry(ARENA_HALF_X * 2 + 1.8, 0.36, ARENA_HALF_Z * 2 + 1.8);
    const daisMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.78,
      metalness: 0.08,
    });
    const dais = new THREE.Mesh(daisGeo, daisMat);
    dais.position.y = -0.18;
    dais.receiveShadow = !this.isSoftwareGl;
    this.stageGroup.add(dais);

    // Arena rim border trim
    const rimMat = new THREE.MeshStandardMaterial({
      color: stage.floorTrim,
      roughness: 0.45,
      metalness: 0.3,
    });
    const rimBarTop = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_HALF_X * 2 + 2.1, 0.16, 0.35),
      rimMat,
    );
    rimBarTop.position.set(0, 0.02, -ARENA_HALF_Z - 0.9);
    this.stageGroup.add(rimBarTop);

    const rimBarBot = rimBarTop.clone();
    rimBarBot.position.z = ARENA_HALF_Z + 0.9;
    this.stageGroup.add(rimBarBot);

    const rimBarL = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.16, ARENA_HALF_Z * 2 + 2.1),
      rimMat,
    );
    rimBarL.position.set(-ARENA_HALF_X - 0.9, 0.02, 0);
    this.stageGroup.add(rimBarL);

    const rimBarR = rimBarL.clone();
    rimBarR.position.x = ARENA_HALF_X + 0.9;
    this.stageGroup.add(rimBarR);

    // Center duel ring decal
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.45, 48),
      new THREE.MeshBasicMaterial({
        color: stage.floorTrim,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    centerRing.rotation.x = -Math.PI * 0.5;
    centerRing.position.y = 0.015;
    this.stageGroup.add(centerRing);

    // Raised 3D tactical platforms
    const platMat = new THREE.MeshStandardMaterial({
      color: stage.platformColor,
      roughness: 0.72,
      metalness: 0.12,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: stage.accentColor,
      roughness: 0.38,
      metalness: 0.4,
    });

    for (const p of stage.platforms) {
      const platGroup = new THREE.Group();
      platGroup.position.set(p.x, p.y - p.thickness * 0.5, p.z);

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(p.width, p.thickness, p.depth),
        platMat,
      );
      deck.castShadow = !this.isSoftwareGl;
      deck.receiveShadow = !this.isSoftwareGl;
      platGroup.add(deck);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(p.width + 0.16, 0.09, p.depth + 0.16),
        trimMat,
      );
      cap.position.y = p.thickness * 0.5 - 0.02;
      platGroup.add(cap);

      // Stone support pillars beneath platform
      const pillarMat = new THREE.MeshStandardMaterial({
        color: '#23201e',
        roughness: 0.88,
      });
      const pillarH = p.y - p.thickness;
      if (pillarH > 0.2) {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.38, pillarH, 10),
          pillarMat,
        );
        pillar.position.y = -p.thickness * 0.5 - pillarH * 0.5;
        pillar.castShadow = !this.isSoftwareGl;
        platGroup.add(pillar);
      }

      this.stageGroup.add(platGroup);
    }

    // Natural outdoor perimeter scenery
    if (stage.id === 'bamboo') {
      const stalkGeo = new THREE.CylinderGeometry(0.18, 0.24, 14, 8);
      const stalkMat = new THREE.MeshStandardMaterial({
        color: '#3c6148',
        roughness: 0.65,
      });
      const count = 36;
      const inst = new THREE.InstancedMesh(stalkGeo, stalkMat, count);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const rad = 16.5 + (i % 3) * 3.5;
        _dummy.position.set(Math.cos(angle) * rad * 1.15, 6.8, Math.sin(angle) * rad * 0.8);
        _dummy.rotation.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
        const sc = 0.85 + (i % 4) * 0.12;
        _dummy.scale.set(sc, sc, sc);
        _dummy.updateMatrix();
        inst.setMatrixAt(i, _dummy.matrix);
      }
      inst.computeBoundingSphere();
      this.stageGroup.add(inst);
    } else {
      // Basalt boulders & lanterns around perimeter
      const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: stage.id === 'foundry' ? '#2c1c17' : '#263342',
        roughness: 0.88,
      });
      const count = 24;
      const inst = new THREE.InstancedMesh(rockGeo, rockMat, count);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const rad = 17 + (i % 3) * 2.5;
        _dummy.position.set(Math.cos(angle) * rad * 1.15, 0.3, Math.sin(angle) * rad * 0.78);
        _dummy.rotation.set(i * 0.4, i * 0.9, 0);
        const sc = 0.7 + (i % 4) * 0.35;
        _dummy.scale.set(sc, sc * 0.85, sc);
        _dummy.updateMatrix();
        inst.setMatrixAt(i, _dummy.matrix);
      }
      inst.computeBoundingSphere();
      this.stageGroup.add(inst);
    }
  }

  private ensureRigsBuilt(match: MatchState): void {
    const key = `${match.fighters[0].spec.id}-${match.fighters[1].spec.id}`;
    if (this.rigs && this.currentFighterIds === key) return;
    this.currentFighterIds = key;

    if (this.rigs) {
      for (const r of this.rigs) {
        this.scene.remove(r.root);
        this.scene.remove(r.shadowDisc);
        this.scene.remove(r.playerRing);
        this.scene.remove(r.ultRing);
      }
    }

    const r1 = buildStickmanRig(match.fighters[0], this.shadowTex, !this.isSoftwareGl);
    const r2 = buildStickmanRig(match.fighters[1], this.shadowTex, !this.isSoftwareGl);
    this.rigs = [r1, r2];

    for (const r of this.rigs) {
      this.scene.add(r.root);
      this.scene.add(r.shadowDisc);
      this.scene.add(r.playerRing);
      this.scene.add(r.ultRing);
    }
  }

  private getTextSpriteTex(text: string, color: string): THREE.CanvasTexture {
    const key = `${text}::${color}`;
    const existing = this.spriteCache.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '700 42px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#120f0d';
    ctx.strokeText(text, 128, 48);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.spriteCache.set(key, tex);
    return tex;
  }

  public getAspect(): number {
    return this.camera.aspect;
  }

  public setCameraPose(
    posX: number,
    posY: number,
    posZ: number,
    lookX: number,
    lookY: number,
    lookZ: number,
    fov?: number,
  ): void {
    this.camPos.set(posX, posY, posZ);
    this.camLook.set(lookX, lookY, lookZ);
    if (typeof fov === 'number' && Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  public render(
    match: MatchState,
    dt: number,
    timeSec: number,
    useExternalCamera = false,
  ): void {
    this.ensureStageBuilt(match.stage);
    this.ensureRigsBuilt(match);

    // Update stickman poses with smooth joint damping
    if (this.rigs) {
      animateStickmanRig(this.rigs[0], match.fighters[0], dt);
      animateStickmanRig(this.rigs[1], match.fighters[1], dt);
    }

    // Clear transient dynamic VFX group recursively
    while (this.dynamicGroup.children.length > 0) {
      const obj = this.dynamicGroup.children[0];
      this.dynamicGroup.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        } else if (child instanceof THREE.Sprite) {
          child.material.dispose();
        }
      });
    }

    // Render multi-layered 3D projectiles
    for (const p of match.projectiles) {
      const grp = new THREE.Group();
      grp.position.set(p.x, p.y, p.z);
      const yaw = Math.atan2(p.vx, p.vz);

      if (p.kind === 'fireball') {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 0.58, 12, 10),
          new THREE.MeshBasicMaterial({ color: '#fff8d4' }),
        );
        grp.add(core);

        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 1.05, 14, 12),
          new THREE.MeshStandardMaterial({
            color: p.color,
            emissive: p.accentColor,
            emissiveIntensity: 0.95,
            transparent: true,
            opacity: 0.72,
            roughness: 0.2,
          }),
        );
        grp.add(shell);

        for (let r = 0; r < 2; r++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(p.radius * (1.28 + r * 0.22), 0.08, 6, 20),
            new THREE.MeshBasicMaterial({
              color: r === 0 ? '#ffcf5c' : p.accentColor,
              transparent: true,
              opacity: 0.85,
            }),
          );
          ring.rotation.set(timeSec * (8 + r * 4), timeSec * 6 * (r === 0 ? 1 : -1), r * 1.1);
          grp.add(ring);
        }
      } else if (p.kind === 'arcbolt') {
        grp.rotation.y = yaw;
        // Glowing crescent sword wave arc
        const crescent = new THREE.Mesh(
          new THREE.TorusGeometry(1.15, 0.11, 8, 20, Math.PI * 0.82),
          new THREE.MeshBasicMaterial({ color: p.accentColor }),
        );
        crescent.rotation.set(Math.PI * 0.5, 0, -Math.PI * 0.41);
        grp.add(crescent);

        const coreBeam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.14, 1.9, 8),
          new THREE.MeshBasicMaterial({ color: '#ffffff' }),
        );
        coreBeam.rotation.x = Math.PI * 0.5;
        grp.add(coreBeam);

        const fin = new THREE.Mesh(
          new THREE.ConeGeometry(0.32, 1.5, 4),
          new THREE.MeshBasicMaterial({
            color: '#9ee8ff',
            transparent: true,
            opacity: 0.55,
          }),
        );
        fin.rotation.x = -Math.PI * 0.5;
        fin.position.z = -0.3;
        grp.add(fin);
      } else if (p.kind === 'iceshard') {
        grp.rotation.y = yaw;
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 1.25, 6),
          new THREE.MeshStandardMaterial({
            color: p.accentColor,
            emissive: '#9ef0ff',
            emissiveIntensity: 0.6,
            roughness: 0.12,
            metalness: 0.2,
          }),
        );
        tip.rotation.x = Math.PI * 0.5;
        tip.position.z = 0.22;
        grp.add(tip);

        const tail = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 0.55, 6),
          new THREE.MeshBasicMaterial({ color: '#d8f8ff' }),
        );
        tail.rotation.x = -Math.PI * 0.5;
        tail.position.z = -0.65;
        grp.add(tail);

        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(0.36, 0.045, 6, 6),
          new THREE.MeshBasicMaterial({ color: '#e6fbff' }),
        );
        collar.rotation.z = timeSec * 10;
        grp.add(collar);
      } else if (p.kind === 'cyberpacket') {
        // Spinning glowing data cube + inner core + orbital binary ring
        const outerCube = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.68, 0.68),
          new THREE.MeshStandardMaterial({
            color: p.color,
            emissive: p.accentColor,
            emissiveIntensity: 0.75,
            transparent: true,
            opacity: 0.75,
            roughness: 0.2,
          }),
        );
        outerCube.rotation.set(timeSec * 8, timeSec * 11, timeSec * 5);
        grp.add(outerCube);

        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.36, 0),
          new THREE.MeshBasicMaterial({ color: '#e4fff0' }),
        );
        core.rotation.set(-timeSec * 10, timeSec * 6, 0);
        grp.add(core);

        const dataRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.74, 0.055, 6, 16),
          new THREE.MeshBasicMaterial({ color: p.accentColor }),
        );
        dataRing.rotation.set(timeSec * 9, timeSec * 5, 0);
        grp.add(dataRing);
      } else {
        // Boulder Hurl: tumbling jagged molten-veined stone boulder
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(p.radius * 0.95, 0),
          new THREE.MeshStandardMaterial({
            color: '#5a4632',
            emissive: p.color,
            emissiveIntensity: 0.22,
            roughness: 0.82,
          }),
        );
        rock.rotation.set(timeSec * 9, timeSec * 6, timeSec * 4);
        grp.add(rock);

        const magmaCore = new THREE.Mesh(
          new THREE.OctahedronGeometry(p.radius * 0.65, 0),
          new THREE.MeshBasicMaterial({
            color: p.accentColor,
            transparent: true,
            opacity: 0.55,
          }),
        );
        magmaCore.rotation.set(-timeSec * 6, timeSec * 8, 0);
        grp.add(magmaCore);
      }
      this.dynamicGroup.add(grp);
    }

    // Render multi-layered 3D hazard zones
    for (const h of match.hazards) {
      const alpha = Math.min(1, h.life / 0.25);
      if (h.warmup > 0) {
        const pulse = 0.88 + Math.sin(timeSec * 18) * 0.1;
        const outerRing = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.85, h.radius, 28),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
          }),
        );
        outerRing.rotation.x = -Math.PI * 0.5;
        outerRing.position.set(h.x, h.y + 0.04, h.z);
        this.dynamicGroup.add(outerRing);

        const innerRing = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.35 * pulse, h.radius * 0.5 * pulse, 24),
          new THREE.MeshBasicMaterial({
            color: '#fff6d6',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65,
          }),
        );
        innerRing.rotation.x = -Math.PI * 0.5;
        innerRing.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(innerRing);

        const beacon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.22, 6, 8),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            transparent: true,
            opacity: 0.32,
          }),
        );
        beacon.position.set(h.x, h.y + 3, h.z);
        this.dynamicGroup.add(beacon);
        continue;
      }

      if (h.kind === 'cyclone') {
        for (let r = 0; r < 5; r++) {
          const torus = new THREE.Mesh(
            new THREE.TorusGeometry(0.65 + r * 0.42, 0.1, 8, 24),
            new THREE.MeshBasicMaterial({
              color: r % 2 === 0 ? h.accentColor : '#d8ffec',
              transparent: true,
              opacity: 0.78 * alpha,
            }),
          );
          torus.rotation.x = Math.PI * 0.5 + Math.sin(timeSec * 14 + r) * 0.14;
          torus.position.set(
            h.x + Math.cos(timeSec * 12 + r) * 0.18,
            h.y + 0.4 + r * 0.95,
            h.z + Math.sin(timeSec * 12 + r) * 0.18,
          );
          this.dynamicGroup.add(torus);
        }
        const dustRing = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.65, h.radius * 1.05, 24),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.42 * alpha,
          }),
        );
        dustRing.rotation.x = -Math.PI * 0.5;
        dustRing.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(dustRing);
      } else if (h.kind === 'inferno_pillar') {
        const coreBeam = new THREE.Mesh(
          new THREE.CylinderGeometry(h.radius * 0.28, h.radius * 0.42, h.height, 12),
          new THREE.MeshBasicMaterial({
            color: '#fff6cc',
            transparent: true,
            opacity: 0.85 * alpha,
          }),
        );
        coreBeam.position.set(h.x, h.y + h.height * 0.5, h.z);
        this.dynamicGroup.add(coreBeam);

        const outerFlame = new THREE.Mesh(
          new THREE.CylinderGeometry(h.radius * 0.65, h.radius * 0.92, h.height, 14, 1, true),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.62 * alpha,
          }),
        );
        outerFlame.position.set(h.x, h.y + h.height * 0.5, h.z);
        this.dynamicGroup.add(outerFlame);

        for (let r = 0; r < 4; r++) {
          const climb = ((timeSec * 2.8 + r * 0.25) % 1) * h.height * 0.7;
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(h.radius * (0.95 - climb / (h.height * 1.4)), 0.12, 8, 22),
            new THREE.MeshBasicMaterial({
              color: r % 2 === 0 ? '#ffd059' : '#ff5e3a',
              transparent: true,
              opacity: 0.8 * alpha,
            }),
          );
          ring.rotation.set(Math.PI * 0.5 + 0.16, timeSec * 7 + r, 0);
          ring.position.set(h.x, h.y + 0.4 + climb, h.z);
          this.dynamicGroup.add(ring);
        }

        const scorch = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.4, h.radius * 1.15, 28),
          new THREE.MeshBasicMaterial({
            color: '#ff9038',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.55 * alpha,
          }),
        );
        scorch.rotation.x = -Math.PI * 0.5;
        scorch.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(scorch);
      } else if (h.kind === 'tectonic_spire') {
        const mainSpire = new THREE.Mesh(
          new THREE.ConeGeometry(h.radius * 0.62, h.height * 0.85, 6),
          new THREE.MeshStandardMaterial({
            color: h.color,
            roughness: 0.72,
          }),
        );
        mainSpire.position.set(h.x, h.y + h.height * 0.42, h.z);
        this.dynamicGroup.add(mainSpire);

        for (let s = 0; s < 4; s++) {
          const ang = (s / 4) * Math.PI * 2 + 0.4;
          const shard = new THREE.Mesh(
            new THREE.ConeGeometry(h.radius * 0.36, h.height * 0.55, 5),
            new THREE.MeshStandardMaterial({
              color: s % 2 === 0 ? h.accentColor : '#5e4326',
              roughness: 0.65,
            }),
          );
          shard.position.set(
            h.x + Math.cos(ang) * h.radius * 0.55,
            h.y + h.height * 0.25,
            h.z + Math.sin(ang) * h.radius * 0.55,
          );
          shard.rotation.z = -Math.cos(ang) * 0.32;
          shard.rotation.x = Math.sin(ang) * 0.32;
          this.dynamicGroup.add(shard);
        }

        const magmaRing = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.75, h.radius * 1.25, 22),
          new THREE.MeshBasicMaterial({
            color: '#ffbe4d',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75 * alpha,
          }),
        );
        magmaRing.rotation.x = -Math.PI * 0.5;
        magmaRing.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(magmaRing);
      } else if (h.kind === 'thunder_strike') {
        // Jagged 4-segment lightning bolt + shock rings
        const segCount = 4;
        const segH = h.height / segCount;
        let prevX = h.x;
        let prevZ = h.z;
        for (let s = 0; s < segCount; s++) {
          const nextX = s === segCount - 1 ? h.x : h.x + Math.sin(timeSec * 45 + s * 2.1) * 0.55;
          const nextZ = s === segCount - 1 ? h.z : h.z + Math.cos(timeSec * 38 + s * 1.7) * 0.45;
          const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.24, segH * 1.12, 6),
            new THREE.MeshBasicMaterial({
              color: s % 2 === 0 ? '#ffffff' : '#8ce3ff',
              transparent: true,
              opacity: 0.94 * alpha,
            }),
          );
          seg.position.set((prevX + nextX) * 0.5, h.y + (s + 0.5) * segH, (prevZ + nextZ) * 0.5);
          seg.rotation.z = -(nextX - prevX) * 0.35;
          seg.rotation.x = (nextZ - prevZ) * 0.35;
          this.dynamicGroup.add(seg);
          prevX = nextX;
          prevZ = nextZ;
        }
        const shockRing = new THREE.Mesh(
          new THREE.TorusGeometry(h.radius * 0.95, 0.14, 8, 24),
          new THREE.MeshBasicMaterial({
            color: '#9ee8ff',
            transparent: true,
            opacity: 0.85 * alpha,
          }),
        );
        shockRing.rotation.x = Math.PI * 0.5;
        shockRing.position.set(h.x, h.y + 0.18, h.z);
        this.dynamicGroup.add(shockRing);
      } else if (h.kind === 'meteor_ring' || h.kind === 'frost_nova') {
        const progress = 1 - h.life / h.maxLife;
        const rad = h.radius * (0.35 + progress * 0.82);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(rad, 0.22 * alpha + 0.04, 8, 28),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            transparent: true,
            opacity: 0.88 * alpha,
          }),
        );
        ring.rotation.x = Math.PI * 0.5;
        ring.position.set(h.x, h.y + 0.25, h.z);
        this.dynamicGroup.add(ring);

        const disc = new THREE.Mesh(
          new THREE.RingGeometry(rad * 0.35, rad, 24),
          new THREE.MeshBasicMaterial({
            color: h.kind === 'frost_nova' ? '#dffaff' : '#ffd25c',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.35 * alpha,
          }),
        );
        disc.rotation.x = -Math.PI * 0.5;
        disc.position.set(h.x, h.y + 0.06, h.z);
        this.dynamicGroup.add(disc);

        // 6 radial elemental spikes around the blast perimeter
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + progress * 0.6;
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.24, 1.15 * alpha + 0.3, 5),
            new THREE.MeshBasicMaterial({
              color: k % 2 === 0 ? '#ffffff' : h.accentColor,
              transparent: true,
              opacity: 0.82 * alpha,
            }),
          );
          spike.position.set(h.x + Math.cos(ang) * rad, h.y + 0.45, h.z + Math.sin(ang) * rad);
          spike.rotation.z = -Math.cos(ang) * 0.55;
          spike.rotation.x = Math.sin(ang) * 0.55;
          this.dynamicGroup.add(spike);
        }
      } else if (h.kind === 'blizzard_storm') {
        const dome = new THREE.Mesh(
          new THREE.CylinderGeometry(h.radius, h.radius, h.height * 0.6, 22, 1, true),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.28 * alpha,
          }),
        );
        dome.position.set(h.x, h.y + h.height * 0.3, h.z);
        this.dynamicGroup.add(dome);

        // Orbiting 3D ice crystals inside the blizzard
        for (let c = 0; c < 6; c++) {
          const ang = timeSec * 4.2 + (c / 6) * Math.PI * 2;
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.42, 0),
            new THREE.MeshStandardMaterial({
              color: '#b8f2ff',
              emissive: h.accentColor,
              emissiveIntensity: 0.5,
              roughness: 0.12,
              transparent: true,
              opacity: 0.88 * alpha,
            }),
          );
          crystal.position.set(
            h.x + Math.cos(ang) * h.radius * 0.72,
            h.y + 0.9 + ((c % 3) * 0.95) + Math.sin(timeSec * 5 + c) * 0.25,
            h.z + Math.sin(ang) * h.radius * 0.72,
          );
          crystal.rotation.set(timeSec * 3, ang, 0);
          this.dynamicGroup.add(crystal);
        }

        const frostFloor = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.2, h.radius * 1.02, 28),
          new THREE.MeshBasicMaterial({
            color: '#d9f8ff',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4 * alpha,
          }),
        );
        frostFloor.rotation.x = -Math.PI * 0.5;
        frostFloor.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(frostFloor);
      } else if (h.kind === 'hack_grid') {
        const gridRing = new THREE.Mesh(
          new THREE.RingGeometry(h.radius * 0.68, h.radius, 6),
          new THREE.MeshBasicMaterial({
            color: h.accentColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.78 * alpha,
          }),
        );
        gridRing.rotation.set(-Math.PI * 0.5, 0, timeSec * 2.5);
        gridRing.position.set(h.x, h.y + 0.05, h.z);
        this.dynamicGroup.add(gridRing);

        // 4 holographic terminal slabs rising around breach zone
        for (let b = 0; b < 4; b++) {
          const ang = (b / 4) * Math.PI * 2 + timeSec * 1.8;
          const slab = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, h.height * 0.48, 0.08),
            new THREE.MeshBasicMaterial({
              color: b % 2 === 0 ? h.accentColor : '#38f28d',
              transparent: true,
              opacity: 0.58 * alpha,
            }),
          );
          slab.position.set(
            h.x + Math.cos(ang) * h.radius * 0.72,
            h.y + h.height * 0.24 + Math.sin(timeSec * 8 + b) * 0.2,
            h.z + Math.sin(ang) * h.radius * 0.72,
          );
          slab.rotation.y = -ang + Math.PI * 0.5;
          this.dynamicGroup.add(slab);
        }
      } else if (h.kind === 'system_override') {
        const shrink = 0.45 + 0.55 * (h.life / h.maxLife);
        const cageRad = h.radius * shrink;

        // 4 constricting neon laser firewall walls closing inward
        for (let w = 0; w < 4; w++) {
          const ang = (w / 4) * Math.PI * 2 + timeSec * 1.4;
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(cageRad * 1.45, h.height * 0.58, 0.08),
            new THREE.MeshBasicMaterial({
              color: w % 2 === 0 ? '#7dffb3' : '#2ee07d',
              transparent: true,
              opacity: 0.44 * alpha,
            }),
          );
          wall.position.set(
            h.x + Math.cos(ang) * cageRad * 0.72,
            h.y + h.height * 0.29,
            h.z + Math.sin(ang) * cageRad * 0.72,
          );
          wall.rotation.y = -ang + Math.PI * 0.5;
          this.dynamicGroup.add(wall);
        }

        const coreBeam = new THREE.Mesh(
          new THREE.CylinderGeometry(cageRad * 0.22, cageRad * 0.32, h.height, 8),
          new THREE.MeshBasicMaterial({
            color: '#d8ffea',
            transparent: true,
            opacity: 0.78 * alpha,
          }),
        );
        coreBeam.position.set(h.x, h.y + h.height * 0.5, h.z);
        this.dynamicGroup.add(coreBeam);

        for (let r = 0; r < 3; r++) {
          const dropY = ((1 - ((timeSec * 2.8 + r * 0.33) % 1)) * h.height * 0.65);
          const scanRing = new THREE.Mesh(
            new THREE.TorusGeometry(cageRad * 0.85, 0.1, 6, 4),
            new THREE.MeshBasicMaterial({
              color: '#9cffc7',
              transparent: true,
              opacity: 0.88 * alpha,
            }),
          );
          scanRing.rotation.set(Math.PI * 0.5, 0, timeSec * 4 + r);
          scanRing.position.set(h.x, h.y + 0.5 + dropY, h.z);
          this.dynamicGroup.add(scanRing);
        }
      }
    }

    // Render Hecker's remote System Hijack cyber tethers
    for (const te of match.tethers) {
      const alpha = Math.max(0, te.life / te.maxLife);
      const dx = te.toX - te.fromX;
      const dy = te.toY - te.fromY;
      const dz = te.toZ - te.fromZ;
      const len = Math.max(0.1, Math.hypot(dx, dy, dz));
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.11, len, 6),
        new THREE.MeshBasicMaterial({
          color: te.color,
          transparent: true,
          opacity: 0.9 * alpha,
        }),
      );
      beam.position.set((te.fromX + te.toX) * 0.5, (te.fromY + te.toY) * 0.5, (te.fromZ + te.toZ) * 0.5);
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len),
      );
      this.dynamicGroup.add(beam);

      if (te.connected) {
        const lockRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.15 * (1.2 - alpha * 0.3), 0.08, 6, 16),
          new THREE.MeshBasicMaterial({
            color: '#d9ffea',
            transparent: true,
            opacity: alpha,
          }),
        );
        lockRing.rotation.set(Math.PI * 0.5, 0, timeSec * 6);
        lockRing.position.set(te.toX, te.toY, te.toZ);
        this.dynamicGroup.add(lockRing);
      }
    }

    // Render 3D melee slash arcs
    for (const s of match.slashes) {
      const alpha = Math.max(0, s.life / s.maxLife);
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(s.radius, 0.11, 6, 18, Math.PI * 0.9),
        new THREE.MeshBasicMaterial({
          color: s.color,
          transparent: true,
          opacity: alpha,
        }),
      );
      arc.position.set(s.x, s.y, s.z);
      arc.rotation.set(Math.PI * 0.5 + s.tilt, s.facingAngle - Math.PI * 0.45, 0);
      this.dynamicGroup.add(arc);
    }

    // Render 3D high-combo impact flashes & starburst shockwaves
    for (const fl of match.impactFlashes) {
      const alpha = Math.max(0, fl.life / fl.maxLife);
      const progress = 1 - alpha;

      // Bright incandescent core flash
      const coreRadius = Math.max(0.12, (0.65 - progress * 0.45) * fl.intensity);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(coreRadius, 12, 10),
        new THREE.MeshBasicMaterial({
          color: '#fff9e6',
          transparent: true,
          opacity: alpha * 0.95,
          depthWrite: false,
        }),
      );
      core.position.set(fl.x, fl.y, fl.z);
      this.dynamicGroup.add(core);

      // Expanding kinetic shockwave ring
      const ringRadius = fl.radius * (0.25 + progress * 0.92);
      const shockRing = new THREE.Mesh(
        new THREE.TorusGeometry(ringRadius, 0.14 * alpha + 0.03, 8, 26),
        new THREE.MeshBasicMaterial({
          color: fl.accentColor,
          transparent: true,
          opacity: alpha * 0.9,
          depthWrite: false,
        }),
      );
      shockRing.position.set(fl.x, fl.y, fl.z);
      shockRing.rotation.set(0.35, fl.angle, 0.25);
      this.dynamicGroup.add(shockRing);

      // 4 radial starburst spikes shooting outward
      const spikeDist = 0.35 + progress * fl.radius * 0.85;
      const spikeLen = (0.95 - progress * 0.35) * fl.intensity;
      for (let k = 0; k < 4; k++) {
        const a = fl.angle + k * (Math.PI * 0.5);
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.16 * alpha + 0.04, spikeLen, 4),
          new THREE.MeshBasicMaterial({
            color: k % 2 === 0 ? '#fff6d6' : fl.accentColor,
            transparent: true,
            opacity: alpha * 0.92,
            depthWrite: false,
          }),
        );
        spike.position.set(
          fl.x + Math.cos(a) * spikeDist,
          fl.y + Math.sin(a) * spikeDist * 0.72,
          fl.z + Math.sin(a) * spikeDist * 0.35,
        );
        spike.rotation.z = a - Math.PI * 0.5;
        this.dynamicGroup.add(spike);
      }
    }

    // Render 3D particles (scaled by particleDensity setting)
    const sizeBoost = this.particleDensity === 'high' ? 1.2 : this.particleDensity === 'low' ? 0.85 : 1.0;
    for (let i = 0; i < match.particles.length; i++) {
      if (this.particleDensity === 'low' && i % 2 === 1) continue;
      const pt = match.particles[i];
      const alpha = Math.max(0, pt.life / pt.maxLife);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(pt.size * alpha * sizeBoost, 6, 6),
        new THREE.MeshBasicMaterial({
          color: pt.color,
          transparent: true,
          opacity: alpha,
        }),
      );
      dot.position.set(pt.x, pt.y, pt.z);
      this.dynamicGroup.add(dot);
    }

    // Floating 3D damage / event sprites
    for (const fe of match.floatingEvents) {
      const tex = this.getTextSpriteTex(fe.text, fe.color);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: Math.min(1, fe.life / 0.25),
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(fe.x, fe.y, fe.z);
      sprite.scale.set(2.4, 0.9, 1);
      this.dynamicGroup.add(sprite);
    }

    if (!useExternalCamera) {
      // Fallback internal framing when no external camera controller drives view
      const [f1, f2] = match.fighters;
      const midX = (f1.x + f2.x) * 0.5;
      const midY = (f1.y + f2.y) * 0.45 + 1.85;
      const midZ = (f1.z + f2.z) * 0.5;
      const sep = Math.hypot(f1.x - f2.x, f1.z - f2.z);

      const isPortrait = this.camera.aspect < 1.05;
      const baseDist = isPortrait ? 13.5 : 11.2;
      const camDist = THREE.MathUtils.clamp(baseDist + sep * (isPortrait ? 0.85 : 0.62), 11.5, 25);
      const camHeight = camDist * 0.46 + 1.4;

      _targetCamPos.set(midX * 0.82, midY + camHeight - 1.5, midZ + camDist);
      _targetLook.set(midX, midY, midZ);

      const dampFactor = Math.min(0.033, Math.max(0.001, dt));
      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, _targetCamPos.x, 7, dampFactor);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, _targetCamPos.y, 7, dampFactor);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, _targetCamPos.z, 7, dampFactor);

      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, _targetLook.x, 9, dampFactor);
      this.camLook.y = THREE.MathUtils.damp(this.camLook.y, _targetLook.y, 9, dampFactor);
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, _targetLook.z, 9, dampFactor);

      _vec3.copy(this.camPos);
      if (match.shakeIntensity > 0.01) {
        _vec3.x += (Math.random() - 0.5) * match.shakeIntensity;
        _vec3.y += (Math.random() - 0.5) * match.shakeIntensity;
      }

      this.camera.position.copy(_vec3);
      this.camera.lookAt(this.camLook);
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.spriteCache.forEach((tex) => tex.dispose());
    this.spriteCache.clear();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
