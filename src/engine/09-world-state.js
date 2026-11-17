GB.bufferRecorder = {
  start: startBufferRecording,
  get running() {
    return !!bufferRecorder;
  },
  get stage() {
    return bufferRecorderStage;
  },
  get frames() {
    return bufferRecorder?.frames ?? 0;
  },
};
function setWorldTime(time) {
  if (GB.state.active) GB.hooks.setClockSync(false, true);
  const wrapped = ((Math.round(time) % WORLD_TICKS_PER_DAY) + WORLD_TICKS_PER_DAY) % WORLD_TICKS_PER_DAY;
  clockBaseTicks = WORLD_DAY * WORLD_TICKS_PER_DAY + wrapped;
  clockBaseSeconds = clockSeconds;
  advanceWorldClock(clockSeconds);
}
function advanceWorldClock(seconds) {
  clockSeconds = seconds;
  const ticks = GB.hooks.nativeClockTicks() ?? clockBaseTicks + (seconds - clockBaseSeconds) * WORLD_TICKS_PER_SECOND;
  const day = Math.floor(ticks / WORLD_TICKS_PER_DAY),
    time = Math.floor(ticks - day * WORLD_TICKS_PER_DAY);
  if (time === WORLD_TIME && day === WORLD_DAY) return;
  WORLD_TIME = time;
  WORLD_DAY = day;
  SUN_ANGLE = sunAngleFromTime(dimensionTime());
  if (lightmapTexture) buildLightmapTexture();
}
const WATER_FOG_COLOR = [5 / 255, 5 / 255, 51 / 255];
const eyeInWater = eye =>
  !(window.wgpuDimension === 'overworld')
    ? false
    : GB.state.active
      ? GB.hooks.medium(eye) === 1
      : eye[1] < RIVER_LEVEL + 0.875 && terrainColumn(Math.floor(eye[0]), Math.floor(eye[2])).water;
const SKY_COLOR = [120 / 255, 167 / 255, 1],
  FOG_COLOR = [192 / 255, 216 / 255, 1];

const SKY_COLOR_BIOME = [120 / 255, 167 / 255, 1],
  FOG_COLOR_BIOME = [192 / 255, 216 / 255, 1];
