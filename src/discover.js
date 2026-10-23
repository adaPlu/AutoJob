// SPDX-License-Identifier: MIT
import { handleSiteAcknowledgements } from './acknowledgements.js';
const googleSiteSearch = (site, q) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${q}`)}`;

const googleQuery = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export const SOURCE_DEFS = {
  simplify: {
    label: 'Simplify Jobs',
    search: q => `https://simplify.jobs/jobs?query=${encodeURIComponent(q)}`,
    hosts: ['simplify.jobs'],
    jobPath: /(\/p\/|\/job\/)/i
  },
  linkedin: {
    label: 'LinkedIn Jobs',
    search: q => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`,
    hosts: ['linkedin.com'],
    jobPath: /^\/jobs\/view\/\d+\/?$/i
  },
  indeed: {
    label: 'Indeed',
    search: q => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}`,
    hosts: ['indeed.com'],
    jobPath: /(viewjob|pagead|rc\/clk)/i
  },
  dice: {
    label: 'Dice',
    search: q => `https://www.dice.com/jobs?q=${encodeURIComponent(q)}`,
    hosts: ['dice.com'],
    jobPath: /(job-detail|\/jobs\/)/i
  },
  wellfound: {
    label: 'Wellfound',
    search: q => `https://wellfound.com/jobs?query=${encodeURIComponent(q)}`,
    hosts: ['wellfound.com'],
    jobPath: /\/jobs\//i
  },
  builtin: {
    label: 'Built In',
    search: q => `https://builtin.com/jobs?search=${encodeURIComponent(q)}`,
    hosts: ['builtin.com'],
    jobPath: /\/job\//i
  },
  ziprecruiter: {
    label: 'ZipRecruiter',
    search: q => `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(q)}&location=Remote`,
    hosts: ['ziprecruiter.com'],
    jobPath: /^\/(?:jobs|job)\/[^/]+(?:\/[^/]+)?\/?$/i
  },
  glassdoor: {
    label: 'Glassdoor',
    // Search-engine discovery is less brittle than Glassdoor's frequently-changing internal search URL.
    search: q => googleSiteSearch('glassdoor.com/Job', q),
    hosts: ['glassdoor.com'],
    jobPath: /(\/job-listing\/|\/partner\/jobListing\/)/i
  },
  monster: {
    label: 'Monster',
    search: q => `https://www.monster.com/jobs/search?q=${encodeURIComponent(q)}`,
    hosts: ['monster.com'],
    jobPath: /(job-openings|\/job\/)/i
  },
  careerbuilder: {
    label: 'CareerBuilder',
    search: q => `https://www.careerbuilder.com/jobs?keywords=${encodeURIComponent(q)}`,
    hosts: ['careerbuilder.com'],
    jobPath: /\/job\//i
  },
  handshake: {
    label: 'Handshake',
    search: () => 'https://app.joinhandshake.com/stu/postings',
    hosts: ['app.joinhandshake.com'],
    jobPath: /\/jobs\/\d+/i,
    interactiveSearch: true
  },
  usajobs: {
    label: 'USAJOBS',
    search: q => `https://www.usajobs.gov/Search/Results?k=${encodeURIComponent(q)}`,
    hosts: ['usajobs.gov'],
    jobPath: /(\/job\/\d+|GetJob\/ViewDetails\/\d+)/i
  },
  jobright: {
    label: 'Jobright',
    search: q => googleSiteSearch('jobright.ai', `${q} jobs`),
    hosts: ['jobright.ai'],
    jobPath: /^\/jobs\/info\/[a-z0-9-]+\/?$/i
  },
  welcometothejungle: {
    label: 'Welcome to the Jungle (formerly Otta)',
    search: q => googleQuery(`site:app.welcometothejungle.com/jobs ${q}`),
    hosts: ['app.welcometothejungle.com', 'welcometothejungle.com'],
    jobPath: /^\/jobs\/[a-z0-9_-]{5,}\/?$/i
  },
  remoteok: {
    label: 'Remote OK',
    search: q => googleSiteSearch('remoteok.com', `${q} remote jobs`),
    hosts: ['remoteok.com'],
    jobPath: /(\/remote-jobs\/|\/l\/)/i
  },
  weworkremotely: {
    label: 'We Work Remotely',
    search: q => `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(q)}`,
    hosts: ['weworkremotely.com'],
    jobPath: /^\/remote-jobs\/[^/?]+\/?$/i
  },
  remoteco: {
    label: 'Remote.co',
    search: q => googleSiteSearch('remote.co', `${q} remote job`),
    hosts: ['remote.co'],
    jobPath: /^\/job\/[^/?]+\/?$/i
  },
  ycombinator: {
    label: 'Y Combinator Jobs',
    search: q => `https://www.ycombinator.com/jobs?query=${encodeURIComponent(q)}`,
    hosts: ['ycombinator.com'],
    jobPath: /\/companies\/.+\/jobs\//i
  },
  greenhouse: {
    label: 'Greenhouse',
    search: q => googleQuery(`(site:boards.greenhouse.io OR site:job-boards.greenhouse.io) ${q}`),
    hosts: ['greenhouse.io'],
    jobPath: /\/jobs\/\d+/i
  },
  lever: {
    label: 'Lever',
    search: q => googleSiteSearch('jobs.lever.co', q),
    hosts: ['lever.co'],
    jobPath: /\/[a-z0-9_-]+\/[a-f0-9-]{8,}/i
  },
  ashby: {
    label: 'Ashby',
    search: q => googleSiteSearch('jobs.ashbyhq.com', q),
    hosts: ['ashbyhq.com'],
    jobPath: /\/[a-z0-9_-]+\/[a-f0-9-]{8,}/i
  },
  workday: {
    label: 'Workday',
    search: q => googleQuery(`(site:myworkdayjobs.com OR site:myworkdaysite.com) ${q}`),
    hosts: ['myworkdayjobs.com', 'myworkdaysite.com'],
    jobPath: /\/job\//i
  },
  smartrecruiters: {
    label: 'SmartRecruiters',
    search: q => googleSiteSearch('jobs.smartrecruiters.com', q),
    hosts: ['smartrecruiters.com'],
    jobPath: /(\/\d+-|\/\d{6,}|jobId=)/i
  },
  icims: {
    label: 'iCIMS',
    search: q => googleQuery(`site:icims.com/jobs ${q}`),
    hosts: ['icims.com'],
    jobPath: /\/jobs\//i
  },
  jobicy: {
    label: 'Jobicy Remote Jobs',
    search: () => 'https://jobicy.com/jobs',
    hosts: ['jobicy.com'],
    jobPath: /^\/jobs\/[^/?]+\/?$/i
  },
  remotive: {
    label: 'Remotive Remote Jobs',
    search: () => 'https://remotive.com/remote-jobs/software-dev',
    hosts: ['remotive.com'],
    jobPath: /^\/remote-jobs\/[^/]+\/[^/?]+\/?$/i
  },
  companycareers: {
    label: 'Direct company career pages',
    search: q => googleQuery(`${q} (careers OR jobs OR openings) -site:linkedin.com -site:indeed.com -site:glassdoor.com -site:ziprecruiter.com -site:monster.com -site:careerbuilder.com`),
    broadExternal: true,
    jobPath: /(\/jobs?\/|\/careers?\/|jobId=|job_id=|gh_jid=|jobReqId=|requisition)/i
  }
};

