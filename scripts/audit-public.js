// SPDX-License-Identifier: MIT
// Check the Git INDEX (what would be committed/pushed), never print secrets.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function privatePath(filename) {
  const name=filename.replaceAll('\\','/');
  if (['config.example.json','profile.example.json','receipts.example.json'].includes(name)) return false;
  return /(?:^|\/)(?:data|outbox|node_modules|ChromeProfile|chrome-job-profile|gmail-tokens)\//i.test(name)
    || /(?:^|\/)(?:config\.json|profile\.json|receipts\.json|gmail-credentials\.json|client_secret_[^/]*\.json|[^/]*token[^/]*\.json|application-log[^/]*\.csv|submit-ledger[^/]*\.json)$/i.test(name)
    || /\.(?:pdf|docx?|zip|7z|p12|pfx|pem|key)$/i.test(name);
}

const signals=[
  ['personal email', /\b[A-Z0-9._%+-]+@(?:gmail\.com|outlook\.com|hotmail\.com|yahoo\.com|icloud\.com|protonmail\.com|proton\.me)\b/i],
  ['local user directory', /\b[A-Z]:[\\/]Users[\\/](?!Public[\\/]|Default[\\/])[^\\/\s"']+/i],
  ['Google OAuth client ID', /\b\d{10,}-[a-z0-9]{15,}\.apps\.googleusercontent\.com\b/i],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{10,}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub access token', /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

export function sensitiveKinds(text, profile={}) {
  const kinds=signals.filter(([,re])=>re.test(text)).map(([label])=>label);
  const full=[profile.firstName,profile.lastName].filter(Boolean).join(' ').trim();
  if(full.length>5 && text.toLowerCase().includes(full.toLowerCase())) kinds.push('personal name');
  return [...new Set(kinds)];
}

function profileIdentity() {
  try {
    const p=JSON.parse(fs.readFileSync(path.join(root,'profile.json'),'utf8'));
    return {firstName:p.firstName,lastName:p.lastName};
  } catch {return {};}
}

function git(...args) {
  return execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
}

export function checkTrackedFiles() {
  const names=git('ls-files','--cached','-z').toString('utf8').split('\0').filter(Boolean);
  const profile=profileIdentity(),errors=[];
  for(const filename of names) {
    if(privatePath(filename)) {
      errors.push({file:filename,kind:'private file path'}); continue;
    }
    const bytes=git('show',`:${filename}`);
    if(bytes.includes(0)) {
      errors.push({file:filename,kind:'unexpected binary data'}); continue;
    }
    const content=bytes.toString('utf8');
    for(const kind of sensitiveKinds(content,profile))errors.push({file:filename,kind});
  }
  return {count:names.length,errors};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=checkTrackedFiles();
  for(const item of result.errors)console.error(`BLOCK ${item.file}: ${item.kind} (value hidden)`);
  if(result.errors.length) {
    console.error(`PUBLICATION BLOCKED: ${result.errors.length} privacy finding(s).`);
    process.exitCode=1;
  } else console.log(`PUBLIC AUDIT PASSED: ${result.count} tracked files checked; local ignored data was not touched.`);
}
