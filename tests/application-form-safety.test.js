// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findApplicationScope,fillApplicationScope,inspectApplicationResume,isAccountProfilePage} from '../src/forms.js';

const browserTest=(name,run)=>test(name,{skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
  const {chromium}=await import('playwright-core');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {const page=await browser.newPage();await run(page);}finally{await browser.close();}
});

test('job-board profile route must not be counted as employer application',()=>{
  assert.equal(isAccountProfilePage('https://jobicy.com/my-profile'),true);
  assert.equal(isAccountProfilePage('https://jobicy.com/my-account'),true);
  assert.equal(isAccountProfilePage('https://jobs.lever.co/realcompany/job/123'),false);
});

browserTest('profile edit form and issue-report popup are both excluded',async page=>{
  await page.setContent('<h1>Applicant profile</h1><form id="edit_user">'+
    '<label>First Name<input name="first-name"></label>'+
    '<label>Last Name<input name="last-name"></label>'+
    '<label>Professional Headline<input name="headline"></label>'+
    '<label>About me<textarea name="description"></textarea></label>'+
    '<label>Resume<input type="file" id="resume_pdf_upload"></label>'+
    '<button>Update Profile</button></form><form id="edu-modal-form"><input name="school"></form>');
  assert.equal(await findApplicationScope(page),null);
  await page.setContent('<h1>Software Engineer Remote Job</h1>'+
    '<div role="dialog" aria-label="Report a dead link"><input id="dead-link-report-modal-email" placeholder="Your Email Address" type="email">'+
    '<select name="report_type"><option>Report a link</option></select><select name="error_type"></select>'+
    '<textarea name="details" placeholder="Please tell us how to fix it"></textarea><button>Submit report</button></div>');
  assert.equal(await findApplicationScope(page),null);
});

browserTest('legitimate application autofills precise names, verified headline and about me',async page=>{
  await page.setContent('<h1>Junior Software Engineer</h1><form id="application-form">'+
    '<fieldset><legend>Contact details</legend>'+
    '<label>First Name<input name="first-name" required></label>'+
    '<label>Last Name<input name="last-name" required></label></fieldset>'+
    '<label>Professional Headline<input name="headline" required></label>'+
    '<label>About me<textarea name="description" required></textarea></label>'+
    '<label>Email<input type="email" name="email" required></label>'+
    '<button type="submit">Submit Application</button></form>');
  const form=await findApplicationScope(page);
  assert.ok(form,'a legitimate candidate form must be recognized');
  const profile={firstName:'Taylor',lastName:'Sample',headline:'Software Developer',
    summary:'I build Java and Python applications.',email:'taylor@example.test'};
  const result=await fillApplicationScope({root:form.root,profile,config:{},resumePath:''});
  assert.ok(result.fills>=5,JSON.stringify(result));
  assert.deepEqual(await page.locator('input[name="first-name"],input[name="last-name"]').evaluateAll(els=>els.map(e=>e.value)),['Taylor','Sample']);
  assert.equal(await page.locator('input[name="headline"]').inputValue(),'Software Developer');
  assert.equal(await page.locator('textarea[name="description"]').inputValue(),profile.summary);
});

