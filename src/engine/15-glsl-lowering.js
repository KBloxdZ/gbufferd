// tons of rewrites so glsl survives naga/webgpu. almost every func here exists becuz some pack broke
function vertexStorageCopies(compiled) {
  if (!compiled.vertex) return;
  const bindings = (compiled.bindings || []).map(b => ({ ...b })),
    copies = [];
  for (const b of bindings) {
    if (b.group !== 3 || !(b.visibility & 1) || !String(b.space).includes('read_write')) continue;
    const declaration = new RegExp(
      '@group\\(3\\)\\s*@binding\\(' + b.binding + '\\)\\s*var<storage(?:,\\s*read(?:_write)?)?>\\s*(\\w+)',
    );
    const name = compiled.vertex.match(declaration)?.[1];
    if (name && (compiled.vertex.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length > 1) {
      if (
        new RegExp(
          '\\b' + name + '\\b(?:\\.\\w+|\\[[^\\]]*\\])*\\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)|&\\s*' + name + '\\b',
        ).test(compiled.vertex)
      )
        continue;
      const alias = 64 + b.binding;
      compiled.vertex = compiled.vertex.replace(
        declaration,
        '@group(3) @binding(' + alias + ') var<storage, read> ' + name,
      );
      copies.push({ ...b, binding: alias, space: 'storage,read', visibility: 1, source: b.binding, snapshot: true });
    }
    b.visibility &= ~1;
  }
  compiled.bindings = bindings.filter(b => b.group !== 3 || b.visibility).concat(copies);
}

function shareSamplers(compiled, limit, nonFiltering) {
  const codes = () =>
    [['vertex'], ['fragment'], ['compute']]
      .filter(([k]) => compiled[k])
      .map(([k]) => compiled[k])
      .concat(
        compiled.vertexCompute ? [compiled.vertexCompute.code] : [],
        (compiled.computeVariants || []).map(v => v.compute),
      );
  const declaration = /@group\(1\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*(sampler|sampler_comparison)\s*;/g;
  const vars = new Map();
  for (const code of codes())
    for (const m of code.matchAll(declaration)) vars.set(m[2], { binding: Number(m[1]), type: m[3] });
  const bound = new Set((compiled.bindings || []).filter(b => b.group === 1).map(b => b.binding));
  const used = () => [...vars.keys()].filter(name => bound.has(vars.get(name).binding));
  if (used().length <= limit) return;
  const info = name => {
    const v = vars.get(name),
      s = (compiled.samplers || []).find(s => s.binding + 1 === v.binding);
    return {
      kind: v.type === 'sampler_comparison' ? 'compare' : nonFiltering(s) ? 'raw' : 'filter',
      target: /^(?:colortex\d+|gcolor|gdepth|gnormal|composite|gaux\d)$/.test(s?.name || ''),
    };
  };
  const merged = new Map();
  for (const preferTargets of [true, false]) {
    let names = used().map(name => merged.get(name) || name);
    let count = new Set(names).size;
    for (const name of used()) {
      if (count <= limit) break;
      if (merged.has(name)) continue;
      const own = info(name);
      if (preferTargets && !own.target) continue;
      const rep = [...new Set(names)].find(
        other =>
          other !== name &&
          !merged.has(other) &&
          info(other).kind === own.kind &&
          (!preferTargets || info(other).target),
      );
      if (!rep) continue;
      merged.set(name, rep);
      names = names.map(n => (n === name ? rep : n));
      count = new Set(names).size;
    }
  }
  if (!merged.size) return;
  const root = name => {
    while (merged.has(name)) name = merged.get(name);
    return name;
  };
  for (const name of [...merged.keys()]) merged.set(name, root(name));
  const rewrite = code => {
    for (const [name, rep] of merged) {
      const has = new RegExp('@binding\\(' + vars.get(rep).binding + '\\)\\s*var\\s+' + rep + '\\b').test(code);
      code = code.replace(
        new RegExp(
          '@group\\(1\\)\\s*@binding\\(' + vars.get(name).binding + '\\)\\s*var\\s+' + name + '\\s*:\\s*\\w+\\s*;',
        ),
        has ? '' : '@group(1) @binding(' + vars.get(rep).binding + ') var ' + rep + ': ' + vars.get(rep).type + ';',
      );
      code = code.replace(new RegExp('\\b' + name + '\\b', 'g'), rep);
    }
    return code;
  };
  for (const k of ['vertex', 'fragment', 'compute']) if (compiled[k]) compiled[k] = rewrite(compiled[k]);
  if (compiled.vertexCompute)
    compiled.vertexCompute = { ...compiled.vertexCompute, code: rewrite(compiled.vertexCompute.code) };
  if (compiled.computeVariants)
    compiled.computeVariants = compiled.computeVariants.map(v => ({ ...v, compute: rewrite(v.compute) }));
  const gone = new Set([...merged.keys()].map(name => vars.get(name).binding));
  compiled.bindings = (compiled.bindings || [])
    .map(b => {
      if (b.group !== 1) return b;
      const into = [...merged]
        .filter(([name, rep]) => vars.get(rep).binding === b.binding)
        .map(([name]) => compiled.bindings.find(o => o.group === 1 && o.binding === vars.get(name).binding));
      return into.length ? { ...b, visibility: into.reduce((v, o) => v | (o?.visibility || 0), b.visibility) } : b;
    })
    .filter(b => !(b.group === 1 && gone.has(b.binding)));
  console.warn('Sampler geteilt (' + limit + ' pro Stufe): ' + [...merged].map(([a, b]) => a + '→' + b).join(', '));
}

function lowerIndexableConstArrays(code) {
  if (!/\n\s*var\s+\w+\s*:\s*array</.test(code)) return code;
  const literalOnly = text =>
    !text.replace(
      /\b(?:array|vec[234]|mat[234]x[234])\b(?:\s*<[^<>]*(?:<[^<>]*>[^<>]*)*>)?|\b(?:f32|i32|u32|f16|bool|true|false)\b|0x[0-9a-fA-F]+[iu]?|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[fiuh]?|[-+(),\s]/g,
      '',
    ).length;
  const closing = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        if (!--depth) return i;
      }
    }
    return -1;
  };
  const starts = [...code.matchAll(/^fn /gm)].map(match => match.index);
  if (!starts.length) return code;
  const constants = new Map();
  const functions = starts.map((start, index) => {
    let fn = code.slice(start, index + 1 < starts.length ? starts[index + 1] : code.length);
    for (const name of [...fn.matchAll(/\n[ \t]*var\s+(\w+)\s*:\s*array</g)].map(found => found[1])) {
      const match = new RegExp('\\n[ \\t]*var\\s+' + name + '\\s*:\\s*(array<[^;=]+>)\\s*;').exec(fn);
      if (!match) continue;
      const [declaration, type] = match,
        declaredAt = match.index + declaration.indexOf(name);
      const edits = [];
      let value = null,
        ok = true;
      for (const use of fn.matchAll(new RegExp('\\b' + name + '\\b', 'g'))) {
        const at = use.index;
        if (at === declaredAt) continue;
        const after = fn.slice(at + name.length);
        if (/^\s*=\s*array\b/.test(after)) {
          const open = fn.indexOf('(', at + name.length),
            close = open < 0 ? -1 : closing(fn, open);
          const end = close < 0 ? -1 : fn.indexOf(';', close);
          if (end < 0 || fn.slice(close + 1, end).trim()) {
            ok = false;
            break;
          }
          const text = fn.slice(fn.indexOf('array', at + name.length), close + 1);
          if (!literalOnly(text) || (value !== null && value !== text)) {
            ok = false;
            break;
          }
          value = text;
          const lineStart = fn.lastIndexOf('\n', at);
          if (fn.slice(lineStart + 1, at).trim()) {
            ok = false;
            break;
          }
          edits.push({ from: lineStart, to: end + 1, text: '' });
        } else if (after.startsWith('[') && fn[at - 1] !== '&') {
          const close = closing(fn, at + name.length);
          if (close < 0 || /^\s*(?:=[^=]|[-+*\/%&|^]=|\+\+|--)/.test(fn.slice(close + 1))) {
            ok = false;
            break;
          }
          edits.push({ from: at, to: at + name.length, name: true });
        } else {
          ok = false;
          break;
        }
      }
      if (!ok || value === null) continue;
      const key = type + '=' + value;
      if (!constants.has(key)) constants.set(key, { name: 'wgpuConstArray' + constants.size, type, value });
      const constant = constants.get(key).name;
      edits.push({ from: match.index, to: match.index + declaration.length, text: '' });
      edits.sort((a, b) => b.from - a.from);
      for (const edit of edits) fn = fn.slice(0, edit.from) + (edit.name ? constant : edit.text) + fn.slice(edit.to);
    }
    return fn;
  });
  if (!constants.size) return code;
  const declarations = [...constants.values()]
    .map(({ name, type, value }) => 'const ' + name + ': ' + type + ' = ' + value + ';\n')
    .join('');
  return code.slice(0, starts[0]) + declarations + functions.join('');
}

function lowerDepthSampleLevel(source) {
  if (source.includes('textureSampleCompareBias')) {
    const calls = /\btextureSampleCompareBias\s*\(/g;
    let match,
      at = 0,
      output = '';
    while ((match = calls.exec(source))) {
      let depth = 1,
        end = calls.lastIndex,
        lastComma = -1;
      for (; end < source.length && depth; end++) {
        const c = source[end];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 1) lastComma = end;
      }
      if (depth || lastComma < 0) continue;
      output +=
        source.slice(at, match.index) + 'textureSampleCompareLevel(' + source.slice(calls.lastIndex, lastComma) + ')';
      at = end;
      calls.lastIndex = end;
    }
    source = output + source.slice(at);
  }
  const depthTypes = new Map(
    [...source.matchAll(/\bvar\s+(\w+)\s*:\s*(texture_depth_\w+)\s*;/g)].map(m => [m[1], m[2]]),
  );
  if (!depthTypes.size) return source;
  const rewrite = code => {
    const calls = /\btextureSampleLevel\s*\(/g;
    let match,
      at = 0,
      output = '';
    while ((match = calls.exec(code))) {
      const args = [];
      let depth = 1,
        start = calls.lastIndex,
        end = start;
      for (; end < code.length && depth; end++) {
        const c = code[end];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') {
          depth--;
          if (!depth) args.push(code.slice(start, end).trim());
        } else if (c === ',' && depth === 1) {
          args.push(code.slice(start, end).trim());
          start = end + 1;
        }
      }
      const type = depthTypes.get(args[0]);
      if (!type || depth) continue;
      const levelIndex = type.endsWith('_array') ? 4 : 3;
      const inner = args.map(rewrite);
      if (
        inner[levelIndex] !== undefined &&
        !/^-?\d+[iu]?$/.test(inner[levelIndex]) &&
        !/^i32\(/.test(inner[levelIndex])
      )
        inner[levelIndex] = 'i32(' + inner[levelIndex] + ')';
      output += code.slice(at, match.index) + 'textureSampleLevel(' + inner.join(', ') + ')';
      at = end;
      calls.lastIndex = end;
    }
    return output + code.slice(at);
  };
  return rewrite(source);
}

function lowerInfiniteLiterals(source) {
  return source
    .replace(/\binff\b/g, '3.4028234e38f')
    .replace(/\bsmoothstep\(\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?f?)\s*,\s*\1\s*,/g, 'step($1, ')
    .replace(
      /\bclamp\(\s*([^,()]+)\s*,\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)f?\s*,\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)f?\s*\)/g,
      (whole, value, low, high) =>
        Number(low) > Number(high) ? 'min(max(' + value + ', ' + low + 'f), ' + high + 'f)' : whole,
    )
    .replace(/(?<![\w.])(\d+\.?\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)f\b/g, (whole, value) =>
      Number(value) > 3.4028234e38 ? '3.4028234e38f' : whole,
    );
}

