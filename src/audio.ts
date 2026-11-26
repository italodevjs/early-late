import { type Chart, durationMs } from './chart.js';
import { SongClock } from './engine.js';

function createContext(): AudioContext {
  if (!globalThis.AudioContext) throw new Error('Audio playback is unavailable in this browser. Try a current browser with audio enabled.');
  return new globalThis.AudioContext();
}

export class PulseAudio {
  private readonly context = createContext();
  readonly clock = new SongClock(() => this.context.currentTime * 1000);
  private next = 0;
  private closed = false;
  private transition: Promise<void> = Promise.resolve();
  constructor(readonly chart: Chart) {}
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.transition.then(operation);
    this.transition = result.catch(() => {});
    return result;
  }
  start(): Promise<void> { return this.enqueue(async () => { if (this.closed) return; await this.context.resume(); if (this.closed) return; this.clock.start(); this.schedule(); }); }
  schedule(): void {
    if (this.clock.state !== 'playing') return;
    const stepMs = 30000 / this.chart.bpm;
    const limit = Math.min(this.clock.read() + 180, durationMs(this.chart));
    while (this.next * stepMs < limit) {
      const step = this.next++, beat = step / 2;
      const t = this.context.currentTime + (step * stepMs - this.clock.read()) / 1000;
      if (t < this.context.currentTime - 0.01) continue;
      const osc = this.context.createOscillator(), gain = this.context.createGain();
      const strong = step % 8 === 0, quarter = step % 2 === 0;
      osc.type = quarter ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(strong ? 880 : quarter ? 440 : 220, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(beat < 4 ? 0.12 : quarter ? 0.09 : 0.035, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain); gain.connect(this.context.destination);
      osc.start(t); osc.stop(t + 0.1);
    }
  }
  pause(): Promise<void> { return this.enqueue(async () => { if (this.closed) return; this.clock.pause(); await this.context.suspend(); }); }
  resume(): Promise<void> { return this.enqueue(async () => { if (this.closed) return; await this.context.resume(); if (!this.closed) this.clock.resume(); }); }
  close(): Promise<void> { if (this.closed) return this.transition; this.closed = true; this.clock.pause(); return this.enqueue(() => this.context.close()); }
}
