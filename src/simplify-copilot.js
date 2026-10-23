// SPDX-License-Identifier: MIT
// UI-only integration with the Simplify Copilot browser extension.
// Uses the public in-page "Start Application" and "Autofill This Page"
// controls when they are exposed to browser accessibility selectors.
// Never accesses internal Simplify APIs. If the extension is absent or
// inaccessible, the native ATS filler runs instead.

const AUTO_NAME = /^(?:autofill this page|auto[ -]?fill this page)$/i;
const START_NAME = /^(?:start|begin)(?: your| my| the)? application$/i;
const TAB_NAME = /^(?:simplify|simplify copilot|open simplify(?: copilot)?)$/i;
const SIMPLIFY_NAME = /simplify(?: copilot)?/i;
const SIMPLIFY_SCOPE_SELECTOR = [
  'section[aria-label*="Simplify" i]',
  'aside[aria-label*="Simplify" i]',
  '[role="dialog"][aria-label*="Simplify" i]',
  '[role="region"][aria-label*="Simplify" i]',
  '[data-testid*="simplify" i]',
  '[id*="simplify" i]',
  '[class~="simplify" i]',
  '[class*="simplify-copilot" i]',
  '[data-simplify]'
].join(',');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const isVisible = async el => !!(await el.isVisible().catch(()=>false));
const isEnabledVisible = async el => (await isVisible(el)) && !!(await el.isEnabled().catch(()=>false));

export function simplifySettings(config={}) {
  const cfg = config.simplifyCopilot || {};
  return {enabled:cfg.enabled === true,
    tryStartApplicationButton:cfg.tryStartApplicationButton !== false,
    tryAutofillButton:cfg.tryAutofillButton !== false,
    openPanelIfVisible:cfg.openPanelIfVisible !== false,
    fallbackToBuiltIn:cfg.fallbackToBuiltIn !== false,
    waitAfterStartMs:Math.min(10000,Math.max(500,Number(cfg.waitAfterStartMs)||1200)),
    waitAfterClickMs:Math.min(10000,Math.max(500,Number(cfg.waitAfterClickMs)||2800))};
}

async function visibleButton(root,name) {
  const candidate=root.getByRole('button',{name}).first();
  if(await isEnabledVisible(candidate))return candidate;
  const exactText=root.getByText(name,{exact:true}).first();
  if(await isEnabledVisible(exactText)) {
    const tag=await exactText.evaluate(el=>el.tagName?.toLowerCase()).catch(()=>'');
    if(tag==='button')return exactText;
  }
  return null;
}

async function findVisibleAutofillButton(page) {
  // Each iframe is treated separately; Playwright can see open shadow DOM,
  // but closed extension shadow roots/toolbar popups cannot be automated.
  for (const frame of page.frames()) {
    const candidate=await visibleButton(frame,AUTO_NAME);
    if(candidate)return candidate;
  }
  return null;
}

function isExtensionFrame(frame,page) {
  if(frame===page.mainFrame())return false;
  const url=frame.url();
  return /^(?:chrome|moz)-extension:\/\//i.test(url) || /simplify/i.test(url);
}

async function findVisibleStartButton(page) {
  for(const frame of page.frames()) {
    // It is safe to search an extension-owned frame directly. On the employer
    // page, "Start Application" is only accepted inside identifiable Simplify UI.
    if(isExtensionFrame(frame,page)) {
      const extensionButton=await visibleButton(frame,START_NAME);
      if(extensionButton)return extensionButton;
    }
    const scopes=[
      frame.getByRole('region',{name:SIMPLIFY_NAME}).first(),
      frame.getByRole('complementary',{name:SIMPLIFY_NAME}).first(),
      frame.getByRole('dialog',{name:SIMPLIFY_NAME}).first(),
      frame.locator(SIMPLIFY_SCOPE_SELECTOR).first()
    ];
    for(const scope of scopes) {
      if(!(await scope.count().catch(()=>0)))continue;
      const candidate=await visibleButton(scope,START_NAME);
      if(candidate)return candidate;
    }
  }
  return null;
}

async function openSidePanel(page) {
  for(const frame of page.frames()) {
    const probes=[
      frame.getByRole('button',{name:TAB_NAME}).first(),
      frame.getByRole('tab',{name:TAB_NAME}).first(),
      frame.locator('[aria-label="Simplify Copilot"],[title="Simplify Copilot"],[aria-label="Simplify"],[title="Simplify"]').first()
    ];
    for(const probe of probes) {
      if(!await isVisible(probe))continue;
      try {await probe.click({timeout:1500});await pause(450);return true;}catch{}
    }
  }
  return false;
}

export async function trySimplifyStartApplication(page,config={}, {sleep=pause}={}) {
  const settings=simplifySettings(config);
  if(!settings.enabled)return {status:'disabled',clicked:false};
  if(!settings.tryStartApplicationButton)return {status:'manual-only',clicked:false};
  if(!page || page.isClosed())return {status:'page-unavailable',clicked:false};
  let button=await findVisibleStartButton(page);
  if(!button && settings.openPanelIfVisible) {
    await openSidePanel(page);
    button=await findVisibleStartButton(page);
  }
  if(!button)return {status:'not-visible',clicked:false};
  try {
    await button.click({timeout:5000});
    await sleep(settings.waitAfterStartMs);
    return {status:'clicked-start-application',clicked:true};
  } catch(error) {
    return {status:'click-failed',clicked:false,reason:String(error?.message||error).slice(0,160)};
  }
}

export async function trySimplifyStartApplicationOnPages(pages,config={},options={}) {
  const results=[];
  for(const page of pages || []) {
    if(!page || page.isClosed())continue;
    const outcome=await trySimplifyStartApplication(page,config,options);
    results.push({page,...outcome});
  }
  return {clicked:results.filter(result=>result.clicked).length,results};
}

export async function trySimplifyAutofill(page,config={}, {sleep=pause,tryStartApplication=true}={}) {
  const settings=simplifySettings(config);
  if(!settings.enabled)return {status:'disabled',clicked:false};
  if(!page || page.isClosed())return {status:'page-unavailable',clicked:false};

  const start=tryStartApplication
    ? await trySimplifyStartApplication(page,config,{sleep})
    : {status:'skipped',clicked:false};

  if(!settings.tryAutofillButton) {
    return start.clicked
      ? {status:'clicked-start-application',clicked:false,startApplicationClicked:true}
      : {status:'manual-only',clicked:false};
  }

  let button=await findVisibleAutofillButton(page);
  if(!button && settings.openPanelIfVisible){
    await openSidePanel(page);
    button=await findVisibleAutofillButton(page);
  }
  if(!button) {
    return start.clicked
      ? {status:'clicked-start-application',clicked:false,startApplicationClicked:true}
      : {status:'not-visible',clicked:false};
  }
  try {
    await button.click({timeout:5000});
    await sleep(settings.waitAfterClickMs);
    return {status:'clicked-autofill',clicked:true,startApplicationClicked:!!start.clicked};
  }catch(error){
    return {status:'click-failed',clicked:false,startApplicationClicked:!!start.clicked,
      reason:String(error?.message||error).slice(0,160)};
  }
}
