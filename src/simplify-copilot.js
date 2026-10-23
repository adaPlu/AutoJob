// SPDX-License-Identifier: MIT
// UI-only integration with the Simplify Copilot browser extension.
// Uses the public in-page "Autofill This Page" control when it is exposed to
// browser accessibility selectors. Never accesses internal Simplify APIs.
// If the extension is absent/inaccessible, the native ATS filler runs instead.

const AUTO_NAME = /^(?:autofill this page|auto[ -]?fill this page)$/i;
const TAB_NAME = /^(?:simplify|simplify copilot|open simplify(?: copilot)?)$/i;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const isVisible = async el => !!(await el.isVisible().catch(()=>false));

export function simplifySettings(config={}) {
  const cfg = config.simplifyCopilot || {};
  return {enabled:cfg.enabled === true,tryAutofillButton:cfg.tryAutofillButton !== false,
    openPanelIfVisible:cfg.openPanelIfVisible !== false,
    fallbackToBuiltIn:cfg.fallbackToBuiltIn !== false,
    waitAfterClickMs:Math.min(10000,Math.max(500,Number(cfg.waitAfterClickMs)||2800))};
}

async function findVisibleButton(page) {
  // Each iframe is treated separately; Playwright can see open shadow DOM,
  // but closed extension shadow roots/toolbar popups cannot be automated.
  for (const frame of page.frames()) {
    const candidate=frame.getByRole('button',{name:AUTO_NAME}).first();
    if(await isVisible(candidate) && await candidate.isEnabled().catch(()=>false)) return candidate;
    const exactText=frame.getByText(AUTO_NAME,{exact:true}).first();
    if(await isVisible(exactText)) {
      const tag=await exactText.evaluate(el=>el.tagName?.toLowerCase()).catch(()=>'');
      if(['button'].includes(tag))return exactText;
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

export async function trySimplifyAutofill(page,config={}, {sleep=pause}={}) {
  const settings=simplifySettings(config);
  if(!settings.enabled)return {status:'disabled',clicked:false};
  if(!settings.tryAutofillButton)return {status:'manual-only',clicked:false};
  if(!page || page.isClosed())return {status:'page-unavailable',clicked:false};
  let button=await findVisibleButton(page);
  if(!button && settings.openPanelIfVisible){
    await openSidePanel(page);
    button=await findVisibleButton(page);
  }
  if(!button)return {status:'not-visible',clicked:false};
  try {
    await button.click({timeout:5000});
    await sleep(settings.waitAfterClickMs);
    return {status:'clicked-autofill',clicked:true};
  }catch(error){
    return {status:'click-failed',clicked:false,reason:String(error?.message||error).slice(0,160)};
  }
}
