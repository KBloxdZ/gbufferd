// rain n thunder fade over ticks like vanilla does, packs read wetness off of this
window.wgpuWeather = { target: 'clear', rain: 0, thunder: 0, wetness: 0, lastNow: null, lightmapKey: '' };
function setWeather(kind) {
  const target = ['clear', 'rain', 'thunder'].includes(String(kind)) ? String(kind) : 'clear';
  window.wgpuWeather.target = target;
  return target;
}
function updateWeather(now) {
  const w = window.wgpuWeather,
    dt = w.lastNow === null ? 0 : Math.max(0, Math.min(1, now - w.lastNow));
  w.lastNow = now;
  if (GB.state.active) {
    const host = typeof GB.hooks.weather === 'function' ? GB.hooks.weather() : null;
    w.rain = Math.max(0, Math.min(1, Number(host?.rain) || 0));
    w.thunder = Math.max(0, Math.min(1, Number(host?.thunder) || 0));
  } else {
    const step = 0.01 * dt * WORLD_TICKS_PER_SECOND,
      toward = (value, goal) => (value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step));
    const dry = window.wgpuDimension !== 'overworld';
    w.rain = toward(w.rain, dry || w.target === 'clear' ? 0 : 1);
    w.thunder = toward(w.thunder, !dry && w.target === 'thunder' ? 1 : 0);
  }
  {
    const eye = cameraPosition,
      sky = skyLightAt(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2])) ?? 15,
      target = w.rain * Math.min(1, Math.max(0, (sky - 8) / 7));
    w.rainFog = (w.rainFog || 0) + (target - (w.rainFog || 0)) * Math.min(1, dt * WORLD_TICKS_PER_SECOND * 0.2);
  }
  const up = Number(activeRenderConstants?.wetnessHalflife ?? 600) * 0.1,
    down = Number(activeRenderConstants?.drynessHalflife ?? 200) * 0.1;
  const half = w.rain > w.wetness ? up : down,
    decay = half > 0 ? 1 - Math.exp((-Math.LN2 * dt) / half) : 1;
  w.wetness += (w.rain - w.wetness) * decay;
  const key = Math.round(w.rain * 64) + ',' + Math.round(w.thunder * 64) + (w.skyFlash > 0 ? ',flash' : '');
  if (key !== w.lightmapKey) {
    w.lightmapKey = key;
    if (lightmapTexture) buildLightmapTexture();
  }
}
let weatherRainTexture = null,
  weatherMesh = null,
  weatherTops = new Map(),
  weatherTopsKey = '';
