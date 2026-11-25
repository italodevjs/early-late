import { type Chart, noteMs, validateChart } from './chart.js';
export type Grade = 'precise' | 'close' | 'miss';
export type Action = { kind: 'press' | 'release'; lane: number; ms: number };
export type Judgment = { note: number; part: 'head' | 'tail'; grade: Grade; delta: number | null; at: number };
export interface Summary { score: number; combo: number; best: number; accuracy: number; precise: number; close: number; miss: number; judged: number }
export const WINDOW = 140;
export const PRECISE = 45;
export const TAIL_GRACE = 60;

export class Session {
  readonly chart: Chart;
  readonly states: ('waiting' | 'holding' | 'done')[];
  readonly judgments: Judgment[] = [];
  readonly actions: Action[] = [];
  readonly down = new Set<number>();
  time = 0;
  finished = false;
  constructor(chart: Chart) {
    this.chart = validateChart(chart);
    this.states = this.chart.notes.map(() => 'waiting');
  }
  private award(note: number, part: Judgment['part'], grade: Grade, at: number, delta: number | null = null): void {
    this.judgments.push({ note, part, grade, delta, at });
  }
  advance(ms: number): void {
    if (this.finished || !Number.isFinite(ms) || ms < this.time) return;
    this.time = ms;
    const due: { i: number; at: number; part: 'head' | 'tail' }[] = [];
    this.chart.notes.forEach((n, i) => {
      const start = noteMs(this.chart, n);
      if (this.states[i] === 'waiting' && ms > start + WINDOW) due.push({ i, at: start + WINDOW, part: 'head' });
      if (this.states[i] === 'holding' && ms >= start + n.length * 60000 / this.chart.bpm) due.push({ i, at: start + n.length * 60000 / this.chart.bpm, part: 'tail' });
    });
    due.sort((a, b) => a.at - b.at || a.i - b.i);
    for (const d of due) {
      this.award(d.i, d.part, d.part === 'head' ? 'miss' : 'precise', d.at);
      if (d.part === 'head' && (this.chart.notes[d.i]?.length ?? 0) > 0) this.award(d.i, 'tail', 'miss', d.at);
      this.states[d.i] = 'done';
    }
  }
  input(action: Action): void {
    if (this.finished || !Number.isInteger(action.lane) || action.lane < 0 || action.lane > 3 || !Number.isFinite(action.ms) || action.ms < this.time) return;
    this.advance(action.ms);
    if (action.kind === 'press') {
      if (this.down.has(action.lane)) return;
      this.down.add(action.lane);
      this.actions.push({ ...action });
      const i = this.chart.notes.findIndex((n, j) => n.lane === action.lane && this.states[j] === 'waiting' && Math.abs(action.ms - noteMs(this.chart, n)) <= WINDOW);
      if (i < 0) return;
      const note = this.chart.notes[i]!;
      const delta = action.ms - noteMs(this.chart, note);
      this.award(i, 'head', Math.abs(delta) <= PRECISE ? 'precise' : 'close', action.ms, delta);
      this.states[i] = note.length > 0 ? 'holding' : 'done';
    } else if (this.down.delete(action.lane)) {
      this.actions.push({ ...action });
      const i = this.chart.notes.findIndex((n, j) => n.lane === action.lane && this.states[j] === 'holding');
      if (i < 0) return;
      const n = this.chart.notes[i]!;
      const end = noteMs(this.chart, n) + n.length * 60000 / this.chart.bpm;
      this.award(i, 'tail', action.ms >= end - TAIL_GRACE ? 'precise' : 'miss', action.ms);
      this.states[i] = 'done';
    }
  }
  finish(): void {
    if (this.finished) return;
    this.chart.notes.forEach((n, i) => {
      if (this.states[i] === 'waiting') {
        this.award(i, 'head', 'miss', this.time);
        if (n.length > 0) this.award(i, 'tail', 'miss', this.time);
      } else if (this.states[i] === 'holding') this.award(i, 'tail', 'miss', this.time);
      this.states[i] = 'done';
    });
    this.down.clear();
    this.finished = true;
  }
  summary(): Summary {
    const out: Summary = { score: 0, combo: 0, best: 0, accuracy: 0, precise: 0, close: 0, miss: 0, judged: this.judgments.length };
    for (const j of this.judgments) {
      out[j.grade]++;
      if (j.grade === 'miss') out.combo = 0;
      else { out.combo++; out.best = Math.max(out.best, out.combo); out.score += j.grade === 'precise' ? 1000 : 600; }
    }
    out.accuracy = out.judged ? (out.precise + out.close * 0.6) / out.judged * 100 : 0;
    return out;
  }
}

export function replay(chart: Chart, actions: readonly Action[]): Session {
  const session = new Session(chart);
  for (const action of actions) session.input(action);
  session.finish();
  return session;
}

export class SongClock {
  private anchor = 0;
  private frozen = 0;
  state: 'ready' | 'playing' | 'paused' = 'ready';
  constructor(private readonly now: () => number) {}
  read(): number { return this.state === 'playing' ? this.frozen + this.now() - this.anchor : this.frozen; }
  start(): void { this.frozen = 0; this.anchor = this.now(); this.state = 'playing'; }
  pause(): void { if (this.state === 'playing') { this.frozen = this.read(); this.state = 'paused'; } }
  resume(): void { if (this.state === 'paused') { this.anchor = this.now(); this.state = 'playing'; } }
}

export function median(values: readonly number[]): number {
  if (!values.length || values.some(x => !Number.isFinite(x))) throw new Error('Finite timing samples required.');
  const v = [...values].sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}
