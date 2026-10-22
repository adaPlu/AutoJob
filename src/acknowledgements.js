// Browser-visible consent banners and informational notices. No privileged APIs.
// Only click inside a verified banner/dialog; NEVER accept employment terms,
// attestations, legal disclosures, assessments, or verification challenges.
const COOKIE_TEXT = /\b(?:cookies?|cookie preferences?|consent preferences?|tracking technologies|privacy choices|website uses cookies|use cookies|cookie policy)\b/i;
const COOKIE_HOSTS = [
  '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#CybotCookiebotDialog',
  '#cookie-law-info-bar', '#cookie-banner', '#cookie-notice', '#cookieConsent',
  '#didomi-host', '#usercentrics-root', '.qc-cmp2-container',
  '[data-testid*="cookie" i]', '[id*="cookie-banner" i]', '[class*="cookie-banner" i]',
  '[id*="cookie-consent" i]', '[class*="cookie-consent" i]',
  '[aria-label*="cookie" i]', '[role="dialog"]', '[role="alertdialog"]',
  '[role="region"]', '[role="alert"]'
];
const ACK_HOSTS = [
  '[role="dialog"]', '[role="alertdialog"]', '[role="alert"]',
  '[data-testid*="notification" i]', '[data-testid*="notice" i]',
  '[class*="notification-banner" i]', '[class*="announcement" i]'
];
const LEGAL_TEXT = /\b(?:terms (?:and conditions|of (?:service|employment|use))|employment agreement|legal agreement|certif(?:y|ication)|authorize|authorization|background check|drug (?:screen|test)|arbitration|binding|signature|accuracy of (?:my|this) (?:application|information)|I agree to|I certify|I attest|eligibility verification|criminal history|offer of employment|waiv(?:e|er))\b/i;
const VERIFICATION_TEXT = /\b(?:captcha|recaptcha|verify (?:you are human|your identity)|two.factor|one.time (?:passcode|code)|security challenge)\b/i;
const COOKIE_ACCEPT = [/^accept all(?: cookies)?$/i,/^allow all(?: cookies)?$/i,/^accept(?: all)? cookies$/i,/^i accept(?: all)?$/i,/^accept$/i,/^agree(?: and close)?$/i,/^i agree$/i,/^yes,? i agree$/i,/^allow cookies$/i,/^got it$/i];
const COOKIE_ESSENTIAL = [/^(?:reject all|decline all|only necessary|essential only|necessary only|use necessary cookies|reject optional cookies|continue without accepting)$/i];
const ACK_CLOSE = [/^(?:got it|ok(?:ay)?|understood|dismiss|close|not now|continue browsing|acknowledged)$/i];
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const clean = text => String(text||'').replace(/\s+/g,' ').trim();

export function acknowledgementSettings(config={}) {
  const c=config.siteAcknowledgements||{};
  const cookiePreference=['accept-all','essential-only','manual'].includes(c.cookiePreference) ? c.cookiePreference : 'accept-all';
  return {enabled:c.enabled!==false,cookiePreference,dismissInformationalNotices:c.dismissInformationalNotices!==false,maxActions:Math.max(1,Math.min(15,Number(c.maxActions)||8))};
}

function isCookieBanner(text) {return COOKIE_TEXT.test(clean(text));}
function isSafeInfoNotice(text) {
  const s=clean(text);
  // Require a recognizable harmless information-only topic, not just a generic dialog.
  return /\b(?:welcome|quick tip|new feature|site announcement|we updated our website|notification preferences|tour of (?:the|our) (?:website|site)|thanks for visiting|browser notification)\b/i.test(s)
    && !LEGAL_TEXT.test(s) && !VERIFICATION_TEXT.test(s) && !COOKIE_TEXT.test(s);
}

async function tryButtons(host, patterns) {
  for(const re of patterns) {
    for(const role of ['button','link']) {
      const buttons=host.getByRole(role,{name:re,exact:true});
      for(let i=0,n=Math.min(15,await buttons.count().catch(()=>0));i<n;i++) {
        const button=buttons.nth(i);
        if(!await button.isVisible().catch(()=>false) || !await button.isEnabled().catch(()=>false))continue;
        try {const label=clean(await button.innerText({timeout:1000}).catch(()=>'')) || String(re);
          await button.click({timeout:2300});return {clicked:true,label};}catch{}
      }
    }
  }
  return {clicked:false};
}

async function searchBanners(frame, selectors, kind, settings) {
  for(const selector of selectors) {
    const elements=frame.locator(selector);
    for(let i=0,n=Math.min(16,await elements.count().catch(()=>0));i<n;i++) {
      const host=elements.nth(i);
      if(!await host.isVisible().catch(()=>false))continue;
      const text=clean(await host.innerText({timeout:1300}).catch(()=>''));
      if(!text || text.length>4500 || VERIFICATION_TEXT.test(text))continue;
      if(kind==='cookies') {
        if(!isCookieBanner(text) || settings.cookiePreference==='manual')continue;
        // Important: never click page-wide 'Accept' buttons, only within a matched cookie container.
        const outcome=await tryButtons(host,settings.cookiePreference==='essential-only' ? COOKIE_ESSENTIAL : COOKIE_ACCEPT);
        if(outcome.clicked)return {kind:'cookie',label:outcome.label};
      } else {
        if(!settings.dismissInformationalNotices || !isSafeInfoNotice(text))continue;
        const outcome=await tryButtons(host,ACK_CLOSE);
        if(outcome.clicked)return {kind:'notice',label:outcome.label};
      }
    }
  }
  return null;
}

// Handles cross-origin iframes via Playwright's public Frame API and open shadow DOM
// via native locators. Closed extension shadow roots and OS dialogs are not accessible.
export async function handleSiteAcknowledgements(page,config={}, {sleep=wait}={}) {
  const settings=acknowledgementSettings(config);
  const result={cookieBannersAccepted:0,noticesDismissed:0,actions:[]};
  if(!settings.enabled || !page || page.isClosed() || typeof page.frames !== 'function')return result;
  for(let action=0;action<settings.maxActions;action++) {
    let clicked=null;
    for(const frame of page.frames()) {
      try{
        clicked=await searchBanners(frame,COOKIE_HOSTS,'cookies',settings);
        if(!clicked)clicked=await searchBanners(frame,ACK_HOSTS,'notice',settings);
        if(clicked)break;
      }catch{/* a frame may navigate or detach during banner processing */}
    }
    if(!clicked)break;
    if(clicked.kind==='cookie')result.cookieBannersAccepted++;
    else result.noticesDismissed++;
    result.actions.push({kind:clicked.kind,label:clicked.label});
    await sleep(150);
  }
  return result;
}
