// every uniform iris hands to packs. one missing and the pack usualy goes black
const M4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  translation: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  rotationX: a => {
    const c = Math.cos(a),
      s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotationZ: a => {
    const c = Math.cos(a),
      s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  perspective: (fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2),
      nf = 1 / (near - far);
    return new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) * nf,
      -1,
      0,
      0,
      2 * far * near * nf,
      0,
    ]);
  },
  ortho: (left, right, bottom, top, near, far) => {
    const lr = 1 / (left - right),
      bt = 1 / (bottom - top),
      nf = 1 / (near - far);
    return new Float32Array([
      -2 * lr,
      0,
      0,
      0,
      0,
      -2 * bt,
      0,
      0,
      0,
      0,
      2 * nf,
      0,
      (left + right) * lr,
      (top + bottom) * bt,
      (far + near) * nf,
      1,
    ]);
  },
  lookAt: (eye, center, up) => {
    let zx = eye[0] - center[0],
      zy = eye[1] - center[1],
      zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz);
    zx /= l;
    zy /= l;
    zz /= l;
    let xx = up[1] * zz - up[2] * zy,
      xy = up[2] * zx - up[0] * zz,
      xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz);
    xx /= l;
    xy /= l;
    xz /= l;
    const yx = zy * xz - zz * xy,
      yy = zz * xx - zx * xz,
      yz = zx * xy - zy * xx;
    return new Float32Array([
      xx,
      yx,
      zx,
      0,
      xy,
      yy,
      zy,
      0,
      xz,
      yz,
      zz,
      0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1,
    ]);
  },
  multiply: (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  invert: a => {
    const o = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4],
      b01 = a[0] * a[6] - a[2] * a[4],
      b02 = a[0] * a[7] - a[3] * a[4],
      b03 = a[1] * a[6] - a[2] * a[5],
      b04 = a[1] * a[7] - a[3] * a[5],
      b05 = a[2] * a[7] - a[3] * a[6],
      b06 = a[8] * a[13] - a[9] * a[12],
      b07 = a[8] * a[14] - a[10] * a[12],
      b08 = a[8] * a[15] - a[11] * a[12],
      b09 = a[9] * a[14] - a[10] * a[13],
      b10 = a[9] * a[15] - a[11] * a[13],
      b11 = a[10] * a[15] - a[11] * a[14];
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!d) return M4.identity();
    d = 1 / d;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d;
    o[1] = (-a[1] * b11 + a[2] * b10 - a[3] * b09) * d;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d;
    o[3] = (-a[9] * b05 + a[10] * b04 - a[11] * b03) * d;
    o[4] = (-a[4] * b11 + a[6] * b08 - a[7] * b07) * d;
    o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d;
    o[6] = (-a[12] * b05 + a[14] * b02 - a[15] * b01) * d;
    o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d;
    o[9] = (-a[0] * b10 + a[1] * b08 - a[3] * b06) * d;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d;
    o[11] = (-a[8] * b04 + a[9] * b02 - a[11] * b00) * d;
    o[12] = (-a[4] * b09 + a[5] * b07 - a[6] * b06) * d;
    o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d;
    o[14] = (-a[12] * b03 + a[13] * b01 - a[14] * b00) * d;
    o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  },
};

