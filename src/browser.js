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
