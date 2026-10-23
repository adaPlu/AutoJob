// SPDX-License-Identifier: MIT
// Opt-in browser test using a simulated ATS page; no external employer is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processJob } from '../src/apply.js';

test('fills a real browser application form, selects resume and clicks final submit',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const { chromium } = await import('playwright-core');
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'apply-test-'));
    const resumePath=path.join(tmp,'Resume.pdf');
    fs.writeFileSync(resumePath,'%PDF-1.4\nsynthetic fixture\n%%EOF');
    // Data URL avoids external network. The fixture does not send an employer application.
    const html=`<!doctype html><html><head><title>Junior Software Engineer</title></head><body>
      <h1>Junior Software Engineer</h1><p>Remote — United States. Java, Python, React.</p>
      <form id="application-form" onsubmit="event.preventDefault();document.body.innerHTML='<h1>Thank you for applying</h1><p>Your application has been submitted successfully.</p>'">
      <label>First Name <input name="first_name" required></label>
      <label>Last Name <input name="last_name" required></label>
      <label>Email <input type="email" name="email" required></label>
      <label>Phone <input type="tel" name="phone" required></label>
      <label>Resume <input type="file" name="resume" required></label>
      <button type="submit">Submit Application</button></form></body></html>`;
    const jobUrl='https://careers.example.invalid/jobs/junior-software-engineer';
    let browser;
    try{
      browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
      const context=await browser.newContext();
      // This sandbox blocks all Chromium navigation; use its live DOM through setContent.
      // The actual processJob application logic and click/upload behavior are unmodified.
      const nativeNewPage=context.newPage.bind(context);
      context.newPage=async()=>{
        const p=await nativeNewPage();
        p.goto=async()=>{await p.setContent(html);};
        return p;
      };
      const result=await processJob({context,job:{url:jobUrl,source:'companycareers',anchorText:'Junior Software Engineer'},config:{autoSubmit:true,strictRemote:true,requireResumeUpload:true,minFitScore:1,preferredKeywords:['java','python','react'],submissionVerifyTimeoutMs:4500},profile:{firstName:'Taylor',lastName:'Sample',email:'taylor@example.test',phone:'5551234567'},resumePath,outboxDir:path.join(tmp,'outbox'),fitScore:0,ledgerFile:path.join(tmp,'ledger.json')});
      assert.equal(result.status,'submitted-pending-receipt',JSON.stringify(result));
      assert.equal(result.resume_upload_verified,'yes');
      assert.match(result.verification_evidence,/submitted/i);
      assert.ok(result.artifact_path);
    }finally{
      await browser?.close();
      fs.rmSync(tmp,{recursive:true,force:true});
    }
  });
