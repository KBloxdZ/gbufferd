// glues all the src files back into one html. just run node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// --without-pack: for the file that goes on github, the built-in pack has its own license
const withoutPack = args.includes('--without-pack');
const output = path.resolve(root, args.find(a => !a.startsWith('--')) || 'dist/gbufferd-webgpu.html');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const missing = [];

const file = p => path.join(root, p);
function expand(text) {
  text = text.replace(
    /__include\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g,
    (_, kind, p) => '@@' + kind + ':' + p + '@@',
  );
  return text.replace(/@@(text|concat|datauri|base64|jsonstring|htmlstring):([^@\s]+)@@/g, (_, kind, p) => {
    if (kind === 'text') return expand(fs.readFileSync(file(p), 'utf8'));
    if (kind === 'concat')
      return fs
        .readdirSync(file(p))
        .filter(n => n.endsWith('.js'))
        .sort()
        .map(n => expand(fs.readFileSync(file(path.join(p, n)), 'utf8')))
        .join('');
    if (kind === 'jsonstring') return JSON.stringify(fs.readFileSync(file(p), 'utf8'));
    if (kind === 'htmlstring') return JSON.stringify(expand(fs.readFileSync(file(p), 'utf8')));
    if (kind === 'datauri')
      return (
        'data:' +
        (MIME[path.extname(p).toLowerCase()] || 'application/octet-stream') +
        ';base64,' +
        fs.readFileSync(file(p)).toString('base64')
      );
    if (!fs.existsSync(file(p)) || (withoutPack && p.startsWith('assets/packs/'))) {
      missing.push(p);
      return '';
    }
    return fs.readFileSync(file(p)).toString('base64');
  });
}

const page = expand(fs.readFileSync(file('src/index.html'), 'utf8'));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, page);
console.log(path.relative(root, output) + ': ' + (page.length / 1048576).toFixed(2) + ' MB');
for (const p of missing) console.log('  not found, left empty: ' + p);
// the little script for other pages always sits right next to the html
const embed = path.join(path.dirname(output), 'gbufferd-embed.js');
fs.copyFileSync(file('src/embed/gbufferd-embed.js'), embed);
console.log(path.relative(root, embed));
