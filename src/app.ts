import { durationMs, MAX_CHART_BYTES, noteMs, parseChart, pulseStudy, type Chart, validateChart } from './chart.js';
import { type Action, median, Session } from './engine.js';
import { PulseAudio } from './audio.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing interface element ${id}`);
  return el as T;
};
const button = (id: string): HTMLButtonElement => $(id);
const input = (id: string): HTMLInputElement => $(id);
const canvas = $<HTMLCanvasElement>('highway');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas rendering is unavailable.');
const ctx = context;
const keys = ['d', 'f', 'j', 'k'];
const pads = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lane]'));
const storageKey = 'early-late:v1';
interface Run { date: string; chart: Chart; offset: number; actions: Action[]; score: number; accuracy: number; best: number; deltas: number[]; completed: boolean }
let chart = pulseStudy(), session: Session | null = null, audio: PulseAudio | null = null;
let active = false, paused = false, playingReplay = false, replayCursor = 0, seen = 0;
let history: Run[] = [], offset = 0, calibration = false, samples: number[] = [];
let lastFrame = 0;
let lastCalibrationBeat = -1;

function notice(message: string, error = false): void { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function save(): void {
  try { localStorage.setItem(storageKey, JSON.stringify({ chart, offset, history })); }
  catch { notice('Browser storage is unavailable or full. Export your chart and evidence to keep them.', true); }
}
function load(): void {
  try {
    const text = localStorage.getItem(storageKey);
    if (!text || text.length > 2_000_000) return;
    const stored: unknown = JSON.parse(text);
    if (typeof stored !== 'object' || stored === null) return;
    const s = stored as Record<string, unknown>;
    chart = validateChart(s.chart);
    if (typeof s.offset === 'number' && Number.isFinite(s.offset) && Math.abs(s.offset) <= 250) offset = s.offset;
    if (Array.isArray(s.history)) history = s.history.slice(0, 12).flatMap((r: unknown): Run[] => {
      try {
        if (typeof r !== 'object' || r === null) return [];
        const v = r as Run, c = validateChart(v.chart);
        if (typeof v.date !== 'string' || !Number.isFinite(v.offset) || Math.abs(v.offset) > 250 || !Array.isArray(v.actions) || v.actions.length > 4096 || !Array.isArray(v.deltas)) return [];
        let previous = 0;
        for (const a of v.actions) {
          if (!a || (a.kind !== 'press' && a.kind !== 'release') || !Number.isInteger(a.lane) || a.lane < 0 || a.lane > 3 || !Number.isFinite(a.ms) || a.ms < previous || a.ms > durationMs(c) + 500) return [];
          previous = a.ms;
        }
        if (![v.score, v.accuracy, v.best, ...v.deltas].every(Number.isFinite)) return [];
        return [{ ...v, chart: c }];
      } catch { return []; }
    });
  } catch { notice('Saved data could not be read. The example study is available.', true); }
}
function download(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderChart(): void {
  input('chart-title').value = chart.title; input('bpm').value = String(chart.bpm); input('beats').value = String(chart.beats); input('offset').value = String(offset);
  $('track-title').textContent = chart.title;
  $('track-meta').textContent = `${chart.bpm} BPM · ${chart.beats} beats`;
  $('note-count').textContent = `${chart.notes.length} notes`;
  const grid = $('editor'); grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let half = 0; half < chart.beats * 2; half++) {
    const beat = half / 2;
    const label = document.createElement('span'); label.className = 'beat'; label.textContent = half % 2 ? '·' : String(beat + 1); fragment.append(label);
    for (let lane = 0; lane < 4; lane++) {
      const n = chart.notes.find(n => n.lane === lane && n.beat === beat);
      const tail = chart.notes.some(n => n.lane === lane && n.length > 0 && n.beat < beat && n.beat + n.length >= beat);
      const cell = document.createElement('button'); cell.type = 'button';
      cell.className = `${half % 8 === 0 ? 'barline ' : ''}${n ? n.length ? 'hold' : 'on' : tail ? 'tail' : ''}`;
      cell.setAttribute('aria-label', `Beat ${beat + 1}, lane ${lane + 1}${n ? n.length ? ', hold' : ', tap' : tail ? ', hold tail' : ', empty'}`);
      cell.setAttribute('aria-pressed', String(Boolean(n)));
      cell.disabled = active;
      cell.dataset.half = String(half); cell.dataset.lane = String(lane);
      cell.onclick = () => {
        if (active) return;
        const notes = chart.notes.filter(x => !(x.beat === beat && x.lane === lane));
        if (!n) notes.push({ beat, lane, length: Number($<HTMLSelectElement>('note-length').value) });
        try { chart = validateChart({ ...chart, notes }); renderChart(); document.querySelector<HTMLButtonElement>(`#editor button[data-half="${half}"][data-lane="${lane}"]`)?.focus({ preventScroll: true }); save(); notice('Chart updated. Play to hear the pulse and test your pattern.'); }
        catch (e) { notice(errorText(e), true); }
      };
      fragment.append(cell);
    }
  }
  grid.append(fragment);
  $('elapsed').textContent = `00:00 / ${formatTime(durationMs(chart))}`;
  draw(0);
}
function errorText(e: unknown): string { return e instanceof Error ? e.message : 'The operation could not be completed.'; }
function formatTime(ms: number): string { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function setControls(): void {
  button('start').disabled = active;
  button('pause').disabled = !active; button('pause').textContent = paused ? 'Resume' : 'Pause';
  button('stop').disabled = !active;
  button('replay').disabled = active || !history.length;
  button('export-result').disabled = !history.length;
  for (const id of ['bpm', 'beats', 'chart-title', 'offset', 'import-chart']) input(id).disabled = active;
  for (const id of ['reset-chart', 'calibrate']) button(id).disabled = active;
  document.querySelectorAll<HTMLButtonElement>('#chart-settings button, #editor button').forEach(b => { b.disabled = active; });
}
function score(): void {
  if (!session) return;
  const s = session.summary();
  $('score').textContent = s.score.toLocaleString('en'); $('accuracy').textContent = s.judged ? `${s.accuracy.toFixed(1)}%` : '—';
  $('combo').textContent = String(s.combo); $('counts').textContent = `${s.precise} / ${s.close} / ${s.miss}`;
  const latest = session.judgments.at(-1);
  if (latest && session.judgments.length !== seen) {
    seen = session.judgments.length;
    $('judgment').textContent = latest.grade === 'precise' ? 'Precise' : latest.grade === 'close' ? 'Close' : 'Miss';
    $('delta').textContent = latest.delta === null ? latest.part === 'tail' ? 'Hold tail' : 'Outside timing window' : `${latest.delta >= 0 ? '+' : ''}${Math.round(latest.delta)} ms · ${latest.delta < 0 ? 'early' : 'late'}`;
  }
}
async function start(replaying = false, calibrating = false): Promise<void> {
  if (active) return;
  active = true; setControls();
  try {
    if (audio) await audio.close();
    playingReplay = replaying; calibration = calibrating; samples = []; lastCalibrationBeat = -1; replayCursor = 0; seen = 0;
    if (replaying && history[0]) { chart = history[0].chart; offset = history[0].offset; renderChart(); }
    const runChart = calibrating ? validateChart({ version: 1, title: 'Tap calibration', bpm: 120, beats: 16, notes: [] }) : chart;
    session = new Session(runChart); audio = new PulseAudio(runChart);
    await audio.start(); active = true; paused = false; lastFrame = performance.now();
    $('canvas-state').textContent = calibrating ? 'TAP SPACE WITH THE PULSE' : '4';
    $('canvas-state').hidden = false;
    notice(calibrating ? 'Tap Space or any lane key with each beat. First four beats are count-in.' : replaying ? 'Replaying recorded local inputs. The engine recomputes every judgment.' : 'Four-beat count-in. D F J K, or touch the keys.');
    setControls(); requestAnimationFrame(frame);
  } catch (e) { active = false; setControls(); notice(`Audio could not start: ${errorText(e)}`, true); }
}
async function finish(completed: boolean): Promise<void> {
  if (!active || !session) return;
  active = false; paused = false;
  if (audio) { await audio.close(); audio = null; }
  session.finish(); score();
  if (calibration) {
    button('apply-offset').disabled = samples.length < 4;
    $('calibration-result').textContent = samples.length >= 4 ? `${samples.length} samples · median ${Math.round(median(samples))} ms. Apply if it feels consistent.` : `${samples.length} samples. At least four are required.`;
    notice('Calibration finished. No hardware latency measurement is claimed.');
  } else if (!playingReplay) {
    const s = session.summary();
    history.unshift({ date: new Date().toISOString(), chart: session.chart, offset, actions: session.actions, score: s.score, accuracy: s.accuracy, best: s.best, deltas: session.judgments.flatMap(j => j.delta === null ? [] : [j.delta]), completed });
    history = history.slice(0, 12); save(); renderResult();
    notice(completed ? 'Study complete. Your timing and replay evidence are saved locally.' : 'Run ended early. Remaining notes are misses; this result is marked incomplete.');
  } else notice('Replay complete. Scores are computed from stored timestamps; this is not a verified competition record.');
  $('canvas-state').textContent = calibration ? 'CALIBRATION COMPLETE' : completed ? 'STUDY COMPLETE' : 'RUN ENDED';
  $('canvas-state').hidden = false;
  pads.forEach(p => p.classList.remove('held'));
  setControls(); renderChart();
}
async function pauseToggle(): Promise<void> {
  if (!active || !audio) return;
  if (!paused && !playingReplay && !calibration && session) {
    for (const lane of [...session.down]) laneAction(lane, 'release');
  }
  paused = !paused;
  if (paused) { await audio.pause(); $('canvas-state').textContent = 'PAUSED'; $('canvas-state').hidden = false; notice('Paused. Held lanes were released; resume when ready.'); }
  else { await audio.resume(); lastFrame = performance.now(); $('canvas-state').hidden = true; requestAnimationFrame(frame); }
  setControls();
}
function laneAction(lane: number, kind: Action['kind']): void {
  if (!active || !audio || !session || playingReplay) return;
  if (calibration) { if (kind === 'press' && !paused) sample(); return; }
  if (paused && kind === 'press') return;
  const ms = Math.max(0, audio.clock.read() - offset);
  session.input({ lane, kind, ms });
  pads[lane]?.classList.toggle('held', session.down.has(lane)); score();
}
function sample(): void {
  if (!audio || !calibration || paused) return;
  const time = audio.clock.read();
  if (time < 1750) return;
  const beat = Math.round(time / 500);
  if (beat === lastCalibrationBeat) return;
  lastCalibrationBeat = beat;
  const delta = time - beat * 500;
  if (Math.abs(delta) <= 250) samples.push(delta);
  $('calibration-result').textContent = `${samples.length} taps · median ${Math.round(median(samples))} ms`;
}
function frame(now: number): void {
  if (!active || paused || !audio || !session) return;
  if (now - lastFrame > 1000) { void pauseToggle(); notice('Paused after a scheduling interruption. Resume when ready.', true); return; }
  lastFrame = now; audio.schedule();
  const raw = audio.clock.read(), ms = Math.max(0, raw - offset);
  if (playingReplay && history[0]) {
    const actions = history[0].actions;
    while (actions[replayCursor] && actions[replayCursor]!.ms <= ms) session.input(actions[replayCursor++]!);
    pads.forEach((p, i) => p.classList.toggle('held', session!.down.has(i)));
  }
  session.advance(ms); score(); draw(raw);
  const count = 4 - Math.floor(raw / (60000 / session.chart.bpm));
  if (!calibration) { $('canvas-state').hidden = count <= 0; $('canvas-state').textContent = String(count); }
  $('elapsed').textContent = `${formatTime(raw)} / ${formatTime(durationMs(session.chart))}`;
  if (raw >= durationMs(session.chart) + Math.max(0, offset)) { void finish(true); return; }
  requestAnimationFrame(frame);
}
function draw(time: number): void {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = box.width, h = box.height;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const laneW = w / 4, target = h - 30, pixelsPerMs = .18;
  for (let lane = 0; lane < 4; lane++) {
    ctx.fillStyle = lane % 2 ? '#181b1d' : '#141719'; ctx.fillRect(lane * laneW, 0, laneW, h);
    ctx.strokeStyle = '#343b3f'; ctx.beginPath(); ctx.moveTo(lane * laneW, 0); ctx.lineTo(lane * laneW, h); ctx.stroke();
  }
  const c = active && session ? session.chart : chart, beatMs = 60000 / c.bpm;
  for (let b = 0; b <= c.beats + 4; b++) {
    const y = target - (b * beatMs - time) * pixelsPerMs;
    if (y < 0 || y > h) continue;
    ctx.strokeStyle = b % 4 ? '#282f33' : '#424b50'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  c.notes.forEach((n, i) => {
    if (active && session?.states[i] === 'done') return;
    const y = target - (noteMs(c, n) - time) * pixelsPerMs;
    const tail = y - n.length * beatMs * pixelsPerMs;
    if (y < -12 || tail > h + 12) return;
    const x = n.lane * laneW + laneW * .19, width = laneW * .62;
    if (n.length) { ctx.fillStyle = '#743c30'; ctx.fillRect(x + width * .34, tail, width * .32, y - tail); ctx.fillStyle = '#ee684b'; ctx.fillRect(x, tail, width, 4); }
    ctx.fillStyle = n.length ? '#ee684b' : '#f1eee7'; ctx.fillRect(x, y - 5, width, 10);
  });
  ctx.strokeStyle = '#ee684b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, target); ctx.lineTo(w, target); ctx.stroke(); ctx.lineWidth = 1;
}
function renderResult(): void {
  const container = $('last-result'); container.replaceChildren(); const run = history[0];
  if (!run) { container.textContent = 'Finish a study to inspect your timing.'; return; }
  const heading = document.createElement('strong'); heading.textContent = `${run.accuracy.toFixed(1)}% · ${run.score.toLocaleString('en')} pts`;
  const detail = document.createElement('p'); detail.textContent = `${run.chart.title} · best combo ${run.best}${run.completed ? '' : ' · ended early'}`;
  const hist = document.createElement('div'); hist.className = 'histogram'; hist.setAttribute('role', 'img'); hist.setAttribute('aria-label', `${run.deltas.length} hit timing samples, median ${run.deltas.length ? Math.round(median(run.deltas)) : 0} milliseconds.`);
  for (const delta of run.deltas) { const mark = document.createElement('i'); mark.style.left = `${50 + Math.max(-140, Math.min(140, delta)) / 2.8}%`; hist.append(mark); }
  const labels = document.createElement('div'); labels.className = 'timing-labels';
  for (const label of ['−140 ms / early', '0', '+140 ms / late']) { const span = document.createElement('span'); span.textContent = label; labels.append(span); }
  const stamp = document.createElement('p'); stamp.className = 'fine'; stamp.textContent = `${history.length} saved run${history.length === 1 ? '' : 's'} · ${new Date(run.date).toLocaleDateString('en')} · offset ${run.offset} ms`;
  container.append(heading, detail, hist, labels, stamp);
}

button('start').onclick = () => { void start(); };
button('pause').onclick = () => { void pauseToggle(); };
button('stop').onclick = () => { void finish(false); };
button('replay').onclick = () => { void start(true); };
button('export-chart').onclick = () => download('early-late-chart.json', chart);
button('export-result').onclick = () => { if (history[0]) download('early-late-evidence.json', { format: 'early-late-evidence-v1', ...history[0] }); };
button('reset-chart').onclick = () => { chart = pulseStudy(); renderChart(); save(); notice('Example study restored.'); };
button('clear-history').onclick = () => { history = []; save(); renderResult(); setControls(); notice('Local run history cleared.'); };
button('help-toggle').onclick = () => { const open = $('help').hidden; $('help').hidden = !open; button('help-toggle').setAttribute('aria-expanded', String(open)); };
button('calibrate').onclick = () => { button('apply-offset').disabled = true; void start(false, true); };
button('apply-offset').onclick = () => { if (samples.length >= 4) { offset = Math.round(median(samples)); input('offset').value = String(offset); save(); notice(`Input offset set to ${offset} ms.`); } };
input('offset').onchange = () => {
  const value = Number(input('offset').value);
  if (!Number.isFinite(value) || Math.abs(value) > 250) { notice('Offset must be between −250 and 250 ms.', true); input('offset').value = String(offset); return; }
  offset = value; save();
};
$('chart-settings').onsubmit = e => {
  e.preventDefault(); if (active) return;
  try { chart = validateChart({ ...chart, title: input('chart-title').value, bpm: Number(input('bpm').value), beats: Number(input('beats').value) }); renderChart(); save(); notice('Study settings applied.'); }
  catch (error) { notice(errorText(error), true); }
};
input('import-chart').onchange = async () => {
  const file = input('import-chart').files?.[0]; if (!file || active) return;
  try { if (file.size > MAX_CHART_BYTES) throw new Error('Chart file exceeds 64 KiB.'); chart = parseChart(await file.text()); renderChart(); save(); notice('Chart imported and validated. No code or audio is loaded from chart files.'); }
  catch (e) { notice(errorText(e), true); }
  input('import-chart').value = '';
};
$('editor').onkeydown = e => {
  const target = e.target as HTMLElement;
  if (!target.dataset.half || !target.dataset.lane) return;
  let half = Number(target.dataset.half), lane = Number(target.dataset.lane);
  if (e.key === 'ArrowRight') half++; else if (e.key === 'ArrowLeft') half--;
  else if (e.key === 'ArrowDown') lane++; else if (e.key === 'ArrowUp') lane--; else return;
  e.preventDefault();
  document.querySelector<HTMLButtonElement>(`#editor button[data-half="${Math.max(0, Math.min(chart.beats * 2 - 1, half))}"][data-lane="${Math.max(0, Math.min(3, lane))}"]`)?.focus();
};
pads.forEach((pad, lane) => {
  pad.onpointerdown = e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); laneAction(lane, 'press'); };
  pad.onpointerup = () => laneAction(lane, 'release'); pad.onpointercancel = () => laneAction(lane, 'release');
});
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
  if (e.repeat) return;
  if (e.code === 'Space' && calibration && active) { e.preventDefault(); sample(); return; }
  const lane = keys.indexOf(e.key.toLowerCase()); if (lane >= 0 && active) { e.preventDefault(); laneAction(lane, 'press'); }
  if (e.code === 'Escape' && active) { e.preventDefault(); void pauseToggle(); }
});
document.addEventListener('keyup', e => { const lane = keys.indexOf(e.key.toLowerCase()); if (lane >= 0) laneAction(lane, 'release'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && active && !paused) void pauseToggle(); });
window.addEventListener('blur', () => { if (active && !paused) { keys.forEach((_, i) => laneAction(i, 'release')); void pauseToggle(); } });
window.addEventListener('resize', () => draw(audio?.clock.read() ?? 0));
load(); renderChart(); renderResult(); setControls();