function lowerDynamicTexelOffsets(source) {
  if (!/\b(?:textureOffset|textureLodOffset|texelFetchOffset)\s*\(/.test(source)) return source;
  const constant = text => {
    const value = text.trim();
    if (/^[-+]?\d+$/.test(value) || /^[iu]?vec[234]\s*\(\s*[-+\d\s,]*\)$/.test(value)) return true;
    return /^\w+$/.test(value) && new RegExp('\\bconst\\s+[iu]?vec[234]\\s+' + value + '\\b').test(source);
  };
  const samplerType = name =>
    (new RegExp('\\b(sampler(?:2D|3D)(?:Shadow)?)\\s+' + name + '\\b').exec(source) || [])[1] || null;
  const calls = /\b(textureOffset|textureLodOffset|texelFetchOffset)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const args = [];
    let depth = 1,
      start = calls.lastIndex,
      end = start;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        depth--;
        if (!depth) args.push(source.slice(start, end).trim());
      } else if (c === ',' && depth === 1) {
        args.push(source.slice(start, end).trim());
        start = end + 1;
      }
    }
    if (depth) continue;
    const kind = match[1],
      sampler = args[0];
    const offsetIndex = kind === 'textureOffset' ? 2 : 3;
    if (args.length <= offsetIndex || constant(args[offsetIndex])) continue;
    let replacement = null;
    if (kind === 'texelFetchOffset') {
      replacement = `texelFetch(${sampler}, (${args[1]}) + (${args[3]}), ${args[2]})`;
    } else if (/^\w+$/.test(sampler)) {
      const type = samplerType(sampler);
      if (type) {
        const lod = kind === 'textureLodOffset' ? `int(${args[2]})` : '0';
        const dims = type.startsWith('sampler3D') ? 3 : 2,
          vec = 'vec' + dims;
        let shift = `${vec}(${args[offsetIndex]}) / ${vec}(textureSize(${sampler}, ${lod}))`;
        if (type.endsWith('Shadow')) shift = `vec3(${shift}, 0.0)`;
        const coord = `(${args[1]}) + ${shift}`;
        replacement =
          kind === 'textureLodOffset'
            ? `textureLod(${sampler}, ${coord}, ${args[2]})`
            : `texture(${sampler}, ${coord}${args.length > 3 ? ', ' + args[3] : ''})`;
      }
    }
    if (!replacement) continue;
    output += source.slice(at, match.index) + replacement;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function lowerSubgroupsSingle(source) {
  if (!/\bsubgroup\w*\s*\(|\bgl_(?:Subgroup|NumSubgroups)\w*/.test(source)) return source;
  source = source.replace(/^[ \t]*#extension[ \t]+GL_KHR_shader_subgroup\w*[^\n]*$/gm, '');
  source = source
    .replace(/\bgl_SubgroupSize\b/g, '1u')
    .replace(/\bgl_SubgroupInvocationID\b/g, '0u')
    .replace(/\bgl_NumSubgroups\b/g, '(gl_WorkGroupSize.x*gl_WorkGroupSize.y*gl_WorkGroupSize.z)')
    .replace(/\bgl_SubgroupID\b/g, 'gl_LocalInvocationIndex')
    .replace(/\bgl_SubgroupEqMask\b/g, 'uvec4(1u,0u,0u,0u)')
    .replace(/\bgl_Subgroup(?:Ge|Le)Mask\b/g, 'uvec4(1u,0u,0u,0u)')
    .replace(/\bgl_Subgroup(?:Gt|Lt)Mask\b/g, 'uvec4(0u)');
  const calls = /\b(subgroup\w+)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed,
      fn = match[1],
      x = args[0] === undefined || args[0] === '' ? '' : '(' + args[0] + ')';
    let replacement = null;
    if (fn === 'subgroupElect') replacement = 'true';
    else if (/^subgroup(?:Barrier|MemoryBarrier\w*)$/.test(fn)) replacement = '0';
    else if (fn === 'subgroupAllEqual') replacement = 'true';
    else if (fn === 'subgroupBallot') replacement = `uvec4(${x}?1u:0u,0u,0u,0u)`;
    else if (fn === 'subgroupInverseBallot') replacement = `((${x}.x&1u)!=0u)`;
    else if (fn === 'subgroupBallotBitExtract') replacement = `(((${x}.x>>uint(${args[1]}))&1u)!=0u)`;
    else if (fn === 'subgroupBallotBitCount' || fn === 'subgroupBallotInclusiveBitCount')
      replacement = `uint(bitCount(${x}.x&1u))`;
    else if (fn === 'subgroupBallotExclusiveBitCount') replacement = '0u';
    else if (fn === 'subgroupBallotFindLSB' || fn === 'subgroupBallotFindMSB') replacement = '0u';
    else if (/^subgroupExclusive(?:Add|Or|Xor)$/.test(fn)) replacement = `(${x}-${x})`;
    else if (fn === 'subgroupExclusiveMul') replacement = `(${x}*0+1)`;
    else if (/^subgroupExclusive/.test(fn)) replacement = x;
    else if (
      /^subgroup(?:All|Any|Add|Mul|Min|Max|And|Or|Xor|Inclusive\w+|Clustered\w+|BroadcastFirst|Broadcast|Shuffle\w*|Quad\w+)$/.test(
        fn,
      )
    )
      replacement = x;
    if (replacement === null) continue;
    output += source.slice(at, match.index) + replacement;
    at = end;
    calls.lastIndex = end;
  }
  return (output + source.slice(at)).replace(/(^|[;{}])\s*0\s*;/gm, '$1');
}

function wgpuBarrierUniformity(code, messages) {
  const all = messages.map(m => m.message).join('\n');
  if (!/must only be called from uniform control flow/.test(all)) return null;
  let line = null;
  for (const m of messages)
    if (m.type !== 'error' && /control flow depends on possibly non-uniform value/.test(m.message)) {
      line = Number(m.lineNum);
      break;
    }
  if (!line) {
    const hit = /:(\d+):\d+ note: control flow depends on possibly non-uniform value/.exec(all);
    if (hit) line = Number(hit[1]);
  }
  if (!line) return null;
  const lines = code.split('\n'),
    text = lines[line - 1];
  if (!text || /wgpuUniformBool/.test(text)) return null;
  const patched = text
    .replace(/\bif\s+(.+?)\s*\{\s*$/, 'if wgpuUniformBool($1) {')
    .replace(/\bbreak\s+if\s+(.+?)\s*;\s*$/, 'break if wgpuUniformBool($1);');
  if (patched === text) return null;
  lines[line - 1] = patched;
  let out = lines.join('\n');
  if (!/\bfn wgpuUniformBool\b/.test(out)) out += wgpuUniformHelper(out);
  return out;
}

function lowerImage1D(source) {
  if (!/\b[iu]?image1D\b/.test(source)) return source;
  const names = new Set([...source.matchAll(/\b[iu]?image1D\s+(\w+)/g)].map(m => m[1]));
  source = source.replace(/\b([iu]?)image1D\b/g, '$1image2D');
  const calls = /\b(imageStore|imageLoad|imageAtomic\w+|imageSize)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed,
      fn = match[1];
    if (!names.has(args[0])) continue;
    const replacement =
      fn === 'imageSize'
        ? `imageSize(${args[0]}).x`
        : `${fn}(${args[0]}, ivec2(${args[1]}, 0)${args.length > 2 ? ', ' + args.slice(2).join(', ') : ''})`;
    output += source.slice(at, match.index) + replacement;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function lowerTrinaryMinMax(source) {
  if (!/\b(?:min3|max3|mid3)\s*\(/.test(source)) return source;
  const own = new Set(
    ['min3', 'max3', 'mid3'].filter(name =>
      new RegExp(
        '\\b(?:float|double|int|uint|[iu]?vec[234]|f16vec[234]|float16_t|\\w+)\\s+' + name + '\\s*\\([^;]*\\)\\s*\\{',
      ).test(source),
    ),
  );
  for (let round = 0; round < 16; round++) {
    const calls = /\b(min3|max3|mid3)\s*\(/g;
    let match,
      at = 0,
      output = '',
      changed = false;
    while ((match = calls.exec(source))) {
      if (own.has(match[1])) continue;
      const parsed = callArguments(source, calls.lastIndex);
      if (!parsed) continue;
      const [args, end] = parsed;
      if (args.length !== 3) continue;
      const [a, b, c] = args;
      const replacement =
        match[1] === 'min3'
          ? `min(${a}, min(${b}, ${c}))`
          : match[1] === 'max3'
            ? `max(${a}, max(${b}, ${c}))`
            : `max(min(${a}, ${b}), min(max(${a}, ${b}), ${c}))`;
      output += source.slice(at, match.index) + replacement;
      at = end;
      calls.lastIndex = end;
      changed = true;
    }
    source = output + source.slice(at);
    if (!changed) break;
  }
  return source;
}
function lowerSampler1D(source) {
  source = lowerTrinaryMinMax(source);
  if (!/\b[iu]?sampler1D\b/.test(source)) return source;
  const names = new Set([...source.matchAll(/\b[iu]?sampler1D\s+(\w+)/g)].map(m => m[1]));
  source = source.replace(/\b([iu]?)sampler1D\b/g, '$1sampler2D');
  const calls = /\b(texture|textureLod|textureGrad|texelFetch|textureSize|textureQueryLevels)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed,
      fn = match[1];
    if (!names.has(args[0])) continue;
    let replacement = null;
    if (fn === 'texture')
      replacement = `texture(${args[0]}, vec2(${args[1]}, 0.5)${args.length > 2 ? ', ' + args[2] : ''})`;
    else if (fn === 'textureLod') replacement = `textureLod(${args[0]}, vec2(${args[1]}, 0.5), ${args[2]})`;
    else if (fn === 'textureGrad')
      replacement = `textureGrad(${args[0]}, vec2(${args[1]}, 0.5), vec2(${args[2]}, 0.0), vec2(${args[3]}, 0.0))`;
    else if (fn === 'texelFetch') replacement = `texelFetch(${args[0]}, ivec2(${args[1]}, 0), ${args[2] ?? '0'})`;
    else if (fn === 'textureSize') replacement = `textureSize(${args[0]}, ${args[1] ?? '0'}).x`;
    if (replacement === null) continue;
    output += source.slice(at, match.index) + replacement;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function lowerSubgroups(source, stage) {
  if (!/\bsubgroup\w*\s*\(|\bgl_(?:Subgroup|NumSubgroups)\w*/.test(source)) return source;
  if (!globalThis.wgpuHasSubgroups) return lowerSubgroupsSingle(source);
  source = source.replace(/^[ \t]*#extension[ \t]+GL_KHR_shader_subgroup\w*[^\n]*$/gm, '');
  const builtins = {
    gl_SubgroupSize: 'Size',
    gl_SubgroupInvocationID: 'Invocation',
    gl_SubgroupID: 'Id',
    gl_NumSubgroups: 'Num',
    gl_SubgroupEqMask: 'EqMask',
    gl_SubgroupGeMask: 'GeMask',
    gl_SubgroupGtMask: 'GtMask',
    gl_SubgroupLeMask: 'LeMask',
    gl_SubgroupLtMask: 'LtMask',
  };
  const used = new Set();
  source = source.replace(
    /\bgl_(?:Subgroup(?:Size|InvocationID|ID|EqMask|GeMask|GtMask|LeMask|LtMask)|NumSubgroups)\b/g,
    name => {
      used.add(builtins[name]);
      return 'wgpuSg_' + builtins[name] + '_0()';
    },
  );
  source = source.replace(/\bsubgroup(?:Barrier|MemoryBarrier\w*)\s*\(\s*\)\s*;/g, ';');
  source = source.replace(/\bsubgroup([A-Z]\w*)\s*\(/g, (whole, op) => {
    used.add(op);
    return 'wgpuSg_' + op + '_0(';
  });
  const numeric = [
      'float',
      'vec2',
      'vec3',
      'vec4',
      'int',
      'ivec2',
      'ivec3',
      'ivec4',
      'uint',
      'uvec2',
      'uvec3',
      'uvec4',
    ],
    bools = ['bool', 'bvec2', 'bvec3', 'bvec4'];
  const integers = [...numeric.slice(4), ...bools],
    every = [...numeric, ...bools],
    decls = [];
  for (const op of used) {
    const define = (ret, params, body) => decls.push(`${ret} wgpuSg_${op}_0(${params}){${body}}`);
    if (/^(?:Size|Invocation|Id|Num)$/.test(op)) define('uint', '', 'return 0u;');
    else if (/Mask$/.test(op)) define('uvec4', '', 'return uvec4(0u);');
    else if (op === 'Elect') define('bool', '', 'return true;');
    else if (op === 'All' || op === 'Any') define('bool', 'bool v', 'return v;');
    else if (op === 'AllEqual') for (const t of every) define('bool', t + ' v', 'return true;');
    else if (op === 'Ballot') define('uvec4', 'bool v', 'return uvec4(0u);');
    else if (op === 'InverseBallot') define('bool', 'uvec4 v', 'return false;');
    else if (op === 'BallotBitExtract') define('bool', 'uvec4 v, uint i', 'return false;');
    else if (/^Ballot\w*(?:BitCount|FindLSB|FindMSB)$/.test(op)) define('uint', 'uvec4 v', 'return 0u;');
    else if (/^(?:Broadcast|Shuffle|ShuffleXor|ShuffleUp|ShuffleDown|QuadBroadcast)$/.test(op))
      for (const t of every) define(t, t + ' v, uint i', 'return v;');
    else if (/^(?:BroadcastFirst|QuadSwap\w+)$/.test(op)) for (const t of every) define(t, t + ' v', 'return v;');
    else if (/^Clustered/.test(op))
      for (const t of /(?:And|Or|Xor)$/.test(op) ? integers : numeric) define(t, t + ' v, uint i', 'return v;');
    else if (/(?:And|Or|Xor)$/.test(op)) for (const t of integers) define(t, t + ' v', 'return v;');
    else for (const t of numeric) define(t, t + ' v', 'return v;');
  }
  let at = 0;
  const directive = /^[ \t]*#[ \t]*(?:version|extension)\b[^\n]*\n?/gm;
  let found;
  while ((found = directive.exec(source))) at = found.index + found[0].length;
  return source.slice(0, at) + decls.join('\n') + '\n' + source.slice(at);
}

function wgpuRealSubgroupsWgsl(code) {
  if (!/\bfn wgpuSg_/.test(code)) return code;
  const entryKind = /@(compute|fragment|vertex)\b/.exec(code)?.[1],
    single = entryKind !== 'compute' && entryKind !== 'fragment';
  const splitTop = text => {
    const parts = [];
    let depth = 0,
      start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '<' || c === '(') depth++;
      else if (c === '>' || c === ')') depth--;
      else if (c === ',' && !depth) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    if (text.slice(start).trim()) parts.push(text.slice(start));
    return parts.map(x => x.trim()).filter(Boolean);
  };
  const head = /fn (wgpuSg_([A-Za-z]+)_0\w*)\s*\(([^)]*)\)\s*(?:->\s*([^{]+?))?\s*\{/g;
  let match,
    at = 0,
    out = '';
  while ((match = head.exec(code))) {
    const op = match[2],
      ret = (match[4] || '').trim();
    let depth = 1,
      end = head.lastIndex;
    for (; end < code.length && depth; end++) {
      if (code[end] === '{') depth++;
      else if (code[end] === '}') depth--;
    }
    const args = splitTop(match[3]).map(param => {
      const colon = param.indexOf(':'),
        name = param.slice(0, colon).trim(),
        type = param.slice(colon + 1).trim();
      const pointer = /^ptr<\s*function\s*,\s*(.+)>$/.exec(type);
      return pointer ? { e: '(*' + name + ')', t: pointer[1].trim() } : { e: name, t: type };
    });
    const v = args[0]?.e,
      t = args[0]?.t || '',
      i = args[1]?.e;
    const width = /^vec(\d)</.exec(t)?.[1],
      isBool = /\bbool\b/.test(t);
    const uType = width ? `vec${width}<u32>` : 'u32',
      vType = t;
    const toU = x => (isBool ? `select(${uType}(0u), ${uType}(1u), ${x})` : x);
    const fromU = x => (isBool ? `(${x} != ${uType}(0u))` : x);
    const scalar = isBool ? 'u32' : /f32/.test(t) ? 'f32' : /i32/.test(t) ? 'i32' : /f16/.test(t) ? 'f16' : 'u32';
    const workType = isBool ? uType : vType;
    const kind = /(Min|Max|And|Or|Xor|Add|Mul)$/.exec(op)?.[1];
    const combine = (a, b) =>
      ({
        Min: `min(${a}, ${b})`,
        Max: `max(${a}, ${b})`,
        And: `(${a} & ${b})`,
        Or: `(${a} | ${b})`,
        Xor: `(${a} ^ ${b})`,
        Add: `(${a} + ${b})`,
        Mul: `(${a} * ${b})`,
      })[kind];
    const identity = () => {
      const one = { f32: '1.0', f16: '1.0h', i32: '1i', u32: '1u' }[scalar],
        zero = { f32: '0.0', f16: '0.0h', i32: '0i', u32: '0u' }[scalar];
      const value = {
        Add: zero,
        Or: zero,
        Xor: zero,
        Mul: one,
        And: { i32: '-1i', u32: '4294967295u' }[scalar] || zero,
        Min: { f32: 'bitcast<f32>(0x7f800000u)', f16: '65504.0h', i32: '2147483647i', u32: '4294967295u' }[scalar],
        Max: { f32: 'bitcast<f32>(0xff800000u)', f16: '-65504.0h', i32: 'i32(-2147483647i - 1i)', u32: '0u' }[scalar],
      }[kind];
      return width ? `${workType}(${value})` : value;
    };
    let body;
    if (op === 'Size') body = 'return wgpuSgSize;';
    else if (op === 'Invocation') body = 'return wgpuSgLane;';
    else if (op === 'Id') body = 'return wgpuSgId;';
    else if (op === 'Num') body = 'return wgpuSgNum;';
    else if (/Mask$/.test(op))
      body = `return wgpuSgLaneMask(${{ EqMask: 0, GeMask: 1, GtMask: 2, LeMask: 3, LtMask: 4 }[op]}u);`;
    else if (op === 'Elect') body = 'return subgroupElect();';
    else if (op === 'All' || op === 'Any') body = `return subgroup${op}(${v});`;
    else if (op === 'AllEqual')
      body = `let wgpuX = ${toU(v)}; return subgroupAll(all(wgpuX == subgroupBroadcastFirst(wgpuX)));`;
    else if (op === 'Ballot') body = `return subgroupBallot(${v});`;
    else if (op === 'InverseBallot') body = `return ((${v}[wgpuSgLane / 32u] >> (wgpuSgLane % 32u)) & 1u) != 0u;`;
    else if (op === 'BallotBitExtract') body = `return ((${v}[${i} / 32u] >> (${i} % 32u)) & 1u) != 0u;`;
    else if (op === 'BallotBitCount') body = `return wgpuSgCount(${v});`;
    else if (op === 'BallotInclusiveBitCount') body = `return wgpuSgCount(${v} & wgpuSgLaneMask(3u));`;
    else if (op === 'BallotExclusiveBitCount') body = `return wgpuSgCount(${v} & wgpuSgLaneMask(4u));`;
    else if (op === 'BallotFindLSB') body = `return wgpuSgFindLSB(${v});`;
    else if (op === 'BallotFindMSB') body = `return wgpuSgFindMSB(${v});`;
    else if (op === 'Broadcast' || op === 'Shuffle') body = `return ${fromU(`subgroupShuffle(${toU(v)}, ${i})`)};`;
    else if (/^Shuffle(?:Xor|Up|Down)$/.test(op)) body = `return ${fromU(`subgroup${op}(${toU(v)}, ${i})`)};`;
    else if (op === 'QuadBroadcast')
      body = `return ${fromU(`subgroupShuffle(${toU(v)}, (wgpuSgLane & ~3u) | (${i}))`)};`;
    else if (op === 'BroadcastFirst') body = `return ${fromU(`subgroupBroadcastFirst(${toU(v)})`)};`;
    else if (/^QuadSwap/.test(op))
      body = `return ${fromU(`${{ QuadSwapHorizontal: 'quadSwapX', QuadSwapVertical: 'quadSwapY', QuadSwapDiagonal: 'quadSwapDiagonal' }[op]}(${toU(v)})`)};`;
    else if (/^(?:Add|Mul|Min|Max|And|Or|Xor)$/.test(op)) body = `return ${fromU(`subgroup${op}(${toU(v)})`)};`;
    else if (/^(?:Inclusive|Exclusive)(?:Add|Mul)$/.test(op)) body = `return subgroup${op}(${v});`;
    else if (/^(?:Inclusive|Exclusive)/.test(op) && kind)
      body =
        `var wgpuX = ${toU(v)}; var wgpuD = 1u; loop { if wgpuD >= wgpuSgSize { break; } let wgpuO = subgroupShuffleUp(wgpuX, wgpuD); if wgpuSgLane >= wgpuD { wgpuX = ${combine('wgpuX', 'wgpuO')}; } wgpuD = wgpuD * 2u; } ` +
        (/^Exclusive/.test(op)
          ? `let wgpuS = subgroupShuffleUp(wgpuX, 1u); return ${fromU(`select(${identity()}, wgpuS, wgpuSgLane > 0u)`)};`
          : `return ${fromU('wgpuX')};`);
    else if (/^Clustered/.test(op) && kind)
      body = `var wgpuX = ${toU(v)}; var wgpuM = 1u; loop { if wgpuM >= ${i} { break; } wgpuX = ${combine('wgpuX', `subgroupShuffleXor(wgpuX, wgpuM)`)}; wgpuM = wgpuM * 2u; } return ${fromU('wgpuX')};`;
    if (single) {
      body =
        op === 'Size' || op === 'Num'
          ? 'return 1u;'
          : op === 'Invocation' || op === 'Id'
            ? 'return 0u;'
            : /^(?:Eq|Ge|Le)Mask$/.test(op)
              ? 'return vec4<u32>(1u, 0u, 0u, 0u);'
              : /Mask$/.test(op)
                ? 'return vec4<u32>(0u);'
                : op === 'Elect' || op === 'AllEqual'
                  ? 'return true;'
                  : op === 'Ballot'
                    ? `return vec4<u32>(select(0u, 1u, ${v}), 0u, 0u, 0u);`
                    : op === 'InverseBallot'
                      ? `return (${v}.x & 1u) != 0u;`
                      : op === 'BallotBitExtract'
                        ? `return ${i} == 0u && (${v}.x & 1u) != 0u;`
                        : /^Ballot(?:Inclusive)?BitCount$/.test(op)
                          ? `return ${v}.x & 1u;`
                          : /^Ballot(?:ExclusiveBitCount|FindLSB|FindMSB)$/.test(op)
                            ? 'return 0u;'
                            : /^Exclusive/.test(op) && kind
                              ? `return ${fromU(identity())};`
                              : `return ${v};`;
    }
    if (!body) {
      continue;
    }
    const old = code.slice(head.lastIndex, end - 1),
      lines = (old.match(/\n/g) || []).length;
    out += code.slice(at, head.lastIndex) + ' ' + body + '\n'.repeat(lines) + '}';
    at = end;
    head.lastIndex = end;
  }
  code = out + code.slice(at);
  const entry = /@(compute|fragment)\b[^\n]*\n?\s*(?:@[^\n]*\n\s*)*fn\s+(\w+)\s*\(/g.exec(code);
  if (entry) {
    const open = entry.index + entry[0].length;
    let depth = 1,
      close = open;
    for (; close < code.length && depth; close++) {
      if (code[close] === '(') depth++;
      else if (code[close] === ')') depth--;
    }
    const params = code.slice(open, close - 1),
      brace = code.indexOf('{', close);
    let extra = '@builtin(subgroup_size) wgpuSgSizeIn: u32, @builtin(subgroup_invocation_id) wgpuSgLaneIn: u32, ',
      init = 'wgpuSgSize = wgpuSgSizeIn; wgpuSgLane = wgpuSgLaneIn; ';
    if (entry[1] === 'compute') {
      let index = /@builtin\(\s*local_invocation_index\s*\)\s*(\w+)/.exec(params)?.[1];
      if (!index) {
        index = 'wgpuSgIndexIn';
        extra += '@builtin(local_invocation_index) wgpuSgIndexIn: u32, ';
      }
      const size = /@workgroup_size\(([^)]*)\)/
        .exec(code.slice(0, entry.index + entry[0].length))?.[1]
        .split(',')
        .map(x => parseInt(x, 10))
        .filter(Number.isFinite) || [1];
      const total = size.reduce((a, b) => a * b, 1);
      init += `wgpuSgId = ${index} / wgpuSgSizeIn; wgpuSgNum = (${total}u + wgpuSgSizeIn - 1u) / wgpuSgSizeIn; `;
    } else init += 'wgpuSgId = 0u; wgpuSgNum = 1u; ';
    code = code.slice(0, open) + extra + code.slice(open, brace + 1) + ' ' + init + code.slice(brace + 1);
  }
  const first = code.indexOf('\n');
  code = 'enable subgroups;diagnostic(off, subgroup_uniformity);' + code;
  return (
    code +
    '\nvar<private> wgpuSgSize: u32;\nvar<private> wgpuSgLane: u32;\nvar<private> wgpuSgId: u32;\nvar<private> wgpuSgNum: u32;\n' +
    'fn wgpuSgLaneMask(kind: u32) -> vec4<u32> {\n  var mask = vec4<u32>(0u);\n  for (var c = 0u; c < 4u; c++) {\n    for (var b = 0u; b < 32u; b++) {\n      let lane = c * 32u + b;\n      if lane >= wgpuSgSize { continue; }\n' +
    '      let on = select(select(select(select(lane < wgpuSgLane, lane <= wgpuSgLane, kind == 3u), lane > wgpuSgLane, kind == 2u), lane >= wgpuSgLane, kind == 1u), lane == wgpuSgLane, kind == 0u);\n      if on { mask[c] |= 1u << b; }\n    }\n  }\n  return mask;\n}\n' +
    'fn wgpuSgCount(v: vec4<u32>) -> u32 { return countOneBits(v.x) + countOneBits(v.y) + countOneBits(v.z) + countOneBits(v.w); }\n' +
    'fn wgpuSgFindLSB(v: vec4<u32>) -> u32 { for (var c = 0u; c < 4u; c++) { if v[c] != 0u { return c * 32u + firstTrailingBit(v[c]); } } return 4294967295u; }\n' +
    'fn wgpuSgFindMSB(v: vec4<u32>) -> u32 { for (var c = 3i; c >= 0i; c--) { if v[c] != 0u { return u32(c) * 32u + firstLeadingBit(v[c]); } } return 4294967295u; }\n'
  );
}

function glslImageFormatViews(source, formats) {
  if (!formats || !/\bcolorimg\d+\b/.test(source)) return source;
  const codecs = {
    rgba8: ['packUnorm4x8(%)', 'unpackUnorm4x8(%)'],
    rgba8_snorm: ['packSnorm4x8(%)', 'unpackSnorm4x8(%)'],
    r32f: ['floatBitsToUint((%).x)', 'vec4(uintBitsToFloat(%),0.0,0.0,1.0)'],
    rg16f: ['packHalf2x16((%).xy)', 'vec4(unpackHalf2x16(%),0.0,1.0)'],
    rg16: ['packUnorm2x16((%).xy)', 'vec4(unpackUnorm2x16(%),0.0,1.0)'],
    rg16_snorm: ['packSnorm2x16((%).xy)', 'vec4(unpackSnorm2x16(%),0.0,1.0)'],
  };
  const views = new Map();
  source = source.replace(
    /layout\s*\(\s*(\w+)\s*\)\s*((?:(?:uniform|readonly|writeonly|coherent|volatile|restrict)\s+)*)image2D\s+(colorimg(\d+))\s*;/g,
    (whole, format, qualifiers, name, index) => {
      const real = String(formats[index] || '').toLowerCase(),
        codec = codecs[format.toLowerCase()];
      if (!/^r32(?:ui|i)$/.test(real) || !codec) return whole;
      const signed = real === 'r32i';
      views.set(name, { codec, signed });
      return `layout(${real}) ${qualifiers}${signed ? 'i' : 'u'}image2D ${name};`;
    },
  );
  if (!views.size) return source;
  const calls = /\b(imageStore|imageLoad)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed,
      view = views.get(args[0]);
    if (!view) continue;
    const [encode, decode] = view.codec;
    let replacement;
    if (match[1] === 'imageStore') {
      const bits = encode.replace('%', () => args[2]);
      replacement = `imageStore(${args[0]}, ${args[1]}, ${view.signed ? `ivec4(int(${bits}),0,0,0)` : `uvec4(${bits},0u,0u,0u)`})`;
    } else {
      const bits = view.signed ? `uint(imageLoad(${args[0]}, ${args[1]}).x)` : `imageLoad(${args[0]}, ${args[1]}).x`;
      replacement = decode.replace('%', () => bits);
    }
    output += source.slice(at, match.index) + replacement;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function foldBufferArrayLengths(source) {
  if (!/\.length\s*\(\s*\)/.test(source) || !/\bbuffer\b/.test(source)) return source;
  const sizes = new Map();
  for (const block of source.matchAll(/\bbuffer\s+\w+\s*\{([^{}]*)\}\s*(\w+)?\s*;/g)) {
    const prefix = block[2] ? block[2] + '.' : '';
    for (const member of block[1].matchAll(/\b\w+\s*\[\s*(\d+)\s*\]\s+(\w+)\s*;|\b\w+\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;/g))
      sizes.set(prefix + (member[2] || member[3]), member[1] || member[4]);
  }
  for (const [name, size] of sizes)
    source = source.replace(
      new RegExp('\\b' + name.replace('.', '\\s*\\.\\s*') + '\\s*\\.\\s*length\\s*\\(\\s*\\)', 'g'),
      size,
    );
  return source;
}
function nameAnonymousStructs(source) {
  if (!/\bstruct\s*\{/.test(source)) return source;
  let count = 0;
  return source.replace(
    /(^|[;{}\n])([ \t]*)((?:(?:shared|const|uniform|in|out|flat|highp|mediump|lowp|coherent|volatile|restrict)\s+)*)struct\s*\{([^{}]*)\}\s*(\w+(?:\s*\[[^\]\n]*\])?)\s*;/g,
    (whole, lead, indent, qualifiers, body, declarator) => {
      let name = 'WgpuAnonStruct' + count++;
      while (new RegExp('\\b' + name + '\\b').test(source)) name += '_';
      return (
        lead + indent + 'struct ' + name + ' {' + body + '};\n' + indent + qualifiers + name + ' ' + declarator + ';'
      );
    },
  );
}
function glslBufferQualifiers(source) {
  if (!/\bbuffer\b/.test(source)) return source;
  source = source
    .replace(
      /((?:\b(?:readonly|writeonly|coherent|volatile|restrict)\s+)+)(layout\s*\([^)]*\)\s*)(?=(?:(?:readonly|writeonly|coherent|volatile|restrict)\s+)*buffer\b)/g,
      '$2$1',
    )
    .replace(
      /\b(readonly|writeonly|coherent|volatile|restrict)\s+(?=(?:(?:readonly|writeonly|coherent|volatile|restrict)\s+)*\1\b)/g,
      '',
    );
  return source
    .replace(/\bwriteonly\s+(?=(?:(?:coherent|volatile|restrict)\s+)*buffer\b)/g, '')
    .replace(
      /(\bbuffer\s+\w+\s*\{)([^{}]*)\}/g,
      (whole, head, body) => head + body.replace(/\b(?:coherent|volatile|restrict|readonly|writeonly)\s+/g, '') + '}',
    );
}

function wgpuNonFiniteLiterals(code) {
  if (!/\b(?:NaNf|inff)\b/.test(code)) return code;
  code = code.replace(/\bNaNf\b/g, 'bitcast<f32>(wgpuNaNBits)').replace(/\binff\b/g, 'bitcast<f32>(wgpuInfBits)');
  return code + '\nvar<private> wgpuNaNBits: u32 = 0x7fc00000u;\nvar<private> wgpuInfBits: u32 = 0x7f800000u;\n';
}

function wgpuUniformHelper(code) {
  const scalar = type => (/^(?:u32|i32|f32)$/.test(type) ? type : null);
  const parts = type => {
    const vector = /^vec([234])<(u32|i32|f32)>$/.exec(type);
    return vector ? { type, base: vector[2], width: vector[1] } : scalar(type) ? { type, base: type, width: 0 } : null;
  };
  for (const match of code.matchAll(/^var<workgroup>\s+(\w+)\s*:\s*(.+?);\s*$/gm)) {
    let [, name, type] = match,
      place = name,
      element = parts(type.trim());
    const array = /^array<\s*(.+?)\s*,\s*\d+u?\s*>$/.exec(type.trim());
    if (array) {
      element = parts(array[1].trim());
      place = name + '[0]';
    }
    if (!element) continue;
    const zero = { u32: '0u', i32: '0i', f32: '0.0' }[element.base],
      one = { u32: '1u', i32: '1i', f32: '1.0' }[element.base];
    const encode = element.width ? `${element.type}(select(${zero}, ${one}, b))` : `select(${zero}, ${one}, b)`;
    const decode = element.width ? `v.x != ${zero}` : `v != ${zero}`;
    return `\nfn wgpuUniformBool(b: bool) -> bool {\n  let saved = workgroupUniformLoad(&${place});\n  ${place} = ${encode};\n  let v = workgroupUniformLoad(&${place});\n  ${place} = saved;\n  workgroupBarrier();\n  return ${decode};\n}\n`;
  }
  return '\nvar<workgroup> wgpuUniformFlag: u32;\nfn wgpuUniformBool(b: bool) -> bool {\n  wgpuUniformFlag = select(0u, 1u, b);\n  let v = workgroupUniformLoad(&wgpuUniformFlag);\n  workgroupBarrier();\n  return v != 0u;\n}\n';
}

function wgpuZeroProducts(code) {
  if (!/(?<![\w.])0(?:\.0*)?f?\s*\*|\*\s*0(?:\.0*)?f?(?![\w.])/.test(code)) return code;
  const operand = '(?:\\(\\*\\w+\\)|[A-Za-z_]\\w*)(?:\\.\\w+|\\[\\w+\\])*',
    zero = '(?<![\\w.])0(?:\\.0*)?f?(?![\\w.])';
  return code
    .replace(new RegExp('\\(\\s*' + zero + '\\s*\\*\\s*(' + operand + ')\\s*\\)', 'g'), '(sign($1) * 0f)')
    .replace(new RegExp('\\(\\s*(' + operand + ')\\s*\\*\\s*' + zero + '\\s*\\)', 'g'), '(sign($1) * 0f)');
}

function lowerGatherOffsets(source) {
  const calls = /\btextureGatherOffsets\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const args = [];
    let depth = 1,
      start = calls.lastIndex,
      end = start;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        depth--;
        if (!depth) args.push(source.slice(start, end).trim());
      } else if (c === ',' && depth === 1) {
        args.push(source.slice(start, end).trim());
        start = end + 1;
      }
    }
    if (depth || args.length < 3 || args.length > 4) continue;
    const [sampler, coord, offsets] = args,
      component = 'rgba'[Number(args[3] ?? 0)] || 'r';
    const texel = index =>
      `texelFetch(${sampler},clamp(ivec2(floor((${coord})*vec2(textureSize(${sampler},0))-0.5))+(${offsets})[${index}],ivec2(0),textureSize(${sampler},0)-1),0).${component}`;
    output += source.slice(at, match.index) + `vec4(${[0, 1, 2, 3].map(texel).join(',')})`;
    at = end;
    calls.lastIndex = end;
  }
  return lowerShadowGather(lowerGatherOffset(output + source.slice(at)));
}

function lowerGatherOffset(source) {
  const shadowSamplers = new Set(
    [...source.matchAll(/\b(?:uniform\s+)?(?:\w+\s+)?sampler2DShadow\s+(\w+)/g)].map(m => m[1]),
  );
  const calls = /\btextureGatherOffset\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const args = [];
    let depth = 1,
      start = calls.lastIndex,
      end = start;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        depth--;
        if (!depth) args.push(source.slice(start, end).trim());
      } else if (c === ',' && depth === 1) {
        args.push(source.slice(start, end).trim());
        start = end + 1;
      }
    }
    if (depth || shadowSamplers.has(args[0]) || args.length < 3 || args.length > 4) continue;
    const [sampler, coord, offset] = args,
      component = 'rgba'[Number(args[3] ?? 0)] || 'r';
    const base = `ivec2(floor((${coord})*vec2(textureSize(${sampler},0))-0.5))+(${offset})`;
    const texel = corner =>
      `texelFetch(${sampler},clamp(${base}+ivec2(${corner}),ivec2(0),textureSize(${sampler},0)-1),0).${component}`;
    output += source.slice(at, match.index) + `vec4(${['0,1', '1,1', '1,0', '0,0'].map(texel).join(',')})`;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function dropDuplicateUniforms(source) {
  const defined = new Set(),
    stack = [],
    seen = new Map();
  const test = expression => {
    const match = /^(!?)\s*defined\s*\(?\s*(\w+)\s*\)?$/.exec(expression.trim());
    return match ? defined.has(match[2]) !== (match[1] === '!') : null;
  };
  return source
    .split('\n')
    .map(line => {
      const directive = /^\s*#\s*(define|undef|ifdef|ifndef|if|elif|else|endif)\b\s*(.*)$/.exec(line);
      const certain = stack.every(frame => frame.state === true),
        possible = stack.every(frame => frame.state !== false);
      if (directive) {
        const [, op, arg] = directive,
          word = arg.trim().split(/\s+/)[0];
        if (op === 'define' && possible) defined.add(word);
        else if (op === 'undef' && possible) defined.delete(word);
        else if (op === 'ifdef') stack.push({ state: defined.has(word), taken: defined.has(word) });
        else if (op === 'ifndef') stack.push({ state: !defined.has(word), taken: !defined.has(word) });
        else if (op === 'if') {
          const state = test(arg);
          stack.push({ state, taken: state });
        } else if (op === 'elif') {
          const frame = stack.at(-1);
          if (frame) {
            const state = frame.taken === true ? false : test(arg);
            frame.state = state;
            if (state !== false) frame.taken = frame.taken || state;
          }
        } else if (op === 'else') {
          const frame = stack.at(-1);
          if (frame) frame.state = frame.taken === true ? false : frame.taken === false ? true : null;
        } else if (op === 'endif') stack.pop();
        return line;
      }
      const uniform = /^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/.exec(line);
      if (!uniform || !certain) return line;
      const [, type, name] = uniform;
      if (seen.get(name) === type) return '// ' + line.trim() + ' // doppelt';
      if (!seen.has(name)) seen.set(name, type);
      return line;
    })
    .join('\n');
}

function atomicImageSpecs(sources, resources, properties = {}) {
  const names = new Set();
  for (const source of sources)
    for (const match of source.matchAll(/\bimageAtomic\w+\s*\(\s*(\w+)/g)) names.add(match[1]);
  const used = new Set(resources.buffers.map(buffer => buffer.binding)),
    specs = [];
  let binding = 0;
  for (const image of resources.images) {
    const intView = /^r32f$/i.test(image.format)
      ? new RegExp(
          'layout\\s*\\(\\s*(r32ui|r32i)\\s*\\)\\s*(?:\\w+\\s+)*uniform\\s+(?:\\w+\\s+)*[iu]image\\w*\\s+' +
            image.name +
            '\\b',
          'i',
        ).exec(sources.join('\n'))?.[1]
      : null;
    if (
      !names.has(image.name) ||
      (!/^r32(?:ui|i)$/i.test(image.format) && !intView) ||
      (image.size.length > 2 && image.relative)
    )
      continue;
    while (used.has(binding)) binding++;
    used.add(binding);
    const texels = image.size.slice(0, image.relative ? 2 : 3).reduce((product, size) => product * size, 1);
    specs.push({
      name: image.name,
      sampler: image.sampler,
      binding,
      signed: /^r32i$/i.test(intView || image.format),
      floatBits: !!intView,
      relative: image.relative,
      size: image.size,
      buffer: image.relative
        ? { binding, size: 4, relative: true, scaleX: image.size[0], scaleY: image.size[1], clear: image.clear }
        : { binding, size: 4 * texels, clear: image.clear },
    });
  }
  const aliases = new Map();
  for (const source of sources)
    for (const match of source.matchAll(/^[ \t]*#define[ \t]+(\w+)[ \t]+(colorimg\d+)\b/gm))
      aliases.set(match[1], match[2]);
  const rendered = new Set();
  for (const source of sources)
    for (const [, kind, list] of source.matchAll(/\/\*\s*(DRAWBUFFERS|RENDERTARGETS)\s*:\s*([\d,\s]+)\*\//g))
      for (const target of kind === 'DRAWBUFFERS' ? list.replace(/\s/g, '').split('') : list.split(','))
        rendered.add(Number(target));
  for (const name of new Set([...names].map(found => aliases.get(found) || found))) {
    const index = /^colorimg(\d+)$/.exec(name)?.[1];
    if (index === undefined || rendered.has(Number(index)) || resources.images.some(image => image.name === name))
      continue;
    const text = sources.join('\n'),
      format = new RegExp('\\bconst\\s+int\\s+colortex' + index + 'Format\\s*=\\s*(R32UI|R32I)\\b', 'i').exec(
        text,
      )?.[1];
    if (!format) continue;
    while (used.has(binding)) binding++;
    used.add(binding);
    const parts = String(properties['size.buffer.colortex' + index] || '1.0 1.0')
        .trim()
        .split(/\s+/),
      absolute = /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]);
    const size = [Number(parts[0]), Number(parts[1])],
      clear = !new RegExp('\\bconst\\s+bool\\s+colortex' + index + 'Clear\\s*=\\s*false\\b').test(text);
    specs.push({
      name,
      sampler: 'colortex' + index,
      colorTarget: Number(index),
      binding,
      signed: /^r32i$/i.test(format),
      relative: !absolute,
      size,
      buffer: absolute
        ? { binding, size: 4 * size[0] * size[1], clear }
        : { binding, size: 4, relative: true, scaleX: size[0], scaleY: size[1], clear },
    });
  }
  return specs;
}
function lowerAtomicImages(source, specs) {
  for (const spec of specs) {
    const { name, sampler } = spec,
      uses = new RegExp(
        '\\b(?:imageAtomic\\w+|imageStore|imageLoad|imageSize)\\s*\\(\\s*' +
          name +
          '\\b|\\b(?:texture|textureLod|texelFetch|texture2D)\\s*\\(\\s*' +
          sampler +
          '\\b',
      );
    if (!uses.test(source)) continue;
    const scalar = spec.signed ? 'int' : 'uint',
      vector = spec.signed ? 'ivec4' : 'uvec4',
      zero = spec.signed ? '0' : '0u',
      one = spec.signed ? '1' : '1u';
    const floatView =
      spec.floatBits && new RegExp('\\buniform\\s+(?:\\w+\\s+)*image\\w*\\s+' + name + '\\b').test(source);
    const toBits = value => (spec.signed ? 'floatBitsToInt(' + value + ')' : 'floatBitsToUint(' + value + ')'),
      fromBits = value => (spec.signed ? 'intBitsToFloat(' + value + ')' : 'uintBitsToFloat(' + value + ')');
    const float = value => (Number.isInteger(value) ? value.toFixed(1) : String(value));
    const width = spec.relative ? `int(viewWidth*${float(spec.size[0])})` : String(spec.size[0]),
      height = spec.relative ? `int(viewHeight*${float(spec.size[1])})` : String(spec.size[1] ?? 1);
    const volume = !spec.relative && spec.size.length > 2,
      depth = volume ? String(spec.size[2]) : '1';
    const data = 'wgpuAtomicData_' + name,
      index = position =>
        `${data}[${volume ? `clamp(int((${position}).z),0,${depth}-1)*(${height})*(${width})+` : ''}clamp(int((${position}).y),0,${height}-1)*(${width})+clamp(int((${position}).x),0,${width}-1)]`;
    const calls = new RegExp(
      '\\b(imageAtomic(\\w+)|imageStore|imageLoad|imageSize|texture|textureLod|texelFetch|texture2D)\\s*\\(',
      'g',
    );
    let match,
      at = 0,
      output = '';
    while ((match = calls.exec(source))) {
      const parsed = callArguments(source, calls.lastIndex);
      if (!parsed) continue;
      const [args, end] = parsed,
        fn = match[1];
      let replacement = null;
      if (args[0] === name) {
        if (match[2]) replacement = `atomic${match[2]}(${index(args[1])}, ${args.slice(2).join(', ')})`;
        else if (fn === 'imageStore')
          replacement = floatView
            ? `(${index(args[1])} = ${toBits(`(${args[2]}).x`)})`
            : `(${index(args[1])} = (${args[2]}).x)`;
        else if (fn === 'imageLoad')
          replacement = floatView
            ? `vec4(${fromBits(index(args[1]))},0.0,0.0,1.0)`
            : `${vector}(${index(args[1])},${zero},${zero},${one})`;
        else if (fn === 'imageSize')
          replacement = volume ? `ivec3(${width},${height},${depth})` : `ivec2(${width},${height})`;
      } else if (args[0] === sampler && sampler) {
        const texel =
          fn === 'texelFetch'
            ? volume && new RegExp('\\b[iu]?sampler2D\\s+' + sampler + '\\b').test(source)
              ? 'ivec3(' + args[1] + ',0)'
              : args[1]
            : volume
              ? `ivec3(floor((${args[1]})*vec3(${width},${height},${depth})))`
              : `ivec2(floor((${args[1]})*vec2(${width},${height})))`;
        replacement = spec.floatBits
          ? `vec4(${fromBits(index(texel))},0.0,0.0,1.0)`
          : `${vector}(${index(texel)},${zero},${zero},${one})`;
      }
      if (replacement === null) continue;
      output += source.slice(at, match.index) + replacement;
      at = end;
      calls.lastIndex = end;
    }
    source = output + source.slice(at);
    const header =
      `layout(std430, binding=${spec.binding}) buffer WgpuAtomicImage_${name} { ${scalar} ${data}[]; };\n` +
      (/\buniform\s+float\s+viewWidth\b/.test(source) ? '' : 'uniform float viewWidth;\n') +
      (/\buniform\s+float\s+viewHeight\b/.test(source) ? '' : 'uniform float viewHeight;\n');
    const version = source.match(/^[ \t]*#version[^\n]*\n(?:[ \t]*#extension[^\n]*\n)*/m);
    source = version
      ? source.slice(0, version.index + version[0].length) + header + source.slice(version.index + version[0].length)
      : header + source;
  }
  return source;
}

function callArguments(source, start) {
  const args = [];
  let depth = 1,
    end = start;
  for (; end < source.length && depth; end++) {
    const c = source[end];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      depth--;
      if (!depth) args.push(source.slice(start, end).trim());
    } else if (c === ',' && depth === 1) {
      args.push(source.slice(start, end).trim());
      start = end + 1;
    }
  }
  return depth ? null : [args, end];
}

function lowerIntegerSampling(source) {
  for (const fn of [...source.matchAll(/\b(\w+)\s*\(([^(){};]*\bsampler[23]D\s+\w+[^(){};]*)\)\s*\{/g)]) {
    const slots = fn[2].split(',').flatMap((param, slot) => (/\bsampler[23]D\b/.test(param) ? [slot] : []));
    const calls = new RegExp('\\b' + fn[1] + '\\s*\\(', 'g');
    let call;
    while ((call = calls.exec(source))) {
      const parsed = callArguments(source, calls.lastIndex);
      if (!parsed) continue;
      for (const slot of slots)
        if (parsed[0][slot])
          source = source.replace(
            new RegExp('\\buniform\\s+[ui]sampler([23])D\\s+' + parsed[0][slot].trim() + '\\s*;'),
            'uniform sampler$1D ' + parsed[0][slot].trim() + ';',
          );
    }
  }
  const names = new Map([...source.matchAll(/\b[ui]sampler([23])D\s+(\w+)/g)].map(m => [m[2], m[1]]));
  if (!names.size) return source;
  const calls = /\b(texture2D|texture|textureLod)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed;
    if (!names.has(args[0]) || args.length < 2) continue;
    const [sampler, coord] = args,
      level = match[1] === 'textureLod' ? 'int(' + args[2] + ')' : '0';
    const size = `textureSize(${sampler},${level})`;
    const dim = names.get(sampler);
    output +=
      source.slice(at, match.index) +
      `texelFetch(${sampler},clamp(ivec${dim}(floor((${coord})*vec${dim}(${size}))),ivec${dim}(0),${size}-1),${level})`;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function lowerComponentOutputs(source) {
  const declaration =
    /^([ \t]*)layout\s*\(\s*location\s*=\s*(\d+)\s*,\s*component\s*=\s*(\d+)\s*\)\s*out\s+(float|int|uint|[iu]?vec[234])\s+(\w+)\s*;/gm;
  if (!declaration.test(source)) return source;
  declaration.lastIndex = 0;
  const locations = new Map(),
    copies = [],
    renamed = [];
  source = source.replace(declaration, (whole, indent, location, component, type, original) => {
    const name = 'wgpuComponent_' + original;
    renamed.push(original);
    const base = /^u/.test(type) ? 'u' : /^i/.test(type) ? 'i' : '',
      output = 'wgpuComponentOut' + location;
    let text = indent + type + ' ' + name + ';';
    if (!locations.has(location)) {
      locations.set(location, base);
      text += '\n' + indent + 'layout(location = ' + location + ') out ' + base + 'vec4 ' + output + ';';
      copies.push('  ' + output + ' = ' + base + 'vec4(0);');
    }
    const width = /\d$/.test(type) ? Number(type.slice(-1)) : 1;
    copies.push('  ' + output + '.' + 'xyzw'.slice(Number(component), Number(component) + width) + ' = ' + name + ';');
    return text;
  });
  for (const original of renamed)
    source = source.replace(new RegExp('(?<![.\\w])' + original + '\\b', 'g'), 'wgpuComponent_' + original);
  const entry = /\bvoid[ \t\r\n]+main[ \t\r\n]*\([ \t\r\n]*(?:void)?[ \t\r\n]*\)/g;
  if (!entry.test(source)) return source;
  let inner = 'wgpuComponentMain';
  while (new RegExp('\\b' + inner + '\\b').test(source)) inner += '_';
  return (
    source.replace(entry, 'void ' + inner + '()') +
    '\nvoid main() {\n  ' +
    inner +
    '();\n' +
    copies.join('\n') +
    '\n}\n'
  );
}
function dropPerVertexBlocks(source) {
  return source.replace(/^[ \t]*out\s+gl_PerVertex\s*\{[^}]*\}\s*;/gm, '');
}
function dropBuiltinRedeclarations(source) {
  return source.replace(
    /^[ \t]*(?:layout\s*\([^)]*\)\s*)?in\s+\w+\s+gl_(?:FragCoord|FrontFacing|PointCoord)\s*;|^[ \t]*(?:layout\s*\([^)]*\)\s*)?out\s+float\s+gl_FragDepth\s*;/gm,
    '// $&',
  );
}

// a shader that only reads gl_FragDepth keeps the normal depth in gl. here any use turns into a depth output
// that nobody writes, so the fragment lands at depth 0 in front of evrything (noble water did that)
function readOnlyFragDepth(source) {
  if (!/\bgl_FragDepth\b/.test(source)) return source;
  const written = /\bgl_FragDepth\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)|\bgl_FragDepth\s*(?:\+\+|--)|(?:\+\+|--)\s*gl_FragDepth\b/;
  if (written.test(source.replace(/\/\/[^\n]*/g, ''))) return source;
  return source.replace(/\bgl_FragDepth\b/g, 'gl_FragCoord.z');
}

// gl drivers inline a function that takes an image, naga cant take a writeonly image as parameter at all
// (photon floodfill: update_lpv(writeonly image3D light_img, ...)). so evry call with a global image gets its own
// copy of the function where the parameter is that global
const IMAGE_PARAM =
  /^\s*(?:layout\s*\([^)]*\)\s*)?(?:(?:readonly|writeonly|coherent|volatile|restrict|in|highp|mediump|lowp)\s+)*[iu]?image(?:[123]D|Cube|2DArray|CubeArray|Buffer|2DMS|2DMSArray)\s+(\w+)\s*$/;
function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && !--depth) return i;
  }
  return -1;
}
function inlineImageParameters(source) {
  if (!/\bimage(?:[123]D|Cube|2DArray|CubeArray|Buffer|2DMS)\b/.test(source)) return source;
  const header = /\b(\w+)\s+(\w+)\s*\(([^(){};]*)\)\s*\{/g;
  for (let guard = 0; guard < 32; guard++) {
    let found = null,
      match;
    header.lastIndex = 0;
    while ((match = header.exec(source))) {
      const params = match[3].split(',');
      const slots = params.flatMap((param, slot) => (IMAGE_PARAM.test(param) ? [slot] : []));
      if (slots.length && !['if', 'for', 'while', 'switch'].includes(match[2])) {
        found = { match, params, slots };
        break;
      }
    }
    if (!found) return source;
    const { match: fn, params, slots } = found;
    const name = fn[2],
      open = fn.index + fn[0].length - 1,
      close = matchingBrace(source, open);
    if (close < 0) return source;
    const body = source.slice(open, close + 1);
    const imageNames = slots.map(slot => params[slot].match(IMAGE_PARAM)[1]);
    const keptParams = params.filter((_, slot) => !slots.includes(slot)).join(',');
    const copies = new Map();
    const marker = '/*wgpuImageCopies*/';
    let rest = source.slice(0, fn.index) + marker + source.slice(close + 1);
    // prototypes of the function go too, the copies are defined where the original was
    rest = rest.replace(new RegExp('\\b\\w+\\s+' + name + '\\s*\\([^(){};]*\\bimage\\w*\\s+\\w+[^(){};]*\\)\\s*;', 'g'), '');
    const calls = new RegExp('\\b' + name + '\\s*\\(', 'g');
    let call,
      output = '',
      at = 0;
    while ((call = calls.exec(rest))) {
      const parsed = callArguments(rest, calls.lastIndex);
      if (!parsed) continue;
      const [args, end] = parsed;
      const globals = slots.map(slot => args[slot]);
      if (!globals.every(arg => /^\w+$/.test(arg || ''))) return source;
      const key = globals.join('_');
      let copyName = copies.get(key)?.name;
      if (!copyName) {
        copyName = name + '_wgpuImg_' + key;
        let copyBody = body;
        imageNames.forEach((param, i) => (copyBody = copyBody.replace(new RegExp('\\b' + param + '\\b', 'g'), globals[i])));
        copies.set(key, { name: copyName, text: fn[1] + ' ' + copyName + '(' + keptParams + ') ' + copyBody });
      }
      output += rest.slice(at, call.index) + copyName + '(' + args.filter((_, i) => !slots.includes(i)).join(', ') + ')';
      at = end;
      calls.lastIndex = end;
    }
    rest = output + rest.slice(at);
    const definitions = [...copies.values()].map(copy => copy.text).join('\n');
    source = rest.replace(marker, () => definitions + '\n');
  }
  return source;
}

function dropImageAtomics(source) {
  const images = new Map([...source.matchAll(/\b([ui]?)image[23]D\s+(\w+)\s*;/g)].map(m => [m[2], m[1]]));
  const calls = /\bimageAtomic\w+\s*\(/g;
  let match,
    at = 0,
    output = '',
    dropped = new Set();
  while ((match = calls.exec(source))) {
    const parsed = callArguments(source, calls.lastIndex);
    if (!parsed) continue;
    const [args, end] = parsed;
    if (!images.has(args[0])) continue;
    dropped.add(args[0]);
    output += source.slice(at, match.index) + (images.get(args[0]) === 'i' ? 'int(0)' : 'uint(0)');
    at = end;
    calls.lastIndex = end;
  }
  if (dropped.size) console.warn('Image-Atomics im Fragment-Shader entfernt: ' + [...dropped].join(', '));
  return output + source.slice(at);
}

function lowerInterfaceBlocks(source, stage) {
  const direction = stage === 'vertex' ? 'out' : 'in',
    instances = new Map();
  source = source.replace(
    new RegExp(
      '^([ \\t]*)((?:(?:flat|smooth|noperspective|centroid)[ \\t]+)*)' +
        direction +
        '[ \\t]+(\\w+)[ \\t]*\\{([^{}]*)\\}[ \\t]*(\\w+)?[ \\t]*;',
      'gm',
    ),
    (whole, indent, blockQualifiers, block, body, instance) => {
      const prefix = instance ? block + '_' : '';
      if (instance) instances.set(instance, block);
      return body
        .replace(/\blayout\s*\([^)]*\)\s*/g, '')
        .split('\n')
        .map(line => {
          const member =
            /^([ \t]*)((?:(?:flat|smooth|noperspective|centroid)[ \t]+)*)(\w+)[ \t]+(\w+)[ \t]*(\[[^\]]*\])?[ \t]*;(.*)$/.exec(
              line,
            );
          if (!member || /^[ \t]*#/.test(line)) return line;
          const [, lead, qualifiers, type, name, array = '', rest] = member;
          return (
            lead + blockQualifiers + qualifiers + direction + ' ' + type + ' ' + prefix + name + array + ';' + rest
          );
        })
        .join('\n');
    },
  );
  for (const [instance, block] of instances)
    source = source.replace(new RegExp('\\b' + instance + '\\s*\\.\\s*(\\w+)', 'g'), block + '_$1');
  return source;
}

function dropStrayEndifs(source) {
  let depth = 0,
    changed = false;
  const lines = source.split('\n').map(line => {
    const directive = /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b/.exec(line);
    if (!directive) return line;
    if (/^if/.test(directive[1])) {
      depth++;
      return line;
    }
    if (depth === 0) {
      changed = true;
      return '// wgpu: stray ' + line.trim();
    }
    if (directive[1] === 'endif') depth--;
    return line;
  });
  return changed ? lines.join('\n') : source;
}

function dropDuplicateConsts(source) {
  const seen = new Map(),
    open = [];
  let changed = false,
    depth = 0;
  const lines = source.split('\n').map((line, index) => {
    const atTop = depth === 0;
    for (const c of line.replace(/\/\/.*$/, '')) depth += c === '{' ? 1 : c === '}' ? -1 : 0;
    if (depth < 0) depth = 0;
    const directive = /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b/.exec(line);
    if (directive) {
      if (/^if/.test(directive[1])) open.push(index);
      else if (directive[1] === 'endif') open.pop();
      else if (open.length) open[open.length - 1] = index;
      return line;
    }
    const declaration = /^\s*const\s+\w+\s+\w+\s*=\s*[^;]+;/.exec(line);
    if (!declaration || !atTop) return line;
    const text = declaration[0].replace(/\s+/g, ' ').trim(),
      where = open.join(',');
    const first = seen.get(text);
    if (first !== undefined && (first === '' || where === first || where.startsWith(first + ','))) {
      changed = true;
      return '// wgpu: repeat ' + line.trim();
    }
    if (first === undefined) seen.set(text, where);
    return line;
  });
  return changed ? lines.join('\n') : source;
}

function lowerLongTernaryChains(source) {
  if ((source.match(/\?/g) || []).length < 32) return source;
  const assignment = /(^|[;{}])([ \t]*)([A-Za-z_]\w*(?:\.\w+|\[[^\]\n]*\])*)[ \t]*=(?!=)/gm;
  let match,
    at = 0,
    output = '',
    counter = 0;
  while ((match = assignment.exec(source))) {
    let end = assignment.lastIndex,
      depth = 0,
      questions = 0;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === '/' && source[end + 1] === '/') {
        const stop = source.indexOf('\n', end);
        end = stop < 0 ? source.length : stop;
        continue;
      }
      if (c === '/' && source[end + 1] === '*') {
        const stop = source.indexOf('*/', end + 2);
        end = stop < 0 ? source.length : stop + 1;
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0 && c === '?') questions++;
      else if (depth === 0 && (c === ';' || c === '{' || c === '}')) break;
    }
    if (source[end] !== ';' || questions < 32) continue;
    const expression = source
      .slice(assignment.lastIndex, end)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, '');
    const parts = [{ text: '', before: [], after: [] }],
      separators = [];
    depth = 0;
    for (const line of expression.split('\n')) {
      if (/^\s*#/.test(line)) {
        const part = parts[parts.length - 1];
        (part.text.trim() ? part.after : part.before).push(line.trim());
        continue;
      }
      for (const c of line + '\n') {
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        if (depth === 0 && (c === '?' || c === ':')) {
          separators.push(c);
          parts.push({ text: '', before: [], after: [] });
          continue;
        }
        parts[parts.length - 1].text += c;
      }
    }
    if (
      depth !== 0 ||
      !separators.length ||
      separators.some((c, i) => c !== (i % 2 ? ':' : '?')) ||
      separators.length % 2
    )
      continue;
    const lhs = match[3],
      flag = 'wgpuChain' + counter++,
      indent = match[2];
    let code = indent + '{ bool ' + flag + ' = false;\n';
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const condition = parts[i],
        value = parts[i + 1];
      code += condition.before
        .concat(condition.after)
        .map(line => line + '\n')
        .join('');
      code += value.before.map(line => line + '\n').join('');
      code +=
        indent +
        'if (!' +
        flag +
        ' && (' +
        condition.text.trim() +
        ')) { ' +
        lhs +
        ' = (' +
        value.text.trim() +
        '); ' +
        flag +
        ' = true; }\n';
      code += value.after.map(line => line + '\n').join('');
    }
    const fallback = parts[parts.length - 1];
    code +=
      fallback.before.map(line => line + '\n').join('') +
      indent +
      'if (!' +
      flag +
      ') ' +
      lhs +
      ' = (' +
      fallback.text.trim() +
      ');\n' +
      fallback.after.map(line => line + '\n').join('') +
      indent +
      '}';
    output += source.slice(at, match.index) + match[1] + '\n' + code;
    at = end + 1;
    assignment.lastIndex = end + 1;
  }
  return counter ? output + source.slice(at) : source;
}

