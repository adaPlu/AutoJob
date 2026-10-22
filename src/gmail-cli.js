import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {connectGmail,listGmailAccounts} from './gmail-client.js';
import {verifyGmailReceipts} from './gmail-verification.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cmd=process.argv[2]||'verify';
try{
  if(cmd==='connect')await connectGmail(root);
  else if(cmd==='accounts')console.log(JSON.stringify(listGmailAccounts(root).map(x=>x.email),null,2));
  else if(cmd==='verify'){
    const r=await verifyGmailReceipts({root});
    fs.mkdirSync(path.join(root,'outbox'),{recursive:true});
    fs.writeFileSync(path.join(root,'outbox','gmail-verification-summary.json'),JSON.stringify(r,null,2));
    console.log(JSON.stringify(r,null,2));
    if(['not-connected','credentials-missing','auth-error','gmail-check-failed'].includes(r.status))process.exitCode=2;
  }else{console.error('Usage: node src/gmail-cli.js connect|accounts|verify');process.exitCode=1;}
}catch(err){console.error(`GMAIL: ${err.message}`);process.exitCode=1;}
