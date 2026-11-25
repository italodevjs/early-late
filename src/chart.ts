export interface Note { beat: number; lane: number; length: number }
export interface Chart { version: 1; title: string; bpm: number; beats: number; notes: Note[] }
export const MAX_CHART_BYTES = 65536;
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function validateChart(value: unknown): Chart {
  if (!record(value) || value.version !== 1) throw new Error('Use chart format version 1.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 64) throw new Error('Title must contain 1–64 characters.');
  if (!finite(value.bpm) || value.bpm < 60 || value.bpm > 180) throw new Error('Tempo must be 60–180 BPM.');
  if (!finite(value.beats) || !Number.isInteger(value.beats) || value.beats < 4 || value.beats > 64) throw new Error('Length must be 4–64 whole beats.');
  if (!Array.isArray(value.notes) || value.notes.length > 256) throw new Error('A chart may contain at most 256 notes.');
  const notes: Note[] = value.notes.map((n: unknown, i: number) => {
    if (!record(n) || !finite(n.beat) || !finite(n.length) || !finite(n.lane) || !Number.isInteger(n.lane) || n.lane < 0 || n.lane > 3) throw new Error(`Note ${i + 1}: invalid lane or timing.`);
    if (n.beat < 0 || n.length < 0 || n.beat + n.length > (value.beats as number) || n.beat >= (value.beats as number)) throw new Error(`Note ${i + 1}: outside chart bounds.`);
    if (!Number.isInteger(n.beat * 2) || !Number.isInteger(n.length * 2)) throw new Error(`Note ${i + 1}: use half-beat grid positions and lengths.`);
    if (n.length !== 0 && n.length < 0.5) throw new Error(`Note ${i + 1}: a hold needs at least half a beat.`);
    return { beat: n.beat, lane: n.lane, length: n.length };
  }).sort((a, b) => a.beat - b.beat || a.lane - b.lane);
  const ends = [-Infinity, -Infinity, -Infinity, -Infinity];
  for (const n of notes) {
    if (n.beat <= (ends[n.lane] ?? -Infinity)) throw new Error('Notes in one lane cannot overlap or share a timestamp.');
    ends[n.lane] = n.beat + n.length;
  }
  return { version: 1, title: value.title.trim(), bpm: value.bpm, beats: value.beats, notes };
}

export function parseChart(text: string): Chart {
  if (new TextEncoder().encode(text).byteLength > MAX_CHART_BYTES) throw new Error('Chart file exceeds 64 KiB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Chart is not valid JSON.'); }
  return validateChart(value);
}

export const pulseStudy = (): Chart => validateChart({
  version: 1, title: 'Counterpoint study', bpm: 100, beats: 16,
  notes: [
    { beat: 0, lane: 0, length: 0 }, { beat: 1, lane: 1, length: 0 },
    { beat: 2, lane: 2, length: 0 }, { beat: 3, lane: 3, length: 0 },
    { beat: 4, lane: 0, length: 0 }, { beat: 4, lane: 2, length: 0 },
    { beat: 5, lane: 1, length: 0 }, { beat: 5.5, lane: 3, length: 0 },
    { beat: 6, lane: 0, length: 1.5 }, { beat: 7, lane: 2, length: 0 },
    { beat: 8, lane: 1, length: 0 }, { beat: 8.5, lane: 2, length: 0 },
    { beat: 9, lane: 3, length: 0 }, { beat: 9.5, lane: 1, length: 0 },
    { beat: 10, lane: 0, length: 0 }, { beat: 10, lane: 3, length: 0 },
    { beat: 11, lane: 2, length: 1 }, { beat: 12, lane: 0, length: 0 },
    { beat: 13, lane: 1, length: 0 }, { beat: 14, lane: 2, length: 0 },
    { beat: 15, lane: 0, length: 0 }, { beat: 15, lane: 3, length: 0 },
  ],
});

export const noteMs = (chart: Chart, note: Note): number => (note.beat + 4) * 60000 / chart.bpm;
export const durationMs = (chart: Chart): number => (chart.beats + 4) * 60000 / chart.bpm + 250;
