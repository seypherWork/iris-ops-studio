import test from 'node:test';
import assert from 'node:assert/strict';
import {localOrigin,publicCertificate,validWindow,strictGet} from './onboarding-preflight.mjs';
const now=Date.parse('2026-09-27T00:00:00Z');
test('onboarding destination is a numeric loopback HTTPS port, never a supplied URL',()=>{assert.equal(localOrigin(52810),'https://127.0.0.1:52810');for(const p of [0,80,65536,52810.5,'52810','https://other.invalid',null])assert.throws(()=>localOrigin(p));});
test('onboarding refuses invalid, expired, future and overly long certificate windows',()=>{validWindow('2026-09-26T00:00:00Z','2026-09-28T00:00:00Z',now);for(const [a,b] of [['bad','bad'],['2026-09-20','2026-09-26'],['2026-09-28','2026-09-29'],['2026-09-26','2026-10-01'],['2026-09-26','2026-09-27T00:05:00Z']])assert.throws(()=>validWindow(a,b,now));});
test('only a single bounded public certificate may enter the export workflow',()=>{for(const p of ['',null,'x'.repeat(16385),'-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----','-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\ntrailing'])assert.throws(()=>publicCertificate(p));});
test('onboarding HTTPS refuses other routes and malformed leaf identity before network',()=>{for(const path of ['/','/api/admin/v2/wallet/collection','https://foreign.invalid','/csp/ops/../sys'])assert.throws(()=>strictGet({port:52810,ca:'',leafHash:'a'.repeat(64),path}));assert.throws(()=>strictGet({port:52810,ca:'',leafHash:'bad',path:'/api/admin/login'}));});