function resolveFunctionMacroAliases(source) {
  const functions = new Set([...source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)\(/gm)].map(m => m[1]));
  if (!functions.size) return source;
  const aliases = new Map();
  for (const m of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\w+)[ \t]*(?:\/\/[^\n]*)?$/gm))
    aliases.set(m[1], m[2]);
  const target = name => {
    const seen = new Set();
    while (aliases.has(name) && !seen.has(name)) {
      seen.add(name);
      name = aliases.get(name);
    }
    return name;
  };
  const resolved = [...aliases.keys()].filter(name => !functions.has(name) && functions.has(target(name)));
  if (!resolved.length) return source;
  return source
    .split('\n')
    .map(line =>
      /^[ \t]*#[ \t]*define\b/.test(line)
        ? line
        : line.replace(new RegExp('\\b(' + resolved.join('|') + ')(?=\\s*\\()', 'g'), name => target(name)),
    )
    .join('\n');
}

function dropMacroFunctionSemicolons(source) {
  const names = [];
  for (const m of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)\((?:[^)\n]*)\)((?:[^\n]*\\\r?\n)*[^\n]*)/gm))
    if (/\}\s*$/.test(m[2].replace(/\/\/[^\n]*$/, '').replace(/\\\r?\n/g, ' '))) names.push(m[1]);
  if (!names.length) return source;
  return source.replace(new RegExp('^([ \\t]*(?:' + names.join('|') + ')[ \\t]*\\([^;\\n]*\\))[ \\t]*;', 'gm'), '$1');
}

