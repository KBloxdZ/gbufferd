const packEl = $('.cx-pack', root),
  statusEl = $('.cx-status', root),
  msgEl = $('.cx-msg', root),
  errBtn = $('.cx-errbtn', root);
const profileTag = $('[data-meta=profile]', root),
  programsTag = $('[data-meta=programs]', root);
const drawer = $('.cx-drawer', root),
  sheet = $('.cx-sheet', root),
  timeCard = $('.cx-time', root),
  range = $('.cx-dial', root);
const toastEl = $('.cx-toast', root),
  more = $('.cx-more', root),
  moreToggle = $('summary', more);
const btn = act => $(`[data-act=${act}]`, root);

let toastTimer = 0;
const toast = text => {
  toastEl.textContent = String(text).replace(/\s+·\s+/g, ', ');
  toastEl.classList.add('cx-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('cx-show'), 2600);
};

const english = text =>
  String(text)
    .replace(/Shader-Programme kompiliert/g, 'shader programs compiled')
    .replace(/Programme aktiv/g, 'programs active')
    .replace(/Programme/g, 'programs')
    .replace(/Benutzerdefiniert/g, 'Custom')
    .replace(/Zeit (?=\d)/g, 'Time ')
    .replace(/Shader-Pack nicht übernommen/g, 'Shaderpack could not be loaded')
    .replace(/Flugmodus an/g, 'Flight enabled')
    .replace(/Flugmodus aus/g, 'Flight disabled')
    .replace(/vorkonvertiert/g, 'preconverted')
    .replace(/bereit/g, 'ready')
    .replace(/Fehler/g, 'Error')
    .replace(/wird kompiliert/g, 'compiling')
    .replace(/Shader werden kompiliert/g, 'Compiling shaders')
    .replace(/Shader-Pack wird geladen/g, 'Loading shaderpack')
    .replace(/Wird geladen/g, 'Loading')
    .replace(/Eigene Texturen werden gelesen/g, 'Reading custom textures')
    .replace(/WebGPU und eingebetteter Shader-Compiler starten/g, 'Starting WebGPU and shader compiler')
    .replace(/Chunk-Welt bereit/g, 'World ready')
    .replace(/Das bisherige Pack bleibt aktiv/g, 'The previous shaderpack remains active')
    .replace(/Shader deaktiviert \(Vanilla\)/g, 'Shaders disabled (vanilla)')
    .replace(/Shader deaktiviert/g, 'shaders disabled')
    .replace(/von (\d+) programsn? fehlgeschlagen/g, 'of $1 programs failed')
    .replace(/F9 zeigt die Details/g, 'F9 shows the details');

let lastPack = '';
const syncPack = () => {
  const raw = gbufferd.packLabel || 'Shader Viewer';
  if (raw === lastPack) return;
  lastPack = raw;
  packEl.textContent = english(raw);
  packEl.title = english(raw);
  profileTag.hidden = true;
};
const syncStatus = () => {
  const status = gbufferd.status || {};
  const text = status.message || '',
    kind = status.kind || '';
  statusEl.dataset.kind = kind;
  msgEl.textContent = english(text);
  msgEl.title = msgEl.textContent;
  if (status.type === 'loaded') {
    profileTag.hidden = false;
    profileTag.innerHTML = 'Current Profile: <b></b>';
    profileTag.lastChild.textContent = english(status.profile);
  }
  const failures = window.shaderTest?.state?.failures || [];
  const errors = kind === 'bad' || failures.length > 0,
    errorsItem = btn('errors');
  errBtn.hidden = true;
  if (errorsItem) {
    errorsItem.disabled = !errors;
    errorsItem.title = errors ? 'Show shader errors (F9)' : 'No shader errors';
  }
  statusEl.dataset.idle = String(status.type === 'loaded');
};
const syncPrograms = () => {
  const text = gbufferd.programs?.summary || '';
  const list = gbufferd.programs?.list || [];
  const m = gbufferd.programs?.total != null;
  const stages = list.filter(({ name }) =>
    /^(?:deferred|composite|prepare|begin|shadowcomp|setup)\d*(?:_[a-z])?$|^final$/.test(name),
  ).length;
  programsTag.hidden = !m;
  if (m) {
    programsTag.innerHTML = '<b></b> Deferred Stages';
    programsTag.firstChild.textContent = String(stages);
  }
  $('.cx-sum', root).textContent = english(text);
  $('.cx-list', root).replaceChildren(
    ...list.flatMap(({ name, state }) => {
      const label = document.createElement('span'),
        value = document.createElement('span');
      label.textContent = name;
      value.textContent = english(state);
      value.className = state === 'ready' ? 'ok' : state === 'failed' ? 'fail' : '';
      return [label, value];
    }),
  );
};
const syncBusy = () => {
  const busy = !!gbufferd.busy;
  document.documentElement.classList.toggle('cx-busy', busy);
  if (busy && document.pointerLockElement) document.exitPointerLock?.();
  btn('open').disabled = busy;
  if (btn('builtin')) btn('builtin').disabled = busy;
};
for (const [name, sync] of [
  ['pack', syncPack],
  ['status', syncStatus],
  ['programs', syncPrograms],
  ['busy', syncBusy],
]) {
  document.addEventListener('gbufferd-' + name, sync);
  sync();
}