export const SOURCE_NAMES = Object.entries(SOURCE_DEFS).map(([id, def]) => ({ id, label: def.label }));

function unwrapSearchEngineUrl(href, base) {
  try {
    const u = new URL(href, base);
    if (u.hostname.includes('google.') && u.pathname === '/url') {
      const dest = u.searchParams.get('q') || u.searchParams.get('url');
      if (dest) return dest;
    }
    return u.toString();
  } catch {
    return href;
  }
}

export function normalizeUrl(href, base) {
  try {
    const raw = unwrapSearchEngineUrl(href, base);
    const u = new URL(raw, base);
    u.hash = '';
    [
      'trk','trackingId','refId','ref','source','sourceid','src',
      'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
      'gh_src','lever-source','iis','iisn','eBP','recommendedFlavor','ref','trkInfo','trackingCode','originalSubdomain'
    ].forEach(k => u.searchParams.delete(k));
    if (/linkedin\.com$/i.test(u.hostname) && /^\/jobs\/(?:search-results|search)\/?$/i.test(u.pathname) && /^\d+$/.test(u.searchParams.get('currentJobId')||'')) {
      return `https://www.linkedin.com/jobs/view/${u.searchParams.get('currentJobId')}/`;
    }
    return u.toString();
  } catch { return ''; }
}