function splitInterfaceDeclarations(source) {
  return source.replace(
    /^([ \t]*(?:(?:flat|smooth|noperspective|centroid|invariant)[ \t]+)*)(in|out|varying)[ \t]+((?:(?:highp|mediump|lowp)[ \t]+)?\w+)[ \t]+([^;(){}=\n]+,[^;(){}=\n]+);/gm,
    (whole, qualifiers, direction, type, names) =>
      names
        .split(',')
        .map(name => qualifiers + direction + ' ' + type + ' ' + name.trim() + ';')
        .join('\n'),
  );
}

function lowerSharedVectorAtomics(source) {
  if (!/\batomic\w+\s*\(/.test(source) || !/\bshared\b/.test(source)) return source;
  const lanes = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3, s: 0, t: 1, p: 2, q: 3 };
  const declaration =
    /^([ \t]*)shared[ \t]+([iu])vec([234])[ \t]*(?:\[([^\]]+)\])?[ \t]+(\w+)[ \t]*(?:\[([^\]]+)\])?[ \t]*;/gm;
  const closing = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']' && --depth === 0) return i;
    }
    return -1;
  };
  for (const match of [...source.matchAll(declaration)]) {
    const [whole, indent, kind, width, sizeBefore, name, sizeAfter] = match,
      size = sizeBefore || sizeAfter,
      n = Number(width);
    const target = new RegExp('\\batomic\\w+\\s*\\(\\s*' + name + '\\s*(?:\\[[^\\]]*\\]\\s*)?(?:\\.|\\[)');
    if (!target.test(source)) continue;
    const slots = name + '_wgpuC',
      scalar = kind === 'i' ? 'int' : 'uint',
      vector = kind + 'vec' + n;
    source = source.replace(
      whole,
      indent + 'shared ' + scalar + ' ' + slots + '[' + (size ? '(' + size + ')*' + n : n) + '];',
    );
    const slot = (base, lane) => slots + '[' + (base === null ? lane : '(' + base + ')*' + n + '+' + lane) + ']';
    const all = base => vector + '(' + Array.from({ length: n }, (_, lane) => slot(base, lane)).join(', ') + ')';
    const rewrite = source => {
      let output = '',
        at = 0;
      const use = new RegExp('\\b' + name + '\\b', 'g');
      let hit;
      while ((hit = use.exec(source))) {
        let end = use.lastIndex,
          base = null;
        if (size) {
          let open = end;
          while (/\s/.test(source[open])) open++;
          if (source[open] !== '[') {
            continue;
          }
          const close = closing(source, open);
          if (close < 0) continue;
          base = source.slice(open + 1, close);
          end = close + 1;
        }
        let replacement;
        const swizzle = /^\s*\.\s*([xyzwrgbastpq]{1,4})\b/.exec(source.slice(end));
        const index =
          !size && /^\s*\[/.test(source.slice(end))
            ? (() => {
                let open = end;
                while (/\s/.test(source[open])) open++;
                const close = closing(source, open);
                return close < 0 ? null : { expr: source.slice(open + 1, close), end: close + 1 };
              })()
            : null;
        const assignment = /^\s*=(?!=)/.exec(source.slice(swizzle ? end + swizzle[0].length : index ? index.end : end));
        if (index) {
          replacement = slots + '[' + index.expr + ']';
          end = index.end;
        } else if (swizzle) {
          const parts = [...swizzle[1]].map(c => slot(base, lanes[c]));
          if (parts.length > 1 && assignment) continue;
          replacement = parts.length === 1 ? parts[0] : kind + 'vec' + parts.length + '(' + parts.join(', ') + ')';
          end += swizzle[0].length;
        } else if (assignment) {
          const stop = source.indexOf(';', end);
          if (stop < 0) continue;
          const value = rewrite(source.slice(end + assignment[0].length, stop));
          replacement =
            '{ ' +
            vector +
            ' wgpuLanes = (' +
            value +
            '); ' +
            Array.from({ length: n }, (_, lane) => slot(base, lane) + ' = wgpuLanes.' + 'xyzw'[lane] + ';').join(' ') +
            ' }';
          end = stop + 1;
        } else replacement = all(base);
        output += source.slice(at, hit.index) + replacement;
        at = end;
        use.lastIndex = end;
      }
      return output + source.slice(at);
    };
    source = rewrite(source);
  }
  return source;
}

