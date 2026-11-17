// pause snapshots all buffers so the frame can be replayd exactly the same, otherwise taa history drifts
const WGPU_DBG_BINDING = 23,
  WGPU_DBG_CAP = 131072;
const wgpuPassPrograms = new Map();
let wgpuDbgPause = null,
  wgpuDbgReplaying = false,
  wgpuDbgLast = null;
function wgpuDbgCopyTexture(source) {
  if (!source?.gpu) return null;
  const copy = gl.createTexture();
  gl.allocateTexture(copy, source.width, source.height, source.depth || 1, source.format, 1, source.dimension || '2d');
  copy.params = source.params;
  copy.isDepth = source.isDepth;
  return copy;
}
function wgpuDbgCopy(from, to) {
  gl.endPass();
  gl.commandEncoder().copyTextureToTexture(
    { texture: from.gpu },
    { texture: to.gpu },
    { width: from.width, height: from.height, depthOrArrayLayers: from.depth || 1 },
  );
  to.version = (to.version || 0) + 1;
}
function wgpuDbgPreserved() {
  const cleared = new Set(sceneClearTargets()),
    list = [];
  for (let logical = 0; logical < colortexCurrent.length; logical++) if (!cleared.has(logical)) list.push(logical);
  return list;
}
function wgpuDbgFrameStart(t) {
  const pause = wgpuDbgPause;
  if (!pause) return;
  if (wgpuDbgReplaying && pause.js && (pause.size?.[0] !== width || pause.size?.[1] !== height)) {
    for (const [, copy] of pause.textures || []) gl.deleteTexture(copy);
    for (const [, copy] of pause.buffers || []) copy.destroy();
    pause.phase = 'pending';
    pause.js = null;
  }
  if (pause.phase === 'pending') {
    pause.phase = 'paused';
    pause.t = t;
    pause.size = [width, height];
    window.wgpuDbgFrozen = performance.now();
    pause.js = {
      prevView: new Float32Array(previousGbufferViewMatrix),
      prevProj: new Float32Array(previousProjectionMatrix),
      prevCam: [...previousCameraPosition],
      counter: renderedFrameCounter,
      history: temporalHistoryValid,
      current: colortexCurrent.slice(),
      spare: colortexSpare.slice(),
    };
    pause.textures = [];
    for (const logical of wgpuDbgPreserved())
      for (const texture of [colortexCurrent[logical], colortexSpare[logical]]) {
        if (!texture?.gpu) continue;
        const copy = wgpuDbgCopyTexture(texture);
        if (!copy) continue;
        wgpuDbgCopy(texture, copy);
        pause.textures.push([texture, copy]);
      }
    pause.buffers = [];
    for (const [index, buffer] of gl.storageBuffers || []) {
      if (index === WGPU_DBG_BINDING) continue;
      const copy = gl.device.createBuffer({
        label: 'Pause-Kopie SSBO ' + index,
        size: buffer.size,
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      gl.endPass();
      gl.commandEncoder().copyBufferToBuffer(buffer, 0, copy, 0, buffer.size);
      pause.buffers.push([buffer, copy]);
    }
    return;
  }
  if (wgpuDbgReplaying && pause.js) {
    const js = pause.js;
    previousGbufferViewMatrix = new Float32Array(js.prevView);
    previousProjectionMatrix = new Float32Array(js.prevProj);
    previousCameraPosition[0] = js.prevCam[0];
    previousCameraPosition[1] = js.prevCam[1];
    previousCameraPosition[2] = js.prevCam[2];
    renderedFrameCounter = js.counter;
    temporalHistoryValid = js.history;
    for (let logical = 0; logical < js.current.length; logical++) {
      colortexCurrent[logical] = js.current[logical];
      colortexSpare[logical] = js.spare[logical];
    }
    colortexFrameStart = colortexCurrent.slice();
    for (const [texture, copy] of pause.textures) wgpuDbgCopy(copy, texture);
    for (const [buffer, copy] of pause.buffers) {
      gl.endPass();
      gl.commandEncoder().copyBufferToBuffer(copy, 0, buffer, 0, buffer.size);
    }
  }
}
function wgpuDbgReplay() {
  if (!wgpuDbgPause || wgpuDbgPause.phase !== 'paused' || !wgpuDbgPause.js) throw new Error('Nicht pausiert.');
  wgpuDbgReplaying = true;
  try {
    if (gl) resetPipelineMipmaps();
    renderScene(wgpuDbgPause.t);
  } catch (error) {
    gl?.submit();
    throw error;
  } finally {
    wgpuDbgReplaying = false;
  }
}
function wgpuDbgResume() {
  if (!wgpuDbgPause) return;
  for (const [, copy] of wgpuDbgPause.textures || []) gl.deleteTexture(copy);
  for (const [, copy] of wgpuDbgPause.buffers || []) copy.destroy();
  wgpuDbgPause = null;
  window.wgpuDbgFrozen = undefined;
  requestAnimationFrame(render);
  document.dispatchEvent(new CustomEvent('gbufferd-inspector'));
}
function wgpuDbgSync(swap, glx) {
  const from = swap.from,
    to = swap.to;
  const src = new Uint8Array(from.uniformData),
    dst = new Uint8Array(to.uniformData);
  for (const field of to.fields) {
    const other = from.fields.find(f => f.name === field.name);
    if (!other || other.type !== field.type) continue;
    const size = Math.min(
      field.count > 1 ? field.stride * field.count : field.columns > 1 ? field.columns * 16 : field.rows * 4,
      other.count > 1 ? other.stride * other.count : other.columns > 1 ? other.columns * 16 : other.rows * 4,
    );
    if (other.offset + size <= src.length && field.offset + size <= dst.length)
      dst.set(src.subarray(other.offset, other.offset + size), field.offset);
  }
  for (const sampler of to.activeSamplers) {
    const value = from.values.get(sampler.name);
    if (value) to.values.set(sampler.name, value);
  }
  const pixelField = to.fields.find(f => f.name === 'wdbgPixel');
  if (pixelField) {
    const view = new DataView(to.uniformData);
    view.setInt32(pixelField.offset, swap.pixel?.[0] ?? -1, true);
    view.setInt32(pixelField.offset + 4, swap.pixel?.[1] ?? -1, true);
  }
  to.revision++;
  to.valuesRevision = (to.valuesRevision || 0) + 1;
  if (!swap.textures) {
    swap.textures = new Map();
    for (const sampler of to.activeSamplers) {
      const unit = glx.units[from.values.get(sampler.name)?.[0] ?? 0] || {};
      const texture = unit[sampler.type.includes('3D') ? glx.TEXTURE_3D : glx.TEXTURE_2D];
      if (!texture?.gpu || (texture.depth || 1) > 1 || texture.width * texture.height > 4096 * 4096) continue;
      const source = texture.isDepth ? gl.rawDepth(texture) : texture;
      const copy = wgpuDbgCopyTexture(source);
      if (!copy) continue;
      wgpuDbgCopy(source, copy);
      swap.textures.set(sampler.name, {
        texture: copy,
        name: texture.gpu.label || '',
        width: texture.width,
        height: texture.height,
        format: texture.format,
      });
    }
  }
  if (!swap.buffers) {
    swap.buffers = new Map();
    for (const binding of swap.bufferBindings || []) {
      const source = gl.storageBuffers.get(binding);
      if (!source || binding === WGPU_DBG_BINDING || swap.buffers.has(binding)) continue;
      const size = Math.min(source.size, 64 * 1048576);
      const copy = gl.device.createBuffer({
        label: 'Pixel-Debug SSBO ' + binding,
        size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      gl.endPass();
      gl.commandEncoder().copyBufferToBuffer(source, 0, copy, 0, size);
      swap.buffers.set(binding, { buffer: copy, size, total: source.size });
    }
  }
}
function wgpuDbgDiff(a, b) {
  const n = a.length,
    m = b.length,
    max = n + m;
  if (!max) return [];
  const trace = [];
  let v = new Int32Array(3);
  v[1] = 0;
  let found = -1;
  for (let d = 0; d <= max; d++) {
    const next = new Int32Array(2 * d + 3),
      get = (arr, k, dd) => arr[k + dd + 1];
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && (d ? get(v, k - 1, d - 1) : 0) < (d ? get(v, k + 1, d - 1) : 0)))
        x = d ? get(v, k + 1, d - 1) : 0;
      else x = (d ? get(v, k - 1, d - 1) : 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next[k + d + 1] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    trace.push(next);
    v = next;
    if (found >= 0) break;
    if (d > 4000) return null;
  }
  const pairs = [];
  let x = n,
    y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1],
      k = x - y,
      get = kk => prev[kk + (d - 1) + 1];
    const down = k === -d || (k !== d && get(k - 1) < get(k + 1));
    const pk = down ? k + 1 : k - 1,
      px = get(pk),
      py = px - pk;
    while (x > px && y > py) {
      x--;
      y--;
      pairs.push([x, y]);
    }
    x = px;
    y = py;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    pairs.push([x, y]);
  }
  return pairs.reverse();
}
function wgpuDbgOrigin(program, compiled) {
  const origin = window.wgpuProgramOrigins?.get(programNames.get(program));
  if (!origin?.raw || !origin.pre) return null;
  const norm = line =>
    line
      .replace(/\bgl_FragData\s*\[\s*(\d+)\s*\]/g, 'outColor$1')
      .replace(/\bgl_FragColor\b/g, 'outColor0')
      .replace(/\bwgpu(Any|All)\b/g, (m, w) => w.toLowerCase())
      .replace(/\s+/g, ' ')
      .trim();
  const pre = origin.pre.split('\n').map(norm),
    fin = compiled.split('\n').map(norm);
  const rawOfPre = new Int32Array(pre.length).fill(-1);
  origin.out.forEach((out, raw) => {
    if (out !== undefined && out >= 0 && out < pre.length && rawOfPre[out] < 0) rawOfPre[out] = raw;
  });
  const ids = new Map(),
    id = line => {
      let v = ids.get(line);
      if (v === undefined) {
        v = ids.size;
        ids.set(line, v);
      }
      return v;
    };
  const pIdx = [],
    fIdx = [];
  pre.forEach((l, i) => {
    if (l) pIdx.push(i);
  });
  fin.forEach((l, i) => {
    if (l) fIdx.push(i);
  });
  const pairs =
    wgpuDbgDiff(
      fIdx.map(i => id(fin[i])),
      pIdx.map(i => id(pre[i])),
    ) || [];
  const finToPre = new Int32Array(fin.length).fill(-1);
  for (const [a, b] of pairs) finToPre[fIdx[a]] = pIdx[b];
  const tokens = line => line.match(/\w+|[^\s\w]/g) || [];
  const similar = (a, b) => {
    const ta = tokens(a),
      tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    const bag = new Map();
    for (const t of tb) bag.set(t, (bag.get(t) || 0) + 1);
    let same = 0;
    for (const t of ta) {
      const n = bag.get(t);
      if (n) {
        same++;
        bag.set(t, n - 1);
      }
    }
    return same / Math.max(ta.length, tb.length);
  };
  const usedPre = new Uint8Array(pre.length);
  for (const v of finToPre) if (v >= 0) usedPre[v] = 1;
  let lastPre = -1;
  for (let i = 0; i < fin.length; i++) {
    if (finToPre[i] >= 0) {
      lastPre = finToPre[i];
      continue;
    }
    if (!fin[i]) continue;
    let nextPre = pre.length;
    for (let k = i + 1; k < fin.length; k++)
      if (finToPre[k] >= 0) {
        nextPre = finToPre[k];
        break;
      }
    let best = 0.5,
      pick = -1;
    {
      const d = /^(?:const\s+)?(\w+)\s+(\w+)\s*;$/.exec(fin[i]);
      if (d) {
        const re = new RegExp('^(?:const\\s+)?' + d[1] + '\\s+' + d[2] + '\\s*=');
        let hit = -1;
        for (let j = 0; j < pre.length; j++)
          if (re.test(pre[j])) {
            hit = j;
            break;
          }
        if (hit >= 0) {
          finToPre[i] = hit;
          continue;
        }
      }
    }
    for (let j = lastPre + 1; j < nextPre && j < lastPre + 400; j++) {
      if (usedPre[j] || !pre[j]) continue;
      const s = similar(fin[i], pre[j]);
      if (s > best) {
        best = s;
        pick = j;
      }
    }
    if (pick >= 0) {
      finToPre[i] = pick;
      usedPre[pick] = 1;
      lastPre = pick;
      continue;
    }
    if (fin[i].length > 6)
      for (let j = 0; j < pre.length; j++)
        if (pre[j].length > fin[i].length && pre[j].endsWith(fin[i])) {
          finToPre[i] = j;
          break;
        }
  }
  const finalToRaw = Array.from(finToPre, p => (p >= 0 ? rawOfPre[p] : -1));
  const state = new Array(origin.raw.length);
  let last = 'a';
  for (let i = 0; i < state.length; i++) {
    if (origin.state[i]) last = origin.state[i];
    state[i] = origin.state[i] || last;
  }
  return { raw: origin.raw, state, finalToRaw, includes: origin.includes || null };
}
function wgpuDbgDecode(words, meta) {
  const floats = new Float32Array(words.buffer, words.byteOffset, words.length),
    ints = new Int32Array(words.buffer, words.byteOffset, words.length);
  const used = Math.min(words[1], meta.slots),
    list = [];
  let total = 0,
    truncated = false;
  for (let slot = 0; slot < used; slot++) {
    const events = [];
    for (let k = 0; k < meta.per; k++) {
      const b = 4 + (slot * meta.per + k) * 8,
        head = words[b];
      if (!head) break;
      const kind = head & 15,
        type = (head >> 4) & 15,
        n = (head >> 8) & 15,
        col = (head >> 12) & 15;
      let value = null;
      if (kind === 7 || kind === 2 || kind === 3)
        value = {
          type,
          n,
          col,
          raw: [0, 1, 2, 3]
            .slice(0, n || 1)
            .map(c =>
              type === 0 || type === 4
                ? floats[b + 4 + c]
                : type === 1
                  ? ints[b + 4 + c]
                  : type === 3
                    ? !!words[b + 4 + c]
                    : words[b + 4 + c],
            ),
        };
      events.push({ kind, id: words[b + 1], seq: k, value });
      if (k === meta.per - 1) truncated = true;
    }
    total += events.length;
    const merged = [];
    for (const e of events) {
      if (e.value?.type === 4 && e.value.col > 0 && merged.length) {
        const last = merged[merged.length - 1];
        if (last.id === e.id && last.value?.type === 4) {
          last.value.columns.push(e.value.raw);
          continue;
        }
      }
      if (e.value?.type === 4) e.value.columns = [e.value.raw];
      merged.push(e);
    }
    list.push({ invocation: slot, events: merged });
  }
  return { count: total, truncated, invocationCount: words[1], invocations: list };
}
const wgpuDbgPrograms = new Map();
let wgpuDbgBuffer = null;
function wgpuDbgPrepare(program, label) {
  let entry = wgpuDbgPrograms.get(program);
  if (!entry) {
    const source = program.wgpuDebugSource;
    const instrumented = wgpuInstrumentGlsl(source.fragment, { binding: WGPU_DBG_BINDING, cap: WGPU_DBG_CAP });
    entry = {
      instrumented,
      ready: gl.createShaderProgram(source.vertex, instrumented.code, label + ' (Pixel-Debug)', false, source.options),
      warmed: false,
    };
    entry.ready.catch(() => wgpuDbgPrograms.delete(program));
    wgpuDbgPrograms.set(program, entry);
  }
  return entry;
}
const wgpuDbgPending = () => Number(gl.irisAsyncPipelines?.pending) || 0;
function wgpuDbgTracedReplay(program, debugProgram, pixel, bufferBindings = []) {
  wgpuDbgBuffer ??= gl.device.createBuffer({
    label: 'Pixel-Debug Trace',
    size: 16 + WGPU_DBG_CAP * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const clear = gl.device.createCommandEncoder({ label: 'Pixel-Debug clear' });
  clear.clearBuffer(wgpuDbgBuffer);
  gl.device.queue.submit([clear.finish()]);
  const swap = {
    from: program,
    to: debugProgram,
    textures: null,
    buffers: null,
    bufferBindings,
    draws: 0,
    pixel,
    sync(glx) {
      wgpuDbgSync(swap, glx);
    },
  };
  const previous = gl.storageBuffers.get(WGPU_DBG_BINDING);
  gl.storageBuffers.set(WGPU_DBG_BINDING, wgpuDbgBuffer);
  gl.wgpuDebugSwap = swap;
  try {
    wgpuDbgReplay();
    gl.submit();
  } finally {
    gl.wgpuDebugSwap = null;
    if (previous) gl.storageBuffers.set(WGPU_DBG_BINDING, previous);
    else gl.storageBuffers.delete(WGPU_DBG_BINDING);
  }
  try {
    wgpuDbgReplay();
    gl.submit();
  } catch (error) {
    console.warn(error);
  }
  return swap;
}
async function wgpuDbgReadTrace() {
  const size = 16 + WGPU_DBG_CAP * 32;
  const read = gl.device.createBuffer({
    label: 'Pixel-Debug Readback',
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = gl.device.createCommandEncoder({ label: 'Pixel-Debug Readback' });
  encoder.copyBufferToBuffer(wgpuDbgBuffer, 0, read, 0, size);
  gl.device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const words = new Uint32Array(read.getMappedRange().slice(0));
  read.unmap();
  read.destroy();
  return words;
}
async function wgpuDbgWaitPipelines(onProgress, started) {
  const limit = performance.now() + 600000;
  while (wgpuDbgPending() > 0) {
    if (performance.now() > limit)
      throw new Error(
        'The GPU driver did not finish the pipelines in 10 minutes (' +
          wgpuDbgPending() +
          ' still building). Try again, or resume and pause on another frame.',
      );
    if (!wgpuDbgPause)
      throw new Error('Rendering was resumed while the debugger waited. Pause again and pick the pixel.');
    onProgress?.({
      phase: 'pipelines',
      pending: wgpuDbgPending(),
      seconds: Math.round((performance.now() - started) / 1000),
    });
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
function wgpuDbgStepProgram() {
  const step = inspectorList[inspectorIndex];
  if (!step || step.kind === 'final') throw new Error('Kein Pass gewählt.');
  const own = typeof wgpuProgramFor === 'function' ? wgpuProgramFor(step.pass) : null;
  const program = own?.wgpuDebugSource ? own : wgpuPassPrograms.get(step.pass);
  if (!program?.wgpuDebugSource)
    throw new Error('Für ' + step.pass + ' gibt es keinen Shader-Quelltext (eingebautes Programm des Engines).');
  return { step, program };
}
async function wgpuDbgWarm(onProgress) {
  if (!wgpuDbgPause || wgpuDbgPause.phase !== 'paused' || !wgpuDbgPause.js) return false;
  const { step, program } = wgpuDbgStepProgram(),
    started = performance.now();
  const entry = wgpuDbgPrepare(program, programNames.get(program) || step.pass);
  onProgress?.({ phase: 'compile', seconds: 0 });
  const debugProgram = await entry.ready;
  if (!entry.warmed) {
    wgpuDbgTracedReplay(program, debugProgram, [-1, -1]);
    entry.warmed = true;
  }
  await wgpuDbgWaitPipelines(onProgress, started);
  return true;
}
async function wgpuDbgPixel(x, y, onProgress) {
  if (!wgpuDbgPause || wgpuDbgPause.phase !== 'paused' || !wgpuDbgPause.js) throw new Error('Zuerst pausieren.');
  const { step, program } = wgpuDbgStepProgram(),
    started = performance.now();
  const entry = wgpuDbgPrepare(program, programNames.get(program) || step.pass);
  onProgress?.({ phase: 'compile', seconds: 0 });
  const debugProgram = await entry.ready;
  let swap,
    words,
    rounds = 0;
  for (;;) {
    swap = wgpuDbgTracedReplay(
      program,
      debugProgram,
      [x | 0, y | 0],
      (entry.instrumented.meta.buffers || []).map(b => b.binding),
    );
    entry.warmed = true;
    words = await wgpuDbgReadTrace();
    if (wgpuDbgPending() === 0 || rounds >= 6) break;
    await wgpuDbgWaitPipelines(onProgress, started);
    rounds++;
  }
  for (const old of wgpuDbgLast?.textures?.values?.() || []) gl.deleteTexture(old.texture);
  for (const old of wgpuDbgLast?.buffers?.values?.() || []) old.buffer.destroy();
  const meta = entry.instrumented.meta,
    trace = wgpuDbgDecode(words, meta);
  wgpuDbgLast = {
    pass: step.pass,
    pixel: [x | 0, y | 0],
    meta,
    trace,
    textures: swap.textures || new Map(),
    buffers: swap.buffers || new Map(),
    label: programNames.get(program) || step.pass,
  };
  const label = programNames.get(program) || step.pass;
  return {
    pass: step.pass,
    pixel: [x | 0, y | 0],
    meta,
    trace,
    origin: wgpuDbgOrigin(program, program.wgpuDebugSource.fragment),
    draws: swap.draws,
    targets: (activePassTargets[label] || activePassTargets[step.pass] || PIPELINE_TARGETS[label] || []).slice(),
    formats: Object.fromEntries(
      (activePassTargets[label] || activePassTargets[step.pass] || PIPELINE_TARGETS[label] || []).map(l => [
        l,
        colortexFormatLabels[l] || '',
      ]),
    ),
    seconds: Math.round((performance.now() - started) / 1000),
    samplers: [...(swap.textures || new Map()).entries()].map(([name, info]) => ({
      name,
      width: info.width,
      height: info.height,
      format: info.format,
    })),
    storage: [...(swap.buffers || new Map()).entries()].map(([binding, info]) => ({
      binding,
      size: info.size,
      total: info.total,
    })),
  };
}
async function wgpuDbgCovers(x, y) {
  if (!wgpuDbgPause || wgpuDbgPause.phase !== 'paused' || !wgpuDbgPause.js) return { covered: true };
  const step = inspectorList[inspectorIndex];
  if (!step || step.kind === 'final') return { covered: true };
  if (!/^(gbuffers_|shadow)/.test(step.pass) || /^shadowcomp/.test(step.pass) || wgpuDbgPending() > 0)
    return { covered: true };
  const program = typeof wgpuProgramFor === 'function' ? wgpuProgramFor(step.pass) : wgpuPassPrograms.get(step.pass);
  if (!program) return { covered: true };
  gl.viewerDisabledPrograms ??= new Set();
  if (gl.viewerDisabledPrograms.has(program)) return { covered: false, disabled: true };
  const read = async () => {
    const old = inspectorCapturedTexture;
    inspectorCapturedTexture = null;
    wgpuDbgReplay();
    const texture = inspectorCapturedTexture;
    if (old && old !== texture)
      try {
        gl.deleteTexture(old);
      } catch {}
    if (!texture) return null;
    const r = await gl.readTexturePixels(texture, x | 0, y | 0, 1, 1);
    return r && !r.unsupported ? JSON.stringify(r.texels || r) : null;
  };
  let without;
  gl.viewerDisabledPrograms.add(program);
  try {
    without = await read();
  } finally {
    gl.viewerDisabledPrograms.delete(program);
  }
  const withPass = await read();
  return { covered: without == null || withPass == null || without !== withPass };
}
async function wgpuDbgTexturePreview(name, maxSize = 256) {
  const info = wgpuDbgLast?.textures?.get(name);
  if (!info) return null;
  const texels = await gl.readTexturePixels(info.texture, 0, 0, info.width, info.height);
  if (!texels || texels.unsupported) return { name, format: info.format, unsupported: true };
  const list = texels.texels || texels,
    scale = Math.max(1, Math.ceil(Math.max(info.width, info.height) / maxSize));
  const w = Math.max(1, Math.floor(info.width / scale)),
    h = Math.max(1, Math.floor(info.height / scale)),
    data = new Uint8ClampedArray(w * h * 4);
  const depth = !!info.texture.isDepth || /depth/i.test(String(info.format || ''));
  let lo = Infinity,
    hi = -Infinity;
  if (depth)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Number((list[(info.height - 1 - y * scale) * info.width + x * scale] || [1])[0]);
        if (d < 1 && d >= 0) {
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
      }
  const range = hi > lo ? [lo, hi] : null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x * scale,
        sy = info.height - 1 - y * scale,
        t = list[sy * info.width + sx] || [0, 0, 0, 1],
        o = (y * w + x) * 4;
      if (depth) {
        const d = Number(t[0]);
        const v = !(d < 1)
          ? 0
          : range
            ? Math.round((0.15 + 0.85 * (1 - (d - range[0]) / (range[1] - range[0]))) * 255)
            : 200;
        data[o] = data[o + 1] = data[o + 2] = v;
      } else {
        for (let c = 0; c < 3; c++) {
          let v = Math.max(0, Number(t[c]) || 0);
          if (v > 1) v = (v / (1 + v)) * 2;
          data[o + c] = Math.round(Math.min(1, v) * 255);
        }
      }
      data[o + 3] = 255;
    }
  return {
    name,
    width: w,
    height: h,
    data,
    format: info.format,
    size: [info.width, info.height],
    depthRange: depth ? range || [0, 1] : null,
  };
}
let wgpuWireOn = false;
function wgpuWireMatch(program) {
  if (!wgpuWireOn || !inspectorOpen) return false;
  const step = inspectorList[inspectorIndex];
  if (!step || step.kind === 'final') return false;
  const pass = step.pass,
    name = programNames.get(program) || '';
  if (pass === 'gbuffers_skybasic' && typeof skyProgram !== 'undefined' && program === skyProgram) return true;
  return (
    name === pass ||
    name.startsWith(pass + '_') ||
    (typeof wgpuProgramFor === 'function' && wgpuProgramFor(pass) === program)
  );
}
function wgpuWireApply() {
  if (!gl) return;
  gl.wireOverlayOn = wgpuWireOn;
  gl.wgpuWireMatch = wgpuWireOn ? wgpuWireMatch : null;
  gl.onWireReady = () => {
    if (wgpuDbgPause?.phase === 'paused' && !wgpuDbgReplaying)
      setTimeout(() => {
        try {
          wgpuDbgReplay();
        } catch (e) {
          console.warn(e);
        }
      }, 0);
  };
}
Object.assign(GB.inspector, {
  pause() {
    if (!wgpuDbgPause) {
      wgpuDbgPause = { phase: 'pending' };
    }
  },
  resume() {
    wgpuDbgResume();
  },
  async readPixels(x, y, w, h) {
    const step = inspectorList[inspectorIndex];
    if (!step || step.kind === 'final') return null;
    const texture = inspectorCapturedTexture || inspectorTexture(step);
    if (!texture) return null;
    const r = await gl.readTexturePixels(texture, x, y, w, h);
    return r;
  },
  textureSize() {
    const step = inspectorList[inspectorIndex],
      texture = step && step.kind !== 'final' ? inspectorCapturedTexture || inspectorTexture(step) : null;
    return texture ? [texture.width, texture.height] : null;
  },
  debugPixel: wgpuDbgPixel,
  passCovers: wgpuDbgCovers,
  warmDebugger: wgpuDbgWarm,
  texturePreview: wgpuDbgTexturePreview,
  async debugBuffer(binding, byteOffset, byteLength) {
    const info = wgpuDbgLast?.buffers?.get(binding);
    if (!info) return null;
    const offset = Math.max(0, Math.min(info.size - 4, Math.floor(byteOffset / 4) * 4)),
      size = Math.min(Math.ceil(byteLength / 4) * 4, info.size - offset);
    if (size < 4) return null;
    const read = gl.device.createBuffer({
      label: 'Pixel-Debug SSBO read',
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = gl.device.createCommandEncoder({ label: 'Pixel-Debug SSBO read' });
    encoder.copyBufferToBuffer(info.buffer, offset, read, 0, size);
    gl.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(read.getMappedRange().slice(0));
    read.unmap();
    read.destroy();
    return { bytes, offset, size: info.size, total: info.total };
  },
  async debugTexels(name, x, y, w, h) {
    const info = wgpuDbgLast?.textures?.get(name);
    if (!info) return null;
    return gl.readTexturePixels(info.texture, x, y, w, h);
  },
  replay() {
    wgpuDbgReplay();
  },
  triangleEdgesSupported() {
    return !!gl?.device?.features?.has('primitive-index');
  },
  setTriangleEdges(on) {
    wgpuWireOn = !!on;
    wgpuWireApply();
    if (wgpuDbgPause?.phase === 'paused')
      try {
        wgpuDbgReplay();
      } catch (e) {
        console.warn(e);
      }
  },
});
Object.defineProperty(GB.inspector, 'triangleEdges', {
  get() {
    return wgpuWireOn;
  },
  configurable: true,
});
