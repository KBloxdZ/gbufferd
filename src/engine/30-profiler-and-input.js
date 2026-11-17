let viewerPaneMonitoring = false;
const viewerSyncProfiling = () => {
  if (!gl) return;
  const wanted = viewerPaneMonitoring || !profileBox.hidden || testParams.has('profile');
  gl.viewerMonitoring = wanted;
  if (wanted && !gl.profiling) gl.setProfiling(true);
  else if (!wanted && gl.viewerProfileOwned) gl.setProfiling(false);
  gl.viewerProfileOwned = wanted;
};
GB.pipeline = {
  monitor(enabled) {
    viewerPaneMonitoring = !!enabled;
    viewerSyncProfiling();
  },
  reset() {
    gl?.viewerDisabledPrograms?.clear();
    gl?.viewerCpuStats?.clear();
    gl?.profileStats?.clear();
    temporalHistoryValid = false;
    irisSetupPending = true;
  },
  toggle(key, enabled) {
    if (!gl) return false;
    const split = key.indexOf(':'),
      kind = key.slice(0, split),
      name = key.slice(split + 1);
    const program =
      kind === 'compute' ? computePrograms.get(name) : gbufferPrograms.get(name) || pipelinePrograms.get(name);
    if (!program) return false;
    gl.viewerDisabledPrograms ??= new Set();
    if (enabled) gl.viewerDisabledPrograms.delete(program);
    else gl.viewerDisabledPrograms.add(program);
    gl.profileStats?.delete(kind === 'compute' ? 'Compute ' + name : name);
    gl.viewerCpuStats?.delete(kind + ':' + name);
    temporalHistoryValid = false;
    irisSetupPending = true;
    return true;
  },
  snapshot() {
    const gpuAvailable = !!gl?.device.features.has('timestamp-query');
    const gpu = new Map(gl?.profileReport?.() || []),
      cpu = gl?.cpuReport?.();
    const rows = [],
      claimed = new Set();
    const add = (name, program, kind) => {
      const label = kind === 'compute' ? 'Compute ' + name : name;
      claimed.add(label);
      rows.push({
        key: kind + ':' + name,
        name,
        kind,
        enabled: !gl?.viewerDisabledPrograms?.has(program),
        gpu: gpuAvailable ? (gpu.get(label) ?? null) : null,
        cpu: gl?.viewerCpuStats?.get(kind + ':' + name) ?? null,
      });
    };
    for (const [name, program] of [...gbufferPrograms, ...pipelinePrograms]) add(name, program, 'render');
    for (const [name, program] of computePrograms) add(name, program, 'compute');
    const overhead = [...gpu].filter(([name]) => !claimed.has(name)).map(([name, ms]) => ({ name, gpu: ms }));
    let previous = 0;
    const cpuPhases = (cpu?.marks || []).map(([name, at]) => {
      const ms = Math.max(0, at - previous);
      previous = at;
      return { name, ms };
    });
    if (cpu) cpuPhases.push({ name: 'Postprocessing & submission', ms: Math.max(0, cpu.frame - previous) });
    const recent = profileFrames.length && performance.now() - profileFrames.at(-1) < 1500;
    return {
      rows,
      overhead,
      cpuPhases,
      gpuAvailable,
      monitoring: !!gl?.viewerMonitoring,
      gpu: gpuAvailable && gpu.size ? [...gpu.values()].reduce((sum, ms) => sum + ms, 0) : null,
      cpu: cpu?.frame ?? null,
      draws: cpu?.draws ?? 0,
      fps: recent ? profileFrames.length : 0,
      frametime: recent ? viewerFrameInterval : null,
      worldTime: WORLD_TIME,
      frameCounter: renderedFrameCounter,
      profile: packSettings?.profile || 'Custom',
    };
  },
};

const profileBox = document.createElement('pre');
profileBox.id = 'gpuProfile';
profileBox.hidden = true;
document.body.append(profileBox);
let profileFrames = [],
  vsyncFrames = [],
  lastCountedFrame = 0,
  viewerLastFrameTime = null,
  viewerFrameInterval = null;
