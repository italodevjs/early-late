import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, SongClock, median, replay } from '../build/engine.js';
import { parseChart, validateChart, noteMs, pulseStudy } from '../build/chart.js';

const chart = notes => validateChart({ version: 1, title: 'Test', bpm: 120, beats: 8, notes });
const note = (beat = 0, lane = 0, length = 0) => ({ beat, lane, length });
const hit = (s, lane, ms) => { s.input({ kind: 'press', lane, ms }); s.input({ kind: 'release', lane, ms }); };

test('inclusive judgment edges and just-outside late miss', () => {
  for (const [offset, grade] of [[-140,'close'],[-45,'precise'],[45,'precise'],[140,'close'],[140.001,'miss']]) {
    const s = new Session(chart([note()])); hit(s, 0, 2000 + offset); s.finish(); assert.equal(s.judgments[0].grade, grade);
  }
});
test('too-early ghost input does not consume a note, repeat keydown cannot hit twice', () => {
  const s = new Session(chart([note(),note(1)]));
  s.input({ kind:'press', lane:0, ms:1000 });
  s.input({ kind:'press', lane:0, ms:2000 }); assert.equal(s.judgments.length,0);
  s.input({ kind:'release', lane:0, ms:2000 }); hit(s,0,2000);
  s.input({ kind:'press', lane:0, ms:2500 }); s.input({ kind:'press', lane:0, ms:2501 });
  assert.equal(s.judgments.length,2); s.finish(); assert.equal(s.summary().score,2000);
});
test('simultaneous chord lanes are independent', () => {
  const s = new Session(chart([note(0,0), note(0,3)])); hit(s,0,2000); hit(s,3,2000); s.finish();
  assert.equal(s.summary().precise,2); assert.equal(s.summary().accuracy,100);
});
test('holds require a head and award exactly one tail at release grace boundary', () => {
  for (const [release, misses] of [[2439.99,1],[2440,0],[2500,0]]) {
    const s = new Session(chart([note(0,0,1)])); s.input({ kind:'press', lane:0, ms:2000 }); s.input({ kind:'release', lane:0, ms:release }); s.finish(); s.finish();
    assert.equal(s.judgments.length,2); assert.equal(s.summary().miss,misses);
  }
});
test('missed hold has two missed judgments; held tail completes without release', () => {
  const a = new Session(chart([note(0,0,1)])); a.finish(); assert.equal(a.summary().miss,2);
  const b = new Session(chart([note(0,0,1)])); b.input({kind:'press',lane:0,ms:2000}); b.advance(2500); b.advance(9000); b.finish(); assert.equal(b.summary().precise,2);
});
test('one large frame and many small frames produce identical chronological results', () => {
  const c = chart([note(0,0,2),note(1,1),note(3,2)]);
  const a = new Session(c), b = new Session(c);
  a.input({kind:'press',lane:0,ms:2000}); b.input({kind:'press',lane:0,ms:2000});
  a.advance(5000); for(let t=2001;t<=5000;t++) b.advance(t);
  assert.deepEqual(a.judgments,b.judgments); assert.deepEqual(a.summary(),b.summary());
});
test('replay recalculates results, duplicate and out-of-order actions are rejected', () => {
  const c = chart([note(),note(1,1)]), s = new Session(c);
  hit(s,0,2020); s.input({kind:'press',lane:1,ms:1800}); hit(s,1,2550); s.finish();
  assert.deepEqual(replay(c,s.actions).summary(),s.summary()); assert.equal(s.actions.length,4);
  const before=s.judgments.length; hit(s,2,9000); assert.equal(s.judgments.length,before);
});
test('pause freezes song time, resume preserves accumulated time', () => {
  let now=100; const clock=new SongClock(()=>now); clock.start(); now=350; assert.equal(clock.read(),250);
  clock.pause(); now=900; assert.equal(clock.read(),250); clock.pause(); clock.resume(); now=1000; assert.equal(clock.read(),350);
  clock.resume(); assert.equal(clock.read(),350);
});
test('import rejects hostile shapes, huge files, overlaps and invalid numeric values', () => {
  const base=chart([note()]);
  for(const bad of [null,[],{...base,bpm:Infinity},{...base,beats:1},{...base,notes:[note(0,4)]},{...base,notes:[note(),note()]},{...base,notes:[note(0,0,2),note(1,0)]},{...base,notes:[note(-1)]},{...base,notes:[note(7,0,2)]}]) assert.throws(()=>validateChart(bad));
  assert.throws(()=>parseChart(' '.repeat(65537))); assert.throws(()=>parseChart('{not json}'));
});
test('import canonicalizes unsorted notes, drops unrecognized fields and roundtrips', () => {
  const c=chart([note(3,2),note(0,0)]); assert.equal(c.notes[0].beat,0);
  assert.deepEqual(parseChart(JSON.stringify(c)),c); assert.ok(pulseStudy().notes.length>0);
  assert.equal(noteMs(c,c.notes[0]),2000);
});
test('calibration median resists isolated outliers and rejects missing/invalid samples', () => {
  assert.equal(median([20,21,200,19,22]),21); assert.equal(median([10,20]),15);
  assert.throws(()=>median([])); assert.throws(()=>median([NaN]));
});
