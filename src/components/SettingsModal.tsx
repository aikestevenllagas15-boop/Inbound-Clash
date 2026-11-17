import { useEffect, useState } from 'react';
import { Gamepad2, Monitor, RotateCcw, Sliders, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  createDefaultSettings,
  DEFAULT_P1_KEYS,
  formatKeyCode,
  GRAPHICS_PRESETS,
} from '../game/settings';
import type {
  GameSettings,
  GraphicsPreset,
  P1KeyAction,
  ParticleDensity,
  TouchControlsMode,
} from '../game/types';
import { Button, Surface } from './ui';

type SettingsTab = 'graphics' | 'controllers' | 'other';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  muted: boolean;
  onToggleMute: () => void;
  onChange: (next: GameSettings) => void;
  onResetRecords: () => void;
  onClose: () => void;
}

const KEY_LABELS: Array<{ action: P1KeyAction; label: string }> = [
  { action: 'forward', label: 'Move Up / In' },
  { action: 'back', label: 'Move Down / Out' },
  { action: 'left', label: 'Move Left' },
  { action: 'right', label: 'Move Right' },
  { action: 'jump', label: 'Jump' },
  { action: 'drop', label: 'Drop Platform' },
  { action: 'block', label: 'Block' },
  { action: 'dash', label: 'Dash' },
  { action: 'attack', label: 'Attack' },
  { action: 'power1', label: 'Skill 1' },
  { action: 'power2', label: 'Skill 2' },
  { action: 'ultimate', label: 'Ultimate' },
];

function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          soundEngine.playUiClick();
          onToggle();
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'border-accent bg-primary' : 'border-border bg-background'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-foreground transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <label className="block space-y-1.5 py-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-accent">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-control bg-background accent-primary"
      />
    </label>
  );
}

