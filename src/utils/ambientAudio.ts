import type { AudioPresetId } from '../types/live.ts';

/**
 * Pure Web Audio API chill podcast music & ambient soundscape synthesizer.
 * Includes a gentle lo-fi beat pulse, warm Rhodes chords, acoustic arpeggios,
 * vinyl/rain warmth, and soft gift chimes with zero external MP3 dependencies.
 */
class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private loopTimer: number | null = null;
  private isPlaying = false;
  private currentPreset: AudioPresetId = 'lofi_chill_podcast';
  private volume = 0.38;
  private stepCount = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.14;
      this.rainGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.65;
      this.musicGain.connect(this.masterGain);
    }
    return this.ctx;
  }

  private createPinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private startAmbientNoise(ctx: AudioContext) {
    if (this.rainSource) {
      try {
        this.rainSource.stop();
      } catch {
        // Ignore
      }
      this.rainSource = null;
    }
    if (!this.rainGain) return;

    const source = ctx.createBufferSource();
    source.buffer = this.createPinkNoiseBuffer(ctx);
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.4;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 210;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(this.rainGain);
    source.start();
    this.rainSource = source;
  }

  private playWarmChord(
    ctx: AudioContext,
    freqs: number[],
    durationSec: number,
    cutoff = 720,
  ) {
    if (!this.musicGain) return;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.55, now + durationSec);
    filter.connect(this.musicGain);

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx - 1.5) * 3.2, now);

      const peak = 0.15 / freqs.length;
      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.linearRampToValueAtTime(peak, now + 0.12);
      noteGain.gain.exponentialRampToValueAtTime(peak * 0.5, now + durationSec * 0.65);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(noteGain);
      noteGain.connect(filter);
      osc.start(now + idx * 0.028);
      osc.stop(now + durationSec + 0.08);
    });
  }

  private playSoftNote(ctx: AudioContext, freq: number, delaySec: number, dur = 1.4) {
    if (!this.musicGain) return;
    const t = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 950;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.048, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private playLofiKick(ctx: AudioContext, delaySec: number) {
    if (!this.musicGain) return;
    const t = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.11, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  private playSoftBrush(ctx: AudioContext, delaySec: number, gainPeak = 0.025) {
    if (!this.musicGain) return;
    const t = ctx.currentTime + delaySec;
    const len = Math.floor(ctx.sampleRate * 0.07);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
  }

  private startMusicLoop(ctx: AudioContext) {
    if (this.loopTimer) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.currentPreset === 'soft_rain') return;

    const lofiChords = [
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [164.81, 196.0, 246.94, 293.66], // Em7
      [146.83, 174.61, 220.0, 261.63], // Dm7
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
    ];

    const nightChords = [
      [130.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 220.0, 261.63],
      [146.83, 220.0, 261.63, 329.63],
      [123.47, 196.0, 246.94, 293.66],
    ];

    // 72 BPM bar = ~3.33s for 4 beats (833ms/beat)
    const barMs =
      this.currentPreset === 'lofi_chill_podcast'
        ? 3333
        : this.currentPreset === 'acoustic_coffeehouse'
          ? 3400
          : 4200;

    const triggerBar = () => {
      const activeCtx = this.ctx;
      if (!this.isPlaying || !activeCtx) return;
      const chord =
        this.currentPreset === 'midnight_pad'
          ? nightChords[this.stepCount % nightChords.length]
          : lofiChords[this.stepCount % lofiChords.length];

      if (this.currentPreset === 'lofi_chill_podcast') {
        const beat = barMs / 4000;
        this.playWarmChord(activeCtx, chord, barMs / 1000 + 0.3, 660);
        // Chill 72 BPM lo-fi pocket: soft kick on 1 & 2.5, whisper brush on 2 & 4
        this.playLofiKick(activeCtx, 0);
        this.playSoftBrush(activeCtx, beat, 0.022);
        this.playLofiKick(activeCtx, beat * 2.5);
        this.playSoftBrush(activeCtx, beat * 3, 0.024);
        // Delicate Rhodes top melody pick
        const melody = chord[this.stepCount % 2 === 0 ? 3 : 2] * 2;
        this.playSoftNote(activeCtx, melody, beat * 1.5, 1.1);
        this.playSoftNote(activeCtx, chord[1] * 2, beat * 3.25, 0.9);
      } else if (this.currentPreset === 'acoustic_coffeehouse') {
        const beat = barMs / 4000;
        this.playWarmChord(activeCtx, chord, barMs / 1000 + 0.4, 780);
        chord.forEach((f, idx) => {
          this.playSoftNote(activeCtx, f * 2, idx * beat * 0.85 + 0.25, 1.3);
        });
      } else {
        this.playWarmChord(activeCtx, chord, 4.4, 620);
      }

      this.stepCount += 1;
    };

    triggerBar();
    this.loopTimer = window.setInterval(triggerBar, barMs);
  }

  public async update(enabled: boolean, preset: AudioPresetId, volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    const presetChanged = preset !== this.currentPreset;
    this.currentPreset = preset;

    if (!enabled) {
      this.stop();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.rainGain || !this.musicGain) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(this.volume * 0.9, now + 0.45);

    this.rainGain.gain.setTargetAtTime(
      preset === 'soft_rain'
        ? 0.52
        : preset === 'rain_chords'
          ? 0.2
          : preset === 'lofi_chill_podcast'
            ? 0.09
            : 0.06,
      now,
      0.3,
    );
    this.musicGain.gain.setTargetAtTime(
      preset === 'soft_rain' ? 0 : 0.7,
      now,
      0.3,
    );

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.startAmbientNoise(ctx);
      this.startMusicLoop(ctx);
    } else if (presetChanged) {
      this.startMusicLoop(ctx);
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.loopTimer) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.35);
    }
    if (this.rainSource) {
      const src = this.rainSource;
      this.rainSource = null;
      window.setTimeout(() => {
        try {
          src.stop();
        } catch {
          // Ignore
        }
      }, 380);
    }
  }

  public async playGiftChime(volume = 0.25) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.0001, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(volume * 0.14, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.6);
    });
  }
}

export const ambientAudioEngine = new AmbientAudioEngine();
