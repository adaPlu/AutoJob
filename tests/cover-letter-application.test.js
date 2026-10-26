// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {processJob} from '../src/apply.js';

test('application requires a tailored PDF letter; AutoJob uploads letter and resume separately before simulated submit',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
  const {chromium}=await import('playwright-core');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cover-letter-ats-'));
  const resume=path.join(dir,'Resume.pdf');
  fs.writeFileSync(resume,'%PDF-1.4\n%synthetic fixture only\n%%EOF');
  const html=[
   '<!doctype html><html><head><title>Junior Java Developer</title></head><body>',
   '<h1>Junior Java Developer</h1><p>Remote, United States. Java, Spring Boot and backend APIs.</p>',
   '<form id="application-form" onsubmit="event.preventDefault();if(document.querySelector(\'[name=resume]\').files.length && document.querySelector(\'[name=cover_letter]\').files.length){document.body.innerHTML=\'<h1>Thank you for applying</h1><p>We received your application.</p>\';}">',
   '<label>First name <input name="first_name" required></label>',
   '<label>Last name <input name="last_name" required></label>',
   '<label>Email <input type="email" name="email" required></label>',
   '<label>Phone <input type="tel" name="phone" required></label>',
   '<label>Resume <input type="file" name="resume" required></label>',
   '<label>Cover Letter <input type="file" name="cover_letter" accept=".pdf" required></label>',
   '<button type="submit">Submit Application</button></form></body></html>'
  ].join('');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext();
    const create=ctx.newPage.bind(ctx);
    ctx.newPage=async()=>{const page=await create();page.goto=async()=>page.setContent(html);return page;};
    const result=await processJob({
      context:ctx,
      job:{url:'https://careers.example.invalid/jobs/junior-java-developer',source:'companycareers'},
      config:{autoSubmit:true,strictRemote:true,requireResumeUpload:true,minFitScore:1,preferredKeywords:['java','spring boot'],
        submissionVerifyTimeoutMs:4500,coverLetter:{enabled:true,generateForOptional:false}},
      profile:{firstName:'Taylor',lastName:'Sample',email:'taylor@example.test',phone:'555-555-5555',
        summary:'I build Java applications and backend services.',skills:['Java','Spring Boot','Python']},
      resumePath:resume,outboxDir:path.join(dir,'outbox'),fitScore:0,ledgerFile:path.join(dir,'ledger.json')
    });
    assert.equal(result.status,'submitted-pending-receipt',JSON.stringify(result));
    assert.equal(result.resume_upload_verified,'yes');
    assert.equal(result.cover_letter_used,'generated');
    assert.ok(result.cover_letter_path);
    assert.match(fs.readFileSync(path.join(dir,'outbox',result.cover_letter_path),'utf8'),/Junior Java Developer/);
    assert.ok(fs.readdirSync(path.join(dir,'outbox','cover-letters')).some(name=>name.endsWith('.pdf')));
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