function matchVaryingWidths(vs, fs) {
  const outs = new Map(
    [
      ...vs.matchAll(
        /^[ \t]*(?:(?:flat|smooth|noperspective|centroid)[ \t]+)*out[ \t]+(float|vec[234])[ \t]+(\w+)[ \t]*;/gm,
      ),
    ].map(m => [m[2], m[1]]),
  );
  const narrowed = [];
  fs = fs.replace(
    /^([ \t]*(?:(?:flat|smooth|noperspective|centroid)[ \t]+)*)in[ \t]+(vec[234])[ \t]+(\w+)[ \t]*;/gm,
    (whole, qualifiers, type, name) => {
      const sent = outs.get(name),
        width = t => (t === 'float' ? 1 : Number(t.slice(3)));
      if (!sent || width(sent) >= width(type)) return whole;
      const pad = ['0.0', '0.0', '0.0', '1.0'].slice(width(sent), width(type)).join(', ');
      narrowed.push(name);
      return (
        qualifiers +
        'in ' +
        sent +
        ' ' +
        name +
        '_wgpuNarrow;\n#define ' +
        name +
        ' ' +
        type +
        '(' +
        name +
        '_wgpuNarrow, ' +
        pad +
        ')'
      );
    },
  );
  for (const name of narrowed) vs = vs.replace(new RegExp('\\b' + name + '\\b', 'g'), name + '_wgpuNarrow');
  return [vs, fs];
}

