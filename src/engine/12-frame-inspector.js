const wgpuWriteOff = new Set();
function wgpuProgramFor(pass) {
  if (pass.startsWith('compute:')) return computePrograms.get(pass.slice(8));
  if (pass === 'gbuffers_skybasic' && skyProgram) return skyProgram;
  return gbufferPrograms.get(pass) || pipelinePrograms.get(pass) || resolveIrisProgram(gbufferPrograms, pass)?.program;
}
function wgpuWriteMaskFor(program) {
  if (!wgpuWriteOff.size || !gl.wgpuSlotLogical) return null;
  const names = [programNames.get(program)];
  if (program === skyProgram) names.push('gbuffers_skybasic');
  let off = null;
  gl.wgpuSlotLogical.forEach((logical, slot) => {
    for (const name of names) if (name && wgpuWriteOff.has(name + '|' + logical)) (off ??= new Set()).add(slot);
  });
  return off;
}
Object.assign(GB.inspector, {
  writeEnabled(pass, logical) {
    return !wgpuWriteOff.has(pass + '|' + logical);
  },
  setWrite(pass, logical, enabled) {
    const key = pass + '|' + logical;
    if (enabled) wgpuWriteOff.delete(key);
    else wgpuWriteOff.add(key);
    temporalHistoryValid = false;
  },
  passEnabled(pass) {
    const program = wgpuProgramFor(pass);
    return !program || !gl?.viewerDisabledPrograms?.has(program);
  },
  setPass(pass, enabled) {
    const program = wgpuProgramFor(pass);
    if (!program || !gl) return false;
    gl.viewerDisabledPrograms ??= new Set();
    if (enabled) gl.viewerDisabledPrograms.delete(program);
    else gl.viewerDisabledPrograms.add(program);
    temporalHistoryValid = false;
    return true;
  },
  writeSwitchCount() {
    return wgpuWriteOff.size + (gl?.viewerDisabledPrograms?.size || 0);
  },
  enableAll() {
    wgpuWriteOff.clear();
    gl?.viewerDisabledPrograms?.clear();
    temporalHistoryValid = false;
  },
});
Object.defineProperty(GB.inspector, 'paused', {
  get() {
    return !!wgpuDbgPause && wgpuDbgPause.phase === 'paused';
  },
  configurable: true,
});

