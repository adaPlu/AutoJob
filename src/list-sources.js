import { SOURCE_NAMES } from './discover.js';
console.log(`Enabled source types available in this build: ${SOURCE_NAMES.length}\n`);
SOURCE_NAMES.forEach((s, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${s.label}  [${s.id}]`));
