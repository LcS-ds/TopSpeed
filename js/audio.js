/* ==========================================================================
   TOPSPEED - Web Audio API Procedural Synthesizer
   Engine, Sound Effects & Retro Synthwave Music
   ========================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.initialized = false;

    // Engine Sound Node handles
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;

    // Tire Squeal Node handles
    this.squealNoise = null;
    this.squealGain = null;
    this.squealFilter = null;

    // Music Handles
    this.musicTimer = null;
    this.musicStep = 0;
    this.isPlayingMusic = false;

    // Gear ratios for engine audio synthesis
    this.gearMaxSpeeds = [40, 80, 120, 160, 200, 240];
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initialized = true;

      this._setupEngineSynth();
      this._setupSquealSynth();
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /* --------------------------------------------------------------------------
     Engine Audio Synthesizer
     -------------------------------------------------------------------------- */
  _setupEngineSynth() {
    if (!this.ctx) return;

    // Engine Main Gain
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

    // Lowpass filter for natural intake/exhaust muffling
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

    // Dual Sawtooth Oscillators for rich harmonic engine growl
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(60, this.ctx.currentTime);

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.setValueAtTime(30, this.ctx.currentTime);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(subGain);
    subGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  updateEngine(speed, maxSpeed, isAccelerating, gear) {
    if (!this.ctx || !this.engineGain) return;

    // Calculate RPM percentage
    const gearMax = this.gearMaxSpeeds[gear - 1] || 220;
    const gearMin = (gear - 1 > 0) ? this.gearMaxSpeeds[gear - 2] : 0;
    const gearRatio = Math.max(0, Math.min(1, (speed - gearMin) / (gearMax - gearMin)));

    // Base pitch modulation
    const baseFreq = 50 + (gearRatio * 180) + (speed * 0.4);
    const filterFreq = 300 + (gearRatio * 2200);

    const targetGain = isAccelerating ? Math.min(0.25, 0.08 + (speed / maxSpeed) * 0.15) : 0.03;

    const now = this.ctx.currentTime;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.08);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
  }

  /* --------------------------------------------------------------------------
     Tire Squeal Noise Synth
     -------------------------------------------------------------------------- */
  _setupSquealSynth() {
    if (!this.ctx) return;

    // Create 1 second buffer of white noise for tire squeal
    const bufferSize = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.squealNoise = this.ctx.createBufferSource();
    this.squealNoise.buffer = buffer;
    this.squealNoise.loop = true;

    this.squealFilter = this.ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.setValueAtTime(2500, this.ctx.currentTime);
    this.squealFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

    this.squealNoise.connect(this.squealFilter);
    this.squealFilter.connect(this.squealGain);
    this.squealGain.connect(this.ctx.destination);

    this.squealNoise.start();
  }

  updateDriftSqueal(isDrifting, driftIntensity) {
    if (!this.ctx || !this.squealGain) return;

    const now = this.ctx.currentTime;
    if (isDrifting && driftIntensity > 0.1) {
      const targetGain = Math.min(0.2, driftIntensity * 0.15);
      const targetFreq = 2000 + (driftIntensity * 1000);
      this.squealGain.gain.setTargetAtTime(targetGain, now, 0.03);
      this.squealFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);
    } else {
      this.squealGain.gain.setTargetAtTime(0.001, now, 0.05);
    }
  }

  /* --------------------------------------------------------------------------
     One-Shot Sound Effects (Collision, Warning Beep)
     -------------------------------------------------------------------------- */
  playCollision() {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playJump() {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.18);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playLanding(impact = 1) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    gain.gain.setValueAtTime(Math.min(0.22, 0.06 + impact * 0.014), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playSpeedWarning() {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5 note
    osc.frequency.setValueAtTime(1046, now + 0.1); // C6 note

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  playCountdownBeep(isGo = false) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 1200 : 600, now);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.6 : 0.2));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isGo ? 0.6 : 0.2));
  }

  /* --------------------------------------------------------------------------
     Procedural Synthwave Music Generator
     -------------------------------------------------------------------------- */
  startMusic() {
    if (!this.ctx || this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.musicStep = 0;

    const stepDuration = (60 / 138) / 4; // 16th note interval

    const basslineNotes = [
      174.61, 174.61, 349.23, 174.61, 207.65, 174.61, 349.23, 174.61,
      155.56, 155.56, 311.13, 155.56, 174.61, 155.56, 311.13, 155.56
    ];

    const leadNotes = [
      698.46, 0, 830.61, 0, 1046.50, 0, 830.61, 698.46,
      622.25, 0, 698.46, 0, 783.99, 0, 698.46, 0
    ];

    const playNextStep = () => {
      if (!this.isPlayingMusic || !this.ctx) return;

      const now = this.ctx.currentTime;
      const stepIdx = this.musicStep % 16;

      // 1. Synth Bass Note
      const bassFreq = basslineNotes[stepIdx];
      if (bassFreq > 0) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + stepDuration * 0.9);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration * 0.9);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + stepDuration * 0.9);
      }

      // 2. Arpeggiated Lead Note
      const leadFreq = leadNotes[stepIdx];
      if (leadFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(leadFreq, now);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration * 1.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + stepDuration * 1.5);
      }

      // 3. Arcade Hi-Hat Rhythm on 16th beats
      if (stepIdx % 2 === 0) {
        const hatOsc = this.ctx.createOscillator();
        const hatGain = this.ctx.createGain();
        hatOsc.type = 'square';
        hatOsc.frequency.setValueAtTime(8000, now);
        hatGain.gain.setValueAtTime(0.015, now);
        hatGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

        hatOsc.connect(hatGain);
        hatGain.connect(this.ctx.destination);
        hatOsc.start(now);
        hatOsc.stop(now + 0.05);
      }

      this.musicStep++;
      this.musicTimer = setTimeout(playNextStep, stepDuration * 1000);
    };

    playNextStep();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  stopEngine() {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.1);
  }
}
