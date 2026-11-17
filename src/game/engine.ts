import { ARENA_HALF_X, ARENA_HALF_Z, FIGHTERS, FLOOR_Y, STAGES } from './fighters';
import { soundEngine } from './audio';
import { selectIntroDialogue } from './dialogue';
import { computeDamage, computeVariableKnockback, resolveRoundWinner } from './rules';
import type {
  BotDifficulty,
  FighterId,
  FighterRuntime,
  FighterSpec,
  GameMode,
  HudSnapshot,
  InputState,
  MatchState,
  StageId,
} from './types';

const GRAVITY = 38;
const ROUND_DURATION = 99;

export function nextMatchRandom(match: MatchState): number {
  let t = (match.rngState = (match.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createFighterRuntime(
  slot: 1 | 2,
  spec: FighterSpec,
  x: number,
  z: number,
  facingAngle: number,
): FighterRuntime {
  return {
    slot,
    spec,
    x,
    y: FLOOR_Y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    facingAngle,
    hp: spec.maxHp,
    trailHp: spec.maxHp,
    energy: 0,
    grounded: true,
    jumpsLeft: 2,
    dropThroughTimer: 0,
    action: 'idle',
    actionTimer: 0,
    actionDuration: 0,
    actionHasHit: false,
    comboStep: 0,
    comboWindow: 0,
    cdPower1: 0,
    cdPower2: 0,
    cdDash: 0,
    invulnTimer: 0,
    hitFlashTimer: 0,
    shieldTimer: 0,
    counterArmed: false,
    slowTimer: 0,
    frozenTimer: 0,
    damageDealt: 0,
    powersLanded: 0,
    currentComboCount: 0,
    maxCombo: 0,
    comboResetTimer: 0,
    animTime: slot === 1 ? 0 : 1.7,
    multiHitStage: 0,
  };
}

export function createMatch(options: {
  p1Id: FighterId;
  p2Id: FighterId;
  stageId: StageId;
  mode: GameMode;
  difficulty: BotDifficulty;
  attractMode?: boolean;
  roundDuration?: number;
  roundsToWin?: number;
  showFloatingEvents?: boolean;
  seed?: number;
}): MatchState {
  const f1Spec = FIGHTERS[options.p1Id];
  const f2Spec = FIGHTERS[options.p2Id];
  const stage = STAGES[options.stageId];
  const roundDuration = options.roundDuration ?? ROUND_DURATION;
  const roundsToWin = options.roundsToWin ?? 2;
  const showFloatingEvents = options.showFloatingEvents ?? true;
  const seed = (options.seed ?? 1) >>> 0 || 1;

  const f1 = createFighterRuntime(1, f1Spec, -4.6, 0.4, Math.PI * 0.5);
  const f2 = createFighterRuntime(2, f2Spec, 4.6, -0.4, -Math.PI * 0.5);

  const match: MatchState = {
    mode: options.mode,
    difficulty: options.difficulty,
    stage,
    fighters: [f1, f2],
    projectiles: [],
    hazards: [],
    particles: [],
    slashes: [],
    impactFlashes: [],
    tethers: [],
    floatingEvents: [],
    roundNumber: 1,
    roundsToWin,
    roundWins: [0, 0],
    roundDuration,
    roundTimeLeft: roundDuration,
    elapsedMatchTime: 0,
    showFloatingEvents,
    phase: options.attractMode ? 'fight' : 'intro',
    phaseTimer: options.attractMode ? 0 : 4.25,
    bannerText: '',
    introDialogue: null,
    winnerSlot: null,
    winReason: '',
    hitstopTimer: 0,
    shakeIntensity: 0,
    nextEntityId: 1,
    seed,
    rngState: seed,
    attractMode: Boolean(options.attractMode),
  };

  if (!options.attractMode) {
    const exchange = selectIntroDialogue(options.p1Id, options.p2Id, () => nextMatchRandom(match));
    match.introDialogue = {
      p1Line: exchange.p1,
      p2Line: exchange.p2,
      activeSpeaker: 1,
    };
    soundEngine.playRoundIntro();
    soundEngine.playDialogueCue(1);
  }

  return match;
}

function resetRound(match: MatchState): void {
  const [old1, old2] = match.fighters;
  const f1 = createFighterRuntime(1, old1.spec, -4.6, 0.4, Math.PI * 0.5);
  const f2 = createFighterRuntime(2, old2.spec, 4.6, -0.4, -Math.PI * 0.5);

  f1.damageDealt = old1.damageDealt;
  f1.maxCombo = old1.maxCombo;
  f1.powersLanded = old1.powersLanded;
  f1.energy = Math.min(40, Math.round(old1.energy * 0.35));

  f2.damageDealt = old2.damageDealt;
  f2.maxCombo = old2.maxCombo;
  f2.powersLanded = old2.powersLanded;
  f2.energy = Math.min(40, Math.round(old2.energy * 0.35));

  match.fighters = [f1, f2];
  match.projectiles = [];
  match.hazards = [];
  match.slashes = [];
  match.impactFlashes = [];
  match.tethers = [];
  match.floatingEvents = [];
  match.roundTimeLeft = match.roundDuration;
  match.phase = 'intro';
  match.phaseTimer = 1.3;
  match.bannerText = `Round ${match.roundNumber}`;
  match.introDialogue = null;
  if (!match.attractMode) soundEngine.playRoundIntro();
}

function spawnParticles3D(
  match: MatchState,
  x: number,
  y: number,
  z: number,
  color: string,
  count: number,
  speedRange: [number, number],
  gravity = 12,
  sizeRange: [number, number] = [0.12, 0.28],
): void {
  for (let i = 0; i < count; i++) {
    const theta = nextMatchRandom(match) * Math.PI * 2;
    const phi = (nextMatchRandom(match) - 0.3) * Math.PI;
    const speed = speedRange[0] + nextMatchRandom(match) * (speedRange[1] - speedRange[0]);
    const life = 0.25 + nextMatchRandom(match) * 0.35;
    match.particles.push({
      x,
      y,
      z,
      vx: Math.cos(theta) * Math.cos(phi) * speed,
      vy: Math.abs(Math.sin(phi)) * speed + 2.2,
      vz: Math.sin(theta) * Math.cos(phi) * speed,
      size: sizeRange[0] + nextMatchRandom(match) * (sizeRange[1] - sizeRange[0]),
      life,
      maxLife: life,
      color,
      gravity,
    });
  }
}

function spawnFloatingEvent(
  match: MatchState,
  x: number,
  y: number,
  z: number,
  text: string,
  color: string,
): void {
  if (match.attractMode || !match.showFloatingEvents) return;
  match.floatingEvents.push({
    id: match.nextEntityId++,
    x,
    y,
    z,
    text,
    color,
    life: 0.72,
    maxLife: 0.72,
  });
}

function dirToTarget(from: { x: number; z: number }, to: { x: number; z: number }): [number, number] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return [1, 0];
  return [dx / len, dz / len];
}

function applyHit(
  match: MatchState,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  rawDamage: number,
  kbSpeed: number,
  kbY: number,
  kbDirX: number,
  kbDirZ: number,
  isMelee: boolean,
  isPower: boolean,
  options?: {
    freezeDuration?: number;
    slowDuration?: number;
    heavyImpact?: boolean;
  },
): void {
  if (defender.action === 'ko' || defender.invulnTimer > 0) return;

  const outcome = computeDamage(rawDamage, defender, isMelee, attacker.slot, defender.slot);

  if (outcome.countered) {
    defender.counterArmed = false;
    defender.action = 'idle';
    defender.actionTimer = 0;
    defender.invulnTimer = 0.35;
    if (!match.attractMode) soundEngine.playCounter();
    spawnFloatingEvent(match, defender.x, defender.y + 3.6, defender.z, 'COUNTER!', '#8ad8ff');
    spawnParticles3D(match, defender.x, defender.y + 1.6, defender.z, '#8ad8ff', 22, [4, 11], 4);

    if (Math.hypot(attacker.x - defender.x, attacker.z - defender.z) < 5.8) {
      const [cx, cz] = dirToTarget(defender, attacker);
      applyHit(
        match,
        defender,
        attacker,
        defender.spec.power2.damage,
        12,
        7.5,
        cx,
        cz,
        false,
        true,
        { heavyImpact: true },
      );
    }
    return;
  }

  defender.hp = Math.max(0, defender.hp - outcome.finalDamage);
  defender.hitFlashTimer = 0.12;
  attacker.damageDealt += outcome.finalDamage;

  const kbScaling = computeVariableKnockback(
    defender.hp,
    defender.spec.maxHp,
    outcome.blocked,
    outcome.knockbackScale,
  );
  // Keep pull moves (negative kbSpeed, e.g. System Hijack) controlled so they don't fling past the caster
  const horizScale =
    kbSpeed < 0
      ? outcome.knockbackScale * (0.95 + kbScaling.damageRatio * 0.2)
      : kbScaling.horizontalScale;

  if (isPower && !outcome.blocked) {
    attacker.powersLanded += 1;
  }

  const prevAttackerEnergy = attacker.energy;
  const prevDefenderEnergy = defender.energy;
  attacker.energy = Math.min(100, attacker.energy + (outcome.blocked ? 5 : isMelee ? 10 : 14));
  defender.energy = Math.min(100, defender.energy + 9);

  if (!match.attractMode) {
    if (
      (prevAttackerEnergy < 100 && attacker.energy >= 100 && (attacker.slot === 1 || match.mode === '2p')) ||
      (prevDefenderEnergy < 100 && defender.energy >= 100 && (defender.slot === 1 || match.mode === '2p'))
    ) {
      soundEngine.playUltReady();
    }
  }

  if (outcome.blocked) {
    if (!match.attractMode) soundEngine.playBlock();
    defender.vx = kbDirX * kbSpeed * horizScale;
    defender.vz = kbDirZ * kbSpeed * horizScale;
    spawnParticles3D(match, defender.x, defender.y + 1.6, defender.z, '#f5efe6', 8, [3, 7], 6);
    spawnFloatingEvent(
      match,
      defender.x,
      defender.y + 3.4,
      defender.z,
      `-${outcome.finalDamage} BLOCK`,
      '#b9c4cf',
    );
    return;
  }

  attacker.currentComboCount += 1;
  attacker.comboResetTimer = 1.65;
  if (attacker.currentComboCount > attacker.maxCombo) {
    attacker.maxCombo = attacker.currentComboCount;
  }

  if (!match.attractMode) {
    soundEngine.playHit(Boolean(options?.heavyImpact), attacker.currentComboCount);
  }

  const appliedKbSpeed = kbSpeed * horizScale;
  defender.vx = kbDirX * appliedKbSpeed;
  defender.vz = kbDirZ * appliedKbSpeed;
  if (kbY > 0) {
    const scaledKbY = Math.min(20.5, kbY * kbScaling.verticalScale);
    defender.vy = Math.max(defender.vy, scaledKbY);
    defender.grounded = false;
  }

  if (options?.slowDuration) {
    defender.slowTimer = Math.max(defender.slowTimer, options.slowDuration);
  }

  if (options?.freezeDuration && defender.hp > 0) {
    defender.frozenTimer = options.freezeDuration;
    defender.action = 'frozen';
    defender.actionTimer = options.freezeDuration;
    defender.actionDuration = options.freezeDuration;
    if (!match.attractMode) soundEngine.playFreeze();
    spawnFloatingEvent(match, defender.x, defender.y + 3.8, defender.z, 'FROZEN!', '#9ce8ff');
  } else if (defender.hp > 0 && defender.shieldTimer <= 0) {
    defender.action = 'hitstun';
    const launchBonus = Math.min(0.12, Math.abs(appliedKbSpeed) * 0.0045);
    defender.actionTimer =
      (options?.heavyImpact ? 0.28 : 0.19) +
      kbScaling.damageRatio * (options?.heavyImpact ? 0.22 : 0.14) +
      launchBonus;
    defender.actionDuration = defender.actionTimer;
    defender.counterArmed = false;
  }

  const hitX = (attacker.x + defender.x) * 0.5 + (defender.x - attacker.x) * 0.28;
  const hitY = defender.y + 1.72;
  const hitZ = (attacker.z + defender.z) * 0.5 + (defender.z - attacker.z) * 0.28;

  const isHeavyLaunch = kbScaling.damageRatio >= 0.6 && appliedKbSpeed >= 14.5;
  const isHighCombo =
    attacker.currentComboCount >= 3 ||
    (isMelee && attacker.action === 'attack3' && attacker.currentComboCount >= 2);
  const comboIntensity = isHighCombo
    ? Math.min(1.75, 1 + Math.max(0, attacker.currentComboCount - 3) * 0.18)
    : 0;

  if (options?.heavyImpact || isHighCombo || isHeavyLaunch) {
    match.hitstopTimer = Math.max(
      match.hitstopTimer,
      isHighCombo ? 0.048 + comboIntensity * 0.014 : isHeavyLaunch ? 0.062 : 0.05,
    );
    match.shakeIntensity = Math.max(
      match.shakeIntensity,
      isHighCombo ? 0.30 + comboIntensity * 0.12 : isHeavyLaunch ? 0.42 : 0.35,
    );
  } else {
    match.hitstopTimer = Math.max(match.hitstopTimer, 0.022);
    match.shakeIntensity = Math.max(match.shakeIntensity, 0.16);
  }

  if (isHeavyLaunch && defender.hp > 0) {
    spawnParticles3D(match, hitX, hitY, hitZ, '#fff2cf', 12, [6, 14], 4, [0.12, 0.28]);
  }

  if (isHighCombo) {
    match.impactFlashes.push({
      x: hitX,
      y: hitY,
      z: hitZ,
      radius: 1.85 + comboIntensity * 0.65,
      life: 0.24,
      maxLife: 0.24,
      color: attacker.spec.color,
      accentColor: attacker.spec.accentColor,
      intensity: comboIntensity,
      angle: nextMatchRandom(match) * Math.PI * 2,
    });

    // High-velocity incandescent core + elemental burst sparks at the hit location
    spawnParticles3D(
      match,
      hitX,
      hitY,
      hitZ,
      '#fff7de',
      Math.round(12 + comboIntensity * 6),
      [7, 17],
      6,
      [0.14, 0.34],
    );
    spawnParticles3D(
      match,
      hitX,
      hitY,
      hitZ,
      attacker.spec.accentColor,
      Math.round(14 + comboIntensity * 8),
      [6, 15],
      10,
      [0.16, 0.36],
    );
  } else {
    spawnParticles3D(
      match,
      hitX,
      hitY,
      hitZ,
      attacker.spec.accentColor,
      options?.heavyImpact ? 18 : 10,
      [4, 10],
      14,
    );
  }

  spawnFloatingEvent(
    match,
    defender.x,
    defender.y + 3.5,
    defender.z,
    `-${outcome.finalDamage}`,
    isHighCombo || options?.heavyImpact || isHeavyLaunch ? '#ffca64' : '#f7f3eb',
  );

  if (defender.hp <= 0) {
    const koSpeed = kbSpeed < 0 ? 12 : Math.max(14, appliedKbSpeed * 1.15);
    defender.action = 'ko';
    defender.vx = kbDirX * koSpeed;
    defender.vz = kbDirZ * koSpeed;
    defender.vy = Math.max(12.2, Math.min(18.5, kbY * kbScaling.verticalScale * 1.15));
    defender.grounded = false;
    match.hitstopTimer = 0.13;
    match.shakeIntensity = 0.58;
    if (!match.attractMode) soundEngine.playKO();
  }
}

function triggerPower1(match: MatchState, f: FighterRuntime, foe: FighterRuntime): void {
  f.cdPower1 = f.spec.power1.cooldown;
  f.action = 'power1';
  f.actionTimer = 0.34;
  f.actionDuration = 0.34;
  f.actionHasHit = false;
  const [dx, dz] = dirToTarget(f, foe);
  f.facingAngle = Math.atan2(dx, dz);

  const id = match.nextEntityId++;

  switch (f.spec.id) {
    case 'kael': {
      if (!match.attractMode) soundEngine.playPower('fire');
      match.projectiles.push({
        id,
        ownerSlot: f.slot,
        kind: 'fireball',
        x: f.x + dx * 1.2,
        y: f.y + 1.7,
        z: f.z + dz * 1.2,
        vx: dx * 18.5,
        vy: 0,
        vz: dz * 18.5,
        radius: 0.72,
        damage: f.spec.power1.damage,
        knockbackX: dx * 10,
        knockbackY: 4.5,
        knockbackZ: dz * 10,
        life: 1.5,
        maxLife: 1.5,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
        aoeSplashRadius: 2.4,
        hitIds: [],
      });
      spawnParticles3D(match, f.x + dx, f.y + 1.7, f.z + dz, '#ff9f43', 10, [3, 7], 4);
      break;
    }
    case 'veyra': {
      if (!match.attractMode) soundEngine.playPower('wind');
      f.invulnTimer = 0.24;
      f.vx = dx * 28;
      f.vz = dz * 28;
      f.vy = Math.max(f.vy, 0);
      f.actionTimer = 0.24;
      f.actionDuration = 0.24;
      match.slashes.push({
        x: f.x,
        y: f.y + 1.7,
        z: f.z,
        facingAngle: f.facingAngle,
        radius: 2.8,
        life: 0.24,
        maxLife: 0.24,
        color: f.spec.accentColor,
        tilt: 0.2,
      });
      spawnParticles3D(match, f.x, f.y + 1.6, f.z, f.spec.accentColor, 14, [4, 9], 0);
      break;
    }
    case 'bram': {
      if (!match.attractMode) soundEngine.playPower('earth');
      match.shakeIntensity = Math.max(match.shakeIntensity, 0.24);
      match.projectiles.push({
        id,
        ownerSlot: f.slot,
        kind: 'boulder',
        x: f.x + dx * 1.2,
        y: f.y + 2.2,
        z: f.z + dz * 1.2,
        vx: dx * 13.5,
        vy: 10.5,
        vz: dz * 13.5,
        radius: 1.05,
        damage: f.spec.power1.damage,
        knockbackX: dx * 10,
        knockbackY: 8.8,
        knockbackZ: dz * 10,
        life: 1.4,
        maxLife: 1.4,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
        gravity: 26,
        aoeSplashRadius: 2.6,
        hitIds: [],
      });
      spawnParticles3D(match, f.x + dx, f.y + 1.2, f.z + dz, '#c79246', 14, [4, 8], 18);
      break;
    }
    case 'sora': {
      if (!match.attractMode) soundEngine.playPower('bolt');
      match.projectiles.push({
        id,
        ownerSlot: f.slot,
        kind: 'arcbolt',
        x: f.x + dx * 1.3,
        y: f.y + 1.75,
        z: f.z + dz * 1.3,
        vx: dx * 24,
        vy: 0,
        vz: dz * 24,
        radius: 0.6,
        damage: f.spec.power1.damage,
        knockbackX: dx * 9.5,
        knockbackY: 4,
        knockbackZ: dz * 9.5,
        life: 1.15,
        maxLife: 1.15,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
        piercing: true,
        hitIds: [],
      });
      spawnParticles3D(match, f.x + dx, f.y + 1.7, f.z + dz, '#8ad8ff', 10, [4, 9], 0);
      break;
    }
    case 'lyra': {
      if (!match.attractMode) soundEngine.playPower('frost');
      const baseAngle = Math.atan2(dx, dz);
      const offsets = [-0.22, 0, 0.22];
      for (const a of offsets) {
        const ang = baseAngle + a;
        const speed = 17.5;
        const vx = Math.sin(ang) * speed;
        const vz = Math.cos(ang) * speed;
        match.projectiles.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'iceshard',
          x: f.x + Math.sin(ang) * 1.1,
          y: f.y + 1.7,
          z: f.z + Math.cos(ang) * 1.1,
          vx,
          vy: 0,
          vz,
          radius: 0.5,
          damage: Math.round(f.spec.power1.damage * 0.55),
          knockbackX: Math.sin(ang) * 6,
          knockbackY: 3,
          knockbackZ: Math.cos(ang) * 6,
          life: 1.25,
          maxLife: 1.25,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
          hitIds: [],
          slowDuration: 2.2,
        });
      }
      spawnParticles3D(match, f.x + dx, f.y + 1.7, f.z + dz, '#d9f6ff', 10, [3, 6], 4);
      break;
    }
    case 'hecker': {
      if (!match.attractMode) soundEngine.playPower('cyber');
      const baseAngle = Math.atan2(dx, dz);
      const spreadAngles = [-0.52, 0.52];
      for (const offset of spreadAngles) {
        const ang = baseAngle + offset;
        const speed = 14.5;
        match.projectiles.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'cyberpacket',
          x: f.x + Math.sin(ang) * 1.2,
          y: f.y + 1.75,
          z: f.z + Math.cos(ang) * 1.2,
          vx: Math.sin(ang) * speed,
          vy: 0,
          vz: Math.cos(ang) * speed,
          radius: 0.58,
          damage: Math.round(f.spec.power1.damage * 0.58),
          knockbackX: dx * 5.2,
          knockbackY: 3.0,
          knockbackZ: dz * 5.2,
          life: 1.75,
          maxLife: 1.75,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
          homing: true,
          drainEnergy: 7,
          hitIds: [],
          slowDuration: 1.4,
        });
      }
      spawnFloatingEvent(match, f.x, f.y + 3.4, f.z, 'SWARM.EXE', f.spec.accentColor);
      spawnParticles3D(match, f.x + dx, f.y + 1.7, f.z + dz, '#7dffb3', 12, [3, 8], 2);
      break;
    }
  }
}

