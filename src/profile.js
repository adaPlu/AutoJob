// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import path from 'node:path';

export function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function resolveFromRoot(root, p) {
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}