export function SettingsModal({
  open,
  settings,
  muted,
  onToggleMute,
  onChange,
  onResetRecords,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('graphics');
  const [listeningAction, setListeningAction] = useState<P1KeyAction | null>(null);
  const [confirmClearRecords, setConfirmClearRecords] = useState(false);

  useEffect(() => {
    if (!open) {
      setListeningAction(null);
      setConfirmClearRecords(false);
    }
  }, [open]);

  // Handle key capture for P1 keybinding or Escape to close modal
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setListeningAction(null);
          return;
        }
        const prevCode = settings.controller.p1Keys[listeningAction];
        const nextKeys = { ...settings.controller.p1Keys };
        // Swap if another P1 action already uses this key
        (Object.keys(nextKeys) as P1KeyAction[]).forEach((act) => {
          if (act !== listeningAction && nextKeys[act] === e.code) {
            nextKeys[act] = prevCode;
          }
        });
        nextKeys[listeningAction] = e.code;
        soundEngine.playUiSelect();
        onChange({
          ...settings,
          controller: { ...settings.controller, p1Keys: nextKeys },
        });
        setListeningAction(null);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, listeningAction, settings, onChange, onClose]);

  if (!open) return null;

  const applyPreset = (preset: Exclude<GraphicsPreset, 'custom'>) => {
    soundEngine.playUiSelect();
    const p = GRAPHICS_PRESETS[preset];
    onChange({
      ...settings,
      graphics: {
        ...settings.graphics,
        preset,
        renderScale: p.renderScale,
        shadows: p.shadows,
        particleDensity: p.particleDensity,
      },
    });
  };

  const updateGraphics = (patch: Partial<GameSettings['graphics']>, markCustom = true) => {
    onChange({
      ...settings,
      graphics: {
        ...settings.graphics,
        ...patch,
        preset: markCustom ? 'custom' : patch.preset ?? settings.graphics.preset,
      },
    });
  };

  const updateController = (patch: Partial<GameSettings['controller']>) => {
    onChange({
      ...settings,
      controller: {
        ...settings.controller,
        ...patch,
      },
    });
  };

  const updateOther = (patch: Partial<GameSettings['other']>) => {
    onChange({
      ...settings,
      other: {
        ...settings.other,
        ...patch,
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Game Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          soundEngine.playUiClick();
          onClose();
        }
      }}
    >
      <Surface className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Settings</h2>
            <p className="text-xs text-muted">Graphics, controller layout, keybinds & match rules</p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            aria-label="Close settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface-elevated text-foreground hover:brightness-110"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="grid grid-cols-3 gap-1 border-b border-border bg-background/60 p-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              setTab('graphics');
            }}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              tab === 'graphics'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Monitor className="h-4 w-4" />
            Graphics
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              setTab('controllers');
            }}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              tab === 'controllers'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Gamepad2 className="h-4 w-4" />
            Controllers
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              setTab('other');
            }}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors sm:text-sm ${
              tab === 'other'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Sliders className="h-4 w-4" />
            Others
          </button>
        </div>

        {/* Tab Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'graphics' && (
            <div className="space-y-4">
              {/* Quality Preset */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Quality Preset</span>
                  {settings.graphics.preset === 'custom' && (
                    <span className="text-xs font-semibold text-accent">Custom</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5 rounded-control border border-border bg-background p-1">
                  {(['low', 'medium', 'high'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`min-h-9 rounded-[4px] text-xs font-semibold capitalize transition-colors sm:text-sm ${
                        settings.graphics.preset === preset
                          ? 'bg-surface-elevated text-foreground ring-1 ring-accent/60'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-border/50 border-t border-border/60 pt-2">
                <SliderRow
                  label="Resolution Scale"
                  valueLabel={`${Math.round(settings.graphics.renderScale * 100)}%`}
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={settings.graphics.renderScale}
                  onChange={(renderScale) => updateGraphics({ renderScale })}
                />

                <div className="py-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Particle Effects</p>
                      <p className="text-xs text-muted">Sparks, flames, ice & impact trails</p>
                    </div>
                    <div className="inline-flex rounded-control border border-border bg-background p-0.5">
                      {(['low', 'normal', 'high'] as ParticleDensity[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            soundEngine.playUiClick();
                            updateGraphics({ particleDensity: d });
                          }}
                          className={`min-h-8 rounded-[4px] px-2.5 text-xs font-semibold capitalize ${
                            settings.graphics.particleDensity === d
                              ? 'bg-surface-elevated text-foreground'
                              : 'text-muted hover:text-foreground'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <ToggleRow
                  label="Dynamic Shadows"
                  hint="Real-time directional shadows on fighters & platforms"
                  checked={settings.graphics.shadows}
                  onToggle={() => updateGraphics({ shadows: !settings.graphics.shadows })}
                />

                <SliderRow
                  label="Scene Brightness"
                  valueLabel={`${Math.round(settings.graphics.brightness * 100)}%`}
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={settings.graphics.brightness}
                  onChange={(brightness) => updateGraphics({ brightness }, false)}
                />

                <ToggleRow
                  label="Dynamic Camera"
                  hint="Smoothly zoom & pan to frame both fighters"
                  checked={settings.graphics.dynamicCamera}
                  onToggle={() =>
                    updateGraphics({ dynamicCamera: !settings.graphics.dynamicCamera }, false)
                  }
                />

                <ToggleRow
                  label="Screen Shake"
                  hint="Impact camera shake on heavy strikes, wall bounces & ultimates"
                  checked={settings.graphics.screenShake}
                  onToggle={() =>
                    updateGraphics({ screenShake: !settings.graphics.screenShake }, false)
                  }
                />
              </div>
            </div>
          )}

          {tab === 'controllers' && (
            <div className="space-y-4">
              {/* On-Screen Controller Mode */}
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">
                  On-Screen Joystick & Buttons
                </span>
                <div className="grid grid-cols-3 gap-1.5 rounded-control border border-border bg-background p-1">
                  {(
                    [
                      { id: 'always', label: 'Always On' },
                      { id: 'auto', label: 'Auto (Touch)' },
                      { id: 'off', label: 'Hidden' },
                    ] as Array<{ id: TouchControlsMode; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiSelect();
                        updateController({ touchMode: opt.id });
                      }}
                      className={`min-h-9 rounded-[4px] text-xs font-semibold transition-colors sm:text-sm ${
                        settings.controller.touchMode === opt.id
                          ? 'bg-surface-elevated text-foreground ring-1 ring-accent/60'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-border/50 border-t border-border/60 pt-1">
                <ToggleRow
                  label="Swap Left / Right Layout"
                  hint="Place joystick on the right and combat buttons on the left"
                  checked={settings.controller.swapTouchSides}
                  onToggle={() =>
                    updateController({ swapTouchSides: !settings.controller.swapTouchSides })
                  }
                />

                <SliderRow
                  label="Touch Control Scale"
                  valueLabel={`${Math.round(settings.controller.controlScale * 100)}%`}
                  min={0.8}
                  max={1.25}
                  step={0.05}
                  value={settings.controller.controlScale}
                  onChange={(controlScale) => updateController({ controlScale })}
                />

                <SliderRow
                  label="Touch Control Opacity"
                  valueLabel={`${Math.round(settings.controller.controlOpacity * 100)}%`}
                  min={0.45}
                  max={1.0}
                  step={0.05}
                  value={settings.controller.controlOpacity}
                  onChange={(controlOpacity) => updateController({ controlOpacity })}
                />

                <SliderRow
                  label="Joystick Deadzone"
                  valueLabel={`${Math.round(settings.controller.joystickDeadzone * 100)}%`}
                  min={0.08}
                  max={0.28}
                  step={0.02}
                  value={settings.controller.joystickDeadzone}
                  onChange={(joystickDeadzone) => updateController({ joystickDeadzone })}
                />
              </div>

              {/* P1 Keyboard Remapper */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Player 1 Keybindings</p>
                    <p className="text-xs text-muted">
                      {listeningAction
                        ? 'Press any key to bind (Esc to cancel)...'
                        : 'Click any action to rebind its keyboard key'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setListeningAction(null);
                      updateController({ p1Keys: { ...DEFAULT_P1_KEYS } });
                    }}
                    className="rounded-control border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-foreground hover:brightness-110"
                  >
                    Reset Keys
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {KEY_LABELS.map(({ action, label }) => {
                    const isListening = listeningAction === action;
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiClick();
                          setListeningAction(isListening ? null : action);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-control border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          isListening
                            ? 'border-accent bg-surface-elevated text-accent'
                            : 'border-border/70 bg-background text-foreground hover:border-border'
                        }`}
                      >
                        <span className="truncate text-muted">{label}</span>
                        <span className="shrink-0 rounded-[4px] border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                          {isListening ? 'Press Key' : formatKeyCode(settings.controller.p1Keys[action])}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="pt-1 text-[11px] text-muted">
                  2P Local Player 2: Arrow keys move · Enter / Num 0 jump · M block · J/K/L/U attack &
                  skills · / dash
                </p>
              </div>
            </div>
          )}

          {tab === 'other' && (
            <div className="space-y-4">
              <div className="divide-y divide-border/50">
                <SliderRow
                  label="Master Volume"
                  valueLabel={muted ? 'Muted' : `${settings.other.masterVolume}%`}
                  min={0}
                  max={100}
                  step={5}
                  value={settings.other.masterVolume}
                  onChange={(masterVolume) => updateOther({ masterVolume })}
                />

                <ToggleRow
                  label="Sound Effects"
                  hint="Combat hits, elemental powers, gong & UI feedback"
                  checked={!muted}
                  onToggle={onToggleMute}
                />

                {/* Rounds to Win */}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Match Format</p>
                    <p className="text-xs text-muted">Applies when starting or restarting a match</p>
                  </div>
                  <div className="inline-flex rounded-control border border-border bg-background p-0.5">
                    {(
                      [
                        { val: 1, label: '1 Round' },
                        { val: 2, label: 'Best of 3' },
                        { val: 3, label: 'Best of 5' },
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.val}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiClick();
                          updateOther({ roundsToWin: r.val });
                        }}
                        className={`min-h-8 rounded-[4px] px-2.5 text-xs font-semibold ${
                          settings.other.roundsToWin === r.val
                            ? 'bg-surface-elevated text-foreground'
                            : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Round Duration */}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Round Timer</p>
                    <p className="text-xs text-muted">Seconds per round</p>
                  </div>
                  <div className="inline-flex rounded-control border border-border bg-background p-0.5">
                    {([60, 99, 120] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiClick();
                          updateOther({ roundDuration: sec });
                        }}
                        className={`min-h-8 rounded-[4px] px-2.5 text-xs font-semibold tabular-nums ${
                          settings.other.roundDuration === sec
                            ? 'bg-surface-elevated text-foreground'
                            : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow
                  label="Damage & Status Callouts"
                  hint="Show floating damage numbers, BLOCK, FROZEN & skill tags"
                  checked={settings.other.showDamageNumbers}
                  onToggle={() =>
                    updateOther({ showDamageNumbers: !settings.other.showDamageNumbers })
                  }
                />
              </div>

              {/* Maintenance Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <Button
                  tone="quiet"
                  onClick={() => {
                    soundEngine.playUiClick();
                    if (!confirmClearRecords) {
                      setConfirmClearRecords(true);
                    } else {
                      onResetRecords();
                      setConfirmClearRecords(false);
                    }
                  }}
                  className="min-h-9 px-3 text-xs"
                >
                  {confirmClearRecords ? 'Click Again to Confirm Reset' : 'Reset Device Records'}
                </Button>

                <Button
                  tone="quiet"
                  onClick={() => {
                    soundEngine.playUiSelect();
                    onChange(createDefaultSettings());
                  }}
                  className="min-h-9 px-3 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore Defaults
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="min-h-10 px-5 text-sm"
          >
            Done
          </Button>
        </div>
      </Surface>
    </div>
  );
}
