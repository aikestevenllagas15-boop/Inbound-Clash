import { useEffect, useRef, useState } from 'react';
import { computeBotInput, createBotMemory } from '../game/ai';
import { buildHudSnapshot, createMatch, stepMatch } from '../game/engine';
import { Arena3DController } from '../game/scene3d';
import { packInput, unpackInput } from '../game/replay';
import { createDefaultSettings } from '../game/settings';
import type {
  BotDifficulty,
  FighterId,
  GameMode,
  GameSettings,
  GraphicsSettings,
  HudSnapshot,
  InputState,
  MatchReplay,
  MatchState,
  ReplayFrame,
  ShellState,
  StageId,
} from '../game/types';

export interface ReplayProgress {
  elapsed: number;
  total: number;
  finished: boolean;
}

interface ArenaCanvasProps {
  shellState: ShellState;
  mode: GameMode;
  difficulty: BotDifficulty;
  p1Id: FighterId;
  p2Id: FighterId;
  stageId: StageId;
  matchSeed: number;
  controlsVisible?: boolean;
  settings?: GameSettings;
  replayData?: MatchReplay | null;
  replaySeekKey?: number;
  replayPaused?: boolean;
  replaySpeed?: 0.5 | 1 | 2;
  onReplayProgress?: (progress: ReplayProgress) => void;
  touchInputRef: React.MutableRefObject<InputState>;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onMatchEnd: (snapshot: HudSnapshot, replay: MatchReplay | null) => void;
}

interface DynamicCameraState {
  lookX: number;
  lookY: number;
  lookZ: number;
  dist: number;
  fov: number;
  initialized: boolean;
}

