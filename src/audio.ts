import { type Chart, durationMs } from './chart.js';
import { SongClock } from './engine.js';

export class PulseAudio {
  private readonly context = new AudioContext();
  readonly clock = new SongClock(() => this.context.currentTime * 1000);
  private next = 0;
  constructor(readonly chart: Chart) {}
  async start(): Promise<void> { await this.context.resume(); this.clock.start(); this.schedule(); }
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
  async pause(): Promise<void> { this.clock.pause(); await this.context.suspend(); }
  async resume(): Promise<void> { await this.context.resume(); this.clock.resume(); }
  async close(): Promise<void> { await this.context.close(); }
}
