import fs from 'node:fs';
import path from 'node:path';
import { hashJob, updateLedger } from './submission-ledger.js';
import { plausibleRoleTitle, postingRemoteStatus, classificationFromApplication } from './eligibility.js';
import { isJobUrl, fitScore as computeFitScore } from './discover.js';
import { findApplicationScope, fillApplicationScope, inspectApplicationResume, getRequiredBlockers, formFingerprint, getAction } from './forms.js';
import { trySimplifyAutofill, simplifySettings } from './simplify-copilot.js';
import { handleSiteAcknowledgements } from './acknowledgements.js';
import { CONFIRMATION_TEXT, FAILURE_TEXT, CHALLENGE_TEXT,
  matchEvidence, confirmationUrl, classifyEvidence } from './verification.js';

const wait = (ms) => new Promise(resolve=>setTimeout(resolve, ms));
function includesAny(text, words=[]) { return words.some(w => String(text).toLowerCase().includes(String(w).toLowerCase())); }
async function pageText(page) {
  return page && !page.isClosed() ? (await page.locator('body').innerText({timeout:4500}).catch(()=>'')) || '' : '';
}
async function getMeta(page, text='') {
  const titleTag = await page.title().catch(()=>'');
  const h1 = await page.locator('h1').first().innerText().catch(()=>'');
  const title = (h1 || titleTag.split('|')[0].trim() || 'Unknown role').slice(0,160);
  const og = await page.locator('meta[property="og:site_name"]').getAttribute('content').catch(()=>null);
  const match = text.match(/(?:at|company)\s+([A-Z][A-Za-z0-9&.,' -]{2,60})/);
  return {title, company:(og || match?.[1] || '').trim().slice(0,120)};
}
function workMode(text) {
  if (/\bremote\b/i.test(text)) return 'remote';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bon[- ]site|onsite\b/i.test(text)) return 'onsite';
  return 'unknown';
}
function looksRemoteEnough(text) {
  return postingRemoteStatus(text).eligible;
}
function slug(s) { return String(s || 'job').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55) || 'job'; }
const normalizeEvidence = (s) => String(s || '').replace(/\s+/g,' ').trim().slice(0,400);

async function clickByNames(page, patterns, kinds=['button','link']) {
  for (const p of patterns) for (const kind of kinds) {
    const loc = page.getByRole(kind, {name:p}).first();
    if (!(await loc.count().catch(()=>0)) || !(await loc.isVisible().catch(()=>false))) continue;
    try { await loc.click({ timeout:7500 }); return {clicked:true, label:normalizeEvidence(await loc.innerText().catch(()=>''))}; }
    catch { /* try other recognizable controls */ }
  }
  return {clicked:false,label:''};
}
function activePage(all, fallback) { return [...all].reverse().find(p=>!p.isClosed()) || fallback; }
async function fillByLabel(page, labelRe, value) {
  if (value === undefined || value === null || value === '') return false;
  const loc = page.getByLabel(labelRe, {exact:false}).first();
  if (!(await loc.count().catch(()=>0)) || !(await loc.isVisible().catch(()=>false))) return false;
  try {
    const tag = await loc.evaluate(el=>el.tagName.toLowerCase());
    if (!['input','textarea'].includes(tag)) return false;
    if (!await loc.inputValue().catch(()=>'')) await loc.fill(String(value));
    return true;
  } catch { return false; }
}

async function inspectResumeInputs(page, expectedBase='') {
  const files = await page.locator('input[type="file"]').evaluateAll(els => els.map(el=>({
    name:el.getAttribute('name') || '', id:el.id || '', accept:el.getAttribute('accept') || '',
    fileNames:[...(el.files || [])].map(f=>f.name)
  }))).catch(()=>[]);
  const candidates = files.filter(x=>/resume|cv|pdf|doc|\.pdf/i.test(`${x.name} ${x.id} ${x.accept}`));
  const selected = candidates.length ? candidates : files.length === 1 ? files : [];
  const found = selected.flatMap(x=>x.fileNames);
  return {hasFileInput: files.length>0, verified: expectedBase ? found.includes(expectedBase) : found.length>0, filename:found[0] || ''};
}

async function fillCommon(page, profile, config, resumePath) {
  const pairs = [
    [/first name/i, profile.firstName], [/last name/i, profile.lastName], [/full name|your name/i, profile.fullName],
    [/email/i, profile.email], [/phone|mobile/i, profile.phone], [/city/i, profile.city], [/state/i, profile.state],
    [/linkedin/i, profile.linkedin], [/github/i, profile.github], [/portfolio|website/i, profile.portfolio],
    [/salary|compensation/i, profile.salaryExpectation]
  ];
  let fills=0;
  for (const [re,val] of pairs) if (await fillByLabel(page,re,val)) fills++;
  const resumeName = resumePath && fs.existsSync(resumePath) ? path.basename(resumePath) : '';
  let resumeInfo = await inspectResumeInputs(page, resumeName);
  if (resumeName && resumeInfo.hasFileInput && !resumeInfo.verified) {
    const inputs = page.locator('input[type="file"]');
    const n = await inputs.count().catch(()=>0);
    for (let i=0;i<n;i++) {
      const input = inputs.nth(i);
      const attributes = `${await input.getAttribute('name').catch(()=>'')} ${await input.getAttribute('id').catch(()=>'')} ${await input.getAttribute('accept').catch(()=>'')}`;
      if (/resume|cv|pdf|doc|\.pdf/i.test(attributes) || n===1) {
        try { await input.setInputFiles(resumePath); fills++; break; } catch { /* continue */ }
      }
    }
    resumeInfo = await inspectResumeInputs(page, resumeName);
  }
  if (config.coverLetterText && await fillByLabel(page,/cover letter|additional information|why.*interested/i,config.coverLetterText)) fills++;
  return {fills, resumeInfo};
}

async function requiredBlockers(page) {
  const controls = page.locator('input[required],textarea[required],select[required],[aria-required="true"]');
  const n = Math.min(await controls.count().catch(()=>0), 120);
  const blockers = [], checkedGroups=new Set();
  for (let i=0;i<n;i++) {
    const el=controls.nth(i);
    if (!(await el.isVisible().catch(()=>false)) || !(await el.isEnabled().catch(()=>false))) continue;
    const type=(await el.getAttribute('type').catch(()=>'')) || '';
    if (['hidden','file','submit'].includes(type)) continue; // File upload validated independently.
    const group=(await el.getAttribute('name').catch(()=>'')) || '';
    let empty=false;
    if (type === 'radio') {
      if (checkedGroups.has(group)) continue;
      checkedGroups.add(group);
      const groupLoc=group ? page.locator('input[type="radio"]').filter({visible:true}) : null;
      const states = groupLoc ? await groupLoc.evaluateAll((els,name) => els.filter(x=>x.name===name).map(x=>x.checked), group).catch(()=>[]) : [];
      empty=!states.some(Boolean);
    } else if (type === 'checkbox') empty=!(await el.isChecked().catch(()=>false));
    else empty=!(await el.inputValue().catch(()=>'')).trim();
    if (empty) blockers.push(await el.getAttribute('aria-label').catch(()=>null) || group || await el.getAttribute('id').catch(()=>null) || `required ${type || 'field'}`);
  }
  const invalid = await page.locator('[aria-invalid="true"]:visible').count().catch(()=>0);
  if (invalid) blockers.push(`${invalid} invalid form field(s)`);
  return [...new Set(blockers)].slice(0,14);
}
const SUBMIT_PATTERNS = [/^submit(?: my| your)?(?: application)?$/i,/^send (?:my |your )?application$/i,/^finish application$/i,/^complete application$/i,/^apply for (?:this|the) (?:job|position)$/i,/^submit and (?:finish|apply)$/i,/^finalize (?:my |your )?application$/i,/^submit(?: application)?\s*&\s*finish$/i];
const NEXT_PATTERNS = [/^next(?: step)?$/i,/^continue(?: application)?$/i,/^save (?:and|&) continue$/i,/^review(?: application)?$/i,/^continue to review$/i,/^next: /i,/^save and next$/i,/^save & continue$/i,/^proceed$/i,/^go to next step$/i,/^continue to (?:next|the next) step$/i];

// Form controls are scoped to real application UI, never board carousels/search bars.
async function applicationFormRoot(page) { return (await findApplicationScope(page))?.root || null; }
async function findButton(page,patterns) {
  const form=await applicationFormRoot(page);
  return form ? getAction(form,patterns) : null;
}
async function isAlreadyApplied(page) {
  const buttons=page.getByRole('button',{name:/^(applied|already applied|application submitted)$/i});
  if (await buttons.count().catch(()=>0) && await buttons.first().isVisible().catch(()=>false)) return true;
  const txt=await pageText(page);
  // Only trust an explicit status line; not an employer's promotional copy.
  return /(?:^|\n)\s*(?:application status\s*[:\-]\s*(?:submitted|received)|you have already applied|you(?:'|’)ve already applied)\b/im.test(txt);
}

async function verifySubmission(pages, before, timeoutMs=30000) {
  const deadline=Date.now()+Math.max(4000,Number(timeoutMs)||30000);
  let weakConfirmation=null;
  while (Date.now()<deadline) {
    for (const page of [...pages].filter(p=>!p.isClosed()).reverse().slice(0,4)) {
      const text=await pageText(page);
      const currentUrl=page.url();
      const old=before.get(page) || {text:'',url:''};
      const foundText=matchEvidence(text, CONFIRMATION_TEXT);
      const oldText=matchEvidence(old.text, CONFIRMATION_TEXT);
      const failure=matchEvidence(text, FAILURE_TEXT);
      const oldFailure=matchEvidence(old.text, FAILURE_TEXT);
      const challenge=CHALLENGE_TEXT.test(text);
      const evidence = {
        page, url:currentUrl, text:foundText && (!oldText || foundText!==oldText) ? foundText:'',
        successUrl:currentUrl!==old.url && confirmationUrl(currentUrl),
        failure:failure && failure!==oldFailure ? failure :'', challenge
      };
      if (evidence.successUrl) weakConfirmation=evidence;
      // A success-shaped URL can appear before the success page finishes rendering.
      // Wait for a definite message; preserve the URL as weak evidence on timeout.
      if (evidence.text || evidence.failure || challenge) return evidence;
    }
    await wait(800);
  }
  if (weakConfirmation) return weakConfirmation;
  return {page:activePage(pages, pages[0]), url:activePage(pages,pages[0])?.url?.() || '', text:'', successUrl:false,
    failure:'',challenge:false};
}

async function independentAppliedCheck(context, jobUrl) {
  let probe;
  try {
    probe=await context.newPage();
    await probe.goto(jobUrl,{waitUntil:'domcontentloaded',timeout:15000});
    await wait(1500);
    const applied=await isAlreadyApplied(probe);
    return {applied, checkedUrl:probe.url()};
  } catch { return {applied:false, checkedUrl:''}; }
  finally { await probe?.close().catch(()=>{}); }
}

async function saveVerificationArtifact(page, outboxDir, job, result, observation) {
  const dir=path.join(outboxDir,'verification');
  fs.mkdirSync(dir,{recursive:true});
  const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const base=`${slug(result.company)}-${slug(result.title)}-${hashJob(job.url)}-${stamp}`;
  const relative=path.join('verification',base);
  const artifact={
    createdAt:new Date().toISOString(), jobUrl:job.url, source:job.source, status:result.status,
    confirmationUrl:observation?.url || '', confirmationText:normalizeEvidence(observation?.text),
    changedToConfirmationUrl:!!observation?.successUrl,
    independentAppliedCheck:!!result.independentApplied,
    resumeUploadVerified:result.resume_upload_verified==='yes',
    button:result.submitButton || '', screenshotCaptured:false, htmlCaptured:false
  };
  try { await page.screenshot({path:path.join(dir,`${base}.png`),fullPage:true,timeout:12000}); artifact.screenshotCaptured=true; }
  catch { /* evidence JSON still records the lack of screenshot */ }
  try {
    const html=await page.content();
    if (html) {fs.writeFileSync(path.join(dir,`${base}.html`),html); artifact.htmlCaptured=true;}
  } catch { /* page may have closed */ }
  fs.writeFileSync(path.join(dir,`${base}.json`),JSON.stringify(artifact,null,2));
  return {relative, captured:artifact.screenshotCaptured && artifact.htmlCaptured};
}

export async function processJob({context,job,config,profile,resumePath,outboxDir,fitScore,ledgerFile}) {
  const basePage=await context.newPage();
  basePage.setDefaultTimeout(10000);
  const pages=[basePage];
  const onNewPage=(newPage)=>{ if (!pages.includes(newPage)) pages.push(newPage); };
  context.on('page',onNewPage);
  const result={
    timestamp:new Date().toISOString(), company:'', title:'', url:job.url, source:job.source,
    work_mode:'unknown',fit_score:fitScore,status:'opened',simplify_autofill:'unknown',resume_used:'',
    resume_upload_verified:'no',cover_letter_used:'no',submission_verified:'no',verification_evidence:'',
    stepsCompleted:0,fieldsFilled:0,requiredBlockers:[],simplifyClicks:0,simplifyStatus:'not-tested',
    blocker:'',artifact_path:'',confirmation_url:'',independentApplied:false,submitButton:'',
    cookie_banners_accepted:0,site_notices_dismissed:0
  };
  let writeAhead=false, attemptedClick=false;
  const clearNotices=async page=>{
    const handled=await handleSiteAcknowledgements(page,config);
    result.cookie_banners_accepted+=handled.cookieBannersAccepted;
    result.site_notices_dismissed+=handled.noticesDismissed;
  };
  try {
    await basePage.goto(job.url,{waitUntil:'domcontentloaded',timeout:30000});
    await wait(1200);
    await clearNotices(basePage);
    const original=await pageText(basePage);
    const meta=await getMeta(basePage,original);
    Object.assign(result,{company:meta.company,title:meta.title,work_mode:workMode(original)});
    // Reject listing pages, generic headings and unrelated occupations BEFORE clicking Apply.
    if ((!isJobUrl(basePage.url(),job.source) && !await applicationFormRoot(basePage)) || !plausibleRoleTitle(meta.title,config)) {
      result.status='skipped-not-individual-job';result.blocker='Not a validated individual software/AI job posting';return result;
    }
    result.fit_score=computeFitScore(`${meta.title} ${original.slice(0,14000)}`,config);
    if(result.fit_score < (config.minFitScore??0)) {result.status='skipped-low-fit';result.blocker=`Actual posting score ${result.fit_score} below minimum ${config.minFitScore}`;return result;}
    if (config.strictRemote && !looksRemoteEnough(original)) {result.status='skipped-not-clearly-remote';return result;}
    if (classificationFromApplication(original)==='blocked') {result.status='blocked';result.blocker='Anti-bot challenge on posting';return result;}
    if (await isAlreadyApplied(basePage)) {result.status='already-applied';result.verification_evidence='Posting already indicated applied before this run';return result;}

    fs.mkdirSync(outboxDir,{recursive:true});
    const brief=[`# ${meta.title}${meta.company?` — ${meta.company}`:''}`,'',`Source: ${job.source}`,`URL: ${job.url}`,`Fit score: ${fitScore}`,'','## Tailoring brief',
      `Supported skills appearing in posting: ${(profile.skills||[]).filter(s=>original.toLowerCase().includes(s.toLowerCase())).join(', ')||'No exact profile-skill matches detected.'}`,
      '', '## Job text snapshot', original.slice(0,10000)].join('\n');
    fs.writeFileSync(path.join(outboxDir,`${slug(meta.company)}-${slug(meta.title)}-${hashJob(job.url)}.md`),brief);

    let landing=basePage;
    let form=await findApplicationScope(landing);
    // Job boards frequently open a second apply page/ATS before the actual form.
    // Follow up to three recognizable application CTAs; never click arbitrary Next buttons.
    for(let hop=0;!form && hop<3;hop++){
      await clearNotices(landing);
      const apply=await clickByNames(landing,[/^easy apply$/i,/^apply now$/i,/^apply$/i,/^apply for this job$/i,/^start application$/i,/^apply on company (?:site|website)$/i,/^continue to application$/i,/^apply on (?:external|company) site$/i,/^apply for (?:this|the) position$/i,/^apply to (?:this|the) (?:job|position)$/i,/^apply with linkedin$/i,/^apply using (?:resume|profile)$/i,/^start (?:your )?application$/i]);
      if(!apply.clicked){result.status='needs-review';result.blocker=`No application button found at ${landing.url()}`;return result;}
      result.status='application-opened';
      await wait(1800);
      landing=activePage(pages,basePage);
      await landing.waitForLoadState('domcontentloaded',{timeout:7000}).catch(()=>{});
      await clearNotices(landing);
      const landingStatus=classificationFromApplication(await pageText(landing));
      if(landingStatus){result.status=landingStatus;result.blocker='Site requires manual sign-in or human verification';return result;}
      form=await findApplicationScope(landing);
    }
    if(!form){result.status='needs-review';result.blocker=`The employer application form was not detected after opening Apply (${landing.url()})`;return result;}
    let resumeEverVerified=false;
    const simp=simplifySettings(config);
    const maxSteps=Math.max(1,Math.min(20,Number(config.maxApplicationSteps)||14));
    for (let step=0; step<maxSteps; step++) {
      const page=activePage(pages,basePage);
      if (!page || page.isClosed()) {result.status='needs-review';result.blocker='Application window closed';return result;}
      await clearNotices(page);
      const text=await pageText(page);
      const gate=classificationFromApplication(text);
      if (gate) {result.status=gate;result.blocker=gate==='authentication-required'?'Login required in the dedicated Chrome profile':'Human verification required';return result;}
      form=await findApplicationScope(page);
      if(!form) {result.status='needs-review';result.blocker='Application form disappeared or moved into unsupported UI';return result;}
      const before=await getRequiredBlockers(form.root);
      // Ask the installed Simplify Copilot in-page panel to fill FIRST.
      // Its final submit remains under our form validation + evidence checks.
      const simplify=await trySimplifyAutofill(page,config);
      result.simplifyStatus=simplify.status;
      if (simplify.clicked) result.simplifyClicks++;
      if (simplify.status==='clicked-autofill') result.simplify_autofill='button-clicked';
      else if (simplify.status==='not-visible' && result.simplifyClicks===0) result.simplify_autofill='extension-not-visible';
      if (!simp.fallbackToBuiltIn && simp.enabled && !simplify.clicked) {
        result.status='needs-review';
        result.blocker='Simplify autofill button unavailable and built-in fallback is disabled. Install or open Simplify in the dedicated Chrome profile.';
        return result;
      }
      // Leave any values Simplify wrote untouched; fill missing fields safely.
      let filled=(simp.enabled && !simp.fallbackToBuiltIn)
        ? await inspectApplicationResume(form.root,resumePath)
        : await fillApplicationScope({root:form.root,profile,config,resumePath});
      result.fieldsFilled += filled.fills;
      const resumeName=resumePath && fs.existsSync(resumePath) ? path.basename(resumePath):'';
      resumeEverVerified = resumeEverVerified || filled.resumeInfo.verified;
      if (resumeEverVerified) {result.resume_upload_verified='yes';result.resume_used=resumeName || filled.resumeInfo.filename;}
      result.cover_letter_used=filled.fills && config.coverLetterText ? 'maybe' : 'no';
      // Workday/Greenhouse may asynchronously parse a résumé and populate more fields.
      await wait(450);
      await clearNotices(page);
      let blockers=await getRequiredBlockers(form.root);
      // Resume parsers and custom ATS widgets may reveal extra fields asynchronously.
      // Give newly appearing fields one more safe fill pass before declaring a blocker.
      if (blockers.length && simp.fallbackToBuiltIn && (filled.fills>0 || simplify.clicked)) {
        await wait(900);
        const second=await fillApplicationScope({root:form.root,profile,config,resumePath});
        result.fieldsFilled += second.fills;
        resumeEverVerified=resumeEverVerified || second.resumeInfo.verified;
        if(resumeEverVerified){result.resume_upload_verified='yes';result.resume_used=resumeName||second.resumeInfo.filename;}
        blockers=await getRequiredBlockers(form.root);
      }
      result.requiredBlockers=blockers;
      if (simplify.clicked) {
        result.simplify_autofill=filled.fills ? 'copilot-triggered-plus-fallback' : 'copilot-triggered';
      } else if (filled.fills && !result.simplifyClicks) {
        result.simplify_autofill='built-in-only';
      }
      // Never equate a visible button click with successful field completion.
      // The next phase validates required fields and the resume upload.

      if (blockers.length) {result.status='needs-review';result.blocker=`Required fields need truthful answers: ${blockers.join('; ')}`;return result;}

      const submit=await getAction(form.root,SUBMIT_PATTERNS);
      if (submit) {
        if (!config.autoSubmit) {result.status='ready-for-submit';return result;}
        if ((config.requireResumeUpload ?? true) && !resumeEverVerified) {
          result.status='needs-review';result.blocker='Resume upload not verified; no final submit attempted.';return result;
        }
        if (!resumePath || !fs.existsSync(resumePath)) {
          if (config.requireResumeUpload ?? true) {result.status='needs-review';result.blocker='Configured resume file is missing.';return result;}
        }
        await clearNotices(page);
        const preSubmitText=await pageText(page);
        if (CHALLENGE_TEXT.test(preSubmitText)) {result.status='blocked';result.blocker='Human verification required';return result;}
        // Never submit when HTML5 validation or unresolved required items remain.
        const finalBlockers=await getRequiredBlockers(form.root);
        if(finalBlockers.length){result.status='needs-review';result.blocker=`Before submit: ${finalBlockers.join('; ')}`;return result;}
        const beforeSubmit=new Map();
        for (const openPage of pages.filter(p=>!p.isClosed())) beforeSubmit.set(openPage,{
          url:openPage.url(),text:openPage===page?preSubmitText:await pageText(openPage)
        });
        const submitLabel=await submit.innerText().catch(()=>'Submit');
        result.submitButton=normalizeEvidence(submitLabel);
        // Write-ahead record survives a crash between clicking Submit and CSV append.
        updateLedger(ledgerFile,job.url,'submit-attempted',{company:result.company,title:result.title,submitButton:result.submitButton});
        writeAhead=true;
        try {await submit.click({timeout:10000});attemptedClick=true;}
        catch (error) {
          // A navigation race may mean the browser delivered the click before raising an error.
          attemptedClick=true;result.blocker=`Submit click/navigation outcome uncertain: ${normalizeEvidence(error.message)}`;
        }
        await wait(650);
        // A blocked click or server validation error is NOT a submission.
        const immediateScope=await findApplicationScope(activePage(pages,page));
        const clickBlockers=immediateScope ? await getRequiredBlockers(immediateScope.root) : [];
        if(clickBlockers.length && !confirmationUrl(activePage(pages,page).url())) {
          result.status='needs-review';
          result.requiredBlockers=clickBlockers;
          result.blocker=`Submit returned form validation: ${clickBlockers.join('; ')}`;
          updateLedger(ledgerFile,job.url,'needs-review',{blocker:result.blocker});writeAhead=false;return result;
        }
        const obs=await verifySubmission(pages,beforeSubmit,Math.max(4000,Number(config.submissionVerifyTimeoutMs)||30000));
        result.confirmation_url=obs.url || '';
        result.verification_evidence=normalizeEvidence([
          obs.text&&`Post-submit confirmation: ${obs.text}`,
          obs.successUrl&&`Confirmation URL: ${obs.url}`,
          obs.failure&&`Failure: ${obs.failure}`,
          obs.challenge&&'Human verification challenge'
        ].filter(Boolean).join('; ') || 'No new authoritative submission confirmation detected');
        if (obs.text) {
          const check=await independentAppliedCheck(context,job.url);
          result.independentApplied=check.applied;
          if (check.applied) result.verification_evidence += '; Independent revisit shows applied status';
        }
        result.status=classifyEvidence({submittedClick:attemptedClick,confirmationText:!!obs.text,
          confirmationUrlChanged:obs.successUrl,independentApplied:result.independentApplied,
          artifactSaved:false,failure:!!obs.failure,challenge:obs.challenge});
        const evidencePage=obs.page && !obs.page.isClosed() ? obs.page : activePage(pages,page);
        const artifact=await saveVerificationArtifact(evidencePage,outboxDir,job,result,obs);
        result.artifact_path=artifact.relative;
        // Require evidence files as well as two confirmations before promoting to confirmed.
        result.status=classifyEvidence({submittedClick:attemptedClick,confirmationText:!!obs.text,
          confirmationUrlChanged:obs.successUrl,independentApplied:result.independentApplied,
          artifactSaved:artifact.captured,failure:!!obs.failure,challenge:obs.challenge});
        try {
          const metadataPath=path.join(outboxDir,`${artifact.relative}.json`);
          const metadata=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
          metadata.status=result.status;
          fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
        } catch {}
        if (result.status==='submitted-confirmed') result.submission_verified='yes';
        else result.blocker = result.blocker || (result.status==='submitted-pending-receipt'
          ? 'Browser confirmation found, but a second independent confirmation or evidence artifact is missing.'
          : result.status==='submit-clicked-unverified' ? 'Final submit attempted; confirmation not detected. Check manually before retrying.'
          : result.verification_evidence);
        updateLedger(ledgerFile,job.url,result.status,{artifact_path:artifact.relative,confirmation_url:result.confirmation_url});
        writeAhead=false;
        return result;
      }
      const next=await getAction(form.root,NEXT_PATTERNS);
      if (!next) {result.status='ready-no-submit-button';result.blocker=`No final submit or next-step button after step ${step+1}`;return result;}
      await clearNotices(page);
      const beforeUrl=page.url(), beforeFingerprint=await formFingerprint(form.root), beforeFrameCount=page.frames().length, beforePageCount=pages.length;
      try {await next.click({timeout:7500});}
      catch(error) {result.status='needs-review';result.blocker=`Could not advance application: ${normalizeEvidence(error.message)}`;return result;}
      let advanced=false;
      for(let n=0;n<9;n++) {
        await wait(400);
        const current=activePage(pages,page);
        const nextForm=await findApplicationScope(current);
        const nextFingerprint=nextForm ? await formFingerprint(nextForm.root) : '';
        if(pages.length!==beforePageCount || current.url()!==beforeUrl || current.frames().length!==beforeFrameCount ||
          (nextFingerprint && nextFingerprint!==beforeFingerprint)) {advanced=true;break;}
      }
      if(!advanced){
        const root=(await findApplicationScope(activePage(pages,page)))?.root;
        const errors=root ? await getRequiredBlockers(root) : [];
        result.status='needs-review';
        result.blocker=errors.length ? `Next step blocked by validation: ${errors.join('; ')}` : `Application did not advance at step ${step+1}`;
        return result;
      }
      result.stepsCompleted++; 
    }
    result.status='needs-review';result.blocker='Application exceeded configured step limit';return result;
  } catch (error) {
    result.status=writeAhead?'submit-clicked-unverified':'error';
    result.blocker=normalizeEvidence(error?.message || error);
    if (writeAhead) {
      try {updateLedger(ledgerFile,job.url,'submit-clicked-unverified',{error:result.blocker});} catch {}
    }
    return result;
  } finally {
    // Retain a screenshot and HTML for every non-skipped result, not only submit attempts.
    // This lets a human inspect exactly where a workflow stalled.
    if (!result.artifact_path && !result.status.startsWith('skipped-')) {
      const page=activePage(pages,basePage);
      if(page && !page.isClosed()) {
        try {
          const artifact=await saveVerificationArtifact(page,outboxDir,job,result,{url:page.url(),text:''});
          result.artifact_path=artifact.relative;
        } catch {}
      }
    }
    context.off('page',onNewPage);
    for (const page of pages.slice().reverse()) await page.close().catch(()=>{});
  }
}