function triggerPower2(match: MatchState, f: FighterRuntime, foe: FighterRuntime): void {
  f.cdPower2 = f.spec.power2.cooldown;
  f.action = 'power2';
  f.actionHasHit = false;
  const [dx, dz] = dirToTarget(f, foe);
  f.facingAngle = Math.atan2(dx, dz);

  switch (f.spec.id) {
    case 'kael': {
      if (!match.attractMode) soundEngine.playPower('fire');
      f.vy = 14.5;
      f.vx = dx * 8.5;
      f.vz = dz * 8.5;
      f.grounded = false;
      f.actionTimer = 0.72;
      f.actionDuration = 0.72;
      spawnParticles3D(match, f.x, f.y + 0.4, f.z, '#ffb347', 12, [3, 7], 8);
      break;
    }
    case 'veyra': {
      if (!match.attractMode) soundEngine.playPower('wind');
      f.actionTimer = 0.32;
      f.actionDuration = 0.32;
      const dist = Math.min(4.8, Math.max(2.5, Math.hypot(foe.x - f.x, foe.z - f.z)));
      const tx = Math.max(-ARENA_HALF_X + 1.5, Math.min(ARENA_HALF_X - 1.5, f.x + dx * dist));
      const tz = Math.max(-ARENA_HALF_Z + 1.5, Math.min(ARENA_HALF_Z - 1.5, f.z + dz * dist));
      match.hazards.push({
        id: match.nextEntityId++,
        ownerSlot: f.slot,
        kind: 'cyclone',
        x: tx,
        y: f.y,
        z: tz,
        radius: 2.2,
        height: 5.5,
        damage: Math.round(f.spec.power2.damage / 3),
        knockbackSpeed: 2.5,
        knockbackY: 11.2,
        life: 1.45,
        maxLife: 1.45,
        warmup: 0.08,
        tickInterval: 0.32,
        tickTimer: 0,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
      });
      break;
    }
    case 'bram': {
      if (!match.attractMode) soundEngine.playPower('earth');
      f.shieldTimer = 2.2;
      f.actionTimer = 0.35;
      f.actionDuration = 0.35;
      spawnParticles3D(match, f.x, f.y + 1.6, f.z, '#f5d27a', 18, [4, 9], 12);
      const dist = Math.hypot(foe.x - f.x, foe.z - f.z);
      if (dist < 4.2 && Math.abs(foe.y - f.y) < 3.5) {
        applyHit(match, f, foe, f.spec.power2.damage, 12, 6.2, dx, dz, false, true, {
          heavyImpact: true,
        });
      }
      break;
    }
    case 'sora': {
      if (!match.attractMode) soundEngine.playPower('bolt');
      f.counterArmed = true;
      f.actionTimer = 0.65;
      f.actionDuration = 0.65;
      spawnParticles3D(match, f.x, f.y + 1.6, f.z, '#8ad8ff', 10, [2, 5], 0);
      break;
    }
    case 'lyra': {
      if (!match.attractMode) soundEngine.playPower('frost');
      f.actionTimer = 0.38;
      f.actionDuration = 0.38;
      match.hazards.push({
        id: match.nextEntityId++,
        ownerSlot: f.slot,
        kind: 'frost_nova',
        x: f.x,
        y: f.y,
        z: f.z,
        radius: 4.4,
        height: 3.4,
        damage: f.spec.power2.damage,
        knockbackSpeed: 2.5,
        knockbackY: 4.0,
        life: 0.45,
        maxLife: 0.45,
        warmup: 0.05,
        tickInterval: 1.0,
        tickTimer: 0,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
        freezeDuration: 1.3,
      });
      break;
    }
    case 'hecker': {
      if (!match.attractMode) soundEngine.playPower('cyber');
      f.actionTimer = 0.42;
      f.actionDuration = 0.42;
      const distXZ = Math.hypot(foe.x - f.x, foe.z - f.z);
      const inRange = distXZ <= 10.5 && Math.abs(foe.y - f.y) < 4.5 && foe.action !== 'ko';
      if (inRange) {
        // Remote Laptop Hijack: strips shields/blocks, steals up to 18% Ult energy, slows foe
        const hadGuard = foe.shieldTimer > 0 || foe.action === 'block';
        if (foe.shieldTimer > 0) foe.shieldTimer = 0;
        if (foe.action === 'block') foe.action = 'hitstun';

        const stolen = Math.min(foe.energy, 18);
        foe.energy = Math.max(0, foe.energy - stolen);
        const prevEnergy = f.energy;
        f.energy = Math.min(100, f.energy + stolen);
        if (!match.attractMode && prevEnergy < 100 && f.energy >= 100 && (f.slot === 1 || match.mode === '2p')) {
          soundEngine.playUltReady();
        }

        match.tethers.push({
          fromX: f.x + dx * 0.6,
          fromY: f.y + 1.75,
          fromZ: f.z + dz * 0.6,
          toX: foe.x,
          toY: foe.y + 1.7,
          toZ: foe.z,
          life: 0.42,
          maxLife: 0.42,
          color: f.spec.accentColor,
          connected: true,
        });

        applyHit(match, f, foe, f.spec.power2.damage, -4.5, 4.2, dx, dz, false, true, {
          slowDuration: 1.85,
          heavyImpact: true,
        });
        spawnFloatingEvent(
          match,
          foe.x,
          foe.y + 3.9,
          foe.z,
          hadGuard ? 'GUARD HACKED!' : stolen > 0 ? `HIJACK -${Math.round(stolen)}% ULT` : 'HIJACKED!',
          f.spec.accentColor,
        );
        spawnParticles3D(match, foe.x, foe.y + 1.7, foe.z, '#7dffb3', 18, [4, 9], 2);
      } else {
        match.tethers.push({
          fromX: f.x + dx * 0.6,
          fromY: f.y + 1.75,
          fromZ: f.z + dz * 0.6,
          toX: f.x + dx * 7.0,
          toY: f.y + 1.75,
          toZ: f.z + dz * 7.0,
          life: 0.3,
          maxLife: 0.3,
          color: '#7dffb3',
          connected: false,
        });
        spawnFloatingEvent(match, f.x, f.y + 3.4, f.z, 'OUT OF RANGE', '#94b8a3');
      }
      break;
    }
  }
}

