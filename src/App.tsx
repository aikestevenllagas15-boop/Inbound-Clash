import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Film,
  Gamepad2,
  History,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Swords,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ArenaCanvas, type ReplayProgress } from './components/ArenaCanvas';
import { FighterPortrait } from './components/FighterPortrait';
import { MatchHistoryModal } from './components/MatchHistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { TouchControls } from './components/TouchControls';
import { Button, Surface } from './components/ui';
import { soundEngine } from './game/audio';
import { FIGHTER_LIST, FIGHTERS, STAGE_LIST } from './game/fighters';
import {
  clearMatchHistory,
  formatReplayDuration,
  loadMatchHistory,
  MAX_MATCH_HISTORY,
  recordMatchToHistory,
  removeMatchHistoryEntry,
} from './game/replay';
import {
  loadDeviceRecord,
  loadMuteSetting,
  saveDeviceRecord,
  saveMuteSetting,
  verifyCombatRules,
} from './game/rules';
import {
  clearDeviceRecordStorage,
  formatKeyCode,
  isTouchCapableDevice,
  loadSettings,
  saveSettings,
} from './game/settings';
import type {
  BotDifficulty,
  DeviceRecord,
  FighterId,
  GameMode,
  GameSettings,
  HudSnapshot,
  InputState,
  MatchHistoryEntry,
  MatchReplay,
  ShellState,
  StageId,
} from './game/types';

const INITIAL_TOUCH: InputState = {
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
  moveX: 0,
  moveZ: 0,
};

function getAutostartFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function generateMatchSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