function inspectorSteps() {
  const steps = [];
  const push = (pass, title, kind, logical, mode) =>
    steps.push({ pass, title, kind, logical, mode: kind === 'color' && mode === 1 ? 0 : mode });
  if (pipelinePrograms.has('shadow') || pipelinePrograms.has('clrwl_shadow')) {
    push('shadow', 'shadow · Depth', 'shadowDepth', 0, 0);
    push('shadow', 'shadow · shadowcolor0', 'shadowColor', 0, 0);
  }
  for (const name of computePrograms.keys()) push('compute:' + name, name + ' (Compute)', 'color', 0, 1);
  for (const stage of activePreOrder)
    for (const logical of activePassTargets[stage] || [0]) push(stage, stage, 'color', logical, logical === 0 ? 1 : 0);
  if (skyProgram)
    for (const logical of activePassTargets.gbuffers_skybasic || [0])
      push('gbuffers_skybasic', 'gbuffers_skybasic', 'color', logical, 1);
  if (gbufferPrograms.has('gbuffers_skytextured'))
    for (const logical of activePassTargets.gbuffers_skytextured || [0])
      push('gbuffers_skytextured', 'gbuffers_skytextured', 'color', logical, 1);
  const terrain = ['gbuffers_terrain', 'gbuffers_textured', 'gbuffers_basic', 'clrwl_gbuffers'].find(name =>
    gbufferPrograms.has(name),
  );
  if (terrain)
    for (const logical of activeTerrainTargets || [0])
      push('gbuffers_terrain', terrain, 'color', logical, logical === 4 ? 2 : logical === 0 ? 1 : 0);
  push('gbuffers_terrain', 'depthtex0 after G-buffer', 'depth', 0, 3);
  for (const name of ['gbuffers_block', 'gbuffers_entities', 'gbuffers_spidereyes', 'gbuffers_particles'])
    if (gbufferPrograms.has(name))
      for (const logical of activePassTargets[name] || [0]) push(name, name, 'color', logical, logical === 0 ? 1 : 0);
  for (const stage of activePostOrder) {
    if (stage.startsWith('deferred'))
      for (const logical of activePassTargets[stage] || [0])
        push(stage, stage, 'color', logical, logical === 4 ? 2 : logical === 0 ? 1 : 0);
  }
  if (gbufferPrograms.has('gbuffers_hand'))
    for (const logical of activePassTargets.gbuffers_hand || [0, 6])
      push('gbuffers_hand', 'gbuffers_hand', 'color', logical, logical === 0 ? 1 : 0);
  if (gbufferPrograms.has('gbuffers_water'))
    for (const logical of activePassTargets.gbuffers_water || [0, 3])
      push('gbuffers_water', 'gbuffers_water', 'color', logical, logical === 0 ? 1 : 0);
  if (gbufferPrograms.has('gbuffers_clouds'))
    for (const logical of activePassTargets.gbuffers_clouds || [0])
      push('gbuffers_clouds', 'gbuffers_clouds', 'color', logical, 1);
  for (const name of ['gbuffers_lightning', 'gbuffers_weather'])
    if (gbufferPrograms.has(name))
      for (const logical of activePassTargets[name] || [0]) push(name, name, 'color', logical, logical === 0 ? 1 : 0);
  for (const stage of activePostOrder) {
    if (!stage.startsWith('deferred'))
      for (const logical of activePassTargets[stage] || [0])
        push(stage, stage, 'color', logical, logical === 0 ? 1 : 0);
  }
  push('final', 'Final image', 'final', 0, 0);
  return steps;
}
let inspectorList = [],
  inspectorCapturedTexture = null,
  inspectorMissed = false;
