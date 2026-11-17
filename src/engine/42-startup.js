// boot + url params for testin (?pack= ?dimension= ?time= ...)
async function autoLoad() {
  if (shaderLoadBusy) return;
  if (!EMBEDDED_SHADER_ZIP_BASE64) {
    setStatus('No shader pack loaded', 'good', { type: 'idle' });
    return;
  }
  setShaderBusy(true);
  try {
    const bytes = Uint8Array.from(atob(EMBEDDED_SHADER_ZIP_BASE64), character => character.charCodeAt(0));
    await loadZipData(bytes, 'Complementary Unbound r5.7.1');
  } catch (error) {
    setStatus(error.message, 'bad');
  } finally {
    setShaderBusy(false);
  }
}
async function loadTestPack(source, label) {
  if (shaderLoadBusy) throw new Error('Es lädt bereits ein Pack');
  label ??=
    typeof source === 'string' ? decodeURIComponent(source.split(/[?#]/)[0].split('/').pop()) : source?.name || 'Pack';
  setShaderBusy(true);
  const started = performance.now();
  shaderFailures = [];
  reportTestState({ label, busy: true, ok: null, ms: null, programs: null, failures: [] });
  try {
    let data = source;
    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) throw new Error(source + ': HTTP ' + response.status);
      data = await response.arrayBuffer();
    } else if (typeof source?.arrayBuffer === 'function') data = new Uint8Array(await source.arrayBuffer());
    else if (ArrayBuffer.isView(source))
      data = new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
    else if (Object.prototype.toString.call(source) === '[object ArrayBuffer]') data = new Uint8Array(source).slice();
    await loadZipData(data, label);
    reportTestState({ ok: true });
  } catch (error) {
    setStatus(error.message, 'bad');
    reportTestState({
      ok: false,
      failures: shaderFailures.length
        ? shaderFailures.map(({ name, message }) => ({ name, message }))
        : [{ name: 'Ladevorgang', message: error.message }],
    });
  } finally {
    setShaderBusy(false);
    zipInput.value = '';
    reportTestState({ busy: false, ms: Math.round(performance.now() - started), programs: GB.programs.summary });
  }
  return { ...testState };
}
async function startConfiguredShader() {
  let choice = GB.config.startShader;
  try {
    if (typeof choice === 'function') choice = await choice(GB);
  } catch (error) {
    setStatus('startShader: ' + error.message, 'bad');
    reportTestState({ ok: false, failures: [{ name: 'startShader', message: error.message }] });
    return;
  }
  if (choice === undefined || choice === 'builtin') return autoLoad();
  if (choice === null || choice === false || choice === 'none') {
    setStatus('No shader pack loaded', 'good', { type: 'idle' });
    return;
  }
  const wrapped = typeof choice === 'object' && 'source' in choice;
  return loadTestPack(wrapped ? choice.source : choice, wrapped ? choice.label : undefined);
}
GB.loadShader = loadTestPack;
GB.hasBuiltin = !!EMBEDDED_SHADER_ZIP_BASE64;
GB.loadBuiltin = () =>
  loadTestPack(
    Uint8Array.from(atob(EMBEDDED_SHADER_ZIP_BASE64), character => character.charCodeAt(0)),
    'Complementary Unbound',
  );
function startupLoad() {
  if (testParams.has('profile')) gl.setProfiling(true);
  if (testParams.has('time')) setWorldTime(+testParams.get('time'));
  if (testParams.has('yaw')) yaw = +testParams.get('yaw');
  if (testParams.has('pitch')) pitch = +testParams.get('pitch');
  if (['nether', 'end'].includes(testParams.get('dimension'))) travelTo(testParams.get('dimension'));
  if (testParams.has('weather')) {
    const kind = setWeather(testParams.get('weather'));
    if (kind !== 'clear') {
      window.wgpuWeather.rain = 1;
      window.wgpuWeather.wetness = 1;
      if (kind === 'thunder') window.wgpuWeather.thunder = 1;
    }
  }
  const pack = testParams.get('pack');
  if (pack === null && testParams.has('embed')) setStatus('No shader pack loaded', 'good', { type: 'idle' });
  else if (pack === null) startConfiguredShader();
  else if (pack) loadTestPack(pack);
  else setStatus('Test mode, no shader pack loaded', 'good', { type: 'idle' });
}
function captureFrame(type = 'image/png') {
  const copy = document.createElement('canvas');
  return new Promise((resolve, reject) => {
    let tries = 0;
    const started = performance.now();
    const attempt = () => {
      if (gl?.irisAsyncPipelines?.pending && performance.now() - started < 240000) {
        requestAnimationFrame(attempt);
        return;
      }
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d', { willReadFrequently: true });
      context.drawImage(canvas, 0, 0);
      const probe = context.getImageData(0, 0, copy.width, copy.height).data;
      let lit = false;
      for (let i = 0; i < probe.length && !lit; i += 4 * 997) lit = probe[i] + probe[i + 1] + probe[i + 2] > 0;
      if (lit) copy.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob fehlgeschlagen'))), type);
      else if (++tries < 60) requestAnimationFrame(attempt);
      else reject(new Error('Canvas blieb schwarz'));
    };
    requestAnimationFrame(attempt);
  });
}
window.shaderTest = {
  travel: dimension => travelTo(dimension),
  setWeather: kind => setWeather(kind),
  lightning: (distance = 40) => {
    spawnLightning(cameraPosition[0] + Math.sin(yaw) * distance, cameraPosition[2] - Math.cos(yaw) * distance);
    return window.wgpuWeather.bolts.length;
  },
  builtin: () =>
    loadTestPack(
      Uint8Array.from(atob(EMBEDDED_SHADER_ZIP_BASE64), character => character.charCodeAt(0)),
      'Complementary Unbound',
    ),
  get state() {
    return { ...testState };
  },
  load: loadTestPack,
  capture: captureFrame,
  showPanel(show = true) {
    document.body.classList.toggle('test-panel', show);
  },
  engine: () => gl,
  async readBuffer(binding, offset = 0, count = 16) {
    const buffer = gl.storageBuffers.get(binding);
    if (!buffer) return { error: 'kein SSBO ' + binding };
    const bytes = Math.min(count * 4, buffer.size - offset),
      read = gl.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = gl.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, offset, read, 0, bytes);
    gl.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const words = Array.from(new Uint32Array(read.getMappedRange()));
    read.unmap();
    read.destroy();
    return words;
  },
  async probe(pass, logical = 0, points = [[0.5, 0.5]]) {
    const steps = inspectorSteps(),
      index = steps.findIndex(step => step.pass === pass && step.kind === 'color' && step.logical === logical);
    if (index < 0)
      return {
        error: 'kein Schritt ' + pass + '/colortex' + logical,
        steps: steps.map(step => step.pass + '/' + step.logical),
      };
    inspectorList = steps;
    inspectorIndex = index;
    inspectorOpen = true;
    inspectorCapturedTexture = null;
    try {
      for (let i = 0; i < 60 && !inspectorCapturedTexture; i++)
        await new Promise(resolve => requestAnimationFrame(resolve));
      const texture = inspectorCapturedTexture;
      if (!texture) return { error: 'kein Snapshot' };
      const result = [];
      for (const [u, v] of points) {
        const x = Math.min(texture.width - 1, Math.floor(u * texture.width)),
          y = Math.min(texture.height - 1, Math.floor(v * texture.height));
        const read = await gl.readTexturePixels(texture, x, y, 1, 1);
        result.push({ x, y, value: read.texels?.[0] ?? 'nicht lesbar: ' + (read.format || texture.format) });
      }
      return { format: texture.format, result };
    } finally {
      inspectorOpen = false;
      inspectorRefresh();
    }
  },
};
{
  let frames = 0,
    since = performance.now();
  const count = now => {
    frames++;
    if (now - since >= 1000) {
      reportTestState({
        fps: Math.round((frames * 1000) / (now - since)),
        chunksPending: pendingChunkKeys.length + (meshJob ? 1 : 0),
        chunksBuilt: worldChunks.size,
        runtimeErrors: gl?.faults?.slice() || [],
        gpuPasses: testParams.has('profile')
          ? (gl?.profileReport?.() || []).slice(0, 8).map(([label, ms]) => label + ' ' + ms.toFixed(1) + ' ms')
          : undefined,
      });
      frames = 0;
      since = now;
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
}
if (testParams.has('test') || (testParams.has('pack') && !testParams.has('embed')))
  document.body.classList.add('test-mode');
if (testParams.has('noui')) document.body.classList.add('hide-ui');
document.getElementById('testBadge').addEventListener('click', () => document.body.classList.toggle('test-panel'));
addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'shader-test-capture') return;
  const reply = data => parent.postMessage({ type: 'shader-test-shot', id: event.data.id, ...data }, '*');
  captureFrame().then(
    blob => reply({ blob }),
    error => reply({ error: error.message }),
  );
});
function moveAcrossRiver() {
  const dx = Math.sin(yaw),
    dz = -Math.cos(yaw);
  let crossed = false,
    moved = false;
  for (let t = 1; t < 800 && !moved; t++) {
    const x = cameraPosition[0] + dx * t,
      z = cameraPosition[2] + dz * t,
      river = riverColumn(Math.floor(x), Math.floor(z));
    if (river.distance < river.width) crossed = true;
    else if (crossed && river.distance > river.width + 12) {
      cameraPosition[0] = x;
      cameraPosition[2] = z;
      yaw += Math.PI;
      moved = true;
    }
  }
  cameraPosition[1] =
    Math.max(
      RIVER_LEVEL,
      ...[-0.3, 0.3].flatMap(dx =>
        [-0.3, 0.3].map(dz => terrainHeight(Math.floor(cameraPosition[0] + dx), Math.floor(cameraPosition[2] + dz))),
      ),
    ) +
    1 +
    PLAYER_EYE_HEIGHT;
  meshJob = null;
  pendingChunkKeys = [];
  if (typeof pendingChunkRebuilds !== 'undefined') pendingChunkRebuilds.clear();
  for (const mesh of worldChunks.values()) destroyChunkMesh(mesh);
  worldChunks.clear();
  visibleChunkMeshes = [];
  ensureWorldGeometry(true);
  return moved;
}
addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'shader-test-move') return;
  const moved = moveAcrossRiver();
  reportTestState({ moveId: event.data.id, moved, chunksBuilt: 0, chunksPending: pendingChunkKeys.length });
});

