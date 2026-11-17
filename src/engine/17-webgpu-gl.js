// fake webgl on top of webgpu, rest of the engine thinks its talkin to gl. pipelines get cached by state
class IrisWebGPU {
  irisShaderModule(descriptor) {
    descriptor = { ...descriptor, code: wgpuRewriteWgsl(descriptor.code) };
    return this.device.createShaderModule(descriptor);
  }
  static async create(canvas, compilerSource, onStatus) {
    if (!navigator.gpu)
      throw new Error('WebGPU ist nicht verfügbar. Öffne die Datei in einem Browser mit WebGPU oder über localhost.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Kein WebGPU-Adapter verfügbar.');
    const wanted = [
      ...(GB.config.rendererOptimizations ? ['shader-f16'] : []),
      'subgroups',
      'float32-filterable',
      'float32-blendable',
      'rg11b10ufloat-renderable',
      'texture-formats-tier1',
      'texture-formats-tier2',
      'timestamp-query',
      'primitive-index',
    ];
    const requiredFeatures = wanted.filter(feature => adapter.features.has(feature));
    const requiredLimits = {};
    for (const key of [
      'maxTextureDimension2D',
      'maxTextureDimension3D',
      'maxColorAttachments',
      'maxColorAttachmentBytesPerSample',
      'maxSampledTexturesPerShaderStage',
      'maxSamplersPerShaderStage',
      'maxInterStageShaderVariables',
      'maxVertexAttributes',
      'maxVertexBuffers',
      'maxBindingsPerBindGroup',
      'maxStorageBufferBindingSize',
      'maxBufferSize',
      'maxStorageBuffersPerShaderStage',
      'maxStorageTexturesPerShaderStage',
      'maxComputeWorkgroupStorageSize',
      'maxComputeInvocationsPerWorkgroup',
      'maxComputeWorkgroupSizeX',
      'maxComputeWorkgroupSizeY',
      'maxComputeWorkgroupSizeZ',
      'maxComputeWorkgroupsPerDimension',
      'maxBindGroups',
    ])
      if (key in adapter.limits) requiredLimits[key] = adapter.limits[key];
    const device = await adapter.requestDevice({ label: 'GBufferd', requiredFeatures, requiredLimits });
    globalThis.wgpuHasSubgroups = device.features.has('subgroups');
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('Der Canvas konnte keinen WebGPU-Kontext erstellen.');
    gbInstallAsyncPipelines(IrisWebGPU);
    if (GB.config.rendererOptimizations) {
      gbInstallRendererPerformance(IrisWebGPU);
      gbInstallFrameBatching(IrisWebGPU);
      gbInstallUniformReuse(IrisWebGPU);
      gbInstallAsyncPipelines(IrisWebGPU);
      gbInstallShaderModuleCache(IrisWebGPU);
      gbInstallGpuSampling(IrisWebGPU);
    }
    return new IrisWebGPU(canvas, device, context, compilerSource, onStatus);
  }
  constructor(canvas, device, context, compilerSource, onStatus) {
    Object.assign(this, {
      NONE: 0,
      NO_ERROR: 0,
      ZERO: 0,
      ONE: 1,
      FLOAT: 5126,
      HALF_FLOAT: 5131,
      BYTE: 5120,
      UNSIGNED_BYTE: 5121,
      UNSIGNED_SHORT: 5123,
      UNSIGNED_INT: 5125,
      UNSIGNED_INT_10F_11F_11F_REV: 35899,
      RGBA: 6408,
      RGB: 6407,
      RGBA_INTEGER: 36249,
      DEPTH_COMPONENT: 6402,
      RGBA8: 32856,
      RGB8: 32849,
      RGBA8UI: 36220,
      RGBA16F: 34842,
      RGB16F: 34843,
      R11F_G11F_B10F: 35898,
      RGB8_SNORM: 36758,
      RGBA8_SNORM: 36759,
      R16: 33322,
      RG16: 33324,
      RGB16: 32852,
      RGBA16: 32859,
      RED: 6403,
      RG: 33319,
      R8: 33321,
      RG8: 33323,
      R8_SNORM: 36756,
      RG8_SNORM: 36757,
      R16F: 33325,
      RG16F: 33327,
      R32F: 33326,
      RG32F: 33328,
      RGB32F: 34837,
      RGBA32F: 34836,
      RGB10_A2: 32857,
      UNSIGNED_INT_2_10_10_10_REV: 33640,
      INT: 5124,
      RED_INTEGER: 36244,
      RG_INTEGER: 33320,
      RGB_INTEGER: 36248,
      R8UI: 33330,
      R16UI: 33332,
      R32UI: 33334,
      RG8UI: 33336,
      RG16UI: 33338,
      RG32UI: 33340,
      RGB8UI: 36221,
      RGB16UI: 36215,
      RGB32UI: 36209,
      RGBA16UI: 36214,
      RGBA32UI: 36208,
      R8I: 33329,
      R16I: 33331,
      R32I: 33333,
      RG8I: 33335,
      RG16I: 33337,
      RG32I: 33339,
      RGB8I: 36239,
      RGB16I: 36233,
      RGB32I: 36227,
      RGBA8I: 36238,
      RGBA16I: 36232,
      RGBA32I: 36226,
      DEPTH_COMPONENT16: 33189,
      DEPTH_COMPONENT24: 33190,
      DEPTH_ATTACHMENT: 36096,
      COLOR_ATTACHMENT0: 36064,
      FRAMEBUFFER: 36160,
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      FRAMEBUFFER_COMPLETE: 36053,
      RENDERBUFFER: 36161,
      TEXTURE_2D: 3553,
      TEXTURE_3D: 32879,
      TEXTURE0: 33984,
      TEXTURE_MIN_FILTER: 10241,
      TEXTURE_MAG_FILTER: 10240,
      TEXTURE_WRAP_S: 10242,
      TEXTURE_WRAP_T: 10243,
      TEXTURE_WRAP_R: 32882,
      TEXTURE_BASE_LEVEL: 33084,
      TEXTURE_MAX_LEVEL: 33085,
      TEXTURE_COMPARE_MODE: 34892,
      TEXTURE_COMPARE_FUNC: 34893,
      COMPARE_REF_TO_TEXTURE: 34894,
      LEQUAL: 515,
      NEAREST: 9728,
      LINEAR: 9729,
      NEAREST_MIPMAP_LINEAR: 9986,
      LINEAR_MIPMAP_LINEAR: 9987,
      NEAREST_MIPMAP_NEAREST: 9984,
      LINEAR_MIPMAP_NEAREST: 9985,
      REPEAT: 10497,
      CLAMP_TO_EDGE: 33071,
      MIRRORED_REPEAT: 33648,
      UNPACK_FLIP_Y_WEBGL: 37440,
      UNPACK_ALIGNMENT: 3317,
      ARRAY_BUFFER: 34962,
      ELEMENT_ARRAY_BUFFER: 34963,
      STATIC_DRAW: 35044,
      TRIANGLES: 4,
      COLOR: 6144,
      DEPTH: 6145,
      COLOR_BUFFER_BIT: 16384,
      DEPTH_BUFFER_BIT: 256,
      DEPTH_TEST: 2929,
      CULL_FACE: 2884,
      BLEND: 3042,
      BACK: 1029,
      FRONT: 1028,
      FUNC_ADD: 32774,
      SRC_ALPHA: 770,
      ONE_MINUS_SRC_ALPHA: 771,
      ACTIVE_UNIFORMS: 35718,
      MAX_DRAW_BUFFERS: 34852,
      MAX_COLOR_ATTACHMENTS: 36063,
      MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
      SAMPLER_2D: 35678,
      SAMPLER_2D_SHADOW: 35682,
      SAMPLER_3D: 35679,
      UNSIGNED_INT_SAMPLER_2D: 36306,
      UNSIGNED_INT_SAMPLER_3D: 36307,
      INT_SAMPLER_2D: 36298,
      INT_SAMPLER_3D: 36299,
    });
    for (let i = 1; i < 8; i++) this['COLOR_ATTACHMENT' + i] = this.COLOR_ATTACHMENT0 + i;
    Object.assign(this, {
      canvas,
      device,
      context,
      onStatus,
      backend: 'webgpu',
      nextId: 1,
      frame: 0,
      targetEpoch: 1,
      activeUnit: 0,
      units: [],
      enabled: new Set(),
      blendOff: new Set(),
      blendOverrides: new Map(),
      depthWrite: true,
      cull: this.BACK,
      clearRGBA: [0, 0, 0, 0],
      clearZ: 1,
      viewportState: [0, 0, 1, 1],
      readFBO: null,
      drawFBO: null,
      vao: null,
      program: null,
      encoder: null,
      pass: null,
      uniformCursor: 0,
      pipelines: new Map(),
      samplerCache: new Map(),
      retired: [],
      fault: null,
    });
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: this.canvasFormat, alphaMode: 'opaque', colorSpace: 'srgb' });
    this.defaultFBO = this.createFramebuffer();
    this.defaultFBO.buffers = [this.COLOR_ATTACHMENT0];
    this.uniformArena = device.createBuffer({
      label: 'Frame uniform arena',
      size: 8 * 1024 * 1024,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.defaultAttribute = device.createBuffer({
      label: 'Default vertex attribute',
      size: 16,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.defaultAttribute, 0, new Float32Array([0, 0, 0, 1]));
    this.defaultIntegerAttribute = device.createBuffer({
      label: 'Default integer vertex attribute',
      size: 16,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.defaultIntegerAttribute, 0, new Int32Array([0, 0, 0, 1]));
    this.shaderCompiler = new WebGPUShaderCompilerPool(compilerSource, onStatus);
    this.faults = [];
    device.addEventListener('uncapturederror', event => {
      this.fault = event.error;
      const message = event.error.message;
      if (this.faults.length < 12 && !this.faults.includes(message)) this.faults.push(message);
      onStatus('WebGPU: ' + message, 'bad');
    });
    device.lost.then(info => {
      this.fault = new Error(info.message);
      onStatus('WebGPU-Gerät verloren: ' + (info.message || info.reason) + '. Bitte die Seite neu laden.', 'bad');
    });
    this.customImages = new Map();
    this.samplerImages = new Map();
    this.storageBuffers = new Map();
    this.pendingVertexCompute = [];
    this.clearPipelines = new Map();
    this.emptyLayout = device.createBindGroupLayout({ label: 'Empty', entries: [] });
    this.emptyGroup = device.createBindGroup({ layout: this.emptyLayout, entries: [] });
    this.initUtilityPipelines();
  }
  setProfiling(enabled) {
    if (!enabled && this.viewerMonitoring) return true;
    if (enabled === this.profiling) return true;
    if (enabled && !this.device.features.has('timestamp-query')) return false;
    this.profiling = enabled;
    if (enabled && !this.querySet) {
      this.querySet = this.device.createQuerySet({ type: 'timestamp', count: 512 });
      this.queryResolve = this.device.createBuffer({
        size: 512 * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.queryReadbacks = [];
      this.profileStats = new Map();
    }
    this.queryLabels = [];
    return true;
  }
  timestampWrites(label) {
    if (!this.profiling || this.queryLabels.length >= 255) return undefined;
    const index = this.queryLabels.length * 2;
    this.queryLabels.push(label);
    return { querySet: this.querySet, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 };
  }
  beginRender(descriptor) {
    const timestampWrites = this.timestampWrites(descriptor.label || 'Render');
    return this.commandEncoder().beginRenderPass(timestampWrites ? { ...descriptor, timestampWrites } : descriptor);
  }
  beginCompute(descriptor) {
    const timestampWrites = this.timestampWrites(descriptor.label || 'Compute');
    return this.commandEncoder().beginComputePass(timestampWrites ? { ...descriptor, timestampWrites } : descriptor);
  }
  timedCopy(label, copy) {
    if (!this.profiling || this.queryLabels.length >= 255) {
      copy();
      return;
    }
    const index = this.queryLabels.length * 2;
    this.queryLabels.push(label);
    this.commandEncoder()
      .beginComputePass({ timestampWrites: { querySet: this.querySet, endOfPassWriteIndex: index } })
      .end();
    copy();
    this.commandEncoder()
      .beginComputePass({ timestampWrites: { querySet: this.querySet, beginningOfPassWriteIndex: index + 1 } })
      .end();
  }
  resolveProfile() {
    if (!this.profiling || !this.queryLabels.length) return;
    const count = this.queryLabels.length * 2,
      labels = this.queryLabels;
    this.queryLabels = [];
    const readback =
      this.queryReadbacks.pop() ||
      this.device.createBuffer({ size: 512 * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = this.commandEncoder();
    encoder.resolveQuerySet(this.querySet, 0, count, this.queryResolve, 0);
    encoder.copyBufferToBuffer(this.queryResolve, 0, readback, 0, count * 8);
    this.pendingProfile = { readback, labels, count };
  }
  collectProfile() {
    const pending = this.pendingProfile;
    this.pendingProfile = null;
    if (!pending) return;
    pending.readback
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const times = new BigInt64Array(pending.readback.getMappedRange(0, pending.count * 8)),
          frame = new Map();
        for (let i = 0; i < pending.labels.length; i++) {
          const ms = Number(times[i * 2 + 1] - times[i * 2]) / 1e6;
          if (ms >= 0 && ms < 10000) frame.set(pending.labels[i], (frame.get(pending.labels[i]) || 0) + ms);
        }
        pending.readback.unmap();
        this.queryReadbacks.push(pending.readback);
        for (const [label, ms] of frame) {
          const prior = this.profileStats.get(label);
          this.profileStats.set(label, prior === undefined ? ms : prior * 0.9 + ms * 0.1);
        }
        for (const label of this.profileStats.keys())
          if (!frame.has(label)) this.profileStats.set(label, this.profileStats.get(label) * 0.9);
      })
      .catch(() => {});
  }
  profileReport() {
    return this.profileStats ? [...this.profileStats].filter(([, ms]) => ms > 0.005).sort((a, b) => b[1] - a[1]) : [];
  }
  getParameter(name) {
    if (name === this.MAX_DRAW_BUFFERS || name === this.MAX_COLOR_ATTACHMENTS)
      return this.device.limits.maxColorAttachments;
    if (name === this.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return this.device.limits.maxSampledTexturesPerShaderStage;
    return 0;
  }
  getExtension(name) {
    if (name === 'EXT_color_buffer_float') return {};
    if (name === 'EXT_render_snorm' && this.device.features.has('texture-formats-tier1')) return {};
    return null;
  }
  getError() {
    return this.NO_ERROR;
  }
  id() {
    return this.nextId++;
  }
  commandEncoder() {
    if (!this.encoder) {
      this.encoder = this.device.createCommandEncoder({ label: 'GBufferd frame ' + this.frame });
      if (!this.keepStorageSnapshots)
        for (const [index, snapshot] of this.storageSnapshots || []) {
          const source = this.storageBuffers.get(index);
          if (source) this.encoder.copyBufferToBuffer(source, 0, snapshot, 0, Math.min(source.size, snapshot.size));
        }
      this.keepStorageSnapshots = false;
    }
    return this.encoder;
  }
  storageSnapshot(index) {
    this.storageSnapshots ??= new Map();
    const source = this.storageBuffers.get(index);
    if (!source) return null;
    let snapshot = this.storageSnapshots.get(index);
    if (!snapshot || snapshot.size !== source.size) {
      if (snapshot) this.retire(snapshot);
      snapshot = this.device.createBuffer({
        label: 'SSBO ' + index + ' read copy',
        size: source.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.storageSnapshots.set(index, snapshot);
    }
    return snapshot;
  }
  endPass() {
    if (this.geometryBatch?.pass && this.geometryBatch.pass === this.pass) this.closeGeometryBatch();
    if (this.pass) {
      this.pass.end();
      this.pass = null;
      this.passKey = null;
      this.resetPassState();
    }
    if (this.pendingVertexCompute.length) this.flushVertexCompute();
  }
  resetPassState() {
    const state = (this.passState ??= {
      groups: [null, null, null, null],
      vertexBuffers: [],
      viewport: [NaN, NaN, NaN, NaN],
    });
    state.pipeline = null;
    state.groups[0] = state.groups[1] = state.groups[2] = state.groups[3] = null;
    state.vertexBuffers.length = 0;
    state.indexBuffer = null;
    state.indexFormat = null;
    state.dynamicOffset = -2;
    state.viewport[0] = state.viewport[1] = state.viewport[2] = state.viewport[3] = NaN;
  }
  submit() {
    this.endPass();
    if (this.geometryBatch) this.closeGeometryBatch();
    const pending = this.pendingCommandBuffers;
    this.pendingCommandBuffers = null;
    if (this.encoder || pending?.length) {
      const buffers = (pending || []).map(item => item.buffer || item);
      if (this.encoder) buffers.push(this.encoder.finish());
      this.device.queue.submit(buffers);
      this.encoder = null;
    }
    this.keepStorageSnapshots = false;
    const after = this.afterSubmit;
    this.afterSubmit = null;
    if (after) for (const run of after) run();
  }
  retire(resource) {
    if (resource) this.retired.push(resource);
  }
  beginFrame() {
    if (this.fault) throw this.fault;
    this.submit();
    if (this.profiling) this.queryLabels = [];
    this.textureStamp = (this.textureStamp || 0) + 1;
    this.frame++;
    this.uniformCursor = 0;
    this.drawCount = 0;
    this.cpuMarks = [];
    this.cpuStart = performance.now();
    if (this.viewerMonitoring) this.viewerCpuFrame = new Map();
    const retired = this.retired.splice(0);
    if (retired.length)
      this.device.queue.onSubmittedWorkDone().then(() => retired.forEach(resource => resource.destroy()));
    if (!this.output || this.output.width !== this.canvas.width || this.output.height !== this.canvas.height) {
      if (this.output) this.deleteTexture(this.output);
      this.output = this.createTexture();
      this.allocateTexture(this.output, this.canvas.width, this.canvas.height, 1, 'rgba8unorm', 1);
      this.defaultFBO.colors.set(0, { texture: this.output, level: 0 });
    }
  }
  endFrame() {
    this.endPass();
    if (!this.irisAsyncPipelines?.frameMiss) {
      GB.hooks.beforePresent(this);
      const pass = this.beginRender({
        label: 'WebGPU presentation',
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: [0, 0, 0, 1],
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(this.presentationPipeline);
      pass.setBindGroup(
        0,
        GB.config.rendererOptimizations
          ? this.irisPresentationGPU === this.output.gpu
            ? this.irisPresentationGroup
            : ((this.irisPresentationGPU = this.output.gpu),
              (this.irisPresentationGroup = this.device.createBindGroup({
                layout: this.presentationPipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: this.view(this.output, 0, 1) }],
              })))
          : this.device.createBindGroup({
              layout: this.presentationPipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: this.view(this.output, 0, 1) }],
            }),
      );
      pass.draw(3);
      pass.end();
    }
    this.resolveProfile();
    this.submit();
    this.collectProfile();
    this.cpuLast = { frame: performance.now() - this.cpuStart, marks: this.cpuMarks, draws: this.drawCount };
    if (this.viewerMonitoring) {
      this.viewerCpuStats ??= new Map();
      for (const [key, ms] of this.viewerCpuFrame) {
        const prior = this.viewerCpuStats.get(key);
        this.viewerCpuStats.set(key, prior === undefined ? ms : prior * 0.9 + ms * 0.1);
      }
      for (const key of this.viewerCpuStats.keys())
        if (!this.viewerCpuFrame.has(key)) this.viewerCpuStats.set(key, this.viewerCpuStats.get(key) * 0.9);
    }
    const id = (this.frameId = (this.frameId || 0) + 1);
    (this.inFlight ??= new Map()).set(id, performance.now());
    const submittedAt = performance.now(),
      submittedInFlight = this.inFlight.size,
      submittedFrame = this.frame;
    const done = () => {
      this.inFlight.delete(id);
      const elapsed = performance.now() - submittedAt,
        prior = this.irisCompletion;
      this.irisCompletion = {
        ms: prior ? prior.ms * 0.9 + elapsed * 0.1 : elapsed,
        maxMs: Math.max(prior?.maxMs || 0, elapsed),
        samples: (prior?.samples || 0) + 1,
      };
      if (GB.state.active) GB.hooks.resolutionSample(elapsed, submittedFrame, submittedInFlight);
    };
    this.device.queue.onSubmittedWorkDone().then(done, done);
  }
  halfSafeFragmentModule(program, formats) {
    const limits = formats.map(format =>
      /^(?:r|rg|rgba)16float$/.test(format || '') ? 65504 : format === 'rg11b10ufloat' ? 64512 : 0,
    );
    if (!limits.some(Boolean) || !program.fragment) return program.fragmentModule;
    const key = limits.join(','),
      cache = program.halfSafeModules || (program.halfSafeModules = new Map());
    if (!cache.has(key)) {
      const code = clampHalfFloatOutputs(program.fragment, limits);
      cache.set(
        key,
        code
          ? this.irisShaderModule({ label: program.label + ' fragment (half-float clamp)', code })
          : program.fragmentModule,
      );
    }
    return cache.get(key);
  }
  async createShaderProgram(vertex, fragment, label, forceFresh = false, options = {}) {
    vertex = lowerIrisCenterDepth(vertex);
    fragment = lowerIrisCenterDepth(fragment);
    if (options.compute) options = { ...options, compute: lowerIrisCenterDepth(options.compute) };
    const job = options.compute
      ? { kind: 'compute', compute: options.compute, formats: options.formats || {} }
      : {
          formats: options.formats || {},
          ...(options.geometry ? { geometry: options.geometry } : {}),
          ...(options.tessControl ? { tessControl: options.tessControl, tessEval: options.tessEval } : {}),
        };
    const translation = await this.shaderCompiler.translate(vertex, fragment, label, forceFresh, job);
    const originalArtifact = translation.artifact;
    const lower = code =>
      lowerUnfilterableColorSampling(
        lowerInfiniteLiterals(lowerDepthSampleLevel(lowerIndexableConstArrays(code))),
        originalArtifact.samplers,
        this.unfilterableTargets,
        originalArtifact.constants,
      );
    const compiled = { ...originalArtifact };
    for (const stage of ['vertex', 'fragment', 'compute'])
      if (compiled[stage]) compiled[stage] = lower(compiled[stage]);
    if (compiled.vertexCompute)
      compiled.vertexCompute = { ...compiled.vertexCompute, code: lower(compiled.vertexCompute.code) };
    if (compiled.geometry)
      compiled.geometry = {
        ...compiled.geometry,
        capture: { ...compiled.geometry.capture, code: lower(compiled.geometry.capture.code) },
        shader: { ...compiled.geometry.shader, code: lower(compiled.geometry.shader.code) },
      };
    for (const part of ['control', 'evaluation'])
      if (compiled.geometry?.[part])
        compiled.geometry = {
          ...compiled.geometry,
          [part]: { ...compiled.geometry[part], code: lower(compiled.geometry[part].code) },
        };
    if (compiled.computeVariants)
      compiled.computeVariants = compiled.computeVariants.map(variant => ({
        ...variant,
        compute: lower(variant.compute),
      }));
    if (compiled.kind !== 'compute') vertexStorageCopies(compiled);
    shareSamplers(
      compiled,
      this.device.limits.maxSamplersPerShaderStage,
      sampler =>
        (sampler?.type === 'sampler2D' &&
          ((/^(?:depthtex|gdepthtex$|shadowtex|shadow$|watershadow$|iris_centerDepthSmooth$|dhDepthTex)/.test(
            sampler.name,
          ) &&
            !this.device.features.has('float32-filterable')) ||
            this.unfilterableTargets?.has(sampler.name))) ||
        (sampler?.type === 'sampler3D' && this.unfilterableTargets?.has(sampler.name)) ||
        this.unfilterableImageSampler(sampler),
    );
    if (GB.config.rendererOptimizations) gbDirectDepthArtifact(compiled);
    const program = {
      ...compiled,
      id: this.id(),
      label,
      revision: 0,
      uniformData: new ArrayBuffer(compiled.uniformSize),
      values: new Map(),
      locations: new Map(),
      groups: new Map(),
      pipelines: new Map(),
    };
    const compute = compiled.kind === 'compute';
    if (compute && /\b(?:workgroupBarrier|storageBarrier|textureBarrier)\s*\(/.test(compiled.compute)) {
      const uniform = async code => {
        for (let round = 0; round < 48; round++) {
          this.device.pushErrorScope('validation');
          const probe = this.irisShaderModule({ label: label + ' uniformity probe', code });
          const info = await GB.hooks.shaderModuleInfo(probe);
          await this.device.popErrorScope();
          const fixed = wgpuBarrierUniformity(code, info.messages);
          if (!fixed) break;
          code = fixed;
        }
        return code;
      };
      compiled.compute = await uniform(compiled.compute);
      if (compiled.computeVariants)
        for (const variant of compiled.computeVariants) variant.compute = await uniform(variant.compute);
    }
    const modules = compute
      ? [
          [
            'Compute',
            (program.computeModule = this.irisShaderModule({ label: label + ' compute', code: compiled.compute })),
          ],
        ]
      : [
          [
            'Vertex',
            (program.vertexModule = this.irisShaderModule({ label: label + ' vertex', code: compiled.vertex })),
          ],
          [
            'Fragment',
            (program.fragmentModule = this.irisShaderModule({ label: label + ' fragment', code: compiled.fragment })),
          ],
        ];
    const parityModules =
      compute && compiled.computeVariants
        ? compiled.computeVariants.map(v =>
            this.irisShaderModule({ label: label + ' framemod2=' + v.parity, code: v.compute }),
          )
        : [];
    parityModules.forEach((module, i) =>
      modules.push(['Compute framemod2=' + compiled.computeVariants[i].parity, module]),
    );
    if (compiled.vertexCompute)
      modules.push([
        'Vertex-Schreibzugriffe',
        (program.vertexComputeModule = this.irisShaderModule({
          label: label + ' vertex writes',
          code: compiled.vertexCompute.code,
        })),
      ]);
    if (compiled.geometry)
      modules.push(
        [
          'Geometry-Vertex',
          (program.geometryCaptureModule = this.irisShaderModule({
            label: label + ' geometry capture',
            code: compiled.geometry.capture.code,
          })),
        ],
        [
          'Geometry',
          (program.geometryModule = this.irisShaderModule({
            label: label + ' geometry',
            code: compiled.geometry.shader.code,
          })),
        ],
      );
    if (compiled.geometry?.control)
      modules.push([
        'Tess-Control',
        (program.geometryControlModule = this.irisShaderModule({
          label: label + ' tess control',
          code: compiled.geometry.control.code,
        })),
      ]);
    if (compiled.geometry?.evaluation)
      modules.push([
        'Tess-Evaluation',
        (program.geometryEvaluationModule = this.irisShaderModule({
          label: label + ' tess evaluation',
          code: compiled.geometry.evaluation.code,
        })),
      ]);
    try {
      const results = await Promise.all(
        modules.map(async ([stage, module]) => ({ stage, info: await GB.hooks.shaderModuleInfo(module) })),
      );
      const stageSource = stage =>
        stage === 'Geometry'
          ? compiled.geometry.shader.code
          : stage === 'Geometry-Vertex'
            ? compiled.geometry.capture.code
            : /vertex/i.test(stage)
              ? compiled.vertex || ''
              : /fragment/i.test(stage)
                ? compiled.fragment || ''
                : compiled.compute || '';
      const errors = results.flatMap(({ stage, info }) =>
        info.messages
          .filter(m => m.type === 'error')
          .map(m => {
            const lines = stageSource(stage).split('\n'),
              at = Number(m.lineNum) || 0,
              around = [];
            for (let index = Math.max(1, at - 5); index <= Math.min(lines.length, at + 5); index++)
              around.push(
                '      ' +
                  (index === at ? '>' : ' ') +
                  ' ' +
                  index +
                  ': ' +
                  (index === at ? lines[index - 1] : lines[index - 1].slice(0, 200)),
              );
            return stage + ' ' + m.lineNum + ': ' + m.message + (around.length ? '\n' + around.join('\n') : '');
          }),
      );
      if (errors.length) throw new Error(label + ': ' + errors.join('\n'));
    } catch (error) {
      await this.shaderCompiler.forget(translation.key);
      if (translation.cached && !forceFresh) return this.createShaderProgram(vertex, fragment, label, true, options);
      throw error;
    }
    if (!translation.cached) void this.shaderCompiler.remember(translation.key, originalArtifact);
    program.dataView = new DataView(program.uniformData);
    program.activeSamplers = compiled.samplers.filter(s =>
      compiled.bindings.some(b => b.group === 1 && (b.binding === s.binding || b.binding === s.binding + 1)),
    );
    Object.assign(
      program,
      this.resourceLayouts(
        program,
        compiled.bindings,
        compute ? GPUShaderStage.COMPUTE : GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      ),
    );
    program.layout = this.device.createPipelineLayout({ label, bindGroupLayouts: program.groupLayouts });
    if (compute) {
      program.computePipeline = await this.device.createComputePipelineAsync({
        label,
        layout: program.layout,
        compute: { module: program.computeModule, entryPoint: compiled.computeEntry },
      });
    }
    if (parityModules.length) {
      program.parityVariants = await Promise.all(
        compiled.computeVariants.map(async (v, i) => {
          const variant = {
            label: label + ' (framemod2=' + v.parity + ')',
            samplers: compiled.samplers,
            images: compiled.images,
            uniformSize: compiled.uniformSize,
            groups: new Map(),
          };
          Object.assign(variant, this.resourceLayouts(variant, v.bindings, GPUShaderStage.COMPUTE));
          variant.activeSamplers = compiled.samplers.filter(s =>
            v.bindings.some(b => b.group === 1 && (b.binding === s.binding || b.binding === s.binding + 1)),
          );
          variant.layout = this.device.createPipelineLayout({
            label: variant.label,
            bindGroupLayouts: variant.groupLayouts,
          });
          variant.pipeline = await this.device.createComputePipelineAsync({
            label: variant.label,
            layout: variant.layout,
            compute: { module: parityModules[i], entryPoint: v.computeEntry },
          });
          return variant;
        }),
      );
      program.activeSamplers = [
        ...new Map(program.parityVariants.flatMap(v => v.activeSamplers).map(s => [s.name, s])).values(),
      ];
    }
    const vertexImages = compiled.vertexCompute?.bindings.filter(b => b.group === 2).length || 0;
    if (vertexImages > this.device.limits.maxStorageTexturesPerShaderStage) {
      console.warn(
        label +
          ': Vertex-Schreibzugriffe übersprungen, ' +
          vertexImages +
          ' Images > ' +
          this.device.limits.maxStorageTexturesPerShaderStage,
      );
    } else if (compiled.vertexCompute) {
      const vc = compiled.vertexCompute,
        variant = {
          label: label + ' vertex writes',
          samplers: compiled.samplers,
          images: compiled.images,
          uniformSize: compiled.uniformSize,
          groups: new Map(),
        };
      Object.assign(
        variant,
        this.resourceLayouts({ ...variant, label: variant.label }, vc.bindings, GPUShaderStage.COMPUTE, true),
      );
      variant.activeSamplers = compiled.samplers.filter(s =>
        vc.bindings.some(b => b.group === 1 && (b.binding === s.binding || b.binding === s.binding + 1)),
      );
      variant.layout = this.device.createPipelineLayout({
        label: variant.label,
        bindGroupLayouts: variant.groupLayouts,
      });
      variant.pipeline = await this.device.createComputePipelineAsync({
        label: variant.label,
        layout: variant.layout,
        compute: { module: program.vertexComputeModule, entryPoint: vc.entry },
      });
      variant.attributes = vc.attributes;
      program.vertexWrites = variant;
    }
    if (compiled.geometry) {
      const variantFor = async (part, module, name) => {
        const variant = {
          label: label + ' ' + name,
          samplers: compiled.samplers,
          images: compiled.images,
          uniformSize: compiled.uniformSize,
          groups: new Map(),
        };
        Object.assign(variant, this.resourceLayouts({ ...variant }, part.bindings, GPUShaderStage.COMPUTE, true));
        variant.activeSamplers = compiled.samplers.filter(s =>
          part.bindings.some(b => b.group === 1 && (b.binding === s.binding || b.binding === s.binding + 1)),
        );
        variant.layout = this.device.createPipelineLayout({
          label: variant.label,
          bindGroupLayouts: variant.groupLayouts,
        });
        variant.pipeline = await this.device.createComputePipelineAsync({
          label: variant.label,
          layout: variant.layout,
          compute: { module, entryPoint: part.entry },
        });
        return variant;
      };
      program.geometryCapture = await variantFor(
        compiled.geometry.capture,
        program.geometryCaptureModule,
        'geometry capture',
      );
      program.geometryShader = await variantFor(compiled.geometry.shader, program.geometryModule, 'geometry');
      if (compiled.geometry.control)
        program.geometryControl = await variantFor(
          compiled.geometry.control,
          program.geometryControlModule,
          'tess control',
        );
      if (compiled.geometry.evaluation)
        program.geometryEvaluation = await variantFor(
          compiled.geometry.evaluation,
          program.geometryEvaluationModule,
          'tess evaluation',
        );
    }
    const samplerTypes = {
      sampler2D: this.SAMPLER_2D,
      sampler2DShadow: this.SAMPLER_2D_SHADOW,
      sampler3D: this.SAMPLER_3D,
      usampler2D: this.UNSIGNED_INT_SAMPLER_2D,
      usampler3D: this.UNSIGNED_INT_SAMPLER_3D,
      isampler2D: this.INT_SAMPLER_2D,
      isampler3D: this.INT_SAMPLER_3D,
    };
    program.activeUniforms = [
      ...new Map(
        [
          ...program.activeSamplers,
          ...(program.vertexWrites?.activeSamplers || []),
          ...(program.geometryCapture?.activeSamplers || []),
          ...(program.geometryShader?.activeSamplers || []),
        ].map(s => [s.name, s]),
      ).values(),
    ].map(s => ({ name: s.name, type: samplerTypes[s.type], size: s.count }));
    return program;
  }
  resourceLayouts(program, bindings, uniformVisibility, vertexFetch = false) {
    const label = program.label,
      result = { bindings };
    result.uniformLayout = this.device.createBindGroupLayout({
      label: label + ' uniforms',
      entries: bindings.some(b => b.group === 0)
        ? [
            {
              binding: 0,
              visibility: uniformVisibility,
              buffer: {
                type: 'uniform',
                hasDynamicOffset: true,
                minBindingSize: program.uniformSize ?? program.uniformData?.byteLength,
              },
            },
          ]
        : [],
    });
    const textureEntries = bindings
      .filter(b => b.group === 1)
      .map(b => {
        const entry = { binding: b.binding, visibility: b.visibility };
        const sampler = program.samplers.find(s => s.binding === b.binding || s.binding + 1 === b.binding);
        const rawDepth =
          !this.device.features.has('float32-filterable') &&
          sampler?.type === 'sampler2D' &&
          (/^(?:depthtex|gdepthtex$|shadowtex|shadow$|watershadow$|iris_centerDepthSmooth$|dhDepthTex)/.test(
            sampler.name,
          ) ||
            label === 'Present');
        const unfiltered =
          rawDepth ||
          label === 'Present' ||
          ((sampler?.type === 'sampler2D' || sampler?.type === 'sampler3D') &&
            this.unfilterableTargets?.has(sampler.name));
        if (b.type === 'sampler_comparison') entry.sampler = { type: 'comparison' };
        else if (b.type === 'sampler')
          entry.sampler = {
            type:
              (GB.config.rendererOptimizations &&
                bindings.some(t => t.group === 1 && t.binding === b.binding - 1 && t.type.includes('depth'))) ||
              unfiltered ||
              this.unfilterableImageSampler(sampler)
                ? 'non-filtering'
                : 'filtering',
          };
        else
          entry.texture = {
            sampleType: b.type.includes('depth')
              ? 'depth'
              : b.type.includes('<u32>')
                ? 'uint'
                : b.type.includes('<i32>')
                  ? 'sint'
                  : unfiltered || this.unfilterableImageSampler(sampler)
                    ? 'unfilterable-float'
                    : 'float',
            viewDimension: b.type.includes('_3d') ? '3d' : b.type.includes('_2d_array') ? '2d-array' : '2d',
            multisampled: false,
          };
        return entry;
      });
    result.textureEntries = textureEntries;
    result.textureLayout = this.device.createBindGroupLayout({ label: label + ' textures', entries: textureEntries });
    const imageEntries = bindings
      .filter(b => b.group === 2)
      .map(b => {
        const match = b.type.match(/^texture_storage_(\w+)<\s*(\w+)\s*,\s*(\w+)\s*>$/);
        if (!match) throw new Error(label + ': Unbekannter Storage-Typ ' + b.type);
        return {
          binding: b.binding,
          visibility: b.visibility,
          storageTexture: {
            access: { write: 'write-only', read: 'read-only', read_write: 'read-write' }[match[3]],
            format: match[2],
            viewDimension: match[1].replace('_array', '-array'),
          },
        };
      });
    const bufferEntries = bindings
      .filter(b => b.group === 3)
      .map(b => ({
        binding: b.binding,
        source: b.source,
        snapshot: b.snapshot,
        visibility: b.visibility,
        buffer: {
          type: b.space === 'uniform' ? 'uniform' : b.space.includes('read_write') ? 'storage' : 'read-only-storage',
        },
      }));
    if (imageEntries.length)
      result.imageLayout = this.device.createBindGroupLayout({ label: label + ' images', entries: imageEntries });
    if (bufferEntries.length)
      result.bufferLayout = this.device.createBindGroupLayout({ label: label + ' buffers', entries: bufferEntries });
    result.imageEntries = imageEntries;
    result.bufferEntries = bufferEntries;
    result.groupLayouts = [result.uniformLayout, result.textureLayout];
    if (result.imageLayout || result.bufferLayout) result.groupLayouts.push(result.imageLayout || this.emptyLayout);
    if (result.bufferLayout) result.groupLayouts.push(result.bufferLayout);
    return result;
  }
  unfilterableImageSampler(sampler) {
    const image = sampler && this.samplerImages.get(sampler.name);
    return !!image && /32float$/.test(image.format) && !this.device.features.has('float32-filterable');
  }
  useProgram(program) {
    this.program = program;
  }
  deleteProgram(program) {
    if (program) {
      program.pipelines.clear();
      program.groups.clear();
    }
  }
  getProgramParameter(program, name) {
    return name === this.ACTIVE_UNIFORMS ? program.activeUniforms.length : 0;
  }
  getActiveUniform(program, index) {
    return program.activeUniforms[index];
  }
  getUniformLocation(program, name) {
    if (program.locations.has(name)) return program.locations.get(name);
    const base = name.replace(/\[\d+\]$/, ''),
      index = Number(name.match(/\[(\d+)\]$/)?.[1] || 0);
    const field = program.fields.find(f => f.name === base),
      sampler =
        program.activeSamplers.find(f => f.name === base) ||
        program.vertexWrites?.activeSamplers.find(f => f.name === base) ||
        program.geometryShader?.activeSamplers.find(f => f.name === base) ||
        program.geometryCapture?.activeSamplers.find(f => f.name === base);
    const location = field || sampler ? { program, field, sampler, index } : null;
    program.locations.set(name, location);
    return location;
  }
  writeUniform(location, values) {
    if (!location) return;
    const { program, field, sampler, index } = location;
    if (sampler) {
      program.values.set(sampler.name, Array.from(values));
      program.revision++;
      program.valuesRevision = (program.valuesRevision || 0) + 1;
      return;
    }
    const integer = /^(?:int|uint|bool|[biu]vec)/.test(field.type),
      view = program.dataView;
    const perElement = field.columns * field.rows;
    for (let i = 0; i < values.length; i++) {
      const element = index + Math.floor(i / perElement);
      if (element >= field.count) break;
      const component = i % perElement,
        column = Math.floor(component / field.rows),
        row = component % field.rows;
      const offset = field.offset + element * field.stride + (field.columns > 1 ? column * 16 + row * 4 : row * 4);
      if (integer) view.setInt32(offset, Number(values[i]) || 0, true);
      else view.setFloat32(offset, Number(values[i]) || 0, true);
    }
    program.revision++;
  }
  uniform1f(l, a) {
    this.writeUniform(l, [a]);
  }
  uniform1i(l, a) {
    this.writeUniform(l, [a]);
  }
  uniform1iv(l, a) {
    this.writeUniform(l, a);
  }
  uniform2f(l, a, b) {
    this.writeUniform(l, [a, b]);
  }
  uniform2i(l, a, b) {
    this.writeUniform(l, [a, b]);
  }
  uniform3f(l, a, b, c) {
    this.writeUniform(l, [a, b, c]);
  }
  uniform3i(l, a, b, c) {
    this.writeUniform(l, [a, b, c]);
  }
  uniform4f(l, a, b, c, d) {
    this.writeUniform(l, [a, b, c, d]);
  }
  uniformMatrix3fv(l, t, a) {
    this.writeUniform(l, a);
  }
  uniformMatrix4fv(l, t, a) {
    this.writeUniform(l, a);
  }
  createBuffer() {
    return { id: this.id(), gpu: null, size: 0 };
  }
  bindBuffer(target, buffer) {
    if (target === this.ARRAY_BUFFER) this.arrayBuffer = buffer;
    else {
      this.indexBuffer = buffer;
      if (this.vao) this.vao.index = buffer;
    }
  }
  bufferSubData(target, offset, data) {
    const buffer = target === this.ARRAY_BUFFER ? this.arrayBuffer : this.indexBuffer;
    if (!buffer?.gpu) return;
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const size = Math.floor(bytes.byteLength / 4) * 4;
    if (size > 0) this.device.queue.writeBuffer(buffer.gpu, offset, bytes.subarray(0, size));
    buffer.version = (buffer.version || 0) + 1;
  }
  bufferData(target, data) {
    const buffer = target === this.ARRAY_BUFFER ? this.arrayBuffer : this.indexBuffer;
    const bytes =
      typeof data === 'number' ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const size = Math.max(4, Math.ceil(bytes.byteLength / 4) * 4);
    this.retire(buffer.gpu);
    buffer.gpu = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    buffer.size = size;
    if (bytes.byteLength % 4) {
      const aligned = new Uint8Array(size);
      aligned.set(bytes);
      this.device.queue.writeBuffer(buffer.gpu, 0, aligned);
    } else this.device.queue.writeBuffer(buffer.gpu, 0, bytes);
    buffer.cpu = target === this.ARRAY_BUFFER || typeof data === 'number' ? null : data;
    buffer.ranges = new Map();
  }
  deleteBuffer(buffer) {
    if (buffer) this.retire(buffer.gpu);
  }
  createVertexArray() {
    return { id: this.id(), attributes: new Map(), index: null };
  }
  bindVertexArray(vao) {
    this.vao = vao;
    this.indexBuffer = vao?.index || null;
  }
  vertexAttribPointer(location, size, type, normalized, stride, offset) {
    this.vao.layoutCache = null;
    this.vao.attributes.set(location, { buffer: this.arrayBuffer, size, type, normalized, stride, offset });
  }
  enableVertexAttribArray() {}
  deleteVertexArray(vao) {
    if (vao?.writeCache) for (const entry of vao.writeCache.values()) this.retire(entry.params);
  }
  createTexture() {
    return {
      id: this.id(),
      params: new Map(),
      gpu: null,
      width: 0,
      height: 0,
      depth: 1,
      levels: 1,
      version: 0,
      views: new Map(),
      rawVersion: -1,
    };
  }
  activeTexture(unit) {
    this.activeUnit = unit - this.TEXTURE0;
  }
  bindTexture(target, texture) {
    this.textureStamp = (this.textureStamp || 0) + 1;
    const unit = (this.units[this.activeUnit] ??= {});
    unit[target] = texture;
    this.boundTextures ??= new Map();
    this.boundTextures.set(target, texture);
  }
  texParameteri(target, name, value) {
    this.textureStamp = (this.textureStamp || 0) + 1;
    const texture = this.boundTextures.get(target);
    if (texture) texture.params.set(name, value);
  }
  pixelStorei(name, value) {
    if (name === this.UNPACK_FLIP_Y_WEBGL) this.flipUpload = value;
  }
  textureFormat(internal) {
    if (internal === this.DEPTH_COMPONENT16 || internal === this.DEPTH_COMPONENT24) return 'depth32float';
    if (internal === this.R11F_G11F_B10F)
      return this.device.features.has('rg11b10ufloat-renderable') ? 'rg11b10ufloat' : 'rgba16float';
    if (internal === this.RGBA16F || internal === this.RGB16F || internal === this.RG16F || internal === this.R16F)
      return 'rgba16float';
    if (internal === this.RGBA32F || internal === this.RGB32F || internal === this.RG32F || internal === this.R32F)
      return this.device.features.has('float32-filterable') ? 'rgba32float' : 'rgba16float';
    if (internal === this.RGB10_A2) return 'rgb10a2unorm';
    if (internal === this.RGBA16 || internal === this.RGB16 || internal === this.RG16 || internal === this.R16)
      return this.device.features.has('texture-formats-tier1') ? 'rgba16unorm' : 'rgba32float';
    const integer = new Map([
      [this.R8UI, 'r8uint'],
      [this.R16UI, 'r16uint'],
      [this.R32UI, 'r32uint'],
      [this.RG8UI, 'rg8uint'],
      [this.RG16UI, 'rg16uint'],
      [this.RG32UI, 'rg32uint'],
      [this.RGB8UI, 'rgba8uint'],
      [this.RGB16UI, 'rgba16uint'],
      [this.RGB32UI, 'rgba32uint'],
      [this.RGBA8UI, 'rgba8uint'],
      [this.RGBA16UI, 'rgba16uint'],
      [this.RGBA32UI, 'rgba32uint'],
      [this.R8I, 'r8sint'],
      [this.R16I, 'r16sint'],
      [this.R32I, 'r32sint'],
      [this.RG8I, 'rg8sint'],
      [this.RG16I, 'rg16sint'],
      [this.RG32I, 'rg32sint'],
      [this.RGB8I, 'rgba8sint'],
      [this.RGB16I, 'rgba16sint'],
      [this.RGB32I, 'rgba32sint'],
      [this.RGBA8I, 'rgba8sint'],
      [this.RGBA16I, 'rgba16sint'],
      [this.RGBA32I, 'rgba32sint'],
    ]);
    if (integer.has(internal)) return integer.get(internal);
    if (
      internal === this.R8_SNORM ||
      internal === this.RG8_SNORM ||
      internal === this.RGB8_SNORM ||
      internal === this.RGBA8_SNORM
    )
      return this.device.features.has('texture-formats-tier1') ? 'rgba8snorm' : 'rgba16float';
    return 'rgba8unorm';
  }
  static STORAGE_CAPABLE = new Set([
    'rgba8unorm',
    'rgba8snorm',
    'rgba8uint',
    'rgba8sint',
    'rgba16uint',
    'rgba16sint',
    'rgba16float',
    'r32uint',
    'r32sint',
    'r32float',
    'rg32uint',
    'rg32sint',
    'rg32float',
    'rgba32uint',
    'rgba32sint',
    'rgba32float',
  ]);
  setColorImageTargets(list) {
    this.colorImageTargets = list;
  }
  setShadowImageTargets(list) {
    this.shadowImageTargets = list;
  }
  allocateTexture(texture, width, height, depth, format, levels, dimension = '2d', extraUsage = 0) {
    this.targetEpoch++;
    this.endPass();
    this.textureStamp = (this.textureStamp || 0) + 1;
    this.retire(texture.gpu);
    if (texture.raw) this.deleteTexture(texture.raw);
    texture.raw = null;
    if (texture.snapshot) this.deleteTexture(texture.snapshot);
    texture.snapshot = null;
    if (this.storageColorTarget)
      format =
        {
          rg11b10ufloat: 'rgba16float',
          rgb10a2unorm: 'rgba16float',
          rg32uint: 'rgba32uint',
          rg32sint: 'rgba32sint',
          rg32float: 'rgba32float',
          rg16uint: 'rgba16uint',
          rg16sint: 'rgba16sint',
          rg16float: 'rgba16float',
          rg8unorm: 'rgba8unorm',
          rg8uint: 'rgba8uint',
          rg8sint: 'rgba8sint',
        }[format] || format;
    const isDepth = format.startsWith('depth');
    let usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | extraUsage;
    if (dimension === '2d' && !extraUsage) usage |= GPUTextureUsage.RENDER_ATTACHMENT;
    if (this.storageColorTarget && IrisWebGPU.STORAGE_CAPABLE.has(format)) usage |= GPUTextureUsage.STORAGE_BINDING;
    Object.assign(texture, {
      width,
      height,
      depth,
      format,
      levels,
      dimension,
      isDepth,
      views: new Map(),
      version: texture.version + 1,
      generation: (texture.generation || 0) + 1,
    });
    texture.gpu = this.device.createTexture({
      label: 'Texture ' + texture.id,
      size: { width, height, depthOrArrayLayers: depth },
      format,
      mipLevelCount: levels,
      dimension,
      usage,
    });
  }
  texImage2D(target, level, internal, ...args) {
    let width, height, format, type, pixels;
    if (args.length === 3) {
      [format, type, pixels] = args;
      width = pixels.width;
      height = pixels.height;
    } else [width, height, , format, type, pixels] = args;
    this.uploadTexture(target, level, internal, width, height, 1, format, type, pixels);
  }
  texImage3D(target, level, internal, width, height, depth, border, format, type, pixels) {
    this.uploadTexture(target, level, internal, width, height, depth, format, type, pixels);
  }
  uploadTexture(target, level, internal, width, height, depth, format, type, pixels) {
    const texture = this.boundTextures.get(target),
      gpuFormat = this.textureFormat(internal);
    if (level === 0) {
      const levels =
        target === this.TEXTURE_3D || gpuFormat.startsWith('depth') || /(?:uint|sint)$/.test(gpuFormat)
          ? 1
          : Math.floor(Math.log2(Math.max(width, height))) + 1;
      this.allocateTexture(texture, width, height, depth, gpuFormat, levels, target === this.TEXTURE_3D ? '3d' : '2d');
    }
    if (!pixels) return;
    if (texture.isDepth) {
      this.clearTexture(texture, [1], true);
      return;
    }
    if (!ArrayBuffer.isView(pixels)) {
      const exact = straightImagePixels(pixels, width, height);
      if (exact) pixels = exact;
      else {
        const surface = new OffscreenCanvas(width, height),
          ctx = surface.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(pixels, 0, 0);
        pixels = ctx.getImageData(0, 0, width, height).data;
      }
    }
    if (gpuFormat === 'rgba32float' && type === this.UNSIGNED_SHORT) {
      const channels = format === this.RED ? 1 : format === this.RG ? 2 : format === this.RGB ? 3 : 4;
      const values = new Uint16Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 2);
      const expanded = new Float32Array(width * height * depth * 4);
      for (let i = 0; i < width * height * depth; i++)
        for (let c = 0; c < 4; c++)
          expanded[i * 4 + c] = c < channels ? values[i * channels + c] / 65535 : c === 3 ? 1 : 0;
      pixels = expanded;
    }
    let bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
      channels = format === this.RGB ? 3 : 4;
    if (channels === 3 && bytes.length === width * height * depth * 3) {
      const rgba = new Uint8Array(width * height * depth * 4);
      for (let i = 0, j = 0; i < bytes.length; i += 3, j += 4) {
        rgba.set(bytes.subarray(i, i + 3), j);
        rgba[j + 3] = 255;
      }
      bytes = rgba;
    }
    if (this.flipUpload && depth === 1) {
      const flipped = new Uint8Array(bytes.length),
        stride = bytes.length / height;
      for (let y = 0; y < height; y++)
        flipped.set(bytes.subarray(y * stride, (y + 1) * stride), (height - y - 1) * stride);
      bytes = flipped;
    }
    const bytesPerRow = bytes.length / (height * depth);
    this.device.queue.writeTexture(
      { texture: texture.gpu, mipLevel: level },
      bytes,
      { bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: depth },
    );
    texture.version++;
  }
  view(texture, base = 0, count) {
    const key = base + ':' + (count ?? texture.levels - base);
    if (!texture.views.has(key))
      texture.views.set(
        key,
        texture.gpu.createView({ baseMipLevel: base, mipLevelCount: count ?? texture.levels - base }),
      );
    return texture.views.get(key);
  }
  deleteTexture(texture) {
    if (texture) {
      this.retire(texture.gpu);
      if (texture.raw) this.deleteTexture(texture.raw);
    }
  }
  createSampler() {
    return { params: new Map() };
  }
  samplerParameteri(sampler, name, value) {
    this.textureStamp = (this.textureStamp || 0) + 1;
    sampler.params.set(name, value);
  }
  bindSampler(unit, sampler) {
    this.textureStamp = (this.textureStamp || 0) + 1;
    (this.units[unit] ??= {}).sampler = sampler;
  }
  deleteSampler() {}
  samplerFor(texture, override, comparison = false) {
    const get = (name, fallback) => override?.params.get(name) ?? texture.params.get(name) ?? fallback;
    const min = get(this.TEXTURE_MIN_FILTER, this.NEAREST),
      mag = get(this.TEXTURE_MAG_FILTER, this.NEAREST);
    const wrap = value =>
      value === this.REPEAT ? 'repeat' : value === this.MIRRORED_REPEAT ? 'mirror-repeat' : 'clamp-to-edge';
    const descriptor = {
      addressModeU: wrap(get(this.TEXTURE_WRAP_S, this.REPEAT)),
      addressModeV: wrap(get(this.TEXTURE_WRAP_T, this.REPEAT)),
      addressModeW: wrap(get(this.TEXTURE_WRAP_R, this.REPEAT)),
      magFilter: mag === this.LINEAR ? 'linear' : 'nearest',
      minFilter: [this.LINEAR, this.LINEAR_MIPMAP_LINEAR, this.LINEAR_MIPMAP_NEAREST].includes(min)
        ? 'linear'
        : 'nearest',
      mipmapFilter: [this.LINEAR_MIPMAP_LINEAR, this.NEAREST_MIPMAP_LINEAR].includes(min) ? 'linear' : 'nearest',
      lodMinClamp: Math.max(0, get(this.TEXTURE_BASE_LEVEL, 0)),
      lodMaxClamp: [this.LINEAR, this.NEAREST].includes(min)
        ? 0
        : Math.min(texture.levels - 1, get(this.TEXTURE_MAX_LEVEL, 1000)),
    };
    if (comparison) descriptor.compare = 'less-equal';
    const key = JSON.stringify(descriptor);
    if (!this.samplerCache.has(key)) this.samplerCache.set(key, this.device.createSampler(descriptor));
    return { gpu: this.samplerCache.get(key), key };
  }
  createFramebuffer() {
    return { id: this.id(), colors: new Map(), depth: null, buffers: [this.COLOR_ATTACHMENT0], read: 0 };
  }
  bindFramebuffer(target, fbo) {
    this.endPass();
    this.targetEpoch++;
    if (target !== this.DRAW_FRAMEBUFFER) this.readFBO = fbo;
    if (target !== this.READ_FRAMEBUFFER) this.drawFBO = fbo;
  }
  fbo(target = this.DRAW_FRAMEBUFFER) {
    return (target === this.READ_FRAMEBUFFER ? this.readFBO : this.drawFBO) || this.defaultFBO;
  }
  framebufferTexture2D(target, attachment, unused, texture, level) {
    this.endPass();
    this.targetEpoch++;
    const fbo = this.fbo(target);
    if (attachment === this.DEPTH_ATTACHMENT) fbo.depth = texture;
    else if (texture) fbo.colors.set(attachment - this.COLOR_ATTACHMENT0, { texture, level });
    else fbo.colors.delete(attachment - this.COLOR_ATTACHMENT0);
  }
  createRenderbuffer() {
    return this.createTexture();
  }
  bindRenderbuffer(target, buffer) {
    this.renderbuffer = buffer;
  }
  renderbufferStorage(target, format, width, height) {
    this.allocateTexture(this.renderbuffer, width, height, 1, this.textureFormat(format), 1);
  }
  framebufferRenderbuffer(target, attachment, kind, renderbuffer) {
    this.endPass();
    this.targetEpoch++;
    if (attachment === this.DEPTH_ATTACHMENT) this.fbo(target).depth = renderbuffer;
  }
  deleteRenderbuffer(buffer) {
    this.deleteTexture(buffer);
  }
  deleteFramebuffer() {}
  checkFramebufferStatus() {
    return this.FRAMEBUFFER_COMPLETE;
  }
  drawBuffers(buffers) {
    this.endPass();
    this.targetEpoch++;
    this.fbo().buffers = buffers.map(value => (value === this.BACK ? this.COLOR_ATTACHMENT0 : value));
  }
  readBuffer(buffer) {
    this.fbo(this.READ_FRAMEBUFFER).read = buffer - this.COLOR_ATTACHMENT0;
  }
  viewport(x, y, width, height) {
    this.viewportState = [x, y, width, height];
  }
  depthRange(near, far) {
    this.depthRangeState = [near, far];
    this.passState && (this.passState.viewport[0] = NaN);
  }
  enable(flag) {
    this.enabled.add(flag);
    if (flag === this.BLEND) {
      this.blendOff.clear();
      this.blendOverrides.clear();
    }
  }
  disable(flag) {
    this.enabled.delete(flag);
    if (flag === this.BLEND) {
      this.blendOff.clear();
      this.blendOverrides.clear();
    }
  }
  enablei(flag, index) {
    if (flag === this.BLEND) this.blendOff.delete(index);
  }
  disablei(flag, index) {
    if (flag === this.BLEND) this.blendOff.add(index);
  }
  depthMask(enabled) {
    this.depthWrite = enabled;
  }
  cullFace(face) {
    this.cull = face;
  }
  colorMask(r, g, b, a) {
    this.colorWriteOff = !(r || g || b || a);
  }
  depthFunc(func) {
    this.depthFuncName =
      {
        512: 'never',
        513: 'less',
        514: 'equal',
        515: 'less-equal',
        516: 'greater',
        517: 'not-equal',
        518: 'greater-equal',
        519: 'always',
      }[func] || 'less';
  }
  blendFuncSeparatei(index, ...factors) {
    this.blendOverrides.set(index, factors);
    this.blendOff.delete(index);
  }
  blendEquation() {}
  blendFuncSeparate(srcRGB, dstRGB, srcA, dstA) {
    this.blendFactors = [srcRGB, dstRGB, srcA, dstA];
  }
  clearColor(r, g, b, a) {
    this.clearRGBA = [r, g, b, a];
  }
  clearDepth(value) {
    this.clearZ = value;
  }
  clearTexture(texture, value, depth = false, level = 0) {
    this.endPass();
    const attachment = { view: this.view(texture, level, 1) };
    const descriptor = depth
      ? {
          colorAttachments: [],
          depthStencilAttachment: {
            ...attachment,
            depthClearValue: value[0],
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        }
      : { colorAttachments: [{ ...attachment, loadOp: 'clear', storeOp: 'store', clearValue: Array.from(value) }] };
    this.beginRender(descriptor).end();
    texture.version++;
  }
  clearBufferfv(kind, index, value) {
    const fbo = this.fbo();
    if (kind === this.DEPTH) {
      if (fbo.depth) this.clearTexture(fbo.depth, value, true);
    } else {
      const item = fbo.colors.get(fbo.buffers[index] - this.COLOR_ATTACHMENT0);
      if (item) this.clearTexture(item.texture, value, false, item.level);
    }
  }
  clear(mask) {
    const fbo = this.fbo();
    if (mask & this.COLOR_BUFFER_BIT)
      fbo.buffers.forEach((_, index) => this.clearBufferfv(this.COLOR, index, this.clearRGBA));
    if (mask & this.DEPTH_BUFFER_BIT) this.clearBufferfv(this.DEPTH, 0, [this.clearZ]);
  }
  blitFramebuffer(sx, sy, ex, ey, dx, dy, fx, fy, mask) {
    this.endPass();
    const source = this.fbo(this.READ_FRAMEBUFFER),
      destination = this.fbo();
    const src = mask & this.DEPTH_BUFFER_BIT ? source.depth : source.colors.get(source.read)?.texture;
    const dst =
      mask & this.DEPTH_BUFFER_BIT
        ? destination.depth
        : destination.colors.get(destination.buffers[0] - this.COLOR_ATTACHMENT0)?.texture;
    if (!src || !dst) throw new Error('WebGPU-Kopie: Quell- oder Zieltextur fehlt.');
    this.commandEncoder().copyTextureToTexture(
      { texture: src.gpu, origin: [sx, sy, 0], aspect: src.isDepth ? 'depth-only' : 'all' },
      { texture: dst.gpu, origin: [dx, dy, 0], aspect: dst.isDepth ? 'depth-only' : 'all' },
      [ex - sx, ey - sy, 1],
    );
    dst.version++;
  }
  centerDepthTexture() {
    if (!this.centerDepthImages) {
      this.centerDepthImages = [0, 1].map(() => {
        const texture = this.createTexture();
        this.allocateTexture(texture, 1, 1, 1, 'r32float', 1, '2d', GPUTextureUsage.STORAGE_BINDING);
        return texture;
      });
      this.centerDepthParams = this.device.createBuffer({
        label: 'Center depth smoothing',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const code = `@group(0) @binding(0) var scene:texture_depth_2d;
@group(0) @binding(1) var history:texture_2d<f32>;
@group(0) @binding(2) var result:texture_storage_2d<r32float,write>;
@group(0) @binding(3) var<uniform> params:vec4f;
@compute @workgroup_size(1) fn main(){
 let current=textureLoad(scene,vec2i(textureDimensions(scene)/2u),0);
 let old=textureLoad(history,vec2i(0),0).r;
 textureStore(result,vec2i(0),vec4f(mix(old,current,params.x),0.0,0.0,1.0));
}`;
      this.centerDepthPipeline = this.device.createComputePipeline({
        label: 'Iris center depth',
        layout: 'auto',
        compute: { module: this.irisShaderModule({ code }), entryPoint: 'main' },
      });
    }
    return this.centerDepthImages[0];
  }
  updateCenterDepth(source, delta, halfLife) {
    this.centerDepthTexture();
    this.endPass();
    const decay = halfLife > 0 ? 1 - Math.pow(0.5, delta / (halfLife * 0.1)) : 1;
    this.device.queue.writeBuffer(this.centerDepthParams, 0, new Float32Array([decay, 0, 0, 0]));
    const [history, result] = this.centerDepthImages,
      pass = this.beginCompute({ label: 'Center depth' });
    pass.setPipeline(this.centerDepthPipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: this.centerDepthPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.view(source, 0, 1) },
          { binding: 1, resource: this.view(history, 0, 1) },
          { binding: 2, resource: this.storageView(result) },
          { binding: 3, resource: { buffer: this.centerDepthParams } },
        ],
      }),
    );
    pass.dispatchWorkgroups(1);
    pass.end();
    result.version++;
    this.centerDepthImages = [result, history];
    this.textureStamp = (this.textureStamp || 0) + 1;
  }
  resetCenterDepth() {
    if (this.centerDepthImages) for (const texture of this.centerDepthImages) this.deleteTexture(texture);
    if (this.centerDepthParams) this.retire(this.centerDepthParams);
    this.centerDepthImages = null;
    this.centerDepthParams = null;
  }

  initUtilityPipelines() {
    const vertex = `@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f { let x=f32((index<<1u)&2u);let y=f32(index&2u);return vec4f(x*2.0-1.0,1.0-y*2.0,0.0,1.0); }`;
    this.utilityVertex = this.irisShaderModule({ label: 'Fullscreen triangle', code: vertex });
    const presentation = this.irisShaderModule({
      label: 'Present bottom-up framebuffer',
      code: '@group(0) @binding(0) var image:texture_2d<f32>; @fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f { let s=textureDimensions(image);return vec4f(textureLoad(image,vec2i(i32(p.x),i32(s.y)-1-i32(p.y)),0).rgb,1.0); }',
    });
    this.presentationPipeline = this.device.createRenderPipeline({
      label: 'Canvas presentation',
      layout: 'auto',
      vertex: { module: this.utilityVertex, entryPoint: 'vs' },
      fragment: { module: presentation, entryPoint: 'fs', targets: [{ format: this.canvasFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    this.depthCopyModule = this.irisShaderModule({
      label: 'Raw depth sampler view',
      code: '@group(0) @binding(0) var image:texture_depth_2d; @fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f { let d=textureLoad(image,vec2i(p.xy),0); return vec4f(d,0.0,0.0,1.0); }',
    });
    this.rawDepthFormat = 'r32float';
    this.depthCopyPipeline = this.device.createRenderPipeline({
      label: 'Depth to raw scalar',
      layout: 'auto',
      vertex: { module: this.utilityVertex, entryPoint: 'vs' },
      fragment: { module: this.depthCopyModule, entryPoint: 'fs', targets: [{ format: this.rawDepthFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    this.mipmapModule = this.irisShaderModule({
      label: 'Linear mipmaps',
      code: '@group(0) @binding(0) var image:texture_2d<f32>; @group(0) @binding(1) var linearSampler:sampler; @group(0) @binding(2) var<uniform> dimensions:vec4f; fn wgpuMipBox(p:vec2f,dst:vec2f)->vec4f { let src=vec2f(textureDimensions(image,0)); let r=src/dst; let a=floor(p)*r; let b=(floor(p)+1.0)*r; var sum=vec4f(0.0); var weight=0.0; for(var j=0;j<4;j++){ let y=floor(a.y)+f32(j); if(y>=b.y||y>=src.y){break;} let wy=min(b.y,y+1.0)-max(a.y,y); for(var i=0;i<4;i++){ let x=floor(a.x)+f32(i); if(x>=b.x||x>=src.x){break;} let w=(min(b.x,x+1.0)-max(a.x,x))*wy; sum+=textureLoad(image,vec2i(i32(x),i32(y)),0)*w; weight+=w; } } return sum/max(weight,1e-6); } @fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f {return wgpuMipBox(p.xy,dimensions.xy)+textureSampleLevel(image,linearSampler,vec2f(0.5),0.0)*0.0;}',
    });
    this.mipmapLoadModule = this.irisShaderModule({
      label: 'Box mipmaps (unfilterable)',
      code: '@group(0) @binding(0) var image:texture_2d<f32>; fn wgpuMipBox(p:vec2f,dst:vec2f)->vec4f { let src=vec2f(textureDimensions(image,0)); let r=src/dst; let a=floor(p)*r; let b=(floor(p)+1.0)*r; var sum=vec4f(0.0); var weight=0.0; for(var j=0;j<4;j++){ let y=floor(a.y)+f32(j); if(y>=b.y||y>=src.y){break;} let wy=min(b.y,y+1.0)-max(a.y,y); for(var i=0;i<4;i++){ let x=floor(a.x)+f32(i); if(x>=b.x||x>=src.x){break;} let w=(min(b.x,x+1.0)-max(a.x,x))*wy; sum+=textureLoad(image,vec2i(i32(x),i32(y)),0)*w; weight+=w; } } return sum/max(weight,1e-6); } @fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f { let s=textureDimensions(image,0); return wgpuMipBox(p.xy,vec2f(f32(max(1u,s.x/2u)),f32(max(1u,s.y/2u)))); }',
    });
    this.mipmapPipelines = new Map();
    this.utilitySampler = this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  }
  setUnfilterableTargets(names) {
    this.unfilterableTargets = new Set(names || []);
  }
  filterableFormat(format) {
    if (/(?:uint|sint)$/.test(format)) return false;
    if (/16unorm$|16snorm$/.test(format)) return false;
    if (/32float$/.test(format)) return this.device.features.has('float32-filterable');
    return true;
  }
  rawDepth(texture) {
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
      pass.setPipeline(this.depthCopyPipeline);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.depthCopyPipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: this.view(texture, 0, 1) }],
        }),
      );
      pass.draw(3);
      pass.end();
      texture.rawVersion = texture.version;
    }
    return texture.raw;
  }
  generateMipmap(target) {
    this.endPass();
    const texture = this.boundTextures.get(target);
    if (!texture || texture.isDepth || texture.levels < 2) return;
    const mipFilterable = this.filterableFormat(texture.format);
    let pipeline = this.mipmapPipelines.get(texture.format);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: 'Mip ' + texture.format,
        layout: 'auto',
        vertex: { module: this.utilityVertex, entryPoint: 'vs' },
        fragment: {
          module: mipFilterable ? this.mipmapModule : this.mipmapLoadModule,
          entryPoint: 'fs',
          targets: [{ format: texture.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      this.mipmapPipelines.set(texture.format, pipeline);
    }
    const last = Math.min(texture.levels - 1, texture.params.get(this.TEXTURE_MAX_LEVEL) ?? 1000);
    for (let level = 1; level <= last; level++) {
      const width = Math.max(1, texture.width >> level),
        height = Math.max(1, texture.height >> level);
      const dimensions = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(dimensions, 0, new Float32Array([width, height, 0, 0]));
      this.retire(dimensions);
      const pass = this.beginRender({
        label: 'Mip ' + level,
        colorAttachments: [
          { view: this.view(texture, level, 1), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
      });
      const mipEntries = mipFilterable
        ? [
            { binding: 0, resource: this.view(texture, level - 1, 1) },
            { binding: 1, resource: this.utilitySampler },
            { binding: 2, resource: { buffer: dimensions } },
          ]
        : [{ binding: 0, resource: this.view(texture, level - 1, 1) }];
      pass.setPipeline(pipeline);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: mipEntries }),
      );
      pass.draw(3);
      pass.end();
    }
    texture.version++;
  }
  vertexLayout(program) {
    const vao = this.vao,
      cache = vao && (vao.layoutCache ??= new Map()),
      hit = cache?.get(program.id);
    if (hit && hit.sources.every((source, i) => !source || source.buffer.gpu === hit.buffers[i])) return hit;
    const result = this.buildVertexLayout(program);
    if (cache) cache.set(program.id, result);
    return result;
  }
  buildVertexLayout(program) {
    const buffers = [],
      layouts = [],
      groups = new Map(),
      sources = [];
    for (const input of program.attributes) {
      const attribute = this.vao?.attributes.get(input.location),
        components = Number(input.type.match(/[234]$/)?.[0] || 1);
      const prefix = /^(?:uvec|uint)/.test(input.type)
        ? 'uint32'
        : /^(?:ivec|int)/.test(input.type)
          ? 'sint32'
          : 'float32';
      const format = prefix + (components > 1 ? 'x' + components : '');
      const key = attribute ? attribute.buffer.id + ':' + attribute.stride : 'default:' + prefix;
      if (!groups.has(key)) {
        groups.set(key, layouts.length);
        layouts.push({
          arrayStride: attribute?.stride || 16,
          stepMode: attribute ? 'vertex' : 'instance',
          attributes: [],
        });
        buffers.push(
          attribute?.buffer.gpu || (prefix === 'float32' ? this.defaultAttribute : this.defaultIntegerAttribute),
        );
        sources.push(attribute || null);
      }
      layouts[groups.get(key)].attributes.push({
        shaderLocation: input.location,
        offset: attribute?.offset || 0,
        format,
      });
    }
    return { buffers, layouts, sources, key: JSON.stringify(layouts) };
  }
  targetState(program) {
    const cached = program.targetCache;
    if (cached && cached.epoch === this.targetEpoch) return cached.value;
    const fbo = this.fbo(),
      outputs = new Set(program.outputs.map(o => o.location));
    const count = Math.max(fbo.buffers.length, ...outputs) + 1;
    const colors = [];
    for (let index = 0; index < count; index++) {
      const selection = fbo.buffers[index],
        attachment =
          selection === undefined || selection === this.NONE
            ? null
            : fbo.colors.get(selection - this.COLOR_ATTACHMENT0);
      colors[index] = attachment && outputs.has(index) ? attachment : null;
    }
    while (colors.length && !colors.at(-1)) colors.pop();
    const value = { fbo, colors, depth: fbo.depth };
    value.passKey =
      colors.map(item => (item ? item.texture.id + ':' + item.level : '-')).join(',') + '|' + (fbo.depth?.id || 0);
    value.formatKey =
      colors.map(item => (item ? item.texture.format : '-')).join(',') + '|' + (fbo.depth?.format || '');
    program.targetCache = { epoch: this.targetEpoch, value };
    return value;
  }
  bindTextures(program, target = program, storage = null, perFrame = false) {
    const cached = target.textureCache;
    if (
      cached &&
      cached.stamp === this.textureStamp &&
      cached.revision === program.valuesRevision &&
      !cached.dynamic &&
      (!cached.perFrame || cached.frame === this.frame)
    )
      return cached.group;
    let dynamic = false,
      snapshotOnly = false;
    const entries = [],
      parts = [],
      pre = [];
    const used = new Map(target.bindings.filter(b => b.group === 1).map(b => [b.binding, b]));
    for (const sampler of target.activeSamplers) {
      const unit = this.units[program.values.get(sampler.name)?.[0] ?? 0] || {};
      let texture = unit[sampler.type.includes('3D') ? this.TEXTURE_3D : this.TEXTURE_2D];
      if (!texture?.gpu) throw new Error(program.label + ': Textur fehlt: ' + sampler.name);
      const binding = used.get(sampler.binding),
        comparison = used.get(sampler.binding + 1)?.type === 'sampler_comparison';
      if (binding && !binding.type.includes('depth') && texture.isDepth) {
        texture = this.rawDepth(texture);
        dynamic = true;
      }
      if (binding && storage?.has(texture)) {
        texture = this.snapshot(texture, perFrame, target.label + ' · ' + sampler.name);
        snapshotOnly = true;
      }
      let override = unit.sampler;
      if (target.textureEntries.find(e => e.binding === sampler.binding + 1)?.sampler?.type === 'non-filtering') {
        const min =
            override?.params.get(this.TEXTURE_MIN_FILTER) ??
            texture.params.get(this.TEXTURE_MIN_FILTER) ??
            this.NEAREST,
          mipmapped = [
            this.NEAREST_MIPMAP_NEAREST,
            this.NEAREST_MIPMAP_LINEAR,
            this.LINEAR_MIPMAP_NEAREST,
            this.LINEAR_MIPMAP_LINEAR,
          ].includes(min);
        override = {
          params: new Map([
            ...(override?.params || []),
            [this.TEXTURE_MIN_FILTER, mipmapped ? this.NEAREST_MIPMAP_NEAREST : this.NEAREST],
            [this.TEXTURE_MAG_FILTER, this.NEAREST],
          ]),
        };
      }
      const state = this.samplerFor(texture, override, comparison);
      const minNow =
        override?.params.get(this.TEXTURE_MIN_FILTER) ?? texture.params.get(this.TEXTURE_MIN_FILTER) ?? this.NEAREST;
      const baseOnly =
        binding &&
        sampler.type === 'sampler2D' &&
        !texture.isDepth &&
        texture.levels > 1 &&
        this.unfilterableTargets?.has(sampler.name) &&
        ![
          this.NEAREST_MIPMAP_NEAREST,
          this.NEAREST_MIPMAP_LINEAR,
          this.LINEAR_MIPMAP_NEAREST,
          this.LINEAR_MIPMAP_LINEAR,
        ].includes(minNow);
      if (binding)
        entries.push({ binding: sampler.binding, resource: baseOnly ? this.view(texture, 0, 1) : this.view(texture) });
      if (used.has(sampler.binding + 1)) entries.push({ binding: sampler.binding + 1, resource: state.gpu });
      parts.push(sampler.binding + ':' + texture.id + '.' + (texture.generation || 0) + ':' + state.key);
    }
    const key = parts.join('|');
    let group = target.groups.get(key);
    if (!group) {
      group = this.device.createBindGroup({
        label: target.label + ' resources',
        layout: target.textureLayout,
        entries,
      });
      if (target.groups.size > 64) target.groups.clear();
      target.groups.set(key, group);
    }
    target.textureCache = {
      stamp: this.textureStamp,
      revision: program.valuesRevision,
      group,
      dynamic: dynamic || (snapshotOnly && !perFrame),
      perFrame: snapshotOnly && perFrame,
      frame: this.frame,
    };
    return group;
  }
  storageTextures(target) {
    const set = new Set();
    for (const entry of target.imageEntries || []) {
      const image = this.imageForBinding(target, entry.binding);
      if (image) set.add(image.texture);
    }
    return set;
  }
  imageForBinding(target, binding) {
    const record = target.images.find(image => image.binding === binding);
    let image = record && this.customImages.get(record.name);
    if (!image && record) {
      const alias = /^(shadowcolorimg|colorimg)(\d+)$/.exec(record.name);
      const texture =
        alias && (alias[1] === 'colorimg' ? this.colorImageTargets : this.shadowImageTargets)?.[Number(alias[2])];
      if (texture && texture.gpu) image = { name: record.name, texture, format: texture.format, dimension: '2d' };
    }
    if (!image)
      throw new Error(
        target.label + ': Image fehlt: ' + (record?.name || binding) + ' (image.* in shaders.properties)',
      );
    return image;
  }
  bindImages(target) {
    if (!target.imageLayout) return target.bufferLayout ? this.emptyGroup : null;
    const entries = target.imageEntries.map(entry => ({
      binding: entry.binding,
      resource: this.storageView(this.imageForBinding(target, entry.binding).texture),
    }));
    const key =
      'images:' +
      target.imageEntries
        .map(e => {
          const t = this.imageForBinding(target, e.binding).texture;
          return e.binding + ':' + t.id + '.' + t.generation;
        })
        .join('|');
    let group = target.groups.get(key);
    if (!group) {
      group = this.device.createBindGroup({ label: target.label + ' images', layout: target.imageLayout, entries });
      target.groups.set(key, group);
    }
    return group;
  }
  markImageWrites(target) {
    for (const entry of target.imageEntries || [])
      if (entry.storageTexture.access !== 'read-only') this.imageForBinding(target, entry.binding).texture.version++;
  }
  storageView(texture) {
    const key = 'storage';
    if (!texture.views.has(key))
      texture.views.set(
        key,
        texture.gpu.createView({ label: texture.gpu.label + ' storage', baseMipLevel: 0, mipLevelCount: 1 }),
      );
    return texture.views.get(key);
  }
  bufferEntriesFor(target, extra = []) {
    const entries = [];
    for (const entry of target.bufferEntries || []) {
      if (entry.binding >= 30 && entry.source === undefined) continue;
      const buffer = entry.snapshot
        ? this.storageSnapshot(entry.source ?? entry.binding)
        : this.storageBuffers.get(entry.source ?? entry.binding);
      if (!buffer) {
        this.missingStorageWarned ??= new Set();
        if (!this.missingStorageWarned.has(target.label + entry.binding)) {
          this.missingStorageWarned.add(target.label + entry.binding);
          console.warn(
            target.label +
              ': SSBO ' +
              entry.binding +
              ' ohne bufferObject.' +
              entry.binding +
              ', leerer Puffer wie ungebunden in GL',
          );
        }
        this.missingStorage ??= new Map();
        if (!this.missingStorage.has(entry.binding))
          this.missingStorage.set(
            entry.binding,
            this.device.createBuffer({
              label: 'SSBO ' + entry.binding + ' ohne bufferObject',
              size: 1 << 20,
              usage: GPUBufferUsage.STORAGE,
            }),
          );
        entries.push({ binding: entry.binding, resource: { buffer: this.missingStorage.get(entry.binding) } });
        continue;
      }
      entries.push({ binding: entry.binding, resource: { buffer } });
    }
    return entries.concat(extra.filter(item => target.bufferEntries.some(entry => entry.binding === item.binding)));
  }
  bindBuffers(target) {
    if (!target.bufferLayout) return null;
    const bufferKey = 'buffers:' + (this.bufferGeneration || 0);
    let group = target.groups.get(bufferKey);
    if (!group) {
      group = this.device.createBindGroup({
        label: target.label + ' buffers',
        layout: target.bufferLayout,
        entries: this.bufferEntriesFor(target),
      });
      target.groups.set(bufferKey, group);
    }
    return group;
  }
  snapshot(texture, perFrame = false, reader = '') {
    if (!texture.snapshot || texture.snapshot.width !== texture.width) {
      texture.snapshotWasCleared = false;
      texture.snapshot = this.createTexture();
      this.allocateTexture(
        texture.snapshot,
        texture.width,
        texture.height,
        texture.depth,
        texture.format,
        1,
        texture.dimension,
      );
      texture.snapshot.params = texture.params;
    }
    if (perFrame ? texture.snapshotFrame !== this.frame : texture.snapshotVersion !== texture.version) {
      const cleared = texture.clearedVersion === texture.version;
      if (!cleared || !texture.snapshotWasCleared) {
        if (this.pass) this.endPass();
        this.timedCopy('Kopie ' + (texture.gpu.label || '') + (reader ? ' für ' + reader : ''), () =>
          this.commandEncoder().copyTextureToTexture(
            { texture: texture.gpu },
            { texture: texture.snapshot.gpu },
            { width: texture.width, height: texture.height, depthOrArrayLayers: texture.depth },
          ),
        );
        texture.snapshot.version++;
        texture.snapshotWasCleared = cleared;
      }
      texture.snapshotVersion = texture.version;
      texture.snapshotFrame = this.frame;
    }
    return texture.snapshot;
  }
  bindUniforms(program) {
    if (!program.bindings.some(b => b.group === 0)) return null;
    if (program.lastUniformFrame !== this.frame || program.lastUniformRevision !== program.revision) {
      const alignment = this.device.limits.minUniformBufferOffsetAlignment;
      this.uniformCursor = Math.ceil(this.uniformCursor / alignment) * alignment;
      if (this.uniformCursor + program.uniformSize > this.uniformArena.size)
        throw new Error('WebGPU Uniform-Speicher für diesen Frame ist voll.');
      program.uniformOffset = this.uniformCursor;
      this.uniformCursor += program.uniformSize;
      this.device.queue.writeBuffer(this.uniformArena, program.uniformOffset, program.uniformData);
      program.lastUniformFrame = this.frame;
      program.lastUniformRevision = program.revision;
    }
    program.uniformGroup ??= this.device.createBindGroup({
      label: program.label + ' uniform snapshot',
      layout: program.uniformLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
    });
    return program.uniformGroup;
  }
  framesInFlight() {
    if (!this.inFlight) return 0;
    const now = performance.now();
    for (const [id, since] of this.inFlight) if (now - since > 1000) this.inFlight.delete(id);
    return this.inFlight.size;
  }
  cpuMark(label) {
    if (this.cpuStart !== undefined) this.cpuMarks.push([label, performance.now() - this.cpuStart]);
  }
  cpuReport() {
    return this.cpuLast || null;
  }
  viewerTime(key, run) {
    if (!this.viewerMonitoring || this.viewerTiming) return run();
    const start = performance.now();
    this.viewerTiming = true;
    try {
      return run();
    } finally {
      this.viewerTiming = false;
      this.viewerCpuFrame ??= new Map();
      this.viewerCpuFrame.set(key, (this.viewerCpuFrame.get(key) || 0) + performance.now() - start);
    }
  }
  draw(indexed, count, type, offset = 0) {
    if (this.viewerDisabledPrograms?.has(this.program)) return;
    const wgpuSwap = this.wgpuDebugSwap;
    if (wgpuSwap && this.program === wgpuSwap.from && count && !this.program.geometry) {
      wgpuSwap.sync(this);
      wgpuSwap.draws = (wgpuSwap.draws || 0) + 1;
      const saved = this.program;
      this.program = wgpuSwap.to;
      try {
        return this.viewerDraw(indexed, count, type, offset);
      } finally {
        this.program = saved;
      }
    }
    if (!this.viewerMonitoring) return this.viewerDraw(indexed, count, type, offset);
    return this.viewerTime('render:' + this.program?.label, () => this.viewerDraw(indexed, count, type, offset));
  }
  viewerDraw(indexed, count, type, offset = 0) {
    if (!count) return;
    if (this.program?.geometry && !this.geometryDrawing) {
      if (this.program.geometry.tessellation) this.drawTessellation(indexed, count, type, offset);
      else this.drawGeometry(indexed, count, type, offset);
      return;
    }
    this.drawCount = (this.drawCount || 0) + 1;
    const program = this.program;
    if (!program) throw new Error('Kein WebGPU-Shader aktiv.');
    const storage = program.imageLayout ? this.storageTextures(program) : null;
    if (storage?.size) this.endPass();
    this.writeOffSlots =
      this.wgpuWriteMaskFor?.(this.wgpuDebugSwap?.to === program ? this.wgpuDebugSwap.from : program) ?? null;
    const target = this.targetState(program);
    let conflicts = storage;
    for (const item of target.colors)
      if (item) {
        conflicts = conflicts === storage ? new Set(storage || []) : conflicts;
        conflicts.add(item.texture);
      }
    const textures = this.bindTextures(program, program, conflicts, true),
      uniforms = this.bindUniforms(program),
      vertices = this.vertexLayout(program);
    const images = program.groupLayouts.length > 2 ? this.bindImages(program) : null,
      buffers = this.geometryDrawing
        ? this.geometryDrawing.group3
        : program.groupLayouts.length > 3
          ? this.bindBuffers(program)
          : null;
    if (program.vertexWrites) this.queueVertexWrites(program, indexed, count, type, offset, uniforms);
    const depthEnabled = this.enabled.has(this.DEPTH_TEST),
      blendEnabled = this.enabled.has(this.BLEND),
      culling = this.enabled.has(this.CULL_FACE) ? (this.cull === this.BACK ? 'back' : 'front') : 'none';
    const key =
      JSON.stringify([...this.blendOverrides]) +
      '|' +
      vertices.key +
      '|' +
      target.formatKey +
      '|' +
      (blendEnabled ? (this.blendFactors || [770, 771, 1, 771]).join(',') : 'off') +
      ':' +
      depthEnabled +
      ':' +
      this.depthWrite +
      ':' +
      culling +
      ':' +
      (this.depthFuncName || 'less') +
      (this.colorWriteOff ? ':nocolor' : '') +
      (this.writeOffSlots ? '|wo' + [...this.writeOffSlots].join(',') : '') +
      (blendEnabled && this.blendOff.size ? '|no' + [...this.blendOff].sort().join(',') : '') +
      (this.geometryDrawing?.topology && this.geometryDrawing.topology !== 'triangle-list'
        ? '|' + this.geometryDrawing.topology
        : '');
    let pipeline = program.pipelines.get(key);
    if (!pipeline) {
      const factor = value =>
        ({
          0: 'zero',
          1: 'one',
          768: 'src',
          769: 'one-minus-src',
          770: 'src-alpha',
          771: 'one-minus-src-alpha',
          772: 'dst-alpha',
          773: 'one-minus-dst-alpha',
          774: 'dst',
          775: 'one-minus-dst',
          776: 'src-alpha-saturated',
          32769: 'constant',
          32770: 'one-minus-constant',
          32771: 'constant',
          32772: 'one-minus-constant',
        })[value] || 'one';
      const makeBlend = f => ({
        color: { operation: 'add', srcFactor: factor(f[0]), dstFactor: factor(f[1]) },
        alpha: { operation: 'add', srcFactor: factor(f[2]), dstFactor: factor(f[3]) },
      });
      const targets = target.colors.map((item, index) =>
        item
          ? {
              format: item.texture.format,
              ...(this.colorWriteOff || this.writeOffSlots?.has(index) ? { writeMask: 0 } : {}),
              ...((blendEnabled || this.blendOverrides.has(index)) &&
              !this.blendOff.has(index) &&
              !/(?:uint|sint)$/.test(item.texture.format)
                ? { blend: makeBlend(this.blendOverrides.get(index) || this.blendFactors || [770, 771, 1, 771]) }
                : {}),
            }
          : null,
      );
      const descriptor = {
        label: program.label,
        layout: program.layout,
        vertex: { module: program.vertexModule, entryPoint: program.vertexEntry, buffers: vertices.layouts },
        fragment: {
          module: this.halfSafeFragmentModule(
            program,
            targets.map(item => item?.format),
          ),
          entryPoint: program.fragmentEntry,
          targets,
        },
        primitive: { topology: this.geometryDrawing?.topology || 'triangle-list', frontFace: 'cw', cullMode: culling },
      };
      if (target.depth)
        descriptor.depthStencil = {
          format: target.depth.format,
          depthWriteEnabled: depthEnabled && this.depthWrite,
          depthCompare: depthEnabled ? this.depthFuncName || 'less' : 'always',
        };
      if (this.irisRequestPipeline) {
        pipeline = this.irisRequestPipeline(program, key, descriptor);
        if (!pipeline) return;
      } else {
        pipeline = this.device.createRenderPipeline(descriptor);
        program.pipelines.set(key, pipeline);
      }
    }
    const passKey = target.passKey;
    if (this.passKey !== passKey) {
      this.endPass();
      const descriptor = {
        label: program.label,
        colorAttachments: target.colors.map(item =>
          item ? { view: this.view(item.texture, item.level, 1), loadOp: 'load', storeOp: 'store' } : null,
        ),
      };
      if (target.depth)
        descriptor.depthStencilAttachment = {
          view: this.view(target.depth, 0, 1),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        };
      this.pass = this.beginRender(descriptor);
      this.passKey = passKey;
      this.resetPassState();
    }
    const state = this.passState,
      viewport = this.viewportState;
    if (state.pipeline !== pipeline) {
      this.pass.setPipeline(pipeline);
      state.pipeline = pipeline;
    }
    if (
      state.viewport[0] !== viewport[0] ||
      state.viewport[1] !== viewport[1] ||
      state.viewport[2] !== viewport[2] ||
      state.viewport[3] !== viewport[3]
    ) {
      const range = this.depthRangeState || [0, 1];
      this.pass.setViewport(viewport[0], viewport[1], viewport[2], viewport[3], range[0], range[1]);
      state.viewport[0] = viewport[0];
      state.viewport[1] = viewport[1];
      state.viewport[2] = viewport[2];
      state.viewport[3] = viewport[3];
    }
    const uniformGroup =
      uniforms ||
      (program.emptyUniformGroup ??= this.device.createBindGroup({ layout: program.uniformLayout, entries: [] }));
    const dynamicOffset = uniforms ? program.uniformOffset : -1;
    if (state.groups[0] !== uniformGroup || state.dynamicOffset !== dynamicOffset) {
      if (uniforms) {
        program.offsetArray ??= [0];
        program.offsetArray[0] = program.uniformOffset;
        this.pass.setBindGroup(0, uniformGroup, program.offsetArray);
      } else this.pass.setBindGroup(0, uniformGroup);
      state.groups[0] = uniformGroup;
      state.dynamicOffset = dynamicOffset;
    }
    if (state.groups[1] !== textures) {
      this.pass.setBindGroup(1, textures);
      state.groups[1] = textures;
    }
    if (images && state.groups[2] !== images) {
      this.pass.setBindGroup(2, images);
      state.groups[2] = images;
    }
    if (buffers && state.groups[3] !== buffers) {
      this.pass.setBindGroup(3, buffers);
      state.groups[3] = buffers;
    }
    const vertexBuffers = vertices.buffers;
    for (let index = 0; index < vertexBuffers.length; index++)
      if (state.vertexBuffers[index] !== vertexBuffers[index]) {
        this.pass.setVertexBuffer(index, vertexBuffers[index]);
        state.vertexBuffers[index] = vertexBuffers[index];
      }
    if (this.geometryDrawing) {
      const drawing = this.geometryDrawing;
      this.pass.setIndexBuffer(drawing.indices, 'uint32');
      state.indexBuffer = drawing.indices;
      state.indexFormat = 'uint32';
      this.pass.drawIndexedIndirect(drawing.args, drawing.argsOffset || 0);
    } else if (indexed) {
      const buffer = this.vao?.index || this.indexBuffer,
        format = type === this.UNSIGNED_INT ? 'uint32' : 'uint16';
      if (state.indexBuffer !== buffer.gpu || state.indexFormat !== format) {
        this.pass.setIndexBuffer(buffer.gpu, format);
        state.indexBuffer = buffer.gpu;
        state.indexFormat = format;
      }
      this.pass.drawIndexed(count, 1, offset / (type === this.UNSIGNED_INT ? 4 : 2), 0, 0);
    } else this.pass.draw(count, 1, offset, 0);
    if (this.wgpuWireMatch?.(program))
      this.wireDraw(
        program,
        target,
        vertices,
        [uniformGroup, textures, images, buffers],
        uniforms ? program.uniformOffset : -1,
        indexed,
        count,
        type,
        offset,
        culling,
      );
    for (const item of target.colors) if (item) item.texture.version++;
    if (target.depth && depthEnabled && this.depthWrite) target.depth.version++;
    this.markImageWrites(program);
  }
  wireDraw(program, target, vertices, groups, dynamicOffset, indexed, count, type, offset, culling) {
    if (!this.device.features.has('primitive-index')) return;
    const topology = this.geometryDrawing?.topology || 'triangle-list';
    if (!/^triangle/.test(topology)) return;
    const size = target.colors.find(Boolean)?.texture || target.depth;
    if (!size) return;
    const w = (this.wireOverlay ??= { frame: -1 });
    if (!w.ids || w.width !== size.width || w.height !== size.height) {
      w.ids?.destroy();
      w.depth?.destroy();
      w.ids = this.device.createTexture({
        label: 'Triangle edges: ids',
        size: [size.width, size.height],
        format: 'r32uint',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      w.depth = this.device.createTexture({
        label: 'Triangle edges: depth',
        size: [size.width, size.height],
        format: 'depth32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      w.width = size.width;
      w.height = size.height;
      w.frame = -1;
      w.group = null;
    }
    w.module ??= this.device.createShaderModule({
      label: 'Triangle edges: ids',
      code: 'enable primitive_index;\n@fragment fn main(@builtin(primitive_index) p:u32)->@location(0) vec4<u32>{return vec4<u32>(p+1u,0u,0u,1u);}',
    });
    const key = vertices.key + '|' + topology + '|' + culling;
    program.wirePipelines ??= new Map();
    if (!program.wirePipelines.has(key)) {
      program.wirePipelines.set(key, null);
      this.device
        .createRenderPipelineAsync({
          label: program.label + ' (triangle edges)',
          layout: program.layout,
          vertex: { module: program.vertexModule, entryPoint: program.vertexEntry, buffers: vertices.layouts },
          fragment: { module: w.module, entryPoint: 'main', targets: [{ format: 'r32uint' }] },
          primitive: { topology, frontFace: 'cw', cullMode: culling },
          depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less-equal' },
        })
        .then(pipeline => {
          program.wirePipelines.set(key, pipeline);
          this.onWireReady?.();
        })
        .catch(error => {
          program.wirePipelines.set(key, false);
          console.warn('Triangle edges: ' + program.label + ': ' + error.message);
        });
    }
    const pipeline = program.wirePipelines.get(key);
    if (!pipeline) return;
    const first = w.frame !== this.frame;
    w.frame = this.frame;
    this.endPass();
    const pass = this.commandEncoder().beginRenderPass({
      label: 'Triangle edges',
      colorAttachments: [
        { view: w.ids.createView(), loadOp: first ? 'clear' : 'load', clearValue: [0, 0, 0, 0], storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: w.depth.createView(),
        depthLoadOp: first ? 'clear' : 'load',
        depthClearValue: 1,
        depthStoreOp: 'store',
      },
    });
    const vp = this.viewportState,
      range = this.depthRangeState || [0, 1];
    if (vp[2] > 0 && vp[3] > 0) pass.setViewport(vp[0], vp[1], vp[2], vp[3], range[0], range[1]);
    pass.setPipeline(pipeline);
    if (dynamicOffset >= 0) pass.setBindGroup(0, groups[0], [dynamicOffset]);
    else pass.setBindGroup(0, groups[0]);
    for (let g = 1; g < 4; g++) if (groups[g]) pass.setBindGroup(g, groups[g]);
    vertices.buffers.forEach((buffer, index) => pass.setVertexBuffer(index, buffer));
    if (this.geometryDrawing) {
      pass.setIndexBuffer(this.geometryDrawing.indices, 'uint32');
      pass.drawIndexedIndirect(this.geometryDrawing.args, this.geometryDrawing.argsOffset || 0);
    } else if (indexed) {
      const buffer = this.vao?.index || this.indexBuffer;
      pass.setIndexBuffer(buffer.gpu, type === this.UNSIGNED_INT ? 'uint32' : 'uint16');
      pass.drawIndexed(count, 1, offset / (type === this.UNSIGNED_INT ? 4 : 2), 0, 0);
    } else pass.draw(count, 1, offset, 0);
    pass.end();
  }
  wireComposite() {
    const w = this.wireOverlay;
    if (!w?.ids || w.frame !== this.frame || !this.output?.gpu) return;
    this.endPass();
    const format = this.output.format || 'rgba8unorm';
    if (!w.composite || w.compositeFormat !== format) {
      const module = this.device.createShaderModule({
        label: 'Triangle edges: lines',
        code: `
@group(0) @binding(0) var ids:texture_2d<u32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.0-1.0,1.0-y*2.0,0.0,1.0);}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let size=vec2i(textureDimensions(ids));let out=vec2f(OUT_W,OUT_H);
  let c=clamp(vec2i(p.xy/out*vec2f(size)),vec2i(0),size-1);  // the id image is top-down like the screen
  let a=textureLoad(ids,c,0).r;
  let r=textureLoad(ids,clamp(c+vec2i(1,0),vec2i(0),size-1),0).r;
  let d=textureLoad(ids,clamp(c+vec2i(0,1),vec2i(0),size-1),0).r;
  if((a==r&&a==d)||(a==0u&&r==0u&&d==0u)){discard;}
  return vec4f(1.0,0.86,0.25,1.0);
}`
          .replace('OUT_W', this.output.width.toFixed(1))
          .replace('OUT_H', this.output.height.toFixed(1)),
      });
      w.composite = this.device.createRenderPipeline({
        label: 'Triangle edges: lines',
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      w.compositeFormat = format;
      w.group = null;
      w.outSize = this.output.width + 'x' + this.output.height;
    }
    if (w.outSize !== this.output.width + 'x' + this.output.height) {
      w.composite = null;
      return this.wireComposite();
    }
    if (!w.group || w.groupIds !== w.ids) {
      w.group = this.device.createBindGroup({
        layout: w.composite.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: w.ids.createView() }],
      });
      w.groupIds = w.ids;
    }
    const pass = this.commandEncoder().beginRenderPass({
      label: 'Triangle edges: lines',
      colorAttachments: [{ view: this.view(this.output, 0, 1), loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(w.composite);
    pass.setBindGroup(0, w.group);
    pass.draw(3);
    pass.end();
    this.output.version = (this.output.version || 0) + 1;
  }
  drawElements(mode, count, type, offset) {
    this.draw(true, count, type, offset);
  }
  drawArrays(mode, first, count) {
    this.draw(false, count, null, first);
  }

  static STORAGE_FORMATS = {
    r8: 'r32float',
    r16: 'r32float',
    r16f: 'r32float',
    r32f: 'r32float',
    rg8: 'rgba8unorm',
    rg16: 'rgba32float',
    rg16f: 'rgba16float',
    rg32f: 'rgba32float',
    rgb8: 'rgba8unorm',
    rgba8: 'rgba8unorm',
    rgb16: 'rgba16float',
    rgba16: 'rgba16float',
    rgb16f: 'rgba16float',
    rgba16f: 'rgba16float',
    rgb32f: 'rgba32float',
    rgba32f: 'rgba32float',
    rgb10_a2: 'rgba16float',
    r11f_g11f_b10f: 'rgba16float',
    r8_snorm: 'r32float',
    rg8_snorm: 'rg32float',
    rgba8_snorm: 'rgba8snorm',
    r8ui: 'r32uint',
    r16ui: 'r32uint',
    r32ui: 'r32uint',
    rg8ui: 'rgba8uint',
    rg16ui: 'rgba16uint',
    rg32ui: 'rgba32uint',
    rgba8ui: 'rgba8uint',
    rgba16ui: 'rgba16uint',
    rgba32ui: 'rgba32uint',
    r8i: 'r32sint',
    r16i: 'r32sint',
    r32i: 'r32sint',
    rg8i: 'rgba8sint',
    rg16i: 'rgba16sint',
    rg32i: 'rgba32sint',
    rgba8i: 'rgba8sint',
    rgba16i: 'rgba16sint',
    rgba32i: 'rgba32sint',
  };
  configurePackResources({ images = [], buffers = [] }, screenWidth, screenHeight) {
    this.endPass();
    const newImages = this.packResourceSpec?.images !== images,
      newBuffers = this.packResourceSpec?.buffers !== buffers;
    this.packResourceSpec = { images, buffers };
    const wanted = new Set(images.map(image => image.name));
    for (const [name, image] of this.customImages)
      if (!wanted.has(name)) {
        this.deleteTexture(image.texture);
        this.customImages.delete(name);
      }
    this.samplerImages.clear();
    for (const spec of images) {
      const format = IrisWebGPU.STORAGE_FORMATS[spec.format.toLowerCase()];
      if (!format) throw new Error('image.' + spec.name + ': Format ' + spec.format + ' wird nicht unterstützt.');
      const dimension = spec.size.length >= 3 && !spec.relative ? '3d' : '2d';
      const [w, h, d] = spec.relative
        ? [Math.max(1, Math.floor(screenWidth * spec.size[0])), Math.max(1, Math.floor(screenHeight * spec.size[1])), 1]
        : [spec.size[0], spec.size[1] ?? 1, dimension === '3d' ? spec.size[2] : 1];
      const limit =
        dimension === '3d' ? this.device.limits.maxTextureDimension3D : this.device.limits.maxTextureDimension2D;
      if (!(w > 0 && h > 0 && d > 0) || Math.max(w, h, d) > limit)
        throw new Error(
          'image.' + spec.name + ': Größe ' + [w, h, d].join('×') + ' überschreitet die WebGPU-Grenze ' + limit + '.',
        );
      let image = this.customImages.get(spec.name);
      if (
        newImages ||
        !image ||
        image.format !== format ||
        image.dimension !== dimension ||
        image.texture.width !== w ||
        image.texture.height !== h ||
        image.texture.depth !== d
      ) {
        if (image) this.deleteTexture(image.texture);
        const texture = this.createTexture();
        texture.gpu = null;
        this.allocateTexture(texture, w, h, d, format, 1, dimension, GPUTextureUsage.STORAGE_BINDING);
        const filterable =
          /float$/.test(format) && (!/32float$/.test(format) || this.device.features.has('float32-filterable'));
        texture.params.set(this.TEXTURE_MIN_FILTER, filterable ? this.LINEAR : this.NEAREST);
        texture.params.set(this.TEXTURE_MAG_FILTER, filterable ? this.LINEAR : this.NEAREST);
        for (const wrap of [this.TEXTURE_WRAP_S, this.TEXTURE_WRAP_T, this.TEXTURE_WRAP_R])
          texture.params.set(wrap, this.CLAMP_TO_EDGE);
        texture.gpu.label = 'Image ' + spec.name;
        image = { name: spec.name, texture, format, dimension };
        this.customImages.set(spec.name, image);
      }
      Object.assign(image, { clear: !!spec.clear, sampler: spec.sampler, relative: !!spec.relative });
      if (spec.sampler && spec.sampler !== 'none') this.samplerImages.set(spec.sampler, image);
    }
    const bindings = new Set(buffers.map(buffer => buffer.binding));
    for (const [binding, buffer] of this.storageBuffers)
      if (!bindings.has(binding)) {
        this.retire(buffer);
        this.storageBuffers.delete(binding);
      }
    this.clearedStorageBindings = buffers.filter(buffer => buffer.clear).map(buffer => buffer.binding);
    for (const { binding, size, relative, scaleX = 1, scaleY = 1, content } of buffers) {
      const requested = relative ? size * Math.floor(screenWidth * scaleX) * Math.floor(screenHeight * scaleY) : size;
      if (!Number.isSafeInteger(requested) || requested < 0) throw new Error('Ungültige SSBO-Größe');
      const bytes = Math.max(16, Math.ceil(requested / 16) * 16);
      if (bytes > this.device.limits.maxStorageBufferBindingSize || bytes > this.device.limits.maxBufferSize)
        throw new Error(
          'bufferObject.' +
            binding +
            ': ' +
            Math.round(bytes / 1048576) +
            ' MB überschreitet die WebGPU-Grenze dieses Geräts (' +
            Math.round(
              Math.min(this.device.limits.maxStorageBufferBindingSize, this.device.limits.maxBufferSize) / 1048576,
            ) +
            ' MB).',
        );
      const prior = this.storageBuffers.get(binding);
      if (prior?.size === bytes && !newBuffers) continue;
      if (prior) this.retire(prior);
      const buffer = this.device.createBuffer({
        label: 'SSBO ' + binding,
        size: bytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this.storageBuffers.set(binding, buffer);
      if (content) {
        const upload = new Uint8Array(Math.ceil(content.byteLength / 4) * 4);
        upload.set(content);
        if (upload.byteLength > bytes) throw new Error('SSBO-Inhalt größer als Puffer');
        this.device.queue.writeBuffer(buffer, 0, upload);
      }
    }
    this.bufferGeneration = (this.bufferGeneration || 0) + 1;
  }
  customImageBySampler(name) {
    const image = this.samplerImages.get(name);
    return image ? { texture: image.texture, dimension: image.dimension, unsigned: /uint$/.test(image.format) } : null;
  }
  async readStorageBuffer(binding, byteOffset = 0, byteLength = 4096) {
    const buffer = this.storageBuffers.get(binding);
    if (!buffer) return null;
    const offset = Math.max(0, Math.min(buffer.size - 4, Math.floor(byteOffset / 4) * 4));
    const size = Math.min(Math.ceil(byteLength / 4) * 4, buffer.size - offset);
    if (size < 4) return null;
    const staging = this.device.createBuffer({
      label: 'Readback SSBO ' + binding,
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.endPass();
    const encoder = this.device.createCommandEncoder({ label: 'Readback SSBO ' + binding });
    encoder.copyBufferToBuffer(buffer, offset, staging, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const words = new Uint32Array(staging.getMappedRange()).slice();
    staging.unmap();
    staging.destroy();
    return { words, offset, total: buffer.size };
  }
  async readTexturePixels(texture, x, y, width, height) {
    if (!texture?.gpu) return null;
    const source = texture.isDepth ? this.rawDepth(texture) : texture;
    const format = source.format;
    const layout = {
      r32uint: [4, 'u32'],
      r32sint: [4, 'i32'],
      r32float: [4, 'f32'],
      rgba16float: [8, 'f16'],
      rgba32float: [16, 'f32'],
      rgba8unorm: [4, 'u8'],
      rgba8snorm: [4, 's8'],
      rg11b10ufloat: [4, 'b10'],
      rgba16unorm: [8, 'u16'],
      bgra8unorm: [4, 'bgra'],
      rgb10a2unorm: [4, 'rgb10a2'],
      rgba32uint: [16, 'u32x4'],
      rgba32sint: [16, 'i32x4'],
    }[format];
    if (!layout) return { format, unsupported: true };
    const [stride, kind] = layout;
    const at = [Math.max(0, Math.min(source.width - 1, x | 0)), Math.max(0, Math.min(source.height - 1, y | 0))];
    const box = [
      Math.max(1, Math.min(width | 0, source.width - at[0])),
      Math.max(1, Math.min(height | 0, source.height - at[1])),
    ];
    const bytesPerRow = Math.ceil((box[0] * stride) / 256) * 256;
    const buffer = this.device.createBuffer({
      label: 'Pixel-Readback',
      size: bytesPerRow * box[1],
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.endPass();
    const encoder = this.device.createCommandEncoder({ label: 'Pixel-Readback' });
    encoder.copyTextureToBuffer(
      { texture: source.gpu, origin: { x: at[0], y: at[1], z: 0 } },
      { buffer, bytesPerRow, rowsPerImage: box[1] },
      { width: box[0], height: box[1], depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange()).slice();
    buffer.unmap();
    buffer.destroy();
    const half = value => {
      const sign = value >> 15 ? -1 : 1,
        exponent = (value >> 10) & 31,
        mantissa = value & 1023;
      if (!exponent) return sign * mantissa * 5.9604644775390625e-8;
      if (exponent === 31) return mantissa ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    };
    const small = (bits, mantissaBits, exponentBias) => {
      const exponent = bits >> mantissaBits,
        mantissa = bits & ((1 << mantissaBits) - 1),
        scale = 1 << mantissaBits;
      if (!exponent) return (mantissa / scale) * Math.pow(2, 1 - exponentBias);
      if (exponent === 31) return mantissa ? NaN : Infinity;
      return Math.pow(2, exponent - exponentBias) * (1 + mantissa / scale);
    };
    const words = new Uint32Array(bytes.buffer),
      shorts = new Uint16Array(bytes.buffer),
      floats = new Float32Array(bytes.buffer),
      signed = new Int8Array(bytes.buffer);
    const texels = [];
    for (let row = 0; row < box[1]; row++) {
      const base = row * bytesPerRow;
      for (let column = 0; column < box[0]; column++) {
        const offset = base + column * stride;
        if (kind === 'u32') texels.push([words[offset / 4], 0, 0, 0]);
        else if (kind === 'u32x4')
          texels.push([words[offset / 4], words[offset / 4 + 1], words[offset / 4 + 2], words[offset / 4 + 3]]);
        else if (kind === 'i32x4') {
          const ints = new Int32Array(bytes.buffer);
          texels.push([ints[offset / 4], ints[offset / 4 + 1], ints[offset / 4 + 2], ints[offset / 4 + 3]]);
        } else if (kind === 'i32') texels.push([new Int32Array(bytes.buffer)[offset / 4], 0, 0, 0]);
        else if (kind === 'f32')
          texels.push([
            floats[offset / 4],
            floats[offset / 4 + 1] || 0,
            floats[offset / 4 + 2] || 0,
            floats[offset / 4 + 3] || 0,
          ]);
        else if (kind === 'f16')
          texels.push([
            half(shorts[offset / 2]),
            half(shorts[offset / 2 + 1]),
            half(shorts[offset / 2 + 2]),
            half(shorts[offset / 2 + 3]),
          ]);
        else if (kind === 'u16')
          texels.push([
            shorts[offset / 2] / 65535,
            shorts[offset / 2 + 1] / 65535,
            shorts[offset / 2 + 2] / 65535,
            shorts[offset / 2 + 3] / 65535,
          ]);
        else if (kind === 's8')
          texels.push([
            signed[offset] / 127,
            signed[offset + 1] / 127,
            signed[offset + 2] / 127,
            signed[offset + 3] / 127,
          ]);
        else if (kind === 'bgra')
          texels.push([bytes[offset + 2] / 255, bytes[offset + 1] / 255, bytes[offset] / 255, bytes[offset + 3] / 255]);
        else if (kind === 'rgb10a2') {
          const value = words[offset / 4];
          texels.push([
            (value & 1023) / 1023,
            ((value >> 10) & 1023) / 1023,
            ((value >> 20) & 1023) / 1023,
            (value >>> 30) / 3,
          ]);
        } else if (kind === 'b10') {
          const value = words[offset / 4];
          texels.push([
            small(value & 2047, 6, 15),
            small((value >> 11) & 2047, 6, 15),
            small((value >> 22) & 1023, 5, 15),
            1,
          ]);
        } else
          texels.push([bytes[offset] / 255, bytes[offset + 1] / 255, bytes[offset + 2] / 255, bytes[offset + 3] / 255]);
      }
    }
    return { format, box, origin: at, texels, size: [source.width, source.height] };
  }
  async readCustomImage(name, origin, size) {
    const image = this.customImages.get(name);
    if (!image) return null;
    const texture = image.texture,
      format = image.format;
    const layout = {
      r32uint: [4, 'u32'],
      r32sint: [4, 'i32'],
      r32float: [4, 'f32'],
      rgba16float: [8, 'f16'],
      rgba32float: [16, 'f32'],
      rgba8unorm: [4, 'u8'],
    }[format];
    if (!layout) return null;
    const [stride, kind] = layout;
    if (!origin)
      origin = [texture.width, texture.height, texture.depth].map((value, index) =>
        Math.floor((value - size[index]) / 2),
      );
    const at = [
      Math.max(0, Math.min(texture.width - 1, origin[0] | 0)),
      Math.max(0, Math.min(texture.height - 1, origin[1] | 0)),
      Math.max(0, Math.min(texture.depth - 1, origin[2] | 0)),
    ];
    const box = [
      Math.min(size[0], texture.width - at[0]),
      Math.min(size[1], texture.height - at[1]),
      Math.min(size[2], texture.depth - at[2]),
    ];
    if (box.some(value => value < 1)) return null;
    const bytesPerRow = Math.ceil((box[0] * stride) / 256) * 256;
    const buffer = this.device.createBuffer({
      label: 'Readback ' + name,
      size: bytesPerRow * box[1] * box[2],
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.endPass();
    const encoder = this.device.createCommandEncoder({ label: 'Readback ' + name });
    encoder.copyTextureToBuffer(
      { texture: texture.gpu, origin: { x: at[0], y: at[1], z: at[2] } },
      { buffer, bytesPerRow, rowsPerImage: box[1] },
      { width: box[0], height: box[1], depthOrArrayLayers: box[2] },
    );
    this.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange()).slice();
    buffer.unmap();
    buffer.destroy();
    const half = value => {
      const sign = value >> 15 ? -1 : 1,
        exponent = (value >> 10) & 31,
        mantissa = value & 1023;
      if (!exponent) return sign * mantissa * 5.9604644775390625e-8;
      if (exponent === 31) return mantissa ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    };
    const words = new Uint32Array(bytes.buffer),
      shorts = new Uint16Array(bytes.buffer),
      floats = new Float32Array(bytes.buffer);
    const texels = [];
    for (let z = 0; z < box[2]; z++)
      for (let y = 0; y < box[1]; y++) {
        const base = (z * box[1] + y) * bytesPerRow;
        for (let x = 0; x < box[0]; x++) {
          const offset = base + x * stride;
          if (kind === 'u32') texels.push([words[offset / 4], 0, 0, 0]);
          else if (kind === 'i32') texels.push([new Int32Array(bytes.buffer)[offset / 4], 0, 0, 0]);
          else if (kind === 'f32')
            texels.push([
              floats[offset / 4],
              floats[offset / 4 + 1] || 0,
              floats[offset / 4 + 2] || 0,
              floats[offset / 4 + 3] || 0,
            ]);
          else if (kind === 'f16')
            texels.push([
              half(shorts[offset / 2]),
              half(shorts[offset / 2 + 1]),
              half(shorts[offset / 2 + 2]),
              half(shorts[offset / 2 + 3]),
            ]);
          else
            texels.push([
              bytes[offset] / 255,
              bytes[offset + 1] / 255,
              bytes[offset + 2] / 255,
              bytes[offset + 3] / 255,
            ]);
        }
      }
    return { format, box, origin: at, texels, size: [texture.width, texture.height, texture.depth] };
  }
  resizePackResources(screenWidth, screenHeight) {
    const relative =
      [...this.customImages.values()].some(image => image.relative) ||
      (this.packResourceSpec?.buffers || []).some(buffer => buffer.relative);
    if (!relative) return;
    this.configurePackResources(this.packResourceSpec || {}, screenWidth, screenHeight);
  }
  clearCustomImages() {
    for (const binding of this.clearedStorageBindings || []) {
      const buffer = this.storageBuffers.get(binding);
      if (buffer) {
        this.endPass();
        this.commandEncoder().clearBuffer(buffer);
      }
    }
    const images = [...this.customImages.values()].filter(image => image.clear);
    if (!images.length) return;
    this.endPass();
    const pass = this.beginCompute({ label: 'Clear custom images' });
    for (const image of images) {
      const key = image.format + ':' + image.dimension;
      let pipeline = this.clearPipelines.get(key);
      if (!pipeline) {
        const scalar = /uint$/.test(image.format) ? 'u32' : /sint$/.test(image.format) ? 'i32' : 'f32',
          three = image.dimension === '3d';
        const code = `@group(0) @binding(0) var image:texture_storage_${three ? '3d' : '2d'}<${image.format},write>;
@compute @workgroup_size(${three ? '4,4,4' : '8,8,1'}) fn main(@builtin(global_invocation_id) id:vec3u){
  let size=textureDimensions(image);
  ${three ? 'if(any(id>=size)){return;} textureStore(image,id,vec4<' + scalar + '>());' : 'if(any(id.xy>=size)){return;} textureStore(image,id.xy,vec4<' + scalar + '>());'}
}`;
        pipeline = this.device.createComputePipeline({
          label: 'Clear ' + key,
          layout: 'auto',
          compute: { module: this.irisShaderModule({ code }), entryPoint: 'main' },
        });
        this.clearPipelines.set(key, pipeline);
      }
      const t = image.texture,
        three = image.dimension === '3d';
      pass.setPipeline(pipeline);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: this.storageView(t) }],
        }),
      );
      pass.dispatchWorkgroups(
        Math.ceil(t.width / (three ? 4 : 8)),
        Math.ceil(t.height / (three ? 4 : 8)),
        three ? Math.ceil(t.depth / 4) : 1,
      );
      t.version++;
      t.clearedVersion = t.version;
    }
    pass.end();
  }
  dispatchCompute(program, x, y, z, indirect = null) {
    if (this.viewerDisabledPrograms?.has(program)) return;
    if (!this.viewerMonitoring) return this.viewerDispatch(program, x, y, z, indirect);
    return this.viewerTime('compute:' + program.label, () => this.viewerDispatch(program, x, y, z, indirect));
  }
  viewerDispatch(program, x, y, z, indirect = null) {
    if (!program?.computePipeline) throw new Error('Kein Compute-Programm.');
    this.endPass();
    let indirectArgs = null;
    if (indirect) {
      const source = this.storageBuffers.get(indirect.buffer);
      if (!source || indirect.offset < 0 || indirect.offset % 4 || indirect.offset + 12 > source.size) return;
      this.indirectArgs ??= [];
      this.indirectCursor = (this.indirectCursor || 0) % 64;
      indirectArgs = this.indirectArgs[this.indirectCursor] ??= this.device.createBuffer({
        label: 'Indirect dispatch ' + this.indirectCursor,
        size: 16,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      });
      this.indirectCursor++;
      this.commandEncoder().copyBufferToBuffer(source, indirect.offset, indirectArgs, 0, 12);
    }
    const limit = this.device.limits.maxComputeWorkgroupsPerDimension;
    if (!indirectArgs && (x > limit || y > limit || z > limit))
      throw new Error(program.label + ': Dispatch ' + [x, y, z].join('×') + ' überschreitet ' + limit + '.');
    let target = program,
      pipeline = program.computePipeline;
    if (program.parityVariants) {
      const field = program.fields.find(f => f.name === 'framemod2');
      let value = 0;
      if (field)
        value = /^(?:int|uint)/.test(field.type)
          ? program.dataView.getInt32(field.offset, true)
          : program.dataView.getFloat32(field.offset, true);
      target = program.parityVariants[Math.round(value) & 1];
      pipeline = target.pipeline;
    }
    const storage = this.storageTextures(target),
      textures = this.bindTextures(program, target, storage),
      uniforms = this.bindUniforms(program);
    const images = target.groupLayouts.length > 2 ? this.bindImages(target) : null,
      buffers = target.groupLayouts.length > 3 ? this.bindBuffers(target) : null;
    let uniformGroup = uniforms;
    if (uniforms && target !== program)
      uniformGroup = target.uniformGroup ??= this.device.createBindGroup({
        label: target.label + ' uniforms',
        layout: target.uniformLayout,
        entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
      });
    const pass = this.beginCompute({ label: 'Compute ' + target.label });
    pass.setPipeline(pipeline);
    if (uniformGroup && target.bindings.some(b => b.group === 0))
      pass.setBindGroup(0, uniformGroup, [program.uniformOffset]);
    else pass.setBindGroup(0, this.device.createBindGroup({ layout: target.uniformLayout, entries: [] }));
    pass.setBindGroup(1, textures);
    if (images) pass.setBindGroup(2, images);
    if (buffers) pass.setBindGroup(3, buffers);
    if (indirectArgs) pass.dispatchWorkgroupsIndirect(indirectArgs, 0);
    else pass.dispatchWorkgroups(x, y, z);
    pass.end();
    this.markImageWrites(target);
  }
  queueVertexWrites(program, indexed, count, type, offset, uniforms) {
    const variant = program.vertexWrites,
      vao = this.vao;
    const attributes = [...(vao?.attributes.values() || [])],
      buffer = attributes[0]?.buffer;
    if (!buffer?.gpu) return;
    const indexData = indexed ? vao.index || this.indexBuffer : null;
    const cacheKey =
      variant.label + '|' + (indexed ? type : '-') + '|' + offset + '|' + count + '|' + (this.bufferGeneration || 0);
    vao.writeCache ??= new Map();
    let entry = vao.writeCache.get(cacheKey);
    if (entry && (entry.vertexGpu !== buffer.gpu || entry.indexGpu !== indexData?.gpu)) entry = null;
    if (!entry) {
      const stride = attributes[0].stride;
      if (stride % 4) throw new Error(program.label + ': Vertex-Stride muss durch 4 teilbar sein.');
      const layout = new Uint32Array(20).fill(0xffffffff);
      for (let location = 0; location < 16; location++) {
        const a = vao.attributes.get(location);
        if (!a || a.buffer !== buffer || a.stride !== stride || a.type !== this.FLOAT || a.offset % 4) continue;
        layout[4 + location] = (a.offset / 4) | (a.size << 16);
      }
      const wide = type === this.UNSIGNED_INT;
      let first = indexed ? offset / (wide ? 4 : 2) : offset,
        mode = indexed ? (wide ? 2 : 1) : 0,
        n = count;
      if (indexData?.cpu) {
        let lo = Infinity,
          hi = -1;
        const data = indexData.cpu;
        for (let i = first; i < first + count && i < data.length; i++) {
          const v = data[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi >= lo && hi - lo + 1 <= count) {
          first = lo;
          n = hi - lo + 1;
          mode = 0;
        }
      }
      layout.set([n, first, mode, stride / 4], 0);
      if (Math.ceil(n / 64) > this.device.limits.maxComputeWorkgroupsPerDimension)
        throw new Error(program.label + ': zu viele Vertices für einen Durchlauf.');
      const params = this.device.createBuffer({
        label: 'Vertex fetch',
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(params, 0, layout);
      this.dummyStorage ??= this.device.createBuffer({
        label: 'Empty storage',
        size: 16,
        usage: GPUBufferUsage.STORAGE,
      });
      const group3 = this.device.createBindGroup({
        label: variant.label + ' fetch',
        layout: variant.bufferLayout,
        entries: this.bufferEntriesFor(variant, [
          { binding: 30, resource: { buffer: buffer.gpu } },
          { binding: 31, resource: { buffer: indexData?.gpu || this.dummyStorage } },
          { binding: 32, resource: { buffer: params } },
        ]),
      });
      if (vao.writeCache.size > 16) {
        for (const old of vao.writeCache.values()) this.retire(old.params);
        vao.writeCache.clear();
      }
      entry = { count: n, group3, params, vertexGpu: buffer.gpu, indexGpu: indexData?.gpu };
      vao.writeCache.set(cacheKey, entry);
    }
    const storage = this.storageTextures(variant);
    const textures = this.bindTextures(program, variant, storage, true);
    const images = variant.groupLayouts.length > 2 ? this.bindImages(variant) : null;
    variant.uniformGroup ??= variant.bindings.some(b => b.group === 0)
      ? this.device.createBindGroup({
          label: variant.label + ' uniforms',
          layout: variant.uniformLayout,
          entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
        })
      : this.device.createBindGroup({ layout: variant.uniformLayout, entries: [] });
    this.pendingVertexCompute.push({
      variant,
      count: entry.count,
      uniformOffset: uniforms ? program.uniformOffset : null,
      textures,
      images,
      group3: entry.group3,
    });
  }
  drawTessellation(indexed, count, type, offset) {
    const program = this.program,
      geometry = program.geometry,
      vao = this.vao;
    const attributes = [...(vao?.attributes.values() || [])],
      buffer = attributes[0]?.buffer;
    if (!buffer?.gpu) return;
    const stride = attributes[0].stride;
    if (stride % 4) throw new Error(program.label + ': Vertex-Stride muss durch 4 teilbar sein.');
    const indexData = indexed ? vao.index || this.indexBuffer : null,
      wide = type === this.UNSIGNED_INT;
    const first = indexed ? offset / (wide ? 4 : 2) : offset,
      mode = indexed ? (wide ? 2 : 1) : 0;
    const patches = Math.floor(count / 3);
    if (!patches) return;
    const limit = Math.min(this.device.limits.maxStorageBufferBindingSize, 1 << 27),
      maxRounds = 4;
    const captureSlots = geometry.capture.slots,
      controlSlots = geometry.control.slots,
      outSlots = geometry.outSlots,
      teSlots = geometry.teSlots || outSlots;
    const average = geometry.pointsPerPatch || 64,
      tessSize = geometry.tessSize || 3;
    const vertexBudget = Math.floor(limit / (outSlots * 16)),
      indexBudget = Math.floor(limit / 4 / 6) * 6;
    const pointBudget = geometry.chain ? Math.floor(limit / (teSlots * 16)) : vertexBudget;
    const chunk = Math.max(
      1,
      Math.min(
        Math.floor(limit / (3 * captureSlots * 16)),
        Math.floor(limit / (controlSlots * 16)),
        Math.floor((65535 * 64) / 3),
        Math.floor(pointBudget / average),
        Math.floor((limit / 4 - 12) / 2),
      ),
    );
    const scratch = (this.tessScratch ??= { generation: 0 });
    const grow = (name, bytes, usage) => {
      bytes = Math.max(256, Math.ceil(bytes / 256) * 256);
      if (!scratch[name] || scratch[name].size < bytes) {
        if (scratch[name]) this.retire(scratch[name]);
        scratch[name] = this.device.createBuffer({ label: 'Tessellation ' + name, size: bytes, usage });
        scratch.generation++;
      }
      return scratch[name];
    };
    scratch.tessCounters ??= this.device.createBuffer({
      label: 'Tessellation counters',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    scratch.args ??= this.device.createBuffer({
      label: 'Tessellation draw arguments',
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    scratch.evalArgs ??= this.device.createBuffer({
      label: 'Tessellation evaluation dispatch',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    scratch.overflowArgs ??= this.device.createBuffer({
      label: 'Tessellation overflow dispatch',
      size: 16,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    if (geometry.chain)
      scratch.gsCounters ??= this.device.createBuffer({
        label: 'Tessellation geometry counters',
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    if (geometry.chain)
      scratch.teCounts ??= this.device.createBuffer({
        label: 'Tessellation counts',
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      });
    this.dummyStorage ??= this.device.createBuffer({ label: 'Empty storage', size: 16, usage: GPUBufferUsage.STORAGE });
    const variants = [
      program.geometryCapture,
      program.geometryControl,
      program.geometryEvaluation,
      program.geometryShader,
    ].filter(Boolean);
    const needsUniforms = variants.some(v => v.bindings.some(b => b.group === 0));
    if (
      needsUniforms &&
      (program.lastUniformFrame !== this.frame || program.lastUniformRevision !== program.revision)
    ) {
      const alignment = this.device.limits.minUniformBufferOffsetAlignment;
      this.uniformCursor = Math.ceil(this.uniformCursor / alignment) * alignment;
      if (this.uniformCursor + program.uniformSize > this.uniformArena.size)
        throw new Error('WebGPU Uniform-Speicher für diesen Frame ist voll.');
      program.uniformOffset = this.uniformCursor;
      this.uniformCursor += program.uniformSize;
      this.device.queue.writeBuffer(this.uniformArena, program.uniformOffset, program.uniformData);
      program.lastUniformFrame = this.frame;
      program.lastUniformRevision = program.revision;
    }
    const uniformOffset = needsUniforms ? program.uniformOffset : null;
    const evaluation = geometry.chain ? program.geometryEvaluation : program.geometryShader;
    const perGsVertices = Math.max(1, (geometry.maxVertices || 0) * (geometry.invocations || 1)),
      perGsIndices = Math.max(0, (geometry.maxVertices || 0) - 2) * 3 * (geometry.invocations || 1);
    for (let start = 0; start < patches; start += chunk) {
      const n = Math.min(chunk, patches - start);
      const points = pointBudget,
        pointIndices = Math.min(indexBudget, points * 6);
      const capture = grow('capture', n * 3 * captureSlots * 16, GPUBufferUsage.STORAGE);
      const control = grow('control', n * controlSlots * 16, GPUBufferUsage.STORAGE);
      const overflow = grow(
        'overflow',
        (12 + 2 * n) * 4,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      );
      const pointList = grow('points', points * 16, GPUBufferUsage.STORAGE);
      let vertices,
        indices,
        teVertices = null,
        teIndices = null,
        vertexCap,
        indexCap;
      if (geometry.chain) {
        teVertices = grow('teVertices', points * teSlots * 16, GPUBufferUsage.STORAGE);
        teIndices = grow('teIndices', pointIndices * 4, GPUBufferUsage.STORAGE);
        const primitives = Math.floor(pointIndices / tessSize);
        vertexCap = Math.min(primitives * perGsVertices, vertexBudget);
        indexCap = Math.min(primitives * perGsIndices, indexBudget);
      } else {
        vertexCap = points;
        indexCap = pointIndices;
      }
      vertices = grow('vertices', vertexCap * outSlots * 16, GPUBufferUsage.STORAGE);
      indices = grow('indices', Math.max(1, indexCap) * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX);
      vao.tessCache ??= new Map();
      const key =
        program.id +
        '|' +
        mode +
        '|' +
        first +
        '|' +
        count +
        '|' +
        start +
        '|' +
        scratch.generation +
        '|' +
        (this.bufferGeneration || 0);
      let cached = vao.tessCache.get(key);
      if (cached && (cached.vertexGpu !== buffer.gpu || cached.indexGpu !== indexData?.gpu)) cached = null;
      if (!cached) {
        const layout = new Uint32Array(20).fill(0xffffffff);
        for (let location = 0; location < 16; location++) {
          const a = vao.attributes.get(location);
          if (!a || a.buffer !== buffer || a.stride !== stride || a.type !== this.FLOAT || a.offset % 4) continue;
          layout[4 + location] = (a.offset / 4) | (a.size << 16);
        }
        layout.set([n * 3, first + start * 3, mode, stride / 4], 0);
        const uniform = values => {
          const b = this.device.createBuffer({
            label: 'Tessellation parameters',
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          this.device.queue.writeBuffer(b, 0, values);
          return b;
        };
        const params = uniform(layout);
        const roundParams = Array.from({ length: maxRounds }, (_, r) => {
          const h = new Uint32Array(20);
          h.set([n, points, pointIndices, start, r, r === maxRounds - 1 ? 1 : 0], 0);
          return uniform(h);
        });
        const singleParams = (() => {
          const h = new Uint32Array(20);
          h.set([n, points, pointIndices, start, 0, 1], 0);
          return uniform(h);
        })();
        const evalParams = (() => {
          const h = new Uint32Array(20);
          h.set([n, points, pointIndices, start, 0, 1, 1], 0);
          return uniform(h);
        })();
        const tessList = [
          { binding: 42, resource: { buffer: pointList } },
          { binding: 43, resource: { buffer: scratch.evalArgs } },
        ];
        const gsParams = geometry.chain
          ? (() => {
              const h = new Uint32Array(20);
              h.set([n, vertexCap, indexCap, start], 0);
              return uniform(h);
            })()
          : null;
        const group = (variant, extra) =>
          variant?.bufferLayout
            ? this.device.createBindGroup({
                label: variant.label + ' buffers',
                layout: variant.bufferLayout,
                entries: this.bufferEntriesFor(variant, extra),
              })
            : null;
        const evalOut = geometry.chain
          ? [
              { binding: 38, resource: { buffer: teVertices } },
              { binding: 39, resource: { buffer: teIndices } },
              { binding: 40, resource: { buffer: scratch.teCounts } },
            ]
          : [
              { binding: 33, resource: { buffer: vertices } },
              { binding: 34, resource: { buffer: indices } },
              { binding: 35, resource: { buffer: scratch.args } },
              { binding: 44, resource: { buffer: scratch.tessCounters } },
            ];
        cached = {
          vertexGpu: buffer.gpu,
          indexGpu: indexData?.gpu,
          buffers: [params, ...roundParams, singleParams, evalParams, gsParams].filter(Boolean),
          rounds: 1,
          single: group(
            evaluation,
            [
              { binding: 32, resource: { buffer: singleParams } },
              { binding: 37, resource: { buffer: control } },
              { binding: 41, resource: { buffer: overflow } },
            ].concat(evalOut, tessList),
          ),
          points: group(
            evaluation,
            [
              { binding: 32, resource: { buffer: evalParams } },
              { binding: 37, resource: { buffer: control } },
              { binding: 41, resource: { buffer: overflow } },
              { binding: 42, resource: { buffer: pointList } },
              { binding: 43, resource: { buffer: this.dummyStorage } },
            ].concat(evalOut),
          ),
          capture: group(program.geometryCapture, [
            { binding: 30, resource: { buffer: buffer.gpu } },
            { binding: 31, resource: { buffer: indexData?.gpu || this.dummyStorage } },
            { binding: 32, resource: { buffer: params } },
            { binding: 36, resource: { buffer: capture } },
          ]),
          control: group(program.geometryControl, [
            { binding: 32, resource: { buffer: roundParams[0] } },
            { binding: 36, resource: { buffer: capture } },
            { binding: 37, resource: { buffer: control } },
          ]),
          evaluation: roundParams.map(p =>
            group(
              evaluation,
              [
                { binding: 32, resource: { buffer: p } },
                { binding: 37, resource: { buffer: control } },
                { binding: 41, resource: { buffer: overflow } },
              ].concat(evalOut, tessList),
            ),
          ),
          geometry: geometry.chain
            ? group(program.geometryShader, [
                { binding: 32, resource: { buffer: gsParams } },
                { binding: 33, resource: { buffer: vertices } },
                { binding: 34, resource: { buffer: indices } },
                { binding: 35, resource: { buffer: scratch.args } },
                { binding: 36, resource: { buffer: teVertices } },
                { binding: 39, resource: { buffer: teIndices } },
                { binding: 40, resource: { buffer: scratch.teCounts } },
                { binding: 42, resource: { buffer: scratch.gsCounters } },
              ])
            : null,
          render: this.device.createBindGroup({
            label: program.label + ' tessellation output',
            layout: program.bufferLayout,
            entries: this.bufferEntriesFor(program, [{ binding: 33, resource: { buffer: vertices } }]),
          }),
        };
        if (vao.tessCache.size > 64) {
          for (const old of vao.tessCache.values()) old.buffers.forEach(b => this.retire(b));
          vao.tessCache.clear();
        }
        vao.tessCache.set(key, cached);
      }
      const prepare = (variant, group3, groups, indirect, offset) => {
        const storage = this.storageTextures(variant);
        const textures = this.bindTextures(program, variant, storage, true);
        const images = variant.groupLayouts.length > 2 ? this.bindImages(variant) : null;
        variant.uniformGroup ??= variant.bindings.some(b => b.group === 0)
          ? this.device.createBindGroup({
              label: variant.label + ' uniforms',
              layout: variant.uniformLayout,
              entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
            })
          : this.device.createBindGroup({ layout: variant.uniformLayout, entries: [] });
        return { variant, textures, images, group3, groups, indirect, offset };
      };
      const rounds = cached.rounds;
      for (let round = 0; round < rounds; round++) {
        const steps = [];
        if (round === 0) {
          steps.push(prepare(program.geometryCapture, cached.capture, Math.ceil((n * 3) / 64)));
          steps.push(prepare(program.geometryControl, cached.control, Math.ceil(n / 64)));
        }
        steps.push(
          round === 0
            ? prepare(evaluation, rounds === 1 ? cached.single : cached.evaluation[0], Math.ceil(n / 64))
            : prepare(evaluation, cached.evaluation[round], 0, scratch.overflowArgs, 0),
        );
        steps.push(prepare(evaluation, cached.points, 0, scratch.evalArgs, 0));
        if (geometry.chain) steps.push(prepare(program.geometryShader, cached.geometry, 0, scratch.teCounts, 8));
        this.endPass();
        const encoder = this.commandEncoder();
        encoder.clearBuffer(scratch.args);
        encoder.clearBuffer(scratch.evalArgs);
        encoder.clearBuffer(scratch.tessCounters);
        if (geometry.chain) {
          encoder.clearBuffer(scratch.teCounts);
          encoder.clearBuffer(scratch.gsCounters);
        }
        const next = (round + 1) & 1;
        if (round === 0) encoder.clearBuffer(overflow, 0, 48);
        else {
          encoder.clearBuffer(overflow, next * 4, 4);
          encoder.clearBuffer(overflow, 16 + next * 16, 16);
          encoder.copyBufferToBuffer(overflow, 16 + (round & 1) * 16, scratch.overflowArgs, 0, 16);
        }
        const pass = this.beginCompute({ label: program.label + ' tessellation ' + round });
        for (const step of steps) {
          pass.setPipeline(step.variant.pipeline);
          if (uniformOffset !== null && step.variant.bindings.some(b => b.group === 0))
            pass.setBindGroup(0, step.variant.uniformGroup, [uniformOffset]);
          else pass.setBindGroup(0, step.variant.uniformGroup);
          pass.setBindGroup(1, step.textures);
          if (step.images || step.group3) pass.setBindGroup(2, step.images || this.emptyGroup);
          if (step.group3) pass.setBindGroup(3, step.group3);
          if (step.indirect) pass.dispatchWorkgroupsIndirect(step.indirect, step.offset);
          else if (step.groups) pass.dispatchWorkgroups(step.groups);
        }
        pass.end();
        for (const variant of variants) this.markImageWrites(variant);
        if (rounds === 1 && !cached.probing && this.frame - (cached.probed || -1e9) >= 30) {
          cached.probing = true;
          cached.probed = this.frame;
          const probe = this.device.createBuffer({
            label: 'Tessellation overflow probe',
            size: 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
          this.commandEncoder().copyBufferToBuffer(overflow, 8, probe, 0, 4);
          const entry = cached;
          this.afterSubmit ??= [];
          this.afterSubmit.push(() =>
            probe
              .mapAsync(GPUMapMode.READ)
              .then(
                () => {
                  if (new Uint32Array(probe.getMappedRange())[0] > 0) entry.rounds = maxRounds;
                  probe.unmap();
                  probe.destroy();
                },
                () => {},
              )
              .finally(() => {
                entry.probing = false;
              }),
          );
        }
        this.geometryDrawing = {
          group3: cached.render,
          indices,
          args: scratch.args,
          topology: geometry.topology || 'triangle-list',
        };
        try {
          this.draw(indexed, count, type, offset);
        } finally {
          this.geometryDrawing = null;
        }
      }
    }
  }
  geometryBatchable(program, geometry) {
    if (
      geometry.tessellation ||
      geometry.control ||
      geometry.chain ||
      program.geometryControl ||
      program.geometryEvaluation
    )
      return false;
    if (geometry.output !== 'triangle_strip' || program.vertexWrites) return false;
    if (this.storageTextures(program.geometryCapture).size || this.storageTextures(program.geometryShader).size)
      return false;
    if (program.imageLayout && this.storageTextures(program).size) return false;
    return true;
  }
  createGeometryArena(limit) {
    const slots = 512;
    const arena = {
      generation: (this.geometryArenaGeneration = (this.geometryArenaGeneration || 0) + 1),
      slots,
      groups: [],
      vertices: this.device.createBuffer({
        label: 'Geometry batch vertices',
        size: Math.floor(limit / 256) * 256,
        usage: GPUBufferUsage.STORAGE,
      }),
      indices: this.device.createBuffer({
        label: 'Geometry batch indices',
        size: Math.floor(Math.min(limit, 1 << 26) / 256) * 256,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX,
      }),
      args: this.device.createBuffer({
        label: 'Geometry batch arguments',
        size: slots * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT,
      }),
      counters: this.device.createBuffer({
        label: 'Geometry batch counters',
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      slotParams: this.device.createBuffer({
        label: 'Geometry batch slots',
        size: slots * 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    };
    const words = new Uint32Array(slots * 64);
    for (let i = 0; i < slots; i++) words[i * 64] = i;
    this.device.queue.writeBuffer(arena.slotParams, 0, words);
    const code = `@group(0) @binding(0) var<storage,read_write> counters:array<u32,4>;
@group(0) @binding(1) var<storage,read_write> args:array<u32>;
@group(0) @binding(2) var<uniform> slot:vec4u;
@compute @workgroup_size(1) fn main(){
 let s=slot.x;counters[2]=s;
 args[s*8u]=0u;args[s*8u+1u]=0u;args[s*8u+2u]=counters[1];args[s*8u+3u]=0u;args[s*8u+4u]=0u;args[s*8u+5u]=0u;
}`;
    arena.initPipeline = this.device.createComputePipeline({
      label: 'Geometry batch slot',
      layout: 'auto',
      compute: { module: this.irisShaderModule({ label: 'Geometry batch slot', code }), entryPoint: 'main' },
    });
    arena.slotGroup = slot =>
      (arena.groups[slot] ??= this.device.createBindGroup({
        label: 'Geometry batch slot ' + slot,
        layout: arena.initPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: arena.counters } },
          { binding: 1, resource: { buffer: arena.args } },
          { binding: 2, resource: { buffer: arena.slotParams, offset: slot * 256, size: 16 } },
        ],
      }));
    return arena;
  }
  openGeometryBatch(program, arena) {
    this.endPass();
    if (this.geometryBatch) this.closeGeometryBatch();
    if (this.encoder) {
      (this.pendingCommandBuffers ??= []).push(this.encoder.finish());
      this.encoder = null;
      this.keepStorageSnapshots = true;
    }
    const pre = this.device.createCommandEncoder({ label: 'Geometry batch ' + this.frame });
    pre.clearBuffer(arena.counters);
    const timestampWrites = this.timestampWrites(program.label + ' geometry');
    const compute = pre.beginComputePass(
      timestampWrites
        ? { label: program.label + ' geometry batch', timestampWrites }
        : { label: program.label + ' geometry batch' },
    );
    const batch = { program, pre, compute, slots: 0, vertices: 0, indices: 0, pass: null, entry: { buffer: null } };
    (this.pendingCommandBuffers ??= []).push(batch.entry);
    this.geometryBatch = batch;
    return batch;
  }
  closeGeometryBatch() {
    const batch = this.geometryBatch;
    if (!batch) return;
    this.geometryBatch = null;
    batch.compute.end();
    batch.entry.buffer = batch.pre.finish();
  }
  drawGeometryBatched(indexed, count, type, offset) {
    const program = this.program,
      geometry = program.geometry,
      vao = this.vao;
    const attributes = [...(vao?.attributes.values() || [])],
      buffer = attributes[0]?.buffer;
    if (!buffer?.gpu) return;
    const stride = attributes[0].stride;
    if (stride % 4) throw new Error(program.label + ': Vertex-Stride muss durch 4 teilbar sein.');
    const indexData = indexed ? vao.index || this.indexBuffer : null,
      wide = type === this.UNSIGNED_INT;
    const first = indexed ? offset / (wide ? 4 : 2) : offset,
      mode = indexed ? (wide ? 2 : 1) : 0;
    const size = geometry.primitive,
      primitives = Math.floor(count / size);
    if (!primitives) return;
    const captureSlots = geometry.capture.slots,
      outSlots = geometry.outSlots;
    const perVertices = Math.max(1, geometry.maxVertices * geometry.invocations),
      perIndices = Math.max(0, geometry.maxVertices - 2) * 3 * geometry.invocations;
    const limit = Math.min(this.device.limits.maxStorageBufferBindingSize, 1 << 27);
    const arena = (this.geometryArena ??= this.createGeometryArena(limit));
    const vertexCap = Math.floor(arena.vertices.size / (outSlots * 16)),
      indexCap = Math.floor(arena.indices.size / 12) * 3;
    const chunk = Math.max(
      1,
      Math.min(
        Math.floor(limit / (size * captureSlots * 16)),
        Math.floor((65535 * 64) / size),
        Math.floor(vertexCap / perVertices),
        perIndices ? Math.floor(indexCap / perIndices) : Infinity,
      ),
    );
    const scratch = (this.geometryScratch ??= { generation: 0 });
    const grow = (name, bytes, usage) => {
      bytes = Math.max(256, Math.ceil(bytes / 256) * 256);
      if (!scratch[name] || scratch[name].size < bytes) {
        if (scratch[name]) this.retire(scratch[name]);
        scratch[name] = this.device.createBuffer({ label: 'Geometry ' + name, size: bytes, usage });
        scratch.generation++;
      }
      return scratch[name];
    };
    this.dummyStorage ??= this.device.createBuffer({ label: 'Empty storage', size: 16, usage: GPUBufferUsage.STORAGE });
    const needsUniforms = [program.geometryCapture, program.geometryShader].some(v =>
      v.bindings.some(b => b.group === 0),
    );
    if (
      needsUniforms &&
      (program.lastUniformFrame !== this.frame || program.lastUniformRevision !== program.revision)
    ) {
      const alignment = this.device.limits.minUniformBufferOffsetAlignment;
      this.uniformCursor = Math.ceil(this.uniformCursor / alignment) * alignment;
      if (this.uniformCursor + program.uniformSize > this.uniformArena.size)
        throw new Error('WebGPU Uniform-Speicher für diesen Frame ist voll.');
      program.uniformOffset = this.uniformCursor;
      this.uniformCursor += program.uniformSize;
      this.device.queue.writeBuffer(this.uniformArena, program.uniformOffset, program.uniformData);
      program.lastUniformFrame = this.frame;
      program.lastUniformRevision = program.revision;
    }
    const uniformOffset = needsUniforms ? program.uniformOffset : null;
    for (let start = 0; start < primitives; start += chunk) {
      const n = Math.min(chunk, primitives - start);
      const capture = grow('capture', n * size * captureSlots * 16, GPUBufferUsage.STORAGE);
      vao.geometryCache ??= new Map();
      const key =
        'batch|' +
        program.id +
        '|' +
        mode +
        '|' +
        first +
        '|' +
        count +
        '|' +
        start +
        '|' +
        scratch.generation +
        '|' +
        arena.generation +
        '|' +
        (this.bufferGeneration || 0);
      let cached = vao.geometryCache.get(key);
      if (cached && (cached.vertexGpu !== buffer.gpu || cached.indexGpu !== indexData?.gpu)) cached = null;
      if (!cached) {
        const layout = new Uint32Array(20).fill(0xffffffff);
        for (let location = 0; location < 16; location++) {
          const a = vao.attributes.get(location);
          if (!a || a.buffer !== buffer || a.stride !== stride || a.type !== this.FLOAT || a.offset % 4) continue;
          layout[4 + location] = (a.offset / 4) | (a.size << 16);
        }
        layout.set([n * size, first + start * size, mode, stride / 4], 0);
        const header = new Uint32Array(20);
        header.set([n, vertexCap, indexCap, start], 0);
        const params = this.device.createBuffer({
          label: 'Geometry fetch',
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(params, 0, layout);
        const shaderParams = this.device.createBuffer({
          label: 'Geometry parameters',
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(shaderParams, 0, header);
        const group = (variant, extra) =>
          variant?.bufferLayout
            ? this.device.createBindGroup({
                label: variant.label + ' buffers',
                layout: variant.bufferLayout,
                entries: this.bufferEntriesFor(variant, extra),
              })
            : null;
        cached = {
          vertexGpu: buffer.gpu,
          indexGpu: indexData?.gpu,
          params,
          shaderParams,
          capture: group(program.geometryCapture, [
            { binding: 30, resource: { buffer: buffer.gpu } },
            { binding: 31, resource: { buffer: indexData?.gpu || this.dummyStorage } },
            { binding: 32, resource: { buffer: params } },
            { binding: 36, resource: { buffer: capture } },
          ]),
          shader: group(program.geometryShader, [
            { binding: 32, resource: { buffer: shaderParams } },
            { binding: 33, resource: { buffer: arena.vertices } },
            { binding: 34, resource: { buffer: arena.indices } },
            { binding: 35, resource: { buffer: arena.args } },
            { binding: 36, resource: { buffer: capture } },
            { binding: 42, resource: { buffer: arena.counters } },
          ]),
          render: this.device.createBindGroup({
            label: program.label + ' geometry output',
            layout: program.bufferLayout,
            entries: this.bufferEntriesFor(program, [{ binding: 33, resource: { buffer: arena.vertices } }]),
          }),
        };
        if (vao.geometryCache.size > 64) {
          for (const old of vao.geometryCache.values()) {
            this.retire(old.params);
            this.retire(old.shaderParams);
            if (old.teParams) this.retire(old.teParams);
          }
          vao.geometryCache.clear();
        }
        vao.geometryCache.set(key, cached);
      }
      const steps = [
        [program.geometryCapture, cached.capture, Math.ceil((n * size) / 64)],
        [program.geometryShader, cached.shader, Math.ceil(n / 64)],
      ].map(([variant, group3, groups]) => {
        const textures = this.bindTextures(program, variant, null, true);
        const images = variant.groupLayouts.length > 2 ? this.bindImages(variant) : null;
        variant.uniformGroup ??= variant.bindings.some(b => b.group === 0)
          ? this.device.createBindGroup({
              label: variant.label + ' uniforms',
              layout: variant.uniformLayout,
              entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
            })
          : this.device.createBindGroup({ layout: variant.uniformLayout, entries: [] });
        return { variant, textures, images, group3, groups };
      });
      const target = this.targetState(program);
      let batch = this.geometryBatch;
      const fits =
        batch &&
        batch.program === program &&
        batch.slots < arena.slots &&
        batch.vertices + n * perVertices <= vertexCap &&
        batch.indices + n * perIndices <= indexCap &&
        this.pass &&
        batch.pass === this.pass &&
        this.passKey === target.passKey;
      if (!fits) batch = this.openGeometryBatch(program, arena);
      const slot = batch.slots++;
      batch.vertices += n * perVertices;
      batch.indices += n * perIndices;
      const pass = batch.compute;
      pass.setPipeline(arena.initPipeline);
      pass.setBindGroup(0, arena.slotGroup(slot));
      pass.dispatchWorkgroups(1);
      for (const step of steps) {
        pass.setPipeline(step.variant.pipeline);
        if (uniformOffset !== null && step.variant.bindings.some(b => b.group === 0))
          pass.setBindGroup(0, step.variant.uniformGroup, [uniformOffset]);
        else pass.setBindGroup(0, step.variant.uniformGroup);
        pass.setBindGroup(1, step.textures);
        pass.setBindGroup(2, step.images || this.emptyGroup);
        pass.setBindGroup(3, step.group3);
        pass.dispatchWorkgroups(step.groups);
      }
      this.markImageWrites(program.geometryCapture);
      this.markImageWrites(program.geometryShader);
      this.geometryDrawing = { group3: cached.render, indices: arena.indices, args: arena.args, argsOffset: slot * 32 };
      try {
        this.draw(indexed, count, type, offset);
      } finally {
        this.geometryDrawing = null;
      }
      if (this.geometryBatch === batch) batch.pass = this.pass;
    }
  }
  drawGeometry(indexed, count, type, offset) {
    const program = this.program,
      geometry = program.geometry,
      vao = this.vao;
    if (this.geometryBatchable(program, geometry)) {
      this.drawGeometryBatched(indexed, count, type, offset);
      return;
    }
    const attributes = [...(vao?.attributes.values() || [])],
      buffer = attributes[0]?.buffer;
    if (!buffer?.gpu) return;
    const stride = attributes[0].stride;
    if (stride % 4) throw new Error(program.label + ': Vertex-Stride muss durch 4 teilbar sein.');
    const indexData = indexed ? vao.index || this.indexBuffer : null,
      wide = type === this.UNSIGNED_INT;
    const first = indexed ? offset / (wide ? 4 : 2) : offset,
      mode = indexed ? (wide ? 2 : 1) : 0;
    const size = geometry.primitive,
      primitives = Math.floor(count / size);
    if (!primitives) return;
    const captureSlots = geometry.capture.slots,
      outSlots = geometry.outSlots;
    const perVertices = Math.max(1, geometry.maxVertices * geometry.invocations),
      perIndices = Math.max(0, geometry.maxVertices - 2) * 3 * geometry.invocations;
    const limit = Math.min(this.device.limits.maxStorageBufferBindingSize, 1 << 27);
    const chunk = Math.max(
      1,
      Math.min(
        Math.floor(limit / (size * captureSlots * 16)),
        Math.floor((65535 * 64) / size),
        geometry.control ? Math.floor(limit / (geometry.control.slots * 16)) : Infinity,
        geometry.tessellation ? Math.max(1, Math.floor(limit / (geometry.outSlots * 16) / 64)) : Infinity,
        geometry.chain ? Math.max(1, Math.floor(limit / (geometry.teSlots * 16) / 64)) : Infinity,
      ),
    );
    const vertexBudget = Math.floor(limit / (outSlots * 16)),
      indexBudget = Math.floor(limit / 4 / 3) * 3;
    const scratch = (this.geometryScratch ??= { generation: 0 });
    const grow = (name, bytes, usage) => {
      bytes = Math.max(256, Math.ceil(bytes / 256) * 256);
      if (!scratch[name] || scratch[name].size < bytes) {
        if (scratch[name]) this.retire(scratch[name]);
        scratch[name] = this.device.createBuffer({ label: 'Geometry ' + name, size: bytes, usage });
        scratch.generation++;
      }
      return scratch[name];
    };
    scratch.args ??= this.device.createBuffer({
      label: 'Geometry draw arguments',
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    scratch.counters ??= this.device.createBuffer({
      label: 'Geometry counters',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.dummyStorage ??= this.device.createBuffer({ label: 'Empty storage', size: 16, usage: GPUBufferUsage.STORAGE });
    const needsUniforms = [
      program.geometryCapture,
      program.geometryShader,
      program.geometryControl,
      program.geometryEvaluation,
    ]
      .filter(Boolean)
      .some(v => v.bindings.some(b => b.group === 0));
    if (
      needsUniforms &&
      (program.lastUniformFrame !== this.frame || program.lastUniformRevision !== program.revision)
    ) {
      const alignment = this.device.limits.minUniformBufferOffsetAlignment;
      this.uniformCursor = Math.ceil(this.uniformCursor / alignment) * alignment;
      if (this.uniformCursor + program.uniformSize > this.uniformArena.size)
        throw new Error('WebGPU Uniform-Speicher für diesen Frame ist voll.');
      program.uniformOffset = this.uniformCursor;
      this.uniformCursor += program.uniformSize;
      this.device.queue.writeBuffer(this.uniformArena, program.uniformOffset, program.uniformData);
      program.lastUniformFrame = this.frame;
      program.lastUniformRevision = program.revision;
    }
    const uniformOffset = needsUniforms ? program.uniformOffset : null;
    for (let start = 0; start < primitives; start += chunk) {
      const n = Math.min(chunk, primitives - start);
      const geometryInputs = geometry.chain ? n * geometry.pointsPerPatch * 2 : n;
      const vertexCap = Math.min(geometryInputs * perVertices, vertexBudget),
        indexCap = Math.min(geometryInputs * perIndices, indexBudget);
      const capture = grow('capture', n * size * captureSlots * 16, GPUBufferUsage.STORAGE);
      const vertices = grow('vertices', vertexCap * outSlots * 16, GPUBufferUsage.STORAGE);
      const indices = grow('indices', indexCap * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX);
      const control = geometry.control
        ? grow('control', n * geometry.control.slots * 16, GPUBufferUsage.STORAGE)
        : null;
      const tePoints = geometry.chain
          ? Math.min(n * geometry.pointsPerPatch, Math.floor(limit / (geometry.teSlots * 16)))
          : 0,
        teIndexCap = Math.min(tePoints * 6, Math.floor(limit / 4 / 3) * 3);
      const teVertices = geometry.chain
          ? grow('teVertices', tePoints * geometry.teSlots * 16, GPUBufferUsage.STORAGE)
          : null,
        teIndices = geometry.chain ? grow('teIndices', teIndexCap * 4, GPUBufferUsage.STORAGE) : null;
      if (geometry.chain)
        scratch.teCounts ??= this.device.createBuffer({
          label: 'Tessellation counts',
          size: 32,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
        });
      vao.geometryCache ??= new Map();
      const key =
        program.id +
        '|' +
        mode +
        '|' +
        first +
        '|' +
        count +
        '|' +
        start +
        '|' +
        scratch.generation +
        '|' +
        (this.bufferGeneration || 0);
      let cached = vao.geometryCache.get(key);
      if (cached && (cached.vertexGpu !== buffer.gpu || cached.indexGpu !== indexData?.gpu)) cached = null;
      if (!cached) {
        const layout = new Uint32Array(20).fill(0xffffffff);
        for (let location = 0; location < 16; location++) {
          const a = vao.attributes.get(location);
          if (!a || a.buffer !== buffer || a.stride !== stride || a.type !== this.FLOAT || a.offset % 4) continue;
          layout[4 + location] = (a.offset / 4) | (a.size << 16);
        }
        layout.set([n * size, first + start * size, mode, stride / 4], 0);
        const header = new Uint32Array(20);
        header.set([n, vertexCap, indexCap, start], 0);
        const params = this.device.createBuffer({
          label: 'Geometry fetch',
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(params, 0, layout);
        const shaderParams = this.device.createBuffer({
          label: 'Geometry parameters',
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(shaderParams, 0, header);
        const teParams = geometry.chain
          ? this.device.createBuffer({
              label: 'Tessellation parameters',
              size: 80,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
          : null;
        if (teParams) {
          const teHeader = new Uint32Array(20);
          teHeader.set([n, tePoints, teIndexCap, start], 0);
          this.device.queue.writeBuffer(teParams, 0, teHeader);
        }
        const group = (variant, extra) =>
          variant?.bufferLayout
            ? this.device.createBindGroup({
                label: variant.label + ' buffers',
                layout: variant.bufferLayout,
                entries: this.bufferEntriesFor(variant, extra),
              })
            : null;
        cached = {
          vertexGpu: buffer.gpu,
          indexGpu: indexData?.gpu,
          params,
          shaderParams,
          capture: group(program.geometryCapture, [
            { binding: 30, resource: { buffer: buffer.gpu } },
            { binding: 31, resource: { buffer: indexData?.gpu || this.dummyStorage } },
            { binding: 32, resource: { buffer: params } },
            { binding: 36, resource: { buffer: capture } },
          ]),
          shader: group(
            program.geometryShader,
            [
              { binding: 32, resource: { buffer: shaderParams } },
              { binding: 33, resource: { buffer: vertices } },
              { binding: 34, resource: { buffer: indices } },
              { binding: 35, resource: { buffer: scratch.args } },
              { binding: 36, resource: { buffer: teVertices || capture } },
              { binding: 42, resource: { buffer: scratch.counters } },
            ].concat(
              control ? [{ binding: 37, resource: { buffer: control } }] : [],
              teIndices
                ? [
                    { binding: 39, resource: { buffer: teIndices } },
                    { binding: 40, resource: { buffer: scratch.teCounts } },
                  ]
                : [],
            ),
          ),
          control: program.geometryControl
            ? group(program.geometryControl, [
                { binding: 32, resource: { buffer: shaderParams } },
                { binding: 36, resource: { buffer: capture } },
                { binding: 37, resource: { buffer: control } },
              ])
            : null,
          evaluation: program.geometryEvaluation
            ? group(program.geometryEvaluation, [
                { binding: 32, resource: { buffer: teParams } },
                { binding: 37, resource: { buffer: control } },
                { binding: 38, resource: { buffer: teVertices } },
                { binding: 39, resource: { buffer: teIndices } },
                { binding: 40, resource: { buffer: scratch.teCounts } },
              ])
            : null,
          teParams,
          render:
            geometry.output === 'triangle_strip'
              ? this.device.createBindGroup({
                  label: program.label + ' geometry output',
                  layout: program.bufferLayout,
                  entries: this.bufferEntriesFor(program, [{ binding: 33, resource: { buffer: vertices } }]),
                })
              : null,
        };
        if (vao.geometryCache.size > 64) {
          for (const old of vao.geometryCache.values()) {
            this.retire(old.params);
            this.retire(old.shaderParams);
            if (old.teParams) this.retire(old.teParams);
          }
          vao.geometryCache.clear();
        }
        vao.geometryCache.set(key, cached);
      }
      const stepList = [[program.geometryCapture, cached.capture, Math.ceil((n * size) / 64)]];
      if (program.geometryControl) stepList.push([program.geometryControl, cached.control, Math.ceil(n / 64)]);
      if (program.geometryEvaluation) stepList.push([program.geometryEvaluation, cached.evaluation, Math.ceil(n / 64)]);
      stepList.push([
        program.geometryShader,
        cached.shader,
        geometry.chain ? 0 : Math.ceil(n / 64),
        geometry.chain ? scratch.teCounts : null,
      ]);
      const steps = stepList.map(([variant, group3, groups, indirect]) => {
        const storage = this.storageTextures(variant);
        const textures = this.bindTextures(program, variant, storage, true);
        const images = variant.groupLayouts.length > 2 ? this.bindImages(variant) : null;
        variant.uniformGroup ??= variant.bindings.some(b => b.group === 0)
          ? this.device.createBindGroup({
              label: variant.label + ' uniforms',
              layout: variant.uniformLayout,
              entries: [{ binding: 0, resource: { buffer: this.uniformArena, offset: 0, size: program.uniformSize } }],
            })
          : this.device.createBindGroup({ layout: variant.uniformLayout, entries: [] });
        return { variant, textures, images, group3, groups, indirect };
      });
      this.endPass();
      this.commandEncoder().clearBuffer(scratch.args);
      this.commandEncoder().clearBuffer(scratch.counters);
      if (geometry.chain) this.commandEncoder().clearBuffer(scratch.teCounts);
      const pass = this.beginCompute({ label: program.label + ' geometry' });
      for (const step of steps) {
        pass.setPipeline(step.variant.pipeline);
        if (uniformOffset !== null && step.variant.bindings.some(b => b.group === 0))
          pass.setBindGroup(0, step.variant.uniformGroup, [uniformOffset]);
        else pass.setBindGroup(0, step.variant.uniformGroup);
        pass.setBindGroup(1, step.textures);
        if (step.images || step.group3) pass.setBindGroup(2, step.images || this.emptyGroup);
        if (step.group3) pass.setBindGroup(3, step.group3);
        if (step.indirect) pass.dispatchWorkgroupsIndirect(step.indirect, 8);
        else if (step.groups) pass.dispatchWorkgroups(step.groups);
      }
      pass.end();
      this.markImageWrites(program.geometryCapture);
      this.markImageWrites(program.geometryShader);
      if (program.geometryControl) this.markImageWrites(program.geometryControl);
      if (program.geometryEvaluation) this.markImageWrites(program.geometryEvaluation);
      if (!cached.render) continue;
      this.geometryDrawing = { group3: cached.render, indices, args: scratch.args };
      try {
        this.draw(indexed, count, type, offset);
      } finally {
        this.geometryDrawing = null;
      }
    }
  }
  flushVertexCompute() {
    const items = this.pendingVertexCompute.splice(0);
    if (!items.length) return;
    const pass = this.beginCompute({ label: 'Vertex writes' });
    let lastPipeline = null,
      lastTextures = null,
      lastImages = null,
      lastUniforms = null,
      lastOffset = -2;
    const offsets = [0];
    for (const item of items) {
      if (lastPipeline !== item.variant.pipeline) {
        pass.setPipeline(item.variant.pipeline);
        lastPipeline = item.variant.pipeline;
      }
      const dynamic = item.uniformOffset !== null && item.variant.bindings.some(b => b.group === 0);
      const offset = dynamic ? item.uniformOffset : -1;
      if (lastUniforms !== item.variant.uniformGroup || lastOffset !== offset) {
        if (dynamic) {
          offsets[0] = item.uniformOffset;
          pass.setBindGroup(0, item.variant.uniformGroup, offsets);
        } else pass.setBindGroup(0, item.variant.uniformGroup);
        lastUniforms = item.variant.uniformGroup;
        lastOffset = offset;
      }
      if (lastTextures !== item.textures) {
        pass.setBindGroup(1, item.textures);
        lastTextures = item.textures;
      }
      const images = item.images || this.emptyGroup;
      if (lastImages !== images) {
        pass.setBindGroup(2, images);
        lastImages = images;
      }
      pass.setBindGroup(3, item.group3);
      pass.dispatchWorkgroups(Math.ceil(item.count / 64));
    }
    pass.end();
    for (const item of items) this.markImageWrites(item.variant);
  }
}
