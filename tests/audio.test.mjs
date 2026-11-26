import test from 'node:test';
import assert from 'node:assert/strict';
import { PulseAudio } from '../build/audio.js';
import { pulseStudy } from '../build/chart.js';

test('a browser without Web Audio receives an actionable unsupported error', () => {
  const original=globalThis.AudioContext;
  try { globalThis.AudioContext=undefined; assert.throws(()=>new PulseAudio(pulseStudy()),/Audio playback is unavailable/); }
  finally { globalThis.AudioContext=original; }
});

test('audio schedule shares the post-resume clock origin even with asynchronous start delay', async () => {
  let context, starts=[];
  const original=globalThis.AudioContext;
  globalThis.AudioContext=class {
    currentTime=0;
    destination={};
    constructor(){context=this;}
    async resume(){this.currentTime+=.25;}
    async suspend(){}
    async close(){}
    createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(t){starts.push(t);},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  };
  try {
    const audio=new PulseAudio(pulseStudy()); await audio.start();
    assert.ok(starts.length>0); assert.equal(starts[0],.25);
    context.currentTime+=.1; await audio.pause(); await audio.resume();
    context.currentTime+=.1; audio.schedule();
    assert.ok(starts.every(t=>Number.isFinite(t)));
    await audio.close();
  } finally { globalThis.AudioContext=original; }
});

test('close waits for pending audio resume and never restarts a closed session', async () => {
  const original=globalThis.AudioContext;
  let resume, closed=false, starts=0;
  globalThis.AudioContext=class {
    currentTime=0; destination={};
    resume(){return new Promise(resolve=>{resume=resolve;});}
    async suspend(){}
    async close(){closed=true;}
    createOscillator(){starts++;throw new Error('A cancelled start must not schedule audio');}
  };
  try {
    const audio=new PulseAudio(pulseStudy());const starting=audio.start();
    await Promise.resolve();const closing=audio.close();
    assert.equal(closed,false);resume();await starting;await closing;
    assert.equal(closed,true);assert.equal(starts,0);
    await audio.resume();await audio.pause();await audio.close();
    assert.notEqual(audio.clock.state,'playing');
  }finally{globalThis.AudioContext=original;}
});