function lowerSwitchFallthrough(source) {
  if (!/\bswitch\s*\(/.test(source)) return source;
  const matching = (text, open, left, right) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === left) depth++;
      else if (text[i] === right && --depth === 0) return i;
    }
    return -1;
  };
  let output = '',
    cursor = 0,
    counter = 0;
  const pattern = /\bswitch\s*\(/g;
  let found;
  while ((found = pattern.exec(source))) {
    const parenOpen = source.indexOf('(', found.index),
      parenClose = matching(source, parenOpen, '(', ')');
    if (parenClose < 0) break;
    const braceOpen = source.indexOf('{', parenClose);
    if (braceOpen < 0 || source.slice(parenClose + 1, braceOpen).trim()) continue;
    const braceClose = matching(source, braceOpen, '{', '}');
    if (braceClose < 0) break;
    const body = source
      .slice(braceOpen + 1, braceClose)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, '');
    const labels = [];
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '{' || ch === '(') {
        depth++;
        continue;
      }
      if (ch === '}' || ch === ')') {
        depth--;
        continue;
      }
      if (depth !== 0) continue;
      const rest = body.slice(i);
      const label = /^(?:case\s+([^:]+?)\s*:(?!:)|default\s*:)/.exec(rest);
      if (label && (i === 0 || /[\s;{}:]/.test(body[i - 1]))) {
        labels.push({ at: i, end: i + label[0].length, value: label[1] === undefined ? null : label[1] });
        i += label[0].length - 1;
      }
    }
    if (!labels.length) {
      continue;
    }
    const cases = labels.map((label, index) => ({
      value: label.value,
      code: body.slice(label.end, index + 1 < labels.length ? labels[index + 1].at : body.length),
    }));
    const ends = code => {
      code = code
        .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*#[^\n]*$/gm, '')
        .trim();
      return !code || /(?:\b(?:break|discard|continue)\s*|\breturn\b[^;]*);\s*}?\s*$/.test(code);
    };
    const fallsThrough = cases.slice(0, -1).some(item => item.code.trim() && !ends(item.code));
    if (!fallsThrough || /\bcontinue\s*;/.test(body)) {
      continue;
    }
    const id = counter++,
      selector = 'wgpuSwitch' + id,
      falling = 'wgpuFall' + id,
      matched = 'wgpuMatched' + id;
    const values = cases.filter(item => item.value !== null).map(item => '(' + selector + ' == (' + item.value + '))');
    let code =
      'do { int ' +
      selector +
      ' = int(' +
      source.slice(parenOpen + 1, parenClose) +
      '); bool ' +
      falling +
      ' = false; bool ' +
      matched +
      ' = ' +
      (values.length ? values.join(' || ') : 'false') +
      ';\n';
    for (const item of cases) {
      const test = item.value === null ? '!' + matched : selector + ' == (' + item.value + ')';
      code += 'if (' + falling + ' || ' + test + ') { ' + falling + ' = true;' + item.code + '\n}\n';
    }
    code += '} while (false);';
    output += source.slice(cursor, found.index) + code;
    cursor = braceClose + 1;
    pattern.lastIndex = cursor;
  }
  return counter ? output + source.slice(cursor) : source;
}

