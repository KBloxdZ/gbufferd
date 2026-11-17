let activeSharedSpills = new Map();
function glslTypeLayout(type, structs) {
  const scalar = { float: 4, int: 4, uint: 4, bool: 4, double: 8 };
  if (scalar[type]) return { size: scalar[type], align: scalar[type] };
  let m = /^(?:[iub]?vec|dvec)([234])$/.exec(type);
  if (m) {
    const n = Number(m[1]),
      w = type.startsWith('d') ? 8 : 4;
    return { size: n * w, align: (n === 2 ? 2 : 4) * w };
  }
  m = /^d?mat([234])(?:x([234]))?$/.exec(type);
  if (m) {
    const cols = Number(m[1]),
      rows = Number(m[2] || m[1]),
      col = glslTypeLayout('vec' + rows, structs);
    return { size: cols * Math.ceil(col.size / col.align) * col.align, align: col.align };
  }
  return structs.get(type) || null;
}
function glslEvalSize(text, constants) {
  const expr = String(text)
    .replace(/\b[A-Za-z_]\w*(?:\.[xyz])?\b/g, name => (constants.has(name) ? '(' + constants.get(name) + ')' : name))
    .replace(/(\d)[uU]\b/g, '$1');
  if (!/^[\d\s+\-*/()%<>&|^]*$/.test(expr)) return NaN;
  try {
    const value = Function('"use strict";return (' + expr + ');')();
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : NaN;
  } catch {
    return NaN;
  }
}
function glslDeclaredMembers(body) {
  const members = [];
  for (const part of body.split(';')) {
    const text = part
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\b(?:highp|mediump|lowp|precise|flat|smooth)\s+/g, '')
      .trim();
    if (!text) continue;
    let m = /^(\w+)(?:\s*((?:\[[^\]]*\]\s*)+)|\s+)(\w+)\s*((?:\[[^\]]*\]\s*)*)$/.exec(text);
    if (m) m[2] = m[2] || '';
    if (!m) continue;
    const dims = [...(m[2] + m[4]).matchAll(/\[([^\]]*)\]/g)].map(d => d[1]);
    members.push({ type: m[1], name: m[3], dims });
  }
  return members;
}
function sharedSpillPlan(source, limit) {
  if (!/\bshared\b/.test(source)) return null;
  const constants = new Map();
  const local = /layout\s*\(([^)]*local_size[^)]*)\)\s*in\s*;/.exec(source)?.[1] || '';
  for (const axis of ['x', 'y', 'z']) {
    const v = new RegExp('local_size_' + axis + '\\s*=\\s*(\\d+)').exec(local)?.[1];
    constants.set('gl_WorkGroupSize.' + axis, v || '1');
  }
  for (const m of source.matchAll(/\bconst\s+(?:u?int)\s+(\w+)\s*=\s*([^;]+);/g)) {
    const v = glslEvalSize(m[2], constants);
    if (Number.isFinite(v)) constants.set(m[1], String(v));
  }
  const structs = new Map();
  for (const m of source.matchAll(/\bstruct\s+(\w+)\s*\{([^{}]*)\}\s*;/g)) {
    let offset = 0,
      align = 4,
      ok = true;
    for (const member of glslDeclaredMembers(m[2])) {
      const layout = glslTypeLayout(member.type, structs);
      if (!layout) {
        ok = false;
        break;
      }
      let count = 1;
      for (const d of member.dims) {
        const v = glslEvalSize(d, constants);
        if (!Number.isFinite(v)) {
          ok = false;
          break;
        }
        count *= v;
      }
      if (!ok) break;
      const stride = member.dims.length ? Math.ceil(layout.size / layout.align) * layout.align : layout.size;
      offset = Math.ceil(offset / layout.align) * layout.align + stride * count;
      align = Math.max(align, layout.align);
    }
    if (ok) structs.set(m[1], { size: Math.ceil(offset / align) * align, align });
  }
  const vars = [];
  for (const m of source.matchAll(
    /(^|[;{}\n])([ \t]*)shared\s+(\w+)\s*((?:\[[^\]]*\]\s*)*)\s*(\w+)\s*((?:\[[^\]]*\]\s*)*);/g,
  )) {
    const layout = glslTypeLayout(m[3], structs);
    if (!layout) continue;
    const dims = [...(m[4] + m[6]).matchAll(/\[([^\]]*)\]/g)].map(d => d[1]);
    let count = 1,
      ok = true;
    for (const d of dims) {
      const v = glslEvalSize(d, constants);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      count *= v;
    }
    if (!ok) continue;
    const stride = dims.length ? Math.ceil(layout.size / layout.align) * layout.align : layout.size;
    vars.push({
      name: m[5],
      type: m[3],
      dims: m[4] + m[6],
      before: m[4].trim(),
      after: m[6].trim(),
      size: Math.ceil((stride * count) / 16) * 16,
      statement: m[0].slice(m[1].length),
    });
  }
  let total = vars.reduce((sum, v) => sum + v.size, 0);
  const unknown = [...source.matchAll(/\bshared\b/g)].length - vars.length;
  if (total + unknown * 1024 <= limit) return null;
  const spilled = [];
  for (const v of [...vars].sort((a, b) => b.size - a.size)) {
    if (total + unknown * 1024 <= limit - 256) break;
    spilled.push(v);
    total -= v.size;
  }
  if (!spilled.length) return null;
  return { spilled, bytes: spilled.reduce((sum, v) => sum + v.size, 0) };
}
function planSharedSpills(paths, settings, usedBindings, screenWidth, screenHeight) {
  const plans = new Map(),
    buffers = [],
    limit = gl.device?.limits?.maxComputeWorkgroupStorageSize || 16384;
  let binding = 29;
  for (const path of paths) {
    let source;
    try {
      source = nameAnonymousStructs(foldBufferArrayLengths(packStageSource(path, 'compute', settings)));
    } catch {
      continue;
    }
    const plan = sharedSpillPlan(source, limit);
    if (!plan) continue;
    while (usedBindings.has(binding)) binding--;
    if (binding < 0) continue;
    usedBindings.add(binding);
    const local = /layout\s*\(([^)]*local_size[^)]*)\)\s*in\s*;/.exec(source)?.[1] || '';
    const size = axis => Number(new RegExp('local_size_' + axis + '\\s*=\\s*(\\d+)').exec(local)?.[1] || 1);
    const fixed = /\bconst\s+ivec3\s+workGroups\s*=\s*ivec3\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(source);
    const render = /\bconst\s+vec2\s+workGroupsRender\s*=\s*vec2\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(source);
    const stride = Math.ceil(plan.bytes / 16) * 16;
    let buffer;
    if (fixed) buffer = { binding, size: stride * Math.max(1, Number(fixed[1]) * Number(fixed[2]) * Number(fixed[3])) };
    else if (render)
      buffer = {
        binding,
        size: stride,
        relative: true,
        scaleX: Number(render[1]) / size('x') + 1 / 320,
        scaleY: Number(render[2]) / size('y') + 1 / 320,
      };
    else buffer = { binding, size: stride * 1024 };
    const max = Math.min(gl.device.limits.maxStorageBufferBindingSize, gl.device.limits.maxBufferSize);
    if (!buffer.relative && buffer.size > max) buffer.size = Math.floor(max / stride) * stride;
    buffers.push(buffer);
    plans.set(path, { ...plan, binding });
    console.warn(
      'shared-Speicher über ' +
        limit +
        ' B in ' +
        path +
        ': ' +
        plan.spilled.map(v => v.name).join(', ') +
        ' (' +
        plan.bytes +
        ' B je Workgroup) liegt in Storage-Buffer ' +
        binding +
        '.',
    );
  }
  return { plans, buffers };
}
function spillSharedMemory(source, plan) {
  if (!plan) return source;
  const names = new Set(plan.spilled.map(v => v.name));
  let last = -1;
  for (const v of plan.spilled) {
    const at = source.indexOf(v.statement);
    if (at < 0) return source;
    last = Math.max(last, at + v.statement.length);
  }
  const members = plan.spilled
    .map(v => '  ' + v.type + (v.before ? ' ' + v.before : '') + ' ' + v.name + (v.after ? ' ' + v.after : '') + ';')
    .join('\n');
  const block =
    '\nstruct WgpuSharedSpillGroup {\n' +
    members +
    '\n};\nlayout(std430, binding = ' +
    plan.binding +
    ') buffer WgpuSharedSpill { WgpuSharedSpillGroup wgpuSharedSpill[]; };\n';
  source = source.slice(0, last) + block + source.slice(last);
  for (const v of plan.spilled) source = source.replace(v.statement, '');
  const index =
    'wgpuSharedSpill[gl_WorkGroupID.x + gl_NumWorkGroups.x * (gl_WorkGroupID.y + gl_NumWorkGroups.y * gl_WorkGroupID.z)].';
  const start = source.indexOf('struct WgpuSharedSpillGroup'),
    end = source.indexOf('wgpuSharedSpill[]; };', start);
  const head = source.slice(0, start),
    spill = source.slice(start, end),
    tail = source.slice(end);
  const rename = text => text.replace(new RegExp('(?<![.\\w])(' + [...names].join('|') + ')\\b', 'g'), index + '$1');
  return rename(head) + spill + rename(tail);
}
function packComputeSource(path, settings, atomicImages) {
  let s = packStageSource(path, 'compute', settings);
  s = glslBufferQualifiers(nameAnonymousStructs(foldBufferArrayLengths(lowerLongTernaryChains(s))));
  s = spillSharedMemory(s, activeSharedSpills.get(path));
  s = splitInterfaceDeclarations(s);
  s = renameReservedIdentifiers(s);
  s = lowerSwitchFallthrough(s);
  s = lowerWorkGroupSize(s);
  s = lowerAtomicImages(lowerImage1D(s), atomicImages);
  s = lowerSampler1D(lowerSubgroups(lowerGatherOffsets(lowerDynamicTexelOffsets(s)), 'compute'));
  s = joinMultilineConsts(s);
  s = dropDuplicateConsts(s);
  s = dropDuplicateUniforms(s);
  s = unwrapIntArgumentCasts(s);
  s = lowerIntegerSampling(s);
  s = dropMemoryBarriers(s);
  return s;
}