browserTest('hidden résumé upload is verified without touching a cover letter or profile photo',async page=>{
  const base=path.dirname(fileURLToPath(import.meta.url));
  const resume=path.join(base,'../data','autofill-resume-fixture.pdf');
  fs.mkdirSync(path.dirname(resume),{recursive:true});
  fs.writeFileSync(resume,'%PDF-1.4\n%fake fixture\n%%EOF');
  try {
    await page.setContent('<form id="application-form"><label>First Name<input name="first-name" required></label>'+
      '<label>Email<input name="email" type="email" required></label>'+
      '<fieldset><legend>Attachments</legend>'+
      '<div class="resume-upload"><span>Upload Resume</span><input type="file" name="candidate_document" accept=".pdf" style="display:none"></div>'+
      '<div class="cover-letter-upload"><label>Cover Letter <input type="file" name="cover_letter" accept=".pdf"></label></div>'+
      '<div class="avatar-upload"><label>Profile Photo<input type="file" name="avatar" accept="image/*"></label></div>'+
      '</fieldset><button type="submit">Submit Application</button></form>');
    const root=(await findApplicationScope(page))?.root;
    assert.ok(root);
    const r=await fillApplicationScope({root,profile:{firstName:'Taylor',email:'taylor@example.test'},config:{},resumePath:resume});
    assert.equal(r.resumeInfo.verified,true,JSON.stringify(r));
    assert.equal((await inspectApplicationResume(root,resume)).resumeInfo.verified,true);
    const uploads=await page.locator('input[type=file]').evaluateAll(els=>els.map(e=>[...(e.files||[])].map(x=>x.name)));
    assert.equal(uploads[0].length,1);
    assert.deepEqual(uploads[1],[]);
    assert.deepEqual(uploads[2],[]);
  } finally {fs.rmSync(resume,{force:true});}
});

