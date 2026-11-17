// F8 pass list, pass on/off and the per buffer write switches
{
  const insp = () => window.GBufferd?.inspector,
    panel = $('.cx-insp', root),
    list = $('.cx-insp-list', root),
    modesBar = $('.cx-insp-modes', root),
    info = $('.cx-insp-info', root),
    cross = $('.cx-insp-cross', root);
  const groups = [
    ['Shadow', /^shadow/, '#b48cff'],
    ['Compute', /^compute:/, '#ffad5c'],
    ['Setup', /^(?:setup|begin|prepare)/, '#e8d36a'],
    ['G-Buffers', /^(?:gbuffers_|clrwl_)/, '#8fd16a'],
    ['Deferred', /^deferred/, '#6ab4ff'],
    ['Composite', /^composite/, '#5fd3c4'],
    ['Final', /^final/, '#f0f1e9'],
  ];
  const groupOf = pass => groups.find(([, re]) => re.test(pass)) || ['Other', /./, '#bcc1b5'];
  let listKey = '',
    modeKey = '';
  const value = v =>
    !Number.isFinite(v)
      ? '–'
      : Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.001)
        ? v.toExponential(2)
        : v.toFixed(4);
  const render = () => {
    const api = insp(),
      open = !!api?.open;
    document.documentElement.classList.toggle('cx-insp', open);
    panel.hidden = modesBar.hidden = info.hidden = cross.hidden = !open;
    if (!open) {
      listKey = '';
      return;
    }
    const steps = api.steps(),
      index = api.index,
      key = JSON.stringify(steps.map(s => [s.pass, s.name, s.format]));
    if (key !== listKey) {
      listKey = key;
      list.replaceChildren();
      let lastGroup = null,
        lastPass = null,
        bufs = null,
        gbox = null;
      steps.forEach((step, i) => {
        const [title, , color] = groupOf(step.pass);
        if (title !== lastGroup) {
          lastGroup = title;
          lastPass = null;
          gbox = document.createElement('div');
          gbox.className = 'cx-insp-gbox';
          gbox.style.setProperty('--c', color);
          const label = document.createElement('div');
          label.className = 'cx-insp-glabel';
          label.textContent = title;
          gbox.append(label);
          list.append(gbox);
        }
        if (step.pass !== lastPass) {
          lastPass = step.pass;
          const box = document.createElement('div');
          box.className = 'cx-insp-pass';
          box.style.setProperty('--c', color);
          const name = document.createElement('b');
          name.textContent =
            step.pass.replace(/^compute:/, '') + (step.pass.startsWith('compute:') ? ' (compute)' : '');
          bufs = document.createElement('div');
          bufs.className = 'cx-insp-bufs';
          const head = document.createElement('div');
          head.className = 'cx-insp-passhead';
          head.append(name);
          if (step.kind !== 'final') {
            const power = document.createElement('button');
            power.type = 'button';
            power.className = 'cx-insp-power';
            power.dataset.pass = step.pass;
            power.title = 'Run this pass (click to switch the whole pass off/on)';
            power.addEventListener('click', () => {
              const api = insp();
              if (!api) return;
              api.setPass(step.pass, !api.passEnabled(step.pass));
              document.dispatchEvent(new CustomEvent('gbufferd-inspector'));
              if (api.paused)
                try {
                  api.replay();
                } catch (e) {
                  console.warn(e);
                }
            });
            head.append(power);
          }
          box.dataset.pass = step.pass;
          box.append(head, bufs);
          gbox.insertBefore(box, gbox.lastChild);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cx-insp-buf';
        b.dataset.index = String(i);
        const label = document.createElement('span');
        label.textContent = step.name;
        if (step.note) {
          const s = document.createElement('small');
          s.textContent = step.note;
          label.append(s);
        }
        b.append(label);
        if (step.format) {
          const f = document.createElement('em');
          f.textContent = step.format.replace(/\s*→.*$/, '');
          b.append(f);
        }
        b.addEventListener('click', () => {
          insp()?.select(i);
        });
        const row = document.createElement('div');
        row.className = 'cx-insp-row';
        row.append(b);
        if (step.kind === 'color') {
          const pen = document.createElement('button');
          pen.type = 'button';
          pen.className = 'cx-insp-pen';
          pen.textContent = '✎';
          pen.dataset.pass = step.pass;
          pen.dataset.logical = String(step.logical);
          pen.addEventListener('click', () => {
            const api = insp();
            if (!api) return;
            api.setWrite(step.pass, step.logical, !api.writeEnabled(step.pass, step.logical));
            document.dispatchEvent(new CustomEvent('gbufferd-inspector'));
            if (api.paused)
              try {
                api.replay();
              } catch (e) {
                console.warn(e);
              }
          });
          row.append(pen);
        }
        bufs.append(row);
      });
    }
    for (const b of list.querySelectorAll('.cx-insp-buf')) {
      const on = Number(b.dataset.index) === index;
      b.setAttribute('aria-pressed', String(on));
      if (on && b.dataset.scrolled !== '1') {
        b.scrollIntoView({ block: 'nearest' });
      }
      b.dataset.scrolled = on ? '1' : '';
    }
    for (const pen of list.querySelectorAll('.cx-insp-pen')) {
      const on = api.writeEnabled(pen.dataset.pass, Number(pen.dataset.logical));
      pen.setAttribute('aria-pressed', String(on));
      pen.title = on
        ? 'This pass writes into this buffer (click to switch the write off)'
        : 'Write switched off: the buffer keeps what it had before this pass (click to switch on)';
      pen.parentElement.classList.toggle('cx-off', !on);
    }
    for (const power of list.querySelectorAll('.cx-insp-power')) {
      const on = api.passEnabled(power.dataset.pass);
      power.setAttribute('aria-pressed', String(on));
      power.textContent = on ? 'ON' : 'OFF';
      power.closest('.cx-insp-pass')?.classList.toggle('cx-off', !on);
    }
    const mk = api.modes.join('|') + ':' + api.mode;
    if (mk !== modeKey) {
      modeKey = mk;
      modesBar.replaceChildren(
        ...api.modes.map((label, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label
            .replace('(tonemapped)', '')
            .replace('linear geklemmt', 'linear')
            .replace(/^nur /, '')
            .replace('Betrag ', '|v| ')
            .replace('Normalen', 'Normals')
            .replace('Tiefe linear', 'Depth')
            .replace('Gruen', 'Green')
            .replace('Rot', 'Red')
            .replace('Blau', 'Blue')
            .trim();
          b.title = label;
          b.setAttribute('aria-pressed', String(i === api.mode));
          b.addEventListener('click', () => insp()?.setMode(i));
          return b;
        }),
      );
    }
    const step = steps[index],
      data = api.info();
    info.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = step ? step.name : '–';
    const sub = document.createElement('p');
    sub.textContent = step
      ? step.pass.replace(/^compute:/, '') +
        (data.texture ? ', ' + data.texture.width + '×' + data.texture.height + ' ' + data.texture.format : '')
      : '';
    info.append(h, sub);
    const probe = data.probe;
    if (data.missed) {
      const n = document.createElement('div');
      n.className = 'cx-insp-note';
      n.textContent = 'This pass did not run this frame (nothing to show).';
      info.append(n);
    }
    if (step && step.kind !== 'final' && !data.missed) {
      if (!probe) {
        const n = document.createElement('div');
        n.className = 'cx-insp-note';
        n.textContent = 'Reading the centre pixel…';
        info.append(n);
      } else if (probe.unsupported) {
        const n = document.createElement('div');
        n.className = 'cx-insp-note';
        n.textContent = 'This format cannot be read back.';
        info.append(n);
      } else {
        const [r = 0, g = 0, b = 0, a = 0] = probe.texels?.[0] || [];
        const px = document.createElement('div');
        px.className = 'cx-insp-px';
        const sw = document.createElement('div');
        sw.className = 'cx-insp-swatch';
        const c = v => Math.round(Math.max(0, Math.min(1, v)) * 255);
        sw.style.background = 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
        const vals = document.createElement('div');
        vals.className = 'cx-insp-vals';
        for (const [ch, v, col] of [
          ['R', r, '#ff6b6b'],
          ['G', g, '#7be07b'],
          ['B', b, '#6ba8ff'],
          ['A', a, '#e6e6e6'],
        ]) {
          const row = document.createElement('div'),
            l = document.createElement('b'),
            bar = document.createElement('i'),
            n = document.createElement('span');
          l.textContent = ch;
          l.style.color = col;
          bar.style.setProperty('--v', Math.max(0, Math.min(1, v)) * 100 + '%');
          bar.style.setProperty('--c', col);
          n.textContent = value(v);
          row.append(l, bar, n);
          vals.append(row);
        }
        px.append(sw, vals);
        info.append(px);
        const n = document.createElement('div');
        n.className = 'cx-insp-note';
        n.textContent = 'Centre pixel (' + (probe.origin || []).join(', ') + '), marked by the crosshair';
        info.append(n);
      }
    }
  };
  document.addEventListener('gbufferd-inspector', render);
  $('[data-insp-close]', root).addEventListener('click', () => insp()?.toggle(false));
}
