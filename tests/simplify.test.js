// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifySettings,trySimplifyAutofill,trySimplifyStartApplicationOnPages } from '../src/simplify-copilot.js';

test('Simplify settings are safely opt-in, with native fallback',()=>{
 assert.equal(simplifySettings({}).enabled,false);
 const enabled=simplifySettings({simplifyCopilot:{enabled:true}});
 assert.equal(enabled.fallbackToBuiltIn,true);
 assert.equal(enabled.tryStartApplicationButton,true);
 assert.equal(simplifySettings({simplifyCopilot:{enabled:true,waitAfterStartMs:99999}}).waitAfterStartMs,10000);
 assert.equal(simplifySettings({simplifyCopilot:{enabled:true,waitAfterClickMs:99999}}).waitAfterClickMs,10000);
});

test('does not click anything when disabled',async()=>{
 const r=await trySimplifyAutofill(null,{});
 assert.deepEqual(r,{status:'disabled',clicked:false});
});

test('Simplify Start Application is clicked in every window, never the employer button',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
   const pages=await Promise.all([browser.newPage(),browser.newPage()]);
   for(const [index,page] of pages.entries()) {
     await page.setContent(`<main><button type="button" onclick="window.employerStart=true">Start Application</button></main>
       <section aria-label="Simplify Copilot"><button type="button"
       onclick="window.simplifyStart=true;this.remove()">Start Application</button></section>
       <p>Window ${index+1}</p>`);
   }
   const r=await trySimplifyStartApplicationOnPages(pages,{simplifyCopilot:{enabled:true,waitAfterStartMs:500}});
   assert.equal(r.clicked,2);
   for(const page of pages) {
     assert.equal(await page.evaluate(()=>window.simplifyStart),true);
     assert.notEqual(await page.evaluate(()=>window.employerStart),true);
   }
 }finally{await browser.close();}
});

test('Simplify Start Application runs before its Autofill control',
 {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
   const page=await browser.newPage();
   await page.setContent(`<form><label>Email<input name="email" required></label>
     <button type="submit" onclick="event.preventDefault();window.submitted=true">Submit Application</button></form>
     <section id="simplify" aria-label="Simplify Copilot"><button type="button" onclick="
       window.simplifyStart=true;this.remove();
       const button=document.createElement('button');button.type='button';button.textContent='Autofill This Page';
       button.onclick=()=>{document.querySelector('[name=email]').value='test@example.com';window.simplifyAutofill=true};
       document.querySelector('#simplify').append(button)">Start Application</button></section>`);
   const r=await trySimplifyAutofill(page,{simplifyCopilot:{enabled:true,waitAfterStartMs:500,waitAfterClickMs:500}});
   assert.equal(r.status,'clicked-autofill');
   assert.equal(r.startApplicationClicked,true);
   assert.equal(await page.evaluate(()=>window.simplifyStart),true);
   assert.equal(await page.evaluate(()=>window.simplifyAutofill),true);
   assert.equal(await page.locator('[name=email]').inputValue(),'test@example.com');
   assert.notEqual(await page.evaluate(()=>window.submitted),true);
 }finally{await browser.close();}
});

test('visible official Copilot autofill button is clicked; no submit', {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
   const page=await browser.newPage();
   await page.setContent(`<main><form><label>Email<input name="email" required></label><button type="submit" onclick="event.preventDefault();window.submitted=true">Submit Application</button></form></main><section aria-label="Simplify Copilot"><button type="button" onclick="document.querySelector('input[name=email]').value='test@example.com'; window.simplifyWasClicked=true">Autofill This Page</button></section>`);
   const r=await trySimplifyAutofill(page,{simplifyCopilot:{enabled:true,waitAfterClickMs:500}});
   assert.equal(r.status,'clicked-autofill');
   assert.equal(await page.evaluate(()=>window.simplifyWasClicked),true);
   assert.equal(await page.locator('input[name=email]').inputValue(),'test@example.com');
   assert.notEqual(await page.evaluate(()=>window.submitted),true);
 }finally{await browser.close();}
});

test('falls back if extension button is invisible', {skip:process.env.RUN_BROWSER_TESTS!=='1'},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
   const page=await browser.newPage();
   await page.setContent('<form><label>Email<input type="email" /></label></form>');
   const r=await trySimplifyAutofill(page,{simplifyCopilot:{enabled:true,waitAfterClickMs:500}});
   assert.equal(r.status,'not-visible');
 }finally{await browser.close();}
});
