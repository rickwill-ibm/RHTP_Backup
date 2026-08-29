import { readFileSync } from 'node:fs';
import { extractText, getDocumentProxy } from 'unpdf';
const bytes = new Uint8Array(readFileSync('tests/fixtures/sample-pa.pdf'));
const pdf = await getDocumentProxy(bytes);
const { text } = await extractText(pdf, { mergePages: true });
const lines = text
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .slice(0, 6);
console.log(JSON.stringify(lines));
