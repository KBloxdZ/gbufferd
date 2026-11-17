function hashNoise(x, z, seed = 0) {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967295;
}

function valueNoise(x, z, scale, seed) {
  const sx = x / scale,
    sz = z / scale,
    x0 = Math.floor(sx),
    z0 = Math.floor(sz),
    fx = sx - x0,
    fz = sz - z0;
  const tx = fx * fx * (3 - 2 * fx),
    tz = fz * fz * (3 - 2 * fz),
    mix = (a, b, t) => a + (b - a) * t;
  const a = mix(hashNoise(x0, z0, seed), hashNoise(x0 + 1, z0, seed), tx);
  const b = mix(hashNoise(x0, z0 + 1, seed), hashNoise(x0 + 1, z0 + 1, seed), tx);
  return mix(a, b, tz) * 2 - 1;
}

const smoothRange = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function gradientNoise(x, z, scale, seed) {
  x /= scale;
  z /= scale;
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10),
    mix = (a, b, t) => a + (b - a) * t;
  const gradient = (dx, dz, ox, oz) => {
    const h = Math.floor(hashNoise(ix + ox, iz + oz, seed) * 8) & 7;
    return h < 4 ? (h & 1 ? -dx : dx) + (h & 2 ? -dz : dz) : h === 4 ? dx : h === 5 ? -dx : h === 6 ? dz : -dz;
  };
  return mix(
    mix(gradient(fx, fz, 0, 0), gradient(fx - 1, fz, 1, 0), fade(fx)),
    mix(gradient(fx, fz - 1, 0, 1), gradient(fx - 1, fz - 1, 1, 1), fade(fx)),
    fade(fz),
  );
}
function fractalNoise(x, z, scale, seed, octaves = 4) {
  let value = 0,
    amplitude = 1,
    total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += gradientNoise(x, z, scale, seed + octave * 7919) * amplitude;
    total += amplitude;
    scale *= 0.49;
    amplitude *= 0.5;
  }
  return value / total;
}
const RIVER_LEVEL = WORLD_Y_OFFSET + 4;
function riverColumn(x, z) {
  const bend = 70 + Math.sin(z / 83) * 23 + gradientNoise(z, 17, 125, 0x481a) * 32;
  const main = Math.abs(((((x - bend + 160) % 320) + 320) % 320) - 160);
  const branch = Math.abs(z - (145 + Math.sin(x / 97) * 26 + gradientNoise(x, 39, 160, 0x394a) * 24));
  const width = 11 + 5 * (0.5 + 0.5 * gradientNoise(x, z, 100, 0x171a));
  return { distance: Math.min(main, branch), width };
}
function terrainHeight(x, z) {
  const wx = x + gradientNoise(x + 913, z - 247, 190, 0x154a) * 45;
  const wz = z + gradientNoise(x - 531, z + 821, 190, 0x648e) * 45;
  const continents = fractalNoise(wx, wz, 330, 0x51f15e, 3);
  const mountainRegion = smoothRange(0.4, 0.71, 0.5 + 0.5 * gradientNoise(wx + 177, wz - 263, 240, 0x912fe));
  const ridge = 1 - Math.abs(fractalNoise(wx - 311, wz + 167, 98, 0x1977a5, 4) * 1.65);
  const erosion = 0.68 + 0.32 * (0.5 + 0.5 * fractalNoise(wx, wz, 55, 0x64e8, 3));
  const mountains = mountainRegion * (30 + 92 * Math.pow(Math.max(0, ridge), 2.5)) * erosion;
  const foothills = fractalNoise(wx, wz, 72, 0x5148, 4) * 13;
  const natural =
    WORLD_Y_OFFSET + 9 + continents * 25 + foothills + mountains + gradientNoise(x, z, 12, 0x6d2b79) * 1.8;
  const river = riverColumn(x, z),
    bed = RIVER_LEVEL - 6 + 7 * smoothRange(0, river.width + 2, river.distance);
  const bank = smoothRange(river.width + 2, river.width + 42, river.distance);
  return Math.floor(bed * (1 - bank) + natural * bank);
}
function terrainColumn(x, z, height = terrainHeight(x, z), slope = 0) {
  const forest = smoothRange(-0.25, 0.4, fractalNoise(x + 600, z - 120, 95, 0x294df, 3));
  const snowLine = 142 + gradientNoise(x, z, 42, 0x2857) * 12;
  const exposed = height > 112 && (slope >= 3 || height > 132 + gradientNoise(x, z, 28, 0x72f1) * 10);
  const river = riverColumn(x, z),
    water = height < RIVER_LEVEL && river.distance < river.width + 2;
  const shore = river.distance < river.width + 3;
  const surface = shore
    ? fractalNoise(x, z, 14, 0x28a, 2) > 0.06
      ? 'gravel'
      : 'sand'
    : height > snowLine && slope < 6
      ? 'snow'
      : exposed
        ? 'stone'
        : 'grass';
  return { height, slope, forest, surface, water, alpine: height > 106 };
}
function buildTreeBlocks(centerChunkX, centerChunkZ, radius = 1, columnAt) {
  const blocks = new Map(),
    key = (x, y, z) => `${x},${y},${z}`;
  const putLeaf = (x, y, z, type) => {
    const k = key(x, y, z);
    if (!blocks.has(k)) blocks.set(k, type);
  };
  for (let cz = centerChunkZ - radius; cz <= centerChunkZ + radius; cz++)
    for (let cx = centerChunkX - radius; cx <= centerChunkX + radius; cx++)
      for (let slot = 0; slot < 4; slot++) {
        const x = cx * CHUNK_SIZE + (slot % 2) * 8 + 2 + Math.floor(hashNoise(cx, cz, 0x7135 + slot) * 4);
        const z = cz * CHUNK_SIZE + Math.floor(slot / 2) * 8 + 2 + Math.floor(hashNoise(cz, cx, 0x291d + slot) * 4);
        const col = columnAt(x, z);
        if (
          col.surface !== 'grass' ||
          col.height > 133 ||
          col.slope > 3 ||
          hashNoise(x, z, 0x4f1bb) > 0.08 + col.forest * 0.6
        )
          continue;
        if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < 4) continue;
        const species = col.alpine ? 'spruce' : hashNoise(x, z, 0x73ed) < 0.23 ? 'birch' : 'oak';
        const trunkHeight =
          (species === 'spruce' ? 8 : species === 'birch' ? 6 : 4) + Math.floor(hashNoise(x, z, 0x93e5) * 3);
        const base = col.height + 1,
          crown = base + trunkHeight,
          leaf = species + '_leaves';
        if (species === 'spruce') {
          for (let y = base + 3; y <= crown + 1; y++) {
            const fromTop = crown + 1 - y,
              r = fromTop === 0 ? 0 : Math.min(3, Math.floor(fromTop * 0.42) + (fromTop % 2));
            for (let dz = -r; dz <= r; dz++)
              for (let dx = -r; dx <= r; dx++)
                if (Math.abs(dx) + Math.abs(dz) <= r + Math.max(0, r - 1)) putLeaf(x + dx, y, z + dz, leaf);
          }
        } else {
          for (let dy = -2; dy <= 1; dy++) {
            const r = dy >= 0 ? 1 : 2;
            for (let dz = -r; dz <= r; dz++)
              for (let dx = -r; dx <= r; dx++) {
                if (
                  Math.abs(dx) === r &&
                  Math.abs(dz) === r &&
                  (dy === 1 || hashNoise(x + dx, z + dz, dy + 531) > 0.45)
                )
                  continue;
                putLeaf(x + dx, crown + dy, z + dz, leaf);
              }
          }
        }
        for (let y = 0; y < trunkHeight; y++) blocks.set(key(x, base + y, z), species + '_log');
      }
  for (const position of blocks.keys()) if (removedBlocks.has(position)) blocks.delete(position);
  return blocks;
}
const worldHeightCache = new Map(),
  worldColumnCache = new Map();