function lowerWorkGroupSize(source) {
  if (!/\bgl_WorkGroupSize\b/.test(source)) return source;
  const layout = /layout\s*\(([^)]*\blocal_size_[xyz][^)]*)\)\s*in\s*;/.exec(source);
  if (!layout) return source;
  const size = axis => (new RegExp('local_size_' + axis + '\\s*=\\s*(\\d+)').exec(layout[1]) || [0, '1'])[1];
  const component = { x: size('x') + 'u', y: size('y') + 'u', z: size('z') + 'u' };
  source = source
    .replace(/\bgl_WorkGroupSize\s*\.\s*([xyz]{1,4})\b/g, (whole, swizzle) =>
      swizzle.length === 1
        ? component[swizzle]
        : 'uvec' + swizzle.length + '(' + [...swizzle].map(axis => component[axis]).join(', ') + ')',
    )
    .replace(/\bgl_WorkGroupSize\b/g, 'uvec3(' + component.x + ', ' + component.y + ', ' + component.z + ')');
  return source;
}

const RESERVED_LATER = [
  'sample',
  'filter',
  'input',
  'output',
  'patch',
  'active',
  'partition',
  'resource',
  'common',
  'subroutine',
  'superp',
  'namespace',
  'using',
  'cast',
  'external',
  'interface',
  'noinline',
  'public',
  'static',
  'extern',
  'unsigned',
  'union',
  'goto',
  'inline',
  'half',
  'fixed',
  'sizeof',
  'precise',
];
function renameReservedIdentifiers(source) {
  for (const word of RESERVED_LATER) {
    if (
      !new RegExp('\\b(?:float|double|int|uint|bool|[iubd]?vec[234]|mat[234](?:x[234])?)\\s+' + word + '\\b').test(
        source,
      )
    )
      continue;
    source = source.replace(new RegExp('\\b' + word + '\\b', 'g'), 'wgpu_' + word);
  }
  for (const word of GLSL_SHADOWABLE_BUILTINS) {
    if (
      !new RegExp(
        '\\b(?:float|double|int|uint|bool|[iubd]?vec[234]|mat[234](?:x[234])?)\\s+' + word + '\\s*[=;,)\\[]',
      ).test(source)
    )
      continue;
    if (new RegExp('\\buniform\\s+\\w+\\s+(?:\\w+\\s*,\\s*)*' + word + '\\b').test(source)) continue;
    source = source.replace(new RegExp('\\b' + word + '\\b(?!\\s*\\()', 'g'), 'wgpu_' + word);
  }
  return source;
}
const GLSL_SHADOWABLE_BUILTINS = [
  'step',
  'smoothstep',
  'length',
  'distance',
  'dot',
  'cross',
  'normalize',
  'reflect',
  'refract',
  'mix',
  'clamp',
  'min',
  'max',
  'abs',
  'sign',
  'floor',
  'ceil',
  'round',
  'trunc',
  'fract',
  'exp',
  'exp2',
  'log',
  'log2',
  'pow',
  'sqrt',
  'inversesqrt',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'radians',
  'degrees',
  'saturate',
  'select',
  'all',
  'any',
  'determinant',
  'transpose',
  'fma',
  'ldexp',
  'frexp',
  'modf',
  'faceforward',
];

function dropMemoryBarriers(source) {
  return lowerSharedVectorAtomics(source)
    .replace(/\b(?:memoryBarrier(?:Shared|Image|Buffer|AtomicCounter)?|groupMemoryBarrier)\s*\(\s*\)\s*;/g, ';')
    .replace(/\bwriteonly\s+(?=(?:(?:coherent|volatile|restrict)\s+)*buffer\b)/g, '');
}

const CONST_TYPE_WORDS = /^(?:float|int|uint|bool|double|[biud]?vec[234]|mat[234](?:x[234])?|true|false)$/;
function joinMultilineConsts(source) {
  return source.replace(
    /^([ \t]*(?:static[ \t]+)?)const([ \t]+\w+[ \t]+\w+[ \t]*(?:\[[^\]\n]*\])?)([^;{}]*);/gm,
    (whole, indent, head, rest) => {
      if (!rest.includes('\n')) return whole;
      if (/^[ \t]*#/m.test(rest)) return whole;
      const value = rest.replace(/\/\/[^\n]*/g, '').replace(/\d[\d.]*[eE][-+]?\d+/g, '0');
      if (!(value.match(/[A-Za-z_]\w*/g) || []).some(word => !CONST_TYPE_WORDS.test(word))) return whole;
      return indent + 'const' + (head + rest).replace(/\/\/[^\n]*/g, '').replace(/\s*\n\s*/g, ' ') + ';';
    },
  );
}

function lowerArrayVaryings(source, stage) {
  const direction = stage === 'vertex' ? 'out' : 'in',
    names = [];
  source = source.replace(
    new RegExp(
      '^([ \\t]*(?:(?:flat|smooth|centroid|noperspective)[ \\t]+)*' +
        direction +
        '[ \\t]+(?:mat[234](?:x[234])?|[iu]?vec[234]|float|int|uint))[ \\t]*\\[[ \\t]*(\\d+)[ \\t]*\\][ \\t]+(\\w+)[ \\t]*;',
      'gm',
    ),
    '$1 $3[$2];',
  );
  source = source.replace(
    new RegExp(
      '^([ \\t]*)((?:(?:flat|smooth|centroid|noperspective)[ \\t]+)*)' +
        direction +
        '[ \\t]+(mat[234](?:x[234])?|[iu]?vec[234]|float|int|uint)[ \\t]+(\\w+)[ \\t]*\\[[ \\t]*(\\d+)[ \\t]*\\][ \\t]*;',
      'gm',
    ),
    (whole, indent, qualifiers, type, name, count) => {
      names.push(name);
      const elements = Array.from({ length: Number(count) }, (_, index) => name + '_wgpuArray' + index);
      const copy = elements
        .map((element, index) =>
          stage === 'vertex'
            ? element + ' = ' + name + '[' + index + '];'
            : name + '[' + index + '] = ' + element + ';',
        )
        .join(' ');
      return (
        elements.map(element => indent + qualifiers + direction + ' ' + type + ' ' + element + ';').join('\n') +
        '\n' +
        indent +
        type +
        ' ' +
        name +
        '[' +
        count +
        '];\n#define WGPU_ARRAY_VARYING_' +
        name +
        ' ' +
        copy
      );
    },
  );
  if (!names.length) return source;
  const entry = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)/g;
  if (!entry.test(source)) return source;
  let inner = 'wgpuArrayVaryingMain';
  while (new RegExp('\\b' + inner + '\\b').test(source)) inner += '_';
  const copies = names
    .map(name => '#ifdef WGPU_ARRAY_VARYING_' + name + '\n  WGPU_ARRAY_VARYING_' + name + '\n#endif')
    .join('\n');
  return (
    source.replace(entry, 'void ' + inner + '()') +
    '\nvoid main() {\n' +
    (stage === 'vertex' ? '  ' + inner + '();\n' + copies : copies + '\n  ' + inner + '();') +
    '\n}\n'
  );
}

