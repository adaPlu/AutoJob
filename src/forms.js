// SPDX-License-Identifier: MIT
// Application form recognition, truthful autofill and verification helpers.
// Unanswered screening questions, legal attestations, EEO and CAPTCHA are NOT guessed.
import fs from 'node:fs';
import path from 'node:path';
import { fillExplicitScreeningChoices } from './screening-questions.js';

const compact = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => compact(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const FIELD_QUERY = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select,[role="combobox"],[role="radiogroup"],[aria-haspopup="listbox"]';
const SCOPES = 'form,[role="dialog"],[data-testid*="application" i],[id*="application" i],[class*="application-form" i],[data-automation-id="applicationForm"]';
const relevant = /resume|curriculum vitae|\bcv\b|first.?name|last.?name|full.?name|email|phone|apply for|application|linkedin/i;
const noise = /search job|search here|sign in|log in|password|register|newsletter|subscribe|job alert/i;
const SENSITIVE = /\b(?:captcha|password|ssn|social security|birth(?:day|date)?|date of birth|disab(?:ility|led)?|gender|pronouns|sex assigned|race|ethnic|veteran|criminal|arrest|conviction|signature|terms|consent|agree(?:ment)?|background check|security clearance|references?|marital|religio|national origin)\b/i;
const DO_NOT_INFER = /\b(?:current employer|company name|job title|current title|education|school|university|graduat|degree|start date|end date|years? of experience|salary history|notice period|referral|referred by|available to start)\b/i;

async function scopeScore(root) {
  try {
    if (!await root.isVisible()) return -1;
    const fields = await root.locator(FIELD_QUERY).count();
    if (fields < 2) return -1;
    const details = await root.locator(FIELD_QUERY).evaluateAll(els => els.slice(0,65).map(e => {
      const labels=[...(e.labels || [])].map(x=>x.textContent||'').join(' ');
      return `${e.id||''} ${e.name||''} ${e.placeholder||''} ${e.getAttribute('aria-label')||''} ${labels}`;
    }).join(' '));
    if (noise.test(details) && !relevant.test(details)) return -1;
    let score = fields;
    if (relevant.test(details)) score += 15;
    if (/resume|curriculum vitae|\bcv\b/i.test(details)) score += 20;
    if (/password/i.test(details) && !/resume/i.test(details)) score -= 35;
    if (fields >= 3) score += 4;
    return score >= 17 ? score : -1;
  } catch {return -1;}
}

export async function findApplicationScope(page) {
  let best = null;
  for (const frame of page.frames()) {
    const candidates=frame.locator(SCOPES);
    const n=Math.min(40,await candidates.count().catch(()=>0));
    for(let i=0;i<n;i++) {
      const root=candidates.nth(i);
      const score=await scopeScore(root);
      if (score > (best?.score ?? 0)) best={root,frame,score};
    }
    // Workday and some React ATS render fields directly in the body.
    const body=frame.locator('body');
    const bodyScore=await scopeScore(body);
    if (!best && bodyScore>=0) best={root:body,frame,score:bodyScore};
  }
  return best;
}

const FIELD_MAP = [
  [/\b(first|given)[\s_-]*name\b/i,'firstName'],
  [/\b(last|family|sur)[\s_-]*name\b/i,'lastName'],
  [/\b(full|legal|your)[\s_-]*name\b|^name$/i,'fullName'],
  [/\b(e[- ]?mail)(?: address)?\b/i,'email'],
  [/\b(phone|mobile|telephone|cell)(?: number)?\b/i,'phone'],
  [/\blinked[ -]?in\b/i,'linkedin'],
  [/\bgithub\b/i,'github'],
  [/\b(portfolio|personal website|website url|personal url)\b/i,'portfolio'],
  [/\b(city|town)\b/i,'city'],
  [/\b(state|province|region)\b/i,'state'],
  [/\b(country)\b/i,'country'],
  [/\b(zip|postal)(?: code)?\b/i,'postalCode'],
  [/\b(salary|compensation|desired pay|expected pay)\b/i,'salaryExpectation'],
];

// Only use screening answers explicitly established by the user. Never guess experience,
// credentials, compensation, protected-class answers, or acceptance of legal agreements.
export function answerForQuestion(description, type, profile={}, config={}) {
  const text=compact(description);
  if (!text || SENSITIVE.test(text)) return '';
  const userAnswers = profile.applicationAnswers || {};
  for (const [prompt, answer] of Object.entries(userAnswers)) {
    if (norm(prompt).length >= 8 && norm(text).includes(norm(prompt)) && answer != null && !Array.isArray(answer) && String(answer).trim()) return String(answer);
  }
  if (/\b(?:now|future|ever|require|need)\b.*\b(?:visa\s*)?sponsor(?:ship)?\b|\bsponsor(?:ship)?\b.*\b(?:now|future|need|require)\b/i.test(text)) return /^(no|false)$/i.test(String(profile.requiresSponsorship || '')) ? 'No' : '';
  if (/\b(?:legally )?authorized\b.*\bwork\b.*\b(?:us|u s|united states)\b|\bwork authorization\b.*\b(?:us|u s|united states)\b|\blegally eligible to work\b.*\b(?:us|u s|united states)\b/i.test(text)) return /^yes\b/i.test(profile.workAuthorization || '') ? 'Yes' : '';
  if (/\b(?:us|u s|united states)\b.*\bcitizen(?:ship)?\b|\bcitizen(?:ship)?\b.*\b(?:us|u s|united states)\b/i.test(text)) return /citizen/i.test(profile.workAuthorization || '') ? 'Yes' : '';
  if (/\b(?:willing|able) to relocate\b|\brelocation\b.*\b(?:required|willing)\b/i.test(text)) return config.strictRemote === true ? 'No' : '';
  if (DO_NOT_INFER.test(text)) return '';
  if (/cover letter|additional information|why .*interested/i.test(text)) return config.coverLetterText || '';
  if (/first.?name/i.test(text) && /last.?name/i.test(text)) return profile.fullName || `${profile.firstName||''} ${profile.lastName||''}`.trim();
  for (const [regex,key] of FIELD_MAP) if(regex.test(text)) return profile[key] || '';
  if (type === 'email') return profile.email || '';
  if (type === 'tel') return profile.phone || '';
  return '';
}

async function detailsOf(el) {
  return el.evaluate(e=>{
    const named=id=>e.ownerDocument.getElementById(id)?.textContent||'';
    const parent=e.closest('fieldset,[role="group"],[role="radiogroup"],.form-group,.field,.field-container,.application-question,[data-automation-id="formField"]');
    const legend=parent?.querySelector('legend,.application-label,[class*="question-label"],[data-automation-id*="label"],h2,h3,h4,label')?.textContent || '';
    const labels=[...(e.labels||[])].map(x=>x.textContent).join(' ');
    const aria=(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(named).join(' ');
    const descriptions=(e.getAttribute('aria-describedby')||'').split(/\s+/).map(named).join(' ');
    const preceding=e.previousElementSibling?.matches('label,[class*="label"],[class*="question"]')?e.previousElementSibling.textContent:'';
    const htmlType=(e.getAttribute('type')||'').toLowerCase();
    return {desc:[labels,aria,e.getAttribute('aria-label'),legend,preceding,e.placeholder,e.getAttribute('autocomplete'),e.getAttribute('data-automation-id'),e.name,e.id,descriptions].filter(Boolean).join(' ').slice(0,700),
      type:(e.type||htmlType).toLowerCase(),tag:e.tagName.toLowerCase(),value:e.value||'',readOnly:!!e.readOnly,
      checked:!!e.checked,role:e.getAttribute('role')||'',hasPopup:e.getAttribute('aria-haspopup')||''};
  }).catch(()=>null);
}

const optionTokens = value => {
  const token=norm(value);
  if (token==='yes') return ['yes','yes i am','authorized','eligible','true'];
  if (token==='no') return ['no','no i do not','not required','false'];
  if (token==='united states' || token==='us' || token==='usa') return ['united states','united states of america','usa','us'];
  if (token==='ca' || token==='california') return ['ca','california'];
  return [token];
};
const matchesOption=(label,value,want)=>optionTokens(want).includes(norm(label)) || optionTokens(want).includes(norm(value));

async function selectSemantic(el, target) {
  const want=norm(target);
  if(!want) return false;
  const options=await el.evaluate(e=>[...e.options].map(x=>({label:x.textContent.trim(),value:x.value,disabled:x.disabled,selected:x.selected}))).catch(()=>[]);
  const match=options.find(o=>!o.disabled && matchesOption(o.label,o.value,target));
  if(!match) return false;
  if(match.selected)return false;
  try {await el.selectOption(match.value,{timeout:2500});return true;}catch{return false;}
}

// Many ATS sites portal dropdown choices to the document body instead of the form.
// Search in the owning frame and only choose an exact, visible option.
async function chooseCustomCombobox(el, value, root) {
  if(!norm(value) || !await el.isVisible().catch(()=>false)) return false;
  try {
    await el.click({timeout:2500});
    const documentRoot=root.locator('xpath=ancestor::html');
    const candidates=[documentRoot.getByRole('option'),documentRoot.locator('[role="listbox"] [role="option"], [data-radix-popper-content-wrapper] [role="option"]')];
    for(const options of candidates){
      const count=Math.min(100,await options.count().catch(()=>0));
      for(let i=0;i<count;i++){
        const opt=options.nth(i);
        if(!await opt.isVisible().catch(()=>false) || !await opt.isEnabled().catch(()=>true))continue;
        const name=await opt.innerText().catch(()=>null);
        const optionValue=await opt.getAttribute('data-value').catch(()=>null);
        if(matchesOption(name,optionValue,value)){ await opt.click({timeout:2500});return true;}
      }
    }
    // Some ATS custom selectors are rendered as an ARIA menu.
    const menuItems=documentRoot.getByRole('menuitem');
    if(menuItems)for(let i=0,n=Math.min(80,await menuItems.count().catch(()=>0));i<n;i++){
      const opt=menuItems.nth(i);
      if(await opt.isVisible().catch(()=>false) && matchesOption(await opt.innerText().catch(()=>''),'',value)){
        await opt.click({timeout:2500});return true;
      }
    }
  } catch {}
  try{await el.press('Escape',{timeout:750});}catch{}
  return false;
}

async function fillChoices(root, profile, config) {
  let fills=0;
  // Radio groups: prefer associated fieldset/legend or accessible radiogroup label.
  const radios=root.locator('input[type="radio"]');
  const radioCount=Math.min(90,await radios.count().catch(()=>0));
  const seen=new Set();
  for(let i=0;i<radioCount;i++) {
    const radio=radios.nth(i);
    if(!await radio.isVisible().catch(()=>false)) continue;
    const group=await radio.evaluate(e=>{
      const container=e.closest('fieldset,[role="radiogroup"],.application-question,.form-group')||e.parentElement?.parentElement;
      return {key:e.name||e.id,description:[container?.querySelector('legend,.application-label,[class*="question-label"],h2,h3,h4,label')?.textContent,container?.getAttribute('aria-label'),e.name].filter(Boolean).join(' ')};
    }).catch(()=>null);
    if(!group || seen.has(group.key)) continue;
    seen.add(group.key);
    const answer=answerForQuestion(group.description,'radio',profile,config);
    if(!answer) continue;
    // Only select a radio with an explicit option label matching our factual answer.
    for(let j=0;j<radioCount;j++) {
      const option=radios.nth(j);
      const info=await option.evaluate(e=>({name:e.name, label:[...(e.labels||[])].map(x=>x.textContent.trim()).join(' '),value:e.value,checked:e.checked})).catch(()=>null);
      if(!info || info.name!==group.key || info.checked) continue;
      if([info.label,info.value].some(t=>norm(t)===norm(answer))) {
        try {await option.check({timeout:2200});fills++;}catch{}
        break;
      }
    }
  }
  // Workday / React / Greenhouse custom radio controls without input[type=radio].
  const customGroups=root.locator('[role="radiogroup"]');
  for(let i=0,n=Math.min(40,await customGroups.count().catch(()=>0));i<n;i++){
    const group=customGroups.nth(i);
    if(!await group.isVisible().catch(()=>false))continue;
    const info=await detailsOf(group);
    const groupLabel=await group.evaluate(e=>{
      const el=e.ownerDocument.getElementById(e.getAttribute('aria-labelledby')||'');
      return [e.getAttribute('aria-label'),el?.textContent,e.closest('fieldset')?.querySelector('legend')?.textContent].filter(Boolean).join(' ');
    }).catch(()=>'');
    const answer=answerForQuestion(groupLabel||info?.desc,'radio',profile,config);
    if(!answer)continue;
    const buttons=group.locator('[role="radio"]');
    for(let j=0,m=Math.min(15,await buttons.count().catch(()=>0));j<m;j++){
      const option=buttons.nth(j);
      if(!await option.isVisible().catch(()=>false) || !await option.isEnabled().catch(()=>false))continue;
      if(await option.getAttribute('aria-checked').catch(()=>'')==='true')break;
      if(matchesOption(await option.innerText().catch(()=>''),await option.getAttribute('data-value').catch(()=>''),answer)){
        try{await option.click({timeout:2200});fills++;}catch{}break;
      }
    }
  }
  return fills;
}

export async function fillApplicationScope({root,profile,config,resumePath}) {
  let fills=0,selectedResume=false;
  const fields=root.locator('input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]),textarea');
  for (let i=0,n=Math.min(140,await fields.count().catch(()=>0));i<n;i++) {
    const el=fields.nth(i);
    if(!await el.isVisible().catch(()=>false) || !await el.isEnabled().catch(()=>false)) continue;
    const info=await detailsOf(el);
    if(!info || info.readOnly || compact(info.value) || info.role==='combobox' || info.hasPopup==='listbox' || ['password','search','checkbox','radio'].includes(info.type)) continue;
    const answer=answerForQuestion(info.desc,info.type,profile,config);
    if(!String(answer).trim()) continue;
    if(info.type==='number' && !/^-?\d+(?:\.\d+)?$/.test(String(answer))) continue;
    if(['date','datetime-local'].includes(info.type) && !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(String(answer))) continue;
    try {await el.fill(String(answer),{timeout:2500});fills++;}catch{}
  }
  const selects=root.locator('select');
  for (let i=0,n=Math.min(55,await selects.count().catch(()=>0));i<n;i++) {
    const el=selects.nth(i);
    if(!await el.isVisible().catch(()=>false) || !await el.isEnabled().catch(()=>false)) continue;
    const info=await detailsOf(el);
    if(!info) continue;
    const hasSelection=await el.evaluate(e=>{
      const opt=e.options?.[e.selectedIndex];
      if(!opt)return false;
      const placeholder=/^(?:select|choose|please|--|not selected)/i.test(opt.textContent?.trim()||'');
      return !placeholder && !!String(e.value||'').trim();
    }).catch(()=>!!info.value);
    if(hasSelection)continue;
    const value=answerForQuestion(info.desc,'select',profile,config);
    if(value && await selectSemantic(el,value)) fills++;
  }
  // Only select group answers explicitly supplied for this exact question.
  // No guessing employer size, industry, tenure, referrals or consent.
  fills+=await fillExplicitScreeningChoices(root,profile.applicationAnswers||{});
  fills+=await fillChoices(root,profile,config);
  // React/ARIA dropdowns seen on Workday and custom ATS forms.
  const combos=root.locator('[role="combobox"]:not(select),button[aria-haspopup="listbox"]:not([role="combobox"])');
  for (let i=0,n=Math.min(35,await combos.count().catch(()=>0));i<n;i++) {
    const el=combos.nth(i);
    const info=await detailsOf(el);
    if(!info)continue;
    const alreadySelected=await el.evaluate(e=>{
      const value=e.value||e.getAttribute('data-value')||e.getAttribute('aria-valuetext')||'';
      const visible=(e.innerText||e.textContent||'').trim();
      return !!String(value).trim() || (!!visible && !/^(?:select|choose|please|--)/i.test(visible));
    }).catch(()=>!!compact(info.value));
    if(alreadySelected)continue;
    const value=answerForQuestion(info.desc,'combobox',profile,config);
    if(value && await chooseCustomCombobox(el,value,root)) fills++;
  }
  if(resumePath && fs.existsSync(resumePath)) {
    const files=root.locator('input[type="file"]');
    for (let i=0,n=Math.min(15,await files.count().catch(()=>0));i<n;i++) {
      const el=files.nth(i);
      const info=await detailsOf(el);
      if (!info || (n>1 && !/resume|\bcv\b|curriculum|\.pdf|\.doc/i.test(info.desc))) continue;
      try {
        const existing=await el.evaluate(e=>[...(e.files||[])].map(f=>f.name));
        const uploadedNow=!existing.includes(path.basename(resumePath));
        if(uploadedNow)await el.setInputFiles(resumePath,{timeout:6500});
        const found=await el.evaluate(e=>[...(e.files||[])].map(f=>f.name));
        if(found.includes(path.basename(resumePath))) {selectedResume=true;if(uploadedNow)fills++;break;}
      }catch{}
    }
  }
  return {fills,resumeInfo:{hasFileInput:await root.locator('input[type="file"]').count().then(n=>n>0).catch(()=>false),verified:selectedResume,filename:selectedResume?path.basename(resumePath):''}};
}


// Explicit attestations must remain human decisions, even if Simplify has
// pre-checked them. This is not limited to HTML required fields.
export const LEGAL_CONSENT_LABEL = /\b(?:certif(?:y|ication)|attest(?:ation)?|under penalty of perjury|arbitration|background check|electronic signature|e[- ]?sign(?:ature)?|terms (?:and conditions|of (?:use|service))|i (?:have read and )?agree|give (?:my )?consent|consent to)\b/i;
export async function getLegalConsentBlockers(root) {
  const controls=root.locator('input[type="checkbox"]:visible,input[type="radio"]:visible,[role="checkbox"]:visible,[role="radio"]:visible');
  const labels=await controls.evaluateAll(els=>els.slice(0,150).filter(el=>!el.disabled).map(el=>{
    const label=[...(el.labels||[])].map(x=>x.textContent||'').join(' ') ||
      el.getAttribute('aria-label') || el.closest('label')?.textContent ||
      el.closest('fieldset')?.querySelector('legend')?.textContent || '';
    return String(label).replace(/\s+/g,' ').trim().slice(0,180);
  })).catch(()=>[]);
  return [...new Set(labels.filter(label=>LEGAL_CONSENT_LABEL.test(label)))].slice(0,8);
}

// Respect native validity, explicit required indicators and server-returned errors.
// A missing answer is a review item, not a reason to lie or click Submit blindly.
export async function getRequiredBlockers(root) {
  const missing=[];
  const controls=root.locator('input[required],textarea[required],select[required],[aria-required="true"]');
  const seenRadio=new Set();
  for(let i=0,n=Math.min(150,await controls.count().catch(()=>0));i<n;i++) {
    const el=controls.nth(i);
    if(!await el.isVisible().catch(()=>false) || !await el.isEnabled().catch(()=>false)) continue;
    const item=await el.evaluate(e=>({tag:e.tagName.toLowerCase(),type:(e.type||'').toLowerCase(),role:e.getAttribute('role')||'',name:e.name||'',value:e.value||'',checked:!!e.checked,
      valid:e.checkValidity?.()??true,validationMessage:e.validationMessage||'',
      label:[...(e.labels||[])].map(x=>x.textContent.trim()).join(' ')||e.getAttribute('aria-label')||e.name||e.id||'required field',
      files:e.files?.length||0,selected:e.getAttribute('aria-selected'),
      groupQuestion:(e.closest('fieldset,.application-question,[role="group"],.form-group')?.querySelector('legend,.application-label,.question-title,.question-label')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,150)})).catch(()=>null);
    if(!item || ['hidden','submit','button'].includes(item.type) || ['radiogroup','combobox'].includes(item.role)) continue;
    if(item.type==='radio') {
      if(seenRadio.has(item.name)) continue;
      seenRadio.add(item.name);
      const checked=await root.locator('input[type="radio"]').evaluateAll((els,name)=>els.some(x=>x.name===name && x.checked),item.name).catch(()=>false);
      if(!checked) missing.push(`Radio: ${item.groupQuestion||item.label}`);
    } else if(item.type==='checkbox' && !item.checked) missing.push(item.groupQuestion?`Unanswered checkbox group: ${item.groupQuestion}`:`Agreement/checkbox: ${item.label}`);
    else if(item.type==='file' && !item.files) missing.push(`Upload: ${item.label}`);
    else if(item.type!=='checkbox' && item.type!=='radio' && (!compact(item.value)||!item.valid)) missing.push(`${item.label}${item.validationMessage?`: ${item.validationMessage}`:''}`);
  }
  const ariaGroups=root.locator('[role="radiogroup"][aria-required="true"]');
  for(let i=0,n=Math.min(50,await ariaGroups.count().catch(()=>0));i<n;i++){
    const group=ariaGroups.nth(i);
    if(!await group.isVisible().catch(()=>false))continue;
    const checked=await group.locator('[role="radio"][aria-checked="true"],input[type="radio"]:checked').count().catch(()=>0);
    if(!checked)missing.push(`Radio selection: ${await group.getAttribute('aria-label').catch(()=>null)||await group.getAttribute('aria-labelledby').catch(()=>null)||'required question'}`);
  }
  const invalid=await root.locator('[aria-invalid="true"]:visible').count().catch(()=>0);
  if(invalid)missing.push(`${invalid} invalid form field(s)`);
  // Visible form validation errors (site dependent) after Next or Submit.
  // ARIA form components sometimes omit native required attributes.
  const customRequired=root.locator('[role="combobox"][aria-required="true"],button[aria-haspopup="listbox"][aria-required="true"]');
  for(let i=0,n=Math.min(60,await customRequired.count().catch(()=>0));i<n;i++){
    const el=customRequired.nth(i);
    if(!await el.isVisible().catch(()=>false))continue;
    const blank=await el.evaluate(e=>{
      const val=e.value||e.getAttribute('data-value')||e.getAttribute('aria-valuetext')||'';
      const text=(e.innerText||e.textContent||'').trim();
      return !String(val).trim() && (!text || /^(select|choose|please|--)/i.test(text));
    }).catch(()=>false);
    if(blank){const d=await detailsOf(el);missing.push(`Dropdown: ${compact(d?.desc).slice(0,90)||'required option'}`);}
  }
  const errors=await root.locator('[role="alert"],.field-error,.validation-error,[data-testid*="error" i]').allInnerTexts().catch(()=>[]);
  for(const error of errors) if(compact(error) && compact(error).length<240) missing.push(`Validation: ${compact(error).slice(0,140)}`);
  return [...new Set(missing)].slice(0,20);
}

export async function formFingerprint(root) {
  try {return await root.locator('input,textarea,select,button,[role="combobox"]').evaluateAll(els =>
    els.slice(0,120).map(e=>[e.tagName,e.id,e.name,e.getAttribute('aria-label'),e.getAttribute('data-automation-id'),e.getAttribute('type'),e.textContent?.slice(0,90),e.value].join(':')).join('|'));
  }catch{return '';}
}

export async function getAction(root, patterns) {
  for(const regex of patterns) {
    for(const role of ['button','link']) {
      const matches=root.getByRole(role,{name:regex});
      for(let i=0,n=Math.min(12,await matches.count().catch(()=>0));i<n;i++) {
        const el=matches.nth(i);
        if(await el.isVisible().catch(()=>false) && await el.isEnabled().catch(()=>false)) return el;
      }
    }
  }
  return null;
}

// Read-only inspection for users who explicitly disable native autofill fallback.
export async function inspectApplicationResume(root,resumePath) {
  const base=resumePath?path.basename(resumePath):'';
  const items=await root.locator('input[type="file"]').evaluateAll(els=>els.map(e=>[...(e.files||[])].map(f=>f.name))).catch(()=>[]);
  const uploaded=items.flat();
  const verified=!!base && uploaded.includes(base);
  return {fills:0,resumeInfo:{hasFileInput:items.length>0,verified,filename:verified?base:''}};
}
