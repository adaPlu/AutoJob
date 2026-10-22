import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { answerForQuestion } from '../src/forms.js';
import { processJob } from '../src/apply.js';

const profile={firstName:'Ada',lastName:'Test',fullName:'Ada Test',email:'ada@example.test',phone:'5550121234',
  linkedin:'https://linkedin.com/in/test',github:'https://github.com/test',country:'United States',
  workAuthorization:'Yes — U.S. citizen',requiresSponsorship:'No'};
const config={autoSubmit:true,strictRemote:true,requireResumeUpload:true,minFitScore:0,
  preferredKeywords:['java'],maxApplicationSteps:14,submissionVerifyTimeoutMs:4500};

test('verified work authorization / citizenship / sponsorship may be answered, without inventing other facts',()=>{
  assert.equal(answerForQuestion('Are you legally authorized to work in the United States?', 'radio',profile,config),'Yes');
  assert.equal(answerForQuestion('Will you now or in the future require visa sponsorship?', 'select',profile,config),'No');
  assert.equal(answerForQuestion('Are you a US citizen?', 'select',profile,config),'Yes');
  assert.equal(answerForQuestion('Are you willing to relocate?', 'select',profile,config),'No');
  assert.equal(answerForQuestion('How many years of React experience do you have?', 'text',profile,config),'');
  assert.equal(answerForQuestion('Do you consent to a background check?', 'checkbox',profile,config),'');
  assert.equal(answerForQuestion('Gender identity', 'select',profile,config),'');
  assert.equal(answerForQuestion('Do you have a disability?', 'select',profile,config),'');
  assert.equal(answerForQuestion('Desired salary?', 'text',profile,config),'');
});

test('answers are from explicitly supplied applicationAnswers only',()=>{
  const p={...profile,applicationAnswers:{'How many months have you worked in Java?':'24'}};
  assert.equal(answerForQuestion('How many months have you worked in Java?', 'text',p,config),'24');
  assert.equal(answerForQuestion('How many years of Python experience?', 'text',p,config),'');
});

// Optional live Chromium test uses a synthetic form with DOM transitions, no employer network.
test('multi-step ATS: finishes factual fields, file upload, yes/no selection, then only submits if valid',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const {chromium}=await import('playwright-core');
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ats-multistep-'));
    const resumePath=path.join(tmp,'Resume.pdf');
    fs.writeFileSync(resumePath,'%PDF-1.4\nsynthetic fixture\n%%EOF');
    const page1=`<!doctype html><html><head><title>Junior Software Engineer</title></head><body>
<h1>Junior Software Engineer</h1><p>Remote, United States. Java Spring Boot.</p>
<form id="application-form">
<label>First name <input name="first_name" required></label>
<label>Last name <input name="last_name" required></label>
<label>Email address <input type="email" name="email" required></label>
<label>Phone number <input type="tel" name="phone" required></label>
<label>Resume <input type="file" name="resume" required></label>
<label>Are you legally authorized to work in the United States?
<select name="work_authorization" required><option value="">Choose one</option><option>Yes</option><option>No</option></select></label>
<fieldset><legend>Will you now or in the future require visa sponsorship?</legend>
<label><input type="radio" name="sponsorship" value="Yes" required>Yes</label>
<label><input type="radio" name="sponsorship" value="No" required>No</label></fieldset>
<button type="button" onclick="nextStep()">Next</button>
</form>
<script>
function nextStep(){
const form=document.querySelector('form');
if(!form.checkValidity()){form.reportValidity(); return;}
form.innerHTML='<label>LinkedIn <input name="linkedin" required></label><label>GitHub <input name="github" required></label><button type="button" onclick="finish()">Submit Application</button>';
}
function finish(){const form=document.querySelector('form');if(!form.checkValidity()){form.reportValidity();return;}
document.body.innerHTML='<h1>Thank you for applying</h1><p>Your application has been submitted successfully.</p>';}
</script></body></html>`;
    let browser;
    try {
      browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
      const context=await browser.newContext();
      const native=context.newPage.bind(context);
      context.newPage=async()=>{const p=await native();p.goto=async()=>p.setContent(page1);return p;};
      const result=await processJob({context,job:{url:'https://careers.example.invalid/jobs/junior-software-engineer',source:'companycareers'},
        config,profile,resumePath,outboxDir:path.join(tmp,'out'),fitScore:0,ledgerFile:path.join(tmp,'ledger.json')});
      assert.equal(result.status,'submitted-pending-receipt',JSON.stringify(result));
      assert.equal(result.resume_upload_verified,'yes');
      assert.equal(result.stepsCompleted,1);
      assert.ok(result.fieldsFilled>=8,`fills=${result.fieldsFilled}`);
    } finally {await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
  });

test('required legal agreement cannot be silently accepted and no submit click happens',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const {chromium}=await import('playwright-core');
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ats-legal-'));
    const resumePath=path.join(tmp,'Resume.pdf');fs.writeFileSync(resumePath,'%PDF-1.4\nfixture\n%%EOF');
    const html=`<!doctype html><html><title>Junior Software Engineer</title><body>
      <h1>Junior Software Engineer</h1><p>Remote. Java</p><form id="application-form">
      <label>Email <input type="email" name="email" required></label>
      <label>Resume <input type="file" name="resume" required></label>
      <label>I agree to the terms <input type="checkbox" name="agreement" required></label>
      <button type="submit" onclick="event.preventDefault();window.didSubmit=true">Submit Application</button>
      </form></body></html>`;
    let browser;
    try{
      browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
      const ctx=await browser.newContext();const native=ctx.newPage.bind(ctx);
      ctx.newPage=async()=>{const p=await native();p.goto=async()=>p.setContent(html);return p;};
      const result=await processJob({context:ctx,job:{url:'https://careers.example.invalid/jobs/junior-software-engineer',source:'companycareers'},
        config,profile,resumePath,outboxDir:path.join(tmp,'out'),fitScore:0,ledgerFile:path.join(tmp,'ledger.json')});
      assert.equal(result.status,'needs-review',JSON.stringify(result));
      assert.match(result.blocker,/agreement\/checkbox/i);
      assert.equal(result.submitButton,'');
    }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
  });
