// SPDX-License-Identifier: MIT
// Validate the Chrome remote debugging connection without PowerShell or external tools.
const cdp = 'http://127.0.0.1:9222/json/version';
const probeOnly = process.argv.includes('--probe');
const deadline = Date.now() + (probeOnly ? 500 : 30000);
let ok = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(cdp, { signal: AbortSignal.timeout(1500) });
    const data = res.ok ? await res.json() : null;
    if (data?.webSocketDebuggerUrl) { ok = true; break; }
  } catch { /* Browser may still be starting. */ }
  if (probeOnly) break;
  await new Promise(r => setTimeout(r, 800));
}
if (!ok) console.error('Chrome automation port 9222 unavailable. Close other Chrome job-profile windows and retry START_ALL.bat.');
else if (!probeOnly) console.log('Chrome connected on port 9222.');
process.exitCode = ok ? 0 : 1;