function triggerUltimate(match: MatchState, f: FighterRuntime, foe: FighterRuntime): void {
  f.energy = 0;
  f.invulnTimer = 0.55;
  f.action = 'ultimate';
  f.actionTimer = 0.65;
  f.actionDuration = 0.65;
  f.actionHasHit = false;
  const [dx, dz] = dirToTarget(f, foe);
  f.facingAngle = Math.atan2(dx, dz);

  if (!match.attractMode) soundEngine.playUltimate();
  match.hitstopTimer = 0.07;
  match.shakeIntensity = 0.38;
  spawnFloatingEvent(match, f.x, f.y + 4.1, f.z, f.spec.ultimate.name.toUpperCase(), f.spec.accentColor);

  switch (f.spec.id) {
    case 'kael': {
      // 4-way spiraling solar flame ring around Kael
      const baseAngle = f.facingAngle;
      for (let k = 0; k < 4; k++) {
        const ang = baseAngle + (k / 4) * Math.PI * 2;
        const px = Math.max(-ARENA_HALF_X + 1.2, Math.min(ARENA_HALF_X - 1.2, f.x + Math.sin(ang) * 3.1));
        const pz = Math.max(-ARENA_HALF_Z + 1.2, Math.min(ARENA_HALF_Z - 1.2, f.z + Math.cos(ang) * 3.1));
        match.hazards.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'inferno_pillar',
          x: px,
          y: f.y,
          z: pz,
          radius: 2.35,
          height: 8.5,
          damage: Math.round(f.spec.ultimate.damage / 2),
          knockbackSpeed: 11.5,
          knockbackY: 11.5,
          life: 1.05,
          maxLife: 1.05,
          warmup: 0.14 + k * 0.05,
          tickInterval: 0.35,
          tickTimer: 0,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
        });
      }
      break;
    }
    case 'veyra': {
      // Skybreak Barrage: 3-stage teleport omni-slash blitz around target (driven in updateFighter)
      f.multiHitStage = 0;
      f.actionTimer = 0.72;
      f.actionDuration = 0.72;
      f.invulnTimer = 0.78;
      break;
    }
    case 'bram': {
      // Tectonic Crater: 5-spire pentagonal seismic crater ring around Bram
      match.shakeIntensity = Math.max(match.shakeIntensity, 0.52);
      for (let k = 0; k < 5; k++) {
        const ang = f.facingAngle + (k / 5) * Math.PI * 2;
        const px = Math.max(-ARENA_HALF_X + 1.2, Math.min(ARENA_HALF_X - 1.2, f.x + Math.sin(ang) * 3.8));
        const pz = Math.max(-ARENA_HALF_Z + 1.2, Math.min(ARENA_HALF_Z - 1.2, f.z + Math.cos(ang) * 3.8));
        match.hazards.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'tectonic_spire',
          x: px,
          y: FLOOR_Y,
          z: pz,
          radius: 2.45,
          height: 6.8,
          damage: Math.round(f.spec.ultimate.damage * 0.62),
          knockbackSpeed: 12.5,
          knockbackY: 13.8,
          life: 0.95,
          maxLife: 0.95,
          warmup: 0.2,
          tickInterval: 0.85,
          tickTimer: 0,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
        });
      }
      break;
    }
    case 'sora': {
      const offsets: Array<[number, number]> = [
        [0, 0],
        [-2.2, 1.4],
        [2.2, -1.4],
      ];
      offsets.forEach(([ox, oz], idx) => {
        const tx = Math.max(-ARENA_HALF_X + 1.2, Math.min(ARENA_HALF_X - 1.2, foe.x + ox));
        const tz = Math.max(-ARENA_HALF_Z + 1.2, Math.min(ARENA_HALF_Z - 1.2, foe.z + oz));
        match.hazards.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'thunder_strike',
          x: tx,
          y: FLOOR_Y,
          z: tz,
          radius: 2.2,
          height: 12,
          damage: Math.round(f.spec.ultimate.damage * 0.52),
          knockbackSpeed: 9,
          knockbackY: 11,
          life: 0.75 + idx * 0.14,
          maxLife: 0.75 + idx * 0.14,
          warmup: 0.22 + idx * 0.14,
          tickInterval: 1.0,
          tickTimer: 0,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
        });
      });
      break;
    }
    case 'lyra': {
      match.hazards.push({
        id: match.nextEntityId++,
        ownerSlot: f.slot,
        kind: 'blizzard_storm',
        x: foe.x,
        y: FLOOR_Y,
        z: foe.z,
        radius: 5.8,
        height: 8.0,
        damage: Math.round(f.spec.ultimate.damage / 4),
        knockbackSpeed: 4.5,
        knockbackY: 5.5,
        life: 1.7,
        maxLife: 1.7,
        warmup: 0.15,
        tickInterval: 0.35,
        tickTimer: 0,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
        freezeDuration: 1.15,
      });
      break;
    }
    case 'hecker': {
      // System Override: single constricting Cyber Matrix Cage locked onto foe
      const tx = Math.max(-ARENA_HALF_X + 1.5, Math.min(ARENA_HALF_X - 1.5, foe.x));
      const tz = Math.max(-ARENA_HALF_Z + 1.5, Math.min(ARENA_HALF_Z - 1.5, foe.z));
      match.hazards.push({
        id: match.nextEntityId++,
        ownerSlot: f.slot,
        kind: 'system_override',
        x: tx,
        y: FLOOR_Y,
        z: tz,
        radius: 4.2,
        height: 9.5,
        damage: Math.round(f.spec.ultimate.damage / 3),
        knockbackSpeed: 1.5,
        knockbackY: 6.5,
        life: 1.05,
        maxLife: 1.05,
        warmup: 0.22,
        tickInterval: 0.26,
        tickTimer: 0,
        color: f.spec.color,
        accentColor: f.spec.accentColor,
      });
      break;
    }
  }
}