async function init() {
  setStatus('Starting WebGPU and the shader compiler …', '', { type: 'starting' });
  gl = await IrisWebGPU.create(canvas, WEBGPU_COMPILER_SOURCE, setStatus);
  viewerSyncProfiling();
  maxColorAttachments = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
  renderSnormExtension = gl.getExtension('EXT_render_snorm');
  [fallbackProgram, presentProgram] = await Promise.all([
    createProgram(FALLBACK_VS, FALLBACK_FS, 'Eingebauter G-Buffer'),
    createProgram(PRESENT_VS, PRESENT_FS, 'Present'),
  ]);
  activeProgram = fallbackProgram;
  await createSourceTextures();
  GB.hooks.sourceTexturesReady();
  cameraPosition[1] =
    Math.max(
      ...[-0.3, 0.3].flatMap(dx =>
        [-0.3, 0.3].map(dz => terrainHeight(Math.floor(cameraPosition[0] + dx), Math.floor(cameraPosition[2] + dz))),
      ),
    ) +
    1 +
    PLAYER_EYE_HEIGHT;
  ensureWorldGeometry(true);
  streamWorldChunks(12);
  buildSkyGeometry();
  buildScreenGeometry();
  createShadowFramebuffer();
  resize();
  showProgramStates();
  setStatus('WebGPU ready, world built', 'good', { type: 'starting', step: 'world-ready' });
  requestAnimationFrame(render);
  startupLoad();
}

