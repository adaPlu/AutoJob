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
    return new Map(Object.entries(obj));
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