function updateFighter(
  match: MatchState,
  f: FighterRuntime,
  foe: FighterRuntime,
  input: InputState,
  dt: number,
): void {
  f.animTime += dt;
  f.cdPower1 = Math.max(0, f.cdPower1 - dt);
  f.cdPower2 = Math.max(0, f.cdPower2 - dt);
  f.cdDash = Math.max(0, f.cdDash - dt);
  f.invulnTimer = Math.max(0, f.invulnTimer - dt);
  f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
  f.shieldTimer = Math.max(0, f.shieldTimer - dt);
  f.slowTimer = Math.max(0, f.slowTimer - dt);
  f.dropThroughTimer = Math.max(0, f.dropThroughTimer - dt);
  f.comboWindow = Math.max(0, f.comboWindow - dt);

  if (f.comboResetTimer > 0) {
    f.comboResetTimer -= dt;
    if (f.comboResetTimer <= 0) {
      f.currentComboCount = 0;
    }
  }

  if (f.trailHp > f.hp) {
    f.trailHp = Math.max(f.hp, f.trailHp - 260 * dt);
  } else {
    f.trailHp = f.hp;
  }

  if (f.action === 'ko') {
    const isAirborneKo = f.y > FLOOR_Y + 0.05;
    const koDrag = isAirborneKo ? Math.pow(0.98, dt * 60) : Math.pow(0.84, dt * 60);
    f.vx *= koDrag;
    f.vz *= koDrag;
    f.vy -= GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    if (Math.hypot(f.vx, f.vy, f.vz) > 11.5 && nextMatchRandom(match) < dt * 26) {
      spawnParticles3D(match, f.x, f.y + 1.1, f.z, '#e8e0d2', 1, [0.5, 2.0], 1, [0.12, 0.24]);
    }
    if (f.y <= FLOOR_Y) {
      if (f.vy < -10) {
        f.vy = -f.vy * 0.32;
        if (!match.attractMode) soundEngine.playLand(true);
        spawnParticles3D(match, f.x, FLOOR_Y + 0.15, f.z, '#cfc8bc', 8, [3, 6], 10);
      } else {
        f.y = FLOOR_Y;
        f.vy = 0;
      }
    }
    if (f.x < -ARENA_HALF_X || f.x > ARENA_HALF_X) {
      const wallX = f.x < -ARENA_HALF_X ? -ARENA_HALF_X : ARENA_HALF_X;
      if (Math.abs(f.vx) > 9.5 && Math.sign(f.vx) === Math.sign(wallX)) {
        f.vx = -f.vx * 0.48;
        f.vy = Math.max(f.vy, 4.5);
        match.shakeIntensity = Math.max(match.shakeIntensity, 0.24);
        if (!match.attractMode) soundEngine.playLand(true);
        spawnParticles3D(match, wallX, f.y + 1.2, f.z, '#e8e0d2', 10, [3, 8], 10);
      }
      f.x = wallX;
    }
    if (f.z < -ARENA_HALF_Z || f.z > ARENA_HALF_Z) {
      const wallZ = f.z < -ARENA_HALF_Z ? -ARENA_HALF_Z : ARENA_HALF_Z;
      if (Math.abs(f.vz) > 9.5 && Math.sign(f.vz) === Math.sign(wallZ)) {
        f.vz = -f.vz * 0.48;
        f.vy = Math.max(f.vy, 4.5);
        match.shakeIntensity = Math.max(match.shakeIntensity, 0.24);
        if (!match.attractMode) soundEngine.playLand(true);
        spawnParticles3D(match, f.x, f.y + 1.2, wallZ, '#e8e0d2', 10, [3, 8], 10);
      }
      f.z = wallZ;
    }
    return;
  }

  if (f.frozenTimer > 0) {
    f.frozenTimer = Math.max(0, f.frozenTimer - dt);
    if (f.frozenTimer <= 0) {
      f.action = 'idle';
      if (!match.attractMode) soundEngine.playShatter();
      spawnParticles3D(match, f.x, f.y + 1.6, f.z, '#d9f6ff', 12, [3, 7], 10);
    }
    f.vy -= GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.vx *= 0.9;
    f.vz *= 0.9;
    if (f.y <= FLOOR_Y) {
      f.y = FLOOR_Y;
      f.vy = 0;
      f.grounded = true;
    }
    return;
  }

  if (f.action === 'victory') {
    f.actionTimer = Math.max(0, f.actionTimer - dt);
    f.vx *= 0.82;
    f.vz *= 0.82;
    f.vy -= GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    if (f.y <= FLOOR_Y) {
      f.y = FLOOR_Y;
      f.vy = 0;
      f.grounded = true;
    }
    f.facingAngle = 0;
    return;
  }

  const canAct =
    f.action === 'idle' ||
    f.action === 'run' ||
    f.action === 'jump' ||
    f.action === 'fall' ||
    f.action === 'block';

  if (f.actionTimer > 0) {
    f.actionTimer -= dt;

    if (f.counterArmed && f.actionTimer <= 0) {
      f.counterArmed = false;
      if (Math.hypot(foe.x - f.x, foe.z - f.z) < 3.8 && Math.abs(foe.y - f.y) < 3.0) {
        const [cx, cz] = dirToTarget(f, foe);
        applyHit(match, f, foe, 45, 7, 3.5, cx, cz, false, true);
      }
    }

    // Kael Meteor Slam leap & ground shockwave
    if (f.spec.id === 'kael' && f.action === 'power2') {
      if (f.actionTimer < 0.42 && !f.grounded) {
        f.vy = Math.min(f.vy, -24);
      }
      if (f.grounded && !f.actionHasHit) {
        f.actionHasHit = true;
        match.shakeIntensity = Math.max(match.shakeIntensity, 0.38);
        match.hazards.push({
          id: match.nextEntityId++,
          ownerSlot: f.slot,
          kind: 'meteor_ring',
          x: f.x,
          y: f.y,
          z: f.z,
          radius: 4.2,
          height: 3.0,
          damage: f.spec.power2.damage,
          knockbackSpeed: 10,
          knockbackY: 10.2,
          life: 0.42,
          maxLife: 0.42,
          warmup: 0,
          tickInterval: 1,
          tickTimer: 0,
          color: f.spec.color,
          accentColor: f.spec.accentColor,
        });
        if (!match.attractMode) soundEngine.playHazardErupt('meteor_ring');
        spawnParticles3D(match, f.x, f.y + 0.3, f.z, '#ffb347', 22, [4, 11], 12);
      }
    }

    // Veyra Flash Step pass-through strike
    if (f.spec.id === 'veyra' && f.action === 'power1' && !f.actionHasHit) {
      if (Math.hypot(foe.x - f.x, foe.z - f.z) < 2.3 && Math.abs(foe.y - f.y) < 2.6) {
        f.actionHasHit = true;
        const [dx, dz] = dirToTarget(f, foe);
        applyHit(match, f, foe, f.spec.power1.damage, 8.5, 6.2, dx, dz, false, true, {
          heavyImpact: true,
        });
      }
    }

    // Veyra Skybreak Barrage 3-angle teleport omni-slash blitz
    if (f.spec.id === 'veyra' && f.action === 'ultimate') {
      const progress = 1 - Math.max(0, f.actionTimer) / Math.max(0.01, f.actionDuration);
      const stage = f.multiHitStage ?? 0;
      const thresholds = [0.08, 0.38, 0.68];
      if (stage < 3 && progress >= thresholds[stage]) {
        f.multiHitStage = stage + 1;
        const blinkAng = (stage / 3) * Math.PI * 2 + 0.6;
        const bx = Math.max(-ARENA_HALF_X + 1.2, Math.min(ARENA_HALF_X - 1.2, foe.x + Math.cos(blinkAng) * 2.0));
        const bz = Math.max(-ARENA_HALF_Z + 1.2, Math.min(ARENA_HALF_Z - 1.2, foe.z + Math.sin(blinkAng) * 2.0));
        spawnParticles3D(match, f.x, f.y + 1.6, f.z, f.spec.accentColor, 10, [3, 8], 0);
        f.x = bx;
        f.y = foe.y;
        f.z = bz;
        f.vx = 0;
        f.vy = 0;
        f.vz = 0;
        const [ndx, ndz] = dirToTarget(f, foe);
        f.facingAngle = Math.atan2(ndx, ndz);
        if (!match.attractMode) soundEngine.playSwing(stage === 2 ? 3 : 2);
        match.slashes.push({
          x: foe.x,
          y: foe.y + 1.7,
          z: foe.z,
          facingAngle: f.facingAngle,
          radius: 3.1,
          life: 0.24,
          maxLife: 0.24,
          color: f.spec.accentColor,
          tilt: stage === 0 ? -0.55 : stage === 1 ? 0.55 : 0.1,
        });
        const distXZ = Math.hypot(foe.x - f.x, foe.z - f.z);
        if (distXZ < 4.2 && Math.abs(foe.y - f.y) < 3.0) {
          applyHit(
            match,
            f,
            foe,
            Math.round(f.spec.ultimate.damage / 3),
            stage === 2 ? 10.5 : 3.2,
            stage === 2 ? 10.5 : 2.5,
            ndx,
            ndz,
            false,
            true,
            { heavyImpact: stage === 2 },
          );
        }
      }
    }

    // Melee hit check in 3D cone / reach
    if (
      (f.action === 'attack1' || f.action === 'attack2' || f.action === 'attack3') &&
      !f.actionHasHit &&
      f.actionTimer <= f.actionDuration * 0.55
    ) {
      f.actionHasHit = true;
      const reach = f.spec.meleeRange + (f.action === 'attack3' ? 0.5 : 0);
      const distXZ = Math.hypot(foe.x - f.x, foe.z - f.z);
      const dy = Math.abs(foe.y - f.y);
      if (distXZ <= reach && dy < 2.6) {
        const dmg =
          f.action === 'attack3'
            ? Math.round(f.spec.meleeDamage * 1.45)
            : f.action === 'attack2'
              ? Math.round(f.spec.meleeDamage * 1.1)
              : f.spec.meleeDamage;
        const kbSpeed = f.action === 'attack3' ? 11.2 : 4.8;
        const kbY = f.action === 'attack3' ? 7.2 : 1.8;
        const [kx, kz] = dirToTarget(f, foe);
        applyHit(match, f, foe, dmg, kbSpeed, kbY, kx, kz, true, false, {
          heavyImpact: f.action === 'attack3',
        });
      }
    }

    if (f.actionTimer <= 0) {
      f.action = f.grounded ? 'idle' : 'fall';
    }
  }

  if (canAct && match.phase === 'fight') {
    if (input.ultimate && f.energy >= 100) {
      triggerUltimate(match, f, foe);
    } else if (input.power2 && f.cdPower2 <= 0) {
      triggerPower2(match, f, foe);
    } else if (input.power1 && f.cdPower1 <= 0) {
      triggerPower1(match, f, foe);
    } else if (input.attack) {
      const nextStep = f.comboWindow > 0 ? (((f.comboStep % 3) + 1) as 1 | 2 | 3) : 1;
      f.comboStep = nextStep;
      f.comboWindow = 0.5;
      f.action = nextStep === 1 ? 'attack1' : nextStep === 2 ? 'attack2' : 'attack3';
      f.actionDuration = nextStep === 3 ? 0.34 : 0.24;
      f.actionTimer = f.actionDuration;
      f.actionHasHit = false;
      const [dx, dz] = dirToTarget(f, foe);
      f.facingAngle = Math.atan2(dx, dz);
      const lunge = nextStep === 3 ? 5.8 : 3.2;
      f.vx = dx * lunge;
      f.vz = dz * lunge;
      if (!match.attractMode) soundEngine.playSwing(nextStep);
      match.slashes.push({
        x: f.x + dx * 0.9,
        y: f.y + 1.8,
        z: f.z + dz * 0.9,
        facingAngle: f.facingAngle,
        radius: f.spec.meleeRange * 0.72,
        life: 0.18,
        maxLife: 0.18,
        color: f.spec.accentColor,
        tilt: nextStep === 2 ? -0.45 : nextStep === 3 ? 0.65 : 0.15,
      });
    } else if (input.dash && f.cdDash <= 0) {
      let mx = typeof input.moveX === 'number' ? input.moveX : (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let mz = typeof input.moveZ === 'number' ? input.moveZ : (input.back ? 1 : 0) - (input.forward ? 1 : 0);
      const len = Math.hypot(mx, mz);
      if (len > 0.15) {
        mx /= len;
        mz /= len;
        f.facingAngle = Math.atan2(mx, mz);
      } else {
        mx = Math.sin(f.facingAngle);
        mz = Math.cos(f.facingAngle);
      }
      f.action = 'dash';
      f.actionTimer = 0.2;
      f.actionDuration = 0.2;
      f.cdDash = 0.82;
      f.invulnTimer = 0.18;
      f.vx = mx * 20;
      f.vz = mz * 20;
      f.vy = Math.max(f.vy, 0);
      if (!match.attractMode) soundEngine.playDash();
      spawnParticles3D(match, f.x, f.y + 0.4, f.z, '#d4cdc2', 8, [2, 5], 2);
    } else if (input.block && f.grounded) {
      f.action = 'block';
      f.vx *= 0.7;
      f.vz *= 0.7;
    } else {
      const moveSpeed = f.spec.speed * (f.slowTimer > 0 ? 0.58 : 1);
      let mx =
        typeof input.moveX === 'number' && Math.abs(input.moveX) > 0.12
          ? input.moveX
          : (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let mz =
        typeof input.moveZ === 'number' && Math.abs(input.moveZ) > 0.12
          ? input.moveZ
          : (input.back ? 1 : 0) - (input.forward ? 1 : 0);

      // Keyboard overrides analog if both active
      if (input.left || input.right) mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (input.forward || input.back) mz = (input.back ? 1 : 0) - (input.forward ? 1 : 0);

      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }

      if (mag > 0.12) {
        f.vx = mx * moveSpeed;
        f.vz = mz * moveSpeed;
        f.facingAngle = Math.atan2(mx, mz);
        if (f.grounded) f.action = 'run';
      } else {
        f.vx *= f.grounded ? 0.72 : 0.92;
        f.vz *= f.grounded ? 0.72 : 0.92;
        if (f.grounded) f.action = 'idle';
      }

      if (input.jump && f.jumpsLeft > 0) {
        const isDoubleJump = f.jumpsLeft === 1;
        f.vy = f.spec.jumpForce;
        f.grounded = false;
        f.jumpsLeft -= 1;
        f.action = 'jump';
        if (!match.attractMode) soundEngine.playJump(isDoubleJump);
        spawnParticles3D(match, f.x, f.y + 0.15, f.z, '#cfc8bc', 6, [2, 4], 4);
      }

      if (input.drop && f.grounded && f.y > FLOOR_Y + 0.1) {
        f.dropThroughTimer = 0.22;
        f.grounded = false;
      }
    }
  } else {
    if (f.action === 'hitstun') {
      const drag = f.grounded ? Math.pow(0.84, dt * 60) : Math.pow(0.975, dt * 60);
      f.vx *= drag;
      f.vz *= drag;
      if (Math.hypot(f.vx, f.vy, f.vz) > 11.5 && nextMatchRandom(match) < dt * 28) {
        spawnParticles3D(match, f.x, f.y + 1.4, f.z, '#e8e0d2', 1, [0.5, 2.0], 1, [0.12, 0.24]);
      }
    } else if (f.action !== 'dash' && !(f.spec.id === 'veyra' && f.action === 'power1')) {
      const decel = Math.pow(0.86, dt * 60);
      f.vx *= decel;
      f.vz *= decel;
    }
  }

  const prevGrounded = f.grounded;
  const prevY = f.y;
  const prevVy = f.vy;
  f.vy -= GRAVITY * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.z += f.vz * dt;

  // 3D Arena bounds (with wall ricochet when launched at high speed)
  if (f.x < -ARENA_HALF_X || f.x > ARENA_HALF_X) {
    const wallX = f.x < -ARENA_HALF_X ? -ARENA_HALF_X : ARENA_HALF_X;
    if (f.action === 'hitstun' && Math.abs(f.vx) > 9.5 && Math.sign(f.vx) === Math.sign(wallX)) {
      f.vx = -f.vx * 0.48;
      f.vy = Math.max(f.vy, 5.2);
      match.shakeIntensity = Math.max(match.shakeIntensity, 0.26);
      if (!match.attractMode) soundEngine.playLand(true);
      spawnParticles3D(match, wallX, f.y + 1.5, f.z, '#e8e0d2', 12, [3, 8], 10);
    }
    f.x = wallX;
  }
  if (f.z < -ARENA_HALF_Z || f.z > ARENA_HALF_Z) {
    const wallZ = f.z < -ARENA_HALF_Z ? -ARENA_HALF_Z : ARENA_HALF_Z;
    if (f.action === 'hitstun' && Math.abs(f.vz) > 9.5 && Math.sign(f.vz) === Math.sign(wallZ)) {
      f.vz = -f.vz * 0.48;
      f.vy = Math.max(f.vy, 5.2);
      match.shakeIntensity = Math.max(match.shakeIntensity, 0.26);
      if (!match.attractMode) soundEngine.playLand(true);
      spawnParticles3D(match, f.x, f.y + 1.5, wallZ, '#e8e0d2', 12, [3, 8], 10);
    }
    f.z = wallZ;
  }

  f.grounded = false;

  // One-way 3D platforms from above
  if (f.vy <= 0 && f.dropThroughTimer <= 0) {
    for (const plat of match.stage.platforms) {
      const withinX = Math.abs(f.x - plat.x) <= plat.width * 0.5 + 0.35;
      const withinZ = Math.abs(f.z - plat.z) <= plat.depth * 0.5 + 0.35;
      if (withinX && withinZ && prevY >= plat.y - 0.2 && f.y <= plat.y) {
        f.y = plat.y;
        f.vy = 0;
        f.grounded = true;
        f.jumpsLeft = 2;
        break;
      }
    }
  }

  // Main ground floor
  if (f.y <= FLOOR_Y) {
    f.y = FLOOR_Y;
    f.vy = 0;
    f.grounded = true;
    f.jumpsLeft = 2;
  }

  if (!prevGrounded && f.grounded && prevVy < -6 && !match.attractMode) {
    soundEngine.playLand(prevVy < -20);
  }

  if (!f.grounded && canAct) {
    f.action = f.vy > 0 ? 'jump' : 'fall';
  }
}

export function stepMatch(
  match: MatchState,
  input1: InputState,
  input2: InputState,
  dtRaw: number,
): void {
  const dt = Math.min(0.033, Math.max(0.001, dtRaw));

  match.shakeIntensity = Math.max(0, match.shakeIntensity - 1.5 * dt);

  if (match.hitstopTimer > 0) {
    match.hitstopTimer = Math.max(0, match.hitstopTimer - dt);
    return;
  }

  if (!match.attractMode) {
    if (match.phase === 'intro') {
      if (match.introDialogue && match.introDialogue.activeSpeaker !== null) {
        const skipPressed =
          input1.attack ||
          input1.jump ||
          (match.mode === '2p' && (input2.attack || input2.jump));
        if (skipPressed) {
          match.introDialogue.activeSpeaker = null;
          match.phaseTimer = 0.65;
          match.bannerText = 'FIGHT!';
          soundEngine.playGong();
        }
      }

      match.phaseTimer -= dt;

      if (match.introDialogue) {
        if (match.introDialogue.activeSpeaker === 1 && match.phaseTimer <= 2.45) {
          match.introDialogue.activeSpeaker = 2;
          soundEngine.playDialogueCue(2);
        }
        if (match.introDialogue.activeSpeaker !== null && match.phaseTimer <= 0.65) {
          match.introDialogue.activeSpeaker = null;
          match.bannerText = 'FIGHT!';
          soundEngine.playGong();
        }
      } else if (match.phaseTimer <= 0.45 && match.bannerText !== 'FIGHT!') {
        match.bannerText = 'FIGHT!';
        soundEngine.playGong();
      }

      if (match.phaseTimer <= 0) {
        match.phase = 'fight';
        match.bannerText = '';
        match.introDialogue = null;
      }
    } else if (match.phase === 'fight') {
      match.roundTimeLeft = Math.max(0, match.roundTimeLeft - dt);
      match.elapsedMatchTime += dt;

      const [f1, f2] = match.fighters;
      if (f1.hp <= 0 || f2.hp <= 0 || match.roundTimeLeft <= 0) {
        const res = resolveRoundWinner(f1.hp, f1.spec.maxHp, f2.hp, f2.spec.maxHp);
        if (res.winner === 1) match.roundWins[0] += 1;
        if (res.winner === 2) match.roundWins[1] += 1;
        const isMatchDecided =
          match.roundWins[0] >= match.roundsToWin ||
          match.roundWins[1] >= match.roundsToWin;
        match.phase = 'round_end';
        match.phaseTimer = isMatchDecided ? 1.1 : 1.9;
        match.bannerText =
          res.winner === null
            ? res.reason
            : `${res.winner === 1 ? f1.spec.name : f2.spec.name} Wins Round`;
        match.winReason = res.reason;
      }
    } else if (match.phase === 'round_end') {
      match.phaseTimer -= dt;
      if (match.phaseTimer <= 0) {
        if (
          match.roundWins[0] >= match.roundsToWin ||
          match.roundWins[1] >= match.roundsToWin
        ) {
          match.phase = 'victory';
          match.phaseTimer = 2.15;
          match.winnerSlot = match.roundWins[0] > match.roundWins[1] ? 1 : 2;
          const champ = match.fighters[match.winnerSlot - 1];
          match.bannerText = `${champ.spec.name} Wins`;

          champ.action = 'victory';
          champ.actionDuration = 1.25;
          champ.actionTimer = 1.25;
          champ.actionHasHit = false;
          champ.frozenTimer = 0;
          champ.shieldTimer = 0;
          champ.counterArmed = false;
          champ.invulnTimer = 2.5;
          champ.facingAngle = 0;
          champ.vx = 0;
          champ.vz = 0;

          soundEngine.playVictory();
          spawnParticles3D(
            match,
            champ.x,
            champ.y + 1.8,
            champ.z,
            champ.spec.accentColor,
            26,
            [4, 11],
            5,
            [0.16, 0.34],
          );
          spawnParticles3D(
            match,
            champ.x,
            champ.y + 2.0,
            champ.z,
            '#fff6d6',
            14,
            [3, 9],
            3,
            [0.12, 0.26],
          );
        } else {
          match.roundNumber += 1;
          resetRound(match);
        }
      }
    } else if (match.phase === 'victory') {
      match.phaseTimer -= dt;
      if (match.winnerSlot !== null) {
        const champ = match.fighters[match.winnerSlot - 1];
        if (!champ.actionHasHit && champ.actionTimer <= champ.actionDuration * 0.45) {
          champ.actionHasHit = true;
          spawnParticles3D(
            match,
            champ.x,
            champ.y + (champ.spec.id === 'bram' ? 0.3 : 2.1),
            champ.z,
            champ.spec.accentColor,
            18,
            [4, 9],
            champ.spec.id === 'bram' ? 14 : 3,
            [0.14, 0.3],
          );
        }
        if (nextMatchRandom(match) < dt * 8) {
          spawnParticles3D(
            match,
            champ.x + (nextMatchRandom(match) - 0.5) * 1.4,
            champ.y + 0.6 + nextMatchRandom(match) * 2.4,
            champ.z + (nextMatchRandom(match) - 0.5) * 1.2,
            champ.spec.accentColor,
            1,
            [1, 3.5],
            -1.5,
            [0.1, 0.2],
          );
        }
      }
      if (match.phaseTimer <= 0) {
        match.phase = 'match_end';
      }
    }
  } else {
    const [f1, f2] = match.fighters;
    if (f1.hp < 220) f1.hp = f1.spec.maxHp;
    if (f2.hp < 220) f2.hp = f2.spec.maxHp;
  }

  const [f1, f2] = match.fighters;
  const empty: InputState = {
    left: false,
    right: false,
    forward: false,
    back: false,
    jump: false,
    drop: false,
    attack: false,
    power1: false,
    power2: false,
    ultimate: false,
    dash: false,
    block: false,
  };
  const allowInput = match.phase === 'fight';
  updateFighter(match, f1, f2, allowInput ? input1 : empty, dt);
  updateFighter(match, f2, f1, allowInput ? input2 : empty, dt);

  // Soft 3D cylindrical separation
  const dx = f2.x - f1.x;
  const dz = f2.z - f1.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.15 && Math.abs(f1.y - f2.y) < 2.2 && f1.action !== 'ko' && f2.action !== 'ko') {
    const push = (1.15 - dist) * 0.5;
    const nx = dist > 0.001 ? dx / dist : 1;
    const nz = dist > 0.001 ? dz / dist : 0;
    f1.x -= nx * push;
    f1.z -= nz * push;
    f2.x += nx * push;
    f2.z += nz * push;
  }

  // Update 3D projectiles
  for (let i = match.projectiles.length - 1; i >= 0; i--) {
    const p = match.projectiles[i];
    const target = p.ownerSlot === 1 ? f2 : f1;
    const owner = p.ownerSlot === 1 ? f1 : f2;

    if (p.homing && target.action !== 'ko') {
      const [tx, tz] = dirToTarget(p, target);
      const curSpeed = Math.hypot(p.vx, p.vz) || 14.5;
      const steer = 5.4 * dt;
      const nx = p.vx / curSpeed + tx * steer;
      const nz = p.vz / curSpeed + tz * steer;
      const nLen = Math.hypot(nx, nz) || 1;
      p.vx = (nx / nLen) * curSpeed;
      p.vz = (nz / nLen) * curSpeed;
    }

    if (p.gravity) {
      p.vy -= p.gravity * dt;
    }

    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    if (nextMatchRandom(match) < 0.78) {
      const trailColor =
        p.kind === 'fireball'
          ? nextMatchRandom(match) < 0.45
            ? '#fff2b8'
            : p.accentColor
          : p.kind === 'arcbolt'
            ? '#d9f4ff'
            : p.kind === 'cyberpacket'
              ? nextMatchRandom(match) < 0.5
                ? '#d9ffea'
                : p.accentColor
              : p.accentColor;
      spawnParticles3D(
        match,
        p.x + (nextMatchRandom(match) - 0.5) * 0.35,
        p.y + (nextMatchRandom(match) - 0.5) * 0.35,
        p.z + (nextMatchRandom(match) - 0.5) * 0.35,
        trailColor,
        1,
        [1, 3.5],
        p.kind === 'boulder' ? 14 : -1.5,
        [0.1, 0.24],
      );
    }

    const hitFloor = Boolean(p.gravity && p.y <= FLOOR_Y + 0.55);
    const distXZ = Math.hypot(p.x - target.x, p.z - target.z);
    const dy = Math.abs(p.y - (target.y + 1.5));
    const directHit = !p.hitIds.includes(target.slot) && distXZ < p.radius + 0.9 && dy < 2.1;

    if (directHit || hitFloor) {
      if (hitFloor && p.aoeSplashRadius && !p.hitIds.includes(target.slot)) {
        if (distXZ <= p.aoeSplashRadius + 0.6 && Math.abs(target.y - FLOOR_Y) < 2.5) {
          p.hitIds.push(target.slot);
          const kbMag = Math.hypot(p.knockbackX, p.knockbackZ) || 1;
          applyHit(
            match,
            owner,
            target,
            Math.round(p.damage * 0.85),
            kbMag,
            p.knockbackY,
            p.knockbackX / kbMag,
            p.knockbackZ / kbMag,
            false,
            true,
            { heavyImpact: true },
          );
        }
        if (!match.attractMode) soundEngine.playHazardErupt('tectonic_spire');
        match.shakeIntensity = Math.max(match.shakeIntensity, 0.32);
        spawnParticles3D(match, p.x, FLOOR_Y + 0.3, p.z, p.accentColor, 20, [5, 11], 14);
        p.life = 0;
      } else if (directHit) {
        p.hitIds.push(target.slot);
        if (p.drainEnergy && target.energy > 0) {
          const drained = Math.min(target.energy, p.drainEnergy);
          target.energy -= drained;
          owner.energy = Math.min(100, owner.energy + Math.round(drained * 0.6));
        }
        const kbMag = Math.hypot(p.knockbackX, p.knockbackZ) || 1;
        applyHit(
          match,
          owner,
          target,
          p.damage,
          kbMag,
          p.knockbackY,
          p.knockbackX / kbMag,
          p.knockbackZ / kbMag,
          false,
          true,
          {
            slowDuration: p.slowDuration,
            heavyImpact: p.kind === 'fireball' || p.kind === 'boulder',
          },
        );
        if (p.aoeSplashRadius) {
          spawnParticles3D(match, p.x, p.y, p.z, p.accentColor, 18, [5, 12], 8);
        }
        if (!p.piercing) p.life = 0;
      }
    }

    if (
      p.life <= 0 ||
      Math.abs(p.x) > ARENA_HALF_X + 3 ||
      Math.abs(p.z) > ARENA_HALF_Z + 3
    ) {
      match.projectiles.splice(i, 1);
    }
  }

  // Update 3D hazard zones
  for (let i = match.hazards.length - 1; i >= 0; i--) {
    const h = match.hazards[i];
    const prevWarmup = h.warmup;
    h.life -= dt;
    h.warmup = Math.max(0, h.warmup - dt);

    if (prevWarmup > 0 && h.warmup <= 0 && !match.attractMode) {
      soundEngine.playHazardErupt(h.kind);
    }

    if (h.warmup <= 0) {
      if (nextMatchRandom(match) < dt * 22) {
        const ang = nextMatchRandom(match) * Math.PI * 2;
        const rad = nextMatchRandom(match) * h.radius * 0.85;
        spawnParticles3D(
          match,
          h.x + Math.cos(ang) * rad,
          h.y + nextMatchRandom(match) * Math.min(3.5, h.height * 0.7),
          h.z + Math.sin(ang) * rad,
          nextMatchRandom(match) < 0.35 ? '#fff8e0' : h.accentColor,
          1,
          [1.5, 4.5],
          h.kind === 'blizzard_storm' ? 4 : -4,
          [0.1, 0.22],
        );
      }

      h.tickTimer -= dt;
      if (h.tickTimer <= 0) {
        h.tickTimer = h.tickInterval;
        const target = h.ownerSlot === 1 ? f2 : f1;
        const owner = h.ownerSlot === 1 ? f1 : f2;

        const distXZ = Math.hypot(target.x - h.x, target.z - h.z);
        const inY = target.y <= h.y + h.height && target.y + 3.0 >= h.y;
        if (distXZ <= h.radius + 0.75 && inY) {
          const [kx, kz] = dirToTarget(h, target);
          applyHit(
            match,
            owner,
            target,
            h.damage,
            h.knockbackSpeed,
            h.knockbackY,
            kx,
            kz,
            false,
            true,
            {
              freezeDuration: h.freezeDuration,
              slowDuration: h.kind === 'hack_grid' || h.kind === 'system_override' ? 1.6 : undefined,
              heavyImpact: h.kind !== 'cyclone' && h.kind !== 'blizzard_storm',
            },
          );
        }
      }
    }

    if (h.life <= 0) {
      match.hazards.splice(i, 1);
    }
  }

  // Update particles
  for (let i = match.particles.length - 1; i >= 0; i--) {
    const pt = match.particles[i];
    pt.life -= dt;
    pt.vy -= pt.gravity * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z += pt.vz * dt;
    if (pt.y < 0.05) {
      pt.y = 0.05;
      pt.vy *= -0.3;
    }
    if (pt.life <= 0) match.particles.splice(i, 1);
  }

  // Update slash arcs
  for (let i = match.slashes.length - 1; i >= 0; i--) {
    match.slashes[i].life -= dt;
    if (match.slashes[i].life <= 0) match.slashes.splice(i, 1);
  }

  // Update high-combo impact flashes
  for (let i = match.impactFlashes.length - 1; i >= 0; i--) {
    match.impactFlashes[i].life -= dt;
    if (match.impactFlashes[i].life <= 0) match.impactFlashes.splice(i, 1);
  }

  // Update cyber tethers
  for (let i = match.tethers.length - 1; i >= 0; i--) {
    match.tethers[i].life -= dt;
    if (match.tethers[i].life <= 0) match.tethers.splice(i, 1);
  }

  // Update floating events
  for (let i = match.floatingEvents.length - 1; i >= 0; i--) {
    const fe = match.floatingEvents[i];
    fe.life -= dt;
    fe.y += 2.2 * dt;
    if (fe.life <= 0) match.floatingEvents.splice(i, 1);
  }
}

