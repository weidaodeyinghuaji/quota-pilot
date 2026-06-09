import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const tagName = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const version = tagName.replace(/^v/i, '').trim();

if (!version) {
  throw new Error('Missing release tag or version.');
}

const changelogPath = resolve('CHANGELOG.md');
const outputPath = resolve(process.argv[3] || 'release-notes.md');
const changelog = readFileSync(changelogPath, 'utf8');
const lines = changelog.split(/\r?\n/);
const headerPattern = /^##\s+\[?([^\]\s]+)\]?\s*$/;
let start = -1;

for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(headerPattern);
  if (match?.[1] === version) {
    start = index + 1;
    break;
  }
}

if (start === -1) {
  throw new Error(`No changelog section found for ${version}.`);
}

let end = lines.length;
for (let index = start; index < lines.length; index += 1) {
  if (/^##\s+/.test(lines[index])) {
    end = index;
    break;
  }
}

const body = lines.slice(start, end).join('\n').trim();
if (!body) {
  throw new Error(`Changelog section for ${version} is empty.`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${body}\n`, 'utf8');
console.log(`Wrote release notes for ${tagName || version} to ${outputPath}`);
