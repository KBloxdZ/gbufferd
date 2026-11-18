// modrinth browser: search box, a list of packs, one click loads the newest zip. the engine side is GBufferd.modrinth
const browse = $('.cx-browse', root),
  browseInput = $('input', browse),
  browseList = $('.cx-browse-list', browse),
  shareBtn = $('[data-browse-share]', browse);
panes.browse = browse;
const toggleBrowse = force => {
  const open = force ?? browse.hidden;
  showPane('browse', open);
  if (open) {
    if (!browseList.childElementCount) runSearch();
    browseInput.focus();
  }
};
actions.browse = () => toggleBrowse();

const shortNumber = n =>
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n);

let searchToken = 0,
  shown = 0,
  total = 0,
  lastQuery = null;
const browseNote = text => {
  const note = document.createElement('p');
  note.className = 'cx-browse-note';
  note.textContent = text;
  return note;
};
function packCard(hit) {
  const item = document.createElement('div');
  item.className = 'cx-pack-card';
  item.setAttribute('role', 'listitem');
  const load = document.createElement('button');
  load.type = 'button';
  load.className = 'cx-pack-load';
  load.dataset.slug = hit.slug;
  load.disabled = !!gbufferd.busy;
  load.title = 'Load ' + hit.title;
  const icon = document.createElement('img');
  icon.alt = '';
  icon.loading = 'lazy';
  icon.decoding = 'async';
  if (hit.icon) icon.src = hit.icon;
  else icon.classList.add('cx-noicon');
  const text = document.createElement('span');
  text.className = 'cx-pack-text';
  const title = document.createElement('b');
  title.textContent = hit.title;
  const meta = document.createElement('small');
  meta.textContent = 'by ' + hit.author + ', ' + shortNumber(hit.downloads) + ' downloads';
  const description = document.createElement('span');
  description.className = 'cx-pack-desc';
  description.textContent = hit.description;
  text.append(title, meta, description);
  load.append(icon, text);
  const page = document.createElement('a');
  page.className = 'cx-pack-page';
  page.href = 'https://modrinth.com/shader/' + encodeURIComponent(hit.slug);
  page.target = '_blank';
  page.rel = 'noopener';
  page.title = 'Open on Modrinth';
  page.setAttribute('aria-label', hit.title + ' on Modrinth');
  page.innerHTML = svg('external');
  item.append(load, page);
  return item;
}
async function runSearch(append = false) {
  const query = browseInput.value;
  if (!append && query === lastQuery && browseList.childElementCount) return;
  const token = ++searchToken;
  if (!append) {
    lastQuery = query;
    shown = 0;
    browseList.replaceChildren(browseNote('Searching …'));
  }
  try {
    const result = await gbufferd.modrinth.search(query, { offset: shown, limit: 24 });
    if (token !== searchToken) return;
    total = result.total;
    if (!append) browseList.replaceChildren();
    browseList.querySelector('.cx-browse-more')?.remove();
    for (const hit of result.hits) browseList.append(packCard(hit));
    shown += result.hits.length;
    if (!shown) browseList.append(browseNote('No shaderpacks found for "' + query.trim() + '"'));
    if (shown < total && result.hits.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'cx-reset cx-browse-more';
      more.textContent = 'Show more';
      browseList.append(more);
    }
  } catch (error) {
    if (token !== searchToken) return;
    browseList.replaceChildren(browseNote('Modrinth did not answer: ' + error.message));
    lastQuery = null;
  }
}
let searchTimer = 0;
browseInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 280);
});
browseInput.addEventListener('keydown', event => {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    toggleBrowse(false);
    btn('browse').focus();
  } else if (event.key === 'Enter') {
    clearTimeout(searchTimer);
    runSearch();
  }
});
browseList.addEventListener('click', async event => {
  if (event.target.closest('.cx-browse-more')) {
    event.target.closest('.cx-browse-more').disabled = true;
    runSearch(true);
    return;
  }
  const load = event.target.closest('.cx-pack-load');
  if (!load || gbufferd.busy) return;
  const title = load.querySelector('b').textContent;
  for (const button of browseList.querySelectorAll('.cx-pack-load')) button.disabled = true;
  load.classList.add('cx-loading');
  toast('Downloading ' + title + ' from Modrinth');
  try {
    const result = await gbufferd.modrinth.load(load.dataset.slug);
    if (result?.ok === false) toast(title + ' could not be loaded, F9 shows why');
  } catch (error) {
    toast(error.message);
  } finally {
    load.classList.remove('cx-loading');
    for (const button of browseList.querySelectorAll('.cx-pack-load')) button.disabled = !!gbufferd.busy;
    syncShare();
  }
});

// the address bar always points at the modrinth pack thats running, so copying the url shares it
const embedded = params.has('embed');
function syncShare() {
  const pack = gbufferd.modrinthPack;
  shareBtn.hidden = !pack;
  if (embedded) return;
  const url = new URL(location.href);
  if (pack) url.searchParams.set('modrinth', pack.slug);
  else url.searchParams.delete('modrinth');
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}
document.addEventListener('gbufferd-pack', () => setTimeout(syncShare));
// a broken ?modrinth= link fails before any panel is open, the status line is hidden so say it out loud
document.addEventListener('gbufferd-status', () => {
  const status = gbufferd.status || {};
  if (status.type !== 'error' || !/modrinth/i.test(status.message || '')) return;
  toast(status.message);
  if (browse.hidden && !gbufferd.packLabel) toggleBrowse(true);
});
shareBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Link copied, it opens ' + gbufferd.modrinthPack?.title);
  } catch {
    toast(location.href);
  }
});
document.addEventListener('gbufferd-busy', () => {
  if (browse.hidden) return;
  for (const button of browseList.querySelectorAll('.cx-pack-load'))
    if (!button.classList.contains('cx-loading')) button.disabled = !!gbufferd.busy;
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (document.pointerLockElement || (settings && !settings.hidden)) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
  if (event.key === 'Escape' && !browse.hidden) {
    toggleBrowse(false);
    btn('browse').focus();
    event.preventDefault();
  } else if (
    event.key.toLowerCase() === 'b' &&
    !(document.body.classList.contains('test-mode') && !document.body.classList.contains('test-panel'))
  ) {
    toggleBrowse();
    event.preventDefault();
  }
});
