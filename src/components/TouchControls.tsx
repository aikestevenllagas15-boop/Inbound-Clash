import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../game/audio';
import type { FighterSpec, HudSnapshot, InputState } from '../game/types';

interface TouchControlsProps {
  fighter: FighterSpec;
  hud: HudSnapshot | null;
  active: boolean;
  visible: boolean;
  deadzone?: number;
  scale?: number;
  opacity?: number;
  swapSides?: boolean;
  onInputsChange: (patch: Partial<InputState>) => void;
}

const DEFAULT_KNOB_DEADZONE = 0.16;

export function TouchControls({
  fighter,
  hud,
  active,
  visible,
  deadzone = DEFAULT_KNOB_DEADZONE,
  scale = 1,
  opacity = 0.95,
  swapSides = false,
  onInputsChange,
}: TouchControlsProps) {
  const joyRef = useRef<HTMLDivElement>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const deadzoneRef = useRef(deadzone);
  deadzoneRef.current = deadzone;
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  const joyInputsRef = useRef({
    left: false,
    right: false,
    forward: false,
    back: false,
    moveX: 0,
    moveZ: 0,
  });
  const btnInputsRef = useRef({
    jump: false,
    block: false,
    dash: false,
    attack: false,
    power1: false,
    power2: false,
    ultimate: false,
  });
  const [pressedBtns, setPressedBtns] = useState<Record<string, boolean>>({});
  const activePointersRef = useRef<Map<number, keyof typeof btnInputsRef.current>>(new Map());

  const syncCombinedInputs = useCallback(() => {
    const j = joyInputsRef.current;
    const b = btnInputsRef.current;
    onInputsChange({
      left: j.left,
      right: j.right,
      forward: j.forward,
      back: j.back,
      moveX: j.moveX,
      moveZ: j.moveZ,
      jump: b.jump,
      block: b.block,
      dash: b.dash,
      attack: b.attack,
      power1: b.power1,
      power2: b.power2,
      ultimate: b.ultimate,
    });
  }, [onInputsChange]);

  const resetAll = useCallback(() => {
    joyPointerIdRef.current = null;
    setJoyActive(false);
    setKnobOffset({ x: 0, y: 0 });
    joyInputsRef.current = {
      left: false,
      right: false,
      forward: false,
      back: false,
      moveX: 0,
      moveZ: 0,
    };
    btnInputsRef.current = {
      jump: false,
      block: false,
      dash: false,
      attack: false,
      power1: false,
      power2: false,
      ultimate: false,
    };
    activePointersRef.current.clear();
    setPressedBtns({});
    onInputsChange({
      left: false,
      right: false,
      forward: false,
      back: false,
      drop: false,
      jump: false,
      block: false,
      dash: false,
      attack: false,
      power1: false,
      power2: false,
      ultimate: false,
      moveX: 0,
      moveZ: 0,
    });
  }, [onInputsChange]);

  useEffect(() => {
    if (!active || !visible) {
      resetAll();
    }
    return () => resetAll();
  }, [active, visible, resetAll]);

  const updateJoystickFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = joyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxRadius = Math.max(32, rect.width * 0.39);

      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        const scale = maxRadius / dist;
        dx *= scale;
        dy *= scale;
      }

      setKnobOffset({ x: dx, y: dy });

      const nx = dx / maxRadius;
      const ny = dy / maxRadius;
      const dz = deadzoneRef.current;

      const moveX = Math.abs(nx) > dz ? Math.max(-1, Math.min(1, nx)) : 0;
      const moveZ = Math.abs(ny) > dz ? Math.max(-1, Math.min(1, ny)) : 0;

      joyInputsRef.current = {
        left: nx < -dz,
        right: nx > dz,
        forward: ny < -dz,
        back: ny > dz,
        moveX,
        moveZ,
      };
      syncCombinedInputs();
    },
    [syncCombinedInputs],
  );

  // Window-level tracking while joystick or buttons are held
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (joyPointerIdRef.current !== e.pointerId) return;
      updateJoystickFromPoint(e.clientX, e.clientY);
    };
    const onWindowPointerEnd = (e: PointerEvent) => {
      if (joyPointerIdRef.current === e.pointerId) {
        joyPointerIdRef.current = null;
        setJoyActive(false);
        setKnobOffset({ x: 0, y: 0 });
        joyInputsRef.current = {
          left: false,
          right: false,
          forward: false,
          back: false,
          moveX: 0,
          moveZ: 0,
        };
        syncCombinedInputs();
      }
      const btnKey = activePointersRef.current.get(e.pointerId);
      if (btnKey) {
        activePointersRef.current.delete(e.pointerId);
        btnInputsRef.current[btnKey] = false;
        setPressedBtns((prev) => ({ ...prev, [btnKey]: false }));
        syncCombinedInputs();
      }
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
    };
  }, [updateJoystickFromPoint, syncCombinedInputs]);

  const handleJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    soundEngine.unlock();
    if (joyPointerIdRef.current !== null) return;
    joyPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Window listener fallback handles capture
    }
    setJoyActive(true);
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const setBtnState = (key: keyof typeof btnInputsRef.current, isDown: boolean) => {
    btnInputsRef.current[key] = isDown;
    setPressedBtns((prev) => (prev[key] === isDown ? prev : { ...prev, [key]: isDown }));
    syncCombinedInputs();
  };

  const bindBtn = (key: keyof typeof btnInputsRef.current) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      soundEngine.unlock();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Window listener fallback handles release
      }
      activePointersRef.current.set(e.pointerId, key);
      setBtnState(key, true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.delete(e.pointerId);
      }
      setBtnState(key, false);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.delete(e.pointerId);
      }
      setBtnState(key, false);
    },
  });

  if (!visible) return null;

  const p1Cd = hud?.p1Cd1 ?? 0;
  const p2Cd = hud?.p1Cd2 ?? 0;
  const energy = hud?.p1Energy ?? 0;
  const ultReady = energy >= 100;

  return (
    <section
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 select-none touch-none sm:px-6 sm:pb-5 [@media(max-height:500px)]:pb-2"
      style={{ opacity }}
      aria-label="On-screen joystick and combat buttons"
    >
      <div
        className={`mx-auto flex w-full max-w-6xl items-end justify-between gap-2 ${
          swapSides ? 'flex-row-reverse' : ''
        }`}
      >
        {/* Translucent White-Ring Analog Joystick with Solid White Knob */}
        <div
          className={`pointer-events-auto flex shrink-0 items-center ${
            swapSides ? 'origin-bottom-right' : 'origin-bottom-left'
          }`}
          style={{ transform: `scale(${scale})` }}
        >
          <div
            ref={joyRef}
            role="slider"
            aria-label="360-degree movement joystick"
            aria-valuetext={
              joyActive
                ? `X ${Math.round(joyInputsRef.current.moveX * 100)}%, Z ${Math.round(joyInputsRef.current.moveZ * 100)}%`
                : 'Neutral'
            }
            onPointerDown={handleJoyPointerDown}
            className={`relative flex h-28 w-28 cursor-grab items-center justify-center rounded-full border-2 border-white/85 bg-white/10 transition-colors active:cursor-grabbing sm:h-36 sm:w-36 [@media(max-height:500px)]:h-26 [@media(max-height:500px)]:w-26 ${
              joyActive ? 'border-white bg-white/15' : ''
            }`}
          >
            {/* Solid White Center Thumb Knob */}
            <div
              className="pointer-events-none h-12 w-12 rounded-full bg-white shadow-[0_3px_12px_rgba(0,0,0,0.45)] sm:h-14 sm:w-14 [@media(max-height:500px)]:h-11 [@media(max-height:500px)]:w-11"
              style={{
                transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
              }}
            />
          </div>
        </div>

        {/* Radial Arc of Circular White-Bordered Action Buttons */}
        <div
          className={`pointer-events-auto relative h-[11rem] w-[13.25rem] shrink-0 sm:h-[13.5rem] sm:w-[17rem] ${
            swapSides ? 'origin-bottom-left' : 'origin-bottom-right'
          }`}
          style={{ transform: `scale(${scale})` }}
        >
          {/* JUMP */}
          <button
            type="button"
            aria-label="Jump"
            {...bindBtn('jump')}
            className={`absolute bottom-0 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/95 bg-[#2e9e62]/90 text-[11px] font-bold tracking-wide text-white uppercase shadow-md transition-transform sm:h-[4.25rem] sm:w-[4.25rem] sm:text-xs ${
              swapSides ? 'left-0' : 'right-0'
            } ${pressedBtns.jump ? 'scale-92 brightness-115' : 'hover:brightness-110'}`}
          >
            Jump
          </button>

          {/* ATTACK */}
          <button
            type="button"
            aria-label="Attack"
            {...bindBtn('attack')}
            className={`absolute bottom-[8px] flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-2 border-white/95 bg-[#dc4c32]/95 text-xs font-extrabold tracking-wide text-white uppercase shadow-lg transition-transform sm:bottom-[10px] sm:h-20 sm:w-20 sm:text-sm ${
              swapSides ? 'left-[62px] sm:left-[78px]' : 'right-[62px] sm:right-[78px]'
            } ${pressedBtns.attack ? 'scale-92 brightness-115' : 'hover:brightness-110'}`}
          >
            Attack
          </button>

          {/* BLOCK */}
          <button
            type="button"
            aria-label="Block"
            {...bindBtn('block')}
            className={`absolute bottom-[4px] flex h-[3.125rem] w-[3.125rem] items-center justify-center rounded-full border-2 border-white/90 bg-[#475569]/90 text-[10px] font-bold tracking-wide text-white uppercase shadow-md transition-transform sm:bottom-[6px] sm:h-[3.75rem] sm:w-[3.75rem] sm:text-xs ${
              swapSides ? 'left-[136px] sm:left-[168px]' : 'right-[136px] sm:right-[168px]'
            } ${pressedBtns.block ? 'scale-92 brightness-125' : 'hover:brightness-110'}`}
          >
            Block
          </button>

          {/* DASH */}
          <button
            type="button"
            aria-label="Dash"
            {...bindBtn('dash')}
            className={`absolute bottom-[64px] flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border-2 border-white/90 bg-[#2b78c4]/90 text-[10px] font-bold tracking-wide text-white uppercase shadow-md transition-transform sm:bottom-[78px] sm:h-[3.875rem] sm:w-[3.875rem] sm:text-xs ${
              swapSides ? 'left-[2px] sm:left-[4px]' : 'right-[2px] sm:right-[4px]'
            } ${pressedBtns.dash ? 'scale-92 brightness-115' : 'hover:brightness-110'}`}
          >
            Dash
          </button>

          {/* SKILL 2 */}
          <button
            type="button"
            title={fighter.power2.name}
            aria-label={`${fighter.power2.name}${p2Cd > 0.05 ? `, ${p2Cd.toFixed(1)}s cooldown` : ''}`}
            {...bindBtn('power2')}
            className={`absolute bottom-[82px] flex h-[3.125rem] w-[3.125rem] flex-col items-center justify-center rounded-full border-2 border-white/90 text-[10px] leading-tight font-bold text-white uppercase shadow-md transition-transform sm:bottom-[100px] sm:h-[3.75rem] sm:w-[3.75rem] sm:text-[11px] ${
              swapSides ? 'left-[60px] sm:left-[78px]' : 'right-[60px] sm:right-[78px]'
            } ${
              p2Cd > 0.05 ? 'bg-[#1c2329]/85 text-white/65' : 'bg-[#1d8a82]/95 hover:brightness-110'
            } ${pressedBtns.power2 ? 'scale-92 brightness-115' : ''}`}
          >
            <span>Skill 2</span>
            {p2Cd > 0.05 && (
              <span className="text-[9px] font-semibold tabular-nums">{p2Cd.toFixed(1)}s</span>
            )}
          </button>

          {/* SKILL 1 */}
          <button
            type="button"
            title={fighter.power1.name}
            aria-label={`${fighter.power1.name}${p1Cd > 0.05 ? `, ${p1Cd.toFixed(1)}s cooldown` : ''}`}
            {...bindBtn('power1')}
            className={`absolute bottom-[62px] flex h-[3.125rem] w-[3.125rem] flex-col items-center justify-center rounded-full border-2 border-white/90 text-[10px] leading-tight font-bold text-white uppercase shadow-md transition-transform sm:bottom-[74px] sm:h-[3.75rem] sm:w-[3.75rem] sm:text-[11px] ${
              swapSides ? 'left-[118px] sm:left-[148px]' : 'right-[118px] sm:right-[148px]'
            } ${
              p1Cd > 0.05 ? 'bg-[#1c2329]/85 text-white/65' : 'bg-[#d98a26]/95 hover:brightness-110'
            } ${pressedBtns.power1 ? 'scale-92 brightness-115' : ''}`}
          >
            <span>Skill 1</span>
            {p1Cd > 0.05 && (
              <span className="text-[9px] font-semibold tabular-nums">{p1Cd.toFixed(1)}s</span>
            )}
          </button>

          {/* ULT */}
          <button
            type="button"
            title={fighter.ultimate.name}
            aria-label={`${fighter.ultimate.name}, ${ultReady ? 'Ready' : `${energy}%`}`}
            {...bindBtn('ultimate')}
            className={`absolute bottom-[122px] flex h-[3.25rem] w-[3.25rem] flex-col items-center justify-center rounded-full border-2 border-white/95 text-[10px] leading-tight font-extrabold uppercase shadow-md transition-transform sm:bottom-[150px] sm:h-[3.875rem] sm:w-[3.875rem] sm:text-xs ${
              swapSides ? 'left-[8px] sm:left-[10px]' : 'right-[8px] sm:right-[10px]'
            } ${
              ultReady
                ? 'bg-[#e6b333] text-[#171310] hover:brightness-110'
                : 'bg-[#262320]/85 text-white/75'
            } ${pressedBtns.ultimate ? 'scale-92 brightness-115' : ''}`}
          >
            <span>Ult</span>
            {!ultReady && <span className="text-[9px] font-semibold tabular-nums">{energy}%</span>}
          </button>
        </div>
      </div>
    </section>
  );
}
