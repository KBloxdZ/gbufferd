// other sites embed gbufferd thru this, hosts only ever talk to the engine via GBufferd.*
window.GBufferd = (() => {
  'use strict';
  let host = null;
  try {
    host = window.gbufferdHost || (window.parent !== window ? window.parent.gbufferdHost : null) || null;
  } catch (error) {
    host = null;
  }
  const defaults = {
    nativeClockTicks: () => null,
    heldLightUniforms: () => ({}),
    nativeEffectUniforms: () => ({ nightVision: 0 }),
    warmGeometry: () => false,
    selectedBlock: () => null,
    animateAtlas: () => {},
    medium: () => 0,
    absolute: position => [...position],
    queueRebuilds: () => {},
    hasColumn: () => true,
    meshList: () => [],
    fieldAt: () => 0,
    sky: () => 0,
    meshSteps: function* () {},
    collides: () => false,
    localVoxel: () => 0,
    occludes: () => false,
    localSky: () => 0,
    applyCamera: () => {},
    drawShaderEntities: () => false,
    handWritesGbuffer: () => true,
    fogColor: () => [0, 0, 0],
    fog: () => ({ start: 0, end: 1 }),
    drawEntities: () => {},
    biomeUniforms: () => ({}),
    prepareShaderZip: zip => zip,
    shaderModuleInfo: module => module.getCompilationInfo(),
    setCompilePhase: () => {},
    noteCompilation: () => {},
    uniformInverse: null,
    adaptShaderSource: source => source,
    resolutionScale: () => 1,
    prepareEntities: () => {},
    resolutionSample: () => {},
    setClockSync: () => {},
    sourceTexturesReady: () => {},
    canvasSize: () => null,
    beforePresent: () => {},
  };
  const api = {
    version: 1,
    hosted: !!host,
    host,
    config: Object.assign({}, host?.config),
    hooks: { ...defaults },
    defaults,
    state: { active: false, visible: true, follow: false, fov: 0, renderOrigin: [0, 0, 0] },
    engine: null,
    booted: false,
    registerHooks(hooks) {
      for (const [name, fn] of Object.entries(hooks)) {
        if (!Object.hasOwn(defaults, name)) throw new Error('GBufferd: unbekannter Hook ' + name);
        if (typeof fn !== 'function') throw new Error('GBufferd: Hook ' + name + ' ist keine Funktion');
        api.hooks[name] = fn;
      }
      return api;
    },
    setState(state) {
      for (const key of ['active', 'visible', 'follow', 'fov', 'renderOrigin'])
        if (!(key in state)) throw new Error('GBufferd: state.' + key + ' fehlt');
      api.state = state;
      return api;
    },
    loadScript(source) {
      const script = document.createElement('script');
      script.textContent = "'use strict';\n" + source;
      let failure = null;
      const onError = event => {
        failure = event.error || new Error(event.message);
      };
      window.addEventListener('error', onError);
      try {
        (document.head || document.documentElement).appendChild(script);
      } finally {
        window.removeEventListener('error', onError);
      }
      script.remove();
      if (failure) throw failure;
      return api;
    },
    boot() {
      if (api.booted) return;
      api.booted = true;
      if (!host) return;
      if (api.config.title) document.title = api.config.title;
      if (api.config.css) {
        const style = document.createElement('style');
        style.textContent = api.config.css;
        document.head.appendChild(style);
      }
      for (const source of [].concat(host.source ?? [])) api.loadScript(source);
      host.boot?.(api);
    },
  };
  host?.attach?.(window, api);
  return api;
})();
