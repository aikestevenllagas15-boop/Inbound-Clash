import type { DeviceRecord, FighterRuntime } from './types';

const RECORD_STORAGE_KEY = 'inkbound_clash_records_v1';
const MUTE_STORAGE_KEY = 'inkbound_clash_mute_v1';

export interface DamageOutcome {
  finalDamage: number;
  blocked: boolean;
  countered: boolean;
  knockbackScale: number;
}

export function computeDamage(
  rawDamage: number,
  defender: Pick<FighterRuntime, 'action' | 'shieldTimer' | 'counterArmed' | 'spec'>,
  isMelee: boolean,
  attackerSlot: 1 | 2,
  defenderSlot: 1 | 2,
): DamageOutcome {
  if (attackerSlot === defenderSlot) {
    return { finalDamage: 0, blocked: false, countered: false, knockbackScale: 0 };
  }

  // Sora's Thunder Counter negates incoming strike and triggers counter shock
  if (defender.counterArmed && defender.spec.id === 'sora') {
    return {
      finalDamage: 0,
      blocked: true,
      countered: true,
      knockbackScale: 0,
    };
  }

  // Bram's Aegis Guard reduces all damage by 82% and resists knockback
  if (defender.shieldTimer > 0 && defender.spec.id === 'bram') {
    return {
      finalDamage: Math.max(4, Math.round(rawDamage * 0.18)),
      blocked: true,
      countered: false,
      knockbackScale: isMelee ? 0.15 : 0.25,
    };
  }

  // Standard block cuts damage by 72%
  if (defender.action === 'block') {
    return {
      finalDamage: Math.max(5, Math.round(rawDamage * 0.28)),
      blocked: true,
      countered: false,
      knockbackScale: 0.35,
    };
  }

  return {
    finalDamage: Math.round(rawDamage),
    blocked: false,
    countered: false,
    knockbackScale: 1.0 / defender.spec.weight,
  };
}

export interface KnockbackScaling {
  horizontalScale: number;
  verticalScale: number;
  damageRatio: number;
}

export function computeVariableKnockback(
  remainingHp: number,
  maxHp: number,
  blocked: boolean,
  baseScale: number,
): KnockbackScaling {
  const safeMax = Math.max(1, maxHp);
  const damageRatio = Math.max(0, Math.min(1, 1 - remainingHp / safeMax));

  if (blocked) {
    const blockMult = 0.92 + Math.pow(damageRatio, 1.2) * 0.28;
    return {
      horizontalScale: baseScale * blockMult,
      verticalScale: baseScale * blockMult,
      damageRatio,
    };
  }

  // Non-linear knockback ramp: healthy fighters stay closer for combos (0.85x),
  // while low-HP fighters with high accumulated damage launch much further (up to 2.35x).
  const curve = Math.pow(damageRatio, 1.35);
  return {
    horizontalScale: baseScale * (0.85 + curve * 1.5),
    verticalScale: baseScale * (0.9 + curve * 0.78),
    damageRatio,
  };
}

export function resolveRoundWinner(
  f1Hp: number,
  f1MaxHp: number,
  f2Hp: number,
  f2MaxHp: number,
): { winner: 1 | 2 | null; reason: string } {
  if (f1Hp <= 0 && f2Hp <= 0) {
    return { winner: null, reason: 'Double Knockout' };
  }
  if (f2Hp <= 0) {
    return { winner: 1, reason: 'Knockout' };
  }
  if (f1Hp <= 0) {
    return { winner: 2, reason: 'Knockout' };
  }
  const p1Ratio = f1Hp / Math.max(1, f1MaxHp);
  const p2Ratio = f2Hp / Math.max(1, f2MaxHp);
  if (Math.abs(p1Ratio - p2Ratio) < 0.0001) {
    return { winner: null, reason: 'Time Draw' };
  }
  return p1Ratio > p2Ratio
    ? { winner: 1, reason: 'Time Over — Higher HP' }
    : { winner: 2, reason: 'Time Over — Higher HP' };
}

export function loadDeviceRecord(): DeviceRecord {
  try {
    const raw = window.localStorage.getItem(RECORD_STORAGE_KEY);
    if (!raw) return { wins: 0, bestFastestKo: null, highestCombo: 0 };
    const parsed = JSON.parse(raw) as Partial<DeviceRecord>;
    return {
      wins: typeof parsed.wins === 'number' && Number.isFinite(parsed.wins) ? parsed.wins : 0,
      bestFastestKo:
        typeof parsed.bestFastestKo === 'number' && Number.isFinite(parsed.bestFastestKo)
          ? parsed.bestFastestKo
          : null,
      highestCombo:
        typeof parsed.highestCombo === 'number' && Number.isFinite(parsed.highestCombo)
          ? parsed.highestCombo
          : 0,
    };
  } catch {
    return { wins: 0, bestFastestKo: null, highestCombo: 0 };
  }
}

export function saveDeviceRecord(record: DeviceRecord): void {
  try {
    window.localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function loadMuteSetting(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuteSetting(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

// Known-case sanity check for pure combat rules (100 damage vs block = 28, variable knockback scales up at low HP, KO resolves cleanly)
export function verifyCombatRules(): boolean {
  const dummyBlock = computeDamage(
    100,
    {
      action: 'block',
      shieldTimer: 0,
      counterArmed: false,
      spec: { id: 'kael', weight: 1 } as FighterRuntime['spec'],
    },
    true,
    1,
    2,
  );
  const freshKb = computeVariableKnockback(1000, 1000, false, 1);
  const lowHpKb = computeVariableKnockback(150, 1000, false, 1);
  const koCheck = resolveRoundWinner(420, 1000, 0, 1000);
  return (
    dummyBlock.finalDamage === 28 &&
    dummyBlock.blocked &&
    lowHpKb.horizontalScale > freshKb.horizontalScale * 2 &&
    koCheck.winner === 1
  );
}
