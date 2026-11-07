// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeUrl } from './discover.js';

function normalized(url) { return normalizeUrl(url, url) || String(url); }
export function hashJob(url) { return createHash('sha256').update(normalized(url)).digest('hex').slice(0,20); }
export function ledgerPath(root) { return path.join(root, 'data', 'submit-ledger.json'); }

export function readLedger(file) {
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Invalid ledger');
    // Older ledgers may contain tracking-URL variants for the same job.
    // Canonicalize keys when reading so a write-ahead Submit record still
    // protects the job after upgrading URL normalization or restarting.
    const records=new Map();
    const retryable=new Set(['needs-review','submission-failed','manual-confirmed-not-submitted','ready-for-submit','blocked']);
    for(const [rawUrl,record] of Object.entries(obj)){
      const key=normalized(rawUrl);
      const previous=records.get(key);
      const protectedState=state=>!retryable.has(state);
      if(!previous || (protectedState(record?.state) && !protectedState(previous?.state)) ||
        (protectedState(record?.state)===protectedState(previous?.state) &&
          Date.parse(record?.updatedAt||'')>Date.parse(previous?.updatedAt||''))){
        records.set(key,{...record,url:key});
      }
    }
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw new Error(`Cannot safely read submission ledger ${file}: ${error.message}`);
  }
}

export function updateLedger(file, url, state, extras={}) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const ledger = readLedger(file);
  const key = normalized(url);
  const existing = ledger.get(key) || {};
  const record = { ...existing, ...extras, url:key, state, updatedAt:new Date().toISOString() };
  ledger.set(key, record);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(ledger), null, 2));
  fs.renameSync(tmp, file);
  return record;
}
