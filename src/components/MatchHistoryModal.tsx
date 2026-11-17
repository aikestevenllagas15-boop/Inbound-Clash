import { useEffect, useState } from 'react';
import { Film, History, Trash2, Trophy, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { FIGHTERS, STAGES } from '../game/fighters';
import { formatReplayDuration, MAX_MATCH_HISTORY } from '../game/replay';
import type { MatchHistoryEntry } from '../game/types';
import { FighterPortrait } from './FighterPortrait';
import { Button, Surface } from './ui';

interface MatchHistoryModalProps {
  open: boolean;
  entries: MatchHistoryEntry[];
  onWatchReplay: (entry: MatchHistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function formatPlayedAt(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return 'Saved match';
  }
}

export function MatchHistoryModal({
  open,
  entries,
  onWatchReplay,
  onDeleteEntry,
  onClearAll,
  onClose,
}: MatchHistoryModalProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        soundEngine.playUiClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Match History"
    >
      <Surface className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden bg-surface">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-accent" />
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Match History</h2>
              <p className="text-xs text-muted tabular-nums">
                {entries.length === 0
                  ? `Saves up to ${MAX_MATCH_HISTORY} recent match replays & combat stats`
                  : `${entries.length} of ${MAX_MATCH_HISTORY} recent matches saved on this device`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <Button
                tone="quiet"
                onClick={() => {
                  soundEngine.playUiClick();
                  if (confirmClear) {
                    onClearAll();
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
                className={`min-h-9 px-3 py-1.5 text-xs ${
                  confirmClear ? 'border-amber-500/70 text-amber-300' : ''
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmClear ? 'Confirm Clear' : 'Clear All'}
              </Button>
            )}
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onClose();
              }}
              aria-label="Close match history"
              className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable History List */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-background/60 px-6 py-12 text-center">
              <History className="h-9 w-9 text-muted/70" />
              <p className="mt-3 font-display text-base font-semibold text-foreground">
                No Recorded Matches Yet
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Finish a clash in 1P or 2P mode and your last {MAX_MATCH_HISTORY} replays and
                fighter stats will be saved here automatically.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const p1Spec = FIGHTERS[entry.replay.p1Id];
              const p2Spec = FIGHTERS[entry.replay.p2Id];
              const stageSpec = STAGES[entry.replay.stageId];
              const winnerSpec =
                entry.winnerSlot === 1 ? p1Spec : entry.winnerSlot === 2 ? p2Spec : null;
              const modeLabel =
                entry.replay.mode === '1p'
                  ? `1P · ${entry.replay.difficulty === 'fierce' ? 'Fierce' : 'Steady'}`
                  : '2P Local';

              return (
                <article
                  key={entry.id}
                  className="space-y-3 rounded-card border border-border bg-background/85 p-3.5 sm:p-4"
                >
                  {/* Match Summary Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-control border border-accent/40 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                        <Trophy className="h-3 w-3" />
                        {winnerSpec ? `${winnerSpec.name} Won` : 'Draw'}
                      </span>
                      <span className="font-display text-sm font-bold text-foreground tabular-nums">
                        {entry.roundWins[0]} – {entry.roundWins[1]}
                      </span>
                      <span className="text-xs text-muted">
                        {entry.winReason} · {stageSpec.name} · {modeLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted tabular-nums">
                      <span>Seed #{entry.replay.seed}</span>
                      <span>·</span>
                      <span>{formatPlayedAt(entry.playedAt)}</span>
                    </div>
                  </div>

                  {/* Combat Breakdown for Both Fighters */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div
                      className="flex items-center gap-3 rounded-control border bg-surface/80 p-2.5"
                      style={{
                        borderColor:
                          entry.winnerSlot === 1 ? p1Spec.accentColor : 'var(--color-border)',
                      }}
                    >
                      <FighterPortrait fighter={p1Spec} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-display text-sm font-semibold text-foreground">
                            P1 · {p1Spec.name}
                          </span>
                          {entry.winnerSlot === 1 && (
                            <span
                              className="text-[10px] font-bold uppercase"
                              style={{ color: p1Spec.accentColor }}
                            >
                              Winner
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted tabular-nums">
                          <span>Dmg: {entry.p1Stats.damageDealt}</span>
                          <span>Max Combo: {entry.p1Stats.maxCombo}</span>
                          <span>Powers: {entry.p1Stats.powersLanded}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 rounded-control border bg-surface/80 p-2.5"
                      style={{
                        borderColor:
                          entry.winnerSlot === 2 ? p2Spec.accentColor : 'var(--color-border)',
                      }}
                    >
                      <FighterPortrait fighter={p2Spec} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-display text-sm font-semibold text-foreground">
                            {entry.replay.mode === '1p' ? 'Bot' : 'P2'} · {p2Spec.name}
                          </span>
                          {entry.winnerSlot === 2 && (
                            <span
                              className="text-[10px] font-bold uppercase"
                              style={{ color: p2Spec.accentColor }}
                            >
                              Winner
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted tabular-nums">
                          <span>Dmg: {entry.p2Stats.damageDealt}</span>
                          <span>Max Combo: {entry.p2Stats.maxCombo}</span>
                          <span>Powers: {entry.p2Stats.powersLanded}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Entry Actions */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <Button
                      onClick={() => {
                        soundEngine.playUiSelect();
                        onWatchReplay(entry);
                      }}
                      className="min-h-9 px-3.5 py-1.5 text-xs"
                    >
                      <Film className="h-3.5 w-3.5" />
                      Watch Replay ({formatReplayDuration(entry.replay.durationSec)})
                    </Button>

                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        onDeleteEntry(entry.id);
                      }}
                      aria-label={`Delete ${p1Spec.name} vs ${p2Spec.name} replay`}
                      title="Delete replay"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface-elevated text-muted hover:text-foreground hover:brightness-110"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </Surface>
    </div>
  );
}
