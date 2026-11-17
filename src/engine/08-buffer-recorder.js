let bufferRecorder = null,
  bufferRecorderStage = 'idle';
const RECORDER_TILE_WIDTH = 480;
const RECORDER_WGSL = `
struct P { rect: vec4f, size: vec2f, mode: f32, flip: f32, nearFar: vec2f, pad: vec2f };
@group(0) @binding(1) var<uniform> p: P;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var q = array<vec2f,3>(vec2f(-1.0,-3.0), vec2f(-1.0,1.0), vec2f(3.0,1.0)); return vec4f(q[i], 0.0, 1.0);
}
fn texel(pos: vec4f) -> vec2i {
  let uv = (pos.xy - p.rect.xy) / p.rect.zw;
  var c = clamp(uv * p.size, vec2f(0.0), p.size - 1.0);
  if (p.flip > 0.5) { c.y = p.size.y - 1.0 - c.y; }
  return vec2i(c);
}
fn show(v: vec4f) -> vec4f {
  var o = v.rgb;
  if (p.mode == 1.0) { o = pow(max(v.rgb, vec3f(0.0)) / (1.0 + max(v.rgb, vec3f(0.0))), vec3f(1.0 / 2.2)); }
  else if (p.mode == 2.0) { o = v.rgb * 0.5 + 0.5; }
  return vec4f(clamp(o, vec3f(0.0), vec3f(1.0)), 1.0);
}`;
const RECORDER_COLOR =
  RECORDER_WGSL +
  `
@group(0) @binding(0) var src: texture_2d<f32>;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f { return show(textureLoad(src, texel(pos), 0)); }`;
const RECORDER_DEPTH =
  RECORDER_WGSL +
  `
@group(0) @binding(0) var src: texture_depth_2d;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let d = textureLoad(src, texel(pos), 0);
  var v = d;
  if (p.nearFar.y > 0.0) { let n = p.nearFar.x; let f = p.nearFar.y; v = (2.0 * n) / (f + n - (2.0 * d - 1.0) * (f - n)); v = sqrt(clamp(v, 0.0, 1.0)); }
  return vec4f(vec3f(v), 1.0);
}`;
function recorderPipelines(device) {
  if (gl.bufferRecorderPipelines) return gl.bufferRecorderPipelines;
  const make = (code, sampleType) => {
    const module = device.createShaderModule({ label: 'Buffer recorder', code });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    return {
      layout,
      pipeline: device.createRenderPipeline({
        label: 'Buffer recorder',
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      }),
    };
  };
  return (gl.bufferRecorderPipelines = {
    color: make(RECORDER_COLOR, 'unfilterable-float'),
    depth: make(RECORDER_DEPTH, 'depth'),
  });
}
function recordStageBuffers(pass) {
  const r = bufferRecorder;
  if (!r || !r.running) return;
  const items = r.byPass.get(pass);
  if (!items) return;
  const device = gl.device,
    pipes = recorderPipelines(device);
  gl.endPass();
  for (const item of items) {
    const texture = inspectorTexture(item.step);
    if (!texture?.gpu || texture.depth > 1 || /(?:uint|sint)$/.test(texture.format)) continue;
    const isDepth = !!texture.isDepth,
      pipe = isDepth ? pipes.depth : pipes.color;
    if (!item.uniform) {
      item.uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    }
    const near = item.step.kind === 'depth' ? CAMERA_NEAR : 0,
      far = item.step.kind === 'depth' ? CAMERA_FAR : 0;
    device.queue.writeBuffer(
      item.uniform,
      0,
      new Float32Array([
        item.x,
        item.y,
        r.tileW,
        r.tileH,
        texture.width,
        texture.height,
        item.mode,
        1,
        near,
        far,
        0,
        0,
      ]),
    );
    const view = texture.gpu.createView({
      baseMipLevel: 0,
      mipLevelCount: 1,
      dimension: '2d',
      ...(isDepth ? { aspect: 'depth-only' } : {}),
    });
    const group = device.createBindGroup({
      layout: pipe.layout,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: { buffer: item.uniform } },
      ],
    });
    const pass2 = gl.commandEncoder().beginRenderPass({
      label: 'Buffer recorder ' + item.file,
      colorAttachments: [{ view: r.atlasView, loadOp: 'load', storeOp: 'store' }],
    });
    pass2.setViewport(item.x, item.y, r.tileW, r.tileH, 0, 1);
    pass2.setScissorRect(item.x, item.y, r.tileW, r.tileH);
    pass2.setPipeline(pipe.pipeline);
    pass2.setBindGroup(0, group);
    pass2.draw(3);
    pass2.end();
    item.seen = true;
    r.touched = true;
  }
}
function recorderMp4(samples, description, width, height) {
  const parts = [],
    u32 = v => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, v);
      return b;
    },
    u16 = v => {
      const b = new Uint8Array(2);
      new DataView(b.buffer).setUint16(0, v);
      return b;
    };
  const cat = list => {
    const size = list.reduce((s, a) => s + a.length, 0),
      out = new Uint8Array(size);
    let o = 0;
    for (const a of list) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  const box = (type, ...content) => {
    const body = cat(content.flat());
    return cat([u32(8 + body.length), new TextEncoder().encode(type), body]);
  };
  const full = (type, version, flags, ...content) =>
    box(type, new Uint8Array([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...content);
  const zeros = n => new Uint8Array(n),
    matrix = cat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  const timescale = 1000,
    durations = samples.map(s => Math.max(1, Math.round(s.duration / 1000))),
    total = durations.reduce((a, b) => a + b, 0);
  const ftyp = box('ftyp', new TextEncoder().encode('isom'), u32(512), new TextEncoder().encode('isomiso2avc1mp41'));
  const data = cat(samples.map(s => s.data)),
    mdat = cat([u32(8 + data.length), new TextEncoder().encode('mdat'), data]);
  const stts = [];
  for (const d of durations) {
    const last = stts.at(-1);
    if (last && last[1] === d) last[0]++;
    else stts.push([1, d]);
  }
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const avc1 = box(
    'avc1',
    zeros(6),
    u16(1),
    zeros(16),
    u16(width),
    u16(height),
    u32(0x480000),
    u32(0x480000),
    u32(0),
    u16(1),
    zeros(32),
    u16(0x18),
    u16(0xffff),
    box('avcC', new Uint8Array(description)),
  );
  const stbl = box(
    'stbl',
    full('stsd', 0, 0, u32(1), avc1),
    full('stts', 0, 0, u32(stts.length), ...stts.map(([c, d]) => cat([u32(c), u32(d)]))),
    full('stss', 0, 0, u32(keys.length), ...keys.map(k => u32(k))),
    full('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    full('stsz', 0, 0, u32(0), u32(samples.length), ...samples.map(s => u32(s.data.length))),
    full('stco', 0, 0, u32(1), u32(ftyp.length + 8)),
  );
  const minf = box(
    'minf',
    full('vmhd', 0, 1, zeros(8)),
    box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
    stbl,
  );
  const mdia = box(
    'mdia',
    full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(total), u16(0x55c4), u16(0)),
    full('hdlr', 0, 0, u32(0), new TextEncoder().encode('vide'), zeros(12), new TextEncoder().encode('VideoHandler\0')),
    minf,
  );
  const trak = box(
    'trak',
    full(
      'tkhd',
      0,
      3,
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(total),
      zeros(8),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      matrix,
      u32(width << 16),
      u32(height << 16),
    ),
    mdia,
  );
  const moov = box(
    'moov',
    full(
      'mvhd',
      0,
      0,
      u32(0),
      u32(0),
      u32(timescale),
      u32(total),
      u32(0x10000),
      u16(0x100),
      zeros(10),
      matrix,
      zeros(24),
      u32(2),
    ),
    trak,
  );
  return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
}
async function startBufferRecording(seconds = 8, onProgress = () => {}) {
  if (bufferRecorder) throw new Error('Recording already running');
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs (VideoEncoder) is not available in this browser');
  if (!gl?.device) throw new Error('The renderer is not ready');
  const steps = inspectorSteps().filter(step => step.kind !== 'final');
  if (!steps.length) throw new Error('No buffers to record');
  const tileW = RECORDER_TILE_WIDTH,
    tileH = Math.max(2, Math.round((tileW * height) / width / 2) * 2);
  let codec = null;
  for (const candidate of ['avc1.42E01F', 'avc1.42001F', 'avc1.4D401F']) {
    const support = await VideoEncoder.isConfigSupported({
      codec: candidate,
      width: tileW,
      height: tileH,
      bitrate: 2500000,
      framerate: 30,
      avc: { format: 'avc' },
      hardwareAcceleration: 'prefer-software',
    }).catch(() => null);
    if (support?.supported) {
      codec = candidate;
      break;
    }
  }
  if (!codec) throw new Error('No H.264 encoder for ' + tileW + 'x' + tileH);
  const cols = Math.max(1, Math.min(steps.length, Math.floor(8192 / tileW))),
    rows = Math.ceil(steps.length / cols);
  const atlasW = Math.ceil((cols * tileW) / 64) * 64,
    atlasH = rows * tileH;
  if (atlasH > 8192) throw new Error('Too many buffers for one atlas');
  const device = gl.device,
    atlas = device.createTexture({
      label: 'Buffer recorder atlas',
      size: [atlasW, atlasH],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  const names = new Map(),
    byPass = new Map(),
    items = steps.map((step, i) => {
      const base =
        step.pass.replace(/^compute:/, '') +
        '.' +
        (step.kind === 'color'
          ? 'colortex' + step.logical
          : step.kind === 'depth'
            ? 'depthtex0'
            : step.kind === 'shadowDepth'
              ? 'shadowtex0'
              : 'shadowcolor0');
      const n = (names.get(base) || 0) + 1;
      names.set(base, n);
      const item = {
        step,
        file: (n > 1 ? base + '.' + n : base) + '.mp4',
        x: (i % cols) * tileW,
        y: Math.floor(i / cols) * tileH,
        mode: step.kind === 'color' ? (step.mode === 1 ? 1 : step.mode === 2 ? 2 : 0) : 0,
        chunks: [],
        config: null,
        seen: false,
      };
      item.encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description) item.config = meta.decoderConfig;
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          item.chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
        },
        error: error => {
          item.error = String(error?.message || error);
        },
      });
      item.encoder.configure({
        codec,
        width: tileW,
        height: tileH,
        bitrate: 2500000,
        framerate: 30,
        avc: { format: 'avc' },
        hardwareAcceleration: 'prefer-software',
        latencyMode: 'realtime',
      });
      if (!byPass.has(step.pass)) byPass.set(step.pass, []);
      byPass.get(step.pass).push(item);
      return item;
    });
  const bytesPerRow = atlasW * 4,
    pool = [0, 1, 2].map(() => ({
      buffer: device.createBuffer({
        size: bytesPerRow * atlasH,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      busy: false,
    }));
  let finish;
  const done = new Promise(resolve => (finish = resolve)),
    pending = new Set();
  const r = (bufferRecorder = {
    running: true,
    tileW,
    tileH,
    atlas,
    atlasView: atlas.createView(),
    byPass,
    items,
    touched: false,
    frames: 0,
    start: performance.now(),
  });
  const tile = new Uint8Array(tileW * tileH * 4);
  const originalEnd = gl.endFrame;
  gl.endFrame = function (...args) {
    let slot = null,
      stamp = 0;
    if (r.running && r.touched) {
      slot = pool.find(s => !s.busy);
      if (slot) {
        gl.endPass();
        slot.busy = true;
        stamp = performance.now() - r.start;
        gl.commandEncoder().copyTextureToBuffer(
          { texture: atlas },
          { buffer: slot.buffer, bytesPerRow, rowsPerImage: atlasH },
          [atlasW, atlasH],
        );
      }
    }
    r.touched = false;
    const result = originalEnd.apply(this, args);
    if (r.running && performance.now() - r.start >= seconds * 1000) {
      r.running = false;
      finish();
    } else onProgress((performance.now() - r.start) / (seconds * 1000));
    if (slot) {
      const job = slot.buffer
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const pixels = new Uint8Array(slot.buffer.getMappedRange());
          const keyFrame = r.frames % 30 === 0;
          r.frames++;
          for (const item of items) {
            if (!item.seen || item.encoder.state !== 'configured') continue;
            for (let row = 0; row < tileH; row++)
              tile.set(
                pixels.subarray(
                  (item.y + row) * bytesPerRow + item.x * 4,
                  (item.y + row) * bytesPerRow + (item.x + tileW) * 4,
                ),
                row * tileW * 4,
              );
            const frame = new VideoFrame(tile, {
              format: 'RGBA',
              codedWidth: tileW,
              codedHeight: tileH,
              timestamp: Math.round(stamp * 1000),
            });
            item.encoder.encode(frame, { keyFrame });
            frame.close();
          }
          slot.buffer.unmap();
          slot.busy = false;
        })
        .catch(() => {
          slot.busy = false;
        })
        .finally(() => pending.delete(job));
      pending.add(job);
    }
    return result;
  };
  bufferRecorderStage = 'recording';
  try {
    await done;
  } finally {
    r.running = false;
    gl.endFrame = originalEnd;
  }
  bufferRecorderStage = 'readbacks ' + pending.size;
  await Promise.allSettled([...pending]);
  const zip = new JSZip(),
    written = [];
  bufferRecorderStage = 'flush';
  await Promise.allSettled(items.map(item => (item.encoder.state === 'configured' ? item.encoder.flush() : null)));
  for (const item of items) {
    try {
      item.encoder.close();
    } catch {}
    if (!item.chunks.length || !item.config?.description) continue;
    const chunks = item.chunks.sort((a, b) => a.timestamp - b.timestamp);
    const samples = chunks.map((c, i) => ({
      data: c.data,
      key: c.key,
      duration: i + 1 < chunks.length ? chunks[i + 1].timestamp - c.timestamp : 33333,
    }));
    zip.file(item.file, recorderMp4(samples, item.config.description, tileW, tileH));
    written.push(item.file);
  }
  atlas.destroy();
  for (const s of pool) s.buffer.destroy();
  for (const item of items) item.uniform?.destroy();
  bufferRecorder = null;
  if (!written.length) throw new Error('No buffer produced a video');
  bufferRecorderStage = 'zip';
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  bufferRecorderStage = 'idle';
  return { blob, files: written, frames: r.frames };
}
