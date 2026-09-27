import test from 'node:test';
import assert from 'node:assert/strict';
import {RecoveryStore} from './ui/recovery-store.js';
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const id='a'.repeat(32),key='b'.repeat(64);
test('tab recovery retains separate keys across reload without overwriting earlier operations',()=>{
 const s=storage(),one=new RecoveryStore(s);one.remember(id,key);one.remember('c'.repeat(32),'d'.repeat(64));
 const two=new RecoveryStore(s);assert.equal(two.get(id),key);assert.equal(two.last(),'c'.repeat(32));assert.equal(two.get('e'.repeat(32)),'');
 two.clear();assert.equal(one.get(id),'');assert.equal(one.last(),'');
});
test('tab recovery rejects malformed, conflicting and tampered entries',()=>{
 const s=storage(),r=new RecoveryStore(s);assert.throws(()=>r.remember('../x',key));r.remember(id,key);assert.throws(()=>r.remember(id,'c'.repeat(64)));assert.equal(r.get(id),key);
 s.setItem('irisops-guard-recovery-v1',JSON.stringify({last:id,entries:[[id,key],[id,key]]}));assert.throws(()=>r.get(id));
});
test('tab recovery fails closed when persistence fails or the 64-receipt bound is reached',()=>{
 const r=new RecoveryStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});assert.throws(()=>r.remember(id,key));
 const limited=new RecoveryStore(storage());
 for(let n=0;n<64;n++)limited.remember(n.toString(16).padStart(32,'0'),key);
 assert.throws(()=>limited.remember(id,key));assert.equal(limited.get('0'.repeat(32)),key);
});
