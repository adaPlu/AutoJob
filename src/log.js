import fs from 'node:fs';
import path from 'node:path';
import { normalizeUrl } from './discover.js';

export const HEADER = [
  'timestamp','company','title','url','source','work_mode','fit_score','status',
  'simplify_autofill','resume_used','cover_letter_used','submission_verified',
  'verification_evidence','blocker','resume_upload_verified','artifact_path','confirmation_url',
  'cookie_banners_accepted','site_notices_dismissed'
];

function esc(value='') {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

// Parses CSV with escaped quotes and embedded newlines; URL regexes cannot safely parse CSV.
export function parseCsv(input) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i=0; i<input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i+1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v=>v !== '')) rows.push(row);
      row = [];
    } else { field += c; }
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

function key(url) { return normalizeUrl(url, url) || String(url || ''); }

export function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const [header=[], ...rows] = parseCsv(fs.readFileSync(logPath, 'utf8'));
  return rows.map(values => Object.fromEntries(header.map((name,i) => [name, values[i] ?? ''])));
}

export function ensureLog(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive:true });
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, HEADER.join(',') + '\n'); return;
  }
  const rows = parseCsv(fs.readFileSync(logPath, 'utf8'));
  if (rows[0]?.join(',') === HEADER.join(',')) return;
  const [oldHeader=[], ...oldRows] = rows;
  const converted = oldRows.map(values => Object.fromEntries(oldHeader.map((name,i)=>[name, values[i] ?? ''])));
  // Preserve all values when upgrading an earlier CSV schema; never just replace its header.
  const backup = `${logPath}.pre-v1.3-backup`;
  if (!fs.existsSync(backup)) fs.copyFileSync(logPath, backup);
  const tmp = `${logPath}.tmp`;
  fs.writeFileSync(tmp, HEADER.join(',') + '\n' + converted.map(r=>HEADER.map(k=>esc(r[k])).join(',')).join('\n') + (converted.length ? '\n' : ''));
  fs.renameSync(tmp, logPath);
}

export function appendLog(logPath, row) {
  ensureLog(logPath);
  fs.appendFileSync(logPath, HEADER.map(k=>esc(row[k])).join(',')+'\n');
}

export const PERMANENT_STATUSES = new Set(['submitted-confirmed','submitted-verified','submitted-email-confirmed','already-applied','skipped-title','skipped-not-clearly-remote']);
export const UNCERTAIN_STATUSES = new Set(['submitted-pending-receipt','submit-clicked-unverified','submission-unverified','submit-attempted']);

export function applicationHistory(logPath) {
  const history = new Map();
  for (const row of readLog(logPath)) {
    if (!row.url) continue;
    const url = key(row.url);
    const value = history.get(url) || { last:'', attempts:0, permanent:false, uncertain:false };
    value.last = row.status || '';
    if (PERMANENT_STATUSES.has(row.status)) value.permanent = true;
    if (UNCERTAIN_STATUSES.has(row.status)) value.uncertain = true;
    if (['submission-failed','error','retryable-error'].includes(row.status)) value.attempts++;
    // An explicit/manual resolution can unblock a suspected previous submission.
    if (row.status === 'manual-confirmed-not-submitted') value.uncertain = false;
    history.set(url, value);
  }
  return history;
}

export function shouldSkipJob(url, history, ledger, maxAttempts=3) {
  const k = key(url);
  const record = history.get(k);
  if (record?.permanent) return 'already-confirmed-or-excluded';
  if (record?.uncertain) return 'previous-unverified-submit-requires-review';
  const inFlight = ledger?.get(k);
  if (inFlight && !['needs-review','submission-failed','manual-confirmed-not-submitted','ready-for-submit','blocked'].includes(inFlight.state)) {
    return `submit-ledger-${inFlight.state}`;
  }
  if ((record?.attempts || 0) >= maxAttempts) return 'retry-limit-reached';
  return '';
}

// Kept for older integrations: this set means "do not automatically submit again," NOT all logged URLs.
export function loadSeenUrls(logPath) {
  return new Set([...applicationHistory(logPath)].filter(([,v])=>v.permanent || v.uncertain).map(([url])=>url));
}
