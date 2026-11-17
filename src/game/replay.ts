import { FIGHTERS, STAGES } from './fighters';
import type {
  FighterId,
  InputState,
  MatchHistoryEntry,
  MatchReplay,
  PackedInput,
  ReplayFrame,
  StageId,
} from './types';

export const MAX_MATCH_HISTORY = 5;
const MATCH_HISTORY_STORAGE_KEY = 'inkbound_clash_history_v1';

export function formatReplayDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function packInput(input: InputState): PackedInput {
  let b = 0;
  if (input.left) b |= 1 << 0;
  if (input.right) b |= 1 << 1;
  if (input.forward) b |= 1 << 2;
  if (input.back) b |= 1 << 3;
  if (input.jump) b |= 1 << 4;
  if (input.drop) b |= 1 << 5;
  if (input.attack) b |= 1 << 6;
  if (input.power1) b |= 1 << 7;
  if (input.power2) b |= 1 << 8;
  if (input.ultimate) b |= 1 << 9;
  if (input.dash) b |= 1 << 10;
  if (input.block) b |= 1 << 11;

  const packed: PackedInput = { b };
  if (typeof input.moveX === 'number' && input.moveX !== 0) {
    packed.mx = input.moveX;
  }
  if (typeof input.moveZ === 'number' && input.moveZ !== 0) {
    packed.mz = input.moveZ;
  }
  return packed;
}

export function unpackInput(packed: PackedInput): InputState {
  const b = packed.b;
  return {
    left: Boolean(b & (1 << 0)),
    right: Boolean(b & (1 << 1)),
    forward: Boolean(b & (1 << 2)),
    back: Boolean(b & (1 << 3)),
    jump: Boolean(b & (1 << 4)),
    drop: Boolean(b & (1 << 5)),
    attack: Boolean(b & (1 << 6)),
    power1: Boolean(b & (1 << 7)),
    power2: Boolean(b & (1 << 8)),
    ultimate: Boolean(b & (1 << 9)),
    dash: Boolean(b & (1 << 10)),
    block: Boolean(b & (1 << 11)),
    moveX: packed.mx ?? 0,
    moveZ: packed.mz ?? 0,
  };
}

type CompactFrame = number[];

interface StoredHistoryEntry {
  id: string;
  playedAt: number;
  winnerSlot: 1 | 2 | null;
  winReason: string;
  roundWins: [number, number];
  p1Stats: MatchHistoryEntry['p1Stats'];
  p2Stats: MatchHistoryEntry['p2Stats'];
  replay: Omit<MatchReplay, 'frames'> & { frames: CompactFrame[] };
}

function encodeFrame(frame: ReplayFrame): CompactFrame {
  const arr: number[] = [
    frame.dt,
    frame.p1.b,
    frame.p1.mx ?? 0,
    frame.p1.mz ?? 0,
    frame.p2?.b ?? 0,
    frame.p2?.mx ?? 0,
    frame.p2?.mz ?? 0,
  ];
  while (arr.length > 2 && arr[arr.length - 1] === 0) {
    arr.pop();
  }
  return arr;
}

function decodeFrame(raw: CompactFrame, is2p: boolean): ReplayFrame {
  const dt = typeof raw[0] === 'number' && Number.isFinite(raw[0]) ? raw[0] : 0.016;
  const p1: PackedInput = { b: typeof raw[1] === 'number' ? raw[1] : 0 };
  if (typeof raw[2] === 'number' && raw[2] !== 0) p1.mx = raw[2];
  if (typeof raw[3] === 'number' && raw[3] !== 0) p1.mz = raw[3];

  if (!is2p && raw.length <= 4) {
    return { dt, p1 };
  }

  const p2: PackedInput = { b: typeof raw[4] === 'number' ? raw[4] : 0 };
  if (typeof raw[5] === 'number' && raw[5] !== 0) p2.mx = raw[5];
  if (typeof raw[6] === 'number' && raw[6] !== 0) p2.mz = raw[6];
  return { dt, p1, p2 };
}

function isValidFighterId(id: string): id is FighterId {
  return Object.prototype.hasOwnProperty.call(FIGHTERS, id);
}

function isValidStageId(id: string): id is StageId {
  return Object.prototype.hasOwnProperty.call(STAGES, id);
}