let vanillaSkyFrame = -1;
function updateVanillaSkyColors() {
  if (typeof renderedFrameCounter !== 'undefined' && vanillaSkyFrame === renderedFrameCounter) return;
  vanillaSkyFrame = typeof renderedFrameCounter !== 'undefined' ? renderedFrameCounter : -1;
  const angle = vanillaCelestialAngle(WORLD_TIME),
    c = Math.cos(angle * Math.PI * 2),
    light = Math.max(0, Math.min(1, c * 2 + 0.5));
  const nether = !(window.wgpuDimension === 'overworld'),
    end = window.wgpuDimension === 'end';
  for (let i = 0; i < 3; i++) SKY_COLOR[i] = nether ? 0 : SKY_COLOR_BIOME[i] * light;
  {
    const rain = window.wgpuWeather?.rain || 0,
      thunder = window.wgpuWeather?.thunder || 0;
    if (rain > 0) {
      const grey = (SKY_COLOR[0] * 0.3 + SKY_COLOR[1] * 0.59 + SKY_COLOR[2] * 0.11) * 0.6,
        keep = 1 - rain * 0.75;
      for (let i = 0; i < 3; i++) SKY_COLOR[i] = SKY_COLOR[i] * keep + grey * (1 - keep);
    }
    if (thunder > 0) {
      const grey = (SKY_COLOR[0] * 0.3 + SKY_COLOR[1] * 0.59 + SKY_COLOR[2] * 0.11) * 0.2,
        keep = 1 - thunder * 0.75;
      for (let i = 0; i < 3; i++) SKY_COLOR[i] = SKY_COLOR[i] * keep + grey * (1 - keep);
    }
    const flash = window.wgpuWeather?.flash || 0;
    if (flash > 0) {
      SKY_COLOR[0] = SKY_COLOR[0] * (1 - flash) + 0.8 * flash;
      SKY_COLOR[1] = SKY_COLOR[1] * (1 - flash) + 0.8 * flash;
      SKY_COLOR[2] = SKY_COLOR[2] * (1 - flash) + flash;
    }
  }
  const fog = end
    ? [(0xa0 / 255) * 0.15, (0x80 / 255) * 0.15, (0xa0 / 255) * 0.15]
    : nether
      ? [0x33 / 255, 0x08 / 255, 0x08 / 255]
      : [
          FOG_COLOR_BIOME[0] * (light * 0.94 + 0.06),
          FOG_COLOR_BIOME[1] * (light * 0.94 + 0.06),
          FOG_COLOR_BIOME[2] * (light * 0.91 + 0.09),
        ];
  if (!nether && c >= -0.4 && c <= 0.4 && typeof cameraViewMatrix !== 'undefined' && cameraViewMatrix) {
    const f3 = (c / 0.4) * 0.5 + 0.5;
    let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
    f4 *= f4;
    const sunrise = [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, 0.2],
      side = Math.sin(angle * Math.PI * 2) > 0 ? -1 : 1;
    let toward = -cameraViewMatrix[2] * side;
    if (toward < 0) toward = 0;
    toward *= f4;
    for (let i = 0; i < 3; i++) fog[i] = fog[i] * (1 - toward) + sunrise[i] * toward;
  }
  const chunks = Math.max(2, RENDER_DISTANCE / 16),
    blend = 1 - Math.pow(0.25 + (0.75 * chunks) / 32, 0.25);
  for (let i = 0; i < 3; i++) FOG_COLOR[i] = fog[i] + (SKY_COLOR[i] - fog[i]) * blend;
  {
    const rain = window.wgpuWeather?.rain || 0,
      thunder = window.wgpuWeather?.thunder || 0;
    if (rain > 0) {
      FOG_COLOR[0] *= 1 - rain * 0.5;
      FOG_COLOR[1] *= 1 - rain * 0.5;
      FOG_COLOR[2] *= 1 - rain * 0.4;
    }
    if (thunder > 0) for (let i = 0; i < 3; i++) FOG_COLOR[i] *= 1 - thunder * 0.5;
  }
}
const VANILLA_TEXTURES = {
  white_concrete: '@@datauri:assets/images/white-concrete.png@@',
  glowstone: '@@datauri:assets/images/glowstone.png@@',
  sea_lantern: '@@datauri:assets/images/sea-lantern.png@@',
  gold_block: '@@datauri:assets/images/gold-block.png@@',
  dirt: '@@datauri:assets/images/dirt.png@@',
  grass_side: '@@datauri:assets/images/grass-side.png@@',
  grass_top: '@@datauri:assets/images/grass-top.png@@',
  grass_side_overlay: '@@datauri:assets/images/grass-side-overlay.png@@',
  oak_log: '@@datauri:assets/images/oak-log.png@@',
  oak_log_top: '@@datauri:assets/images/oak-log-top.png@@',
  oak_leaves: '@@datauri:assets/images/oak-leaves.png@@',
  stone: '@@datauri:assets/images/stone.png@@',
  short_grass: '@@datauri:assets/images/short-grass.png@@',
  tall_grass_bottom: '@@datauri:assets/images/tall-grass-bottom.png@@',
  tall_grass_top: '@@datauri:assets/images/tall-grass-top.png@@',
  fern: '@@datauri:assets/images/fern.png@@',
  poppy: '@@datauri:assets/images/poppy.png@@',
  dandelion:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUklEQVQ4y2NgGAXDHfx/4/8fhMnW/O+a5f+Pc1VJNwSkAaZxb5YS2CCyDCFbMwyI17D8B2GyNHr1a/wPXa0Lpsm2HWYACJPlEpABZHsDBIixGQCyM01OrS9sngAAAABJRU5ErkJggg==',
  oxeye_daisy: '@@datauri:assets/images/oxeye-daisy.png@@',
  cornflower: '@@datauri:assets/images/cornflower.png@@',
  spruce_log: '@@datauri:assets/images/spruce-log.png@@',
  spruce_log_top: '@@datauri:assets/images/spruce-log-top.png@@',
  spruce_leaves: '@@datauri:assets/images/spruce-leaves.png@@',
  birch_log: '@@datauri:assets/images/birch-log.png@@',
  birch_log_top: '@@datauri:assets/images/birch-log-top.png@@',
  birch_leaves: '@@datauri:assets/images/birch-leaves.png@@',
  snow: '@@datauri:assets/images/snow.png@@',
  gravel: '@@datauri:assets/images/gravel.png@@',
  sand: '@@datauri:assets/images/sand.png@@',
  grass_block_snow: '@@datauri:assets/images/grass-block-snow.png@@',
  water_still: '@@datauri:assets/images/water-still.png@@',
};
const ATLAS_SLOTS = {
  dirt: [0, 0],
  grass_side: [1, 0],
  grass_top: [2, 0],
  grass_side_overlay: [3, 0],
  oak_log: [4, 0],
  oak_log_top: [5, 0],
  oak_leaves: [6, 0],
  stone: [7, 0],
  short_grass: [0, 1],
  tall_grass_bottom: [1, 1],
  tall_grass_top: [2, 1],
  fern: [3, 1],
  poppy: [4, 1],
  dandelion: [5, 1],
  oxeye_daisy: [6, 1],
  cornflower: [7, 1],
  spruce_log: [0, 2],
  spruce_log_top: [1, 2],
  spruce_leaves: [2, 2],
  birch_log: [3, 2],
  birch_log_top: [4, 2],
  birch_leaves: [5, 2],
  snow: [6, 2],
  gravel: [7, 2],
  sand: [0, 3],
  grass_block_snow: [1, 3],
  water_still: [2, 3],
  white_concrete: [3, 3],
  glowstone: [4, 3],
  sea_lantern: [5, 3],
  gold_block: [6, 3],
};
const ATLAS_CELL = 32,
  ATLAS_PADDING = 8,
  ATLAS_WIDTH = GB.config.atlas?.width ?? 256,
  ATLAS_HEIGHT = GB.config.atlas?.height ?? 256;
