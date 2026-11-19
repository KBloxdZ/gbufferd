function gbInstallRendererPerformance(Renderer) {
  const p = Renderer.prototype;
  if (p.irisPerformanceInstalled) return;
  p.irisPerformanceInstalled = true;
  p.framesInFlight = function () {
    return this.fault ? 0 : this.inFlight?.size || 0;
  };
  const upload = p.uploadTexture;
  p.uploadTexture = function (target, level, internal, width, height, depth, format, type, pixels) {
    const texture = this.boundTextures.get(target),
      gpuFormat = this.textureFormat(internal);
    const levels =
      target === this.TEXTURE_3D || gpuFormat.startsWith('depth') || gpuFormat.includes('uint')
        ? 1
        : Math.floor(Math.log2(Math.max(width, height))) + 1;
    const reusable =
      level === 0 &&
      pixels &&
      texture?.gpu &&
      texture.width === width &&
      texture.height === height &&
      texture.depth === depth &&
      texture.format === gpuFormat &&
      texture.levels === levels;
    if (!reusable) return upload.apply(this, arguments);
    const allocate = this.allocateTexture;
    this.allocateTexture = function (t, ...args) {
      if (t !== texture) return allocate.call(this, t, ...args);
    };
    try {
      return upload.apply(this, arguments);
    } finally {
      this.allocateTexture = allocate;
    }
  };
  p.generateMipmap = function (target) {
    this.endPass();
    const texture = this.boundTextures.get(target);
    if (!texture || texture.isDepth || texture.levels < 2) return;
    const filterable = this.filterableFormat(texture.format);
    let pipeline = this.mipmapPipelines.get(texture.format);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: 'Mip ' + texture.format,
        layout: 'auto',
        vertex: { module: this.utilityVertex, entryPoint: 'vs' },
        fragment: {
          module: filterable ? this.mipmapModule : this.mipmapLoadModule,
          entryPoint: 'fs',
          targets: [{ format: texture.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      this.mipmapPipelines.set(texture.format, pipeline);
    }
    if (texture.irisMipGPU !== texture.gpu) {
      texture.irisMipGPU = texture.gpu;
      texture.irisMipGroups = new Map();
    }
    const last = Math.min(texture.levels - 1, texture.params.get(this.TEXTURE_MAX_LEVEL) ?? 1000);
    for (let level = 1; level <= last; level++) {
      const width = Math.max(1, texture.width >> level),
        height = Math.max(1, texture.height >> level);
      let group = texture.irisMipGroups.get(level);
      if (!group) {
        const entries = [{ binding: 0, resource: this.view(texture, level - 1, 1) }];
        if (filterable) {
          this.irisMipDimensions ??= new Map();
          const key = width + ',' + height;
          let dimensions = this.irisMipDimensions.get(key);
          if (!dimensions) {
            dimensions = this.device.createBuffer({
              label: 'Persistent mip dimensions',
              size: 16,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(dimensions, 0, new Float32Array([width, height, 0, 0]));
            this.irisMipDimensions.set(key, dimensions);
          }
          entries.push({ binding: 1, resource: this.utilitySampler }, { binding: 2, resource: { buffer: dimensions } });
        }
        group = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
        texture.irisMipGroups.set(level, group);
      }
      const pass = this.beginRender({
        label: 'Mip ' + level,
        colorAttachments: [
          { view: this.view(texture, level, 1), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    }
    texture.version++;
  };
  p.rawDepth = function (texture) {
    if (!texture.isDepth) return texture;
    if (!texture.raw) {
      texture.raw = this.createTexture();
      this.allocateTexture(texture.raw, texture.width, texture.height, 1, this.rawDepthFormat, 1);
    }
    if (texture.rawVersion !== texture.version) {
      this.endPass();
      const pass = this.beginRender({
        label: 'Depth snapshot sample view',
        colorAttachments: [
          { view: this.view(texture.raw), loadOp: 'clear', clearValue: [1, 0, 0, 1], storeOp: 'store' },
        ],
      });
      if (texture.irisDepthGPU !== texture.gpu) {
        texture.irisDepthGPU = texture.gpu;
        texture.irisDepthGroup = this.device.createBindGroup({
          layout: this.depthCopyPipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: this.view(texture, 0, 1) }],
        });
      }
      pass.setPipeline(this.depthCopyPipeline);
      pass.setBindGroup(0, texture.irisDepthGroup);
      pass.draw(3);
      pass.end();
      texture.rawVersion = texture.version;
    }
    return texture.raw;
  };
}

function gbInstallFrameBatching(Renderer) {
  const p = Renderer.prototype;
  const blit = p.blitFramebuffer;
  p.blitFramebuffer = function (sx, sy, ex, ey, dx, dy, fx, fy, mask) {
    if (mask === this.DEPTH_BUFFER_BIT) {
      this.endPass();
      const src = this.fbo(this.READ_FRAMEBUFFER).depth,
        dst = this.fbo().depth;
      if (
        src &&
        dst &&
        sx === 0 &&
        sy === 0 &&
        dx === 0 &&
        dy === 0 &&
        ex === src.width &&
        ey === src.height &&
        fx === dst.width &&
        fy === dst.height &&
        src.width === dst.width &&
        src.height === dst.height
      ) {
        const prior = dst.irisDepthSource;
        if (
          prior &&
          prior.source === src.gpu &&
          prior.destination === dst.gpu &&
          prior.sourceVersion === src.version &&
          prior.destinationVersion === dst.version
        )
          return;
        const result = blit.apply(this, arguments);
        dst.irisDepthSource = {
          source: src.gpu,
          destination: dst.gpu,
          sourceVersion: src.version,
          destinationVersion: dst.version,
        };
        return result;
      }
    }
    return blit.apply(this, arguments);
  };
  p.bindUniforms = function (program) {
    if (!program.bindings.some(b => b.group === 0)) return null;
    if (program.lastUniformFrame !== this.frame || program.lastUniformRevision !== program.revision) {
      const alignment = this.device.limits.minUniformBufferOffsetAlignment;
      this.uniformCursor = Math.ceil(this.uniformCursor / alignment) * alignment;
      if (this.uniformCursor + program.uniformSize > this.uniformArena.size)
        throw new Error('WebGPU Uniform-Speicher fÃ¼r diesen Frame ist voll.');
      program.uniformOffset = this.uniformCursor;
      this.uniformCursor += program.uniformSize;
      this.irisUniformBytes ??= new Uint8Array(this.uniformArena.size);
      this.irisUniformBytes.set(new Uint8Array(program.uniformData), program.uniformOffset);
      this.irisUniformStart = Math.min(this.irisUniformStart ?? Infinity, program.uniformOffset);
      this.irisUniformEnd = Math.max(this.irisUniformEnd || 0, this.uniformCursor);
      program.lastUniformFrame = this.frame;
      program.lastUniformRevision = program.revision;
    }
    program.uniformGroup ??= this.device.createBindGroup({
      label: program.label + ' uniform snapshot',
      layout: program.uniformLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
    });
    return program.uniformGroup;
  };
  const submit = p.submit;
  p.submit = function () {
    this.endPass();
    if (this.irisUniformEnd) {
      const start = this.irisUniformStart,
        end = this.irisUniformEnd;
      this.device.queue.writeBuffer(this.uniformArena, start, this.irisUniformBytes, start, end - start);
      this.irisUniformStart = Infinity;
      this.irisUniformEnd = 0;
    }
    return submit.call(this);
  };
}

function gbDirectDepthArtifact(artifact) {
  const candidates = artifact.samplers.filter(
    s => s.type === 'sampler2D' && /^(?:depthtex[012]|gdepthtex|shadowtex[012]|shadow|watershadow)$/.test(s.name),
  );
  const stages = ['vertex', 'fragment', 'compute'],
    names = new Set(),
    bindings = new Set();
  const sources = stages
    .map(s => artifact[s] || '')
    .concat(artifact.computeVariants?.map(v => v.compute) || [], artifact.vertexCompute?.code || '');
  for (const sampler of candidates) {
    const vars = new Set();
    for (const code of sources)
      for (const match of code.matchAll(/@group\(1\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*texture_2d<f32>\s*;/g))
        if (Number(match[1]) === sampler.binding) vars.add(match[2]);
    if (!vars.size) continue;
    let supported = true;
    for (const code of sources)
      for (const variable of vars) {
        const uses = [...code.matchAll(new RegExp('\\b' + variable + '\\b', 'g'))].length;
        const known = [
          ...code.matchAll(
            new RegExp(
              '(?:var\\s+|texture(?:Load|Sample|SampleLevel|Dimensions|NumLevels|NumSamples)\\(\\s*)' +
                variable +
                '\\b',
              'g',
            ),
          ),
        ].length;
        if (uses !== known) supported = false;
      }
    if (supported) {
      for (const variable of vars) names.add(variable);
      bindings.add(sampler.binding);
    }
  }
  if (!names.size) return artifact;
  const convert = code => {
    if (!code) return code;
    code = code.replace(/(var\s+(\w+)\s*:\s*)texture_2d<f32>(\s*;)/g, (all, start, name, end) =>
      names.has(name) ? start + 'texture_depth_2d' + end : all,
    );
    const calls = /\b(textureLoad|textureSample|textureSampleLevel)\(\s*(\w+)\s*,/g;
    let match,
      out = '',
      at = 0;
    while ((match = calls.exec(code))) {
      if (!names.has(match[2])) continue;
      const open = code.indexOf('(', match.index);
      let depth = 1,
        end = open + 1;
      for (; end < code.length && depth; end++) {
        if (code[end] === '(') depth++;
        else if (code[end] === ')') depth--;
      }
      if (depth) throw new Error('Unclosed depth texture access');
      let access = code.slice(match.index, end);
      if (match[1] === 'textureSampleLevel') {
        const args = [];
        let nested = 0,
          from = open + 1;
        for (let i = open + 1; i < end - 1; i++) {
          const c = code[i];
          if (c === '(' || c === '<') nested++;
          else if (c === ')' || c === '>') nested--;
          else if (c === ',' && !nested) {
            args.push(code.slice(from, i));
            from = i + 1;
          }
        }
        args.push(code.slice(from, end - 1));
        if (args.length >= 4) args[3] = 'i32(' + args[3].trim() + ')';
        access = code.slice(match.index, open + 1) + args.join(',') + ')';
      }
      out += code.slice(at, match.index) + 'vec4<f32>(' + access + ',0.0,0.0,1.0)';
      at = end;
      calls.lastIndex = end;
    }
    return out + code.slice(at);
  };
  const layout = list =>
    list.map(b =>
      b.group === 1 && bindings.has(b.binding) && b.type === 'texture_2d<f32>' ? { ...b, type: 'texture_depth_2d' } : b,
    );
  for (const stage of stages) if (artifact[stage]) artifact[stage] = convert(artifact[stage]);
  artifact.bindings = layout(artifact.bindings);
  if (artifact.vertexCompute)
    artifact.vertexCompute = {
      ...artifact.vertexCompute,
      code: convert(artifact.vertexCompute.code),
      bindings: layout(artifact.vertexCompute.bindings),
    };
  if (artifact.computeVariants)
    artifact.computeVariants = artifact.computeVariants.map(v => ({
      ...v,
      compute: convert(v.compute),
      bindings: layout(v.bindings),
    }));
  artifact.irisDirectDepth = [...bindings];
  return artifact;
}

function gbInstallUniformReuse(Renderer) {
  const p = Renderer.prototype;
  if (p.irisUniformReuseInstalled) return;
  p.irisUniformReuseInstalled = true;
  const count = (renderer, key, n = 1) => {
    const s = (renderer.irisBackendStats ??= {});
    s[key] = (s[key] || 0) + n;
  };
  const mix = (bits, offset) => {
    let n = (bits ^ Math.imul(offset + 1, 0x9e3779b1)) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    return (n ^ (n >>> 13)) >>> 0;
  };
  p.writeUniform = function (location, values) {
    if (!location) return;
    const { program, field, sampler, index } = location;
    if (sampler) {
      const old = program.values.get(sampler.name);
      if (old && old.length === values.length && old.every((v, i) => Object.is(v, values[i]))) {
        count(this, 'uniformWritesSkipped');
        return;
      }
      program.values.set(sampler.name, Array.from(values));
      program.revision++;
      program.valuesRevision = (program.valuesRevision || 0) + 1;
      count(this, 'uniformWrites');
      return;
    }
    const integer = /^(?:int|uint|bool|[biu]vec)/.test(field.type),
      view = program.dataView,
      perElement = field.columns * field.rows;
    let changed = false,
      hash = program.irisUniformHash || 0;
    for (let i = 0; i < values.length; i++) {
      const element = index + Math.floor(i / perElement);
      if (element >= field.count) break;
      const component = i % perElement,
        column = Math.floor(component / field.rows),
        row = component % field.rows,
        offset = field.offset + element * field.stride + (field.columns > 1 ? column * 16 + row * 4 : row * 4);
      const number = Number(values[i]) || 0,
        value = integer ? number | 0 : Math.fround(number);
      if (Object.is(integer ? view.getInt32(offset, true) : view.getFloat32(offset, true), value)) continue;
      const before = view.getUint32(offset, true);
      if (integer) view.setInt32(offset, value, true);
      else view.setFloat32(offset, value, true);
      hash ^= mix(before, offset) ^ mix(view.getUint32(offset, true), offset);
      changed = true;
    }
    if (changed) {
      program.irisUniformHash = hash >>> 0;
      program.revision++;
      count(this, 'uniformWrites');
    } else count(this, 'uniformWritesSkipped');
  };
  const bind = p.bindUniforms;
  p.bindUniforms = function (program) {
    if (!program.bindings.some(b => b.group === 0)) return null;
    if (program.lastUniformFrame === this.frame && program.lastUniformRevision === program.revision)
      return bind.call(this, program);
    if (program.irisVariantFrame !== this.frame) {
      program.irisVariantFrame = this.frame;
      program.irisUniformVariants = new Map();
      program.irisVariantCount = 0;
    }
    const hash = program.irisUniformHash || 0,
      words = new Uint32Array(program.uniformData),
      variants = program.irisUniformVariants.get(hash) || [];
    for (const entry of variants) {
      let equal = entry.words.length === words.length;
      for (let i = 0; equal && i < words.length; i++) if (entry.words[i] !== words[i]) equal = false;
      if (equal) {
        program.uniformOffset = entry.offset;
        program.lastUniformFrame = this.frame;
        program.lastUniformRevision = program.revision;
        count(this, 'uniformSnapshotsReused');
        return program.uniformGroup;
      }
    }
    const group = bind.call(this, program);
    count(this, 'uniformSnapshots');
    count(this, 'uniformSnapshotBytes', program.uniformSize);
    if (program.irisVariantCount < 32) {
      variants.push({
        offset: program.uniformOffset,
        words: new Uint32Array(this.irisUniformBytes.buffer, program.uniformOffset, program.uniformSize / 4),
      });
      program.irisUniformVariants.set(hash, variants);
      program.irisVariantCount++;
    }
    return group;
  };
  const begin = p.beginFrame;
  p.beginFrame = function () {
    const result = begin.apply(this, arguments);
    this.irisBackendStats = {
      uniformWrites: 0,
      uniformWritesSkipped: 0,
      uniformSnapshots: 0,
      uniformSnapshotsReused: 0,
      uniformSnapshotBytes: 0,
    };
    return result;
  };
}

function gbInstallAsyncPipelines(Renderer) {
  const p = Renderer.prototype;
  if (p.irisAsyncPipelinesInstalled) return;
  p.irisAsyncPipelinesInstalled = true;
  function state(renderer) {
    return (renderer.irisAsyncPipelines ??= {
      pending: 0,
      created: 0,
      failed: 0,
      maxMs: 0,
      lastError: null,
      frameMiss: false,
      presented: false,
    });
  }
  p.irisRequestPipeline = function (program, key, descriptor) {
    const ready = program.pipelines.get(key);
    if (ready) return ready;
    const s = state(this);
    s.frameMiss = true;
    s.presented = false;
    const jobs = (program.irisPipelineJobs ??= new Map());
    if (jobs.has(key)) return null;
    const started = performance.now();
    s.pending++;
    jobs.set(key, true);
    Promise.resolve()
      .then(() => this.device.createRenderPipelineAsync(descriptor))
      .then(
        pipeline => {
          program.pipelines.set(key, pipeline);
          s.created++;
        },
        error => {
          s.failed++;
          s.lastError = String(error?.message || error);
          this.fault = error instanceof Error ? error : new Error(s.lastError);
          this.onStatus?.('WebGPU: ' + s.lastError, 'bad');
        },
      )
      .finally(() => {
        s.pending--;
        s.maxMs = Math.max(s.maxMs, performance.now() - started);
      });
    return null;
  };
  const begin = p.beginFrame,
    end = p.endFrame;
  p.beginFrame = function () {
    state(this).frameMiss = false;
    return begin.apply(this, arguments);
  };
  p.endFrame = function () {
    const s = state(this),
      complete = !s.frameMiss && !s.pending && !this.fault;
    const result = end.apply(this, arguments);
    if (complete) s.presented = true;
    return result;
  };
}

const gbShaderZipEntries = new WeakMap();
async function gbPrepareShaderZip(zip) {
  const paths = Object.keys(zip.files),
    binary = /\.(?:png|jpe?g|gif|bmp|tga|dds|ktx|ogg|wav|mp3|zip|jar|ttf|otf|ico|webp|bin|exe|dll)$/i;
  const sources = [],
    budget = { bytes: 0, full: false };
  for (const path of paths) {
    const entry = zip.files[path];
    if (entry.dir || !/(?:^|\/)shaders\//.test(path) || binary.test(path)) continue;
    if (!gbShaderZipEntries.has(entry)) {
      const original = entry.async;
      let text = null;
      entry.async = function (type) {
        if (type !== 'string' && type !== 'text') return original.apply(this, arguments);
        if (!text) {
          text = original.call(this, 'string');
          text.then(
            value => {
              const bytes = value.length * 2;
              if (budget.bytes + bytes > 64 * 1024 * 1024) {
                budget.full = true;
                text = null;
              } else budget.bytes += bytes;
            },
            () => {
              text = null;
            },
          );
        }
        return text;
      };
      gbShaderZipEntries.set(entry, true);
    }
    sources.push(entry);
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, sources.length) }, async () => {
      while (next < sources.length && !budget.full) {
        const entry = sources[next++];
        try {
          await entry.async('string');
        } catch {}
      }
    }),
  );
  return zip;
}

function gbInstallShaderModuleCache(Renderer) {
  const p = Renderer.prototype;
  if (p.irisShaderModuleCacheInstalled) return;
  p.irisShaderModuleCacheInstalled = true;
  p.irisShaderModule = function (descriptor) {
    descriptor = { ...descriptor, code: wgpuRewriteWgsl(descriptor.code) };
    if (descriptor.compilationHints) return this.device.createShaderModule(descriptor);
    const cache = (this.irisShaderModules ??= new Map()),
      key = descriptor.code;
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const module = this.device.createShaderModule(descriptor);
    if (key.length > 8 * 1024 * 1024) return module;
    cache.set(key, module);
    this.irisShaderModuleBytes = (this.irisShaderModuleBytes || 0) + key.length * 2;
    while (cache.size > 48 || this.irisShaderModuleBytes > 48 * 1024 * 1024) {
      const first = cache.keys().next().value;
      this.irisShaderModuleBytes -= first.length * 2;
      cache.delete(first);
    }
    return module;
  };
  p.irisShaderInfo = function (module) {
    const cache = (this.irisShaderInfos ??= new WeakMap());
    if (!cache.has(module)) {
      const info = module.getCompilationInfo();
      cache.set(module, info);
      info.catch(() => cache.delete(module));
    }
    return cache.get(module);
  };
}

const gbShaderInfoCache = new WeakMap();
function gbShaderModuleInfo(module) {
  if (!gbShaderInfoCache.has(module)) {
    const info = module.getCompilationInfo();
    gbShaderInfoCache.set(module, info);
    info.catch(() => gbShaderInfoCache.delete(module));
  }
  return gbShaderInfoCache.get(module);
}

function gbInstallGpuSampling(Renderer) {
  const p = Renderer.prototype;
  if (p.irisGpuSamplingInstalled) return;
  p.irisGpuSamplingInstalled = true;
  const begin = p.beginFrame,
    end = p.endFrame;
  p.beginFrame = function () {
    if (
      !this.profiling &&
      performance.now() >= (this.irisNextGpuSample || 0) &&
      this.device.features.has('timestamp-query')
    ) {
      this.irisAutoGpuSample = this.setProfiling(true);
      if (this.irisAutoGpuSample) this.profileStats.clear();
    }
    return begin.apply(this, arguments);
  };
  p.endFrame = function () {
    try {
      return end.apply(this, arguments);
    } finally {
      if (this.irisAutoGpuSample) {
        this.irisAutoGpuSample = false;
        this.setProfiling(false);
        this.irisGpuSampledAt = performance.now();
        this.irisNextGpuSample = this.irisGpuSampledAt + 3000;
      }
    }
  };
}

if (GB.config.rendererOptimizations) {
  GB.hooks.prepareShaderZip = gbPrepareShaderZip;
  GB.hooks.shaderModuleInfo = gbShaderModuleInfo;
}
function wgpuRewriteWgsl(code) {
  code = wgpuZeroProducts(code);
  // gl drivers (nvidia at least) give per pixel derivatives, plain dpdx may be one value per 2x2 quad.
  // caustics from dFdx areas (noble) turn into staircases with the coarse ones
  code = code.replace(/\b(dpdx|dpdy|fwidth)\s*\(/g, '$1Fine(');
  if (/\b(?:NaNf|inff)\b/.test(code)) code = wgpuNonFiniteLiterals(code);
  if (/\bfn wgpuSg_/.test(code)) code = wgpuRealSubgroupsWgsl(code);
  if (/\bWgpuSharedSpill\b/.test(code))
    code = code.replace(/\bworkgroupBarrier\s*\(\s*\)/g, 'storageBarrier(); workgroupBarrier()');
  return code;
}
