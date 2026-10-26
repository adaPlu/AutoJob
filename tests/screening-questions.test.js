// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {exactScreeningChoices,fillExplicitScreeningChoices,collectScreeningReview} from '../src/screening-questions.js';
import {getRequiredBlockers} from '../src/forms.js';

test('only exact known prompts and allowed answers qualify for screening autofill',()=>{
  const facts={
    'Which industries have you worked in?':['Fintech B2B','SaaS B2B'],
    'What size company have you worked for?':'10–100 employees',
    'I agree to the terms':'Yes'
  };
  assert.deepEqual(exactScreeningChoices('Which industries have you worked in?',facts),['Fintech B2B','SaaS B2B']);
  assert.deepEqual(exactScreeningChoices('What size company have you worked for?',facts),['10–100 employees']);
  assert.deepEqual(exactScreeningChoices('Which industries have you applied to?',facts),[]);
  assert.deepEqual(exactScreeningChoices('I agree to the terms',facts),[]);
});

test('groups use exact industry and size selections, leave unverified screening unanswered',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const {chromium}=await import('playwright-core');
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    try {
      const page=await browser.newPage();
      await page.setContent(`<form id="application-form">
        <fieldset><legend>Which industries have you worked in?</legend>
          <label><input type="checkbox" name="industries" value="SaaS B2B">SaaS B2B</label>
          <label><input type="checkbox" name="industries" value="Fintech B2B">Fintech B2B</label>
          <label><input type="checkbox" name="industries" value="Ecommerce">Ecommerce</label>
        </fieldset>
        <fieldset><legend>What size company have you worked for?</legend>
          <label><input type="radio" name="size" value="10–100 employees">10–100 employees</label>
          <label><input type="radio" name="size" value="1000+ employees">1000+ employees</label>
        </fieldset>
        <fieldset><legend>Who referred you?</legend>
          <label><input type="radio" name="referrer" value="A colleague">A colleague</label>
          <label><input type="radio" name="referrer" value="No one">No one</label>
        </fieldset>
        <fieldset><legend>I agree to the terms</legend>
          <label><input type="checkbox" name="terms">Accept terms</label>
        </fieldset>
      </form>`);
      const root=page.locator('form');
      const answers={
        'Which industries have you worked in?':['SaaS B2B','Fintech B2B'],
        'What size company have you worked for?':'10–100 employees',
        'I agree to the terms':'Accept terms'
      };
      const changed=await fillExplicitScreeningChoices(root,answers);
      assert.equal(changed,3);
      const data=await page.locator('input:checked').evaluateAll(els=>els.map(e=>e.value));
      assert.deepEqual(data.sort(),['10–100 employees','Fintech B2B','SaaS B2B'].sort());
      const review=await collectScreeningReview(root);
      assert.equal(review.length,4);
      assert.equal(review.find(x=>x.question==='Who referred you?')?.answered,false);
      assert.equal(review.find(x=>x.question==='Which industries have you worked in?')?.answered,true);
      assert.ok(review.find(x=>x.question==='Which industries have you worked in?')?.options.includes('Ecommerce'));
      assert.equal(await fillExplicitScreeningChoices(root,answers),0,'do not alter already selected options');
    } finally {await browser.close();}
  });

test('saved Termgrid-style question wrapper is understood without guessing answers',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const {chromium}=await import('playwright-core');
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    try{
      const page=await browser.newPage();
      await page.setContent(`<form id="application-form"><ol>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-select">Which industry did your last organizations belong to?✱</div>
          <div class="application-field full-width required-field"><ul>
            <li><label><input type="checkbox" name="industry[]" value="Ecommerce">Ecommerce</label></li>
            <li><label><input type="checkbox" name="industry[]" value="SaaS B2B">SaaS B2B</label></li>
            <li><label><input type="checkbox" name="industry[]" value="Fintech B2B">Fintech B2B</label></li>
          </ul></div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">What is the size of your latest organization?✱</div>
          <div class="application-field full-width required-field"><ul>
            <li><label><input type="radio" name="size" value="10–100 employees">10–100 employees</label></li>
            <li><label><input type="radio" name="size" value="1000+ employees">1000+ employees</label></li>
          </ul></div>
        </li></ol></form>`);
      const root=page.locator('form');
      const questions=await collectScreeningReview(root);
      assert.equal(questions.length,2);
      assert.equal(questions[0].options.length,3);
      assert.equal(questions[1].options.length,2);
      const answers={
        'Which industry did your last organizations belong to?':['SaaS B2B','Fintech B2B'],
        'What is the size of your latest organization?':'10–100 employees'
      };
      assert.equal(await fillExplicitScreeningChoices(root,answers),3);
      assert.equal(await root.locator('input:checked').count(),3);
      assert.equal(await root.locator('input[value="Ecommerce"]').isChecked(),false);
    }finally{await browser.close();}
  });

test('repeated required checkbox choices become one actionable review question, not many misleading labels',
  {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
    const {chromium}=await import('playwright-core');
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    try{
      const page=await browser.newPage();
      await page.setContent(`<form id="application-form"><li class="application-question custom-question">
      <div class="application-label">Which industry did your last organizations belong to?✱</div>
      <div class="application-field"><ul>
      <li><label><input type="checkbox" name="industry[]" required>Ecommerce</label></li>
      <li><label><input type="checkbox" name="industry[]" required>Fintech B2B</label></li>
      <li><label><input type="checkbox" name="industry[]" required>SaaS B2B</label></li>
      </ul></div></li></form>`);
      const blockers=await getRequiredBlockers(page.locator('form'));
      assert.equal(blockers.length,1,JSON.stringify(blockers));
      assert.match(blockers[0],/Unanswered checkbox group: Which industry/);
    }finally{await browser.close();}
  });