function isKnownNoiseHost(hostname) {
  return [
    'google.com','bing.com','duckduckgo.com','facebook.com','instagram.com','x.com','twitter.com',
    'youtube.com','reddit.com','wikipedia.org','tiktok.com'
  ].some(h => hostname === h || hostname.endsWith(`.${h}`));
}

export function isJobUrl(url, source) {
  try {
    const def = SOURCE_DEFS[source];
    if (!def) return false;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const haystack = `${u.pathname}${u.search}`;

    if (def.broadExternal) {
      if (isKnownNoiseHost(host) || /^(?:\/|\/(?:jobs?|careers?|openings|positions)\/?)$/i.test(u.pathname)) return false;
      return def.jobPath.test(haystack) && /\/(?:jobs?|careers?|positions)\/[^/?]{6,}|(?:jobId|job_id|gh_jid|jobReqId|requisition)=/i.test(haystack);
    }

    if (!(def.hosts || []).some(h => host === h || host.endsWith(`.${h}`))) return false;
    if (source==='jobicy') return /^\/jobs\/[^/?]+\/?$/i.test(u.pathname);
    if (source==='remotive') return /^\/remote-jobs\/[^/]+\/[^/?]+\/?$/i.test(u.pathname);
    if (source==='indeed') return /^(?:\/viewjob|\/pagead\/clk|\/rc\/clk)\/?$/i.test(u.pathname) && !!(u.searchParams.get('jk')||u.searchParams.get('vjk'));
    if (source==='ziprecruiter' && /^\/co\//i.test(u.pathname)) return false;
    if (source==='remoteok') return /^\/remote-jobs\/[^/?]+-\d+\/?$/i.test(u.pathname);
    if (source==='wellfound') return /^\/jobs\/\d+-[^/]+\/?$/i.test(u.pathname);
    if (source==='weworkremotely') return /^\/remote-jobs\/[^/?]+\/[^/?]+\/?$/i.test(u.pathname);
    if (source==='linkedin') return /^\/jobs\/view\/\d+\/?$/i.test(u.pathname);
    if (source==='glassdoor') return /\/(?:job-listing|partner\/jobListing)\//i.test(u.pathname);
    if (source==='remoteco') return /^\/job\/[^/?]+\/?$/i.test(u.pathname);
    if (source==='jobright') return /^\/jobs\/info\/[a-z0-9-]+\/?$/i.test(u.pathname);
    return def.jobPath ? def.jobPath.test(u.pathname + u.search) : false;
  } catch { return false; }
}

async function driveHandshakeSearch(page, query) {
  // Handshake's student Jobs page is personalized and login-gated. Search its visible UI
  // rather than depending on an unstable query-string contract.
  const candidates = [
    page.getByPlaceholder(/search.*(job|position|role|keyword)/i).first(),
    page.getByRole('searchbox').first(),
    page.locator('input[type="search"]').first(),
    page.locator('input[placeholder*="Search" i]').first()
  ];
  for (const loc of candidates) {
    if (!(await loc.count().catch(()=>0))) continue;
    if (!(await loc.isVisible().catch(()=>false))) continue;
    try {
      await loc.fill(query);
      await loc.press('Enter');
      await page.waitForTimeout(1800);
      return true;
    } catch {}
  }
  return false;
}

async function waitForPageToSettle(page, maxMs = 7000) {
  // SPAs such as LinkedIn often redirect once after the initial DOMContentLoaded event.
  // Wait until the URL has stayed unchanged for a short window before scraping.
  const started = Date.now();
  let lastUrl = '';
  let stableSince = Date.now();
  while (Date.now() - started < maxMs) {
    if (page.isClosed()) return;
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 900) {
      break;
    }
    await page.waitForTimeout(200).catch(()=>{});
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(()=>{});
}

async function extractLinksSafely(page, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await waitForPageToSettle(page, 3500);
      return await page.locator('a[href]').evaluateAll((els) => els.map(a => ({
        href: a.href,
        text: (a.innerText || a.textContent || a.getAttribute('aria-label') || a.getAttribute('title') || '').trim()
      })).filter(x => x.href));
    } catch (err) {
      lastError = err;
      const message = String(err?.message || err || '');
      const navigationRace = /execution context was destroyed|most likely because of a navigation|frame was detached|target page, context or browser has been closed/i.test(message);
      if (!navigationRace || page.isClosed() || attempt === attempts) break;
      // A redirect/re-render won the race. Give the new document time to become current and retry.
      await page.waitForTimeout(500 * attempt).catch(()=>{});
    }
  }
  throw lastError || new Error('Unable to extract job links from the current page.');
}

