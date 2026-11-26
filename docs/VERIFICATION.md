# Verification record

Date: 2026-11-26. These are observed checks against the static production build, not universal compatibility claims.

## Story

Original chart → synthesized pulse and song clock → keyboard/touch input → deterministic judgments → local result and recorded replay/evidence.

## Automated evidence

- 16 engine, validation, clock and asynchronous audio lifecycle tests passed locally.
- Production build passed. TypeScript projects include a strict type check.
- Isolated headless Chromium and Firefox exercised the complete flow described below without uncaught page errors.
- Isolated Windows WebKit exercised the same flow for Not After, Working Print and Section Plane. Early / Late's explicit unsupported-audio path was verified in that runtime.
- Desktop (1440 × 1000 viewport) and narrow-screen (390 × 844 viewport) screenshots were captured from actual rendered pages; document-level horizontal overflow was checked.

Play, pause, resume and early abort exercised; actual evidence downloaded; replay continued after history was cleared. A Firefox resume/close race found during testing was fixed with serialized transitions and a regression test.

## Visual review

Real screenshots were inspected for typography, alignment, hierarchy, control density and mobile flow. The review led to external stylesheet loading for the certificate tool's security policy, a less crowded mobile photo control layout, a labelled logarithmic histogram scale and more readable mesh-inspection labels.

[Desktop capture](screenshots/desktop.png) · [Mobile capture](screenshots/mobile.png)

## Limits

The Windows WebKit test runtime lacks Web Audio. Its unsupported-audio error path and layout were verified; gameplay was not verified there. Actual Safari/iOS audio output and physical latency remain unverified.

The screenshots and automated browser flows do not establish exhaustive accessibility, every device, perceptual audio synchronization or production reliability. Tests use synthetic public certificates/geometry, the credited NASA sample and original rhythm data, without private customer inputs.