function inspectorTexture(step) {
  if (step.kind === 'shadowDepth') return shadowDepthTextures[0];
  if (step.kind === 'shadowColor') return shadowColorTextures[0];
  if (step.kind === 'depth') return sceneDepthTextures[0];
  return colortexCurrent[step.logical];
}
function inspectorRefresh() {
  if (!inspectorOpen) {
    inspectorBox.hidden = true;
    document.dispatchEvent(new CustomEvent('gbufferd-inspector'));
    return;
  }
  inspectorBox.hidden = !!GB.viewerUI;
  const step = inspectorList[inspectorIndex];
  const lines = ['§ FRAME INSPECTOR  ·  F8 close  ·  Up/down step  ·  Left/right channel  ·  Page up/down pass', ''];
  let lastPass = null;
  inspectorList.forEach((item, index) => {
    if (item.pass !== lastPass) {
      lines.push('  ' + item.pass);
      lastPass = item.pass;
    }
    const note =
      item.logical === 0 ? 'Color' : colortexSetting(item.logical, 'Clear') === false ? 'History / preserved' : '';
    const name =
      item.kind === 'color'
        ? 'colortex' + item.logical + (note ? ' · ' + note : '')
        : item.kind === 'depth'
          ? 'depthtex0'
          : item.kind === 'shadowDepth'
            ? 'shadowtex0'
            : item.kind === 'shadowColor'
              ? 'shadowcolor0'
              : 'Final image';
    const format = item.kind === 'color' ? colortexFormatLabels[item.logical] || '?' : '';
    lines.push((index === inspectorIndex ? '  > ' : '    ') + name.padEnd(46) + format);
  });
  lines.push('');
  lines.push('Channel: ' + CHANNEL_MODES[inspectorMode][0]);
  if (step) {
    const texture = inspectorTexture(step);
    lines.push('Texture: ' + (texture ? texture.width + 'x' + texture.height + ' ' + texture.format : 'missing'));
    if (inspectorProbe) {
      if (inspectorProbe.unsupported) lines.push('Pixel: Format ' + inspectorProbe.format + ' cannot be read');
      else {
        const [r, g, b, a] = inspectorProbe.texels[0] || [0, 0, 0, 0];
        const number = value =>
          Math.abs(value) >= 1000 || (value !== 0 && Math.abs(value) < 0.001)
            ? value.toExponential(3)
            : value.toFixed(5);
        lines.push('Center pixel  (' + inspectorProbe.origin.join(', ') + ')');
        lines.push('   R ' + number(r).padStart(12) + '   G ' + number(g).padStart(12));
        lines.push('   B ' + number(b).padStart(12) + '   A ' + number(a).padStart(12));
      }
    }
  }
  if (inspectorMissed) lines.push('', '  Not drawn this frame (this pass did not run)');
  inspectorBox.textContent = lines.join('\n');
  document.dispatchEvent(new CustomEvent('gbufferd-inspector'));
}
async function inspectorSample() {
  if (!inspectorOpen || inspectorProbeBusy || !gl.readTexturePixels) return;
  const step = inspectorList[inspectorIndex];
  if (!step || step.kind === 'final') return;
  const texture = inspectorCapturedTexture || inspectorTexture(step);
  if (!texture) return;
  inspectorProbeBusy = true;
  try {
    const x = Math.floor(texture.width / 2),
      y = Math.floor(texture.height / 2);
    inspectorProbe = await gl.readTexturePixels(texture, x, y, 1, 1);
  } catch (error) {
    inspectorProbe = { unsupported: true, format: error.message };
  } finally {
    inspectorProbeBusy = false;
    inspectorRefresh();
  }
}
function inspectorCapture(pass) {
  if (gl.program?.wgpuDebugSource && (programNames.get(gl.program) === pass || !wgpuPassPrograms.has(pass)))
    wgpuPassPrograms.set(pass, gl.program);
  if (bufferRecorder) recordStageBuffers(pass);
  if (!inspectorOpen || inspectorCapturedTexture) return false;
  const step = inspectorList[inspectorIndex];
  if (!step || step.pass !== pass || step.kind === 'final') return false;
  const texture = inspectorTexture(step);
  if (!texture) return false;
  inspectorCapturedTexture = gl.snapshot(texture, false, 'Frame-Inspektor');
  return true;
}
document.addEventListener('keydown', event => {
  if (event.code === 'F8') {
    inspectorOpen = !inspectorOpen;
    if (inspectorOpen) {
      inspectorList = inspectorSteps();
      inspectorIndex = Math.min(inspectorIndex, inspectorList.length - 1);
      document.exitPointerLock?.();
    }
    inspectorRefresh();
    event.preventDefault();
    return;
  }
  if (!inspectorOpen) return;
  const step = inspectorList[inspectorIndex];
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
    inspectorIndex =
      (inspectorIndex + (event.code === 'ArrowDown' ? 1 : -1) + inspectorList.length) % inspectorList.length;
    inspectorMode = CHANNEL_MODES.findIndex(mode => mode[1] === (inspectorList[inspectorIndex]?.mode ?? 1));
    if (inspectorMode < 0) inspectorMode = 0;
    inspectorProbe = null;
    inspectorRefresh();
    event.preventDefault();
    return;
  }
  if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
    inspectorMode =
      (inspectorMode + (event.code === 'ArrowRight' ? 1 : -1) + CHANNEL_MODES.length) % CHANNEL_MODES.length;
    inspectorRefresh();
    event.preventDefault();
    return;
  }
  if (event.code === 'PageDown' || event.code === 'PageUp') {
    const direction = event.code === 'PageDown' ? 1 : -1;
    let index = inspectorIndex;
    for (let guard = 0; guard < inspectorList.length; guard++) {
      index = (index + direction + inspectorList.length) % inspectorList.length;
      if (inspectorList[index].pass !== step.pass) {
        inspectorIndex = index;
        break;
      }
    }
    inspectorProbe = null;
    inspectorRefresh();
    event.preventDefault();
    return;
  }
});
setInterval(inspectorSample, 400);
