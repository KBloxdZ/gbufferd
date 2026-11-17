function clearDepthSnapshots(textures, sizeX, sizeY, targetFramebuffer) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  for (const texture of textures) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('Depth-Snapshot-Framebuffer ist unvollständig.');
    gl.viewport(0, 0, sizeX, sizeY);
    gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));
  }
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function copyDepthSnapshots(sourceFramebuffer, targetFramebuffer, textures, sizeX, sizeY) {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceFramebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targetFramebuffer);
  gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
  gl.drawBuffers([gl.NONE]);
  for (const texture of textures) {
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('Depth-Kopie ist unvollständig.');
    gl.blitFramebuffer(0, 0, sizeX, sizeY, 0, 0, sizeX, sizeY, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  }
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

let activeRenderConstants = {};
const renderTargetAliases = ['gcolor', 'gdepth', 'gnormal', 'composite', 'gaux1', 'gaux2', 'gaux3', 'gaux4'];
const norm16Exact = () => !!gl?.device?.features?.has('texture-formats-tier1');
function unfilterableTargetNames(targets) {
  const names = [];
  for (let logical = 0; logical < (targets || []).length; logical++) {
    const directive = targets[logical]?.format;
    const candidate = directive && packFormatCandidate(directive);
    if (!candidate || gl.filterableFormat(gl.textureFormat(candidate.internal))) continue;
    names.push('colortex' + logical);
    if (renderTargetAliases[logical]) names.push(renderTargetAliases[logical]);
  }
  return names;
}
function colortexSetting(logical, suffix) {
  return (
    activeRenderConstants['colortex' + logical + suffix] ??
    activeRenderConstants[(renderTargetAliases[logical] || 'colortex' + logical) + suffix]
  );
}
function sceneClearTargets() {
  const targets = [];
  for (let logical = 0; logical < colortexCurrent.length; logical++)
    if ((colortexSetting(logical, 'Clear') ?? packRenderTargets[logical]?.clear) !== false) targets.push(logical);
  return targets;
}
function sceneClearColor(logical) {
  return (
    colortexSetting(logical, 'ClearColor') ||
    packRenderTargets[logical]?.clearColor ||
    (logical === 0 ? [...FOG_COLOR, 1] : logical === 1 ? [1, 1, 1, 1] : [0, 0, 0, 0])
  );
}
function clearSceneBuffers() {
  const targets = sceneClearTargets();
  for (const textures of [colortexCurrent, colortexSpare]) {
    for (let first = 0; first < targets.length; first += maxColorAttachments) {
      const batch = targets.slice(first, first + maxColorAttachments);
      attachColorTargets(batch, textures, true);
      batch.forEach((logical, slot) => gl.clearBufferfv(gl.COLOR, slot, new Float32Array(sceneClearColor(logical))));
    }
  }
  attachColorTargets([0], colortexCurrent, true);
  gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));
  clearDepthSnapshots(sceneDepthTextures, width, height, depthCopyFramebuffer);
}

function bindPresentTexture(source, displayMode = 1) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source);
  gl.bindSampler(0, null);
  u1i(presentProgram, 'image', 0);
  u1i(presentProgram, 'displayMode', displayMode);
  u1f(presentProgram, 'nearPlane', CAMERA_NEAR);
  u1f(presentProgram, 'farPlane', CAMERA_FAR);
}

let computePrograms = new Map(),
  activePackResources = { images: [], buffers: [] },
  activePackProperties = {};
function runComputeStage(stage, eye, now) {
  for (const [name, program] of [...computePrograms].sort(([a], [b]) => a.localeCompare(b))) {
    if (name !== stage && !name.startsWith(stage + '_')) continue;
    if (gl.viewerDisabledPrograms?.has(program)) continue;
    gl.useProgram(program);
    setUniforms(program, identityMatrix, identityMatrix, eye, now);
    const size = program.workgroupSize;
    const groups = program.workGroups || [
      Math.ceil((width * program.workGroupsRender[0]) / size[0]),
      Math.ceil((height * program.workGroupsRender[1]) / size[1]),
      1,
    ];
    gl.dispatchCompute(program, ...groups, activePackResources.indirect?.[name] || null);
  }
}
