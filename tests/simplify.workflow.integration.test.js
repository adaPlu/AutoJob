// SPDX-License-Identifier: MIT
// Simulated job form with a mock visible Simplify Copilot button; no employer contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {processJob} from '../src/apply.js';

test('Simplify-first application passes through final validation and evidence checks',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
  const {chromium}=await import('playwright-core');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'simplify-workflow-'));
  const resumePath=path.join(tmp,'Resume.pdf');
  fs.writeFileSync(resumePath,'%PDF-1.4\nsynthetic fixture\n%%EOF');
  const html=`<!doctype html><html><head><title>Junior Software Engineer</title></head><body>
   <h1>Junior Software Engineer</h1><p>Remote USA. Java and Python developer.</p>
   <section aria-label="Simplify Copilot"><button type="button" onclick="document.querySelector('[name=first_name]').value='Taylor'; document.querySelector('[name=first_name]').dispatchEvent(new Event('input',{bubbles:true}));window.simplifyRan=true;">Autofill This Page</button></section>
   <form id="application-form" onsubmit="event.preventDefault();document.body.innerHTML='<h1>Thank you for applying</h1><p>Your application has been submitted successfully.</p>'">
    <label>First Name <input name="first_name" required /></label>
    <label>Last Name <input name="last_name" required /></label>
    <label>Email <input type="email" name="email" required /></label>
    <label>Phone <input name="phone" required /></label>
    <label>Resume <input type="file" name="resume" required /></label>
    <button type="submit">Submit Application</button>
   </form></body></html>`;
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext();
    const newPage=context.newPage.bind(context);
    context.newPage=async()=>{
      const p=await newPage();
      p.goto=async()=>await p.setContent(html);
      return p;
    };
    const result=await processJob({context,job:{url:'https://careers.example.invalid/jobs/junior-software-engineer',source:'companycareers'},
      config:{strictRemote:true,autoSubmit:true,requireResumeUpload:true,minFitScore:1,preferredKeywords:['java','python'],
      simplifyCopilot:{enabled:true,waitAfterClickMs:500},submissionVerifyTimeoutMs:4500},
      profile:{firstName:'Taylor',lastName:'Sample',email:'test@example.com',phone:'5551231234'},
      resumePath,outboxDir:path.join(tmp,'outbox'),ledgerFile:path.join(tmp,'ledger.json'),fitScore:0});
    assert.equal(result.status,'submitted-pending-receipt',JSON.stringify(result));
    assert.equal(result.simplifyClicks,1);
    assert.equal(result.simplify_autofill,'copilot-triggered-plus-fallback');
    assert.equal(result.resume_upload_verified,'yes');
    assert.ok(result.artifact_path);
  }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
});
