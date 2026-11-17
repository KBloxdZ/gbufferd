const GUI_FONT_PROVIDERS = __include('text', 'assets/font/glyph-providers.json');
const guiGlyphs = new Map();
let guiFontReady = false;
Promise.all(
  GUI_FONT_PROVIDERS.map(async provider => {
    const image = await loadImage(provider.image),
      canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    return { provider, image, pixels };
  }),
).then(loaded => {
  for (const { provider, image, pixels } of loaded) {
    const size = image.width / 16,
      rowHeight = image.height / provider.chars.length,
      height = provider.height || 8,
      ascent = provider.ascent ?? 7;
    provider.chars.forEach((line, row) =>
      Array.from(line).forEach((char, column) => {
        if (char === '\0' || guiGlyphs.has(char)) return;
        let last = -1;
        for (let x = 0; x < size; x++)
          for (let y = 0; y < rowHeight; y++)
            if (pixels[((row * rowHeight + y) * image.width + column * size + x) * 4 + 3]) last = Math.max(last, x);
        guiGlyphs.set(char, {
          image,
          x: column * size,
          y: row * rowHeight,
          w: size,
          h: rowHeight,
          height,
          ascent,
          advance: char === ' ' ? 4 : Math.floor(((last + 1) * height) / rowHeight + 0.5) + 1,
        });
      }),
    );
  }
  guiFontReady = true;
  if (!document.getElementById('shaderSettings').hidden) pixelizeMenu();
});
const GUI_COLORS = [
  '000000',
  '0000aa',
  '00aa00',
  '00aaaa',
  'aa0000',
  'aa00aa',
  'ffaa00',
  'aaaaaa',
  '555555',
  '5555ff',
  '55ff55',
  '55ffff',
  'ff5555',
  'ff55ff',
  'ffff55',
  'ffffff',
];
const GUI_SCALE = 2;
const guiTinted = new Map(),
  guiObfuscated = new Set();
let guiObfuscationTimer = 0,
  guiWidthGroups = null;
const guiClean = text =>
  String(text)
    .replace(/\\u00a7/g, '§')
    .replace(/§[0-9a-fk-or]/gi, '');
