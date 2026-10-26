// SPDX-License-Identifier: MIT
// Tests never contact a real employer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateCoverLetter,isCoverLetterLabel,isResumeLabel,inspectCoverLetterFields,fillCoverLetterFields} from '../src/cover-letter.js';
import {fillApplicationScope} from '../src/forms.js';

const profile={firstName:'Taylor',lastName:'Applicant',summary:'Built small backend services with REST APIs and Python.',
  skills:['Python','Java','React','Kotlin','PostgreSQL']};
const job={title:'Junior Python Developer',company:'Example Co',url:'https://example.invalid/jobs/junior-python'};
const posting='Junior Python Developer (Remote). Python, PostgreSQL and REST APIs required.';

test('tailored text uses only verified profile and matching job skills',()=>{
 const letter=generateCoverLetter({profile,job,postingText:posting});
 assert.equal(letter.ok,true);
 assert.match(letter.text,/Junior Python Developer at Example Co/);
 assert.match(letter.text,/Python/);
 assert.match(letter.text,/PostgreSQL/);
 assert.doesNotMatch(letter.text,/Kotlin|React|10 years|AWS certified|led a team/i);
 assert.ok(letter.text.includes('Taylor Applicant'));
 assert.equal(generateCoverLetter({profile:{firstName:'A'},job,postingText:posting}).ok,false);
 assert.equal(isCoverLetterLabel('upload_cover_letter'),true);
 assert.equal(isResumeLabel('Upload Resume'),true);
 assert.equal(isResumeLabel('Upload Cover Letter'),false);
});

test('only required cover letter is generated; correct upload slot used without replacing resume',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cover-letter-test-'));
 const resumePath=path.join(tmp,'SampleResume.pdf');
 fs.writeFileSync(resumePath,'%PDF-1.4\nSynthetic resume\n%%EOF');
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.setContent(`<form id="application-form">
     <label>Resume <input name="resume" type="file" accept=".pdf" required></label>
     <label>Cover Letter <input name="cover_letter" type="file" accept="application/pdf" required></label>
     <label>Additional information <textarea name="extra"></textarea></label>
   </form>`);
  const root=page.locator('form');
  const fill=await fillApplicationScope({root,profile,config:{},resumePath});
  assert.equal(fill.resumeInfo.verified,true);
  const evidence=await fillCoverLetterFields({root,profile,config:{},job,postingText:posting,outboxDir:tmp});
  assert.equal(evidence.inserted,1,JSON.stringify(evidence));
  assert.equal(evidence.used,'generated');
  const cover=await page.locator('input[name="cover_letter"]').evaluate(e=>e.files[0]?.name);
  const resume=await page.locator('input[name="resume"]').evaluate(e=>e.files[0]?.name);
  assert.equal(resume,'SampleResume.pdf');
  assert.match(cover,/cover-letter.*\.pdf/);
  const pdf=fs.readFileSync(path.join(tmp,evidence.pdfPath));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>300);
  assert.equal(fs.readFileSync(path.join(tmp,evidence.path),'utf8').includes('Example Co'),true);
 }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
});

test('no requested letter means no generated files, and optional-only is skipped by default',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coverletter-optional-'));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.setContent('<form id="application-form"><label>Resume <input type="file" name="resume"></label></form>');
  let letter=await fillCoverLetterFields({root:page.locator('form'),profile,job,postingText:posting,outboxDir:tmp});
  assert.equal(letter.found,false);
  assert.equal(fs.existsSync(path.join(tmp,'cover-letters')),false);
  await page.setContent('<form id="application-form"><label>Cover Letter <textarea name="cover_letter"></textarea></label></form>');
  letter=await fillCoverLetterFields({root:page.locator('form'),profile,job,postingText:posting,outboxDir:tmp});
  assert.equal(letter.inserted,0);
  assert.equal(fs.existsSync(path.join(tmp,'cover-letters')),false);
  letter=await fillCoverLetterFields({root:page.locator('form'),profile,config:{coverLetter:{generateForOptional:true}},job,postingText:posting,outboxDir:tmp});
  assert.equal(letter.inserted,1);
  assert.match(await page.locator('textarea').inputValue(),/Example Co/);
 }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
});

test('a required letter with unsupported upload format requests manual review without pretending success',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coverletter-unsupported-'));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.setContent('<form id="application-form"><label>Cover Letter <input name="cover_letter" accept=".docx" type="file" required></label></form>');
  const found=await inspectCoverLetterFields(page.locator('form'));
  assert.equal(found.length,1);
  const letter=await fillCoverLetterFields({root:page.locator('form'),profile,job,postingText:posting,outboxDir:tmp});
  assert.equal(letter.inserted,0);
  assert.ok(letter.errors.length>0);
  assert.equal(await page.locator('input').evaluate(e=>e.files.length),0);
 }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
});

// Exercise the actual AutoJob application flow in a synthetic browser page.
// autoSubmit:false ensures not even the fixture's Submit button is pressed.
test('application flow drafts and attaches a required letter without submitting',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const {processJob}=await import('../src/apply.js');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'coverletter-workflow-'));
 const resumePath=path.join(tmp,'Resume.pdf');
 fs.writeFileSync(resumePath,'%PDF-1.4\nSynthetic resume\n%%EOF');
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext();
  const nativeNewPage=ctx.newPage.bind(ctx);
  ctx.newPage=async()=>{const page=await nativeNewPage();page.goto=async()=>page.setContent(`<!doctype html>
   <html><head><title>Junior Python Developer</title></head><body>
    <h1>Junior Python Developer</h1><p>Remote, United States, Python, PostgreSQL, REST APIs.</p>
    <form id="application-form">
      <label>First Name <input name="first_name" required></label>
      <label>Last Name <input name="last_name" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Phone <input name="phone" required></label>
      <label>Resume <input name="resume" type="file" accept=".pdf" required></label>
      <label>Cover Letter <input name="cover_letter" type="file" accept=".pdf" required></label>
      <button type="submit" onclick="window.didSubmit=true">Submit Application</button>
    </form></body></html>`);return page;};
  const r=await processJob({
    context:ctx,job:{url:'https://careers.example.invalid/jobs/junior-python-developer',source:'companycareers'},
    config:{autoSubmit:false,strictRemote:true,requireResumeUpload:true,minFitScore:0,
      preferredKeywords:['python','postgresql'],simplifyCopilot:{enabled:false}},
    profile:{...profile,email:'taylor@example.test',phone:'5550121234'},
    resumePath,outboxDir:tmp,fitScore:0,ledgerFile:path.join(tmp,'ledger.json')
  });
  assert.equal(r.status,'ready-for-submit',JSON.stringify(r));
  assert.equal(r.cover_letter_used,'generated');
  assert.equal(r.resume_upload_verified,'yes');
  assert.ok(r.cover_letter_path);
  assert.match(fs.readFileSync(path.join(tmp,r.cover_letter_path),'utf8'),/Python/);
 }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
});
