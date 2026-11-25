# Contributing

Run `npm ci --ignore-scripts`, `npm test` and `npm run build` on Node.js 22 or later. Keep engine changes independent of browser APIs. Add a failing behavioral test before changing judgment or replay semantics.

For UI changes, check a narrow touch viewport and a desktop keyboard viewport. Inspect error messages, disabled controls, focus, chart import/export and local replay. Include actual test output and screenshots in the change description when applicable. Never add copyrighted audio, fabricated scores or fake leaderboard data.

The static source has no runtime dependencies. Propose a dependency only when it resolves a demonstrated need and explain its operating and security costs.
