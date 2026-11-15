import test from 'node:test';
import assert from 'node:assert/strict';
import {eyeTarget} from './eye-logo.js';

test('eye looks toward the pointer and stays inside the oval at extreme distances',()=>{
 const rect={left:100,top:100,width:80,height:56};
 assert.deepEqual(eyeTarget(rect,140,128),{x:40,y:28});
 assert.ok(eyeTarget(rect,2000,128).x>40);assert.ok(eyeTarget(rect,-2000,128).x<40);
 for(let angle=0;angle<Math.PI*2;angle+=.1){const target=eyeTarget(rect,140+Math.cos(angle)*1e6,128+Math.sin(angle)*1e6);assert.ok(target.x>=28&&target.x<=52);assert.ok(target.y>=21&&target.y<=35);assert.ok(((target.x-40)/21.75)**2+((target.y-28)/9.75)**2<1);}
});
