// SPDX-License-Identifier: MIT
// Optional one-time migration: import old evidence without erasing current history.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureLog,readLog,appendLog,HEADER} from './log.js';
import {ledgerPath,readLedger} from './submission-ledger.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const oldArg=process.argv.slice(2).find(x=>!x.startsWith('--'));
if(!oldArg){console.error('Drag the previous automator folder onto IMPORT_OLD_HISTORY.bat, or run node src/import-history.js "C:\\path\\old folder"');process.exit(1);}
const old=path.resolve(oldArg);
if(old===root){console.error('Old and new folders are identical; nothing imported.');process.exit(1);}
const oldCsv=path.join(old,'data','application-log.csv'),newCsv=path.join(root,'data','application-log.csv');
const oldLedger=ledgerPath(old),newLedger=ledgerPath(root);
if(!fs.existsSync(oldCsv)&&!fs.existsSync(oldLedger)){console.error('No historical application log or ledger found in '+old);process.exit(1);}
fs.mkdirSync(path.join(root,'data'),{recursive:true});
if(fs.existsSync(oldCsv)){
  ensureLog(newCsv);
  const existing=new Set(readLog(newCsv).map(r=>HEADER.map(k=>String(r[k]||'')).join('\u0000')));
  let added=0;
  for(const r of readLog(oldCsv)){
    if(!r.url)continue;
    const key=HEADER.map(k=>String(r[k]||'')).join('\u0000');
    if(existing.has(key))continue;
    appendLog(newCsv,r);existing.add(key);added++;
  }
  console.log(`Imported ${added} historical log rows (existing records preserved).`);
}
if(fs.existsSync(oldLedger)){
  const incoming=readLedger(oldLedger),current=readLedger(newLedger);
  for(const [url,record] of incoming)if(!current.has(url)) current.set(url,record);
  const tmp=newLedger+'.import.tmp';fs.writeFileSync(tmp,JSON.stringify(Object.fromEntries(current),null,2));fs.renameSync(tmp,newLedger);
  console.log(`Retained ${current.size} existing/historical submission-ledger records.`);
}
console.log('Old files were not changed.');
