// Fail closed on non-postings. Search queries are hints, not evidence of job fit.
export const ROLE_PATTERN = /\b(software|back[ -]?end|front[ -]?end|full[ -]?stack|web|mobile|android|ios|java|python|react|typescript|machine learning|ml|ai|artificial intelligence|data|devops|cloud|platform|robotics|ros2?|embedded|firmware|application|developer|programmer|swe|sdet|qa automation)\b/i;
export const JOB_TITLE_PATTERN = /\b(engineer|developer|programmer|architect|scientist|intern|specialist|analyst|technologist|tester|automation)\b/i;
export const NON_JOB_TITLES = /^(?:jobs?|careers?|job search|job listings?|search results?|sign in|log in|create account|benefits|salary(?: and compensation)?|remote jobs?|the largest job board|apply now|view details)$/i;
export const EXCLUDE_TITLES = /\b(product manager|marketing|cinematograph|photograph|sales representative|account executive|recruiter|head of|vp|vice president|director|principal|staff|distinguished|general manager|revenue|human resources|customer support)\b/i;

export function plausibleRoleTitle(title, config={}) {
  const s=String(title||'').trim();
  if(s.length<7 || s.length>180 || NON_JOB_TITLES.test(s) || /\b\d[\d,]*\s+jobs\s+in\b/i.test(s)) return false;
  if(EXCLUDE_TITLES.test(s)) return false;
  if((config.skipTitleKeywords||[]).some(x=>new RegExp(`\\b${String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(s))) return false;
  return ROLE_PATTERN.test(s) && JOB_TITLE_PATTERN.test(s);
}

export function postingRemoteStatus(text='') {
  const s=String(text).slice(0,24000);
  const positive=/\b(fully remote|100% remote|remote[- ]first|work from anywhere|work from home|remote within (?:the )?(?:united states|us|usa)|remote\s*[-–|(/]\s*(?:us|usa|united states)|location\s*[:\-]\s*remote|remote\s+position|work remotely|\bremote\b)/i.test(s);
  const clearHybrid=/\b(hybrid|on[- ]site|onsite|must.{0,50}(?:relocate|commut|in[- ]office|onsite|on[- ]site)|[2-5]\s+days?\s+(?:per|a)\s+week\s+(?:in|at)\s+(?:the\s+)?office)\b/i.test(s);
  const remoteConditional=/\b(remote\s+(?:not available|not offered)|no remote|not remote|remote\s+ineligible)\b/i.test(s);
  return {eligible:positive&&!clearHybrid&&!remoteConditional,remote:positive,onsiteOrHybrid:clearHybrid};
}

export function classificationFromApplication(text='') {
  const s=String(text).slice(0,12000);
  if(/verify you are human|complete the captcha|security check required|unusual traffic|captcha/i.test(s)) return 'blocked';
  if(/\b(sign in|log in|create an account|sign up)\b/i.test(s) && /\b(password|email address|continue with google|continue with linkedin)\b/i.test(s)) return 'authentication-required';
  return '';
}
