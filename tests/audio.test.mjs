import test from 'node:test';
import assert from 'node:assert/strict';
import { PulseAudio } from '../build/audio.js';
import { pulseStudy } from '../build/chart.js';

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