function guiRuns(text, base = 'f') {
  const runs = [],
    chars = Array.from(String(text).replace(/\\u00a7/g, '§'));
  let style = { color: base };
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '§' && i + 1 < chars.length) {
      const code = chars[++i].toLowerCase();
      if (/[0-9a-f]/.test(code)) style = { color: code };
      else if (code === 'r') style = { color: base };
      else if (code === 'l') style = { ...style, bold: true };
      else if (code === 'o') style = { ...style, italic: true };
      else if (code === 'n') style = { ...style, underline: true };
      else if (code === 'm') style = { ...style, strike: true };
      else if (code === 'k') style = { ...style, obfuscated: true };
      continue;
    }
    runs.push({ char: chars[i], ...style });
  }
  return runs;
}
function guiTintedImage(image, color) {
  const key = color;
  let cache = guiTinted.get(image);
  if (!cache) guiTinted.set(image, (cache = new Map()));
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = '#' + color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    cache.set(key, canvas);
  }
  return cache.get(key);
}
function guiRandomGlyph(glyph) {
  if (!guiWidthGroups) {
    guiWidthGroups = new Map();
    for (const [char, item] of guiGlyphs)
      if (char.charCodeAt(0) > 32 && char.charCodeAt(0) < 127) {
        const list = guiWidthGroups.get(item.advance) || [];
        list.push(item);
        guiWidthGroups.set(item.advance, list);
      }
  }
  const list = guiWidthGroups.get(glyph.advance);
  return list ? list[Math.floor(Math.random() * list.length)] : glyph;
}
function guiDrawText(canvas, text, base) {
  const runs = guiRuns(text, base).map(run => ({ ...run, glyph: guiGlyphs.get(run.char) || guiGlyphs.get('?') }));
  const width = runs.reduce((sum, run) => sum + (run.glyph?.advance ?? 4) + (run.bold ? 1 : 0), 0) + 1,
    height = 13;
  canvas.width = Math.max(1, width * GUI_SCALE);
  canvas.height = height * GUI_SCALE;
  canvas.style.setProperty('--glyph-width', Math.max(1, width));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const S = GUI_SCALE,
    top = 3;
  const drawGlyph = (glyph, color, x, y, italic) => {
    const image = guiTintedImage(glyph.image, color),
      rows = glyph.height,
      sourceRow = glyph.h / rows;
    if (!italic) {
      context.drawImage(
        image,
        glyph.x,
        glyph.y,
        glyph.w,
        glyph.h,
        x * S,
        y * S,
        ((glyph.w * rows) / glyph.h) * S,
        rows * S,
      );
      return;
    }
    for (let row = 0; row < rows * S; row++) {
      const shift = Math.round((1 - (row + 0.5) / (rows * S)) * S);
      context.drawImage(
        image,
        glyph.x,
        glyph.y + (row * sourceRow) / S,
        glyph.w,
        sourceRow / S,
        x * S + shift,
        y * S + row,
        ((glyph.w * rows) / glyph.h) * S,
        1,
      );
    }
  };
  for (const pass of ['shadow', 'text']) {
    let x = 0;
    for (const run of runs) {
      const glyph = run.obfuscated && run.glyph ? guiRandomGlyph(run.glyph) : run.glyph,
        advance = (run.glyph?.advance ?? 4) + (run.bold ? 1 : 0);
      let color = GUI_COLORS[parseInt(run.color, 16)];
      if (pass === 'shadow')
        color = color
          .match(/../g)
          .map(part => (parseInt(part, 16) >> 2).toString(16).padStart(2, '0'))
          .join('');
      const offset = pass === 'shadow' ? 1 : 0;
      if (glyph && run.char !== ' ') {
        drawGlyph(glyph, color, x + offset, top + offset - (glyph.ascent - 7), run.italic);
        if (run.bold) drawGlyph(glyph, color, x + offset + 1, top + offset - (glyph.ascent - 7), run.italic);
      }
      context.fillStyle = '#' + color;
      if (run.underline) context.fillRect((x - 1 + offset) * S, (top + 8 + offset) * S, (advance + 1) * S, S);
      if (run.strike) context.fillRect((x - 1 + offset) * S, (top + 3.5 + offset) * S, (advance + 1) * S, S);
      x += advance;
    }
  }
  return runs.some(run => run.obfuscated);
}
function guiAnimateObfuscated() {
  for (const item of guiObfuscated) {
    if (!item.canvas.isConnected) {
      guiObfuscated.delete(item);
      continue;
    }
    guiDrawText(item.canvas, item.text, item.base);
  }
  if (!guiObfuscated.size) {
    clearInterval(guiObfuscationTimer);
    guiObfuscationTimer = 0;
  }
}
function pixelizeMenu() {
  if (!guiFontReady) return;
  const panel = document.getElementById('shaderSettings');
  for (const node of panel.querySelectorAll('[data-gui],button,h2,.gui-head p')) {
    if (
      node.dataset.pixelized ||
      (!node.dataset.gui && (node.querySelector('button,[data-gui]') || node.classList.contains('gui-option')))
    )
      continue;
    const text = node.dataset.gui ?? node.textContent;
    if (!text) continue;
    const base = node.dataset.guiBase || 'f';
    const canvas = document.createElement('canvas');
    canvas.className = 'gui-pixeltext';
    canvas.setAttribute('aria-hidden', 'true');
    if (guiDrawText(canvas, text, base)) {
      guiObfuscated.add({ canvas, text, base });
      guiObfuscationTimer ||= setInterval(guiAnimateObfuscated, 50);
    }
    node.setAttribute('aria-label', guiClean(text));
    node.replaceChildren(canvas);
    node.dataset.pixelized = 'true';
  }
}
function shaderFeatureList(state) {
  const sources = state.packSources || {},
    paths = Object.keys(sources).map(path => path.replace(/^shaders\//, '')),
    props = Object.keys(state.properties || {});
  const file = re => paths.some(path => re.test(path)),
    prop = re => props.some(key => re.test(key));
  let code = null;
  const src = re => {
    code ??= Object.entries(sources)
      .filter(([path]) => /\.(?:vsh|fsh|gsh|csh|tcs|tes|glsl|inc|properties)$/i.test(path))
      .map(([, text]) => String(text))
      .join('\n');
    return re.test(code);
  };
  return [
    { name: 'Shadow pass', native: true, used: file(/(?:^|\/)shadow(?:_\w+)?\.(?:vsh|fsh)$/) },
    {
      name: 'Deferred & composite passes',
      native: true,
      used: file(/(?:^|\/)(?:deferred|composite|prepare|begin)\d*\.fsh$/),
    },
    { name: 'Compute shaders', native: true, used: file(/\.csh$/) },
    { name: 'Custom shaderpack textures', native: true, used: prop(/^texture\./) },
    { name: 'Custom images', native: true, used: prop(/^image\./) },
    { name: 'Shader storage buffers', native: true, used: prop(/^bufferObject\./) },
    { name: 'Custom uniforms', native: true, used: prop(/^(?:uniform|variable)\./) },
    { name: 'Render target formats', native: true, used: src(/\b(?:colortex|gaux|shadowcolor)\d+Format\b/) },
    { name: 'Buffer flipping & mipmaps', native: true, used: prop(/^flip\./) || src(/\b\w+MipmapEnabled\b/) },
    { name: 'Blend modes & alpha tests', native: true, used: prop(/^(?:blend|alphaTest)\./) },
    { name: 'Render scaling', native: true, used: prop(/^(?:scale|size\.buffer)\./) },
    { name: 'Dimension folders', native: true, used: file(/^world-?\d+\//) || prop(/^dimension\./) },
    { name: 'Shader options & profiles', native: true, used: prop(/^(?:profile\.|screen)/) },
    { name: 'Geometry shaders', native: false, used: file(/\.gsh$/) },
    { name: 'Tessellation shaders', native: false, used: file(/\.(?:tcs|tes)$/) },
    {
      name: 'OpenGL compatibility profile',
      native: false,
      used: src(
        /\bftransform\s*\(|\bgl_(?:Color|Vertex|MultiTexCoord\d|ModelViewMatrix|ProjectionMatrix|FragData|FragColor)\b/,
      ),
    },
    { name: 'Float buffer filtering', native: false, used: src(/\b(?:RGBA|RGB|RG|R)(?:16|32F)\b/) },
    {
      name: '3-channel and packed formats',
      native: false,
      used: src(/\b(?:RGB8|RGB8_SNORM|RGB16|RGB16F|RGB32F|RGB565)\b/),
    },
    { name: '1D images', native: false, used: src(/\b[iu]?image1D\b/) },
    { name: 'Large shared memory', native: false, used: false },
    { name: 'Fixed-function alpha test', native: false, used: false },
    { name: 'AMD trinary min/max', native: false, used: src(/\b(?:min3|max3|mid3)\s*\(/) },
  ];
}
let settingsEscapeHandler = null;
function renderSettingsMenu() {
  const panel = document.getElementById('shaderSettings');
  panel.replaceChildren();
  if (!packSettings) {
    panel.textContent = 'Load a shaderpack first.';
    return;
  }
  const state = packSettings;
  let draft = { ...state.values },
    profile = state.profile,
    current = '',
    history = [];
  const sameValue = (a, b) => {
    if (typeof a === 'boolean' || typeof b === 'boolean')
      return (a === true || a === 'true') === (b === true || b === 'true');
    const x = Number(a),
      y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a) === String(b);
  };
  const matchingProfile = values => {
    for (const key of Object.keys(state.properties)) {
      if (!key.startsWith('profile.')) continue;
      let wanted;
      try {
        wanted = profileValues(state.properties, key.slice(8));
      } catch {
        continue;
      }
      const entries = Object.entries(wanted);
      if (
        entries.length &&
        entries.every(([name, value]) => sameValue(values[name] ?? state.options[name]?.value, value))
      )
        return key.slice(8);
    }
    return '';
  };
  const raw = (kind, name) =>
    String(state.language[kind + '.' + name] || name.replaceAll('_', ' ')).replace(/\\u00a7/g, '§');
  const el = (tag, cls, text) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const gui = (tag, cls, text, base) => {
    const item = el(tag, cls, guiClean(text));
    item.dataset.gui = text;
    if (base) item.dataset.guiBase = base;
    return item;
  };
  const button = (text, action, cls = 'gui-button') => {
    const item = el('button', cls);
    item.type = 'button';
    item.onclick = action;
    if (text !== '') {
      const label = gui('span', 'gui-label', text);
      item.append(label);
    }
    return item;
  };
  const close = () => {
    panel.hidden = true;
  };
  const head = el('header', 'gui-head');
  const subtitle = gui('p', '', '§oConfigure', '7');
  head.append(gui('h2', '', 'Shader Packs'), subtitle);
  const packbar = el('div', 'gui-packbar'),
    backSlot = el('div', 'gui-back-slot'),
    packTitle = gui('strong', 'gui-packname', '');
  packbar.append(backSlot, packTitle);
  const tools = el('div', 'gui-tools');
  const icon = (title, path, action) => {
    const item = el('button', 'gui-button gui-icon');
    item.type = 'button';
    item.title = title;
    item.setAttribute('aria-label', title);
    item.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="' +
      path +
      '"/></svg>';
    item.onclick = action;
    return item;
  };
  tools.append(
    icon('Import settings', 'M7 1h2v7h2l-3 4-3-4h2zM2 10h2v3h8v-3h2v5H2z', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.properties,text/plain';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const values = propertyMap(await file.text());
        for (const [name, value] of Object.entries(values)) {
          const option = state.options[name];
          if (!option) continue;
          draft[name] = option.kind === 'boolean' ? value === 'true' : value;
        }
        profile = matchingProfile(draft);
        draw();
      };
      input.click();
    }),
    icon('Export settings', 'M7 12h2V5h2L8 1 5 5h2zM2 10h2v3h8v-3h2v5H2z', () => {
      const lines = Object.keys(state.options)
        .sort()
        .filter(name => draft[name] !== undefined && String(draft[name]) !== String(state.options[name].value))
        .map(name => name + '=' + draft[name]);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }));
      link.download = state.label.replace(' (vorkonvertiert)', '').replace(/[^\w.-]+/g, '_') + '.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }),
  );
  const resetButton = button(
    'Reset',
    () => {
      draft = profileValues(state.properties, state.properties['profile.HIGH'] ? 'HIGH' : '');
      profile = state.properties['profile.HIGH'] ? 'HIGH' : '';
      draw();
    },
    'gui-button gui-reset',
  );
  tools.append(resetButton);
  packbar.append(tools);
  const list = el('div', 'gui-list'),
    content = el('div', 'gui-content'),
    grid = el('div', 'gui-grid'),
    warning = el('p', 'gui-warning');
  warning.setAttribute('role', 'status');
  content.append(grid);
  const requirements = el('div', 'gui-requirements');
  requirements.hidden = true;
  const requiredButton = button('Features', () => openFeatures());
  requiredButton.dataset.tooltip = 'What this pack uses, natively or emulated.';
  const footer = el('footer', 'gui-footer');
  list.append(packbar, content);
  panel.append(head, list, warning, requirements, footer);
  const featuresBox = el('div', 'gui-features');
  featuresBox.hidden = true;
  featuresBox.setAttribute('role', 'dialog');
  featuresBox.setAttribute('aria-modal', 'true');
  featuresBox.setAttribute('aria-label', 'Features');
  panel.append(featuresBox);
  const closeFeatures = () => {
    featuresBox.hidden = true;
    requiredButton.focus();
  };
  featuresBox.onclick = event => {
    if (event.target === featuresBox) closeFeatures();
  };
  const checkIcon = () => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 10 10');
    icon.setAttribute('class', 'gui-check');
    icon.setAttribute('shape-rendering', 'crispEdges');
    icon.setAttribute('aria-hidden', 'true');
    const pixels = [
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 5],
      [4, 4],
      [5, 3],
      [6, 2],
      [7, 1],
      [8, 0],
    ].flatMap(([x, y]) => [
      [x, y],
      [x, y + 1],
    ]);
    icon.innerHTML =
      pixels
        .map(([x, y]) => '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="1" height="1" fill="#153f15"/>')
        .join('') +
      pixels.map(([x, y]) => '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#55ff55"/>').join('');
    return icon;
  };
  const openFeatures = () => {
    const box = el('div', 'gui-features-box'),
      top = el('div', 'gui-features-head'),
      rows = el('div', 'gui-features-list'),
      foot = el('div', 'gui-features-foot');
    top.append(gui('h3', '', 'Features'), gui('p', '', '§7' + state.label.replace(' (vorkonvertiert)', '')));
    const features = shaderFeatureList(state);
    const row = feature => {
      const item = el('div', 'gui-feature' + (feature.native ? '' : ' gui-emulated'));
      item.append(
        gui('span', '', feature.name),
        gui('span', '', feature.native ? '§7(Native)' : '§6(Emulated)'),
        checkIcon(),
        gui('span', '', '§a: Supported'),
      );
      return item;
    };
    const group = (title, items) => {
      if (!items.length) return;
      rows.append(gui('div', 'gui-features-group', title, 'e'));
      for (const feature of items) rows.append(row(feature));
    };
    group(
      'Used by this pack',
      features.filter(feature => feature.used),
    );
    group(
      'Also supported',
      features.filter(feature => !feature.used),
    );
    const done = button('Done', closeFeatures);
    foot.append(done);
    box.append(top, rows, foot);
    featuresBox.replaceChildren(box);
    featuresBox.hidden = false;
    pixelizeMenu();
    done.focus();
  };
  const tooltip = el('div', 'gui-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  panel.append(tooltip);
  const showTooltip = target => {
    const row = target.closest?.('button[data-tooltip]');
    if (!row) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = row.dataset.tooltip;
    tooltip.hidden = false;
  };
  panel.onpointerover = event => showTooltip(event.target);
  panel.onpointerout = event => {
    if (!event.relatedTarget || !event.target.closest?.('button')?.contains(event.relatedTarget)) tooltip.hidden = true;
  };
  panel.onfocusin = event => showTooltip(event.target);
  panel.onfocusout = () => {
    tooltip.hidden = true;
  };
  const effective = values =>
    JSON.stringify(
      Object.keys(state.options)
        .sort()
        .map(name => [name, String(values[name] ?? state.options[name].value)]),
    );
  const dirty = () => effective(draft) !== effective(packSettings.values);
  const apply = async done => {
    if (shaderLoadBusy) return;
    if (!dirty()) {
      packSettings.profile = profile;
      if (done) close();
      else warning.textContent = 'No changes.';
      return;
    }
    const error = settingsCapabilityError(state, draft);
    if (error) {
      warning.textContent =
        'Unsupported: ' +
        inspectShaderRequirements(state, draft)
          .map(item => item.feature + ' (' + item.file + ')')
          .join(', ');
      return;
    }
    setShaderBusy(true);
    footer.querySelectorAll('button').forEach(item => (item.disabled = true));
    warning.textContent = 'Compiling shaders…';
    try {
      await loadZipData(state.zip, state.label, { profile, values: { ...draft } });
      if (done) close();
    } catch (error) {
      warning.textContent = error.message;
      setStatus(error.message, 'bad');
    } finally {
      setShaderBusy(false);
      footer.querySelectorAll('button').forEach(item => (item.disabled = false));
    }
  };
  const footerTop = el('div', 'gui-footer-row gui-footer-two'),
    footerBottom = el('div', 'gui-footer-row');
  footerTop.append(
    button('Open Shader Pack Folder...', () => {
      close();
      zipInput.click();
    }),
    button('Shader Pack List...', () => {
      close();
      autoLoad();
    }),
  );
  const cancel = button('Cancel', close),
    applyButton = button('Apply', () => apply(false)),
    doneButton = button('Done', () => apply(true));
  footerBottom.append(requiredButton, cancel, applyButton, doneButton);
  footer.append(footerTop, footerBottom);
  const draw = () => {
    grid.replaceChildren();
    packTitle.dataset.gui = current ? raw('screen', current) : '§l' + state.label.replace(' (vorkonvertiert)', '');
    packTitle.textContent = guiClean(packTitle.dataset.gui);
    delete packTitle.dataset.pixelized;
    backSlot.replaceChildren();
    if (current)
      backSlot.append(
        button(
          '§o< Back',
          () => {
            current = history.pop() || '';
            content.scrollTop = 0;
            draw();
          },
          'gui-button gui-back',
        ),
      );
    const defaults = Object.fromEntries(Object.entries(state.options).map(([name, option]) => [name, option.value]));
    resetButton.disabled = effective(draft) === effective(defaults) && !profile;
    const issues = inspectShaderRequirements(state, draft),
      issue = issues.length > 0;
    warning.textContent = issue
      ? 'Unsupported: ' + issues.map(item => item.feature + ' (' + item.file + ')').join(', ')
      : '';
    applyButton.disabled = issue || !dirty();
    doneButton.disabled = issue;
    requirements.replaceChildren();
    if (!issues.length) {
      const r = issues.resources || { images: [], buffers: [], compute: [] };
      requirements.append(
        el(
          'p',
          '',
          r.images.length || r.buffers.length || r.compute.length
            ? 'WebGPU runs ' +
                r.compute.length +
                ' compute programs, ' +
                r.images.length +
                ' Custom Image(s), ' +
                r.buffers.length +
                ' SSBO(s).'
            : 'No active compute, image or SSBO requirements in these pack properties.',
        ),
      );
    }
    for (const item of issues) {
      const entry = el('div', 'gui-requirement');
      entry.append(el('strong', '', item.feature), el('code', '', item.file), el('p', '', item.detail));
      requirements.append(entry);
    }
    let tokens = (state.properties[current ? 'screen.' + current : 'screen'] || '').split(/\s+/);
    if (!tokens.some(token => token)) tokens = Object.keys(state.options);
    for (const token of tokens) {
      if (!token) continue;
      if (token === '<empty>') {
        grid.append(el('span', 'gui-empty'));
        continue;
      }
      const nested = token.match(/^\[(\w+)\]$/);
      if (nested) {
        const item = button(raw('screen', nested[1]), () => {
          history.push(current);
          current = nested[1];
          content.scrollTop = 0;
          draw();
        });
        const comment = state.language['screen.' + nested[1] + '.comment'];
        if (comment) item.dataset.tooltip = guiClean(comment);
        grid.append(item);
        continue;
      }
      const isProfile = token === '<profile>',
        option = state.options[token];
      if (!isProfile && !option) {
        if (/^info\d+$/.test(token)) grid.append(gui('p', 'gui-info', raw('option', token)));
        continue;
      }
      const choices = isProfile
        ? Object.keys(state.properties)
            .filter(key => key.startsWith('profile.'))
            .map(key => key.slice(8))
        : option.choices;
      if (!choices.length) continue;
      const value = isProfile ? profile : (draft[token] ?? option.value);
      const applied = isProfile ? packSettings.profile : (packSettings.values[token] ?? option.value);
      const row = button('', () => cycle(1), 'gui-button gui-option' + (isProfile ? ' gui-profile' : ''));
      const changed = String(value) !== String(applied);
      const title = (changed ? '§e' : '') + (isProfile ? 'Profile' : raw('option', token)) + ':';
      const langValue = state.language['value.' + token + '.' + value];
      const text = isProfile
        ? value
          ? raw('profile', value)
          : '§eCustom'
        : langValue !== undefined
          ? String(langValue)
              .replace(/\\u00a7/g, '§')
              .trim()
          : typeof value === 'boolean'
            ? value
              ? '§aON'
              : '§cOFF'
            : String(value);
      row.append(gui('span', 'gui-label', title), gui('span', 'gui-value', text));
      row.dataset.tooltip = guiClean(
        state.language['option.' + token + '.comment'] ||
          (isProfile ? state.language['profile.comment'] || '' : raw('option', token)),
      );
      const cycle = direction => {
        const index = choices.findIndex(choice => String(choice) === String(value)),
          next = choices[(index + direction + choices.length) % choices.length];
        if (isProfile) {
          profile = next;
          draft = profileValues(state.properties, next);
        } else {
          draft[token] = next;
          profile = matchingProfile(draft);
        }
        draw();
      };
      row.oncontextmenu = event => {
        event.preventDefault();
        cycle(-1);
      };
      grid.append(row);
    }
    pixelizeMenu();
  };
  panel.onkeydown = event => {
    event.stopPropagation();
  };
  if (settingsEscapeHandler) document.removeEventListener('keydown', settingsEscapeHandler, true);
  settingsEscapeHandler = event => {
    if (event.key !== 'Escape' || panel.hidden || !panel.isConnected) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!featuresBox.hidden) closeFeatures();
    else if (current) {
      current = history.pop() || '';
      draw();
    } else close();
  };
  document.addEventListener('keydown', settingsEscapeHandler, true);
  draw();
}
