import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findApplicationScope,fillApplicationScope,getRequiredBlockers} from '../src/forms.js';

const profile={firstName:'Taylor',lastName:'Sample',fullName:'Taylor Sample',email:'taylor@example.test',phone:'5551231234',city:'Example City',state:'CA',country:'United States',
  workAuthorization:'Yes — U.S. citizen',requiresSponsorship:'No',applicationAnswers:{}};
const config={strictRemote:true};

async function withBrowser(html,run) {
  const {chromium}=await import('playwright-core');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'advanced-autofill-'));
  const resumePath=path.join(tmp,'Resume.pdf');fs.writeFileSync(resumePath,'%PDF-1.4\nsynthetic test fixture\n%%EOF');
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    const page=await browser.newPage();
    await page.setContent(html);
    const root=page.locator('form');
    await run({page,root,resumePath});
  }finally{await browser?.close();fs.rmSync(tmp,{recursive:true,force:true});}
}

test('portal-based combo and custom ARIA radio get factual answers, résumé attached and no blockers',{skip:process.env.RUN_BROWSER_TESTS!=='1'}, async()=>{
  const html=`<html><body><h1>Remote Software Engineer</h1>
  <form id="application-form"><label>First name <input name="first_name" required></label>
    <label>Last name <input name="last_name" required></label>
    <label>Email address <input name="email" type="email" required></label>
    <label>Phone <input name="phone" required></label>
    <label>Resume <input name="resume" type="file" required></label>
    <fieldset><legend>Country</legend><button type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-required="true" id="country" onclick="openOptions()">Select country</button></fieldset>
    <fieldset><legend>Will you now or in the future require visa sponsorship?</legend><div role="radiogroup" aria-required="true" aria-label="Will you now or in the future require visa sponsorship?">
      <button type="button" role="radio" aria-checked="false" onclick="check(this)">Yes</button>
      <button type="button" role="radio" aria-checked="false" onclick="check(this)">No</button>
    </div></fieldset>
    <button type="button">Submit Application</button>
  </form>
  <script>function openOptions(){if(document.querySelector('[role=listbox]'))return; const ul=document.createElement('div');ul.setAttribute('role','listbox');ul.innerHTML='<button role="option" onclick="countryChoice(this)">Canada</button><button role="option" onclick="countryChoice(this)">United States</button>';document.body.append(ul)}
  function countryChoice(e){const btn=document.querySelector('#country');btn.textContent=e.textContent;btn.setAttribute('data-value',e.textContent);document.querySelector('[role=listbox]').remove()}
  function check(e){for(const x of document.querySelectorAll('[role=radio]'))x.setAttribute('aria-checked',String(x===e))}</script></body></html>`;
  await withBrowser(html,async({page,root,resumePath})=>{
    const scope=await findApplicationScope(page);assert.ok(scope);
    const done=await fillApplicationScope({root,profile,config,resumePath});
    assert.equal(done.resumeInfo.verified,true);
    assert.equal(await page.locator('#country').getAttribute('data-value'),'United States');
    assert.equal(await page.getByRole('radio',{name:'No'}).getAttribute('aria-checked'),'true');
    assert.deepEqual(await getRequiredBlockers(root),[]);
    const second=await fillApplicationScope({root,profile,config,resumePath});
    assert.equal(second.fills,0,'an already completed form should not be refilled');
  });
});

test('unknown required custom question blocks, never guessed',{skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
  await withBrowser(`<html><body><form><label>Email <input type="email" required></label>
  <fieldset><legend>Do you hold a secret security clearance?</legend><button role="combobox" aria-haspopup="listbox" aria-required="true">Choose one</button></fieldset>
  <button>Submit Application</button></form></body></html>`,async({root,resumePath})=>{
    await fillApplicationScope({root,profile,config,resumePath});
    const blockers=await getRequiredBlockers(root);
    assert.ok(blockers.some(x=>x.includes('Dropdown')),JSON.stringify(blockers));
  });
});
