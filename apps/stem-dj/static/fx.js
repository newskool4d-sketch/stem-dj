// 이펙터 노드 — AudioContext를 인자로 받음 (전역 의존 없음)
import { applyAudioParamTarget, audioParamTarget } from "./audio-params.js";

export function createImpulse(ctx, seconds = 1.4, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export class FlangerNode {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const delay = ctx.createDelay(0.02);
    delay.delayTime.value = 0.005;
    this.lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    this.lfo.frequency.value = 0.25;
    lfoGain.gain.value = 0.003;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    this.input.connect(delay);
    delay.connect(this.wet);
    this.wet.connect(this.output);
    this.input.connect(this.output);
    this.lfo.start();
  }
  setWet(v) { applyAudioParamTarget(this.wet.gain, audioParamTarget(v, { now: this.ctx.currentTime })); }
  dispose() { try { this.lfo.stop(); } catch {} }
}

export class PhaserNode {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    const allpasses = [200, 400, 800, 1600].map((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = "allpass";
      f.frequency.value = freq;
      f.Q.value = 0.5;
      return f;
    });
    this.lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    this.lfo.frequency.value = 0.3;
    lfoGain.gain.value = 800;
    this.lfo.connect(lfoGain);
    allpasses.forEach((f) => lfoGain.connect(f.frequency));
    this.input.connect(allpasses[0]);
    for (let i = 0; i < 3; i++) allpasses[i].connect(allpasses[i + 1]);
    allpasses[3].connect(this.wet);
    this.wet.connect(this.output);
    this.input.connect(this.output);
    this.lfo.start();
  }
  setWet(v) { applyAudioParamTarget(this.wet.gain, audioParamTarget(v, { now: this.ctx.currentTime })); }
  dispose() { try { this.lfo.stop(); } catch {} }
}
