import type { GameSettings, GraphicsPreset, GraphicsSettings, P1KeyBindings } from './types';

const SETTINGS_STORAGE_KEY = 'inkbound_clash_settings_v1';

export const DEFAULT_P1_KEYS: P1KeyBindings = {
  left: 'KeyA',
  right: 'KeyD',
  forward: 'KeyW',
  back: 'KeyS',
  jump: 'Space',
  drop: 'KeyQ',
  block: 'KeyE',
  attack: 'KeyF',
  power1: 'KeyG',
  power2: 'KeyH',
  ultimate: 'KeyT',
  dash: 'ShiftLeft',
};

export const GRAPHICS_PRESETS: Record<
  Exclude<GraphicsPreset, 'custom'>,
  Pick<GraphicsSettings, 'renderScale' | 'shadows' | 'particleDensity'>
> = {
  low: {
    renderScale: 0.65,
    shadows: false,
    particleDensity: 'low',
  },
  medium: {
    renderScale: 0.85,
    shadows: true,
    particleDensity: 'normal',
  },
  high: {
    renderScale: 1.0,
    shadows: true,
    particleDensity: 'high',
  },
};

export function createDefaultSettings(): GameSettings {
  return {
    graphics: {
      preset: 'high',
      renderScale: 1.0,
      shadows: true,
      particleDensity: 'normal',
      brightness: 1.0,
      dynamicCamera: true,
      screenShake: true,
    },
    controller: {
      touchMode: 'always',
      joystickDeadzone: 0.16,
      controlScale: 1.0,
      controlOpacity: 0.95,
      swapTouchSides: false,
      p1Keys: { ...DEFAULT_P1_KEYS },
    },
    other: {
      masterVolume: 85,
      roundDuration: 99,
      roundsToWin: 2,
      showDamageNumbers: true,
    },
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function loadSettings(): GameSettings {
  const defaults = createDefaultSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;

    const g = parsed.graphics ?? ({} as Partial<GameSettings['graphics']>);
    const c = parsed.controller ?? ({} as Partial<GameSettings['controller']>);
    const o = parsed.other ?? ({} as Partial<GameSettings['other']>);

    const p1Keys: P1KeyBindings = { ...DEFAULT_P1_KEYS };
    if (c.p1Keys && typeof c.p1Keys === 'object') {
      (Object.keys(DEFAULT_P1_KEYS) as Array<keyof P1KeyBindings>).forEach((k) => {
        const v = c.p1Keys?.[k];
        if (typeof v === 'string' && v.length > 0) {
          p1Keys[k] = v;
        }
      });
    }

    return {
      graphics: {
        preset:
          g.preset === 'low' || g.preset === 'medium' || g.preset === 'high' || g.preset === 'custom'
            ? g.preset
            : defaults.graphics.preset,
        renderScale:
          typeof g.renderScale === 'number' && Number.isFinite(g.renderScale)
            ? clamp(g.renderScale, 0.5, 1.0)
            : defaults.graphics.renderScale,
        shadows: typeof g.shadows === 'boolean' ? g.shadows : defaults.graphics.shadows,
        particleDensity:
          g.particleDensity === 'low' || g.particleDensity === 'normal' || g.particleDensity === 'high'
            ? g.particleDensity
            : defaults.graphics.particleDensity,
        brightness:
          typeof g.brightness === 'number' && Number.isFinite(g.brightness)
            ? clamp(g.brightness, 0.8, 1.3)
            : defaults.graphics.brightness,
        dynamicCamera:
          typeof g.dynamicCamera === 'boolean' ? g.dynamicCamera : defaults.graphics.dynamicCamera,
        screenShake:
          typeof g.screenShake === 'boolean' ? g.screenShake : defaults.graphics.screenShake,
      },
      controller: {
        touchMode:
          c.touchMode === 'always' || c.touchMode === 'auto' || c.touchMode === 'off'
            ? c.touchMode
            : defaults.controller.touchMode,
        joystickDeadzone:
          typeof c.joystickDeadzone === 'number' && Number.isFinite(c.joystickDeadzone)
            ? clamp(c.joystickDeadzone, 0.08, 0.28)
            : defaults.controller.joystickDeadzone,
        controlScale:
          typeof c.controlScale === 'number' && Number.isFinite(c.controlScale)
            ? clamp(c.controlScale, 0.8, 1.25)
            : defaults.controller.controlScale,
        controlOpacity:
          typeof c.controlOpacity === 'number' && Number.isFinite(c.controlOpacity)
            ? clamp(c.controlOpacity, 0.45, 1.0)
            : defaults.controller.controlOpacity,
        swapTouchSides:
          typeof c.swapTouchSides === 'boolean'
            ? c.swapTouchSides
            : defaults.controller.swapTouchSides,
        p1Keys,
      },
      other: {
        masterVolume:
          typeof o.masterVolume === 'number' && Number.isFinite(o.masterVolume)
            ? clamp(Math.round(o.masterVolume), 0, 100)
            : defaults.other.masterVolume,
        roundDuration:
          o.roundDuration === 60 || o.roundDuration === 99 || o.roundDuration === 120
            ? o.roundDuration
            : defaults.other.roundDuration,
        roundsToWin:
          o.roundsToWin === 1 || o.roundsToWin === 2 || o.roundsToWin === 3
            ? o.roundsToWin
            : defaults.other.roundsToWin,
        showDamageNumbers:
          typeof o.showDamageNumbers === 'boolean'
            ? o.showDamageNumbers
            : defaults.other.showDamageNumbers,
      },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function clearDeviceRecordStorage(): void {
  try {
    window.localStorage.removeItem('inkbound_clash_records_v1');
  } catch {
    // Ignore storage failures
  }
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'Space') return 'Space';
  if (code === 'ArrowUp') return 'Up';
  if (code === 'ArrowDown') return 'Down';
  if (code === 'ArrowLeft') return 'Left';
  if (code === 'ArrowRight') return 'Right';
  return code;
}

export function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 900;
}
