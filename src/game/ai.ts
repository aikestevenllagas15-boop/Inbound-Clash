import { nextMatchRandom } from './engine';
import type { BotDifficulty, FighterRuntime, InputState, MatchState } from './types';

const EMPTY_INPUT: InputState = {
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

export interface BotMemory {
  decisionTimer: number;
  moveX: number;
  moveZ: number;
  blockHold: number;
}

export function createBotMemory(): BotMemory {
  return {
    decisionTimer: 0,
    moveX: 0,
    moveZ: 0,
    blockHold: 0,
  };
}

export function computeBotInput(
  bot: FighterRuntime,
  foe: FighterRuntime,
  match: MatchState,
  difficulty: BotDifficulty,
  memory: BotMemory,
  dt: number,
): InputState {
  const input: InputState = { ...EMPTY_INPUT };

  if (bot.action === 'ko' || bot.action === 'frozen' || match.phase !== 'fight') {
    return input;
  }

  const dx = foe.x - bot.x;
  const dz = foe.z - bot.z;
  const distXZ = Math.hypot(dx, dz);
  const dy = foe.y - bot.y;
  const aggression = difficulty === 'fierce' ? 0.85 : 0.56;

  memory.decisionTimer -= dt;
  memory.blockHold = Math.max(0, memory.blockHold - dt);

  // Incoming 3D projectile check
  const incomingProj = match.projectiles.find((p) => {
    if (p.ownerSlot === bot.slot) return false;
    const d = Math.hypot(p.x - bot.x, p.z - bot.z);
    return d < 5.5 && Math.abs(p.y - (bot.y + 1.5)) < 2.2;
  });

  if (incomingProj && memory.blockHold <= 0) {
    if (nextMatchRandom(match) < (difficulty === 'fierce' ? 0.65 : 0.35)) {
      if (bot.grounded && nextMatchRandom(match) < 0.55) {
        input.jump = true;
      } else {
        memory.blockHold = 0.28;
      }
    }
  }

  const foeAttacking =
    foe.action === 'attack1' ||
    foe.action === 'attack2' ||
    foe.action === 'attack3' ||
    foe.action === 'power2';
  if (foeAttacking && distXZ < 3.4 && Math.abs(dy) < 2.5 && memory.blockHold <= 0) {
    if (nextMatchRandom(match) < (difficulty === 'fierce' ? 0.42 : 0.18)) {
      memory.blockHold = 0.26;
    }
  }

  if (memory.blockHold > 0) {
    input.block = true;
    return input;
  }

  if (bot.energy >= 100 && distXZ < 12 && nextMatchRandom(match) < aggression * 0.25) {
    input.ultimate = true;
    return input;
  }

  if (memory.decisionTimer <= 0) {
    memory.decisionTimer = difficulty === 'fierce' ? 0.14 : 0.24;
    if (distXZ > 2.5) {
      const len = Math.max(0.01, distXZ);
      memory.moveX = dx / len;
      memory.moveZ = dz / len;
    } else if (distXZ < 1.3 && nextMatchRandom(match) < 0.35) {
      const len = Math.max(0.01, distXZ);
      memory.moveX = -dx / len;
      memory.moveZ = -dz / len;
    } else {
      memory.moveX = 0;
      memory.moveZ = 0;
    }

    if (dy > 1.8 && bot.grounded && nextMatchRandom(match) < 0.65) {
      input.jump = true;
    } else if (dy < -1.8 && bot.y > 0.5 && nextMatchRandom(match) < 0.5) {
      input.drop = true;
    }

    if (distXZ > 6.5 && distXZ < 12.5 && bot.cdDash <= 0 && nextMatchRandom(match) < aggression * 0.4) {
      input.dash = true;
    }
  }

  input.moveX = memory.moveX;
  input.moveZ = memory.moveZ;

  if (bot.cdPower2 <= 0 && distXZ < 5.2 && Math.abs(dy) < 3.0) {
    if (nextMatchRandom(match) < aggression * 0.14) {
      input.power2 = true;
      return input;
    }
  }

  if (bot.cdPower1 <= 0 && distXZ > 3.2 && distXZ < 16 && Math.abs(dy) < 2.6) {
    if (nextMatchRandom(match) < aggression * 0.16) {
      input.power1 = true;
      return input;
    }
  }

  if (distXZ <= bot.spec.meleeRange + 0.4 && Math.abs(dy) < 2.4) {
    if (nextMatchRandom(match) < aggression * 0.48) {
      input.attack = true;
    }
  }

  return input;
}
