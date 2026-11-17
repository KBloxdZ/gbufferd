const icons = __include('text', 'assets/icons.json');
const svg = name => icons[name] || '';
const keys = [
  ['Click', 'Capture mouse'],
  ['Esc', 'Release mouse'],
  ['W A S D', 'Move'],
  ['Ctrl', 'Sprint'],
  ['Space', 'Jump'],
  ['2× Space', 'Toggle flight'],
  ['Space / Shift', 'Fly up / down'],
  ['Left click', 'Break block'],
  ['Right click', 'Place block'],
  ['1–9 / Wheel', 'Hotbar'],
  ['F1', 'Toggle HUD'],
  ['F4', 'Pipeline info'],
  ['F8', 'Frame inspector'],
  ['F9', 'Shader errors'],
  ['V / F7', 'Lighting debug'],
  ['K', 'Cinema mode'],
  ['P', 'Save screenshot'],
  ['O', 'Upload shaderpack'],
  ['?', 'Controls'],
];

const root = document.createElement('div');
root.id = 'cx';
const dialMarks = Array.from({ length: 24 }, (_, i) =>
  i % 6 === 0
    ? `<rect x="105" y="3" width="2" height="8" fill="#fff" opacity="0.75" transform="rotate(${i * 15} 106 106)"/>`
    : `<rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(${i * 15} 106 106)"/>`,
).join('');
const slots = {
  builtin:
    gbufferd.hasBuiltin === false
      ? ''
      : `<button type="button" data-act="builtin">${svg('builtin')} Load built-in pack</button><hr>`,
  keys: keys.map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join(''),
  dialMarks,
};
root.innerHTML = __include('htmlstring', 'src/viewer/markup.html').replace(
  /\{\{(\w+)(?::([\w-]+))?\}\}/g,
  (_, slot, icon) => (slot === 'icon' ? svg(icon) : (slots[slot] ?? '')),
);
document.body.append(root);
const bars = document.createElement('div');
bars.className = 'cx-bars';
bars.innerHTML = '<i></i><i></i>';
document.body.append(bars);
const fpsEl = document.createElement('div');
fpsEl.id = 'cx-fps';
fpsEl.setAttribute('aria-hidden', 'true');
document.body.append(fpsEl);
const filmHint = document.createElement('div');
filmHint.id = 'cx-filmhint';
filmHint.textContent = 'K or Esc to exit cinema mode';
document.body.append(filmHint);
