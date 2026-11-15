import { MirrorId, MusicTrackId } from "../types/mirror";

const MIRROR_HARMONICS: Record<
  MirrorId,
  { chimeFreq: number; humFreq: number }
> = {
  porthole: { chimeFreq: 659.25, humFreq: 110.0 },
  arch: { chimeFreq: 783.99, humFreq: 130.81 },
  octagon: { chimeFreq: 587.33, humFreq: 98.0 },
  oval: { chimeFreq: 739.99, humFreq: 123.47 },
};

export interface AudioBands {
  level: number;
  low: number;
  high: number;
}

export interface StoryPlaybackCallbacks {
  onChapterStart: (index: number, text: string) => void;
  onPlaybackComplete: () => void;
  onNotice?: (message: string) => void;
  onError: (message: string) => void;
}

class TtsQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsQuotaError";
  }
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const part of raw) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (current && current.length + trimmed.length > 190) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class OceanStoryAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speechGain: GainNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  // Procedural multi-track background music state
  private musicTrack: MusicTrackId = "abyssal";
  private musicGain: GainNode | null = null;
  private musicStoppers: (() => void)[] = [];
  private musicTimer: number | null = null;
  private isSpeakingDuck = false;

  // Proximity underwater hum & glass chime state (independent of background music)
  private proxHumGain: GainNode | null = null;
  private proxHumOsc1: OscillatorNode | null = null;
  private proxHumOsc2: OscillatorNode | null = null;
  private proxHumLfo: OscillatorNode | null = null;
  private proxHumStopTimer: number | null = null;
  private proxHumMirrorId: MirrorId | null = null;
  private proxInRange = false;
  private proxIntensity = 0;
  private lastChimeTime = 0;

  private chapters: string[] = [];
  private voiceName = "Charon";
  private voiceStyle = "Dry awkward British deep-ocean storyteller";
  private chapterCache = new Map<number, Promise<AudioBuffer>>();
  private currentIndex = 0;
  private paused = false;
  private stopped = true;
  private sessionToken = 0;
  private callbacks: StoryPlaybackCallbacks | null = null;

  // Browser speech fallback state when Gemini TTS daily quota is exhausted
  private quotaFallbackUntil = 0;
  private useBrowserSpeech = false;
  private browserSpeechActive = false;
  private browserSpeechTimer: number | null = null;
  private wordPulse = 0;
  private lastWordPulseAt = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqData = new Uint8Array(
        new ArrayBuffer(this.analyser.frequencyBinCount)
      );

      this.speechGain = this.ctx.createGain();
      this.speechGain.gain.value = 1.0;

      this.analyser.connect(this.speechGain);
      this.speechGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended" && !this.paused) {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMusicTrack(trackId: MusicTrackId): void {
    this.musicTrack = trackId;
    this.stopMusicNodes();

    if (trackId === "off") return;

    const ctx = this.ensureContext();
    const bus = ctx.createGain();
    const targetLevel = this.isSpeakingDuck ? 0.045 : 0.09;
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(targetLevel, ctx.currentTime + 1.1);
    bus.connect(ctx.destination);
    this.musicGain = bus;

    if (trackId === "abyssal") {
      this.buildAbyssalDrone(ctx, bus);
    } else if (trackId === "tearoom") {
      this.buildBritishTeaRoom(ctx, bus);
    } else if (trackId === "harp") {
      this.buildBioluminescentHarp(ctx, bus);
    } else if (trackId === "trench") {
      this.buildMarianaSynth(ctx, bus);
    }
  }

  public getMusicTrack(): MusicTrackId {
    return this.musicTrack;
  }

  private setMusicDuck(duck: boolean) {
    this.isSpeakingDuck = duck;
    if (this.ctx && this.proxHumGain && this.proxInRange) {
      this.updateProximityHumGain(this.proxIntensity);
    }
    if (!this.ctx || !this.musicGain || this.musicTrack === "off") return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(duck ? 0.045 : 0.09, now, 0.45);
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playMirrorChime(mirrorId: MirrorId): void {
    if (!this.ctx || this.ctx.state !== "running" || this.paused) return;
    const nowMs = performance.now();
    if (nowMs - this.lastChimeTime < 750) return;
    this.lastChimeTime = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { chimeFreq } = MIRROR_HARMONICS[mirrorId];

    // Resonant glass filter
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(chimeFreq * 1.4, now);
    filter.Q.setValueAtTime(2.4, now);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.048, now + 0.035);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);

    filter.connect(master);
    master.connect(ctx.destination);

    // Three crystalline glass partials (fundamental, soft fifth, shimmer octave)
    const partials: [number, number, number][] = [
      [chimeFreq, 1.0, 1.85],
      [chimeFreq * 1.5, 0.45, 1.45],
      [chimeFreq * 2.003, 0.28, 1.15],
    ];

    for (const [freq, amp, dur] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
  }

  public setMirrorProximity(
    inRange: boolean,
    mirrorId: MirrorId,
    intensity: number
  ): void {
    this.proxInRange = inRange;
    this.proxIntensity = intensity;

    if (!this.ctx || this.ctx.state !== "running") return;

    if (!inRange) {
      this.fadeOutProximityHum();
      return;
    }

    if (this.proxHumStopTimer !== null) {
      window.clearTimeout(this.proxHumStopTimer);
      this.proxHumStopTimer = null;
    }

    if (!this.proxHumGain) {
      this.startProximityHum(mirrorId);
    } else if (this.proxHumMirrorId !== mirrorId) {
      this.retuneProximityHum(mirrorId);
    }

    this.updateProximityHumGain(intensity);
  }

  private startProximityHum(mirrorId: MirrorId) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { humFreq } = MIRROR_HARMONICS[mirrorId];
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, now);
    filter.Q.setValueAtTime(2.2, now);

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);

    // Subtle underwater glass resonance: root + soft fifth + slow shimmer LFO
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(humFreq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(humFreq * 1.5, now);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.24, now);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.32, now);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.setValueAtTime(48, now);
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(bus);
    bus.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    this.proxHumGain = bus;
    this.proxHumOsc1 = osc1;
    this.proxHumOsc2 = osc2;
    this.proxHumLfo = lfo;
    this.proxHumMirrorId = mirrorId;
  }

  private retuneProximityHum(mirrorId: MirrorId) {
    if (!this.ctx || !this.proxHumOsc1 || !this.proxHumOsc2) return;
    const { humFreq } = MIRROR_HARMONICS[mirrorId];
    const now = this.ctx.currentTime;
    this.proxHumOsc1.frequency.setTargetAtTime(humFreq, now, 0.25);
    this.proxHumOsc2.frequency.setTargetAtTime(humFreq * 1.5, now, 0.25);
    this.proxHumMirrorId = mirrorId;
  }

  private updateProximityHumGain(intensity: number) {
    if (!this.ctx || !this.proxHumGain) return;
    const clamped = Math.max(0.15, Math.min(1, intensity));
    const baseMax = this.isSpeakingDuck ? 0.012 : 0.028;
    const target = baseMax * clamped;
    const now = this.ctx.currentTime;
    this.proxHumGain.gain.cancelScheduledValues(now);
    this.proxHumGain.gain.setTargetAtTime(target, now, 0.35);
  }

  private fadeOutProximityHum() {
    if (!this.ctx || !this.proxHumGain) return;
    const now = this.ctx.currentTime;
    this.proxHumGain.gain.cancelScheduledValues(now);
    this.proxHumGain.gain.setTargetAtTime(0.0001, now, 0.22);

    if (this.proxHumStopTimer === null) {
      this.proxHumStopTimer = window.setTimeout(() => {
        this.proxHumStopTimer = null;
        if (!this.proxInRange) {
          this.stopProximityHumImmediate();
        }
      }, 950);
    }
  }

  private stopProximityHumImmediate() {
    if (this.proxHumStopTimer !== null) {
      window.clearTimeout(this.proxHumStopTimer);
      this.proxHumStopTimer = null;
    }
    try {
      this.proxHumOsc1?.stop();
      this.proxHumOsc2?.stop();
      this.proxHumLfo?.stop();
      this.proxHumGain?.disconnect();
    } catch {
      // ignore
    }
    this.proxHumOsc1 = null;
    this.proxHumOsc2 = null;
    this.proxHumLfo = null;
    this.proxHumGain = null;
    this.proxHumMirrorId = null;
  }

  private stopMusicNodes() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    for (const stop of this.musicStoppers) {
      try {
        stop();
      } catch {
        // ignore
      }
    }
    this.musicStoppers = [];
    if (this.musicGain) {
      try {
        this.musicGain.disconnect();
      } catch {
        // ignore
      }
      this.musicGain = null;
    }
  }

  private buildAbyssalDrone(ctx: AudioContext, bus: GainNode) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 210;
    filter.connect(bus);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 65.41; // C2

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 98.0; // G2

    const whaleOsc = ctx.createOscillator();
    whaleOsc.type = "sine";
    whaleOsc.frequency.value = 196.0;
    const whaleGain = ctx.createGain();
    whaleGain.gain.value = 0.0;

    osc1.connect(filter);
    osc2.connect(filter);
    whaleOsc.connect(whaleGain);
    whaleGain.connect(filter);

    osc1.start();
    osc2.start();
    whaleOsc.start();

    // Gentle distant whale glide every 4.5s
    const triggerCall = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      whaleOsc.frequency.cancelScheduledValues(now);
      whaleOsc.frequency.setValueAtTime(220, now);
      whaleOsc.frequency.exponentialRampToValueAtTime(146.8, now + 2.4);
      whaleGain.gain.cancelScheduledValues(now);
      whaleGain.gain.setValueAtTime(0.001, now);
      whaleGain.gain.linearRampToValueAtTime(0.28, now + 0.7);
      whaleGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
    };
    triggerCall();
    this.musicTimer = window.setInterval(triggerCall, 4600);

    this.musicStoppers.push(() => {
      osc1.stop();
      osc2.stop();
      whaleOsc.stop();
    });
  }

  private buildBritishTeaRoom(ctx: AudioContext, bus: GainNode) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 950;
    filter.connect(bus);

    // Subtle rainy-window filtered noise
    const bufSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.25;
    }
    const rain = ctx.createBufferSource();
    rain.buffer = noiseBuf;
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1200;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.14;
    rain.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(bus);
    rain.start();

    // Warm electric-piano lo-fi chord cycle: Cmaj9 -> Am9 -> Fmaj7 -> G6
    const chords = [
      [261.63, 329.63, 392.0, 493.88, 587.33],
      [220.0, 261.63, 329.63, 392.0, 493.88],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 329.63],
    ];
    let step = 0;
    const activeOscs = new Set<OscillatorNode>();

    const playChord = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = chords[step % chords.length];
      step++;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.14, now + 0.08 + idx * 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
        osc.connect(g);
        g.connect(filter);
        osc.start(now + idx * 0.025);
        osc.stop(now + 2.4);
        activeOscs.add(osc);
        osc.onended = () => activeOscs.delete(osc);
      });
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 2450);

    this.musicStoppers.push(() => {
      rain.stop();
      for (const o of activeOscs) {
        try {
          o.stop();
        } catch {
          // ignore
        }
      }
      activeOscs.clear();
    });
  }

  private buildBioluminescentHarp(ctx: AudioContext, bus: GainNode) {
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;

    filter.connect(bus);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(bus);

    const scale = [293.66, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99];
    let idx = 0;
    const activeOscs = new Set<OscillatorNode>();

    const pluck = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freq = scale[(idx + (idx % 3 === 0 ? 2 : 0)) % scale.length];
      idx++;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      osc.stop(now + 1.3);
      activeOscs.add(osc);
      osc.onended = () => activeOscs.delete(osc);
    };

    pluck();
    this.musicTimer = window.setInterval(pluck, 540);

    this.musicStoppers.push(() => {
      for (const o of activeOscs) {
        try {
          o.stop();
        } catch {
          // ignore
        }
      }
      activeOscs.clear();
    });
  }

  private buildMarianaSynth(ctx: AudioContext, bus: GainNode) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 3.2;
    filter.connect(bus);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const pad1 = ctx.createOscillator();
    pad1.type = "sawtooth";
    pad1.frequency.value = 55.0; // A1

    const pad2 = ctx.createOscillator();
    pad2.type = "sawtooth";
    pad2.frequency.value = 82.41; // E2

    const padGain = ctx.createGain();
    padGain.gain.value = 0.22;

    pad1.connect(padGain);
    pad2.connect(padGain);
    padGain.connect(filter);

    pad1.start();
    pad2.start();

    const pulseNotes = [110, 130.81, 164.81, 146.83];
    let step = 0;
    const activeOscs = new Set<OscillatorNode>();

    const pulse = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freq = pulseNotes[step % pulseNotes.length];
      step++;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + 1.7);
      activeOscs.add(osc);
      osc.onended = () => activeOscs.delete(osc);
    };
    pulse();
    this.musicTimer = window.setInterval(pulse, 1800);

    this.musicStoppers.push(() => {
      lfo.stop();
      pad1.stop();
      pad2.stop();
      for (const o of activeOscs) {
        try {
          o.stop();
        } catch {
          // ignore
        }
      }
      activeOscs.clear();
    });
  }

  private fetchChapterAudio(
    index: number,
    token: number
  ): Promise<AudioBuffer> {
    const cached = this.chapterCache.get(index);
    if (cached) return cached;

    const promise = (async () => {
      const text = this.chapters[index];
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceName: this.voiceName,
          style: this.voiceStyle,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const msg = err.error || `TTS request failed (${res.status})`;
        if (res.status === 429 || err.code === "QUOTA_EXCEEDED") {
          throw new TtsQuotaError(msg);
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { audioBase64: string };
      if (this.sessionToken !== token) {
        throw new Error("Playback cancelled");
      }
      const ctx = this.ensureContext();
      const buffer = base64ToArrayBuffer(data.audioBase64);
      return await ctx.decodeAudioData(buffer);
    })();

    this.chapterCache.set(index, promise);
    return promise;
  }

  private pickBrowserVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const preferFemale =
      this.voiceName === "Kore" || this.voiceName === "Zephyr";
    const gbVoices = voices.filter((v) =>
      v.lang.toLowerCase().startsWith("en-gb")
    );
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    const pool = gbVoices.length > 0 ? gbVoices : enVoices;
    if (!pool.length) return voices[0];

    const femaleHints = ["female", "serena", "kate", "martha", "libby", "sonia", "hazel", "susan", "google uk english female"];
    const maleHints = ["male", "daniel", "arthur", "oliver", "ryan", "george", "google uk english male"];
    const hints = preferFemale ? femaleHints : maleHints;

    const matched = pool.find((v) =>
      hints.some((h) => v.name.toLowerCase().includes(h))
    );
    return matched || pool[0];
  }

  private stopBrowserSpeech(): void {
    this.browserSpeechActive = false;
    this.wordPulse = 0;
    if (this.browserSpeechTimer !== null) {
      window.clearTimeout(this.browserSpeechTimer);
      this.browserSpeechTimer = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  private playChapterWithBrowserSpeech(index: number, token: number): void {
    if (this.stopped || this.sessionToken !== token) return;
    if (index >= this.chapters.length) {
      this.stopBrowserSpeech();
      this.setMusicDuck(false);
      this.stopped = true;
      this.callbacks?.onPlaybackComplete();
      return;
    }

    this.currentIndex = index;
    const text = this.chapters[index];
    this.callbacks?.onChapterStart(index, text);

    const hasSpeech =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined";

    if (!hasSpeech) {
      this.browserSpeechActive = true;
      const durationMs = Math.max(6000, text.length * 48);
      this.browserSpeechTimer = window.setTimeout(() => {
        if (this.stopped || this.sessionToken !== token) return;
        this.playChapterWithBrowserSpeech(index + 1, token);
      }, durationMs);
      return;
    }

    const sentences = splitSentences(text);
    const voice = this.pickBrowserVoice();
    let sentenceIdx = 0;

    const speakNextSentence = () => {
      if (this.stopped || this.sessionToken !== token) return;
      if (sentenceIdx >= sentences.length) {
        this.browserSpeechActive = false;
        this.playChapterWithBrowserSpeech(index + 1, token);
        return;
      }

      const sentence = sentences[sentenceIdx++];
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = voice?.lang || "en-GB";
      if (voice) utterance.voice = voice;
      utterance.rate = 0.96;
      utterance.pitch =
        this.voiceName === "Fenrir"
          ? 0.88
          : this.voiceName === "Kore" || this.voiceName === "Zephyr"
          ? 1.04
          : 0.95;

      this.browserSpeechActive = true;
      this.wordPulse = 0.75;
      this.lastWordPulseAt = performance.now();

      utterance.onboundary = () => {
        this.wordPulse = 0.85 + Math.random() * 0.15;
        this.lastWordPulseAt = performance.now();
      };

      utterance.onend = () => {
        if (this.stopped || this.sessionToken !== token) return;
        this.wordPulse = 0.2;
        this.browserSpeechTimer = window.setTimeout(speakNextSentence, 120);
      };

      utterance.onerror = (ev) => {
        if (this.stopped || this.sessionToken !== token) return;
        if (ev.error === "interrupted" || ev.error === "canceled") return;
        // Fallback to timed chapter pacing if browser speech errors
        this.browserSpeechActive = true;
        const remainingMs = Math.max(4000, sentence.length * 48);
        this.browserSpeechTimer = window.setTimeout(speakNextSentence, remainingMs);
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        const remainingMs = Math.max(4000, sentence.length * 48);
        this.browserSpeechTimer = window.setTimeout(speakNextSentence, remainingMs);
      }
    };

    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    speakNextSentence();
  }

  public async startStory(
    chapters: string[],
    voiceName: string,
    voiceStyle: string,
    callbacks: StoryPlaybackCallbacks
  ): Promise<void> {
    this.stopStoryOnly();
    const token = ++this.sessionToken;
    this.chapters = chapters;
    this.voiceName = voiceName;
    this.voiceStyle = voiceStyle;
    this.callbacks = callbacks;
    this.currentIndex = 0;
    this.paused = false;
    this.stopped = false;
    this.useBrowserSpeech = Date.now() < this.quotaFallbackUntil;

    this.ensureContext();
    if (!this.musicGain && this.musicTrack !== "off") {
      this.setMusicTrack(this.musicTrack);
    }
    this.setMusicDuck(true);

    if (this.useBrowserSpeech) {
      this.callbacks?.onNotice?.(
        "Gemini TTS free-tier daily quota reached — speaking with browser British voice. Add a billing-enabled key in Settings > Secrets for studio Gemini voices."
      );
      this.playChapterWithBrowserSpeech(0, token);
      return;
    }

    await this.playChapter(0, token);
  }

  private async playChapter(index: number, token: number): Promise<void> {
    if (this.stopped || this.sessionToken !== token) return;
    if (this.useBrowserSpeech) {
      this.playChapterWithBrowserSpeech(index, token);
      return;
    }
    if (index >= this.chapters.length) {
      this.setMusicDuck(false);
      this.stopped = true;
      this.callbacks?.onPlaybackComplete();
      return;
    }

    this.currentIndex = index;

    if (!this.useBrowserSpeech && index + 1 < this.chapters.length) {
      void this.fetchChapterAudio(index + 1, token).catch(() => {});
    }

    try {
      const audioBuffer = await this.fetchChapterAudio(index, token);
      if (this.stopped || this.sessionToken !== token) return;

      const ctx = this.ensureContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      if (this.analyser) {
        source.connect(this.analyser);
      } else {
        source.connect(ctx.destination);
      }

      this.currentSource = source;
      this.callbacks?.onChapterStart(index, this.chapters[index]);

      source.onended = () => {
        if (this.stopped || this.sessionToken !== token) return;
        if (this.currentSource === source) {
          this.currentSource = null;
          void this.playChapter(index + 1, token);
        }
      };

      source.start(0);
    } catch (err) {
      if (this.stopped || this.sessionToken !== token) return;
      if (err instanceof TtsQuotaError) {
        this.useBrowserSpeech = true;
        this.quotaFallbackUntil = Date.now() + 10 * 60 * 1000;
        this.callbacks?.onNotice?.(err.message);
        this.playChapterWithBrowserSpeech(index, token);
        return;
      }
      const msg = err instanceof Error ? err.message : "Audio playback failed";
      this.stopStoryOnly();
      this.callbacks?.onError(msg);
    }
  }

  public async pause(): Promise<void> {
    if (this.stopped || this.paused) return;
    this.paused = true;
    if (this.useBrowserSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.pause();
      } catch {
        // ignore
      }
    }
    if (this.ctx && this.ctx.state === "running") {
      await this.ctx.suspend();
    }
  }

  public async resume(): Promise<void> {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    if (this.useBrowserSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  public stopStoryOnly(): void {
    this.sessionToken++;
    this.stopped = true;
    this.paused = false;
    this.stopBrowserSpeech();
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }
    this.chapterCache.clear();
    this.setMusicDuck(false);
  }

  public stop(): void {
    this.stopStoryOnly();
  }

  public getAudioBands(): AudioBands {
    if (this.stopped || this.paused) {
      return { level: 0, low: 0, high: 0 };
    }
    if (this.browserSpeechActive) {
      const now = performance.now();
      const dt = (now - this.lastWordPulseAt) / 1000;
      const decay = Math.exp(-dt * 4.5);
      const t = now * 0.001;
      const cadence =
        0.34 +
        0.24 * Math.sin(t * 14.5) +
        0.16 * Math.sin(t * 23.0 + 1.1);
      const pulse = this.wordPulse * decay;
      const level = Math.min(1, Math.max(0.12, cadence * 0.65 + pulse * 0.45));
      const low = Math.min(1, level * 0.92);
      const high = Math.min(1, level * 0.78 + Math.abs(Math.sin(t * 19)) * 0.15);
      return { level, low, high };
    }
    if (!this.analyser || !this.freqData) {
      return { level: 0, low: 0, high: 0 };
    }
    this.analyser.getByteFrequencyData(this.freqData);
    const len = this.freqData.length;
    let sumAll = 0;
    let sumLow = 0;
    let sumHigh = 0;

    const lowEnd = Math.floor(len * 0.2);
    const highStart = Math.floor(len * 0.35);

    for (let i = 0; i < len; i++) {
      const val = this.freqData[i] / 255;
      sumAll += val;
      if (i < lowEnd) sumLow += val;
      if (i >= highStart) sumHigh += val;
    }

    const level = Math.min(1, (sumAll / len) * 3.1);
    const low = Math.min(1, (sumLow / Math.max(1, lowEnd)) * 2.4);
    const high = Math.min(1, (sumHigh / Math.max(1, len - highStart)) * 3.8);
    return { level, low, high };
  }

  public getCurrentChapterIndex(): number {
    return this.currentIndex;
  }

  public dispose(): void {
    this.stopStoryOnly();
    this.stopMusicNodes();
    this.stopProximityHumImmediate();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