function unwrapIntArgumentCasts(source) {
  const signatures = new Map(),
    qualifier = /^(?:const|in|out|inout|highp|mediump|lowp|flat)\s+/;
  for (const [, name, params] of source.matchAll(
    /\b(?:void|float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?)\s+(\w+)\s*\(([^()]*)\)\s*\{/g,
  )) {
    let types = params.split(',').map(param => {
      let text = param.trim();
      while (qualifier.test(text)) text = text.replace(qualifier, '');
      return text.split(/\s+/)[0];
    });
    if (params.trim() === '' || params.trim() === 'void') types = [];
    if (!signatures.has(name)) signatures.set(name, []);
    signatures.get(name).push(types);
  }
  const cast = /float\(\s*(worldDay|worldTime|modifiedWorldDay|moonPhase|heldBlockLightValue2?|heldItemId2?)\s*\)/g;
  const hasCast = new RegExp(cast.source);
  source = source.replace(/\b((?:const\s+)?(u?int)\s+\w+\s*=\s*)([^;{}]*);/g, (whole, head, type, value) => {
    if (!hasCast.test(value) && !/\b24000\.0\b/.test(value)) return whole;
    if (!/\d\.\d*|\.\d/.test(value.replace(cast, ''))) return head + value.replace(cast, '$1') + ';';
    let depth = 0;
    for (const c of value) {
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && !depth) return whole;
    }
    return head + type + '(' + value.trim() + ');';
  });
  const integer = type => type === 'int' || type === 'uint';
  const intSlots = [...signatures]
    .flatMap(([name, overloads]) =>
      [...new Set(overloads.map(types => types.length))].map(length => {
        const same = overloads.filter(types => types.length === length);
        return [
          name,
          Array.from({ length }, (_, index) => (same.every(types => integer(types[index])) ? 'int' : 'other')),
        ];
      }),
    )
    .filter(([, types]) => types.includes('int'));
  if (!intSlots.length) return source;
  for (const [name, types] of intSlots) {
    const calls = new RegExp('\\b' + name + '\\s*\\(', 'g');
    let match,
      at = 0,
      output = '';
    while ((match = calls.exec(source))) {
      if (
        /(?:void|float|int|uint|bool|vec[234]|mat[234](?:x[234])?)\s+$/.test(
          source.slice(Math.max(0, match.index - 12), match.index),
        )
      )
        continue;
      const args = [];
      let depth = 1,
        start = calls.lastIndex,
        end = start;
      for (; end < source.length && depth; end++) {
        const c = source[end];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') {
          depth--;
          if (!depth) args.push(source.slice(start, end));
        } else if (c === ',' && depth === 1) {
          args.push(source.slice(start, end));
          start = end + 1;
        }
      }
      if (depth || args.length !== types.length) continue;
      const toInt = arg => {
        arg = arg.replace(cast, '$1');
        return /\bint\s*\(/.test(arg)
          ? arg
          : arg.replace(/\bfloat\(\s*(\w+)\s*\)/g, '$1').replace(/\b(\d+)\.0\b(?![\d.])/g, '$1');
      };
      const fixed = args.map((arg, index) => (types[index] === 'int' ? toInt(arg) : arg));
      output += source.slice(at, calls.lastIndex) + fixed.join(',') + ')';
      at = end;
      calls.lastIndex = end;
    }
    source = output + source.slice(at);
  }
  return source;
}

function lowerShadowGather(source) {
  const shadowSamplers = new Set(
    [...source.matchAll(/\buniform\s+(?:\w+\s+)?sampler2DShadow\s+(\w+)\s*;/g)].map(m => m[1]),
  );
  if (!shadowSamplers.size) return source;
  const calls = /\btextureGather(Offset)?\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const args = [];
    let depth = 1,
      start = calls.lastIndex,
      end = start;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        depth--;
        if (!depth) args.push(source.slice(start, end).trim());
      } else if (c === ',' && depth === 1) {
        args.push(source.slice(start, end).trim());
        start = end + 1;
      }
    }
    const offset = !!match[1];
    if (depth || !shadowSamplers.has(args[0]) || args.length !== (offset ? 4 : 3)) continue;
    const [sampler, coord, reference] = args;
    const base = `(floor((${coord})*vec2(textureSize(${sampler},0))-0.5)${offset ? `+vec2(${args[3]})` : ''})`;
    const tap = corner =>
      `texture(${sampler},vec3((${base}+vec2(${corner}))/vec2(textureSize(${sampler},0)),${reference}))`;
    output +=
      source.slice(at, match.index) + `vec4(${['0.5,1.5', '1.5,1.5', '1.5,0.5', '0.5,0.5'].map(tap).join(',')})`;
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at);
}

function clampHalfFloatOutputs(code, limits) {
  const clampOf = (type, expression, limit) => {
    const match = /^(?:vec([234])<f32>|f32)$/.exec(type);
    if (!match) return null;
    const ctor = match[1] ? `vec${match[1]}<f32>` : 'f32';
    return `clamp(${expression}, ${ctor}(${-limit}.0), ${ctor}(${limit}.0))`;
  };
  const struct = /struct FragmentOutput \{([^}]*)\}/.exec(code);
  if (struct) {
    const lines = [];
    for (const [, location, name, type] of struct[1].matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*([\w<>]+)/g)) {
      const limit = limits[+location],
        clamped = limit && clampOf(type, 'r.' + name, limit);
      if (clamped) lines.push(`    r.${name} = ${clamped};`);
    }
    if (!lines.length) return null;
    return (
      code.replace(/return FragmentOutput\(([^\n]*)\);/g, 'return wgpuHalfSafe(FragmentOutput($1));') +
      `\nfn wgpuHalfSafe(o: FragmentOutput) -> FragmentOutput {\n    var r = o;\n${lines.join('\n')}\n    return r;\n}\n`
    );
  }
  const single = /@fragment\s*\nfn \w+\([\s\S]*?\)\s*->\s*@location\(0\)\s*([\w<>]+)\s*\{/.exec(code);
  if (!single || !limits[0] || !clampOf(single[1], 'x', limits[0])) return null;
  const start = single.index + single[0].length,
    end = code.indexOf('\n}', start);
  if (end < 0) return null;
  return (
    code.slice(0, start) +
    code
      .slice(start, end)
      .replace(/return ([^;]+);/g, (_, value) => 'return ' + clampOf(single[1], value, limits[0]) + ';') +
    code.slice(end)
  );
}

function straightImagePixels(image, width, height) {
  if (
    typeof ImageBitmap === 'undefined' ||
    !(image instanceof ImageBitmap || (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement))
  )
    return null;
  try {
    const decoder = straightImagePixels.gl || (straightImagePixels.gl = new OffscreenCanvas(1, 1).getContext('webgl2'));
    if (!decoder || decoder.isContextLost()) return null;
    decoder.pixelStorei(decoder.UNPACK_FLIP_Y_WEBGL, false);
    decoder.pixelStorei(decoder.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    decoder.pixelStorei(decoder.UNPACK_COLORSPACE_CONVERSION_WEBGL, decoder.NONE);
    const texture = decoder.createTexture(),
      framebuffer = decoder.createFramebuffer();
    decoder.bindTexture(decoder.TEXTURE_2D, texture);
    decoder.texImage2D(
      decoder.TEXTURE_2D,
      0,
      decoder.RGBA8,
      width,
      height,
      0,
      decoder.RGBA,
      decoder.UNSIGNED_BYTE,
      image,
    );
    decoder.bindFramebuffer(decoder.FRAMEBUFFER, framebuffer);
    decoder.framebufferTexture2D(decoder.FRAMEBUFFER, decoder.COLOR_ATTACHMENT0, decoder.TEXTURE_2D, texture, 0);
    const pixels = new Uint8ClampedArray(width * height * 4);
    decoder.readPixels(0, 0, width, height, decoder.RGBA, decoder.UNSIGNED_BYTE, pixels);
    decoder.deleteFramebuffer(framebuffer);
    decoder.deleteTexture(texture);
    return decoder.getError() === decoder.NO_ERROR ? pixels : null;
  } catch (error) {
    return null;
  }
}

function lowerUnfilterableColorSampling(source, samplers, names, constants = {}) {
  const declarations = new Map(
    [...source.matchAll(/@group\(1\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*texture_2d<f32>\s*;/g)].map(m => [
      Number(m[1]),
      m[2],
    ]),
  );
  const textures = new Map();
  const aliases = ['gcolor', 'gdepth', 'gnormal', 'composite', 'gaux1', 'gaux2', 'gaux3', 'gaux4'];
  for (const sampler of samplers) {
    if (sampler.type !== 'sampler2D' || !names?.has(sampler.name)) continue;
    const variable = declarations.get(sampler.binding);
    if (!variable) continue;
    const index = /^colortex(\d+)$/.exec(sampler.name)?.[1] ?? aliases.indexOf(sampler.name);
    const flag = constants['colortex' + index + 'MipmapEnabled'] ?? constants[aliases[index] + 'MipmapEnabled'];
    void flag;
    textures.set(variable, { variable, id: sampler.binding, mipmaps: true });
  }
  if (!textures.size) return source;
  const helpers = new Map(),
    cores = new Map();
  const calls = /\b(textureSample(?:Level|Bias|Grad)?)\s*\(/g;
  let match,
    at = 0,
    output = '';
  while ((match = calls.exec(source))) {
    const args = [];
    let depth = 1,
      start = calls.lastIndex,
      end = start;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        depth--;
        if (!depth) args.push(source.slice(start, end).trim());
      } else if (c === ',' && depth === 1) {
        args.push(source.slice(start, end).trim());
        start = end + 1;
      }
    }
    const texture = textures.get(args[0]);
    if (!texture || depth) continue;
    const kind = match[1],
      base = kind === 'textureSample' ? 3 : kind === 'textureSampleGrad' ? 5 : 4;
    if (args.length !== base && args.length !== base + 1)
      throw new Error('Unsupported color sampling signature: ' + kind);
    const offset = args.length === base + 1,
      key = texture.id + '_' + kind + (offset ? '_offset' : '');
    const name = 'wgpuColor_' + key,
      prefix = 'wgpuColor_' + texture.id;
    if (!cores.has(texture.id)) {
      cores.set(
        texture.id,
        `
fn ${prefix}_linear(uv:vec2<f32>,level:i32,offset:vec2<i32>)->vec4<f32>{
  let size=vec2<i32>(textureDimensions(${texture.variable},level));
  let p=uv*vec2<f32>(size)-vec2<f32>(0.5);
  let base=vec2<i32>(floor(p))+offset;
  let f=fract(p);let lo=vec2<i32>(0);let hi=size-vec2<i32>(1);
  let a=textureLoad(${texture.variable},clamp(base,lo,hi),level);
  let b=textureLoad(${texture.variable},clamp(base+vec2<i32>(1,0),lo,hi),level);
  let c=textureLoad(${texture.variable},clamp(base+vec2<i32>(0,1),lo,hi),level);
  let d=textureLoad(${texture.variable},clamp(base+vec2<i32>(1,1),lo,hi),level);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
fn ${prefix}_lod(uv:vec2<f32>,requested:f32,offset:vec2<i32>)->vec4<f32>{
  ${
    texture.mipmaps
      ? `let level=clamp(requested,0.0,f32(textureNumLevels(${texture.variable})-1u));
  let low=i32(floor(level));let high=min(low+1,i32(textureNumLevels(${texture.variable}))-1);
  let a=${prefix}_linear(uv,low,offset);
  if(high==low||fract(level)==0.0){return a;}
  return mix(a,${prefix}_linear(uv,high,offset),fract(level));`
      : `return ${prefix}_linear(uv,0,offset);`
  }
}`,
      );
    }
    if (!helpers.has(key)) {
      const parameters = ['uv:vec2<f32>'];
      let level = '0.0',
        setup = '';
      if (kind === 'textureSampleLevel') {
        parameters.push('requested:f32');
        level = 'requested';
      } else {
        if (kind === 'textureSampleBias') parameters.push('bias:f32');
        if (kind === 'textureSampleGrad') parameters.push('dx:vec2<f32>', 'dy:vec2<f32>');
        if (texture.mipmaps) {
          setup = `let size=vec2<f32>(textureDimensions(${texture.variable},0));\n`;
          setup +=
            kind === 'textureSampleGrad' ? 'let x=dx*size;let y=dy*size;' : 'let x=dpdx(uv)*size;let y=dpdy(uv)*size;';
          level = '0.5*log2(max(max(dot(x,x),dot(y,y)),1e-20))' + (kind === 'textureSampleBias' ? '+bias' : '');
        }
      }
      if (offset) parameters.push('offset:vec2<i32>');
      helpers.set(
        key,
        `fn ${name}(${parameters.join(',')})->vec4<f32>{${setup}\nreturn ${prefix}_lod(uv,${level},${offset ? 'offset' : 'vec2<i32>(0)'});}`,
      );
    }
    output += source.slice(at, match.index) + name + '(' + args.slice(2).join(', ') + ')';
    at = end;
    calls.lastIndex = end;
  }
  return output + source.slice(at) + '\n' + [...cores.values(), ...helpers.values()].join('\n');
}