const IRIS_PROGRAM_FALLBACKS = {
  gbuffers_line: 'gbuffers_basic',
  gbuffers_textured: 'gbuffers_basic',
  gbuffers_textured_lit: 'gbuffers_textured',
  gbuffers_skybasic: 'gbuffers_basic',
  gbuffers_skytextured: 'gbuffers_textured',
  gbuffers_clouds: 'gbuffers_textured',
  gbuffers_terrain: 'gbuffers_textured_lit',
  gbuffers_terrain_solid: 'gbuffers_terrain',
  gbuffers_terrain_cutout: 'gbuffers_terrain',
  gbuffers_damagedblock: 'gbuffers_terrain',
  gbuffers_block: 'gbuffers_terrain',
  gbuffers_block_translucent: 'gbuffers_block',
  gbuffers_beaconbeam: 'gbuffers_textured',
  gbuffers_item: 'gbuffers_textured_lit',
  gbuffers_entities: 'gbuffers_textured_lit',
  gbuffers_entities_translucent: 'gbuffers_entities',
  gbuffers_lightning: 'gbuffers_entities',
  gbuffers_entities_glowing: 'gbuffers_entities',
  gbuffers_particles: 'gbuffers_textured_lit',
  gbuffers_particles_translucent: 'gbuffers_particles',
  gbuffers_armor_glint: 'gbuffers_textured',
  gbuffers_spidereyes: 'gbuffers_textured',
  gbuffers_hand: 'gbuffers_textured_lit',
  gbuffers_weather: 'gbuffers_textured_lit',
  gbuffers_water: 'gbuffers_terrain',
  gbuffers_hand_water: 'gbuffers_hand',
};
function resolveIrisProgram(programs, name) {
  const seen = new Set();
  while (name && !seen.has(name)) {
    if (programs.has(name)) return { name, program: programs.get(name) };
    seen.add(name);
    name = IRIS_PROGRAM_FALLBACKS[name];
  }
  return null;
}
function irisStageOrder(rasterNames, computeNames, groups) {
  const all = new Set([...rasterNames, ...computeNames.map(name => name.replace(/_[a-z]$/, ''))]);
  return [...all]
    .filter(name => groups.some(group => new RegExp('^' + group + '\\d*$').test(name)))
    .sort(
      (a, b) =>
        groups.findIndex(g => a.startsWith(g)) - groups.findIndex(g => b.startsWith(g)) ||
        Number(a.match(/\d+$/)?.[0] || 0) - Number(b.match(/\d+$/)?.[0] || 0),
    );
}
function irisViewport(properties, name, w, h) {
  const raw = properties['scale.world0/' + name] ?? properties['scale.' + name];
  if (raw === undefined) return [0, 0, w, h];
  const parts = String(raw).split(' ');
  while (parts.length > 1 && parts.at(-1) === '') parts.pop();
  const float = text => {
    const t = String(text ?? '')
      .trim()
      .replace(/[fFdD]$/, '');
    return t === '' ? NaN : Number(t);
  };
  const scale = float(parts[0]),
    x = parts.length > 1 ? float(parts[1]) : 0,
    y = parts.length > 1 ? float(parts[2]) : 0;
  if (![scale, x, y].every(Number.isFinite)) {
    console.warn('Iris: Unable to parse scale directive for ' + name + ': ' + raw);
    return [0, 0, w, h];
  }
  const left = Math.min(w - 1, Math.max(0, Math.trunc(w * x))),
    top = Math.min(h - 1, Math.max(0, Math.trunc(h * y)));
  return [
    left,
    top,
    Math.max(1, Math.min(w - left, Math.trunc(w * scale))),
    Math.max(1, Math.min(h - top, Math.trunc(h * scale))),
  ];
}
const IRIS_BLEND_FACTORS = {
  ZERO: 0,
  ONE: 1,
  SRC_COLOR: 768,
  ONE_MINUS_SRC_COLOR: 769,
  SRC_ALPHA: 770,
  ONE_MINUS_SRC_ALPHA: 771,
  DST_ALPHA: 772,
  ONE_MINUS_DST_ALPHA: 773,
  DST_COLOR: 774,
  ONE_MINUS_DST_COLOR: 775,
  SRC_ALPHA_SATURATE: 776,
  CONSTANT_COLOR: 32769,
  ONE_MINUS_CONSTANT_COLOR: 32770,
  CONSTANT_ALPHA: 32771,
  ONE_MINUS_CONSTANT_ALPHA: 32772,
};
function irisBlendFactors(value) {
  if (value === undefined) return undefined;
  if (String(value).trim().toLowerCase() === 'off') return null;
  const parts = String(value).trim().toUpperCase().split(/\s+/);
  if (parts.length !== 2 && parts.length !== 4) throw new Error('Ungültige Blend-Faktoren: ' + value);
  const values = parts.map(name => {
    if (!(name in IRIS_BLEND_FACTORS)) throw new Error('Unbekannter Blend-Faktor ' + name);
    return IRIS_BLEND_FACTORS[name];
  });
  return values.length === 2 ? [...values, ...values] : values;
}
function irisCalendar(date) {
  const y = date.getFullYear(),
    m = date.getMonth(),
    d = date.getDate(),
    seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const elapsed = ((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000) * 86400 + seconds;
  const length = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 1000;
  return {
    currentDate: [y, m + 1, d],
    currentTime: [date.getHours(), date.getMinutes(), date.getSeconds()],
    currentYearTime: [elapsed, length - elapsed],
  };
}
function irisExpressionContext(values) {
  const context = { true: 1, false: 0 };
  for (const [name, value] of Object.entries(values)) {
    context[name] = value;
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      if (value.length === 16) {
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) context[name + '.' + c + '.' + r] = value[c * 4 + r];
      } else
        for (let i = 0; i < Math.min(4, value.length); i++)
          for (const axes of ['xyzw', 'rgba']) context[name + '.' + axes[i]] = value[i];
    }
  }
  for (const [i, name] of [
    'NONE',
    'TAIGA',
    'EXTREME_HILLS',
    'JUNGLE',
    'MESA',
    'PLAINS',
    'SAVANNA',
    'ICY',
    'THEEND',
    'BEACH',
    'FOREST',
    'OCEAN',
    'DESERT',
    'RIVER',
    'SWAMP',
    'MUSHROOM',
    'NETHER',
    'UNDERGROUND',
    'MOUNTAIN',
  ].entries())
    context['CAT_' + name] = i;
  context.CAT_THE_END = context.CAT_THEEND;
  return context;
}
function irisSortUniforms(entries) {
  const byName = new Map(entries.map(entry => [entry.name, entry])),
    done = new Set(),
    visiting = new Set(),
    sorted = [];
  const visit = entry => {
    if (done.has(entry.name)) return;
    if (visiting.has(entry.name)) throw new Error('Zyklische Custom-Uniform: ' + entry.name);
    visiting.add(entry.name);
    const dependencies = node => {
      if (!node || typeof node !== 'object') return;
      if (node.name) {
        const dep = byName.get(node.name.split('.')[0]);
        if (dep) visit(dep);
      }
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.forEach(dependencies);
        else if (typeof value === 'object') dependencies(value);
    };
    dependencies(entry.node);
    visiting.delete(entry.name);
    done.add(entry.name);
    sorted.push(entry);
  };
  entries.forEach(visit);
  return sorted;
}
let irisFrame = -1,
  irisFrameValues = {},
  irisEyeSmooth = null,
  irisReloadCount = 0,
  irisItemIds = new Map();
