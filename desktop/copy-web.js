// Copies the game and its web pages from the repository root into ./web before packaging.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(__dirname, 'web');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of fs.readdirSync(root)) if (f.endsWith('.html')) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
console.log('web files copied to', out);
