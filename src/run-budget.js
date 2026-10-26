// SPDX-License-Identifier: MIT
// Distinguish candidate pages screened from actual application workflows started.
// A rejected posting is not an application attempt.
export function createRunBudget(maxApplications, maxPostings) {
  const applicationLimit=Math.max(1,Math.floor(Number(maxApplications)||25));
  // Limit rejected pages too, so a stream of low-fit listings cannot run indefinitely.
  const defaultInspections=Math.max(30,Math.min(300,applicationLimit*10));
  const requested=Number(maxPostings);
  const inspectionLimit=Math.max(applicationLimit,
    Number.isFinite(requested) && requested>0 ? Math.floor(requested) : defaultInspections);
  let inspected=0, applicationAttempts=0;
  return {
    applicationLimit,inspectionLimit,
    get inspected(){return inspected;},
    get applicationAttempts(){return applicationAttempts;},
    get exhausted(){return inspected>=inspectionLimit || applicationAttempts>=applicationLimit;},
    record({applicationStarted=false}={}) {
      if(this.exhausted) throw new Error('Run budget exhausted; cannot inspect more postings');
      inspected++;
      if(applicationStarted) applicationAttempts++;
    }
  };
}