function irisSelectedBlock(eye, look) {
  if (GB.state.active) return GB.hooks.selectedBlock(eye, look);
  const cell = eye.map(Math.floor),
    step = look.map(Math.sign),
    delta = look.map(v => (v ? Math.abs(1 / v) : Infinity));
  const next = look.map((v, i) => (v ? (cell[i] + (v > 0 ? 1 : 0) - eye[i]) / v : Infinity));
  let distance = 0;
  while (distance <= 5) {
    const [x, y, z] = cell,
      key = voxelKey(x, y, z),
      mesh = worldChunks.get(Math.floor(x / CHUNK_SIZE) + ',' + Math.floor(z / CHUNK_SIZE));
    if (!removedBlocks.has(key) && (solidBlockAt(x, y, z) || mesh?.plants.has(key))) {
      const column = physicsColumn(x, z),
        placed = placedBlocks.get(key);
      const type =
        typeof placed === 'string' ? placed : placed?.type || (y === column.height ? 'grass_block' : 'stone');
      return {
        currentSelectedBlockId: packBlockId(type, 0),
        currentSelectedBlockPos: cell.map((v, i) => v + 0.5 - eye[i]),
      };
    }
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    distance = next[axis];
    cell[axis] += step[axis];
    next[axis] += delta[axis];
  }
  return { currentSelectedBlockId: 0, currentSelectedBlockPos: [-256, -256, -256] };
}
function irisUniformState(eye, now) {
  if (irisFrame === renderedFrameCounter) return irisFrameValues;
  irisFrame = renderedFrameCounter;
  const water = eyeInWater(eye),
    column = physicsColumn(Math.floor(eye[0]), Math.floor(eye[2]));
  const cp = Math.cos(pitch),
    look = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const feetWater = GB.state.active
    ? GB.hooks.medium([eye[0], eye[1] - PLAYER_EYE_HEIGHT, eye[2]]) > 0
    : column.water && eye[1] - PLAYER_EYE_HEIGHT < RIVER_LEVEL + 0.875;
  const light = currentEyeLight(),
    halfLife = Number(activeRenderConstants.eyeBrightnessHalflife ?? 10) * 0.1;
  irisEyeSmooth = irisEyeSmooth
    ? light.map((v, i) => v + (irisEyeSmooth[i] - v) * (halfLife > 0 ? Math.pow(0.5, frameDelta / halfLife) : 0))
    : [...light];
  const heldName = HOTBAR_ITEMS[hotbarSlot]?.type,
    heldId = irisItemIds.get(heldName) ?? -1;
  const invShadow = M4.invert(shadowViewMatrix),
    lightWorld = [invShadow[8], invShadow[9], invShadow[10]],
    g = cameraGbufferViewMatrix;
  const sun = [0, 1, 2].map(
    row =>
      100 *
      (g[row] * lightWorld[0] + g[4 + row] * lightWorld[1] + g[8 + row] * lightWorld[2]) *
      (SUN_ANGLE > 0.5 ? -1 : 1),
  );
  updateVanillaSkyColors();
  const fog = GB.state.active ? GB.hooks.fogColor(eye) : water ? WATER_FOG_COLOR : FOG_COLOR;
  irisFrameValues = {
    ...irisCalendar(new Date()),
    pi: Math.PI,
    frameCounter: renderedFrameCounter % 720720,
    frameTime: frameDelta,
    frameTimeCounter: now % 3600,
    worldTime: WORLD_TIME,
    worldDay: WORLD_DAY,
    moonPhase: WORLD_DAY % 8,
    sunAngle: SUN_ANGLE,
    shadowAngle: SUN_ANGLE > 0.5 ? SUN_ANGLE - 0.5 : SUN_ANGLE,
    near: CAMERA_NEAR,
    far: RENDER_DISTANCE,
    viewWidth: width,
    viewHeight: height,
    aspectRatio: width / height,
    cameraPosition: GB.hooks.absolute(eye),
    previousCameraPosition: GB.hooks.absolute(previousCameraPosition),
    eyePosition: GB.hooks.absolute(eye),
    relativeEyePosition: [0, 0, 0],
    eyeAltitude: GB.hooks.absolute(eye)[1],
    cameraPositionInt: GB.hooks.absolute(eye).map(Math.floor),
    cameraPositionFract: GB.hooks.absolute(eye).map(v => v - Math.floor(v)),
    previousCameraPositionInt: GB.hooks.absolute(previousCameraPosition).map(Math.floor),
    previousCameraPositionFract: GB.hooks.absolute(previousCameraPosition).map(v => v - Math.floor(v)),
    eyeBrightness: light,
    eyeBrightnessSmooth: irisEyeSmooth.map(Math.round),
    isEyeInWater: GB.state.active ? GB.hooks.medium(eye) : water ? 1 : 0,
    feetInWater: +feetWater,
    playerLookVector: look,
    playerBodyVector: [Math.sin(yaw), 0, -Math.cos(yaw)],
    firstPersonCamera: 1,
    isSpectator: 0,
    is_sneaking: +(pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')),
    is_sprinting: +(pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight')),
    is_on_ground: +grounded,
    is_burning: 0,
    is_hurt: 0,
    is_invisible: 0,
    is_alive: 1,
    isRiding: 0,
    isElytraFlying: 0,
    inSwimmingAnimation: 0,
    vehicleInWater: 0,
    vehicleId: 0,
    vehicleLookVector: [0, 0, 0],
    relativeVehiclePosition: [0, 0, 0],
    currentPlayerHealth: -1,
    maxPlayerHealth: 20,
    currentPlayerHunger: -1,
    maxPlayerHunger: 20,
    currentPlayerArmor: -1,
    maxPlayerArmor: 50,
    currentPlayerAir: -1,
    maxPlayerAir: 300,
    screenBrightness: 0.5,
    hideGUI: +document.body.classList.contains('hide-ui'),
    isRightHanded: 1,
    playerMood: 0,
    constantMood: 0,
    blindness: 0,
    darknessFactor: 0,
    darknessLightFactor: 0,
    nightVision: GB.state.active ? GB.hooks.nativeEffectUniforms().nightVision : 0,
    rainStrength: window.wgpuWeather?.rain || 0,
    wetness: window.wgpuWeather?.wetness || 0,
    thunderStrength: window.wgpuWeather?.thunder || 0,
    heavyFog: 0,
    endFlashIntensity: 0,
    previousEndFlashIntensity: 0,
    endFlashPosition: [0, 0, 0],
    lightningBoltPosition: window.wgpuWeather?.boltPosition || [0, 0, 0, 0],
    sunPosition: sun,
    moonPosition: sun.map(v => -v),
    shadowLightPosition: sun.map(v => v * (SUN_ANGLE > 0.5 ? -1 : 1)),
    upPosition: [g[4] * 100, g[5] * 100, g[6] * 100],
    skyColor: [...SKY_COLOR],
    fogColor: [...fog],
    fogStart: GB.state.active ? GB.hooks.fog(eye).start : water ? 0 : RENDER_DISTANCE * 0.75,
    fogEnd: GB.state.active ? GB.hooks.fog(eye).end : water ? 96 : RENDER_DISTANCE,
    fogDensity: 0,
    fogMode: 9729,
    fogShape: 1,
    ...(GB.state.active
      ? GB.hooks.biomeUniforms(eye)
      : {
          biome: column.water ? 7 : 4,
          biome_category: column.water ? 13 : 10,
          biome_precipitation: 1,
          temperature: column.water ? 0.5 : 0.7,
          rainfall: column.water ? 0.5 : 0.8,
        }),
    seaLevel: RIVER_LEVEL,
    bedrockLevel: -64,
    heightLimit: 384,
    logicalHeightLimit: 384,
    hasCeiling: 0,
    hasSkylight: 1,
    ambientLight: 0,
    heldItemId: DEBUG_VIEWS[debugView][1] || heldId,
    heldItemId2: DEBUG_VIEWS[debugView][2] || -1,
    heldBlockLightValue: heldBlockLight(),
    heldBlockLightValue2: 0,
    heldBlockLightColor: [1, 1, 1],
    heldBlockLightColor2: [1, 1, 1],
    ...(GB.state.active ? { ...GB.hooks.heldLightUniforms(), ...GB.hooks.nativeEffectUniforms() } : {}),
    currentRenderedItemId: -1,
    currentRenderedBlockEntityId: -1,
    currentRenderedEntityId: -1,
    entityId: -1,
    blockEntityId: -1,
    entityColor: [0, 0, 0, 0],
    dhRenderDistance: 0,
    dhNearPlane: CAMERA_NEAR,
    dhFarPlane: CAMERA_FAR,
    dhProjection: identityMatrix,
    dhProjectionInverse: identityMatrix,
    dhPreviousProjection: identityMatrix,
    currentColorSpace: 0,
    anisotropicFiltering: 0,
    textureFilteringMode: 0,
    chunkFadeTimeInv: 0,
    cloudTime: now * 20,
    textureReloadCount: irisReloadCount,
    iris_ScreenSize: [width, height],
    gbufferModelView: g,
    gbufferModelViewInverse: M4.invert(g),
    gbufferProjection: cameraProjectionMatrix,
    gbufferProjectionInverse: M4.invert(cameraProjectionMatrix),
    gbufferPreviousModelView: previousGbufferViewMatrix,
    gbufferPreviousProjection: previousProjectionMatrix,
    shadowModelView: shadowViewMatrix,
    shadowModelViewInverse: invShadow,
    shadowProjection: shadowProjectionMatrix,
    shadowProjectionInverse: M4.invert(shadowProjectionMatrix),
    ...irisSelectedBlock(eye, look),
  };
  return irisFrameValues;
}
function uploadIrisUniforms(program, eye, now) {
  const values = irisUniformState(eye, now),
    pass = programNames.get(program) || '',
    texture = skyTextureOverride || dirtTexture;
  const stages = {
    gbuffers_skybasic: 1,
    gbuffers_skytextured: 4,
    gbuffers_clouds: 20,
    gbuffers_water: 17,
    gbuffers_hand: 16,
    gbuffers_hand_water: 23,
    gbuffers_entities: 11,
    gbuffers_block: 12,
    gbuffers_weather: 21,
  };
  const alpha = String(activePackProperties['alphaTest.' + pass] || '')
    .trim()
    .split(/\s+/);
  const dynamic = {
    ...values,
    renderStage: stages[pass] ?? (/^gbuffers_terrain/.test(pass) ? 8 : 0),
    gtextureId: texture?.id || 0,
    gtextureSize: [texture?.width || 1, texture?.height || 1],
    atlasSize: skyTextureOverride ? [0, 0] : [ATLAS_WIDTH, ATLAS_HEIGHT],
    blendFunc: gl.enabled.has(gl.BLEND) ? gl.blendFactors || [770, 771, 1, 771] : [0, 0, 0, 0],
    alphaTestRef: alpha[0] === 'off' ? 0 : Number(alpha[1] ?? 0.1),
    iris_currentAlphaTest: alpha[0] === 'off' ? 0 : Number(alpha[1] ?? 0.1),
    iris_FogColor: [...values.fogColor, 1],
    iris_FogStart: values.fogStart,
    iris_FogEnd: values.fogEnd,
    iris_FogDensity: values.fogDensity,
    iris_DefaultProjectionMatrixInverse: values.gbufferProjectionInverse,
    iris_DefaultModelViewMatrixInverse: values.gbufferModelViewInverse,
    iris_ShadowProjectionMatrixInverse: values.shadowProjectionInverse,
    iris_ShadowModelViewMatrixInverse: values.shadowModelViewInverse,
  };
  for (const [name, value] of Object.entries(dynamic)) {
    const loc = uniform(program, name);
    if (loc !== null) gl.writeUniform(loc, typeof value === 'number' ? [value] : value);
  }
  return dynamic;
}

function uniform(program, name) {
  let m = uniformCache.get(program);
  if (!m) {
    m = new Map();
    uniformCache.set(program, m);
  }
  if (!m.has(name)) m.set(name, gl.getUniformLocation(program, name));
  return m.get(name);
}
function u1f(p, n, v) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform1f(l, v);
}
function u1i(p, n, v) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform1i(l, v);
}
function u2f(p, n, a, b) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform2f(l, a, b);
}
function u2i(p, n, a, b) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform2i(l, a, b);
}
function u3f(p, n, a, b, c) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform3f(l, a, b, c);
}
function u3i(p, n, a, b, c) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform3i(l, a, b, c);
}
function u4f(p, n, a, b, c, d) {
  const l = uniform(p, n);
  if (l !== null) gl.uniform4f(l, a, b, c, d);
}
function um4(p, n, v) {
  const l = uniform(p, n);
  if (l !== null) gl.uniformMatrix4fv(l, false, v);
}
function um3(p, n, v) {
  const l = uniform(p, n);
  if (l !== null) gl.uniformMatrix3fv(l, false, v);
}

