// SPDX-License-Identifier: MIT
// Conservative autofill for complex employer screening controls.
// An answer must explicitly match the QUESTION and an available OPTION.
const norm=s=>String(s??'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const restricted=/\b(?:captcha|password|ssn|social security|date of birth|disab(?:ility|led)?|gender|pronouns|race|ethnic|veteran|criminal|conviction|signature|certif(?:y|ication)|attest|arbitration|terms|consent|agree|background check|security clearance|religio|national origin)\b/i;

export function exactScreeningChoices(question, applicationAnswers={}) {
  if (!question || restricted.test(question)) return [];
  const matches=Object.entries(applicationAnswers).filter(([prompt])=>norm(prompt).length>=8 && norm(prompt)===norm(question));
  if(matches.length!==1)return [];
  const value=matches[0][1];
  const choices=Array.isArray(value)?value:typeof value==='string'?value.split(';'):[];
  return [...new Set(choices.map(v=>String(v).trim()).filter(Boolean))];
}

function screeningQuestion(e) {
  const group=e.closest('fieldset,[role="radiogroup"],[role="group"],.application-question,.form-group,[data-automation-id="formField"],[data-testid*="question" i]');
  if(!group)return {question:'',group:null};
  const byId=id=>e.ownerDocument.getElementById(id)?.textContent||'';
  const aria=group.getAttribute('aria-label')||String(group.getAttribute('aria-labelledby')||'').split(/\s+/).map(byId).join(' ');
  const heading=group.querySelector('legend,[data-automation-id*="label"],[data-testid*="question-label" i],.application-label,.question-title,.question-label,h2,h3,h4');
  const question=String(aria||heading?.textContent||'').replace(/\s+/g,' ').trim().slice(0,280);
  return {question,group};
}

function optionLabel(e) {
  const label=[...(e.labels||[])].map(x=>x.textContent||'').join(' ')||
    e.closest('label')?.textContent||e.getAttribute('aria-label')||e.getAttribute('data-value')||'';
  return String(label).replace(/\s+/g,' ').trim().slice(0,180);
}

export async function fillExplicitScreeningChoices(root, applicationAnswers={}) {
  let filled=0;
  const controls=root.locator('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]');
  const count=Math.min(180,await controls.count().catch(()=>0));
  for(let i=0;i<count;i++){
    const el=controls.nth(i);
    if(!await el.isVisible().catch(()=>false)||!await el.isEnabled().catch(()=>false))continue;
    const info=await el.evaluate(e=>{
      const find=e.closest('fieldset,[role="radiogroup"],[role="group"],.application-question,.form-group,[data-automation-id="formField"],[data-testid*="question" i]');
      const ctx=(find?{
        aria:find.getAttribute('aria-label')||'',
        labelledby:find.getAttribute('aria-labelledby')||'',
        heading:find.querySelector('legend,[data-automation-id*="label"],[data-testid*="question-label" i],.application-label,.question-title,.question-label,h2,h3,h4')?.textContent||''
      }:{});
      const linked=ctx.labelledby?.split(/\s+/).map(id=>e.ownerDocument.getElementById(id)?.textContent||'').join(' ');
      const labels=[...(e.labels||[])].map(x=>x.textContent||'').join(' ')||e.closest('label')?.textContent||e.getAttribute('aria-label')||e.getAttribute('data-value')||'';
      return {question:String(ctx.aria||linked||ctx.heading||'').replace(/\s+/g,' ').trim().slice(0,280),
        label:String(labels).replace(/\s+/g,' ').trim().slice(0,180),
        value:e.getAttribute('data-value')||e.value||'',
        kind:e.getAttribute('role')||(e.getAttribute('type')||'').toLowerCase(),
        checked:e.getAttribute('aria-checked')==='true'||e.checked===true,
        groupAlreadySelected:!!find?.querySelector('input[type="radio"]:checked,[role="radio"][aria-checked="true"]')};
    }).catch(()=>null);
    if(!info||info.checked||restricted.test(info.label))continue;
    const answers=exactScreeningChoices(info.question,applicationAnswers);
    if(!answers.length)continue;
    if(info.kind==='radio'&&(answers.length!==1||info.groupAlreadySelected))continue;
    // Match options exactly: no best-guess, fuzzy selection, or first-item fallback.
    if(!answers.some(a=>norm(a)===norm(info.label)||norm(a)===norm(info.value)))continue;
    try{
      if(info.kind==='radio'&&await el.getAttribute('role').catch(()=>null)==='radio')await el.click({timeout:2200});
      else if(info.kind==='checkbox'&&await el.getAttribute('role').catch(()=>null)==='checkbox')await el.click({timeout:2200});
      else await el.check({timeout:2200});
      filled++;
    }catch{}
  }
  return filled;
}

// Capture only prompts and options (not entered answers, resume, contact details).
// This file is stored beneath gitignored outbox/ for manual review.
export async function collectScreeningReview(root){
  return root.locator('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],select[required],[role="combobox"][aria-required="true"]').evaluateAll(els=>{
    const out=new Map();
    for(const e of els.slice(0,180)){
      if(e.disabled || e.getAttribute('type')==='hidden')continue;
      const group=e.closest('fieldset,[role="radiogroup"],[role="group"],.application-question,.form-group,[data-automation-id="formField"],[data-testid*="question" i]');
      if(!group)continue;
      const aria=group.getAttribute('aria-label')||'';
      const linked=String(group.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>e.ownerDocument.getElementById(id)?.textContent||'').join(' ');
      const head=group.querySelector('legend,[data-automation-id*="label"],[data-testid*="question-label" i],.application-label,.question-title,.question-label,h2,h3,h4')?.textContent||'';
      const question=String(aria||linked||head||'').replace(/\s+/g,' ').trim().slice(0,280);
      if(!question)continue;
      const kind=(e.getAttribute('role')||e.getAttribute('type')||e.tagName).toLowerCase();
      const selected=e.checked===true||e.getAttribute('aria-checked')==='true';
      const label=([...(e.labels||[])].map(x=>x.textContent||'').join(' ')||e.closest('label')?.textContent||e.getAttribute('aria-label')||e.getAttribute('data-value')||'').replace(/\s+/g,' ').trim().slice(0,180);
      const entry=out.get(question)||{question,type:kind==='checkbox'?'multi-select':kind==='radio'?'single-select':'dropdown',options:[],answered:false};
      if(e.tagName==='SELECT'){
        for(const opt of [...e.options].slice(0,80)){
          const choice=String(opt.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
          if(choice&&!/^(select|choose|please|--)\b/i.test(choice)&&!entry.options.includes(choice))entry.options.push(choice);
        }
        if(e.value)entry.answered=true;
      }else if(label&&!entry.options.includes(label))entry.options.push(label);
      if(selected)entry.answered=true;
      out.set(question,entry);
    }
    return [...out.values()].slice(0,50);
  }).catch(()=>[]);
}