browserTest('apply redirect to a job-board profile editor is never counted as an application',async page=>{
  const {processJob}=await import('../src/apply.js');
  const os=await import('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'profile-redirect-'));
  const jobUrl='https://jobicy.com/jobs/101001-software-engineer';
  let current=jobUrl;
  const listing='<h1>Software Engineer</h1><p>Remote United States. Java Python React.</p>'+
    '<button onclick="openEditor()">Apply Now</button>';
  const editor='<h1>Edit your profile</h1><form id="edit_user"><label>First Name<input name="first_name"></label>'+
    '<label>Last Name<input name="last_name" required></label><label>Resume<input type="file" name="resume"></label>'+
    '<button>Update Profile</button></form>';
  await page.exposeFunction('openEditor',async()=>{
    current='https://jobicy.com/my-profile';
    await page.setContent(editor);
  });
  await page.setContent(listing);
  page.url=()=>current;
  page.goto=async()=>page.setContent(listing);
  const context=page.context();
  const originalNewPage=context.newPage.bind(context);
  context.newPage=async()=>page;
  let applicationStarts=0;
  try{
    const result=await processJob({
      context,job:{url:jobUrl,source:'jobicy'},
      config:{minFitScore:0,strictRemote:true,autoSubmit:true,preferredKeywords:['java','python']},
      profile:{firstName:'Taylor',lastName:'Sample',email:'taylor@example.test'},
      resumePath:'',outboxDir:path.join(dir,'outbox'),fitScore:0,
      ledgerFile:path.join(dir,'ledger.json'),onApplicationStarted:()=>{applicationStarts++;}
    });
    assert.equal(result.status,'skipped-not-application-form',JSON.stringify(result));
    assert.equal(result.applicationStarted,false);
    assert.equal(applicationStarts,0);
    assert.match(result.blocker,/profile editor/i);
  }finally{
    context.newPage=originalNewPage;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

browserTest('Askable-style Name field receives verified full name; privacy consent stays unchecked',async page=>{
  const {getRequiredBlockers}=await import('../src/forms.js');
  await page.setContent('<h1>Software Engineer Application</h1><form id="role-form">'+
    '<div class="f"><label for="name">Name</label><input name="name" id="name" type="text" required></div>'+
    '<div class="f"><label for="email">Email</label><input name="email" id="email" type="email" required></div>'+
    '<div class="f"><label for="phone">Phone, including country code</label><input name="phone" id="phone" type="tel" required></div>'+
    '<div class="f"><label for="consent">Askable can contact me about this role. I have read the privacy policy.</label>'+
    '<input type="checkbox" id="consent" required></div>'+
    '<button type="submit">Submit Application</button></form>');
  const form=await findApplicationScope(page);
  assert.ok(form);
  const candidate={firstName:'Taylor',lastName:'Sample',fullName:'Taylor Sample',
    email:'taylor@example.test',phone:'+1 555 555 0123'};
  const result=await fillApplicationScope({root:form.root,profile:candidate,config:{},resumePath:''});
  assert.ok(result.fills>=3,JSON.stringify(result));
  assert.equal(await page.locator('#name').inputValue(),'Taylor Sample');
  assert.equal(await page.locator('#email').inputValue(),'taylor@example.test');
  assert.equal(await page.locator('#phone').inputValue(),'+1 555 555 0123');
  assert.equal(await page.locator('#consent').isChecked(),false,'privacy policy consent must never be auto-accepted');
  assert.ok((await getRequiredBlockers(form.root)).some(x=>/checkbox|policy|consent/i.test(x)));
});

test('full-name semantics are strict and cannot overwrite third-party names',async()=>{
  const {answerForQuestion}=await import('../src/forms.js');
  const profile={firstName:'Taylor',lastName:'Sample',fullName:'Taylor Sample'};
  for(const label of ['Name','Name name','Name name name','Full Name','Applicant Name name'])
    assert.equal(answerForQuestion(label,'text',profile,{}),'Taylor Sample',label);
  for(const label of ['Current company name','Referrer name','Emergency contact name',
    'Supervisor Name','Reference full name','Hiring manager name'])
    assert.equal(answerForQuestion(label,'text',profile,{}),'',label);
});

browserTest('late Jobicy profile redirect after initial application form is detected does not consume quota',async page=>{
  const {processJob}=await import('../src/apply.js');
  const os=await import('node:os');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'late-profile-redirect-'));
  const jobUrl='https://jobicy.com/jobs/101002-full-stack-software-engineer';
  let current=jobUrl;
  const listing='<h1>Full Stack Software Engineer</h1><p>Remote United States Java Python React.</p>'+
    '<button onclick="openApplication()">Apply Now</button>';
  const initialForm='<h1>Employer Application</h1><form id="application-form">'+
    '<label>First Name<input name="first_name" required></label>'+
    '<label>Last Name<input name="last_name" required></label>'+
    '<label>Email<input name="email" type="email" required></label>'+
    '<button type="submit">Submit Application</button></form>';
  const profileEditor='<h1>Edit your profile</h1><form id="edit_user">'+
    '<label>Last Name<input name="last-name" required></label>'+
    '<label>Professional Headline<input name="headline" required></label>'+
    '<label>About me<textarea required></textarea></label>'+
    '<button>Update Profile</button></form>';
  await page.exposeFunction('openApplication',async()=>{
    await page.setContent(initialForm);
    // First normal apply-form detection happens roughly 1.8s after clicking.
    // Simulate a late job-board navigation before AutoJob may fill or count.
    setTimeout(async()=>{
      current='https://jobicy.com/my-profile';
      await page.setContent(profileEditor).catch(()=>{});
    },2200);
  });
  page.url=()=>current;
  page.goto=async()=>page.setContent(listing);
  const context=page.context();
  const originalNewPage=context.newPage.bind(context);
  context.newPage=async()=>page;
  let starts=0;
  try {
    const result=await processJob({context,job:{url:jobUrl,source:'jobicy'},
      config:{minFitScore:0,strictRemote:true,autoSubmit:true,preferredKeywords:['java','python']},
      profile:{firstName:'Taylor',lastName:'Sample',email:'taylor@example.test'},
      resumePath:'',outboxDir:path.join(folder,'outbox'),fitScore:0,
      ledgerFile:path.join(folder,'ledger.json'),onApplicationStarted:()=>{starts++;}
    });
    assert.equal(result.status,'skipped-not-application-form',JSON.stringify(result));
    assert.equal(result.applicationStarted,false);
    assert.equal(starts,0,'a late profile redirect must not use the application quota');
  }finally{
    context.newPage=originalNewPage;
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