export async function discoverFromSource(page, source, query, limit=15, maxPages=2, config={}, {signal,progress=()=>{}}={}) {
  const def = SOURCE_DEFS[source];
  if (!def) return [];
  const url = def.search(query);
  const out=[],seen=new Set(),visited=new Set();
  maxPages=Math.max(1,Math.min(3,Number(maxPages)||2));
  let current=url;
  for(let pageNumber=0;pageNumber<maxPages && out.length<limit;pageNumber++){
    if(signal?.aborted)throw signal.reason;
    if(visited.has(current))break;
    visited.add(current);
    await page.goto(current, {waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
    await waitForPageToSettle(page);
    if(signal?.aborted)throw signal.reason;
    progress(`search-page-${pageNumber+1}`);
    await handleSiteAcknowledgements(page,config);
    const text=(await page.locator('body').innerText({timeout:5000}).catch(()=>''))||'';
    if(/captcha|verify you are human|unusual traffic|access denied|robot check/i.test(text)) {
      console.warn(`  ${def.label}: human verification encountered; skip query.`);
      break;
    }
    if(def.interactiveSearch) {
      await driveHandshakeSearch(page,query);
      await waitForPageToSettle(page);
    }
    let links=await extractLinksSafely(page);
    if(!links.some(l=>isJobUrl(normalizeUrl(l.href,page.url()||current),source))) {
      // One bounded lazy-load fallback, not three scroll cycles on every page.
      await page.mouse.wheel(0,600).catch(()=>{});
      await page.waitForTimeout(450).catch(()=>{});
      links=await extractLinksSafely(page);
    }
    // Many employer sites expose job postings as JSON-LD (including links in scripts
    // that are not represented by a stable anchor at the top of the results).
    const schemaJobs=await page.locator('script[type="application/ld+json"]').evaluateAll(els=>{
      const found=[];
      const walk=(v)=>{
        if(!v||typeof v!=='object')return;
        if(Array.isArray(v)){v.forEach(walk);return;}
        const type=v['@type'];
        if((Array.isArray(type)?type.includes('JobPosting'):type==='JobPosting')) {
          if(typeof v.url==='string')found.push({href:v.url,text:String(v.title||'')});
        }
        if(v['@graph'])walk(v['@graph']);
        if(v.itemListElement)walk(v.itemListElement);
        if(v.item)walk(v.item);
      };
      for(const el of els){try{walk(JSON.parse(el.textContent||''));}catch{}}
      return found;
    }).catch(()=>[]);
    for(const l of [...links,...schemaJobs]){
      if(signal?.aborted)throw signal.reason;
      const n=normalizeUrl(l.href,page.url()||current);
      if(!n||seen.has(n)||!isJobUrl(n,source)||/\/(?:login|signup|people|posts|feed)(?:\/|$)/i.test(n))continue;
      seen.add(n);out.push({source,query,url:n,anchorText:l.text});
      if(out.length>=limit)break;
    }
    if(out.length>=limit||pageNumber>=maxPages-1)break;
    // Follow a literal next-page link at most twice, never a random Next control.
    const next=links.find(l=>{
      if(!/^(?:next|next page|›|→|older)$/i.test((l.text||'').trim()) || !l.href) return false;
      try {return new URL(l.href,page.url()).hostname===new URL(page.url()).hostname;} catch{return false;}
    });
    if(!next)break;
    const follow=normalizeUrl(next.href,page.url());
    if(!follow||visited.has(follow))break;
    current=follow;
  }
  return out;
}

export function fitScore(text, config) {
  const t = text.toLowerCase();
  let score = 0;
  for (const k of config.preferredKeywords || []) {
    const escaped=String(k).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`,'i').test(t)) score++;
  }
  if (/\b(remote|work from home|distributed)\b/i.test(t)) score += 2;
  if (/\b(entry|junior|jr\.?|associate|new grad|early career|software engineer i\b)/i.test(t)) score += 2;
  if (/\b(principal|staff|director|vice president|vp\b|distinguished)\b/i.test(t)) score -= 8;
  if (/\b(senior|sr\.?\b|lead\b)/i.test(t)) score -= 2;
  return score;
}
