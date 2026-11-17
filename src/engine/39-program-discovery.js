let shaderLoadBusy = false;
const shaderYield = () => new Promise(resolve => setTimeout(resolve, 0));
const isSceneStage = name => /^(?:gbuffers_|clrwl_gbuffers)/.test(name);
const isPipelineStage = name =>
  /^(?:shadow|shadow_entities|shadow_solid|shadow_cutout|shadow_water|shadow_block|shadow_lightning|clrwl_shadow|shadowcomp\d*|begin\d*|prepare\d*|deferred\d*|composite\d*|final)$/.test(
    name,
  );
function setShaderBusy(busy) {
  shaderLoadBusy = busy;
  if (busy && gl?.irisAsyncPipelines) gl.irisAsyncPipelines.presented = false;
  retry.disabled = busy;
  zipInput.disabled = busy;
  document.querySelector('.file').classList.toggle('disabled', busy);
  document.querySelector('.controls').setAttribute('aria-busy', String(busy));
}
function packWantsTessellation(properties) {
  return ['iris.features.required', 'iris.features.optional'].some(key =>
    String(properties?.[key] || '')
      .split(/\s+/)
      .some(flag => /^TESSELL?ATION_SHADERS$/i.test(flag)),
  );
}
function discoverShaderPrograms(paths) {
  const programs = {};
  for (const path of paths) {
    const match = path.match(/^shaders\/(world0\/)?([^/]+)\.(vsh|fsh|gsh|tcs|tes)$/);
    if (!match) continue;
    const name = match[2],
      extension = match[3];
    if (!isSceneStage(name) && !isPipelineStage(name)) continue;
    if (
      name.startsWith('gbuffers_') &&
      !/^gbuffers_(?:basic|line|textured|textured_lit|skybasic|skytextured|clouds|terrain|terrain_solid|terrain_cutout|terrain_cutout_mip|damagedblock|block|block_translucent|beaconbeam|item|entities|entities_translucent|entities_glowing|particles|particles_translucent|armor_glint|spidereyes|hand|hand_water|weather|water|lightning)$/.test(
        name,
      )
    )
      continue;
    const stages = (programs[name] ??= {});
    if (match[1] || !stages[extension]) stages[extension] = path;
  }
  for (const [name, stages] of Object.entries(programs)) if (!(stages.vsh && stages.fsh)) delete programs[name];
  return programs;
}
function applyPackBlend(name, targets) {
  const properties = activePackProperties || {},
    base = 'blend.' + name;
  gl.blendOff.clear();
  gl.blendOverrides.clear();
  const global = irisBlendFactors(properties[base]);
  if (global === null) gl.disable(gl.BLEND);
  else if (global) {
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(...global);
  }
  targets.forEach((logical, index) => {
    const local = irisBlendFactors(
      properties[base + '.' + (name.startsWith('shadow') ? 'shadowcolor' : 'colortex') + logical] ??
        properties[base + '.colortex' + logical] ??
        properties[base + '.' + (renderTargetAliases[logical] || '')],
    );
    if (local === null) gl.disablei(gl.BLEND, index);
    else if (local) gl.blendFuncSeparatei(index, ...local);
  });
}
function getPackTargets(name, fragment, complementary) {
  const annotations = [...fragment.matchAll(/\/\*\s*(DRAWBUFFERS|RENDERTARGETS)\s*:\s*([\d,\s]+)\*\//g)];
  if (!annotations.length) return [0];
  const [, kind, list] = annotations[annotations.length - 1];
  const targets = (
    kind === 'DRAWBUFFERS' ? list.replace(/\s/g, '').split('') : list.split(',').map(value => value.trim())
  ).map(Number);
  if (
    targets.length > maxColorAttachments ||
    targets.some(value => !Number.isInteger(value) || value < 0 || value >= colortexCurrent.length)
  )
    throw new Error(name + ': Nicht unterstützte Renderziele ' + list);
  return targets;
}
let packLoading = false;

const PROGRAM_ENABLED_PREFIXES = ['program.', 'program.world0/'];
function programEnabled(properties, name, settings) {
  let expression;
  for (const prefix of PROGRAM_ENABLED_PREFIXES) {
    const key = prefix + name + '.enabled';
    if (properties && Object.hasOwn(properties, key)) expression = properties[key];
  }
  if (expression === undefined) return true;
  const text = String(expression).trim();
  if (/^(?:false|0)$/i.test(text)) return false;
  if (/^(?:true|1)$/i.test(text)) return true;
  const defaults = Object.fromEntries(
    Object.entries((settings && settings.options) || {}).map(([option, entry]) => [option, entry.value]),
  );
  const values = { ...defaults, ...((settings && settings.values) || {}) };
  const macros = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== false)
      .map(([option, value]) => [option, value === true ? '1' : String(value)]),
  );
  for (const name of (settings && settings.packDefines) || []) if (!Object.hasOwn(values, name)) macros[name] = '1';
  Object.assign(macros, {
    MC_VERSION: String(PACK_GAME_VERSION),
    IS_IRIS: '1',
    IRIS_VERSION: '10900',
    IRIS_FEATURE_CUSTOM_IMAGES: '1',
    IRIS_FEATURE_SSBO: '1',
    IRIS_FEATURE_COMPUTE_SHADERS: '1',
    IRIS_FEATURE_COMPUTE: '1',
    IRIS_FEATURE_PER_BUFFER_BLENDING: '1',
    IRIS_FEATURE_SEPARATE_HARDWARE_SAMPLERS: '1',
    IRIS_FEATURE_BLOCK_EMISSION_ATTRIBUTE: '1',
    IRIS_FEATURE_ENTITY_TRANSLUCENT: '1',
    IRIS_FEATURE_TESSELLATION_SHADERS: '1',
  });
  let source = text.replace(/defined\s*(?:\(\s*(\w+)\s*\)|(\w+))/g, (whole, inBrackets, bare) =>
    Object.hasOwn(macros, inBrackets || bare) ? '1' : '0',
  );
  for (let pass = 0; pass < 20 && /[A-Za-z_]\w*/.test(source); pass++)
    source = source.replace(/[A-Za-z_]\w*/g, word => (Object.hasOwn(macros, word) ? '(' + macros[word] + ')' : '0'));
  const arithmetic = source.replace(/[^0-9+\-*/%()<>=!&|.\s]/g, '');
  try {
    return !!Function('"use strict";return (' + arithmetic + ');')();
  } catch (error) {
    return true;
  }
}
