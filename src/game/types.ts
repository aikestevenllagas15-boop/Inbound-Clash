export type ShellState = 'title' | 'playing' | 'paused' | 'replay' | 'gameover';

export type GameMode = '1p' | '2p';
export type BotDifficulty = 'steady' | 'fierce';

export type FighterId = 'kael' | 'veyra' | 'bram' | 'sora' | 'lyra' | 'hecker';
export type StageId = 'bamboo' | 'foundry' | 'pagoda';

export type ActionType =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'dash'
  | 'block'
  | 'attack1'
  | 'attack2'
  | 'attack3'
  | 'power1'
  | 'power2'
  | 'ultimate'
  | 'hitstun'
  | 'frozen'
  | 'ko'
  | 'victory';

export interface PowerSpec {
  name: string;
  keyHint: string;
  cooldown: number;
  damage: number;
  summary: string;
}

export interface FighterSpec {
  id: FighterId;
  name: string;
  epithet: string;
  style: string;
  color: string;
  accentColor: string;
  glowColor: string;
  maxHp: number;
  speed: number; // 3D units/sec
  jumpForce: number; // 3D units/sec
  weight: number;
  meleeDamage: number;
  meleeRange: number; // 3D units
  power1: PowerSpec;
  power2: PowerSpec;
  ultimate: PowerSpec;
}

export interface Platform3D {
  x: number;
  y: number; // top surface height in 3D world units
  z: number;
  width: number; // X span
  depth: number; // Z span
  thickness: number;
}

export interface StageSpec {
  id: StageId;
  name: string;
  skyTop: string;
  skyBottom: string;
  horizonColor: string;
  floorColor: string;
  floorTrim: string;
  platformColor: string;
  accentColor: string;
  platforms: Platform3D[];
}

export interface InputState {
  left: boolean;
  right: boolean;
  forward: boolean; // -Z (into arena)
  back: boolean; // +Z (toward camera)
  jump: boolean;
  drop: boolean;
  attack: boolean;
  power1: boolean;
  power2: boolean;
  ultimate: boolean;
  dash: boolean;
  block: boolean;
  moveX?: number; // analog -1..1 (left/right)
  moveZ?: number; // analog -1..1 (-1 forward, +1 back)
}

export interface FighterRuntime {
  slot: 1 | 2;
  spec: FighterSpec;
  x: number;
  y: number; // vertical height (0 = ground)
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facingAngle: number; // radians in XZ plane (0 = +Z, PI/2 = +X)
  hp: number;
  trailHp: number;
  energy: number;
  grounded: boolean;
  jumpsLeft: number;
  dropThroughTimer: number;

  action: ActionType;
  actionTimer: number;
  actionDuration: number;
  actionHasHit: boolean;
  comboStep: 0 | 1 | 2 | 3;
  comboWindow: number;

  cdPower1: number;
  cdPower2: number;
  cdDash: number;

  invulnTimer: number;
  hitFlashTimer: number;
  shieldTimer: number;
  counterArmed: boolean;
  slowTimer: number;
  frozenTimer: number;

  damageDealt: number;
  powersLanded: number;
  currentComboCount: number;
  maxCombo: number;
  comboResetTimer: number;

  animTime: number;
  multiHitStage?: number;
}

export interface Projectile3D {
  id: number;
  ownerSlot: 1 | 2;
  kind: 'fireball' | 'arcbolt' | 'iceshard' | 'boulder' | 'cyberpacket';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  damage: number;
  knockbackX: number;
  knockbackY: number;
  knockbackZ: number;
  life: number;
  maxLife: number;
  color: string;
  accentColor: string;
  piercing?: boolean;
  homing?: boolean;
  gravity?: number;
  drainEnergy?: number;
  aoeSplashRadius?: number;
  hitIds: number[];
  slowDuration?: number;
}

export interface HazardZone3D {
  id: number;
  ownerSlot: 1 | 2;
  kind:
    | 'meteor_ring'
    | 'cyclone'
    | 'inferno_pillar'
    | 'tectonic_spire'
    | 'thunder_strike'
    | 'frost_nova'
    | 'blizzard_storm'
    | 'hack_grid'
    | 'system_override';
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  damage: number;
  knockbackSpeed: number;
  knockbackY: number;
  life: number;
  maxLife: number;
  warmup: number;
  tickInterval: number;
  tickTimer: number;
  color: string;
  accentColor: string;
  freezeDuration?: number;
}

export interface Particle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  gravity: number;
}

export interface SlashEffect3D {
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  tilt: number;
}

export interface ImpactFlash3D {
  x: number;
  y: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  accentColor: string;
  intensity: number;
  angle: number;
}