function setUniforms(
  program,
  view,
  projection,
  eye,
  now,
  worldSpace = view === cameraViewMatrix || view === shadowGeometryViewMatrix,
) {
  const identity = identityMatrix,
    vp = M4.multiply(projection, view);
  const gView = cameraGbufferViewMatrix,
    gProjection = cameraProjectionMatrix,
    gInvView = GB.hooks.uniformInverse(gView),
    gInvProjection = GB.hooks.uniformInverse(gProjection);
  const sView = shadowViewMatrix,
    sProjection = shadowProjectionMatrix,
    sInvView = GB.hooks.uniformInverse(sView),
    sInvProjection = GB.hooks.uniformInverse(sProjection);
  const normal = new Float32Array([view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]);
  [
    ['mc_ModelViewMatrix', view],
    ['mc_ProjectionMatrix', projection],
    ['mc_ModelViewProjectionMatrix', vp],
    ['gbufferModelView', gView],
    ['gbufferModelViewInverse', gInvView],
    ['gbufferProjection', gProjection],
    ['gbufferProjectionInverse', gInvProjection],
    ['gbufferPreviousModelView', previousGbufferViewMatrix],
    ['gbufferPreviousProjection', previousProjectionMatrix],
    ['shadowModelView', sView],
    ['shadowModelViewInverse', sInvView],
    ['shadowProjection', sProjection],
    ['shadowProjectionInverse', sInvProjection],
  ].forEach(([n, m]) => um4(program, n, m));
  um3(program, 'mc_NormalMatrix', normal);
  const offset = worldSpace ? eye : [0, 0, 0],
    irisView = M4.multiply(view, M4.translation(offset[0], offset[1], offset[2]));
  u3f(program, 'wgpuVertexOffset', offset[0], offset[1], offset[2]);
  um4(program, 'wgpuIrisModelView', irisView);
  um4(program, 'wgpuIrisModelViewProjection', M4.multiply(projection, irisView));
  um4(program, 'projectionMatrix', projection);
  um4(program, 'modelViewMatrix', irisView);
  um3(program, 'normalMatrix', normal);
  um4(program, 'textureMatrix', identityMatrix);
  um4(program, 'projectionMatrixInverse', GB.hooks.uniformInverse(projection));
  um4(program, 'modelViewMatrixInverse', GB.hooks.uniformInverse(irisView));
  const texMatrix0 = uniform(program, 'mc_TextureMatrix[0]'),
    texMatrix1 = uniform(program, 'mc_TextureMatrix[1]');
  if (texMatrix0 !== null) gl.uniformMatrix4fv(texMatrix0, false, textureMatrixArray);
  else if (texMatrix1 !== null) gl.uniformMatrix4fv(texMatrix1, false, lightmapTextureMatrix);
  u1f(program, 'viewerAlphaTestRef', 0.1);
  u1f(program, 'near', CAMERA_NEAR);
  u1f(program, 'far', RENDER_DISTANCE);
  u1f(program, 'viewWidth', width);
  u1f(program, 'viewHeight', height);
  u1f(program, 'aspectRatio', width / height);
  const temporalFrame = renderedFrameCounter;
  u1f(program, 'frameTime', frameDelta);
  u1f(program, 'frameTimeSmooth', frameDelta);
  u1f(program, 'frameTimeCounter', now);
  u1f(program, 'framemod2', temporalFrame % 2);
  u1f(program, 'framemod4', temporalFrame % 4);
  u1f(program, 'framemod8', temporalFrame % 8);
  u1f(program, 'framemod600', temporalFrame % 600);
  u1i(program, 'frameCounter', temporalFrame);
  u1i(program, 'worldTime', WORLD_TIME);
  u1i(program, 'worldDay', WORLD_DAY);
  u1i(program, 'isEyeInWater', GB.state.active ? GB.hooks.medium(eye) : eyeInWater(eye) ? 1 : 0);
  u1i(program, 'moonPhase', WORLD_DAY % 8);
  u1i(program, 'renderStage', 0);
  u1i(program, 'currentRenderedItemId', 0);
  u1i(program, 'currentRenderedBlockEntityId', 0);
  u1i(program, 'currentRenderedEntityId', 0);
  u1i(program, 'entityId', 0);
  u1i(program, 'blockEntityId', 0);
  u1i(program, 'is_invisible', 0);
  u1i(program, 'heldItemId', DEBUG_VIEWS[debugView][1] || heldItemIdValue());
  u1i(program, 'heldItemId2', DEBUG_VIEWS[debugView][2]);
  u1i(program, 'heldBlockLightValue', heldBlockLight());
  u1i(program, 'heldBlockLightValue2', 0);
  u1i(program, 'dhRenderDistance', RENDER_DISTANCE);
  u1f(program, 'sunAngle', SUN_ANGLE);
  u1f(program, 'screenBrightness', 0.5);
  u1f(program, 'eyeBrightnessM', 1);
  u1f(program, 'eyeBrightnessM2', 1);
  u1f(program, 'rainStrength', window.wgpuWeather?.rain || 0);
  u1f(program, 'wetness', window.wgpuWeather?.wetness || 0);
  u1f(program, 'rainFactor', 0);
  u1f(program, 'nightVision', GB.state.active ? GB.hooks.nativeEffectUniforms().nightVision : 0);
  u3f(program, 'eyePosition', eye[0], eye[1], eye[2]);
  u3f(program, 'chunkOffset', 0, 0, 0);
  u1i(program, 'hideGUI', +document.body.classList.contains('hide-ui'));
  u1i(program, 'isRightHanded', 1);
  u1i(program, 'bedrockLevel', -64);
  u1i(program, 'heightLimit', 384);
  u1f(program, 'shadowDistance', SHADOW_DISTANCE);
  u1f(program, 'shadowDistanceRenderMul', 1);
  u1i(program, 'shadowMapResolution', SHADOW_RESOLUTION);
  {
    const fog = vanillaFogDistances();
    u1f(program, 'fogStart', fog.environmentalStart);
    u1f(program, 'fogEnd', fog.environmentalEnd);
    u1f(program, 'wgpuFogRenderStart', fog.renderStart);
    u1f(program, 'wgpuFogRenderEnd', fog.renderEnd);
  }
  u1f(program, 'fogDensity', 0);
  u1f(program, 'blindness', 0);
  u1f(program, 'darknessFactor', 0);
  u1f(program, 'darknessLightFactor', 0);
  u1f(program, 'maxBlindnessDarkness', 0);
  u1f(program, 'eyeAltitude', eye[1]);
  u1f(program, 'cloudHeight', 191.98);
  u1f(program, 'starter', 1);
  u1f(program, 'velocity', 0);
  u1f(program, 'isEyeInCave', 0);
  u1i(program, 'heavyFog', 0);
  u1f(program, 'inDry', 0);
  u1f(program, 'inRainy', 1);
  u1f(program, 'inSnowy', 0);
  u1f(program, 'currentPlayerHealth', 1);
  u1f(program, 'maxPlayerHealth', 20);
  u1f(program, 'currentPlayerHunger', 1);
  u1f(program, 'maxPlayerHunger', 20);
  u1f(program, 'currentPlayerAir', 1);
  u1f(program, 'maxPlayerAir', 300);
  u1i(program, 'is_alive', 1);
  u1i(program, 'is_hurt', 0);
  u1f(program, 'playerMood', 0);
  u1f(program, 'centerDepthSmooth', 1);
  u1f(program, 'endFlashIntensity', 0);
  u1f(program, 'dhZnear', CAMERA_NEAR);
  u1f(program, 'dhZfar', CAMERA_FAR);
  u1f(program, 'inBasaltDeltas', 0);
  u1f(program, 'inCrimsonForest', 0);
  u1f(program, 'inNetherWastes', 0);
  u1f(program, 'inPaleGarden', 0);
  u1f(program, 'inSoulValley', 0);
  u1f(program, 'inWarpedForest', 0);
  u2i(program, 'atlasSize', ATLAS_WIDTH, ATLAS_HEIGHT);
  u2i(program, 'eyeBrightness', ...currentEyeLight());
  u2i(program, 'eyeBrightnessSmooth', ...currentEyeLight());
  u3f(program, 'cameraPosition', ...GB.hooks.absolute(eye));
  u3f(program, 'previousCameraPosition', ...GB.hooks.absolute(previousCameraPosition));
  const fx = ((eye[0] % 1) + 1) % 1,
    fy = ((eye[1] % 1) + 1) % 1,
    fz = ((eye[2] % 1) + 1) % 1;
  const pfx = ((previousCameraPosition[0] % 1) + 1) % 1,
    pfy = ((previousCameraPosition[1] % 1) + 1) % 1,
    pfz = ((previousCameraPosition[2] % 1) + 1) % 1;
  u3i(program, 'cameraPositionInt', Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
  u3i(
    program,
    'previousCameraPositionInt',
    Math.floor(previousCameraPosition[0]),
    Math.floor(previousCameraPosition[1]),
    Math.floor(previousCameraPosition[2]),
  );
  u3f(program, 'cameraPositionFract', fx, fy, fz);
  u3f(program, 'previousCameraPositionFract', pfx, pfy, pfz);
  u3f(program, 'skyColor', SKY_COLOR[0], SKY_COLOR[1], SKY_COLOR[2]);
  updateVanillaSkyColors();
  const fog = GB.state.active ? GB.hooks.fogColor(eye) : eyeInWater(eye) ? WATER_FOG_COLOR : FOG_COLOR;
  u3f(program, 'fogColor', fog[0], fog[1], fog[2]);
  u3f(program, 'relativeEyePosition', 0, 0, 0);
  u4f(program, 'entityColor', 0, 0, 0, 0);
  const lightWorld = [sInvView[8], sInvView[9], sInvView[10]],
    lightView = [0, 1, 2].map(
      row => 100 * (gView[row] * lightWorld[0] + gView[4 + row] * lightWorld[1] + gView[8 + row] * lightWorld[2]),
    );
  u3f(program, 'sunPosition', ...lightView);
  u3f(program, 'moonPosition', ...lightView.map(value => -value));
  u3f(program, 'shadowLightPosition', ...lightView);
  u3f(program, 'upPosition', gView[4] * 100, gView[5] * 100, gView[6] * 100);
  u3f(program, 'endFlashPosition', 0, 0, 0);
  u4f(program, 'lightningBoltPosition', 0, 0, 0, 0);
  const irisValues = uploadIrisUniforms(program, eye, now);
  bindPropertyUniforms(program, eye, now, irisValues);
  bindSamplers(program);
  markStageWrittenTargets(programNames.get(program) || '');
}
