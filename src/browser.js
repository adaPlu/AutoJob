// SPDX-License-Identifier: MIT
import { chromium } from 'playwright-core';

export async function connectChrome(cdpUrl) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No Chrome context found. Start Chrome with remote debugging enabled.');
  const context = contexts[0];
  return { browser, context };
}

export async function newTab(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return page;
}

export class ChromeTabUnavailableError extends Error {
  constructor(cause) {
    super('Chrome cannot open a search tab. Close excess tabs in the dedicated AutoJob Chrome window, restart that Chrome profile with START_CHROME.bat if needed, and rerun. No job search or submission started.', {cause});
    this.name='ChromeTabUnavailableError';
  }
}

// Never close unrelated/user-owned browser tabs to recover from resource exhaustion.
export async function openSearchTab(context,{maxAttempts=3,retryDelayMs=800,onResourceError=async()=>0,logger=console}={}) {
  const attempts=Math.max(1,Math.min(5,Number(maxAttempts)||3));
  let lastError;
  for(let i=0;i<attempts;i++){
    try{
      const page=await context.newPage();
      page.setDefaultTimeout(8500);
      return page;
    }catch(error){
      lastError=error;
      if(i===0){
        try{
          const released=await onResourceError();
          if(released>0)logger.warn(`Chrome could not create a tab; closed ${released} AutoJob-created sign-in tab(s) before retry.`);
        }catch(cleanupError){
          logger.warn(`Chrome tab cleanup could not complete: ${String(cleanupError?.message||cleanupError)}`);
        }
      }
      if(i<attempts-1)await new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(retryDelayMs)||0)));
    }
  }
  throw new ChromeTabUnavailableError(lastError);
}