export interface FloatingEvent {
  id: number;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface CyberTether3D {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  life: number;
  maxLife: number;
  color: string;
  connected: boolean;
}

export interface IntroDialogue {
  p1Line: string;
  p2Line: string;
  activeSpeaker: 1 | 2 | null;
}

export interface MatchState {
  mode: GameMode;
  difficulty: BotDifficulty;
  stage: StageSpec;
  fighters: [FighterRuntime, FighterRuntime];
  projectiles: Projectile3D[];
  hazards: HazardZone3D[];
  particles: Particle3D[];
  slashes: SlashEffect3D[];
  impactFlashes: ImpactFlash3D[];
  tethers: CyberTether3D[];
  floatingEvents: FloatingEvent[];

  roundNumber: number;
  roundsToWin: number;
  roundWins: [number, number];
  roundDuration: number;
  roundTimeLeft: number;
  elapsedMatchTime: number;
  showFloatingEvents: boolean;

  phase: 'intro' | 'fight' | 'round_end' | 'victory' | 'match_end';
  phaseTimer: number;
  bannerText: string;
  introDialogue: IntroDialogue | null;
  winnerSlot: 1 | 2 | null;
  winReason: string;

  hitstopTimer: number;
  shakeIntensity: number;
  nextEntityId: number;
  seed: number;
  rngState: number;
  attractMode: boolean;
}

export interface HudSnapshot {
  p1Hp: number;
  p1MaxHp: number;
  p1TrailHp: number;
  p1Energy: number;
  p1Cd1: number;
  p1MaxCd1: number;
  p1Cd2: number;
  p1MaxCd2: number;
  p1Combo: number;
  p1Shielded: boolean;
  p1Frozen: boolean;

  p2Hp: number;
  p2MaxHp: number;
  p2TrailHp: number;
  p2Energy: number;
  p2Cd1: number;
  p2MaxCd1: number;
  p2Cd2: number;
  p2MaxCd2: number;
  p2Combo: number;
  p2Shielded: boolean;
  p2Frozen: boolean;

  roundNumber: number;
  roundWins: [number, number];
  roundsToWin: number;
  roundTimeLeft: number;
  phase: MatchState['phase'];
  bannerText: string;
  introDialogue: IntroDialogue | null;
  winnerSlot: 1 | 2 | null;
  winReason: string;
  elapsedMatchTime: number;

  p1Stats: { damageDealt: number; maxCombo: number; powersLanded: number };
  p2Stats: { damageDealt: number; maxCombo: number; powersLanded: number };
}

export interface DeviceRecord {
  wins: number;
  bestFastestKo: number | null;
  highestCombo: number;
}

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';
export type ParticleDensity = 'low' | 'normal' | 'high';
export type TouchControlsMode = 'always' | 'auto' | 'off';

export type P1KeyAction =
  | 'left'
  | 'right'
  | 'forward'
  | 'back'
  | 'jump'
  | 'drop'
  | 'block'
  | 'attack'
  | 'power1'
  | 'power2'
  | 'ultimate'
  | 'dash';

export type P1KeyBindings = Record<P1KeyAction, string>;

export interface GraphicsSettings {
  preset: GraphicsPreset;
  renderScale: number; // 0.5 to 1.0
  shadows: boolean;
  particleDensity: ParticleDensity;
  brightness: number; // 0.8 to 1.3
  dynamicCamera: boolean;
  screenShake: boolean;
}

export interface ControllerSettings {
  touchMode: TouchControlsMode;
  joystickDeadzone: number; // 0.08 to 0.28
  controlScale: number; // 0.8 to 1.25
  controlOpacity: number; // 0.45 to 1.0
  swapTouchSides: boolean;
  p1Keys: P1KeyBindings;
}

export interface OtherSettings {
  masterVolume: number; // 0 to 100
  roundDuration: 60 | 99 | 120;
  roundsToWin: 1 | 2 | 3;
  showDamageNumbers: boolean;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  controller: ControllerSettings;
  other: OtherSettings;
}

export interface PackedInput {
  b: number;
  mx?: number;
  mz?: number;
}

export interface ReplayFrame {
  dt: number;
  p1: PackedInput;
  p2?: PackedInput;
}

export interface MatchReplay {
  seed: number;
  mode: GameMode;
  difficulty: BotDifficulty;
  p1Id: FighterId;
  p2Id: FighterId;
  stageId: StageId;
  roundDuration: number;
  roundsToWin: number;
  durationSec: number;
  frames: ReplayFrame[];
}

export interface MatchCombatStats {
  damageDealt: number;
  maxCombo: number;
  powersLanded: number;
}

export interface MatchHistoryEntry {
  id: string;
  playedAt: number;
  winnerSlot: 1 | 2 | null;
  winReason: string;
  roundWins: [number, number];
  p1Stats: MatchCombatStats;
  p2Stats: MatchCombatStats;
  replay: MatchReplay;
}
