// SPDX-License-Identifier: MIT
import { normalizeUrl } from './discover.js';

// Employer / ATS receipts are stronger than a board's "sent" notification.
const EMPLOYER_RECEIPT = /(?:we (?:have )?received your application|(?:your )?application (?:has been |was )?received|(?:your )?application (?:has been |was )?submitted(?: successfully)?|thank you for applying(?: to)?|thanks for applying(?: to)?|application received)/i;
const FORWARDED_ONLY = /(?:your application was sent to|we have forwarded your application|application sent to|we sent your application to)/i;
const NON_JOB = /\b(?:personal loan|credit application|mortgage|credit card|loan offer|insurance quote|subscription)\b/i;

export function validateReceipt(receipt, matchingRows=[]) {
  const {url,from,subject,receivedAt,bodySnippet=''}=receipt||{};
  const normalized=normalizeUrl(url,url);
  if(!normalized || !matchingRows.length || !matchingRows.some(r=>normalizeUrl(r.url,r.url)===normalized)) return {ok:false,reason:'Exact job URL not present in log'};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(from||''))) return {ok:false,reason:'Invalid or missing sender address'};
  if(!Number.isFinite(Date.parse(String(receivedAt||'')))) return {ok:false,reason:'Invalid receivedAt timestamp'};
  const body=`${subject||''} ${bodySnippet||''}`;
  if(NON_JOB.test(body)) return {ok:false,reason:'Non-job application language'};
  if(FORWARDED_ONLY.test(body) && !/\bwe (?:have )?received your application\b/i.test(body)) return {ok:false,reason:'Job board forwarding acknowledgement, not employer receipt'};
  if(!EMPLOYER_RECEIPT.test(body)) return {ok:false,reason:'No explicit application-received acknowledgement'};
  const earliest=Math.min(...matchingRows.map(r=>Date.parse(r.timestamp)).filter(Number.isFinite));
  if(Number.isFinite(earliest) && Date.parse(receivedAt)<earliest-3600000) return {ok:false,reason:'Receipt predates logged job attempt'};
  return {ok:true,reason:'Exact job URL + later explicit employer/ATS acknowledgement supplied'};
}