function weatherTexture() {
  if (weatherRainTexture) return weatherRainTexture;
  const w = 64,
    h = 256,
    data = new Uint8Array(w * h * 4);
  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };
  for (let streak = 0; streak < 44; streak++) {
    const x = Math.floor(rnd() * w),
      y0 = Math.floor(rnd() * h),
      len = 10 + Math.floor(rnd() * 22),
      a = 110 + Math.floor(rnd() * 90);
    for (let k = 0; k < len; k++) {
      const y = (y0 + k) % h,
        o = (y * w + x) * 4,
        fade = Math.sin((Math.PI * k) / len);
      data[o] = 196;
      data[o + 1] = 214;
      data[o + 2] = 236;
      data[o + 3] = Math.max(data[o + 3], Math.round(a * fade));
    }
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return (weatherRainTexture = texture);
}
function weatherTop(x, z) {
  let top = physicsColumn(x, z).height;
  if (terrainColumn(x, z).water && RIVER_LEVEL > top) top = RIVER_LEVEL;
  for (let y = top + 1; y <= top + 24; y++) if (solidBlockAt(x, y, z)) top = y;
  return top + 1;
}
function renderWeather(eye, now) {
  const w = window.wgpuWeather;
  if (GB.state.active || w.rain <= 0) return;
  const resolved = resolveIrisProgram(gbufferPrograms, 'gbuffers_weather'),
    program = resolved?.program;
  if (!program) return;
  const radius = 10,
    bx = Math.floor(eye[0]),
    by = Math.floor(eye[1]),
    bz = Math.floor(eye[2]);
  const key = bx + ',' + bz;
  if (key !== weatherTopsKey) {
    weatherTopsKey = key;
    weatherTops = new Map();
  }
  const tickTime = now * WORLD_TICKS_PER_SECOND,
    ticks = Math.floor(tickTime),
    partial = tickTime - ticks;
  const vertices = [],
    indices = [];
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = bx + dx,
        z = bz + dz,
        len = Math.hypot(dx, dz);
      if (!len) continue;
      let height = weatherTops.get(dx + ',' + dz);
      if (height === undefined) {
        height = weatherTop(x, z);
        weatherTops.set(dx + ',' + dz, height);
      }
      const minY = Math.max(by - radius, height),
        maxY = Math.max(by + radius, height);
      if (maxY === minY) continue;
      const sizeX = (-dz / len) * 0.5,
        sizeZ = (dx / len) * 0.5;
      let seed =
        (Math.imul(Math.imul(x, x), 3121) + Math.imul(x, 45238971)) ^
        (Math.imul(Math.imul(z, z), 418711) + Math.imul(z, 13761));
      seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d);
      seed ^= seed >>> 12;
      const random = ((seed >>> 0) % 65536) / 65536;
      const offset =
        (-(
          ((ticks +
            Math.imul(Math.imul(x, x), 3121) +
            Math.imul(x, 45238971) +
            Math.imul(Math.imul(z, z), 418711) +
            Math.imul(z, 13761)) &
            31) +
          partial
        ) /
          32) *
        (3 + random);
      const ddx = x + 0.5 - eye[0],
        ddz = z + 0.5 - eye[2],
        distance = (ddx * ddx + ddz * ddz) / (radius * radius);
      const alpha = ((1 - distance) * 0.5 + 0.5) * w.rain;
      if (alpha <= 0) continue;
      const sky = skyLightAt(x, Math.max(by, height), z) ?? 15,
        light = [8, sky * 16 + 8];
      const base = vertices.length / 31,
        cx = x + 0.5,
        cz = z + 0.5;
      const vertex = (px, py, pz, u, v) =>
        vertices.push(
          px,
          py,
          pz,
          1,
          0,
          1,
          0,
          u,
          v,
          0,
          1,
          light[0],
          light[1],
          0,
          1,
          1,
          1,
          1,
          alpha,
          0,
          0,
          0,
          0,
          0.5,
          0.5,
          0,
          1,
          1,
          0,
          0,
          1,
        );
      vertex(cx - sizeX, minY, cz - sizeZ, 0, maxY * 0.25 + offset);
      vertex(cx + sizeX, minY, cz + sizeZ, 1, maxY * 0.25 + offset);
      vertex(cx + sizeX, maxY, cz + sizeZ, 1, minY * 0.25 + offset);
      vertex(cx - sizeX, maxY, cz - sizeZ, 0, minY * 0.25 + offset);
      indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
    }
  if (!indices.length) return;
  weatherMesh = uploadVanillaSkyMesh(vertices, indices, weatherMesh);
  const targets = activePassTargets[resolved.name] || [0];
  attachColorTargets(targets, colortexCurrent, true);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(String(activePackProperties['rain.depth']).trim() === 'true');
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  applyPackBlend(resolved.name, targets);
  skyTextureOverride = weatherTexture();
  gl.useProgram(program);
  setUniforms(program, cameraViewMatrix, cameraProjectionMatrix, eye, now);
  u1i(program, 'renderStage', 21);
  gl.bindVertexArray(weatherMesh.vao);
  gl.drawElements(gl.TRIANGLES, weatherMesh.count, gl.UNSIGNED_INT, 0);
  skyTextureOverride = null;
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  inspectorCapture('gbuffers_weather');
}
class JavaRandom {
  constructor(seed) {
    this.s = (BigInt.asUintN(64, BigInt(seed)) ^ 0x5deece66dn) & 0xffffffffffffn;
  }
  next(bits) {
    this.s = (this.s * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    return Number(BigInt.asIntN(32, this.s >> BigInt(48 - bits)));
  }
  nextInt(bound) {
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits, value;
    do {
      bits = this.next(31);
      value = bits % bound;
    } while (((bits - value + (bound - 1)) | 0) < 0);
    return value;
  }
  nextLong() {
    return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
  }
}
const weatherRandom = new JavaRandom(Date.now());
function spawnLightning(x, z) {
  const w = window.wgpuWeather,
    y = weatherTop(Math.floor(x), Math.floor(z));
  w.bolts = w.bolts || [];
  w.bolts.push({
    x: Math.floor(x) + 0.5,
    y,
    z: Math.floor(z) + 0.5,
    life: 2,
    flashes: weatherRandom.nextInt(3) + 1,
    seed: weatherRandom.nextLong(),
    random: new JavaRandom(weatherRandom.nextLong()),
  });
}
function lightningTick(cx, cz) {
  const w = window.wgpuWeather;
  w.bolts = w.bolts || [];
  if (w.skyFlash > 0) w.skyFlash--;
  if (w.thunder > 0.9 && w.rain > 0.2) {
    const radius = 10;
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++)
        if (weatherRandom.nextInt(100000) === 0)
          spawnLightning(
            (Math.floor(cx / 16) + dx) * 16 + weatherRandom.nextInt(16),
            (Math.floor(cz / 16) + dz) * 16 + weatherRandom.nextInt(16),
          );
  }
  for (const bolt of w.bolts) {
    bolt.life--;
    if (bolt.life < 0) {
      if (bolt.flashes === 0) bolt.dead = true;
      else if (bolt.life < -bolt.random.nextInt(10)) {
        bolt.flashes--;
        bolt.life = 1;
        bolt.seed = bolt.random.nextLong();
      }
    }
    if (!bolt.dead && bolt.life >= 0) w.skyFlash = 2;
  }
  w.bolts = w.bolts.filter(bolt => !bolt.dead);
}
function updateLightning(now, eye) {
  const w = window.wgpuWeather;
  if (GB.state.active) {
    w.bolts = [];
    w.skyFlash = 0;
    w.flash = 0;
    return;
  }
  const tick = Math.floor(now * WORLD_TICKS_PER_SECOND);
  if (w.tick === undefined || tick < w.tick || tick - w.tick > 40) w.tick = tick;
  while (w.tick < tick) {
    w.tick++;
    lightningTick(eye[0], eye[2]);
  }
  const partial = now * WORLD_TICKS_PER_SECOND - tick;
  w.flash = w.skyFlash > 0 ? Math.min(1, w.skyFlash - partial) * 0.45 : 0;
  const bolt = w.bolts?.[0];
  w.boltPosition = bolt ? [bolt.x - eye[0], bolt.y - eye[1], bolt.z - eye[2], 1] : [0, 0, 0, 0];
}
function lightningVertices(bolt, vertices, indices) {
  const xs = new Array(8),
    zs = new Array(8);
  let fx = 0,
    fz = 0;
  const random = new JavaRandom(bolt.seed);
  for (let i = 7; i >= 0; i--) {
    xs[i] = fx;
    zs[i] = fz;
    fx += random.nextInt(11) - 5;
    fz += random.nextInt(11) - 5;
  }
  const quad = (x1, z1, yIndex, x2, z2, w1, w2, b1, b2, b3, b4) => {
    const base = vertices.length / 31,
      push = (x, y, z) =>
        vertices.push(
          bolt.x + x,
          bolt.y + y,
          bolt.z + z,
          1,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          248,
          248,
          0,
          1,
          0.45,
          0.45,
          0.5,
          0.3,
          0,
          0,
          0,
          0,
          0.5,
          0.5,
          0,
          1,
          1,
          0,
          0,
          1,
        );
    push(x1 + (b1 ? w2 : -w2), yIndex * 16, z1 + (b2 ? w2 : -w2));
    push(x2 + (b1 ? w1 : -w1), (yIndex + 1) * 16, z2 + (b2 ? w1 : -w1));
    push(x2 + (b3 ? w1 : -w1), (yIndex + 1) * 16, z2 + (b4 ? w1 : -w1));
    push(x1 + (b3 ? w2 : -w2), yIndex * 16, z1 + (b4 ? w2 : -w2));
    indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
  };
  for (let j = 0; j < 4; j++) {
    const r = new JavaRandom(bolt.seed);
    for (let k = 0; k < 3; k++) {
      const l = k > 0 ? 7 - k : 7,
        i1 = k > 0 ? l - 2 : 0;
      let f2 = xs[l] - fx,
        f3 = zs[l] - fz;
      for (let j1 = l; j1 >= i1; j1--) {
        const f4 = f2,
          f5 = f3;
        if (k === 0) {
          f2 += r.nextInt(11) - 5;
          f3 += r.nextInt(11) - 5;
        } else {
          f2 += r.nextInt(31) - 15;
          f3 += r.nextInt(31) - 15;
        }
        let f10 = 0.1 + j * 0.2;
        if (k === 0) f10 *= j1 * 0.1 + 1;
        let f11 = 0.1 + j * 0.2;
        if (k === 0) f11 *= (j1 - 1) * 0.1 + 1;
        quad(f2, f3, j1, f4, f5, f10, f11, false, false, true, false);
        quad(f2, f3, j1, f4, f5, f10, f11, true, false, true, true);
        quad(f2, f3, j1, f4, f5, f10, f11, true, true, false, true);
        quad(f2, f3, j1, f4, f5, f10, f11, false, true, false, false);
      }
    }
  }
}
let lightningMesh = null;
function renderLightning(eye, now) {
  const w = window.wgpuWeather;
  if (GB.state.active || !w.bolts?.length) return;
  const resolved = resolveIrisProgram(gbufferPrograms, 'gbuffers_lightning'),
    program = resolved?.program;
  if (!program) return;
  const vertices = [],
    indices = [];
  for (const bolt of w.bolts) lightningVertices(bolt, vertices, indices);
  lightningMesh = uploadVanillaSkyMesh(vertices, indices, lightningMesh);
  const targets = activePassTargets[resolved.name] || [0];
  attachColorTargets(targets, colortexCurrent, true);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.SRC_ALPHA, gl.ONE);
  applyPackBlend(resolved.name, targets);
  skyTextureOverride = whiteTexture;
  gl.useProgram(program);
  setUniforms(program, cameraViewMatrix, cameraProjectionMatrix, eye, now);
  u1i(program, 'renderStage', 11);
  u1i(program, 'entityId', packEntityId('lightning_bolt'));
  gl.bindVertexArray(lightningMesh.vao);
  gl.drawElements(gl.TRIANGLES, lightningMesh.count, gl.UNSIGNED_INT, 0);
  skyTextureOverride = null;
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  inspectorCapture('gbuffers_lightning');
}