(function countFrames(t) {
  vsyncFrames.push(t);
  while (vsyncFrames.length && t - vsyncFrames[0] > 1000) vsyncFrames.shift();
  if (renderedFrameCounter !== lastCountedFrame) {
    if (viewerLastFrameTime !== null) {
      const delta = t - viewerLastFrameTime;
      viewerFrameInterval = viewerFrameInterval === null ? delta : viewerFrameInterval * 0.8 + delta * 0.2;
    }
    viewerLastFrameTime = t;
    lastCountedFrame = renderedFrameCounter;
    profileFrames.push(t);
  }
  while (profileFrames.length && t - profileFrames[0] > 1000) profileFrames.shift();
  requestAnimationFrame(countFrames);
})(performance.now());
setInterval(() => {
  if (profileBox.hidden || !gl?.profileReport) return;
  const rows = gl.profileReport(),
    total = rows.reduce((sum, [, ms]) => sum + ms, 0);
  const cpu = gl.cpuReport?.();
  let head =
    'GPU-Zeit pro Frame (F4)\n' +
    profileFrames.length +
    ' FPS gezeichnet · ' +
    vsyncFrames.length +
    ' Hz Bildschirm · GPU ' +
    total.toFixed(2) +
    ' ms';
  if (cpu) {
    let previous = 0;
    const steps = cpu.marks.map(([label, at]) => {
      const ms = at - previous;
      previous = at;
      return ms.toFixed(2).padStart(7) + ' ms  ' + label;
    });
    head +=
      ' · CPU ' +
      cpu.frame.toFixed(2) +
      ' ms · ' +
      cpu.draws +
      ' Draws\n\nCPU:\n' +
      steps.join('\n') +
      '\n' +
      (cpu.frame - previous).toFixed(2).padStart(7) +
      ' ms  Post + Rest\n';
  }
  profileBox.textContent =
    head +
    '\nGPU:\n' +
    rows
      .slice(0, 20)
      .map(([label, ms]) => ms.toFixed(2).padStart(7) + ' ms  ' + label)
      .join('\n');
}, 500);
document.addEventListener('keydown', event => {
  if (event.code !== 'F4') return;
  event.preventDefault();
  if (document.documentElement.classList.contains('cx')) {
    document.dispatchEvent(new CustomEvent('gbufferd-pipeline-toggle'));
    return;
  }
  const enable = profileBox.hidden;
  if (enable && !gl?.setProfiling?.(true)) {
    profileBox.hidden = false;
    profileBox.textContent = 'GPU-Profiler: Dieser Browser/Adapter bietet kein "timestamp-query".';
    return;
  }
  profileBox.hidden = !enable;
  viewerSyncProfiling();
});

function handlePlayerKey(event) {
  if (canvas.ownerDocument.pointerLockElement !== canvas || !document.getElementById('shaderSettings').hidden) return;
  if (event.code === 'Space' && !event.repeat) {
    const now = performance.now();
    if (now - lastSpacePress < 300) {
      flying = !flying;
      verticalVelocity = 0;
      jumpRequested = false;
      lastSpacePress = -Infinity;
      setStatus(flying ? 'Flying on' : 'Flying off', 'good', { setting: 'flying', on: flying });
    } else {
      lastSpacePress = now;
      jumpRequested = true;
    }
  }
}
function releasePlayerInput() {
  pressedKeys.clear();
  miningHeld = false;
  jumpRequested = false;
  lastSpacePress = -Infinity;
}
document.addEventListener('keydown', handlePlayerKey);
canvas.addEventListener('mousedown', event => {
  if (event.button === 0 && canvas.ownerDocument.pointerLockElement === canvas) {
    miningHeld = true;
    mineBlock();
    nextMineTime = performance.now() + 250;
    event.preventDefault();
  }
});
document.addEventListener('mouseup', event => {
  if (event.button === 0) miningHeld = false;
});
document.addEventListener('pointerlockchange', () => {
  if (canvas.ownerDocument.pointerLockElement !== canvas) releasePlayerInput();
});
addEventListener('blur', releasePlayerInput);