const CHUNK_SIZE = 16;
let RENDER_CHUNK_RADIUS = GB.config.chunkRadius ?? 14;
const PACK_TEXTURES = {
  noise: '@@datauri:assets/images/noise.png@@',
  cloudWater: '@@datauri:assets/images/cloud-water.png@@',
};
let ENABLE_TAA = true;
const requestAnimationFrame = GB.config.requestAnimationFrame || (callback => window.requestAnimationFrame(callback));
const canvas = document.getElementById('gl');
const message = document.getElementById('message');
const dot = document.getElementById('dot');
const zipInput = document.getElementById('zipInput');
const retry = document.getElementById('retry');
const programSummary = document.getElementById('programSummary');
const programList = document.getElementById('programList');

let gl, fallbackProgram, activeProgram, presentProgram, skyVao, skyIndexCount, screenVao, screenIndexCount;
let framebuffer,
  sceneDepthAttachment,
  depthCopyFramebuffer,
  sceneDepthTextures = [],
  colortexCurrent = [],
  colortexSpare = [];
let shadowFramebuffer,
  shadowDepthAttachment,
  shadowDepthCopyFramebuffer,
  shadowDepthTextures = [],
  shadowColorTextures = [],
  shadowColorSpare = [],
  shadowCompareSampler,
  shadowRawSampler;
let renderSnormExtension = null;
let maxColorAttachments = 0;
let gbufferPrograms = new Map();
let pipelinePrograms = new Map();
const MC_HAND_DEPTH = 0.125;
let handProjectionMatrix = null;
let skyProgram = null;
let width = 0,
  height = 0;
const SPAWN_X = 112,
  SPAWN_Z = 64;
let yaw = -Math.PI / 4,
  pitch = 0.035;
const cameraPosition = [SPAWN_X, WORLD_Y_OFFSET + 18, SPAWN_Z];
const pressedKeys = new Set();
let previousFrame = performance.now(),
  frameDelta = 1 / 60,
  renderedFrameCounter = 0;
let dirtTexture = null,
  neutralTexture = null,
  normalTexture = null,
  specularTexture = null,
  noiseTexture = null,
  cloudWaterTexture = null,
  emptyDepthTexture = null;
let neutral3DTexture = null,
  unsigned2DTexture = null,
  unsigned3DTexture = null,
  signed2DTexture = null,
  signed3DTexture = null;
