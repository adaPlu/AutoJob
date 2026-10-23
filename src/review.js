// SPDX-License-Identifier: MIT
// Export latest actionable blockers for manual answers and retry. No assumptions about submissions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLog} from './log.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rows=readLog(path.join(root,'data','application-log.csv'));
const latest=new Map();
for (const r of rows) if(r.url) latest.set(r.url,r);
const actionable=[...latest.values()].filter(r=>['needs-review','ready-no-submit-button','authentication-required','blocked','submit-clicked-unverified','timed-out'].includes(r.status));
const esc=v=>'"'+String(v||'').replaceAll('"','""')+'"';
const header=['timestamp','company','title','url','status','blocker'];
const dest=path.join(root,'outbox','review-needed.csv');fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,[header.join(','),...actionable.map(r=>header.map(k=>esc(r[k])).join(','))].join('\n')+'\n');
console.log(`Applications requiring review: ${actionable.length}`);
console.log(`Report: ${dest}`);
for(const r of actionable.slice(0,20))console.log(`- ${r.status}: ${r.company||r.title||r.url}\n  ${(r.blocker||'').slice(0,240)}`);
console.log('Do not rerun uncertain submissions until a confirmation screen or employer receipt is checked.');
