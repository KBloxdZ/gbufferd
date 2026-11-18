// shader packs straight from modrinth. there api and cdn both answer with cors headers so the browser fetches
// the zip itself, we never host a pack and every pack keeps its own license
const MODRINTH_API = 'https://api.modrinth.com/v2';
const modrinthJson = async (path, missing) => {
  const response = await fetch(MODRINTH_API + path);
  if (response.status === 404 && missing) throw new Error(missing);
  if (!response.ok) throw new Error('Modrinth: HTTP ' + response.status);
  return response.json();
};
const notOnModrinth = project => 'Modrinth has no shaderpack called "' + project + '"';
const isZip = file => /\.zip$/i.test(file.filename);

GB.modrinthPack = null;
GB.modrinth = {
  async search(query = '', { offset = 0, limit = 24 } = {}) {
    const facets = encodeURIComponent(JSON.stringify([['project_type:shader']]));
    const index = query.trim() ? 'relevance' : 'downloads';
    const result = await modrinthJson(
      `/search?query=${encodeURIComponent(query.trim())}&facets=${facets}&index=${index}&offset=${offset}&limit=${limit}`,
    );
    return {
      total: result.total_hits,
      hits: result.hits.map(hit => ({
        id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        author: hit.author,
        description: hit.description,
        downloads: hit.downloads,
        icon: hit.icon_url || '',
      })),
    };
  },
  // newest release iris can load. modrinth lists versions newest first, betas only count when nothing else is there
  async latestFile(project) {
    const versions = await modrinthJson(`/project/${encodeURIComponent(project)}/version`, notOnModrinth(project));
    const zips = versions.filter(version => version.files.some(isZip));
    const forIris = zips.filter(version => version.loaders.includes('iris'));
    const pool = forIris.length ? forIris : zips;
    const version = pool.find(version => version.version_type === 'release') || pool[0];
    if (!version) throw new Error('Modrinth: ' + project + ' has no shader pack zip');
    const file = version.files.find(file => file.primary && isZip(file)) || version.files.find(isZip);
    return { version: version.version_number, url: file.url, filename: file.filename, size: file.size };
  },
  async load(project) {
    if (shaderLoadBusy) throw new Error('A pack is already loading');
    setStatus('Looking up ' + project + ' on Modrinth …', '', { type: 'loading', step: 'modrinth', project });
    const [info, file] = await Promise.all([
      modrinthJson('/project/' + encodeURIComponent(project), notOnModrinth(project)),
      GB.modrinth.latestFile(project),
    ]);
    const label = info.title + ' ' + file.version;
    GB.modrinthPack = { slug: info.slug, title: info.title, version: file.version, label };
    setStatus('Downloading ' + label + ' from Modrinth …', '', { type: 'loading', step: 'download', pack: label });
    const result = await loadTestPack(file.url, label);
    return { ...result, modrinth: { ...GB.modrinthPack } };
  },
};
// a pack from a file or url replaces the modrinth one, so the share link must not point at the old pack anymore
document.addEventListener('gbufferd-pack', event => {
  if (GB.modrinthPack && event.detail !== GB.modrinthPack.label) GB.modrinthPack = null;
});

embedMethods.loadModrinth = project => GB.modrinth.load(String(project));
embedMethods.searchModrinth = (query, options) => GB.modrinth.search(String(query ?? ''), options);
