# Early / Late

A small rhythm laboratory for playing, composing and inspecting timing. Four lanes, one reference line, and a pulse synthesized in your browser. No account, downloaded songs or online leaderboard.

The project explores a specific engineering question: can gameplay judgments remain deterministic when browser frames arrive at irregular intervals? The engine takes timestamped input, processes missed notes and hold deadlines chronologically, and can recompute a run from its recorded actions. Rendering and sound scheduling are separate adapters.

## Run

Requires Node.js 22 or later and npm.

```sh
npm ci --ignore-scripts
npm test
npm run dev
```

Open the printed local address, normally `http://127.0.0.1:4175`. `npm run build` produces `dist/`, which can be served by any static host. No environment variables, database or paid service are required. The optional web fonts fall back to system fonts if unavailable.

## Use

- Press **Play study**. Four count-in beats precede the first note.
- Use **D F J K**, or touch the four lane keys. Press when a note crosses the red line. Hold long notes through the tail. Each lane in a chord must be played.
- **Pause** or Escape freezes the audio clock and releases held lanes. Moving away from the tab pauses the run. A hold released before its grace window is a miss; pause is not a hold-completion shortcut.
- Inspect the actual timing scatter after a run. **Replay last run** recomputes the score from recorded input timestamps. **Export evidence** saves those actions, the chart and the local summary as JSON.
- Compose in the half-beat grid. White is a tap; orange is a hold head. Arrow keys move between cells; Enter or Space toggles a cell. Apply tempo, length and title changes explicitly. Reducing the length fails if notes would fall outside the chart.
- Import/export charts as JSON. Imports are bounded to 64 KiB, 256 notes and 64 beats; they never load executable code, URLs or audio.
- Optional tap calibration estimates your median tapping delay against the metronome. It does **not** measure device latency. A positive offset subtracts milliseconds from the input timestamp.

Precise hits fall within ±45 ms; close hits within ±140 ms. A precise judgment earns 1,000 points and a close judgment 600. A hold has two judgments. Its tail allows 60 ms of early release grace. Accuracy is the mean of judgment weights (1, 0.6, 0), including missed tails. There are no hidden multipliers or fabricated results.

## Architecture and verification

`src/chart.ts` owns the file format and validation. `src/engine.ts` owns judgments, replay and the injected clock. `src/audio.ts` schedules an original oscillator pulse against `AudioContext.currentTime`. `src/app.ts` connects the DOM, canvas, storage and input.

The test suite checks inclusive timing boundaries, duplicate input, chords, hold releases, coarse-frame equivalence, replay, pause/resume and malformed imports. These are engine tests; audio output and mobile/browser interaction require separate manual verification. See [architecture](docs/ARCHITECTURE.md), [study exercises](docs/STUDY.md) and [verification record](docs/VERIFICATION.md).

## Limits and provenance

This is a timing study, not a clinical latency instrument or a competitive anti-cheat system. Browser event delivery, audio output buffering, display refresh, Bluetooth and human anticipation all influence the experience. The software knows its own audio timeline, not when sound physically reaches your ears. Reduced-motion settings do not remove essential gameplay motion. A screen reader can operate settings and hear judgments, but the falling-note game requires visual or auditory timing interpretation.

The design problem grew from the author's private RHYTHM-VERSE Roblox experiment, whose deterministic chart/scoring/clock separation informed this independent TypeScript implementation. No private Git history, licensed commercial song, Roblox asset or client content is included. The pulse and chart are original to this project. AI tools assisted reconstruction, implementation, documentation and review; this repository does not claim exclusively human authorship or professional adoption.

MIT licensed. No analytics or server-side data collection. Up to 12 recent runs and your chart/settings are stored in this browser; **Clear** removes run history. Export before clearing browser storage.
