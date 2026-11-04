// SPDX-License-Identifier: MIT
// Ensure both launch methods use the proven automation-safe GPU setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const file of ['START_CHROME.bat','scripts/start-chrome.ps1']){
  test(`${file} keeps Chrome extensions and sign-ins while disabling GPU acceleration`,()=>{
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(source,/--remote-debugging-port=9222/);
    assert.match(source,/--disable-gpu/);
    assert.doesNotMatch(source,/--disable-extensions/);
    assert.match(source,/ChromeProfile/);
  });
}
