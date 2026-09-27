import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {startApplication} from '../web/assets/startup.js';
function fixture(){
 const nodes=new Map(['#app-root','#startup-status','#startup-title','#startup-message'].map(k=>[k,{inert:true,hidden:false,textContent:'',setAttribute(k,v){this[k]=v;}}]));
 const controls=[{disabled:true},{disabled:true}],document={querySelector:k=>nodes.get(k),querySelectorAll:()=>controls,documentElement:{dataset:{}}};
 let timer,cleared=false,resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {document,nodes,controls,resolve,reject,expire:()=>timer(),cleared:()=>cleared,args:{document,load:()=>promise,setTimer:f=>{timer=f;return 1;},clearTimer:()=>{cleared=true;}}};
}
test('startup remains blocked until imports and initialization resolve',async()=>{
 const f=fixture(),p=startApplication(f.args);assert.equal(f.nodes.get('#app-root').inert,true);assert.ok(f.controls.every(c=>c.disabled));assert.equal(f.document.documentElement.dataset.startup,'loading');
 f.resolve();assert.equal(await p,true);assert.equal(f.nodes.get('#app-root').inert,false);assert.ok(f.controls.every(c=>!c.disabled));assert.equal(f.nodes.get('#startup-status').hidden,true);assert.equal(f.cleared(),true);
});
test('startup import failure stays blocked with safe recoverable status',async()=>{
 const f=fixture(),p=startApplication(f.args);f.reject(Error('synthetic-private-detail'));assert.equal(await p,false);assert.equal(f.document.documentElement.dataset.startup,'failed');assert.ok(f.controls.every(c=>c.disabled));assert.equal(f.nodes.get('#app-root').inert,true);assert.ok(!f.nodes.get('#startup-message').textContent.includes('synthetic-private-detail'));
});
test('startup timeout cannot be reopened by late successful initialization',async()=>{
 const f=fixture(),p=startApplication(f.args);f.expire();f.resolve();assert.equal(await p,false);assert.equal(f.document.documentElement.dataset.startup,'failed');assert.equal(f.nodes.get('#app-root').inert,true);assert.ok(f.controls.every(c=>c.disabled));
});
test('late failed import after timeout is handled without retry or state change',async()=>{
 const f=fixture(),p=startApplication(f.args);f.expire();const message=f.nodes.get('#startup-message').textContent;f.reject(Error('late'));assert.equal(await p,false);assert.equal(f.nodes.get('#startup-message').textContent,message);
});

test('a document watchdog failure before module arrival prevents application loading',async()=>{
 const f=fixture();f.document.documentElement.dataset.startup='failed';let loaded=false;
 assert.equal(await startApplication({...f.args,load:async()=>{loaded=true;}}),false);
 assert.equal(loaded,false);assert.equal(f.nodes.get('#app-root').inert,true);
});
test('a document watchdog failure during import cannot be reopened by the module',async()=>{
 const f=fixture(),p=startApplication(f.args);f.document.documentElement.dataset.startup='failed';f.resolve();
 assert.equal(await p,false);assert.equal(f.nodes.get('#app-root').inert,true);assert.ok(f.controls.every(c=>c.disabled));assert.equal(f.cleared(),true);
});
function watchdogFixture(){
 const f=fixture();f.document.getElementById=id=>f.nodes.get('#'+id);
 const script=readFileSync(new URL('../web/index.html',import.meta.url),'utf8').match(/<script id="startup-watchdog">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 let timer,errorListener;
 runInNewContext(script,{document:f.document,setTimeout:fn=>{timer=fn;},window:{addEventListener:(type,fn)=>{assert.equal(type,'error');errorListener=fn;},removeEventListener:()=>{errorListener=null;}}});
 return {...f,expire:()=>timer(),moduleError:()=>errorListener({target:{id:'startup-module'}}),otherError:()=>errorListener({target:{id:'unrelated-asset'}})};
}
test('independent document watchdog handles a missing module with a safe locked state',()=>{
 const f=watchdogFixture();f.otherError();assert.notEqual(f.document.documentElement.dataset.startup,'failed');
 f.moduleError();assert.equal(f.document.documentElement.dataset.startup,'failed');assert.equal(f.nodes.get('#app-root').inert,true);assert.equal(f.nodes.get('#startup-title').textContent,'Interface could not start');
});
test('independent watchdog times out if no module arrives',()=>{
 const f=watchdogFixture();f.expire();assert.equal(f.document.documentElement.dataset.startup,'failed');assert.ok(f.controls.every(c=>c.disabled));
});
test('document watchdog cannot disable an application that is already ready',()=>{
 const f=watchdogFixture();f.document.documentElement.dataset.startup='ready';f.nodes.get('#app-root').inert=false;f.nodes.get('#startup-status').hidden=true;
 f.moduleError();f.expire();assert.equal(f.document.documentElement.dataset.startup,'ready');assert.equal(f.nodes.get('#app-root').inert,false);assert.equal(f.nodes.get('#startup-status').hidden,true);
});