function createChunkMesh(chunkX, chunkZ) {
  const steps = createChunkMeshSteps(chunkX, chunkZ);
  let step;
  do {
    step = steps.next();
  } while (!step.done);
  return step.value;
}
function* createChunkMeshSteps(chunkX, chunkZ) {
  if (GB.state.active) return yield* GB.hooks.meshSteps(chunkX, chunkZ);
  if (!(window.wgpuDimension === 'overworld')) return yield* createNetherChunkMeshSteps(chunkX, chunkZ);
  const vertices = [],
    indices = [],
    cutoutIndices = [],
    plantIndices = [],
    stride = 35,
    key = (x, y, z) => `${x},${y},${z}`,
    emittedFaces = new Set(),
    plants = new Set();
  const minX = chunkX * CHUNK_SIZE,
    maxX = minX + CHUNK_SIZE - 1,
    minZ = chunkZ * CHUNK_SIZE,
    maxZ = minZ + CHUNK_SIZE - 1;
  if (worldHeightCache.size > 200000) {
    worldHeightCache.clear();
    worldColumnCache.clear();
  }
  const heights = worldHeightCache,
    columns = worldColumnCache,
    lighting = new Map();
  const heightAt = (x, z) => {
    const k = x + ',' + z;
    if (!heights.has(k)) heights.set(k, terrainHeight(x, z));
    return heights.get(k);
  };
  const columnAt = (x, z) => {
    const k = x + ',' + z;
    if (!columns.has(k)) {
      const height = heightAt(x, z),
        slope = Math.max(
          ...[
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([dx, dz]) => Math.abs(height - heightAt(x + dx, z + dz))),
        );
      columns.set(k, terrainColumn(x, z, height, slope));
    }
    return columns.get(k);
  };
  const treeBlocks = buildTreeBlocks(chunkX, chunkZ, 1, columnAt);
  yield;
  const atlas = (name, u, v) => {
    const [column, row] = ATLAS_SLOTS[name];
    return [
      (column * ATLAS_CELL + ATLAS_PADDING + u * 16) / ATLAS_WIDTH,
      (row * ATLAS_CELL + ATLAS_PADDING + (1 - v) * 16) / ATLAS_HEIGHT,
    ];
  };
  const atlasMid = name => atlas(name, 0.5, 0.5);
  const grassTint = [145 / 255, 189 / 255, 89 / 255, 1],
    oakTint = [119 / 255, 171 / 255, 47 / 255, 1],
    birchTint = [128 / 255, 167 / 255, 85 / 255, 1],
    spruceTint = [97 / 255, 153 / 255, 97 / 255, 1],
    white = [1, 1, 1, 1];
  const faceInfo = (type, face) => {
    if (type === 'obsidian') return ['obsidian', netherMaterial('obsidian'), white];
    if (type === 'grass')
      return face === 'top'
        ? ['grass_top', packBlockId('grass', 10132), grassTint]
        : face === 'bottom'
          ? ['dirt', packBlockId('dirt', 10128), white]
          : ['grass_side', packBlockId('grass', 10132), white];
    if (type === 'dirt') return ['dirt', packBlockId('dirt', 10128), white];
    if (type === 'stone') return ['stone', packBlockId('stone', 10080), white];
    if (type === 'sand') return [type, packBlockId('sand', 10232), white];
    if (type === 'gravel') return [type, packBlockId('gravel', 10724), white];
    if (type === 'snow') return ['snow', packBlockId('snow', 10380), white];
    if (type === 'white_concrete') return ['white_concrete', packBlockId('white_concrete', 10460), white];
    if (type === 'glowstone') return ['glowstone', packBlockId('glowstone', 10412), white];
    if (type === 'sea_lantern') return ['sea_lantern', packBlockId('sea_lantern', 10448), white];
    if (type === 'gold_block') return ['gold_block', packBlockId('gold_block', 10312), white];
    if (type.endsWith('_log'))
      return [
        face === 'top' || face === 'bottom' ? type + '_top' : type,
        packBlockId(type, type === 'spruce_log' ? 10168 : type === 'birch_log' ? 10176 : 10160),
        white,
      ];
    return [
      type,
      packBlockId(type, 10009),
      type === 'spruce_leaves' ? spruceTint : type === 'birch_leaves' ? birchTint : oakTint,
    ];
  };
  const terrainType = (x, y, z) => {
    const col = columnAt(x, z);
    return y > col.height
      ? null
      : y === col.height
        ? col.surface
        : y >= col.height - 3 && col.surface === 'grass'
          ? 'dirt'
          : 'stone';
  };
  const blockTypes = new Map();
  const blockTypeAt = (x, y, z) => {
    const k = key(x, y, z);
    let type = blockTypes.get(k);
    if (type === undefined) {
      type = placedBlocks.get(k) || (removedBlocks.has(k) ? null : treeBlocks.get(k) || terrainType(x, y, z));
      blockTypes.set(k, type);
    }
    return type;
  };
  const isLeaf = type => type && type.endsWith('_leaves');
  const isAoOccluder = (x, y, z) => {
    const type = blockTypeAt(x, y, z);
    return type !== null && !isLeaf(type);
  };
  const vertexAo = (x, y, z, n, p) => {
    const ox = x + n[0],
      oy = y + n[1],
      oz = z + n[2];
    let first = -1,
      second = -1;
    for (let axis = 0; axis < 3; axis++)
      if (n[axis] === 0) {
        if (first < 0) first = axis;
        else second = axis;
      }
    const step = (axis, base) => (p[axis] < base + 0.5 ? -1 : 1);
    const a0 = [0, 0, 0],
      b0 = [0, 0, 0];
    a0[first] = step(first, [x, y, z][first]);
    b0[second] = step(second, [x, y, z][second]);
    const occupied = (dx, dy, dz) => isAoOccluder(ox + dx, oy + dy, oz + dz);
    const offsets = [a0, b0];
    const sideA = occupied(a0[0], a0[1], a0[2]),
      sideB = occupied(b0[0], b0[1], b0[2]);
    if (sideA && sideB) return 0.4;
    const corner = occupied(a0[0] + b0[0], a0[1] + b0[1], a0[2] + b0[2]);
    return [1, 0.8, 0.6, 0.4][Number(sideA) + Number(sideB) + Number(corner)];
  };
  const skylight = (x, y, z) => {
    const k = key(x, y, z);
    if (lighting.has(k)) return lighting.get(k);
    let level = 15;
    for (let dy = 0; dy <= 12; dy++) {
      const type = treeBlocks.get(key(x, y + dy, z));
      if (type) level -= isLeaf(type) ? 1 : 2;
    }
    level = Math.max(9, level);
    if (columnAt(x, z).water && y <= RIVER_LEVEL) level = Math.max(0, Math.min(level, 15 - (RIVER_LEVEL - y)));
    const value = level * 16 + 8;
    lighting.set(k, value);
    return value;
  };
  const smoothBlockLight = (p, n, material, center) => {
    if (isEmissiveMaterial(material)) return 248;
    if (!engineBlockLight) return 8;
    const axis = n.findIndex(value => Math.abs(value) > 0.99);
    if (axis < 0) {
      const base = p.map(value => Math.floor(value - 0.5)),
        f = p.map((value, i) => value - 0.5 - base[i]);
      let value = 0;
      for (let x = 0; x < 2; x++)
        for (let y = 0; y < 2; y++)
          for (let z = 0; z < 2; z++)
            value +=
              (blockLightLevels.get(key(base[0] + x, base[1] + y, base[2] + z)) || 0) *
              (x ? f[0] : 1 - f[0]) *
              (y ? f[1] : 1 - f[1]) *
              (z ? f[2] : 1 - f[2]);
      return 8 + 16 * value;
    }
    const tangent = [0, 1, 2].filter(i => i !== axis),
      cell = p.map(Math.floor);
    cell[axis] = Math.floor(p[axis] + n[axis] * 0.01);
    const levels = [];
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        const sample = [...cell];
        sample[tangent[0]] -= a;
        sample[tangent[1]] -= b;
        levels.push(blockLightLevels.get(key(...sample)) || 0);
      }
    const fill = Math.max(...levels);
    return 8 + 4 * levels.reduce((sum, level) => sum + (level || fill), 0);
  };
  const smoothSkyLight = (p, n, fallback, center) => {
    if (!skyRegion.size) return fallback;
    const axis = n.findIndex(value => Math.abs(value) > 0.99);
    if (axis < 0) {
      const level = skyLightAt(...p.map(Math.floor));
      return level === null ? fallback : Math.min(fallback, 8 + 16 * level);
    }
    const cell = p.map(Math.floor);
    cell[axis] = Math.floor(p[axis] + n[axis] * 0.01);
    const tangent = [0, 1, 2].filter(i => i !== axis);
    const levels = [];
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        const sample = [...cell];
        sample[tangent[0]] -= a;
        sample[tangent[1]] -= b;
        if (Math.abs(p[tangent[0]] - Math.round(p[tangent[0]])) > 0.001) sample[tangent[0]] = cell[tangent[0]];
        if (Math.abs(p[tangent[1]] - Math.round(p[tangent[1]])) > 0.001) sample[tangent[1]] = cell[tangent[1]];
        levels.push(skyLightAt(...sample) ?? 0);
      }
    const fill = Math.max(...levels);
    const level = levels.reduce((sum, value) => sum + (value || fill), 0) / levels.length;
    return Math.min(fallback, 8 + 16 * level);
  };
  let vertexRenderType = -1;
  const pushVertex = (p, n, uv, mid, material, color, tangent, center, light) =>
    vertices.push(
      p[0],
      p[1],
      p[2],
      1,
      n[0],
      n[1],
      n[2],
      uv[0],
      uv[1],
      0,
      1,
      smoothBlockLight(p, n, material, center),
      smoothSkyLight(p, n, light, center),
      0,
      1,
      color[0],
      color[1],
      color[2],
      color[3],
      material,
      vertexRenderType,
      0,
      1,
      mid[0],
      mid[1],
      0,
      1,
      tangent[0],
      tangent[1],
      tangent[2],
      tangent[3],
      (center[0] - p[0]) * 64,
      (center[1] - p[1]) * 64,
      (center[2] - p[2]) * 64,
      isEmissiveMaterial(material) ? 15 : 0,
    );
  const quad = (a, b, c, d, n, texture, material, color, center, block, plant = false, uvs = null) => {
    const U = uvs || [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const faceIndices = plant ? plantIndices : texture.endsWith('_leaves') ? cutoutIndices : indices;
    vertexRenderType = texture === 'water_still' ? 1 : -1;
    const base = vertices.length / stride,
      mid = atlasMid(texture),
      tx = b[0] - a[0],
      ty = b[1] - a[1],
      tz = b[2] - a[2],
      length = Math.hypot(tx, ty, tz) || 1,
      tangent = [tx / length, ty / length, tz / length, 1];
    const axis = n.findIndex(value => Math.abs(value) > 0.99);
    const tangentAxes = axis < 0 ? null : [0, 1, 2].filter(i => i !== axis);
    const light =
      axis < 0
        ? () => skylight(...block)
        : p => {
            const cell = p.map(Math.floor);
            cell[axis] = Math.floor(p[axis] + n[axis] * 0.01);
            let sum = 0;
            for (let first = 0; first < 2; first++)
              for (let second = 0; second < 2; second++) {
                const sample = [...cell];
                sample[tangentAxes[0]] -= first;
                sample[tangentAxes[1]] -= second;
                sum += skylight(sample[0], sample[1], sample[2]);
              }
            return sum / 4;
          };
    const shaded = p => {
      const ao = plant || texture === 'water_still' ? 1 : color[3] * vertexAo(...block, n, p);
      return activePackProperties.separateAo === 'true'
        ? [color[0], color[1], color[2], ao]
        : [color[0] * ao, color[1] * ao, color[2] * ao, 1];
    };
    pushVertex(a, n, atlas(texture, U[0][0], U[0][1]), mid, material, shaded(a), tangent, center, light(a));
    pushVertex(b, n, atlas(texture, U[1][0], U[1][1]), mid, material, shaded(b), tangent, center, light(b));
    pushVertex(c, n, atlas(texture, U[2][0], U[2][1]), mid, material, shaded(c), tangent, center, light(c));
    pushVertex(d, n, atlas(texture, U[3][0], U[3][1]), mid, material, shaded(d), tangent, center, light(d));
    faceIndices.push(base, base + 1, base + 2, base + 2, base + 3, base);
    if (plant) {
      const back = vertices.length / stride,
        backNormal = n.map(value => -value),
        backTangent = [...tangent.slice(0, 3), -1];
      for (const [p, u, v] of [
        [c, 1, 1],
        [b, 1, 0],
        [a, 0, 0],
        [d, 0, 1],
      ])
        pushVertex(p, backNormal, atlas(texture, u, v), mid, material, shaded(p), backTangent, center, light(p));
      faceIndices.push(back, back + 1, back + 2, back + 2, back + 3, back);
    }
  };
  const emitFace = (x, y, z, type, face, n) => {
    const blockKey = key(x, y, z),
      faceKey = blockKey + ':' + face,
      placed = placedBlocks.get(blockKey);
    type = placed || type;
    if (!type || (removedBlocks.has(blockKey) && !placed) || emittedFaces.has(faceKey)) return;
    emittedFaces.add(faceKey);
    const x1 = x + 1,
      y1 = y + 1,
      z1 = z + 1,
      [texture, material, color] = faceInfo(type, face),
      center = [x + 0.5, y + 0.5, z + 0.5],
      block = [x, y, z];
    if (face === 'top')
      quad([x, y1, z], [x, y1, z1], [x1, y1, z1], [x1, y1, z], n, texture, material, color, center, block);
    else if (face === 'bottom')
      quad([x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1], n, texture, material, color, center, block);
    else if (face === 'north')
      quad([x1, y, z], [x, y, z], [x, y1, z], [x1, y1, z], n, texture, material, color, center, block);
    else if (face === 'south')
      quad([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], n, texture, material, color, center, block);
    else if (face === 'west')
      quad([x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z], n, texture, material, color, center, block);
    else quad([x1, y, z1], [x1, y, z], [x1, y1, z], [x1, y1, z1], n, texture, material, color, center, block);
  };
  const plant = (x, y, z, texture, material, tint) => {
    if (
      removedBlocks.has(key(x, y, z)) ||
      removedBlocks.has(key(x, heightAt(x, z), z)) ||
      placedBlocks.has(key(x, y, z)) ||
      (texture === 'tall_grass_top' && placedBlocks.has(key(x, y - 1, z))) ||
      (texture === 'tall_grass_bottom' && placedBlocks.has(key(x, y + 1, z)))
    )
      return;
    plants.add(key(x, y, z));
    const ox = (hashNoise(x, z, 0x39a) - 0.5) * 0.35,
      oz = (hashNoise(x, z, 0x52a) - 0.5) * 0.35;
    const a = x + 0.08 + ox,
      b = x + 0.92 + ox,
      c = z + 0.08 + oz,
      d = z + 0.92 + oz,
      center = [x + 0.5, y + 0.5, z + 0.5],
      block = [x, y, z];
    quad(
      [a, y, c],
      [b, y, d],
      [b, y + 1, d],
      [a, y + 1, c],
      [-0.7071, 0, 0.7071],
      texture,
      material,
      tint,
      center,
      block,
      true,
    );
    quad(
      [b, y, c],
      [a, y, d],
      [a, y + 1, d],
      [b, y + 1, c],
      [-0.7071, 0, -0.7071],
      texture,
      material,
      tint,
      center,
      block,
      true,
    );
  };
  const sides = [
    ['north', 0, 0, -1],
    ['south', 0, 0, 1],
    ['west', -1, 0, 0],
    ['east', 1, 0, 0],
  ];
  let minY = Infinity,
    maxY = -Infinity,
    plantCount = 0;
  for (let z = minZ; z <= maxZ; z++) {
    yield;
    for (let x = minX; x <= maxX; x++) {
      const col = columnAt(x, z),
        height = col.height;
      minY = Math.min(minY, height);
      maxY = Math.max(maxY, height + 2);
      if (!treeBlocks.has(key(x, height + 1, z))) emitFace(x, height, z, col.surface, 'top', [0, 1, 0]);
      for (const [face, dx, dy, dz] of sides) {
        const neighborHeight = heightAt(x + dx, z + dz);
        minY = Math.min(minY, neighborHeight);
        for (let y = neighborHeight + 1; y <= height; y++)
          if (!treeBlocks.has(key(x + dx, y, z + dz))) emitFace(x, y, z, terrainType(x, y, z), face, [dx, dy, dz]);
      }
      if (col.surface !== 'grass' || treeBlocks.has(key(x, height + 1, z))) continue;
      const coverage = 0.3 + 0.28 * (0.5 + gradientNoise(x, z, 26, 0x4392)),
        chance = hashNoise(x, z, 0x958c);
      if (chance > coverage) continue;
      const kind = hashNoise(x, z, 0x115e),
        y = height + 1;
      if (kind < 0.055) {
        const flowers = ['poppy', 'dandelion', 'oxeye_daisy', 'cornflower'];
        const flower = flowers[Math.floor(hashNoise(x, z, 0x715a) * flowers.length)];
        plant(x, y, z, flower, packBlockId(flower, 10005), white);
      } else if (kind < 0.19 && !treeBlocks.has(key(x, y + 1, z))) {
        plant(x, y, z, 'tall_grass_bottom', packBlockId('tall_grass_bottom', 10005), grassTint);
        plant(x, y + 1, z, 'tall_grass_top', packBlockId('tall_grass_top', 10021), grassTint);
      } else {
        const small = col.forest > 0.5 && kind > 0.65 ? 'fern' : 'short_grass';
        plant(x, y, z, small, packBlockId(small, 10005), grassTint);
      }
      plantCount++;
    }
  }
  yield;
  const treeFaces = [['top', 0, 1, 0], ['bottom', 0, -1, 0], ...sides];
  for (const [position, type] of treeBlocks) {
    const [x, y, z] = position.split(',').map(Number);
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    maxY = Math.max(maxY, y + 1);
    for (const [face, dx, dy, dz] of treeFaces) {
      const neighbor = blockTypeAt(x + dx, y + dy, z + dz);
      if (!neighbor || isLeaf(neighbor)) emitFace(x, y, z, type, face, [dx, dy, dz]);
    }
  }
  for (const position of placedByChunk.get(chunkX + ',' + chunkZ) || []) {
    const type = placedBlocks.get(position);
    if (!type) continue;
    const [x, y, z] = position.split(',').map(Number);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + 1);
    for (const [face, dx, dy, dz] of treeFaces) {
      const neighbor = blockTypeAt(x + dx, y + dy, z + dz);
      if (!neighbor || isLeaf(neighbor)) emitFace(x, y, z, type, face, [dx, dy, dz]);
    }
  }
  yield;
  for (let cz = chunkZ - 1; cz <= chunkZ + 1; cz++)
    for (let cx = chunkX - 1; cx <= chunkX + 1; cx++)
      for (const position of removedByChunk.get(cx + ',' + cz) || []) {
        const [rx, ry, rz] = position.split(',').map(Number);
        for (const [face, dx, dy, dz] of treeFaces) {
          const x = rx - dx,
            y = ry - dy,
            z = rz - dz;
          if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
          const type = blockTypeAt(x, y, z);
          if (!type) continue;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y + 1);
          emitFace(x, y, z, type, face, [dx, dy, dz]);
        }
      }
  for (const [frameKey, facing] of window.wgpuEndFrames || []) {
    const [fx, fy, fz] = frameKey.split(',').map(Number);
    if (fx < minX || fx > maxX || fz < minZ || fz > maxZ) continue;
    minY = Math.min(minY, fy);
    maxY = Math.max(maxY, fy + 1);
    const material = netherMaterial('end_portal_frame'),
      center = [fx + 0.5, fy + 0.5, fz + 0.5],
      block = [fx, fy, fz];
    for (const f of endFrameFaces(fx, fy, fz, facing))
      quad(f.a, f.b, f.c, f.d, f.n, f.texture, material, white, center, block, false, f.uvs);
  }
  {
    const remap = new Int32Array(vertices.length / stride).fill(-1),
      order = [];
    for (const list of [indices, cutoutIndices, plantIndices])
      for (const v of list)
        if (remap[v] < 0) {
          remap[v] = order.length;
          order.push(v);
        }
    for (let v = 0; v < remap.length; v++)
      if (remap[v] < 0) {
        remap[v] = order.length;
        order.push(v);
      }
    const old = vertices.slice();
    for (let i = 0; i < order.length; i++) {
      const from = order[i] * stride,
        to = i * stride;
      for (let k = 0; k < stride; k++) vertices[to + k] = old[from + k];
    }
    for (const list of [indices, cutoutIndices, plantIndices])
      for (let i = 0; i < list.length; i++) list[i] = remap[list[i]];
  }
  const solidIndexCount = indices.length,
    cutoutIndexCount = cutoutIndices.length;
  for (const index of cutoutIndices) indices.push(index);
  const plantIndexOffset = indices.length,
    plantIndexCount = plantIndices.length;
  for (const index of plantIndices) indices.push(index);
  const opaqueIndexCount = indices.length;
  for (let z = minZ; z <= maxZ; z++) {
    yield;
    for (let x = minX; x <= maxX; x++) {
      if (!columnAt(x, z).water) continue;
      const y = RIVER_LEVEL + 0.875;
      maxY = Math.max(maxY, y);
      quad(
        [x, y, z],
        [x, y, z + 1],
        [x + 1, y, z + 1],
        [x + 1, y, z],
        [0, 1, 0],
        'water_still',
        packBlockId('water', 32000),
        [0.247, 0.463, 0.894, 1],
        [x + 0.5, y - 0.375, z + 0.5],
        [x, RIVER_LEVEL, z],
      );
      quad(
        [x, y, z],
        [x + 1, y, z],
        [x + 1, y, z + 1],
        [x, y, z + 1],
        [0, -1, 0],
        'water_still',
        packBlockId('water', 32000),
        [0.247, 0.463, 0.894, 1],
        [x + 0.5, y - 0.375, z + 0.5],
        [x, RIVER_LEVEL, z],
      );
    }
  }
  for (const portalKey of window.wgpuPortals?.overworld || []) {
    const [px, py, pz] = portalKey.split(',').map(Number);
    if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
    maxY = Math.max(maxY, py + 1);
    const material = netherMaterial('nether_portal'),
      a = px + 0.375,
      b = px + 0.625,
      center = [px + 0.5, py + 0.5, pz + 0.5],
      block = [px, py, pz];
    quad(
      [a, py, pz],
      [a, py, pz + 1],
      [a, py + 1, pz + 1],
      [a, py + 1, pz],
      [-1, 0, 0],
      'nether_portal',
      material,
      white,
      center,
      block,
    );
    quad(
      [b, py, pz + 1],
      [b, py, pz],
      [b, py + 1, pz],
      [b, py + 1, pz + 1],
      [1, 0, 0],
      'nether_portal',
      material,
      white,
      center,
      block,
    );
  }
  const waterIndexCount = indices.length - opaqueIndexCount;
  const wide = vertices.length / stride > 65535,
    vao = gl.createVertexArray(),
    vertexBuffer = gl.createBuffer(),
    indexBuffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  for (const [loc, size, offset] of [
    [0, 4, 0],
    [1, 3, 4],
    [2, 4, 7],
    [3, 4, 11],
    [4, 4, 15],
    [5, 4, 19],
    [6, 4, 23],
    [7, 4, 27],
    [9, 4, 31],
  ]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  }
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wide ? new Uint32Array(indices) : new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao,
    vertexBuffer,
    indexBuffer,
    indexCount: opaqueIndexCount,
    solidIndexCount,
    cutoutIndexCount,
    plantIndexOffset,
    plantIndexCount,
    waterIndexCount,
    waterIndexOffset: opaqueIndexCount * (wide ? 4 : 2),
    indexType: wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    chunkX,
    chunkZ,
    minY,
    maxY,
    plantCount,
    plants,
  };
}