const startTime = performance.now();
const uniformCache = new WeakMap();
const identityMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const fullscreenProjectionMatrix = new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, -1, -1, 0, 1]);
const lightmapTextureMatrix = new Float32Array([1 / 256, 0, 0, 0, 0, 1 / 256, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const textureMatrixArray = new Float32Array([...identityMatrix, ...lightmapTextureMatrix]);
let cameraViewMatrix = identityMatrix,
  cameraGbufferViewMatrix = identityMatrix,
  cameraProjectionMatrix = identityMatrix;
let previousGbufferViewMatrix = identityMatrix,
  previousProjectionMatrix = identityMatrix;
const previousCameraPosition = [cameraPosition[0], cameraPosition[1], cameraPosition[2]];
let temporalHistoryValid = false;
let meshedChunkX = Number.NaN,
  meshedChunkZ = Number.NaN;
const worldChunks = new Map();
GB.engine = {
  packEntityId: name => packEntityId(name),
  get handProjectionMatrix() {
    return handProjectionMatrix;
  },
  get MC_HAND_DEPTH() {
    return MC_HAND_DEPTH;
  },
  get gl() {
    return gl;
  },
  set gl(value) {
    gl = value;
  },
  get canvas() {
    return canvas;
  },
  set canvas(value) {
    canvas = value;
  },
  get worldChunks() {
    return worldChunks;
  },
  set worldChunks(value) {
    worldChunks = value;
  },
  get visibleChunkMeshes() {
    return visibleChunkMeshes;
  },
  set visibleChunkMeshes(value) {
    visibleChunkMeshes = value;
  },
  get pendingChunkKeys() {
    return pendingChunkKeys;
  },
  set pendingChunkKeys(value) {
    pendingChunkKeys = value;
  },
  get pendingChunkRebuilds() {
    return pendingChunkRebuilds;
  },
  set pendingChunkRebuilds(value) {
    pendingChunkRebuilds = value;
  },
  get meshJob() {
    return meshJob;
  },
  set meshJob(value) {
    meshJob = value;
  },
  get meshedChunkX() {
    return meshedChunkX;
  },
  set meshedChunkX(value) {
    meshedChunkX = value;
  },
  get meshedChunkZ() {
    return meshedChunkZ;
  },
  set meshedChunkZ(value) {
    meshedChunkZ = value;
  },
  get cameraPosition() {
    return cameraPosition;
  },
  set cameraPosition(value) {
    cameraPosition = value;
  },
  get previousCameraPosition() {
    return previousCameraPosition;
  },
  set previousCameraPosition(value) {
    previousCameraPosition = value;
  },
  get yaw() {
    return yaw;
  },
  set yaw(value) {
    yaw = value;
  },
  get pitch() {
    return pitch;
  },
  set pitch(value) {
    pitch = value;
  },
  get flying() {
    return flying;
  },
  set flying(value) {
    flying = value;
  },
  get verticalVelocity() {
    return verticalVelocity;
  },
  set verticalVelocity(value) {
    verticalVelocity = value;
  },
  get frameDelta() {
    return frameDelta;
  },
  set frameDelta(value) {
    frameDelta = value;
  },
  get previousFrame() {
    return previousFrame;
  },
  set previousFrame(value) {
    previousFrame = value;
  },
  get renderedFrameCounter() {
    return renderedFrameCounter;
  },
  set renderedFrameCounter(value) {
    renderedFrameCounter = value;
  },
  get temporalHistoryValid() {
    return temporalHistoryValid;
  },
  set temporalHistoryValid(value) {
    temporalHistoryValid = value;
  },
  get packBlockIds() {
    return packBlockIds;
  },
  set packBlockIds(value) {
    packBlockIds = value;
  },
  get packLoading() {
    return packLoading;
  },
  set packLoading(value) {
    packLoading = value;
  },
  get shaderLoadBusy() {
    return shaderLoadBusy;
  },
  set shaderLoadBusy(value) {
    shaderLoadBusy = value;
  },
  get packSettings() {
    return packSettings;
  },
  set packSettings(value) {
    packSettings = value;
  },
  get activePackProperties() {
    return activePackProperties;
  },
  set activePackProperties(value) {
    activePackProperties = value;
  },
  get activePackResources() {
    return activePackResources;
  },
  set activePackResources(value) {
    activePackResources = value;
  },
  get activePassTargets() {
    return activePassTargets;
  },
  set activePassTargets(value) {
    activePassTargets = value;
  },
  get activeProgram() {
    return activeProgram;
  },
  set activeProgram(value) {
    activeProgram = value;
  },
  get gbufferPrograms() {
    return gbufferPrograms;
  },
  set gbufferPrograms(value) {
    gbufferPrograms = value;
  },
  get pipelinePrograms() {
    return pipelinePrograms;
  },
  set pipelinePrograms(value) {
    pipelinePrograms = value;
  },
  get computePrograms() {
    return computePrograms;
  },
  set computePrograms(value) {
    computePrograms = value;
  },
  get programNames() {
    return programNames;
  },
  set programNames(value) {
    programNames = value;
  },
  get dirtTexture() {
    return dirtTexture;
  },
  set dirtTexture(value) {
    dirtTexture = value;
  },
  get skyTextureOverride() {
    return skyTextureOverride;
  },
  set skyTextureOverride(value) {
    skyTextureOverride = value;
  },
  get sceneDepthTextures() {
    return sceneDepthTextures;
  },
  set sceneDepthTextures(value) {
    sceneDepthTextures = value;
  },
  get shadowColorTextures() {
    return shadowColorTextures;
  },
  set shadowColorTextures(value) {
    shadowColorTextures = value;
  },
  get colortexCurrent() {
    return colortexCurrent;
  },
  set colortexCurrent(value) {
    colortexCurrent = value;
  },
  get framebuffer() {
    return framebuffer;
  },
  set framebuffer(value) {
    framebuffer = value;
  },
  get depthCopyFramebuffer() {
    return depthCopyFramebuffer;
  },
  set depthCopyFramebuffer(value) {
    depthCopyFramebuffer = value;
  },
  get cameraViewMatrix() {
    return cameraViewMatrix;
  },
  set cameraViewMatrix(value) {
    cameraViewMatrix = value;
  },
  get cameraGbufferViewMatrix() {
    return cameraGbufferViewMatrix;
  },
  set cameraGbufferViewMatrix(value) {
    cameraGbufferViewMatrix = value;
  },
  get cameraProjectionMatrix() {
    return cameraProjectionMatrix;
  },
  set cameraProjectionMatrix(value) {
    cameraProjectionMatrix = value;
  },
  get shadowViewMatrix() {
    return shadowViewMatrix;
  },
  set shadowViewMatrix(value) {
    shadowViewMatrix = value;
  },
  get shadowGeometryViewMatrix() {
    return shadowGeometryViewMatrix;
  },
  set shadowGeometryViewMatrix(value) {
    shadowGeometryViewMatrix = value;
  },
  get shadowProjectionMatrix() {
    return shadowProjectionMatrix;
  },
  set shadowProjectionMatrix(value) {
    shadowProjectionMatrix = value;
  },
  get WORLD_TIME() {
    return WORLD_TIME;
  },
  set WORLD_TIME(value) {
    WORLD_TIME = value;
  },
  get WORLD_DAY() {
    return WORLD_DAY;
  },
  set WORLD_DAY(value) {
    WORLD_DAY = value;
  },
  get SUN_ANGLE() {
    return SUN_ANGLE;
  },
  set SUN_ANGLE(value) {
    SUN_ANGLE = value;
  },
  get clockBaseTicks() {
    return clockBaseTicks;
  },
  set clockBaseTicks(value) {
    clockBaseTicks = value;
  },
  get clockBaseSeconds() {
    return clockBaseSeconds;
  },
  set clockBaseSeconds(value) {
    clockBaseSeconds = value;
  },
  get clockSeconds() {
    return clockSeconds;
  },
  set clockSeconds(value) {
    clockSeconds = value;
  },
  get width() {
    return width;
  },
  set width(value) {
    width = value;
  },
  get height() {
    return height;
  },
  set height(value) {
    height = value;
  },
  get RENDER_DISTANCE() {
    return RENDER_DISTANCE;
  },
  set RENDER_DISTANCE(value) {
    RENDER_DISTANCE = value;
  },
  get CAMERA_FAR() {
    return CAMERA_FAR;
  },
  set CAMERA_FAR(value) {
    CAMERA_FAR = value;
  },
  get RENDER_CHUNK_RADIUS() {
    return RENDER_CHUNK_RADIUS;
  },
  set RENDER_CHUNK_RADIUS(value) {
    RENDER_CHUNK_RADIUS = value;
  },
  get CHUNK_SIZE() {
    return CHUNK_SIZE;
  },
  set CHUNK_SIZE(value) {
    CHUNK_SIZE = value;
  },
  get WORLD_TICKS_PER_DAY() {
    return WORLD_TICKS_PER_DAY;
  },
  set WORLD_TICKS_PER_DAY(value) {
    WORLD_TICKS_PER_DAY = value;
  },
  get WORLD_TICKS_PER_SECOND() {
    return WORLD_TICKS_PER_SECOND;
  },
  set WORLD_TICKS_PER_SECOND(value) {
    WORLD_TICKS_PER_SECOND = value;
  },
  get SHADOW_RESOLUTION() {
    return SHADOW_RESOLUTION;
  },
  set SHADOW_RESOLUTION(value) {
    SHADOW_RESOLUTION = value;
  },
  get FOG_COLOR() {
    return FOG_COLOR;
  },
  set FOG_COLOR(value) {
    FOG_COLOR = value;
  },
  get WATER_FOG_COLOR() {
    return WATER_FOG_COLOR;
  },
  set WATER_FOG_COLOR(value) {
    WATER_FOG_COLOR = value;
  },
  get ATLAS_WIDTH() {
    return ATLAS_WIDTH;
  },
  set ATLAS_WIDTH(value) {
    ATLAS_WIDTH = value;
  },
  get ATLAS_HEIGHT() {
    return ATLAS_HEIGHT;
  },
  set ATLAS_HEIGHT(value) {
    ATLAS_HEIGHT = value;
  },
  get M4() {
    return M4;
  },
  set M4(value) {
    M4 = value;
  },
  get resolveIrisProgram() {
    return resolveIrisProgram;
  },
  set resolveIrisProgram(value) {
    resolveIrisProgram = value;
  },
  get destroyChunkMesh() {
    return destroyChunkMesh;
  },
  set destroyChunkMesh(value) {
    destroyChunkMesh = value;
  },
  get refreshVisibleChunkMeshes() {
    return refreshVisibleChunkMeshes;
  },
  set refreshVisibleChunkMeshes(value) {
    refreshVisibleChunkMeshes = value;
  },
  get ensureWorldGeometry() {
    return ensureWorldGeometry;
  },
  set ensureWorldGeometry(value) {
    ensureWorldGeometry = value;
  },
  get streamWorldChunks() {
    return streamWorldChunks;
  },
  set streamWorldChunks(value) {
    streamWorldChunks = value;
  },
  get attachShadowTargets() {
    return attachShadowTargets;
  },
  set attachShadowTargets(value) {
    attachShadowTargets = value;
  },
  get attachColorTargets() {
    return attachColorTargets;
  },
  set attachColorTargets(value) {
    attachColorTargets = value;
  },
  get setUniforms() {
    return setUniforms;
  },
  set setUniforms(value) {
    setUniforms = value;
  },
  get u1f() {
    return u1f;
  },
  set u1f(value) {
    u1f = value;
  },
  get u1i() {
    return u1i;
  },
  set u1i(value) {
    u1i = value;
  },
  get u2f() {
    return u2f;
  },
  set u2f(value) {
    u2f = value;
  },
  get u3f() {
    return u3f;
  },
  set u3f(value) {
    u3f = value;
  },
  get um4() {
    return um4;
  },
  set um4(value) {
    um4 = value;
  },
  get applyPackBlend() {
    return applyPackBlend;
  },
  set applyPackBlend(value) {
    applyPackBlend = value;
  },
  get copyDepthSnapshots() {
    return copyDepthSnapshots;
  },
  set copyDepthSnapshots(value) {
    copyDepthSnapshots = value;
  },
  get setWorldTime() {
    return setWorldTime;
  },
  get setWeather() {
    return setWeather;
  },
  get weather() {
    const w = window.wgpuWeather;
    return { target: w.target, rain: w.rain, thunder: w.thunder, wetness: w.wetness };
  },
  set setWorldTime(value) {
    setWorldTime = value;
  },
  get loadTestPack() {
    return loadTestPack;
  },
  set loadTestPack(value) {
    loadTestPack = value;
  },
  get setStatus() {
    return setStatus;
  },
  set setStatus(value) {
    setStatus = value;
  },
};
GB.boot();
let visibleChunkMeshes = [],
  pendingChunkKeys = [],
  sceneFrustum = [];
const GBUFFER_DEBUG_VIEWS = [
  { label: 'Iris-Final-Pipeline', kind: 'final' },
  { label: 'colortex0 · beleuchtete Farbe', kind: 'color', logical: 0, displayMode: 1 },
  { label: 'colortex6 · Material / Maske / Himmelslicht', kind: 'color', logical: 6, displayMode: 0 },
  { label: 'colortex4 · Welt-Normalen', kind: 'color', logical: 4, displayMode: 2 },
  { label: 'depthtex0 · Szenentiefe', kind: 'depth', displayMode: 3 },
  { label: 'shadowtex0 · rohe Shadow-Tiefe', kind: 'shadowDepth', displayMode: 0 },
  { label: 'shadowcolor0 · Shadow-Farbe', kind: 'shadowColor', displayMode: 0 },
];
let gbufferDebugView = 0;
const COLORTEX_NOTES = {
  0: 'Farbe',
  1: 'Normalen (halbe Aufloesung)',
  2: 'TAA',
  3: 'Transluzenz / Bloom',
  4: 'Welt-Normalen + Fresnel',
  5: 'Szenenbild',
  6: 'Smoothness / Material / Himmelslicht',
  7: 'Reflexion (temporal)',
  8: 'Weltraum-Spiegelung',
};
const CHANNEL_MODES = [
  ['RGB (tonemapped)', 1],
  ['RGB linear geklemmt', 0],
  ['Normalen (x*0.5+0.5)', 2],
  ['Tiefe linear', 3],
  ['nur Rot', 4],
  ['nur Gruen', 5],
  ['nur Blau', 6],
  ['nur Alpha', 7],
  ['Betrag x10', 8],
  ['Betrag x100', 9],
];
let inspectorOpen = false,
  inspectorIndex = 0,
  inspectorMode = 0,
  inspectorPresented = false;
let inspectorProbe = null,
  inspectorProbeAt = 0,
  inspectorProbeBusy = false;
const inspectorBox = document.createElement('pre');
inspectorBox.id = 'frameInspector';
inspectorBox.hidden = true;
document.body.append(inspectorBox);
const inspectorDescribe = item => {
  const note =
    item.kind !== 'color'
      ? ''
      : item.logical === 0
        ? 'Color'
        : colortexSetting(item.logical, 'Clear') === false
          ? 'History / preserved'
          : '';
  const name =
    item.kind === 'color'
      ? 'colortex' + item.logical
      : item.kind === 'depth'
        ? 'depthtex0'
        : item.kind === 'shadowDepth'
          ? 'shadowtex0'
          : item.kind === 'shadowColor'
            ? 'shadowcolor0'
            : 'Final image';
  return {
    pass: item.pass,
    kind: item.kind,
    logical: item.logical,
    name,
    note,
    format: item.kind === 'color' ? colortexFormatLabels[item.logical] || '' : item.kind === 'final' ? '' : 'depth',
  };
};
GB.inspector = {
  get open() {
    return inspectorOpen;
  },
  get index() {
    return inspectorIndex;
  },
  get mode() {
    return inspectorMode;
  },
  modes: CHANNEL_MODES.map(mode => mode[0]),
  steps: () => inspectorList.map(inspectorDescribe),
  info() {
    const step = inspectorList[inspectorIndex],
      texture = step && step.kind !== 'final' ? inspectorTexture(step) : null;
    return {
      texture: texture ? { width: texture.width, height: texture.height, format: texture.format } : null,
      probe: inspectorProbe,
      missed: inspectorMissed,
    };
  },
  toggle(on) {
    if ((on ?? !inspectorOpen) !== inspectorOpen)
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8', key: 'F8', bubbles: true }));
  },
  select(index) {
    if (!inspectorList[index]) return;
    inspectorIndex = index;
    inspectorMode = Math.max(
      0,
      CHANNEL_MODES.findIndex(mode => mode[1] === (inspectorList[index]?.mode ?? 1)),
    );
    inspectorProbe = null;
    inspectorRefresh();
  },
  setMode(mode) {
    if (CHANNEL_MODES[mode]) {
      inspectorMode = mode;
      inspectorRefresh();
    }
  },
};