export default function App() {
  const [shellState, setShellState] = useState<ShellState>(() =>
    getAutostartFlag() ? 'playing' : 'title',
  );
  const [mode, setMode] = useState<GameMode>('1p');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('steady');
  const [p1Id, setP1Id] = useState<FighterId>('kael');
  const [p2Id, setP2Id] = useState<FighterId>('sora');
  const [pickingSlot, setPickingSlot] = useState<1 | 2>(1);
  const [stageId, setStageId] = useState<StageId>('bamboo');
  const [matchSeed, setMatchSeed] = useState<number>(() => generateMatchSeed());

  const [savedReplay, setSavedReplay] = useState<MatchReplay | null>(null);
  const [savedMatchHud, setSavedMatchHud] = useState<HudSnapshot | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>(() => loadMatchHistory());
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [replayOrigin, setReplayOrigin] = useState<'gameover' | 'history'>('gameover');
  const [replaySeekKey, setReplaySeekKey] = useState<number>(0);
  const [replayPaused, setReplayPaused] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<0.5 | 1 | 2>(1);
  const [replayProgress, setReplayProgress] = useState<ReplayProgress>({
    elapsed: 0,
    total: 0,
    finished: false,
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    const loaded = loadSettings();
    soundEngine.setVolume(loaded.other.masterVolume / 100);
    return loaded;
  });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const resumeAfterSettingsRef = useRef<boolean>(false);
  const resumeReplayAfterSettingsRef = useRef<boolean>(false);

  const [muted, setMuted] = useState<boolean>(() => {
    const initial = loadMuteSetting();
    soundEngine.setMuted(initial);
    return initial;
  });

  const [deviceRecord, setDeviceRecord] = useState<DeviceRecord>(() => loadDeviceRecord());
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => isTouchCapableDevice());
  const touchInputRef = useRef<InputState>({ ...INITIAL_TOUCH });

  useEffect(() => {
    saveSettings(settings);
    soundEngine.setVolume(settings.other.masterVolume / 100);
  }, [settings]);

  useEffect(() => {
    const onResize = () => setIsTouchDevice(isTouchCapableDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showTouchPad =
    settings.controller.touchMode === 'always'
      ? true
      : settings.controller.touchMode === 'off'
        ? false
        : isTouchDevice;

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by embedded iframe policy
    }
  }, []);

  const toggleTouchPad = useCallback(() => {
    soundEngine.playUiClick();
    setSettings((prev) => {
      const currentlyShown =
        prev.controller.touchMode === 'always' ||
        (prev.controller.touchMode === 'auto' && isTouchCapableDevice());
      return {
        ...prev,
        controller: {
          ...prev.controller,
          touchMode: currentlyShown ? 'off' : 'always',
        },
      };
    });
  }, []);

  const openSettings = useCallback(() => {
    soundEngine.playUiClick();
    if (shellState === 'playing') {
      resumeAfterSettingsRef.current = true;
      setShellState('paused');
    } else {
      resumeAfterSettingsRef.current = false;
    }
    if (shellState === 'replay' && !replayPaused) {
      resumeReplayAfterSettingsRef.current = true;
      setReplayPaused(true);
    } else {
      resumeReplayAfterSettingsRef.current = false;
    }
    setSettingsOpen(true);
  }, [shellState, replayPaused]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (resumeAfterSettingsRef.current) {
      resumeAfterSettingsRef.current = false;
      setShellState('playing');
    }
    if (resumeReplayAfterSettingsRef.current) {
      resumeReplayAfterSettingsRef.current = false;
      setReplayPaused(false);
    }
  }, []);

  const handleResetRecords = useCallback(() => {
    clearDeviceRecordStorage();
    setDeviceRecord({ wins: 0, bestFastestKo: null, highestCombo: 0 });
  }, []);

  // Verify pure combat rule invariants once on mount
  useEffect(() => {
    if (!verifyCombatRules()) {
      console.warn('Combat rules self-check failed');
    }
  }, []);

  // Ensure Web Audio unlocks on the very first user gesture anywhere (including ?autostart=1)
  useEffect(() => {
    const unlockAudio = () => {
      soundEngine.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    };
  }, []);

  // Mirror shellState to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  const startMatch = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playUiSelect();
    setSavedReplay(null);
    setSavedMatchHud(null);
    setMatchSeed(generateMatchSeed());
    setShellState('playing');
  }, []);

  const startReplay = useCallback(() => {
    if (!savedReplay) return;
    soundEngine.unlock();
    soundEngine.playUiSelect();
    setReplayOrigin('gameover');
    setReplayPaused(false);
    setReplaySpeed(1);
    setReplayProgress({
      elapsed: 0,
      total: savedReplay.durationSec,
      finished: false,
    });
    setReplaySeekKey((k) => k + 1);
    setShellState('replay');
  }, [savedReplay]);

  const startReplayFromHistory = useCallback((entry: MatchHistoryEntry) => {
    soundEngine.unlock();
    soundEngine.playUiSelect();
    setHistoryOpen(false);
    setSavedReplay(entry.replay);
    setReplayOrigin('history');
    setReplayPaused(false);
    setReplaySpeed(1);
    setReplayProgress({
      elapsed: 0,
      total: entry.replay.durationSec,
      finished: false,
    });
    setReplaySeekKey((k) => k + 1);
    setShellState('replay');
  }, []);

  const exitReplay = useCallback(() => {
    soundEngine.playUiClick();
    if (replayOrigin === 'history') {
      setShellState('title');
      setHistoryOpen(true);
    } else {
      setShellState('gameover');
    }
  }, [replayOrigin]);

  const restartReplay = useCallback(() => {
    if (!savedReplay) return;
    soundEngine.playUiClick();
    setReplayPaused(false);
    setReplayProgress({
      elapsed: 0,
      total: savedReplay.durationSec,
      finished: false,
    });
    setReplaySeekKey((k) => k + 1);
  }, [savedReplay]);

  const cycleReplaySpeed = useCallback(() => {
    soundEngine.playUiClick();
    setReplaySpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 0.5 : 1));
  }, []);

  const handleDeleteHistoryEntry = useCallback((id: string) => {
    setMatchHistory((prev) => removeMatchHistoryEntry(prev, id));
  }, []);

  const handleClearHistory = useCallback(() => {
    setMatchHistory(clearMatchHistory());
  }, []);

  const toggleMute = useCallback(() => {
    soundEngine.unlock();
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      saveMuteSetting(next);
      if (!next) {
        soundEngine.playUiClick();
      }
      return next;
    });
  }, []);

  const handleTouchInputs = useCallback((patch: Partial<InputState>) => {
    Object.assign(touchInputRef.current, patch);
  }, []);

  const handleMatchEnd = useCallback(
    (finalHud: HudSnapshot, replay: MatchReplay | null) => {
      setHud(finalHud);
      setSavedMatchHud(finalHud);
      setSavedReplay(replay);
      setShellState('gameover');

      if (replay && replay.frames.length > 0) {
        const entry: MatchHistoryEntry = {
          id: `${Date.now()}-${replay.seed}`,
          playedAt: Date.now(),
          winnerSlot: finalHud.winnerSlot,
          winReason: finalHud.winReason,
          roundWins: [...finalHud.roundWins] as [number, number],
          p1Stats: { ...finalHud.p1Stats },
          p2Stats: { ...finalHud.p2Stats },
          replay,
        };
        setMatchHistory((prev) => recordMatchToHistory(prev, entry));
      }

      // Update device record when P1 wins in 1P mode (or any local match win)
      if (finalHud.winnerSlot === 1 || mode === '2p') {
        const bestRoundCombo = Math.max(
          finalHud.p1Stats.maxCombo,
          mode === '2p' ? finalHud.p2Stats.maxCombo : 0,
        );
        const koTime = Math.round(finalHud.elapsedMatchTime * 10) / 10;
        setDeviceRecord((prev) => {
          const next: DeviceRecord = {
            wins: prev.wins + (finalHud.winnerSlot === 1 ? 1 : 0),
            bestFastestKo:
              prev.bestFastestKo === null ? koTime : Math.min(prev.bestFastestKo, koTime),
            highestCombo: Math.max(prev.highestCombo, bestRoundCombo),
          };
          saveDeviceRecord(next);
          return next;
        });
      }
    },
    [mode],
  );

  // Global keyboard shortcuts: Enter/Space to Start, Escape/P to Pause, Replay Space/Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen || historyOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (shellState === 'title') {
        if (e.code === 'Enter' || (e.code === 'Space' && tag !== 'BUTTON')) {
          e.preventDefault();
          startMatch();
        }
      } else if (shellState === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setShellState('paused');
        }
      } else if (shellState === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setShellState('playing');
        }
      } else if (shellState === 'replay') {
        if (e.code === 'Space' && tag !== 'BUTTON') {
          e.preventDefault();
          if (replayProgress.finished) {
            restartReplay();
          } else {
            setReplayPaused((p) => !p);
          }
        } else if (e.code === 'Escape') {
          e.preventDefault();
          exitReplay();
        }
      } else if (shellState === 'gameover') {
        if (e.code === 'Enter') {
          e.preventDefault();
          startMatch();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shellState, settingsOpen, historyOpen, startMatch, replayProgress.finished, restartReplay, exitReplay]);

  const p1Spec = FIGHTERS[p1Id];
  const p2Spec = FIGHTERS[p2Id];
  const activeInspectSpec = pickingSlot === 1 ? p1Spec : p2Spec;

  const activeReplay = shellState === 'replay' ? savedReplay : null;
  const hudMode = activeReplay ? activeReplay.mode : mode;
  const hudP1Spec = FIGHTERS[activeReplay ? activeReplay.p1Id : p1Id];
  const hudP2Spec = FIGHTERS[activeReplay ? activeReplay.p2Id : p2Id];

  const p1HpPct = hud ? Math.max(0, (hud.p1Hp / hud.p1MaxHp) * 100) : 100;
  const p1TrailPct = hud ? Math.max(0, (hud.p1TrailHp / hud.p1MaxHp) * 100) : 100;
  const p2HpPct = hud ? Math.max(0, (hud.p2Hp / hud.p2MaxHp) * 100) : 100;
  const p2TrailPct = hud ? Math.max(0, (hud.p2TrailHp / hud.p2MaxHp) * 100) : 100;

  const summaryHud = savedMatchHud ?? hud;
  const winnerSpec = useMemo(() => {
    if (!summaryHud?.winnerSlot) return null;
    return summaryHud.winnerSlot === 1 ? p1Spec : p2Spec;
  }, [summaryHud?.winnerSlot, p1Spec, p2Spec]);

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      {shellState === 'title' ? (
        <main className="grid h-dvh grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)] lg:grid-rows-1">
          {/* Live Attract-Mode Combat Stage */}
          <section className="relative min-h-0 lg:order-2">
            <ArenaCanvas
              shellState={shellState}
              mode={mode}
              difficulty={difficulty}
              p1Id={p1Id}
              p2Id={p2Id}
              stageId={stageId}
              matchSeed={matchSeed}
              settings={settings}
              touchInputRef={touchInputRef}
              onHudUpdate={setHud}
              onMatchEnd={handleMatchEnd}
            />
            <div className="pointer-events-none absolute right-4 bottom-4 rounded-control border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted">
              {STAGE_LIST.find((s) => s.id === stageId)?.name} · Live Sparring
            </div>
          </section>

          {/* Title & Fighter Selection Dock */}
          <aside className="flex max-h-[54dvh] min-h-0 flex-col justify-between overflow-y-auto border-t border-border bg-surface p-5 lg:max-h-none lg:border-t-0 lg:border-r lg:p-6">
            <div className="space-y-4">
              {/* Brand Lockup */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 32 32"
                      aria-hidden="true"
                      className="shrink-0 text-primary"
                    >
                      <path
                        d="M5 26 L25 6 M9 26 L27 8"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <circle cx="16" cy="16" r="3.5" fill="var(--color-accent)" />
                    </svg>
                    <h1 className="font-display text-display font-bold tracking-tight text-foreground">
                      Inkbound Clash
                    </h1>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Six distinct stickman fighters. Master powers, platforms, and ultimates.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openSettings}
                    aria-label="Open settings"
                    title="Settings"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Mode & Bot Difficulty Controls */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <div className="inline-flex rounded-control border border-border bg-background p-0.5" role="group" aria-label="Game mode">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setMode('1p');
                    }}
                    className={`min-h-9 rounded-[4px] px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      mode === '1p'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    1P vs Bot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setMode('2p');
                    }}
                    className={`min-h-9 rounded-[4px] px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      mode === '2p'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    2P Local
                  </button>
                </div>

                {mode === '1p' && (
                  <div className="inline-flex rounded-control border border-border bg-background p-0.5" role="group" aria-label="Bot difficulty">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setDifficulty('steady');
                      }}
                      className={`min-h-9 rounded-[4px] px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                        difficulty === 'steady'
                          ? 'bg-surface-elevated text-foreground'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      Steady
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setDifficulty('fierce');
                      }}
                      className={`min-h-9 rounded-[4px] px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                        difficulty === 'fierce'
                          ? 'bg-surface-elevated text-foreground'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      Fierce
                    </button>
                  </div>
                )}
              </div>

              {/* Fighter Slot Tabs (P1 / P2) */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex rounded-control border border-border bg-background p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setPickingSlot(1);
                      }}
                      className={`min-h-9 rounded-[4px] px-3 text-sm font-semibold whitespace-nowrap ${
                        pickingSlot === 1
                          ? 'bg-surface-elevated text-foreground'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      P1: {p1Spec.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setPickingSlot(2);
                      }}
                      className={`min-h-9 rounded-[4px] px-3 text-sm font-semibold whitespace-nowrap ${
                        pickingSlot === 2
                          ? 'bg-surface-elevated text-foreground'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {mode === '1p' ? 'Bot' : 'P2'}: {p2Spec.name}
                    </button>
                  </div>
                  <span className="text-xs text-muted">
                    {settings.other.roundsToWin === 1
                      ? '1 Round'
                      : `Best of ${settings.other.roundsToWin * 2 - 1}`}
                  </span>
                </div>

                {/* 6-Character Roster Strip */}
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Select stickman fighter">
                  {FIGHTER_LIST.map((f) => {
                    const isP1 = p1Id === f.id;
                    const isP2 = p2Id === f.id;
                    const isActive = (pickingSlot === 1 && isP1) || (pickingSlot === 2 && isP2);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiSelect();
                          if (pickingSlot === 1) setP1Id(f.id);
                          else setP2Id(f.id);
                        }}
                        className={`flex flex-col items-center gap-1 rounded-control border p-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                          isActive
                            ? 'border-accent bg-surface-elevated'
                            : 'border-border/70 bg-background hover:border-border'
                        }`}
                      >
                        <FighterPortrait fighter={f} size={46} />
                        <span className="text-xs font-semibold leading-tight text-foreground">
                          {f.name}
                        </span>
                        <span className="text-[10px] leading-none text-muted">
                          {isP1 && isP2 ? 'P1 · P2' : isP1 ? 'P1' : isP2 ? (mode === '1p' ? 'Bot' : 'P2') : f.epithet.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Fighter Superpower Loadout */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    {activeInspectSpec.name} — {activeInspectSpec.epithet}
                  </h2>
                  <span className="text-xs font-medium text-muted">
                    {activeInspectSpec.maxHp} HP · {activeInspectSpec.style}
                  </span>
                </div>

                <dl className="divide-y divide-border/50 text-sm">
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="font-semibold text-foreground whitespace-nowrap">
                      {activeInspectSpec.power1.name}
                    </dt>
                    <dd className="text-right text-xs text-muted">
                      {activeInspectSpec.power1.summary}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="font-semibold text-foreground whitespace-nowrap">
                      {activeInspectSpec.power2.name}
                    </dt>
                    <dd className="text-right text-xs text-muted">
                      {activeInspectSpec.power2.summary}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="font-semibold text-accent whitespace-nowrap">
                      {activeInspectSpec.ultimate.name}
                    </dt>
                    <dd className="text-right text-xs text-muted">
                      {activeInspectSpec.ultimate.summary}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Stage Selector */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                {STAGE_LIST.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiSelect();
                      setStageId(st.id);
                    }}
                    className={`min-h-9 rounded-control border px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      stageId === st.id
                        ? 'border-accent bg-surface-elevated text-foreground'
                        : 'border-border/60 bg-background text-muted hover:text-foreground'
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Action, Match History & Device Record */}
            <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-stretch gap-2">
                <Button
                  data-start="true"
                  onClick={startMatch}
                  className="flex-1 py-3 text-base font-semibold"
                >
                  <Swords className="h-5 w-5" />
                  Enter Arena
                </Button>
                <Button
                  tone="quiet"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setHistoryOpen(true);
                  }}
                  aria-label="Open match history"
                  className="shrink-0 px-3.5 py-3 text-sm font-semibold"
                >
                  <History className="h-4 w-4 text-accent" />
                  History ({matchHistory.length}/{MAX_MATCH_HISTORY})
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {mode === '1p'
                    ? 'WASD / Arrows move · Space jump · E/C block · F/G/H/T skills'
                    : 'P1: WASD + Space + F/G/H/T · P2: Arrows + Enter + J/K/L/U'}
                </span>
                {deviceRecord.wins > 0 && (
                  <span className="tabular-nums">
                    {deviceRecord.wins} {deviceRecord.wins === 1 ? 'win' : 'wins'} on this device
                  </span>
                )}
              </div>
            </div>
          </aside>
        </main>
      ) : (
        <main className="relative h-dvh w-full overflow-hidden bg-background">
          {/* Full-screen Live Arena Stage */}
          <div className="absolute inset-0">
            <ArenaCanvas
              shellState={shellState}
              mode={mode}
              difficulty={difficulty}
              p1Id={p1Id}
              p2Id={p2Id}
              stageId={stageId}
              matchSeed={matchSeed}
              controlsVisible={shellState === 'playing' && showTouchPad}
              settings={settings}
              replayData={savedReplay}
              replaySeekKey={replaySeekKey}
              replayPaused={replayPaused}
              replaySpeed={replaySpeed}
              onReplayProgress={setReplayProgress}
              touchInputRef={touchInputRef}
              onHudUpdate={setHud}
              onMatchEnd={handleMatchEnd}
            />
          </div>

          {/* Floating Combat HUD Strip (solid-alpha clusters, zero backdrop-filter) */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-2.5 pt-2 sm:gap-3 sm:px-5 sm:pt-3">
            {/* P1 HUD */}
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-card border border-border bg-surface/90 px-2.5 py-1.5 sm:gap-2.5 sm:px-3">
              <div className="hidden sm:block">
                <FighterPortrait fighter={hudP1Spec} size={40} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-display text-xs font-semibold text-foreground sm:text-sm">
                      P1 · {hudP1Spec.name}
                    </span>
                    <div className="flex items-center gap-1" aria-label="P1 round wins">
                      {Array.from({ length: hud?.roundsToWin ?? 2 }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-2 w-2 rounded-full border sm:h-2.5 sm:w-2.5 ${
                            (hud?.roundWins[0] ?? 0) > i
                              ? 'border-accent bg-accent'
                              : 'border-border bg-background'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      p1HpPct <= 30 ? 'text-amber-400' : 'text-muted'
                    }`}
                  >
                    {hud?.p1Hp ?? hudP1Spec.maxHp}
                  </span>
                </div>

                {/* HP Bar */}
                <div className="relative h-3 w-full overflow-hidden rounded-control border border-border bg-background">
                  <div
                    className="absolute inset-y-0 left-0 bg-foreground/75 transition-[width] duration-200 ease-out"
                    style={{ width: `${p1TrailPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${p1HpPct}%`, backgroundColor: hudP1Spec.color }}
                  />
                </div>

                {/* Energy & Cooldown Row */}
                <div className="flex items-center gap-2 text-[10px] font-medium tabular-nums text-muted sm:text-[11px]">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-control bg-background">
                    <div
                      className="h-full"
                      style={{
                        width: `${hud?.p1Energy ?? 0}%`,
                        backgroundColor:
                          (hud?.p1Energy ?? 0) >= 100 ? 'var(--color-accent)' : hudP1Spec.accentColor,
                      }}
                    />
                  </div>
                  <span className={(hud?.p1Energy ?? 0) >= 100 ? 'font-bold text-accent' : ''}>
                    {(hud?.p1Energy ?? 0) >= 100 ? 'ULT READY' : `${hud?.p1Energy ?? 0}%`}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Timer + Utility Controls */}
            <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-card border border-border bg-surface/90 px-2 py-1.5">
              <div className="flex items-center gap-1">
                {shellState !== 'replay' && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setShellState((s) => (s === 'paused' ? 'playing' : 'paused'));
                    }}
                    aria-label={shellState === 'paused' ? 'Resume match' : 'Pause match'}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
                  >
                    {shellState === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  </button>
                )}
                <div className="min-w-[2.8rem] rounded-control border border-border bg-background px-1.5 py-0.5 text-center font-display text-base font-bold tabular-nums text-foreground sm:min-w-[3.2rem] sm:text-lg">
                  {hud?.roundTimeLeft ?? 99}
                </div>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
                {shellState !== 'replay' && (
                  <button
                    type="button"
                    onClick={toggleTouchPad}
                    aria-label={showTouchPad ? 'Hide touch controller' : 'Show touch controller'}
                    aria-pressed={showTouchPad}
                    title={showTouchPad ? 'Hide Joystick' : 'Show Joystick'}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-control border transition-colors hover:brightness-110 ${
                      showTouchPad
                        ? 'border-accent bg-surface-elevated text-accent'
                        : 'border-border bg-surface-elevated text-muted'
                    }`}
                  >
                    <Gamepad2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openSettings}
                  aria-label="Open settings"
                  title="Settings"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <span className="text-[10px] font-medium leading-none text-muted sm:text-[11px]">
                {shellState === 'replay'
                  ? `Replay · Round ${hud?.roundNumber ?? 1}`
                  : `Round ${hud?.roundNumber ?? 1}`}
              </span>
            </div>

            {/* P2 HUD */}
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-card border border-border bg-surface/90 px-2.5 py-1.5 sm:gap-2.5 sm:px-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      p2HpPct <= 30 ? 'text-amber-400' : 'text-muted'
                    }`}
                  >
                    {hud?.p2Hp ?? hudP2Spec.maxHp}
                  </span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="flex items-center gap-1" aria-label="P2 round wins">
                      {Array.from({ length: hud?.roundsToWin ?? 2 }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-2 w-2 rounded-full border sm:h-2.5 sm:w-2.5 ${
                            (hud?.roundWins[1] ?? 0) > i
                              ? 'border-accent bg-accent'
                              : 'border-border bg-background'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="truncate font-display text-xs font-semibold text-foreground sm:text-sm">
                      {hudP2Spec.name} · {hudMode === '1p' ? 'Bot' : 'P2'}
                    </span>
                  </div>
                </div>

                {/* Mirrored HP Bar */}
                <div className="relative h-3 w-full overflow-hidden rounded-control border border-border bg-background">
                  <div
                    className="absolute inset-y-0 right-0 bg-foreground/75 transition-[width] duration-200 ease-out"
                    style={{ width: `${p2TrailPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0"
                    style={{ width: `${p2HpPct}%`, backgroundColor: hudP2Spec.color }}
                  />
                </div>

                {/* Energy Row */}
                <div className="flex items-center gap-2 text-[10px] font-medium tabular-nums text-muted sm:text-[11px]">
                  <span className={(hud?.p2Energy ?? 0) >= 100 ? 'font-bold text-accent' : ''}>
                    {(hud?.p2Energy ?? 0) >= 100 ? 'ULT READY' : `${hud?.p2Energy ?? 0}%`}
                  </span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-control bg-background">
                    <div
                      className="ml-auto h-full"
                      style={{
                        width: `${hud?.p2Energy ?? 0}%`,
                        backgroundColor:
                          (hud?.p2Energy ?? 0) >= 100 ? 'var(--color-accent)' : hudP2Spec.accentColor,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden sm:block">
                <FighterPortrait fighter={hudP2Spec} size={40} />
              </div>
            </div>
          </header>

          {/* Live Combo Counters */}
          {hud && hud.p1Combo >= 2 && (shellState === 'playing' || shellState === 'replay') && (
            <div className="pointer-events-none absolute top-24 left-4 z-10 rounded-control border border-border bg-surface/95 px-3 py-1 font-display text-base font-bold tabular-nums text-accent sm:text-lg">
              {hud.p1Combo} Hit Combo
            </div>
          )}
          {hud && hud.p2Combo >= 2 && (shellState === 'playing' || shellState === 'replay') && (
            <div className="pointer-events-none absolute top-24 right-4 z-10 rounded-control border border-border bg-surface/95 px-3 py-1 font-display text-base font-bold tabular-nums text-accent sm:text-lg">
              {hud.p2Combo} Hit Combo
            </div>
          )}

            {/* Pre-Fight Character Dialogue Exchange */}
            {hud?.phase === 'intro' &&
              hud.introDialogue &&
              hud.introDialogue.activeSpeaker !== null &&
              (shellState === 'playing' || shellState === 'replay') && (
                <div
                  className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 sm:px-6 ${
                    shellState === 'replay' ? 'bottom-32 sm:bottom-36' : 'bottom-5 sm:bottom-9'
                  }`}
                  aria-live="polite"
                >
                  <div className="flex w-full max-w-3xl flex-col items-center gap-2">
                    <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                      {/* P1 Dialogue Card */}
                      <div
                        className={`flex items-start gap-3 rounded-card border bg-surface/95 px-3.5 py-2.5 shadow-surface transition-opacity duration-200 ${
                          hud.introDialogue.activeSpeaker === 1
                            ? 'opacity-100'
                            : 'opacity-70'
                        }`}
                        style={{
                          borderColor:
                            hud.introDialogue.activeSpeaker === 1
                              ? hudP1Spec.accentColor
                              : 'var(--color-border)',
                        }}
                      >
                        <div className="shrink-0 pt-0.5">
                          <FighterPortrait fighter={hudP1Spec} size={42} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-display text-xs font-bold tracking-wide text-foreground uppercase">
                              P1 · {hudP1Spec.name}
                            </span>
                            <span
                              className="text-[10px] font-semibold tracking-wide uppercase"
                              style={{ color: hudP1Spec.accentColor }}
                            >
                              {hudP1Spec.epithet}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-snug font-medium text-foreground">
                            “{hud.introDialogue.p1Line}”
                          </p>
                        </div>
                      </div>

                      {/* P2 Dialogue Card */}
                      <div
                        className={`flex items-start gap-3 rounded-card border bg-surface/95 px-3.5 py-2.5 shadow-surface transition-opacity duration-200 ${
                          hud.introDialogue.activeSpeaker === 2
                            ? 'opacity-100'
                            : 'opacity-50'
                        }`}
                        style={{
                          borderColor:
                            hud.introDialogue.activeSpeaker === 2
                              ? hudP2Spec.accentColor
                              : 'var(--color-border)',
                        }}
                      >
                        <div className="min-w-0 flex-1 text-left sm:text-right">
                          <div className="flex items-center justify-between gap-2 sm:flex-row-reverse">
                            <span className="truncate font-display text-xs font-bold tracking-wide text-foreground uppercase">
                              {hudMode === '1p' ? 'Bot' : 'P2'} · {hudP2Spec.name}
                            </span>
                            <span
                              className="text-[10px] font-semibold tracking-wide uppercase"
                              style={{ color: hudP2Spec.accentColor }}
                            >
                              {hudP2Spec.epithet}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-snug font-medium text-foreground">
                            {hud.introDialogue.activeSpeaker === 2
                              ? `“${hud.introDialogue.p2Line}”`
                              : 'Listening...'}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <FighterPortrait fighter={hudP2Spec} size={42} />
                        </div>
                      </div>
                    </div>

                    {shellState === 'playing' && (
                      <span className="rounded-control border border-border/80 bg-surface/90 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                        Press {formatKeyCode(settings.controller.p1Keys.attack)} or{' '}
                        {formatKeyCode(settings.controller.p1Keys.jump)} to skip
                      </span>
                    )}
                  </div>
                </div>
              )}

            {/* Round Intro / Round End / Victory Pose Banner */}
            {hud?.bannerText && (shellState === 'playing' || shellState === 'replay') && (
              <div
                className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${
                  hud.phase === 'victory' ? 'top-20 sm:top-24' : 'top-1/3'
                }`}
              >
                <div className="rounded-card border border-border bg-surface/95 px-7 py-3 text-center shadow-surface">
                  <p className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {hud.bannerText}
                  </p>
                  {hud.winReason && (hud.phase === 'round_end' || hud.phase === 'victory') && (
                    <p className="mt-0.5 text-sm font-medium text-muted">
                      {hud.phase === 'victory' ? `Champion · ${hud.winReason}` : hud.winReason}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pause Modal */}
            {shellState === 'paused' && !settingsOpen && (
              <div
                className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Match paused"
              >
                <Surface className="w-full max-w-md space-y-4 p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-bold text-foreground">Paused</h2>
                    <span className="text-xs text-muted">Esc or P to resume</span>
                  </div>

                  <div className="space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted">
                    <p className="font-semibold text-foreground">Controls</p>
                    {mode === '1p' ? (
                      <p>
                        Move: WASD / Arrows · Jump: Space · Drop: Q / V · Block: E / C · Strike: F / J ·
                        Skills: G / K, H / L · Ultimate: T / U · Dash: Shift
                      </p>
                    ) : (
                      <>
                        <p>P1: WASD move · Space jump · C block · F/G/H/T skills · Left Shift dash</p>
                        <p>P2: Arrows move · Enter/0 jump · M block · J/K/L/U skills · / dash</p>
                      </>
                    )}
                  </div>

                  {mode === '1p' && (
                    <div className="flex items-center justify-between border-t border-border/60 pt-3">
                      <span className="text-sm font-medium text-foreground">Bot Difficulty</span>
                      <div className="inline-flex rounded-control border border-border bg-background p-0.5">
                        <button
                          type="button"
                          onClick={() => setDifficulty('steady')}
                          className={`min-h-8 rounded-[4px] px-2.5 text-xs font-medium ${
                            difficulty === 'steady'
                              ? 'bg-surface-elevated text-foreground'
                              : 'text-muted'
                          }`}
                        >
                          Steady
                        </button>
                        <button
                          type="button"
                          onClick={() => setDifficulty('fierce')}
                          className={`min-h-8 rounded-[4px] px-2.5 text-xs font-medium ${
                            difficulty === 'fierce'
                              ? 'bg-surface-elevated text-foreground'
                              : 'text-muted'
                          }`}
                        >
                          Fierce
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                    <Button
                      onClick={() => {
                        soundEngine.playUiClick();
                        setShellState('playing');
                      }}
                      autoFocus
                    >
                      <Play className="h-4 w-4" />
                      Resume Clash
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      <Button tone="quiet" onClick={openSettings}>
                        <Settings className="h-4 w-4" />
                        Settings
                      </Button>
                      <Button tone="quiet" onClick={startMatch}>
                        <RotateCcw className="h-4 w-4" />
                        Restart
                      </Button>
                      <Button
                        tone="quiet"
                        onClick={() => {
                          soundEngine.playUiClick();
                          setShellState('title');
                        }}
                      >
                        Roster
                      </Button>
                    </div>
                  </div>
                </Surface>
              </div>
            )}

            {/* Game Over / Match Summary Modal */}
            {shellState === 'gameover' && summaryHud && (
              <div
                className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Match result"
              >
                <Surface className="w-full max-w-lg space-y-4 p-6">
                  <div className="flex items-center gap-4">
                    {winnerSpec && <FighterPortrait fighter={winnerSpec} size={64} />}
                    <div className="min-w-0">
                      <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                        {winnerSpec
                          ? `${winnerSpec.name} Wins the Match`
                          : 'Match Draw'}
                      </h2>
                      <p className="text-sm text-muted">
                        {summaryHud.winReason} · Final Rounds {summaryHud.roundWins[0]} –{' '}
                        {summaryHud.roundWins[1]}
                      </p>
                    </div>
                  </div>

                  {/* Computed Match Breakdown */}
                  <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-3 text-sm">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">P1 · {p1Spec.name}</p>
                      <p className="text-xs text-muted tabular-nums">
                        Damage dealt: {summaryHud.p1Stats.damageDealt}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        Best combo: {summaryHud.p1Stats.maxCombo} hits
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        Powers landed: {summaryHud.p1Stats.powersLanded}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">
                        {mode === '1p' ? 'Bot' : 'P2'} · {p2Spec.name}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        Damage dealt: {summaryHud.p2Stats.damageDealt}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        Best combo: {summaryHud.p2Stats.maxCombo} hits
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        Powers landed: {summaryHud.p2Stats.powersLanded}
                      </p>
                    </div>
                  </div>

                  {/* Device Personal Records & Saved Seed */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted tabular-nums">
                    <span>Best on this device: {deviceRecord.wins} wins</span>
                    {deviceRecord.bestFastestKo !== null && (
                      <span>Fastest KO: {deviceRecord.bestFastestKo}s</span>
                    )}
                    <span>Record combo: {deviceRecord.highestCombo} hits</span>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                    <Button onClick={startMatch} className="flex-1" autoFocus>
                      <RotateCcw className="h-4 w-4" />
                      Play Again
                    </Button>
                    {savedReplay && savedReplay.frames.length > 0 && (
                      <Button tone="quiet" onClick={startReplay}>
                        <Film className="h-4 w-4" />
                        Watch Replay ({formatReplayDuration(savedReplay.durationSec)})
                      </Button>
                    )}
                    <Button
                      tone="quiet"
                      onClick={() => {
                        soundEngine.playUiClick();
                        setShellState('title');
                      }}
                    >
                      Change Fighters
                    </Button>
                  </div>
                </Surface>
              </div>
            )}

            {/* Replay Playback Control Bar */}
            {shellState === 'replay' && savedReplay && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 sm:bottom-4 sm:px-6">
                <Surface className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2.5 bg-surface/95 px-4 py-3 shadow-surface">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-control border border-accent/40 bg-accent/15 px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-accent uppercase">
                        <Film className="h-3 w-3" />
                        Match Replay
                      </span>
                      <span className="text-muted tabular-nums">Seed #{savedReplay.seed}</span>
                    </div>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatReplayDuration(replayProgress.elapsed)} /{' '}
                      {formatReplayDuration(replayProgress.total)}
                    </span>
                  </div>

                  {/* Progress Track */}
                  <div
                    className="relative h-2 w-full overflow-hidden rounded-control border border-border bg-background"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(replayProgress.total)}
                    aria-valuenow={Math.round(replayProgress.elapsed)}
                    aria-label="Replay progress"
                  >
                    <div
                      className="h-full bg-accent transition-[width] duration-75"
                      style={{
                        width: `${
                          replayProgress.total > 0
                            ? Math.min(100, (replayProgress.elapsed / replayProgress.total) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        onClick={() => {
                          soundEngine.playUiClick();
                          if (replayProgress.finished) {
                            restartReplay();
                          } else {
                            setReplayPaused((p) => !p);
                          }
                        }}
                        className="min-h-9 px-3 py-1.5 text-xs"
                      >
                        {replayProgress.finished ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Replay Again
                          </>
                        ) : replayPaused ? (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            Pause
                          </>
                        )}
                      </Button>

                      <Button
                        tone="quiet"
                        onClick={cycleReplaySpeed}
                        aria-label={`Playback speed ${replaySpeed}x`}
                        className="min-h-9 px-3 py-1.5 text-xs tabular-nums"
                      >
                        {replaySpeed}x Speed
                      </Button>

                      <Button
                        tone="quiet"
                        onClick={restartReplay}
                        aria-label="Restart replay"
                        className="min-h-9 px-3 py-1.5 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restart
                      </Button>
                    </div>

                    <Button
                      tone="quiet"
                      onClick={exitReplay}
                      className="min-h-9 px-3 py-1.5 text-xs"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {replayOrigin === 'history' ? 'Return to History' : 'Return to Results'}
                    </Button>
                  </div>
                </Surface>
              </div>
            )}

          {/* Floating On-Screen Joystick & Combat Buttons */}
          <TouchControls
            fighter={p1Spec}
            hud={hud}
            active={shellState === 'playing' && hud?.phase === 'fight'}
            visible={
              showTouchPad &&
              shellState === 'playing' &&
              hud?.phase !== 'victory' &&
              !hud?.introDialogue?.activeSpeaker
            }
            deadzone={settings.controller.joystickDeadzone}
            scale={settings.controller.controlScale}
            opacity={settings.controller.controlOpacity}
            swapSides={settings.controller.swapTouchSides}
            onInputsChange={handleTouchInputs}
          />

          {/* Subtle keyboard hint when touch controller is toggled off on desktop */}
          {!showTouchPad && shellState === 'playing' && !hud?.introDialogue?.activeSpeaker && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 hidden justify-center px-4 md:flex">
              <div className="pointer-events-auto flex items-center gap-3 rounded-control border border-border bg-surface/90 px-3 py-1 text-xs text-muted">
                <span>
                  {mode === '1p'
                    ? `${formatKeyCode(settings.controller.p1Keys.forward)}/${formatKeyCode(settings.controller.p1Keys.left)}/${formatKeyCode(settings.controller.p1Keys.back)}/${formatKeyCode(settings.controller.p1Keys.right)} Move · ${formatKeyCode(settings.controller.p1Keys.jump)} Jump · ${formatKeyCode(settings.controller.p1Keys.block)} Block · ${formatKeyCode(settings.controller.p1Keys.attack)} Attack · ${formatKeyCode(settings.controller.p1Keys.power1)}/${formatKeyCode(settings.controller.p1Keys.power2)}/${formatKeyCode(settings.controller.p1Keys.ultimate)} Skills · ${formatKeyCode(settings.controller.p1Keys.dash)} Dash`
                    : `P1: ${formatKeyCode(settings.controller.p1Keys.forward)}${formatKeyCode(settings.controller.p1Keys.left)}${formatKeyCode(settings.controller.p1Keys.back)}${formatKeyCode(settings.controller.p1Keys.right)} + ${formatKeyCode(settings.controller.p1Keys.jump)} · P2: Arrows + Enter + J/K/L/U`}
                </span>
                <span>Esc / P Pause</span>
              </div>
            </div>
          )}
        </main>
      )}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        muted={muted}
        onToggleMute={toggleMute}
        onChange={setSettings}
        onResetRecords={handleResetRecords}
        onClose={closeSettings}
      />

      <MatchHistoryModal
        open={historyOpen}
        entries={matchHistory}
        onWatchReplay={startReplayFromHistory}
        onDeleteEntry={handleDeleteHistoryEntry}
        onClearAll={handleClearHistory}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