const settingsMenu = document.getElementById('shaderSettings');
settingsMenu.setAttribute('role', 'dialog');
settingsMenu.setAttribute('aria-modal', 'true');
settingsMenu.addEventListener('keydown', event => event.stopPropagation());
GB.toggleSettings = (open = settingsMenu.hidden) => {
  settingsMenu.hidden = !open;
  if (open) renderSettingsMenu();
};
GB.openPack = () => {
  if (!zipInput.disabled) zipInput.click();
};
zipInput.addEventListener('change', () => {
  const file = zipInput.files[0];
  if (file) loadTestPack(file).catch(() => {});
});
addEventListener('dragover', event => {
  event.preventDefault();
  document.body.classList.add('drop');
});
addEventListener('dragleave', () => document.body.classList.remove('drop'));
addEventListener('drop', event => {
  event.preventDefault();
  document.body.classList.remove('drop');
  const file = [...event.dataTransfer.files].find(file => file.name.toLowerCase().endsWith('.zip'));
  if (file) loadTestPack(file).catch(() => {});
});
canvas.addEventListener('click', async () => {
  if (canvas.ownerDocument.pointerLockElement === canvas) return;
  try {
    await canvas.requestPointerLock();
  } catch {}
});
document.addEventListener('mousemove', e => {
  if (canvas.ownerDocument.pointerLockElement !== canvas) return;
  yaw += e.movementX * 0.0024;
  pitch = Math.max(-1.54, Math.min(1.54, pitch - e.movementY * 0.0024));
});
document.addEventListener('pointerlockchange', () =>
  document.body.classList.toggle('playing', canvas.ownerDocument.pointerLockElement === canvas),
);
document.addEventListener('keydown', e => {
  if (e.code === 'F1') {
    document.body.classList.toggle('hide-ui');
    e.preventDefault();
    return;
  }
  if (canvas.ownerDocument.pointerLockElement !== canvas) return;
  if (
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(e.code)
  ) {
    pressedKeys.add(e.code);
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => pressedKeys.delete(e.code));
addEventListener('blur', () => pressedKeys.clear());
init().catch(error => setStatus(error.message, 'bad'));