export function buildHudSnapshot(match: MatchState): HudSnapshot {
  const [f1, f2] = match.fighters;
  return {
    p1Hp: f1.hp,
    p1MaxHp: f1.spec.maxHp,
    p1TrailHp: f1.trailHp,
    p1Energy: Math.round(f1.energy),
    p1Cd1: f1.cdPower1,
    p1MaxCd1: f1.spec.power1.cooldown,
    p1Cd2: f1.cdPower2,
    p1MaxCd2: f1.spec.power2.cooldown,
    p1Combo: f1.currentComboCount,
    p1Shielded: f1.shieldTimer > 0 || f1.counterArmed,
    p1Frozen: f1.frozenTimer > 0,

    p2Hp: f2.hp,
    p2MaxHp: f2.spec.maxHp,
    p2TrailHp: f2.trailHp,
    p2Energy: Math.round(f2.energy),
    p2Cd1: f2.cdPower1,
    p2MaxCd1: f2.spec.power1.cooldown,
    p2Cd2: f2.cdPower2,
    p2MaxCd2: f2.spec.power2.cooldown,
    p2Combo: f2.currentComboCount,
    p2Shielded: f2.shieldTimer > 0 || f2.counterArmed,
    p2Frozen: f2.frozenTimer > 0,

    roundNumber: match.roundNumber,
    roundWins: [...match.roundWins] as [number, number],
    roundsToWin: match.roundsToWin,
    roundTimeLeft: Math.ceil(match.roundTimeLeft),
    phase: match.phase,
    bannerText: match.bannerText,
    introDialogue: match.introDialogue ? { ...match.introDialogue } : null,
    winnerSlot: match.winnerSlot,
    winReason: match.winReason,
    elapsedMatchTime: match.elapsedMatchTime,

    p1Stats: {
      damageDealt: f1.damageDealt,
      maxCombo: f1.maxCombo,
      powersLanded: f1.powersLanded,
    },
    p2Stats: {
      damageDealt: f2.damageDealt,
      maxCombo: f2.maxCombo,
      powersLanded: f2.powersLanded,
    },
  };
}
