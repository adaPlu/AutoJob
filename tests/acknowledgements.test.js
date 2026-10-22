import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgementSettings,handleSiteAcknowledgements} from '../src/acknowledgements.js';

const chromeTest={skip:process.env.RUN_BROWSER_TESTS!=='1'};
async function browserCase(html,runner){
  const {chromium}=await import('playwright-core');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try {const page=await browser.newPage();await page.setContent(html);await runner(page);} finally {await browser.close();}
}

test('acknowledgement config default and option override',()=>{
 assert.equal(acknowledgementSettings({}).cookiePreference,'accept-all');
 assert.equal(acknowledgementSettings({siteAcknowledgements:{cookiePreference:'essential-only'}}).cookiePreference,'essential-only');
 assert.equal(acknowledgementSettings({siteAcknowledgements:{maxActions:100}}).maxActions,15);
});

test('accept cookie banner but never click unrelated application accept button',chromeTest,async()=>{
 await browserCase(`<div id="cookie-banner" role="dialog" aria-label="Cookie banner"><p>We use cookies to improve this site.</p><button onclick="this.closest('#cookie-banner').remove()">Accept all cookies</button></div>
 <form><p>Employment terms of service</p><label><input id="legal" type="checkbox" required> I agree to employment terms and conditions</label><button type="button" id="accept-job" onclick="window.jobAccepted=true">Accept</button></form>`,async(page)=>{
  const r=await handleSiteAcknowledgements(page,{});
  assert.equal(r.cookieBannersAccepted,1);
  assert.equal(await page.locator('#cookie-banner').count(),0);
  assert.equal(await page.locator('#legal').isChecked(),false);
  assert.equal(await page.evaluate(()=>!!window.jobAccepted),false);
 });
});

test('never accept employment offer dialog or required legal certification',chromeTest,async()=>{
 await browserCase(`<section role="dialog"><h2>Employment Agreement</h2><p>By continuing you accept the terms of employment.</p><button onclick="window.agreed=true">I agree</button></section>
 <form><label> I certify all application information is accurate <input type="checkbox" required></label></form>`,async(page)=>{
  const r=await handleSiteAcknowledgements(page,{});
  assert.equal(r.cookieBannersAccepted,0);assert.equal(r.noticesDismissed,0);
  assert.equal(await page.evaluate(()=>!!window.agreed),false);
  assert.equal(await page.locator('input').isChecked(),false);
 });
});

test('informational welcome popup is dismissed',chromeTest,async()=>{
 await browserCase(`<div role="dialog"><p>Welcome! Quick tip: you can search all available jobs.</p><button onclick="this.parentNode.remove()">Got it</button></div>`,async(page)=>{
  const r=await handleSiteAcknowledgements(page,{});
  assert.equal(r.noticesDismissed,1);assert.equal(await page.locator('[role=dialog]').count(),0);
 });
});

test('cookie choice can prefer essentials over accept all',chromeTest,async()=>{
 await browserCase(`<div id="cookie-banner"><p>Cookie preferences: we use cookies.</p><button id="allow" onclick="window.cookieChoice='all';this.parentNode.remove()">Accept all</button><button id="essential" onclick="window.cookieChoice='essential';this.parentNode.remove()">Reject all</button></div>`,async(page)=>{
  const r=await handleSiteAcknowledgements(page,{siteAcknowledgements:{cookiePreference:'essential-only'}});
  assert.equal(r.cookieBannersAccepted,1);
  assert.equal(await page.evaluate(()=>window.cookieChoice),'essential');
 });
});

test('handles cookie banners inside embedded iframe',chromeTest,async()=>{
 await browserCase(`<iframe id="cmp" srcdoc='<div id="cookie-banner"><p>Our website uses cookies.</p><button onclick="this.parentElement.remove()">Accept all cookies</button></div>'></iframe>`,async(page)=>{
  const frame=page.frameLocator('#cmp');
  await frame.locator('#cookie-banner').waitFor();
  const r=await handleSiteAcknowledgements(page,{});
  assert.equal(r.cookieBannersAccepted,1);
  assert.equal(await frame.locator('#cookie-banner').count(),0);
 });
});

test('no generic click when banner absent',chromeTest,async()=>{
 await browserCase(`<form><button onclick="window.clicked=true">I agree</button></form>`,async(page)=>{
  const r=await handleSiteAcknowledgements(page,{});
  assert.equal(r.cookieBannersAccepted,0);
  assert.equal(await page.evaluate(()=>!!window.clicked),false);
 });
});