function serializeEntry(entry: MatchHistoryEntry): StoredHistoryEntry {
  return {
    id: entry.id,
    playedAt: entry.playedAt,
    winnerSlot: entry.winnerSlot,
    winReason: entry.winReason,
    roundWins: entry.roundWins,
    p1Stats: entry.p1Stats,
    p2Stats: entry.p2Stats,
    replay: {
      seed: entry.replay.seed,
      mode: entry.replay.mode,
      difficulty: entry.replay.difficulty,
      p1Id: entry.replay.p1Id,
      p2Id: entry.replay.p2Id,
      stageId: entry.replay.stageId,
      roundDuration: entry.replay.roundDuration,
      roundsToWin: entry.replay.roundsToWin,
      durationSec: entry.replay.durationSec,
      frames: entry.replay.frames.map(encodeFrame),
    },
  };
}

function hydrateEntry(raw: StoredHistoryEntry): MatchHistoryEntry | null {
  if (!raw || typeof raw.id !== 'string' || !raw.replay) return null;
  if (!isValidFighterId(raw.replay.p1Id) || !isValidFighterId(raw.replay.p2Id)) return null;
  if (!isValidStageId(raw.replay.stageId)) return null;
  if (!Array.isArray(raw.replay.frames) || raw.replay.frames.length === 0) return null;

  const is2p = raw.replay.mode === '2p';
  return {
    id: raw.id,
    playedAt: typeof raw.playedAt === 'number' ? raw.playedAt : Date.now(),
    winnerSlot: raw.winnerSlot === 1 || raw.winnerSlot === 2 ? raw.winnerSlot : null,
    winReason: typeof raw.winReason === 'string' ? raw.winReason : '',
    roundWins: [
      typeof raw.roundWins?.[0] === 'number' ? raw.roundWins[0] : 0,
      typeof raw.roundWins?.[1] === 'number' ? raw.roundWins[1] : 0,
    ],
    p1Stats: {
      damageDealt: raw.p1Stats?.damageDealt ?? 0,
      maxCombo: raw.p1Stats?.maxCombo ?? 0,
      powersLanded: raw.p1Stats?.powersLanded ?? 0,
    },
    p2Stats: {
      damageDealt: raw.p2Stats?.damageDealt ?? 0,
      maxCombo: raw.p2Stats?.maxCombo ?? 0,
      powersLanded: raw.p2Stats?.powersLanded ?? 0,
    },
    replay: {
      seed: typeof raw.replay.seed === 'number' ? raw.replay.seed : 1,
      mode: is2p ? '2p' : '1p',
      difficulty: raw.replay.difficulty === 'fierce' ? 'fierce' : 'steady',
      p1Id: raw.replay.p1Id,
      p2Id: raw.replay.p2Id,
      stageId: raw.replay.stageId,
      roundDuration: typeof raw.replay.roundDuration === 'number' ? raw.replay.roundDuration : 99,
      roundsToWin: typeof raw.replay.roundsToWin === 'number' ? raw.replay.roundsToWin : 2,
      durationSec: typeof raw.replay.durationSec === 'number' ? raw.replay.durationSec : 0,
      frames: raw.replay.frames.map((f) => decodeFrame(f, is2p)),
    },
  };
}

export function loadMatchHistory(): MatchHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(MATCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    const hydrated: MatchHistoryEntry[] = [];
    for (const item of parsed) {
      const entry = hydrateEntry(item);
      if (entry) hydrated.push(entry);
      if (hydrated.length >= MAX_MATCH_HISTORY) break;
    }
    return hydrated;
  } catch {
    return [];
  }
}

export function saveMatchHistory(entries: MatchHistoryEntry[]): void {
  const capped = entries.slice(0, MAX_MATCH_HISTORY);
  let encoded = capped.map(serializeEntry);
  while (encoded.length > 0) {
    try {
      window.localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(encoded));
      return;
    } catch {
      // Trim oldest replay if storage quota is tight
      encoded = encoded.slice(0, -1);
    }
  }
  try {
    window.localStorage.removeItem(MATCH_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
}

export function recordMatchToHistory(
  existing: MatchHistoryEntry[],
  entry: MatchHistoryEntry,
): MatchHistoryEntry[] {
  const next = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(
    0,
    MAX_MATCH_HISTORY,
  );
  saveMatchHistory(next);
  return next;
}

export function removeMatchHistoryEntry(
  existing: MatchHistoryEntry[],
  id: string,
): MatchHistoryEntry[] {
  const next = existing.filter((item) => item.id !== id);
  saveMatchHistory(next);
  return next;
}

export function clearMatchHistory(): MatchHistoryEntry[] {
  try {
    window.localStorage.removeItem(MATCH_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
  return [];
}
