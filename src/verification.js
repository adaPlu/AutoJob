// SPDX-License-Identifier: MIT
// Conservative evidence classification. A confirmation on one page is not independent
// verification: only a second checked view or external receipt grants "confirmed".
export const CONFIRMATION_TEXT = [
  /(?:your\s+)?application (?:has been |was )?submitted(?: successfully)?/i,
  /successfully submitted (?:your |the )?application/i,
  /thank you for applying/i, /thanks for applying/i,
  /we(?:'|’)ve received your application/i,
  /we have received your application/i,
  /(?:your )?application (?:has been |was )?received/i,
  /your application (?:has been )?(?:sent|submitted)/i,
  /you(?:'|’)ve (?:successfully )?applied/i,
  /application status\s*[:\-]?\s*(?:submitted|received)/i
];
export const FAILURE_TEXT = [
  /unable to submit(?: your application)?/i,
  /could not submit(?: your application)?/i,
  /(?:your )?application (?:was )?not submitted/i,
  /submission failed/i, /error submitting (?:your )?application/i
];
export const CHALLENGE_TEXT = /verify you are human|complete the captcha|solve the captcha|security check required|unusual traffic detected/i;
export const APPLIED_STATUS = /(?:^|\b)(?:you(?:'|’)ve applied|you have applied|already applied|application (?:status\s*[:\-]\s*)?(?:submitted|received)|applied on\s+\w+)(?:\b|$)/i;

export function matchEvidence(text, regexes) {
  return regexes.map(r=>String(text || '').match(r)?.[0]).find(Boolean) || '';
}

export function confirmationUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return /(?:^|\/)(?:thank-you|thankyou|success|confirmation|submitted|application-complete|application\/complete)(?:\/|$)/i.test(u.pathname) ||
      (u.searchParams.get('status') || '').toLowerCase() === 'submitted';
  } catch { return false; }
}

export function classifyEvidence({ submittedClick, confirmationText, confirmationUrlChanged, independentApplied, artifactSaved, failure, challenge }) {
  if (!submittedClick) return 'ready-no-submit-button';
  if (challenge) return 'blocked';
  if (failure) return 'submission-failed';
  if (!confirmationText && !confirmationUrlChanged) return 'submit-clicked-unverified';
  if (confirmationText && independentApplied && artifactSaved) return 'submitted-confirmed';
  return 'submitted-pending-receipt';
}
