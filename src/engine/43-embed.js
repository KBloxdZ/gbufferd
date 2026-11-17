// when a page puts us in an iframe (gbufferd-embed.js) it drives evrything thru these postMessage calls
const embedMethods = {
  loadPack: (source, label) => loadTestPack(source instanceof ArrayBuffer ? new Uint8Array(source) : source, label),
  loadBuiltin: () => {
    if (!GB.hasBuiltin) throw new Error('this build has no built-in pack');
    return GB.loadBuiltin();
  },
  setTime: ticks => {
    setWorldTime(Number(ticks) || 0);
    return Number(ticks) || 0;
  },
  setWeather: kind => setWeather(kind),
  travel: dimension => {
    travelTo(dimension);
    return window.wgpuDimension;
  },
  getCamera: () => ({ x: cameraPosition[0], y: cameraPosition[1], z: cameraPosition[2], yaw, pitch }),
  setCamera: camera => {
    flying = true;
    if (Number.isFinite(camera?.x)) cameraPosition[0] = camera.x;
    if (Number.isFinite(camera?.y)) cameraPosition[1] = camera.y;
    if (Number.isFinite(camera?.z)) cameraPosition[2] = camera.z;
    if (Number.isFinite(camera?.yaw)) yaw = camera.yaw;
    if (Number.isFinite(camera?.pitch)) pitch = camera.pitch;
    return embedMethods.getCamera();
  },
  screenshot: type => captureFrame(type || 'image/png'),
  showUI: show => {
    document.body.classList.toggle('hide-ui', !show);
    return !!show;
  },
  openSettings: open => {
    GB.toggleSettings(open !== false);
    return open !== false;
  },
  getState: () => ({
    ready: !!gl,
    busy: GB.busy,
    pack: GB.packLabel,
    status: GB.status,
    programs: GB.programs,
    dimension: window.wgpuDimension,
    hasBuiltin: GB.hasBuiltin,
  }),
};
GB.embedMethods = embedMethods;

if (parent !== window) {
  addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== parent || message?.gbufferd !== 'call') return;
    const reply = data =>
      parent.postMessage({ gbufferd: 'reply', id: message.id, ...data }, event.origin === 'null' ? '*' : event.origin);
    const method = Object.hasOwn(embedMethods, message.method) ? embedMethods[message.method] : null;
    if (!method) return reply({ error: 'unknown method: ' + message.method });
    try {
      reply({ result: await method(...(Array.isArray(message.args) ? message.args : [])) });
    } catch (error) {
      reply({ error: String(error?.message || error) });
    }
  });
  const send = (name, detail) => parent.postMessage({ gbufferd: 'event', name, detail }, '*');
  for (const name of ['status', 'programs', 'pack', 'busy'])
    document.addEventListener('gbufferd-' + name, event => send(name, event.detail));
  const waitForEngine = () => (gl ? send('ready', embedMethods.getState()) : setTimeout(waitForEngine, 50));
  waitForEngine();
}
