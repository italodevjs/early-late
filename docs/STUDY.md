# Study and defense guide

Read `chart.ts`, then `engine.ts`, then the audio adapter and UI. Run the tests before changing anything. The goal is to explain the behavior in your own words and demonstrate changes with evidence.

## Questions to defend

1. Why is `Date.now()` unsuitable as the song clock? What does an injected `now` function make testable?
2. Why is the late miss comparison strict, while the hit window is inclusive?
3. What happens if a frame jumps across both a missed note and a held tail? Why must events be ordered?
4. How do a duplicate keydown and two chord lanes differ?
5. Why does a hold contain two judgments? How does an early release affect the denominator of accuracy?
6. Which aspects of a replay are deterministic? Why can its file not prove a player's honesty?
7. Why is median useful for calibration? Which systematic errors does it fail to remove?
8. What are the bounds on parsing, editor DOM and per-frame work? When would a heap become justified?
9. Why are input offset and visual timing separate? Explain the sign of a positive offset.
10. How would you test audio-to-speaker latency rather than estimating a human tapping bias?

## Exercises

### Timing boundaries

Add tests at −140.001 ms, exact zero and the exact hold tail. Write expected judgments first. Explain why an early press outside the window must not consume a future note.

### Independent replay verifier

Create a Node command that validates an exported evidence file, ignores its claimed score, replays actions and prints the recomputed result. Enforce action count, lane, finite timestamp and monotonicity limits. Prove that editing the claimed score changes no recomputed judgment.

### Alternate scoring

Introduce a third hit window. Define the weight and denominator precisely. Change the fold, UI labels and boundary tests together. Compare the resulting scores on the same replay without changing its action timestamps.

### Search and complexity

Measure note lookup at 256 and 10,000 notes using synthetic charts in an isolated benchmark. Replace linear scanning with a lane-indexed cursor. Verify equivalent results before claiming a performance improvement. Do not enlarge import budgets solely to justify an optimization.

### Accessibility and interface

Navigate settings, editor and playback controls entirely with a keyboard. Add an alternate non-scrolling listening exercise and document what it makes accessible. Test focus after changing a note, errors, file import and pause.

### Scheduling experiment

Record pulse scheduling lateness while introducing controlled main-thread load. Compare requestAnimationFrame lookahead with an AudioWorklet design. Distinguish measurement, inference and subjective listening in your report.

## Honest presentation

This project was reconstructed with AI assistance from an earlier author's experiment. Explain which design choices you understand, reproduce the test suite, and implement one exercise before presenting it as evidence of your own working knowledge. Do not describe its local history as users, deployments, achievements or competitive performance.
