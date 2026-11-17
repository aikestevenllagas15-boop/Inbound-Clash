import type { HazardZone3D } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.85;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.015,
      );
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 18;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.16;

        const master = this.ctx.createGain();
        master.gain.value = this.muted ? 0 : this.volume;
        master.connect(compressor);
        compressor.connect(this.ctx.destination);
        this.masterGain = master;

        this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private canPlay(): boolean {
    if (this.muted) return false;
    if (!this.ctx || !this.masterGain) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx.state === 'running';
  }

  private jitter(base: number, pct = 0.06): number {
    return base * (1 + (Math.random() * 2 - 1) * pct);
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0,
    attack = 0.008,
  ): void {
    if (!this.canPlay() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(attack, duration * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.025);
  }

  private playNoise(
    duration: number,
    filterFreqStart: number,
    gainPeak: number,
    options?: {
      filterType?: BiquadFilterType;
      filterFreqEnd?: number;
      q?: number;
      delay?: number;
    },
  ): void {
    if (!this.canPlay() || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime + (options?.delay ?? 0);

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = options?.filterType ?? 'bandpass';
    filter.frequency.setValueAtTime(Math.max(40, filterFreqStart), now);
    if (options?.filterFreqEnd) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, options.filterFreqEnd),
        now + duration,
      );
    }
    filter.Q.value = options?.q ?? 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  public playUiClick(): void {
    this.unlock();
    this.playTone(620, 420, 0.045, 'sine', 0.07, 0, 0.004);
  }

  public playUiSelect(): void {
    this.unlock();
    this.playTone(520, 760, 0.06, 'triangle', 0.08, 0, 0.004);
    this.playTone(880, 1040, 0.055, 'sine', 0.05, 0.025, 0.004);
  }

  public playSwing(step: 1 | 2 | 3 = 1): void {
    if (step === 3) {
      this.playNoise(0.16, this.jitter(920), 0.14, { filterFreqEnd: 340, q: 0.9 });
      this.playTone(this.jitter(290), 88, 0.15, 'triangle', 0.09);
      this.playTone(this.jitter(520), 210, 0.11, 'sine', 0.05, 0.02);
    } else if (step === 2) {
      this.playNoise(0.12, this.jitter(1450), 0.11, { filterFreqEnd: 620, q: 1.1 });
      this.playTone(this.jitter(440), 145, 0.11, 'triangle', 0.07);
    } else {
      this.playNoise(0.09, this.jitter(1750), 0.09, { filterFreqEnd: 820, q: 1.3 });
      this.playTone(this.jitter(360), 150, 0.08, 'triangle', 0.06);
    }
  }

  public playHit(heavy = false, comboCount = 1): void {
    const pitchMod = 1 + Math.min(6, Math.max(0, comboCount - 1)) * 0.045;
    if (heavy) {
      this.playTone(this.jitter(145), 34, 0.22, 'sawtooth', 0.22);
      this.playTone(this.jitter(98), 28, 0.24, 'sine', 0.22);
      this.playNoise(0.16, 620, 0.22, { filterType: 'lowpass', filterFreqEnd: 220 });
    } else {
      this.playTone(this.jitter(225 * pitchMod), 48, 0.12, 'sawtooth', 0.14);
      this.playTone(this.jitter(135), 42, 0.11, 'sine', 0.14);
      this.playNoise(0.09, 1100, 0.13, { filterFreqEnd: 420 });
    }

    if (comboCount >= 3) {
      const chimeFreq = Math.min(1320, 520 + (comboCount - 3) * 65);
      this.playTone(chimeFreq, chimeFreq * 1.25, 0.13, 'triangle', 0.09, 0.01);
      this.playNoise(0.11, 2800, 0.08, { filterType: 'highpass', q: 1.4 });
    }
  }

  public playBlock(): void {
    this.playTone(this.jitter(720), 360, 0.11, 'square', 0.09);
    this.playTone(this.jitter(1240), 790, 0.09, 'triangle', 0.08);
    this.playNoise(0.06, 2200, 0.09, { q: 2.0 });
  }

  public playCounter(): void {
    this.playTone(1420, 2180, 0.16, 'triangle', 0.14);
    this.playTone(980, 1460, 0.22, 'sine', 0.12, 0.02);
    this.playNoise(0.14, 3400, 0.12, { filterType: 'highpass', q: 1.8 });
  }

  public playJump(isDoubleJump = false): void {
    if (isDoubleJump) {
      this.playTone(320, 720, 0.12, 'sine', 0.08);
      this.playTone(540, 960, 0.09, 'triangle', 0.05, 0.02);
      this.playNoise(0.08, 2400, 0.06, { filterFreqEnd: 3400 });
    } else {
      this.playTone(185, 420, 0.11, 'sine', 0.08);
      this.playNoise(0.08, 1400, 0.06, { filterFreqEnd: 2200 });
    }
  }

  public playLand(heavy = false): void {
    if (heavy) {
      this.playTone(110, 34, 0.18, 'sine', 0.18);
      this.playNoise(0.14, 420, 0.14, { filterType: 'lowpass', filterFreqEnd: 140 });
    } else {
      this.playTone(96, 40, 0.08, 'sine', 0.09);
      this.playNoise(0.07, 520, 0.06, { filterType: 'lowpass', filterFreqEnd: 180 });
    }
  }

  public playDash(): void {
    this.playNoise(0.13, 2200, 0.11, { filterFreqEnd: 900, q: 1.4 });
    this.playTone(480, 170, 0.11, 'sine', 0.07);
  }

  public playPower(kind: 'fire' | 'wind' | 'earth' | 'bolt' | 'frost' | 'cyber'): void {
    switch (kind) {
      case 'fire':
        this.playNoise(0.24, 560, 0.17, { filterFreqEnd: 280, q: 0.9 });
        this.playTone(310, 88, 0.23, 'sawtooth', 0.14);
        this.playTone(190, 62, 0.25, 'triangle', 0.12, 0.02);
        break;
      case 'wind':
        this.playNoise(0.26, 1750, 0.14, { filterFreqEnd: 2900, q: 2.2 });
        this.playTone(430, 860, 0.19, 'sine', 0.09);
        this.playTone(680, 460, 0.18, 'triangle', 0.06, 0.06);
        break;
      case 'earth':
        this.playTone(118, 32, 0.3, 'triangle', 0.24);
        this.playTone(84, 28, 0.28, 'sawtooth', 0.12);
        this.playNoise(0.26, 300, 0.2, { filterType: 'lowpass', filterFreqEnd: 120 });
        break;
      case 'bolt':
        this.playTone(1080, 210, 0.17, 'sawtooth', 0.13);
        this.playTone(1640, 420, 0.12, 'square', 0.07, 0.01);
        this.playNoise(0.15, 3400, 0.14, { filterType: 'highpass', q: 1.4 });
        break;
      case 'frost':
        this.playTone(1180, 1780, 0.18, 'sine', 0.1);
        this.playTone(840, 1260, 0.2, 'triangle', 0.08, 0.03);
        this.playNoise(0.16, 3100, 0.07, { filterType: 'highpass', q: 2.0 });
        break;
      case 'cyber':
        this.playTone(880, 1320, 0.055, 'square', 0.08, 0, 0.003);
        this.playTone(1760, 1170, 0.055, 'square', 0.08, 0.045, 0.003);
        this.playTone(1480, 2240, 0.08, 'triangle', 0.09, 0.09, 0.003);
        this.playNoise(0.12, 3200, 0.09, { filterType: 'bandpass', q: 2.4 });
        break;
    }
  }

  public playHazardErupt(kind: HazardZone3D['kind']): void {
    switch (kind) {
      case 'thunder_strike':
        this.playNoise(0.22, 3600, 0.18, { filterFreqEnd: 850, q: 1.0 });
        this.playTone(1360, 180, 0.18, 'sawtooth', 0.15);
        this.playTone(110, 34, 0.28, 'sine', 0.18, 0.04);
        break;
      case 'inferno_pillar':
        this.playNoise(0.32, 480, 0.2, { filterFreqEnd: 180, q: 0.8 });
        this.playTone(220, 58, 0.32, 'sawtooth', 0.16);
        break;
      case 'tectonic_spire':
        this.playTone(105, 30, 0.34, 'triangle', 0.24);
        this.playNoise(0.26, 380, 0.22, { filterType: 'lowpass', filterFreqEnd: 140 });
        break;
      case 'meteor_ring':
        this.playTone(140, 32, 0.32, 'sine', 0.25);
        this.playTone(260, 62, 0.24, 'sawtooth', 0.16);
        this.playNoise(0.24, 540, 0.2, { filterType: 'lowpass', filterFreqEnd: 160 });
        break;
      case 'frost_nova':
        this.playTone(1480, 880, 0.22, 'triangle', 0.11);
        this.playTone(960, 1620, 0.2, 'sine', 0.1, 0.02);
        this.playNoise(0.18, 3200, 0.11, { filterType: 'highpass', q: 1.8 });
        break;
      case 'cyclone':
        this.playNoise(0.28, 1200, 0.13, { filterFreqEnd: 2400, q: 2.0 });
        break;
      case 'blizzard_storm':
        this.playNoise(0.35, 2200, 0.13, { filterFreqEnd: 1300, q: 1.5 });
        this.playTone(1120, 1520, 0.24, 'sine', 0.07);
        break;
      case 'hack_grid':
        this.playTone(640, 1920, 0.12, 'square', 0.09);
        this.playTone(210, 58, 0.22, 'sawtooth', 0.14, 0.03);
        this.playNoise(0.18, 2600, 0.12, { q: 2.2 });
        break;
      case 'system_override':
        this.playTone(1560, 310, 0.18, 'square', 0.11);
        this.playTone(125, 34, 0.3, 'sine', 0.22, 0.02);
        this.playNoise(0.24, 3400, 0.14, { filterFreqEnd: 900 });
        break;
    }
  }

  public playFreeze(): void {
    this.playTone(920, 1680, 0.2, 'sine', 0.11);
    this.playTone(1380, 2120, 0.18, 'triangle', 0.08, 0.03);
    this.playNoise(0.16, 3600, 0.08, { filterType: 'highpass', q: 2.2 });
  }

  public playShatter(): void {
    this.playNoise(0.18, 2900, 0.15, { filterType: 'highpass', q: 1.4 });
    this.playTone(1760, 920, 0.12, 'triangle', 0.1);
    this.playTone(1240, 620, 0.14, 'sine', 0.09, 0.03);
  }

  public playUltimate(): void {
    this.playTone(170, 620, 0.26, 'sawtooth', 0.16);
    this.playTone(340, 82, 0.45, 'triangle', 0.2, 0.12);
    this.playTone(115, 36, 0.42, 'sine', 0.22, 0.14);
    this.playNoise(0.36, 980, 0.18, { filterFreqEnd: 320 });
  }

  public playUltReady(): void {
    this.playTone(784, 784, 0.11, 'triangle', 0.09);
    this.playTone(1046.5, 1046.5, 0.22, 'sine', 0.11, 0.07);
  }

  public playRoundIntro(): void {
    this.playTone(138, 56, 0.22, 'sine', 0.16);
    this.playNoise(0.1, 360, 0.08, { filterType: 'lowpass' });
  }

  public playDialogueCue(speaker: 1 | 2): void {
    if (speaker === 1) {
      this.playTone(420, 510, 0.07, 'triangle', 0.06, 0, 0.005);
      this.playTone(540, 620, 0.075, 'sine', 0.045, 0.045, 0.005);
    } else {
      this.playTone(510, 630, 0.07, 'triangle', 0.06, 0, 0.005);
      this.playTone(680, 790, 0.075, 'sine', 0.045, 0.045, 0.005);
    }
  }

  public playGong(): void {
    this.playTone(165, 112, 0.9, 'sine', 0.2);
    this.playTone(248, 196, 0.72, 'triangle', 0.09);
    this.playTone(332, 244, 0.65, 'sine', 0.07);
    this.playNoise(0.28, 720, 0.07, { filterFreqEnd: 320 });
  }

  public playKO(): void {
    this.playTone(130, 30, 0.45, 'sine', 0.26);
    this.playTone(210, 48, 0.36, 'sawtooth', 0.16);
    this.playNoise(0.25, 480, 0.22, { filterType: 'lowpass', filterFreqEnd: 140 });
    this.playTone(165, 110, 0.95, 'sine', 0.18, 0.08);
    this.playTone(330, 242, 0.72, 'triangle', 0.08, 0.08);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const delay = idx * 0.09;
      const dur = idx === notes.length - 1 ? 0.58 : 0.22;
      this.playTone(freq, freq * 1.004, dur, 'triangle', 0.11, delay);
      this.playTone(freq * 2, freq * 2, dur * 0.75, 'sine', 0.04, delay);
    });
  }
}

export const soundEngine = new SoundEngine();
