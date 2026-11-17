// rewrites the frag shader so ONE pixel logs evrything it does into a buffer. only inserts, line numbers stay
function wgpuInstrumentGlsl(source, options = {}) {
  const binding = options.binding ?? 23,
    cap = options.cap ?? 131072,
    slots = options.slots ?? 8,
    per = Math.floor(cap / slots);
  const toks = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = pos => {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  {
    const re =
      /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(^[ \t]*#[^\n]*(?:\\\n[^\n]*)*)|([A-Za-z_]\w*)|(\d*\.\d+(?:[eE][+-]?\d+)?[fFlL]*|\d+\.(?:\d*)?(?:[eE][+-]?\d+)?[fFlL]*|\d+[eE][+-]?\d+[fFlL]*|0[xX][0-9a-fA-F]+[uU]?|\d+[uU]?)|(<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[{}()\[\];,.?:=+\-*\/%<>!~&|^])|(\s+)|(.)/gm;
    let m;
    while ((m = re.exec(source))) {
      if (m[1] || m[2] || m[7]) continue;
      const t = m[3] ? 'pp' : m[4] ? 'id' : m[5] ? 'num' : m[6] ? 'op' : 'other';
      toks.push({ t, v: m[0], s: m.index, e: m.index + m[0].length });
    }
  }
  const N = toks.length;
  const match = new Int32Array(N).fill(-1);
  {
    const st = [];
    for (let i = 0; i < N; i++) {
      const v = toks[i].v;
      if (toks[i].t !== 'op') continue;
      if (v === '(' || v === '[' || v === '{') st.push(i);
      else if (v === ')' || v === ']' || v === '}') {
        const o = st.pop();
        if (o !== undefined) {
          match[o] = i;
          match[i] = o;
        }
      }
    }
  }
  const V = i => (i < N ? toks[i].v : '');
  const TYPES = new Set([
    'void',
    'bool',
    'int',
    'uint',
    'float',
    'double',
    'vec2',
    'vec3',
    'vec4',
    'dvec2',
    'dvec3',
    'dvec4',
    'ivec2',
    'ivec3',
    'ivec4',
    'uvec2',
    'uvec3',
    'uvec4',
    'bvec2',
    'bvec3',
    'bvec4',
    'mat2',
    'mat3',
    'mat4',
    'mat2x2',
    'mat2x3',
    'mat2x4',
    'mat3x2',
    'mat3x3',
    'mat3x4',
    'mat4x2',
    'mat4x3',
    'mat4x4',
  ]);
  const QUAL = new Set([
    'const',
    'in',
    'out',
    'inout',
    'uniform',
    'flat',
    'smooth',
    'noperspective',
    'centroid',
    'highp',
    'mediump',
    'lowp',
    'precise',
    'invariant',
    'buffer',
    'shared',
    'coherent',
    'volatile',
    'restrict',
    'readonly',
    'writeonly',
    'attribute',
    'varying',
    'sample',
    'patch',
  ]);
  const structs = new Set();
  for (let i = 0; i < N - 1; i++) if (toks[i].v === 'struct' && toks[i + 1].t === 'id') structs.add(toks[i + 1].v);
  const isType = v => TYPES.has(v) || structs.has(v) || /^(?:[iu]?sampler|[iu]?image)\w+$/.test(v);
  const TRACE = {
    float: [0, 1],
    vec2: [0, 2],
    vec3: [0, 3],
    vec4: [0, 4],
    int: [1, 1],
    ivec2: [1, 2],
    ivec3: [1, 3],
    ivec4: [1, 4],
    uint: [2, 1],
    uvec2: [2, 2],
    uvec3: [2, 3],
    uvec4: [2, 4],
    bool: [3, 1],
    bvec2: [3, 2],
    bvec3: [3, 3],
    bvec4: [3, 4],
    mat2: [4, 2],
    mat3: [4, 3],
    mat4: [4, 4],
  };
  const traceable = v => v && !v.array && TRACE[v.type] !== undefined;
  const meta = { lines: source.split('\n'), events: [], vars: [], functions: [], refs: [], binding, cap, slots, per };
  const ev = (kind, tokIndex, extra = {}) => {
    const id = meta.events.length;
    meta.events.push({ kind, line: lineOf(toks[tokIndex].s), ...extra });
    return id;
  };
  const edits = [];
  const ins = (pos, text, order = 0) => edits.push({ pos, text, order });
  const scopes = [new Map()];
  const declare = (name, type, array, kind, tokIndex, fn) => {
    const v = { id: meta.vars.length, name, type, array, kind, line: lineOf(toks[tokIndex].s), fn };
    meta.vars.push(v);
    scopes[scopes.length - 1].set(name, v);
    meta.refs.push({ s: toks[tokIndex].s, e: toks[tokIndex].e, id: v.id });
    return v;
  };
  const lookup = name => {
    for (let k = scopes.length - 1; k >= 0; k--) {
      const v = scopes[k].get(name);
      if (v) return v;
    }
    return null;
  };
  const fnSigs = new Map();
  const topItems = [];
  {
    let i = 0;
    while (i < N) {
      const tk = toks[i];
      if (tk.t === 'pp') {
        i++;
        continue;
      }
      if (tk.v === ';') {
        i++;
        continue;
      }
      let j = i,
        paren = -1;
      while (j < N && toks[j].v !== ';' && toks[j].v !== '{') {
        if (toks[j].v === '(' && paren < 0) paren = j;
        if (match[j] > j && toks[j].v !== '{') j = match[j];
        j++;
      }
      if (j < N && toks[j].v === '{') {
        if (
          paren > 0 &&
          toks[paren - 1].t === 'id' &&
          match[paren] === j - 1 &&
          !['struct', 'uniform', 'buffer', 'in', 'out'].includes(toks[i].v)
        ) {
          topItems.push({ kind: 'fn', start: i, paren, body: j, end: match[j] });
          i = match[j] + 1;
          continue;
        }
        let k = match[j] + 1;
        while (k < N && toks[k].v !== ';') k++;
        topItems.push({ kind: 'block', start: i, end: k });
        i = k + 1;
        continue;
      }
      topItems.push({
        kind:
          paren > 0 &&
          toks[paren - 1].t === 'id' &&
          match[paren] === j - 1 &&
          !/=/.test(
            toks
              .slice(i, paren)
              .map(t => t.v)
              .join(' '),
          )
            ? 'proto'
            : 'decl',
        start: i,
        end: j,
      });
      i = j + 1;
    }
  }
  meta.buffers = [];
  meta.structDefs = {};
  {
    const constInts = new Map();
    for (const m of source.matchAll(/\bconst\s+u?int\s+(\w+)\s*=\s*(\d+)u?\s*;/g)) constInts.set(m[1], Number(m[2]));
    const dimOf = open => {
      const close = match[open];
      if (close === open + 1) return null;
      const inner = toks.slice(open + 1, close);
      if (inner.length === 1 && inner[0].t === 'num') return parseInt(inner[0].v);
      if (inner.length === 1 && constInts.has(inner[0].v)) return constInts.get(inner[0].v);
      return -1;
    };
    const parseMembers = (open, close) => {
      const out = [];
      let k = open + 1;
      while (k < close) {
        let e = k;
        while (e < close && toks[e].v !== ';') {
          if (match[e] > e && match[e] < close) e = match[e];
          e++;
        }
        let p = k;
        while (p < e) {
          const v = toks[p].v;
          if (v === 'layout' && toks[p + 1]?.v === '(') {
            p = match[p + 1] + 1;
            continue;
          }
          if (QUAL.has(v)) {
            p++;
            continue;
          }
          break;
        }
        if (p < e && toks[p].t === 'id') {
          const type = toks[p].v,
            typeDims = [];
          p++;
          while (p < e && toks[p].v === '[') {
            typeDims.push(dimOf(p));
            p = match[p] + 1;
          }
          while (p < e) {
            if (toks[p].t === 'id') {
              const name = toks[p].v,
                dims = [...typeDims];
              let q = p + 1;
              while (q < e && toks[q].v === '[') {
                dims.push(dimOf(q));
                q = match[q] + 1;
              }
              out.push({ name, type, dims, line: lineOf(toks[p].s) });
              p = q;
            } else p++;
          }
        }
        k = e + 1;
      }
      return out;
    };
    for (const it of topItems) {
      if (it.kind !== 'block') continue;
      let open = -1;
      for (let k = it.start; k < it.end; k++)
        if (toks[k].v === '{') {
          open = k;
          break;
        }
      if (open < 0) continue;
      const close = match[open];
      const head = toks.slice(it.start, open).map(t => t.v);
      if (head[0] === 'struct' && head[1]) {
        meta.structDefs[head[1]] = parseMembers(open, close);
        continue;
      }
      if (!head.includes('buffer')) continue;
      const text = head.join(' '),
        binding = /\bbinding\s*=\s*(\d+)/.exec(text);
      const instTok = toks.slice(close + 1, it.end).find(t => t.t === 'id');
      meta.buffers.push({
        name: toks[open - 1].t === 'id' ? toks[open - 1].v : '',
        binding: binding ? Number(binding[1]) : 0,
        packing: /\bstd140\b/.test(text) ? 'std140' : /\bscalar\b/.test(text) ? 'scalar' : 'std430',
        instance: instTok ? instTok.v : null,
        line: lineOf(toks[it.start].s),
        members: parseMembers(open, close),
      });
    }
    const BASE = { float: ['f', 1], int: ['i', 1], uint: ['u', 1], bool: ['u', 1] };
    const typeLayout = (type, packing, seen = 0) => {
      const r16 = n => (packing === 'std140' ? Math.ceil(n / 16) * 16 : n);
      const vec = /^([biu]?)vec([234])$/.exec(type),
        mat = /^mat([234])(?:x([234]))?$/.exec(type);
      if (BASE[type]) return { kind: 'scalar', base: BASE[type][0], comps: 1, align: 4, size: 4 };
      if (vec) {
        const n = Number(vec[2]),
          base = vec[1] === 'i' ? 'i' : vec[1] === 'u' || vec[1] === 'b' ? 'u' : 'f';
        return { kind: 'vec', base, comps: n, align: packing === 'scalar' ? 4 : n === 2 ? 8 : 16, size: 4 * n };
      }
      if (mat) {
        const cols = Number(mat[1]),
          rows = Number(mat[2] || mat[1]),
          col = typeLayout('vec' + rows, packing),
          colStride = packing === 'scalar' ? 4 * rows : r16(col.align);
        return {
          kind: 'mat',
          base: 'f',
          cols,
          rows,
          colStride,
          align: packing === 'scalar' ? 4 : r16(col.align),
          size: colStride * cols,
        };
      }
      const def = meta.structDefs[type];
      if (def && seen < 8) {
        const fields = placeMembers(def, packing, seen + 1);
        if (!fields) return null;
        const align = r16(Math.max(4, ...fields.map(f => f.align)));
        const end = fields.length ? fields[fields.length - 1].offset + fields[fields.length - 1].bytes : 0;
        return { kind: 'struct', type, fields, align, size: Math.ceil(end / align) * align };
      }
      return null;
    };
    const placeMembers = (members, packing, seen = 0) => {
      const out = [];
      let offset = 0;
      for (const m of members) {
        const t = typeLayout(m.type, packing, seen);
        if (!t) return out.length ? out : null;
        let align = t.align,
          bytes = t.size,
          stride = 0,
          count = 1;
        if (m.dims.length) {
          if (m.dims.some(d => d === -1)) return out;
          align = packing === 'std140' ? Math.ceil(t.align / 16) * 16 : t.align;
          stride = packing === 'scalar' ? t.size : Math.ceil(t.size / align) * align;
          const known = m.dims.filter(d => d != null);
          count = m.dims.includes(null) ? null : known.reduce((a, b) => a * b, 1);
          bytes = count == null ? 0 : stride * count;
        }
        offset = Math.ceil(offset / align) * align;
        out.push({ ...m, layout: t, offset, align, stride, count, bytes, array: m.dims.length > 0 });
        offset += bytes;
      }
      return out;
    };
    for (const b of meta.buffers) {
      b.members = placeMembers(b.members, b.packing) || [];
    }
  }
  const parseParams = (open, close) => {
    const params = [];
    let k = open + 1;
    while (k < close) {
      let e = k;
      while (e < close && toks[e].v !== ',') {
        if (match[e] > e) e = match[e];
        e++;
      }
      const part = toks.slice(k, e).filter(t => t.v !== 'void' || e - k > 1);
      let qual = 'in',
        type = null,
        name = null,
        array = false,
        nameTok = -1;
      for (let q = k; q < e; q++) {
        const v = toks[q].v;
        if (v === 'out' || v === 'inout') qual = v;
        else if (v === 'const' || v === 'in' || QUAL.has(v)) {
        } else if (!type && isType(v)) type = v;
        else if (type && !name && toks[q].t === 'id') {
          name = v;
          nameTok = q;
        } else if (v === '[' && name) array = true;
        else if (v === '[' && !name) array = true;
      }
      if (type && type !== 'void' && part.length) params.push({ qual, type, name, array, nameTok });
      k = e + 1;
    }
    return params;
  };
  for (const it of topItems)
    if (it.kind === 'fn' || it.kind === 'proto') {
      const name = toks[it.paren - 1].v,
        params = parseParams(it.paren, match[it.paren]);
      const outs = new Set(params.map((p, k) => (p.qual !== 'in' ? k : -1)).filter(k => k >= 0));
      if (!fnSigs.has(name)) fnSigs.set(name, []);
      fnSigs.get(name).push({ outs, count: params.length });
    }
  const parseDeclarators = (from, to, type, kind, fn, onVar) => {
    let k = from,
      typeArray = false;
    if (toks[k]?.v === '[' && match[k] > k) {
      typeArray = true;
      k = match[k] + 1;
    }
    while (k < to) {
      let e = k;
      while (e < to && toks[e].v !== ',') {
        if (match[e] > e && match[e] < to) e = match[e];
        e++;
      }
      if (toks[k].t === 'id') {
        let array = typeArray || (toks[k + 1]?.v === '[' && k + 1 < e);
        const v = declare(toks[k].v, type, array, kind, k, fn);
        onVar && onVar(v, k, e);
      }
      k = e + 1;
    }
  };
  const idCount = new Map();
  for (const t of toks) if (t.t === 'id') idCount.set(t.v, (idCount.get(t.v) || 0) + 1);
  const usedIds = { has: name => (idCount.get(name) || 0) > 1 };
  const globalsToRecord = [];
  for (const it of topItems) {
    if (it.kind !== 'decl') continue;
    let k = it.start,
      kind = 'global',
      type = null;
    if (toks[k].v === 'precision') continue;
    while (k < it.end) {
      const v = toks[k].v;
      if (v === 'layout' && toks[k + 1]?.v === '(') {
        k = match[k + 1] + 1;
        continue;
      }
      if (v === 'uniform') kind = 'uniform';
      else if (v === 'in' || v === 'varying' || v === 'attribute') kind = 'input';
      else if (v === 'out') kind = 'output';
      else if (v === 'const') kind = 'const';
      if (QUAL.has(v)) {
        k++;
        continue;
      }
      if (isType(v)) {
        type = v;
        k++;
        break;
      }
      k++;
    }
    if (!type) continue;
    parseDeclarators(k, it.end, type, kind, null, v => {
      if (kind !== 'output' && traceable(v) && usedIds.has(v.name)) globalsToRecord.push(v);
    });
  }
  let currentFn = null,
    anyMain = null;
  const recordAfter = new Map();
  const valueCall = v => 'wdbgV(' + v.id + 'u,' + v.name + ');';
  const baseOfLvalue = (k, lo) => {
    while (k >= lo) {
      const v = toks[k].v;
      if (v === ']' || v === ')') {
        k = match[k] - 1;
        continue;
      }
      if (toks[k].t === 'id') {
        if (toks[k - 1]?.v === '.') {
          k -= 2;
          continue;
        }
        return k;
      }
      return -1;
    }
    return -1;
  };
  const refsIn = (a, b) => {
    for (let k = a; k < b; k++) {
      const t = toks[k];
      if (t.t !== 'id' || toks[k - 1]?.v === '.') continue;
      const v = lookup(t.v);
      if (v) meta.refs.push({ s: t.s, e: t.e, id: v.id });
    }
  };
  const changedIn = (a, b) => {
    const out = new Set();
    for (let k = a; k < b; k++) {
      const t = toks[k];
      if (t.t === 'op' && /^(?:=|\+=|-=|\*=|\/=|%=|<<=|>>=|&=|\|=|\^=)$/.test(t.v)) {
        const base = baseOfLvalue(k - 1, a);
        if (base >= 0) {
          const v = lookup(toks[base].v);
          if (v) out.add(v);
        }
      }
      if (t.v === '++' || t.v === '--') {
        let base = -1;
        if (toks[k + 1]?.t === 'id') base = k + 1;
        else base = baseOfLvalue(k - 1, a);
        if (base >= 0) {
          const v = lookup(toks[base].v);
          if (v) out.add(v);
        }
      }
      if (t.t === 'id' && toks[k + 1]?.v === '(' && fnSigs.has(t.v)) {
        const close = match[k + 1],
          outs = new Set();
        for (const sig of fnSigs.get(t.v)) for (const o of sig.outs) outs.add(o);
        if (outs.size) {
          let arg = 0,
            p = k + 2;
          while (p < close) {
            let e = p;
            while (e < close && toks[e].v !== ',') {
              if (match[e] > e) e = match[e];
              e++;
            }
            if (outs.has(arg)) {
              const base = baseOfLvalue(e - 1, p);
              if (base >= 0) {
                const v = lookup(toks[base].v);
                if (v) out.add(v);
              }
            }
            arg++;
            p = e + 1;
          }
        }
      }
    }
    return [...out].filter(traceable);
  };
  const exprEnd = (k, stop = ';') => {
    while (k < N && toks[k].v !== stop) {
      if (match[k] > k) k = match[k];
      k++;
    }
    return k;
  };
  const declStart = k => {
    let q = k;
    while (QUAL.has(toks[q]?.v)) q++;
    return isType(toks[q]?.v) && (toks[q + 1]?.t === 'id' || toks[q + 1]?.v === '[') ? q : -1;
  };
  const parseDecl = (k, typeTok, end, kind) => {
    const vars = [];
    let type = toks[typeTok].v,
      from = typeTok + 1;
    const typeArray = toks[from]?.v === '[';
    if (typeArray) {
      from = match[from] + 1;
    }
    let p = from;
    while (p < end) {
      let e = p;
      while (e < end && toks[e].v !== ',') {
        if (match[e] > e && match[e] < end) e = match[e];
        e++;
      }
      if (toks[p].t === 'id') {
        refsIn(p + 1, e);
        const array = typeArray || toks[p + 1]?.v === '[';
        const v = declare(toks[p].v, type, array, kind, p, currentFn ? currentFn.id : null);
        if (traceable(v)) vars.push(v);
      }
      p = e + 1;
    }
    return vars;
  };
  let fnExitCode = '';
  const statement = (k, inBody) => {
    const t = toks[k];
    if (!t) return k + 1;
    const wrap = inBody && t.v !== '{';
    if (wrap) ins(t.s, '{', -1);
    let end;
    const L = () => ins(t.s, 'wdbgL(' + ev(1, k) + 'u);', 1);
    if (t.v === '{') {
      end = block(k);
    } else if (t.v === ';') {
      end = k + 1;
    } else if (t.v === 'if') {
      L();
      const open = k + 1,
        close = match[open];
      refsIn(open + 1, close);
      ins(toks[open].e, 'wdbgB(' + ev(2, k) + 'u,(');
      ins(toks[close].s, '))');
      end = statement(close + 1, true);
      if (toks[end]?.v === 'else') end = statement(end + 1, true);
    } else if (t.v === 'for') {
      L();
      const open = k + 1,
        close = match[open];
      scopes.push(new Map());
      let s1 = open + 1;
      while (s1 < close && toks[s1].v !== ';') {
        if (match[s1] > s1) s1 = match[s1];
        s1++;
      }
      let s2 = s1 + 1;
      while (s2 < close && toks[s2].v !== ';') {
        if (match[s2] > s2) s2 = match[s2];
        s2++;
      }
      const dt = declStart(open + 1);
      let loopVars = [];
      if (dt >= 0 && dt < s1) loopVars = parseDecl(open + 1, dt, s1, 'local');
      else refsIn(open + 1, s1);
      refsIn(s1 + 1, s2);
      refsIn(s2 + 1, close);
      if (s2 > s1 + 1) {
        ins(toks[s1].e, 'wdbgB(' + ev(2, k) + 'u,(');
        ins(toks[s2].s, '))');
      }
      const changed = [...new Set([...loopVars, ...changedIn(s2 + 1, close)])];
      const b = close + 1;
      if (toks[b].v === '{') {
        ins(toks[b].e, changed.map(valueCall).join(''), 2);
        end = block(b);
      } else {
        ins(toks[b].s, '{' + changed.map(valueCall).join(''), -1);
        end = statement(b, false);
        ins(toks[end - 1].e, '}', 5);
      }
      scopes.pop();
    } else if (t.v === 'while') {
      L();
      const open = k + 1,
        close = match[open];
      refsIn(open + 1, close);
      ins(toks[open].e, 'wdbgB(' + ev(2, k) + 'u,(');
      ins(toks[close].s, '))');
      end = statement(close + 1, true);
    } else if (t.v === 'do') {
      L();
      end = statement(k + 1, true);
      if (toks[end]?.v === 'while') {
        const open = end + 1,
          close = match[open];
        refsIn(open + 1, close);
        ins(toks[open].e, 'wdbgB(' + ev(2, end) + 'u,(');
        ins(toks[close].s, '))');
        end = close + 2;
      }
    } else if (t.v === 'return') {
      L();
      const e = exprEnd(k + 1);
      refsIn(k + 1, e);
      if (e > k + 1 && TRACE[currentFn.ret] !== undefined) {
        ins(t.e, ' wdbgR(' + ev(3, k, { fn: currentFn.id }) + 'u,(', 1);
        ins(toks[e].s, '))', 1);
      } else ins(t.s, fnExitCode, 2);
      end = e + 1;
    } else if (t.v === 'discard' || t.v === 'break' || t.v === 'continue') {
      L();
      if (t.v === 'discard') ins(t.s, 'wdbgX(' + ev(4, k) + 'u);', 2);
      end = exprEnd(k) + 1;
    } else if (t.v === 'switch') {
      L();
      const open = k + 1,
        close = match[open];
      refsIn(open + 1, close);
      const b = close + 1;
      scopes.push(new Map());
      let q = b + 1;
      while (q < match[b]) {
        if (toks[q].v === 'case') {
          q = exprEnd(q, ':') + 1;
          continue;
        }
        if (toks[q].v === 'default') {
          q += 2;
          continue;
        }
        q = statement(q, false);
      }
      scopes.pop();
      end = match[b] + 1;
    } else {
      const dt = declStart(k);
      const e = exprEnd(k);
      if (dt >= 0) {
        L();
        const kindConst = toks.slice(k, dt).some(x => x.v === 'const') ? 'const' : 'local';
        const vars = parseDecl(k, dt, e, kindConst);
        const changed = changedIn(dt + 1, e);
        const all = [...new Set([...vars, ...changed])];
        if (all.length) ins(toks[e].e, all.map(valueCall).join(''), 3);
      } else {
        L();
        refsIn(k, e);
        const changed = changedIn(k, e);
        if (changed.length) ins(toks[e].e, changed.map(valueCall).join(''), 3);
      }
      end = e + 1;
    }
    if (wrap) ins(toks[end - 1].e, '}', 6);
    return end;
  };
  const block = k => {
    scopes.push(new Map());
    let q = k + 1;
    const close = match[k];
    while (q < close) q = statement(q, false);
    scopes.pop();
    return close + 1;
  };
  let firstFnStart = -1;
  for (const it of topItems) {
    if (it.kind !== 'fn') continue;
    if (firstFnStart < 0) firstFnStart = toks[it.start].s;
    const name = toks[it.paren - 1].v;
    let ret = null;
    for (let q = it.start; q < it.paren - 1; q++) if (isType(toks[q].v)) ret = toks[q].v;
    currentFn = { id: meta.functions.length, name, ret, line: lineOf(toks[it.paren - 1].s) };
    meta.functions.push(currentFn);
    scopes.push(new Map());
    const params = parseParams(it.paren, match[it.paren]);
    const pvars = [];
    for (const p of params) {
      if (p.nameTok < 0) continue;
      const v = declare(p.name, p.type, p.array, 'param', p.nameTok, currentFn.id);
      if (traceable(v) && p.qual !== 'out') pvars.push(v);
    }
    const enter = 'wdbgE(' + ev(5, it.paren - 1, { fn: currentFn.id }) + 'u);';
    fnExitCode = 'wdbgQ(' + ev(6, it.paren - 1, { fn: currentFn.id }) + 'u);';
    let head = '';
    if (name === 'main') {
      anyMain = currentFn;
      head +=
        'if(all(equal(ivec2(gl_FragCoord.xy),wdbgPixel))){wdbgMe=atomicAdd(wdbgInv,1u);wdbgOn=wdbgMe<' +
        slots +
        'u;wdbgBase=wdbgMe*' +
        per +
        'u;}';
      head += enter;
      head +=
        'wdbgV(' +
        (meta.fragCoordId = declare('gl_FragCoord', 'vec4', false, 'builtin', it.paren - 1, null).id) +
        'u,gl_FragCoord);';
      for (const g of globalsToRecord) head += valueCall(g);
    } else head += enter;
    head += pvars.map(valueCall).join('');
    ins(toks[it.body].e, head, 0);
    let q = it.body + 1;
    while (q < it.end) q = statement(q, false);
    if (ret === 'void' || name === 'main') ins(toks[it.end].s, fnExitCode, 9);
    scopes.pop();
  }
  if (!anyMain) throw new Error('Kein main() im Shader gefunden.');
  for (const t of toks) if (t.v === 'gl_FragCoord') meta.refs.push({ s: t.s, e: t.e, id: meta.fragCoordId });
  const types = Object.entries(TRACE);
  let rt = '\n// ---- pixel debugger trace\n';
  rt +=
    'layout(std430, binding = ' +
    binding +
    ') buffer WgpuDbgTrace { uint wdbgCount; uint wdbgInv; uint wdbgPad0; uint wdbgPad1; uvec4 wdbgData[]; };\n';
  rt += 'uniform ivec2 wdbgPixel;\nbool wdbgOn = false; uint wdbgMe = 0u; uint wdbgSeq = 0u; uint wdbgBase = 0u;\n';
  rt +=
    'void wdbgPut(uint head, uint id, uvec4 v){ if(wdbgOn){ if(wdbgSeq < ' +
    per +
    'u){ uint i = (wdbgBase + wdbgSeq) * 2u; wdbgData[i] = uvec4(head, id, wdbgMe, wdbgSeq); wdbgData[i+1u] = v; } wdbgSeq++; } }\n';
  rt +=
    'void wdbgL(uint id){ wdbgPut(1u, id, uvec4(0u)); }\nvoid wdbgE(uint id){ wdbgPut(5u, id, uvec4(0u)); }\nvoid wdbgQ(uint id){ wdbgPut(6u, id, uvec4(0u)); }\nvoid wdbgX(uint id){ wdbgPut(4u, id, uvec4(0u)); }\n';
  rt += 'bool wdbgB(uint id, bool b){ wdbgPut(2u|(3u<<4)|(1u<<8), id, uvec4(b?1u:0u,0u,0u,0u)); return b; }\n';
  const enc = (type, kind = 7) => {
    const [code, n] = TRACE[type];
    if (code === 4) {
      let s = '';
      for (let c = 0; c < n; c++)
        s +=
          'wdbgPut(' +
          kind +
          'u|(4u<<4)|(' +
          n +
          'u<<8)|(' +
          c +
          'u<<12), id, uvec4(floatBitsToUint(v[' +
          c +
          '])' +
          (n < 4
            ? ',' +
              Array(4 - n)
                .fill('0u')
                .join(',')
            : '') +
          '));';
      return s;
    }
    const head = '(' + kind + 'u|(' + code + 'u<<4)|(' + n + 'u<<8))';
    const pad =
      n < 4
        ? ',' +
          Array(4 - n)
            .fill('0u')
            .join(',')
        : '';
    const val =
      code === 0
        ? n === 1
          ? 'floatBitsToUint(v)'
          : 'floatBitsToUint(v)'
        : code === 1
          ? n === 1
            ? 'uint(v)'
            : 'uvec' + n + '(v)'
          : code === 2
            ? 'v'
            : n === 1
              ? '(v?1u:0u)'
              : 'uvec' + n + '(v)';
    return 'wdbgPut(' + head + ', id, uvec4(' + val + pad + '));';
  };
  for (const [type] of types) {
    const body = enc(type);
    rt += 'void wdbgV(uint id, ' + type + ' v){ ' + body + ' }\n';
    rt += type + ' wdbgR(uint id, ' + type + ' v){ ' + enc(type, 3) + ' return v; }\n';
  }
  ins(firstFnStart, rt + '\n', -10);
  edits.sort((a, b) => b.pos - a.pos || b.order - a.order);
  let out = source;
  const byPos = new Map();
  for (const e of edits) {
    if (!byPos.has(e.pos)) byPos.set(e.pos, []);
    byPos.get(e.pos).push(e);
  }
  const positions = [...byPos.keys()].sort((a, b) => b - a);
  const rank = e => (e.order >= 3 ? 0 : 1) * 1000 + e.order;
  {
    const parts = [];
    let last = source.length;
    for (const pos of positions) {
      const list = byPos.get(pos).sort((a, b) => rank(a) - rank(b));
      parts.push(source.slice(pos, last));
      parts.push(list.map(e => e.text).join(''));
      last = pos;
    }
    parts.push(source.slice(0, last));
    out = parts.reverse().join('');
  }
  for (const r of meta.refs) {
    r.line = lineOf(r.s);
    r.col = r.s - lineStarts[r.line];
    r.len = r.e - r.s;
    delete r.s;
    delete r.e;
  }
  meta.samplers = [];
  for (const v of meta.vars) if (/sampler/.test(v.type)) meta.samplers.push(v.name);
  return { code: out, meta };
}
