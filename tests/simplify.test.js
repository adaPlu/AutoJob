import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifySettings,trySimplifyAutofill } from '../src/simplify-copilot.js';

test('Simplify settings are safely opt-in, with native fallback',()=>{
 assert.equal(simplifySettings({}).enabled,false);
 assert.equal(simplifySettings({simplifyCopilot:{enabled:true}}).fallbackToBuiltIn,true);
 assert.equal(simplifySettings({simplifyCopilot:{enabled:true,waitAfterClickMs:99999}}).waitAfterClickMs,10000);
});

test('does not click anything when disabled',async()=>{
 const r=await trySimplifyAutofill(null,{});
 assert.deepEqual(r,{status:'disabled',clicked:false});
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