const EMPTY: InputState = {
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

function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function clampScalar(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function updateDynamicCamera(
  cam: DynamicCameraState,
  match: MatchState,
  aspect: number,
  shellState: ShellState,
  controlsVisible: boolean,
  gfx: GraphicsSettings,
  dt: number,
  snap: boolean,
): { posX: number; posY: number; posZ: number; lookX: number; lookY: number; lookZ: number; fov: number } {
  const [f1, f2] = match.fighters;
  const safeAspect = Math.max(0.45, aspect || 16 / 9);
  const isPortrait = safeAspect < 1.05;

  // Vertical & horizontal bounding box covering both 3.8-unit stickmen + gear/jumps
  const minY = Math.min(f1.y, f2.y) - 0.35;
  const maxY = Math.max(f1.y, f2.y) + 4.15;
  const centerY = (minY + maxY) * 0.5;

  const halfSpanX = Math.abs(f1.x - f2.x) * 0.5 + 1.85;
  const halfSpanY = (maxY - minY) * 0.5 + 0.4;
  const halfSpanZ = Math.abs(f1.z - f2.z) * 0.5 + 1.0;

  // Usable screen ratios accounting for HUD header and radial touch controls
  const isTitle = shellState === 'title';
  const usableV = isTitle ? 0.84 : controlsVisible ? 0.68 : 0.80;
  const usableH = isPortrait ? 0.82 : 0.86;
  const verticalBias = isTitle ? 0 : controlsVisible ? -0.045 : 0.015;

  const baseFov = 44;
  const tanHalfV = Math.tan((baseFov * Math.PI) / 360);
  const tanHalfH = tanHalfV * safeAspect;

  // Perspective distance required along Z to keep both fighters inside horizontal & vertical frustum
  const distForX = halfSpanX / (tanHalfH * usableH) + halfSpanZ * 0.78;
  const distForY = halfSpanY / (tanHalfV * usableV) + halfSpanZ * 0.68;

  const minZoomDist = isPortrait ? 9.8 : 8.2;
  const maxZoomDist = 30.5;
  const dynamicDist = clampScalar(Math.max(distForX, distForY), minZoomDist, maxZoomDist);

  const isVictoryFocus =
    (match.phase === 'victory' || match.phase === 'match_end') && match.winnerSlot !== null;

  let targetLookX = gfx.dynamicCamera ? (f1.x + f2.x) * 0.5 : 0;
  let targetLookZ = gfx.dynamicCamera ? (f1.z + f2.z) * 0.5 : 0;
  let finalTargetDist = gfx.dynamicCamera ? dynamicDist : isPortrait ? 24.5 : 20.5;
  let targetLookY = gfx.dynamicCamera
    ? centerY + finalTargetDist * verticalBias
    : 2.1 + finalTargetDist * verticalBias;
  const zoomRatio = (finalTargetDist - minZoomDist) / (maxZoomDist - minZoomDist);
  let finalTargetFov = gfx.dynamicCamera ? 41.5 + zoomRatio * 5.5 : 44;

  if (isVictoryFocus && match.winnerSlot !== null) {
    const winner = match.fighters[match.winnerSlot - 1];
    targetLookX = winner.x;
    targetLookY = winner.y + 1.95;
    targetLookZ = winner.z;
    finalTargetDist = isPortrait ? 8.2 : 6.8;
    finalTargetFov = 39;
  }

  if (!cam.initialized || snap) {
    cam.lookX = targetLookX;
    cam.lookY = targetLookY;
    cam.lookZ = targetLookZ;
    cam.dist = finalTargetDist;
    cam.fov = finalTargetFov;
    cam.initialized = true;
  } else {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    // Zoom out briskly so fast dashes/knockbacks stay framed; zoom in smoothly when brawling close
    const zoomLambda = isVictoryFocus ? 4.8 : finalTargetDist > cam.dist ? 7.8 : 4.2;
    cam.dist = dampScalar(cam.dist, finalTargetDist, zoomLambda, safeDt);
    cam.fov = dampScalar(cam.fov, finalTargetFov, 4.5, safeDt);

    const panLambda = isVictoryFocus ? 5.6 : 7.2;
    cam.lookX = dampScalar(cam.lookX, targetLookX, panLambda, safeDt);
    cam.lookY = dampScalar(cam.lookY, targetLookY, isVictoryFocus ? 5.6 : 6.0, safeDt);
    cam.lookZ = dampScalar(cam.lookZ, targetLookZ, panLambda, safeDt);
  }

  // Smooth elevated third-person angle (gently tilts steeper as camera pulls wide)
  const currentZoomRatio = clampScalar(
    (cam.dist - minZoomDist) / (maxZoomDist - minZoomDist),
    0,
    1,
  );
  const elevation = 0.40 + currentZoomRatio * 0.08;
  const horizBack = cam.dist * Math.cos(elevation);
  const vertUp = cam.dist * Math.sin(elevation);

  let posX = cam.lookX * 0.94;
  let posY = Math.max(3.4, cam.lookY + vertUp);
  const posZ = cam.lookZ + horizBack;

  if (gfx.screenShake && match.shakeIntensity > 0.01) {
    posX += (Math.random() - 0.5) * match.shakeIntensity;
    posY += (Math.random() - 0.5) * match.shakeIntensity;
  }

  return {
    posX,
    posY,
    posZ,
    lookX: cam.lookX,
    lookY: cam.lookY,
    lookZ: cam.lookZ,
    fov: cam.fov,
  };
}

export function ArenaCanvas({
  shellState,
  mode,
  difficulty,
  p1Id,
  p2Id,
  stageId,
  matchSeed,
  controlsVisible = true,
  settings: propSettings,
  replayData = null,
  replaySeekKey = 0,
  replayPaused = false,
  replaySpeed = 1,
  onReplayProgress,
  touchInputRef,
  onHudUpdate,
  onMatchEnd,
}: ArenaCanvasProps) {
  const effectiveSettings = propSettings ?? createDefaultSettings();
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Arena3DController | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const bot1MemRef = useRef(createBotMemory());
  const bot2MemRef = useRef(createBotMemory());
  const keysDownRef = useRef<Set<string>>(new Set());
  const justPressedRef = useRef<Set<string>>(new Set());
  const prevTouchRef = useRef<InputState>({ ...EMPTY });
  const matchEndReportedRef = useRef(false);
  const snapCameraRef = useRef(true);
  const lastRoundSeenRef = useRef(1);

  // Replay recording & playback refs
  const recordedFramesRef = useRef<ReplayFrame[]>([]);
  const recordedDurationRef = useRef(0);
  const replayCursorRef = useRef(0);
  const replayAccumRef = useRef(0);
  const replayElapsedRef = useRef(0);

  const cameraStateRef = useRef<DynamicCameraState>({
    lookX: 0,
    lookY: 1.85,
    lookZ: 0,
    dist: 13.5,
    fov: 44,
    initialized: false,
  });

  const [contextLost, setContextLost] = useState(false);

  // Keep latest props in refs so the mounted WebGL lifecycle stays stable
  const shellStateRef = useRef(shellState);
  const modeRef = useRef(mode);
  const difficultyRef = useRef(difficulty);
  const controlsVisibleRef = useRef(controlsVisible);
  const settingsRef = useRef<GameSettings>(effectiveSettings);
  const replayDataRef = useRef<MatchReplay | null>(replayData);
  const replayPausedRef = useRef(replayPaused);
  const replaySpeedRef = useRef<0.5 | 1 | 2>(replaySpeed);
  const onReplayProgressRef = useRef(onReplayProgress);
  const onHudUpdateRef = useRef(onHudUpdate);
  const onMatchEndRef = useRef(onMatchEnd);

  shellStateRef.current = shellState;
  modeRef.current = mode;
  difficultyRef.current = difficulty;
  controlsVisibleRef.current = controlsVisible;
  settingsRef.current = effectiveSettings;
  replayDataRef.current = replayData;
  replayPausedRef.current = replayPaused;
  replaySpeedRef.current = replaySpeed;
  onReplayProgressRef.current = onReplayProgress;
  onHudUpdateRef.current = onHudUpdate;
  onMatchEndRef.current = onMatchEnd;

  // Apply live graphics & callout settings without resetting the match
  useEffect(() => {
    controllerRef.current?.applyGraphicsSettings(effectiveSettings.graphics);
    if (matchRef.current) {
      matchRef.current.showFloatingEvents = effectiveSettings.other.showDamageNumbers;
    }
  }, [effectiveSettings]);

  // Initialize or reset match when setup or matchSeed changes
  useEffect(() => {
    if (shellState === 'replay') return;
    const attractMode = shellState === 'title';
    const currentSettings = settingsRef.current;
    matchRef.current = createMatch({
      p1Id,
      p2Id,
      stageId,
      mode,
      difficulty,
      attractMode,
      roundDuration: currentSettings.other.roundDuration,
      roundsToWin: currentSettings.other.roundsToWin,
      showFloatingEvents: currentSettings.other.showDamageNumbers,
      seed: matchSeed,
    });
    bot1MemRef.current = createBotMemory();
    bot2MemRef.current = createBotMemory();
    recordedFramesRef.current = [];
    recordedDurationRef.current = 0;
    matchEndReportedRef.current = false;
    snapCameraRef.current = true;
    lastRoundSeenRef.current = 1;
    onHudUpdateRef.current(buildHudSnapshot(matchRef.current));
  }, [p1Id, p2Id, stageId, mode, difficulty, matchSeed, shellState === 'title']);

  // Initialize replay state from saved replayData & match seed when entering replay mode
  useEffect(() => {
    if (shellState !== 'replay' || !replayData) return;
    matchRef.current = createMatch({
      p1Id: replayData.p1Id,
      p2Id: replayData.p2Id,
      stageId: replayData.stageId,
      mode: replayData.mode,
      difficulty: replayData.difficulty,
      attractMode: false,
      roundDuration: replayData.roundDuration,
      roundsToWin: replayData.roundsToWin,
      showFloatingEvents: settingsRef.current.other.showDamageNumbers,
      seed: replayData.seed,
    });
    bot1MemRef.current = createBotMemory();
    bot2MemRef.current = createBotMemory();
    replayCursorRef.current = 0;
    replayAccumRef.current = 0;
    replayElapsedRef.current = 0;
    snapCameraRef.current = true;
    lastRoundSeenRef.current = 1;
    onHudUpdateRef.current(buildHudSnapshot(matchRef.current));
    onReplayProgressRef.current?.({
      elapsed: 0,
      total: replayData.durationSec,
      finished: false,
    });
  }, [shellState === 'replay', replayData, replaySeekKey]);

  // Keyboard tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) &&
        shellStateRef.current === 'playing'
      ) {
        e.preventDefault();
      }
      if (!keysDownRef.current.has(e.code)) {
        justPressedRef.current.add(e.code);
      }
      keysDownRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysDownRef.current.clear();
      justPressedRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Mount Three.js 3D ArenaController once and run paced simulation + dynamic camera loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const controller = new Arena3DController(
      mount,
      () => setContextLost(true),
      () => setContextLost(false),
    );
    controllerRef.current = controller;
    controller.applyGraphicsSettings(settingsRef.current.graphics);

    const handleResize = () => {
      const rect = mount.getBoundingClientRect();
      controller.resize(rect.width, rect.height);
    };
    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let hudAccumulator = 0;

    const readInputs = (): [InputState, InputState] => {
      const held = keysDownRef.current;
      const pressed = justPressedRef.current;
      const touch = touchInputRef.current;
      const prevTouch = prevTouchRef.current;

      const touchPress = (k: Exclude<keyof InputState, 'moveX' | 'moveZ'>) =>
        Boolean(touch[k] && !prevTouch[k]);

      const p1Keys = settingsRef.current.controller.p1Keys;
      const boundCodes = new Set(Object.values(p1Keys));
      const allowAlt = (code: string) => modeRef.current === '1p' && !boundCodes.has(code);

      let p1: InputState;
      let p2: InputState = { ...EMPTY };

      p1 = {
        left: held.has(p1Keys.left) || (allowAlt('ArrowLeft') && held.has('ArrowLeft')) || touch.left,
        right: held.has(p1Keys.right) || (allowAlt('ArrowRight') && held.has('ArrowRight')) || touch.right,
        forward: held.has(p1Keys.forward) || (allowAlt('ArrowUp') && held.has('ArrowUp')) || touch.forward,
        back: held.has(p1Keys.back) || (allowAlt('ArrowDown') && held.has('ArrowDown')) || touch.back,
        jump: pressed.has(p1Keys.jump) || touchPress('jump'),
        drop: pressed.has(p1Keys.drop) || (allowAlt('KeyV') && pressed.has('KeyV')) || touchPress('drop'),
        block: held.has(p1Keys.block) || (allowAlt('KeyC') && held.has('KeyC')) || touch.block,
        attack:
          pressed.has(p1Keys.attack) ||
          (allowAlt('KeyJ') && pressed.has('KeyJ')) ||
          (allowAlt('KeyZ') && pressed.has('KeyZ')) ||
          touchPress('attack'),
        power1:
          pressed.has(p1Keys.power1) ||
          (allowAlt('KeyK') && pressed.has('KeyK')) ||
          (allowAlt('KeyX') && pressed.has('KeyX')) ||
          touchPress('power1'),
        power2:
          pressed.has(p1Keys.power2) ||
          (allowAlt('KeyL') && pressed.has('KeyL')) ||
          touchPress('power2'),
        ultimate:
          pressed.has(p1Keys.ultimate) ||
          (allowAlt('KeyU') && pressed.has('KeyU')) ||
          touchPress('ultimate'),
        dash:
          pressed.has(p1Keys.dash) ||
          (allowAlt('ShiftRight') && pressed.has('ShiftRight')) ||
          touchPress('dash'),
        moveX: touch.moveX,
        moveZ: touch.moveZ,
      };

      if (modeRef.current === '2p') {
        p2 = {
          left: held.has('ArrowLeft'),
          right: held.has('ArrowRight'),
          forward: held.has('ArrowUp'),
          back: held.has('ArrowDown'),
          jump: pressed.has('Numpad0') || pressed.has('Enter'),
          drop: pressed.has('KeyN'),
          block: held.has('KeyM'),
          attack: pressed.has('KeyJ') || pressed.has('Numpad1'),
          power1: pressed.has('KeyK') || pressed.has('Numpad2'),
          power2: pressed.has('KeyL') || pressed.has('Numpad3'),
          ultimate: pressed.has('KeyU') || pressed.has('Numpad4'),
          dash: pressed.has('Slash') || pressed.has('ShiftRight'),
        };
      }

      prevTouchRef.current = { ...touch };
      justPressedRef.current.clear();
      return [p1, p2];
    };

    const afterDraw = (cb: () => void) => {
      const gl = controller.getGlContext();
      if (!gl) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const match = matchRef.current;
      const currentShell = shellStateRef.current;

      if (match) {
        if (currentShell === 'title') {
          const b1 = computeBotInput(
            match.fighters[0],
            match.fighters[1],
            match,
            'steady',
            bot1MemRef.current,
            dt,
          );
          const b2 = computeBotInput(
            match.fighters[1],
            match.fighters[0],
            match,
            'steady',
            bot2MemRef.current,
            dt,
          );
          stepMatch(match, b1, b2, dt);
        } else if (currentShell === 'playing') {
          const simDt = Math.min(0.033, Math.max(0.001, dt));
          const [p1In, p2In] = readInputs();
          const finalP2 =
            modeRef.current === '1p'
              ? computeBotInput(
                  match.fighters[1],
                  match.fighters[0],
                  match,
                  difficultyRef.current,
                  bot2MemRef.current,
                  simDt,
                )
              : p2In;

          recordedFramesRef.current.push({
            dt: simDt,
            p1: packInput(p1In),
            ...(modeRef.current === '2p' ? { p2: packInput(p2In) } : {}),
          });
          recordedDurationRef.current += simDt;

          stepMatch(match, p1In, finalP2, simDt);

          hudAccumulator += dt;
          if (hudAccumulator >= 0.04 || match.phase !== 'fight') {
            hudAccumulator = 0;
            const snap = buildHudSnapshot(match);
            onHudUpdateRef.current(snap);
            if (match.phase === 'match_end' && !matchEndReportedRef.current) {
              matchEndReportedRef.current = true;
              const replay: MatchReplay = {
                seed: match.seed,
                mode: match.mode,
                difficulty: match.difficulty,
                p1Id: match.fighters[0].spec.id,
                p2Id: match.fighters[1].spec.id,
                stageId: match.stage.id,
                roundDuration: match.roundDuration,
                roundsToWin: match.roundsToWin,
                durationSec: recordedDurationRef.current,
                frames: recordedFramesRef.current.slice(),
              };
              onMatchEndRef.current(snap, replay);
            }
          }
        } else if (currentShell === 'replay') {
          const replay = replayDataRef.current;
          if (replay && !replayPausedRef.current) {
            const frames = replay.frames;
            if (replayCursorRef.current < frames.length) {
              replayAccumRef.current += dt * replaySpeedRef.current;
              let steps = 0;
              while (
                replayCursorRef.current < frames.length &&
                replayAccumRef.current >= frames[replayCursorRef.current].dt &&
                steps < 6
              ) {
                const frame = frames[replayCursorRef.current];
                replayAccumRef.current -= frame.dt;
                replayCursorRef.current += 1;
                replayElapsedRef.current += frame.dt;
                steps += 1;

                const p1In = unpackInput(frame.p1);
                const p2In =
                  replay.mode === '1p'
                    ? computeBotInput(
                        match.fighters[1],
                        match.fighters[0],
                        match,
                        replay.difficulty,
                        bot2MemRef.current,
                        frame.dt,
                      )
                    : frame.p2
                      ? unpackInput(frame.p2)
                      : { ...EMPTY };

                stepMatch(match, p1In, p2In, frame.dt);
              }

              hudAccumulator += dt;
              const finished = replayCursorRef.current >= frames.length;
              if (hudAccumulator >= 0.04 || match.phase !== 'fight' || finished) {
                hudAccumulator = 0;
                onHudUpdateRef.current(buildHudSnapshot(match));
                onReplayProgressRef.current?.({
                  elapsed: replayElapsedRef.current,
                  total: replay.durationSec,
                  finished,
                });
              }
            } else if (match.winnerSlot !== null) {
              const champ = match.fighters[match.winnerSlot - 1];
              champ.animTime += dt;
            }
          }
        } else if (currentShell === 'gameover' && match.winnerSlot !== null) {
          // Keep victor's ambient breathing/particles alive behind the summary modal
          const champ = match.fighters[match.winnerSlot - 1];
          champ.animTime += dt;
        }

        // Snap camera cleanly on round transitions
        if (match.roundNumber !== lastRoundSeenRef.current) {
          lastRoundSeenRef.current = match.roundNumber;
          snapCameraRef.current = true;
        }

        const camPose = updateDynamicCamera(
          cameraStateRef.current,
          match,
          controller.getAspect(),
          currentShell,
          controlsVisibleRef.current,
          settingsRef.current.graphics,
          dt,
          snapCameraRef.current,
        );
        snapCameraRef.current = false;

        controller.setCameraPose(
          camPose.posX,
          camPose.posY,
          camPose.posZ,
          camPose.lookX,
          camPose.lookY,
          camPose.lookZ,
          camPose.fov,
        );
        controller.render(match, dt, now / 1000, true);
      }

      if (controller.isSoftware()) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [touchInputRef]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="3D stickman combat arena"
      />
      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/95 p-6 text-center">
          <div className="max-w-sm space-y-2 rounded-card border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-bold text-foreground">
              3D Graphics Context Paused
            </h2>
            <p className="text-sm text-muted">
              Waiting for WebGL graphics context to restore automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
