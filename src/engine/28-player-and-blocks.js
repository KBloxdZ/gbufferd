const removedBlocks = new Set(),
  removedByChunk = new Map(),
  collisionTrees = new Map(),
  placedBlocks = new Map(),
  placedByChunk = new Map();
let blockLightLevels = new Map();
let skyRegion = new Set(),
  skyLightLevels = new Map(),
  skyOpenFrom = new Map(),
  eyeLightFrame = -1,
  eyeLight = [0, 240];
const SKY_CELL = 16,
  skyCellKey = (x, y, z) => Math.floor(x / SKY_CELL) + ',' + Math.floor(y / SKY_CELL) + ',' + Math.floor(z / SKY_CELL);
function skyColumnOpen(x, z) {
  const k = x + ',' + z;
  if (skyOpenFrom.has(k)) return skyOpenFrom.get(k);
  let y = physicsColumn(x, z).height + 24;
  while (y > -64 && !solidBlockAt(x, y, z)) y--;
  skyOpenFrom.set(k, y + 1);
  return y + 1;
}
function skyWaterCap(x, y, z) {
  const column = physicsColumn(x, z);
  return column.water && y <= RIVER_LEVEL ? Math.max(0, 15 - (RIVER_LEVEL - y)) : 15;
}
function skyLightAt(x, y, z) {
  if (GB.state.active) return GB.hooks.occludes(GB.hooks.localVoxel(x, y, z)) ? null : GB.hooks.localSky(x, y, z);
  if (window.wgpuDimension === 'end') {
    if (solidBlockAt(x, y, z)) return null;
    for (let yy = y + 1; yy <= END_TOP; yy++) if (solidBlockAt(x, yy, z)) return 0;
    return 15;
  }
  if (!(window.wgpuDimension === 'overworld')) return solidBlockAt(x, y, z) ? null : 0;
  if (solidBlockAt(x, y, z)) return null;
  const cap = skyWaterCap(x, y, z);
  if (skyRegion.has(skyCellKey(x, y, z)))
    return Math.min(cap, y >= skyColumnOpen(x, z) ? 15 : skyLightLevels.get(voxelKey(x, y, z)) || 0);
  return Math.min(cap, y > physicsColumn(x, z).height ? 15 : 0);
}
function rebuildSkyLighting(editX, editZ) {
  const region = new Set(),
    changed = new Set();
  for (const key of [...removedBlocks, ...placedBlocks.keys()]) {
    const [x, y, z] = key.split(',').map(Number),
      cx = Math.floor(x / SKY_CELL),
      cy = Math.floor(y / SKY_CELL),
      cz = Math.floor(z / SKY_CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) region.add(cx + dx + ',' + (cy + dy) + ',' + (cz + dz));
  }
  const oldLevels = skyLightLevels,
    oldRegion = skyRegion,
    oldOpen = new Map();
  if (editX === undefined) skyOpenFrom.clear();
  else
    for (const [dx, dz] of [[0, 0]]) {
      const column = editX + dx + ',' + (editZ + dz);
      if (skyOpenFrom.has(column)) {
        oldOpen.set(column, skyOpenFrom.get(column));
        skyOpenFrom.delete(column);
      }
    }
  const next = new Map(),
    queue = [],
    inRegion = (x, y, z) => region.has(skyCellKey(x, y, z));
  for (const cell of region) {
    const [cx, cy, cz] = cell.split(',').map(Number);
    for (let x = cx * SKY_CELL; x < cx * SKY_CELL + SKY_CELL; x++)
      for (let z = cz * SKY_CELL; z < cz * SKY_CELL + SKY_CELL; z++) {
        const open = skyColumnOpen(x, z),
          top = Math.min(
            cy * SKY_CELL + SKY_CELL - 1,
            Math.max(
              open,
              skyColumnOpen(x + 1, z),
              skyColumnOpen(x - 1, z),
              skyColumnOpen(x, z + 1),
              skyColumnOpen(x, z - 1),
            ) - 1,
          );
        for (let y = Math.max(open, cy * SKY_CELL); y <= top; y++) queue.push(x, y, z, 15);
        if (open >= cy * SKY_CELL && open < cy * SKY_CELL + SKY_CELL) queue.push(x, open, z, 15);
      }
  }
  const directions = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    solid = new Map();
  for (let head = 0; head < queue.length; head += 4) {
    const x = queue[head],
      y = queue[head + 1],
      z = queue[head + 2],
      level = queue[head + 3];
    if (level <= 1) continue;
    for (const [dx, dy, dz] of directions) {
      const nx = x + dx,
        ny = y + dy,
        nz = z + dz;
      if (!inRegion(nx, ny, nz) || ny >= skyColumnOpen(nx, nz)) continue;
      const key = voxelKey(nx, ny, nz),
        value = level - 1;
      if ((next.get(key) || 0) >= value) continue;
      if (!solid.has(key)) solid.set(key, solidBlockAt(nx, ny, nz));
      if (solid.get(key)) continue;
      next.set(key, value);
      queue.push(nx, ny, nz, value);
    }
  }
  const mark = (x, z) => {
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      changed.add(Math.floor((x + dx) / CHUNK_SIZE) + ',' + Math.floor((z + dz) / CHUNK_SIZE));
  };
  for (const key of new Set([...oldLevels.keys(), ...next.keys()]))
    if ((oldLevels.get(key) || 0) !== (next.get(key) || 0)) {
      const [x, , z] = key.split(',').map(Number);
      mark(x, z);
    }
  for (const [column, open] of oldOpen)
    if (skyOpenFrom.get(column) !== open) {
      const [x, z] = column.split(',').map(Number);
      mark(x, z);
    }
  for (const cell of [...region].filter(c => !oldRegion.has(c)).concat([...oldRegion].filter(c => !region.has(c)))) {
    const [cx, , cz] = cell.split(',').map(Number);
    for (let x = cx * SKY_CELL; x < cx * SKY_CELL + SKY_CELL; x++)
      for (let z = cz * SKY_CELL; z < cz * SKY_CELL + SKY_CELL; z++) {
        const open = skyOpenFrom.get(x + ',' + z);
        if (open !== undefined && open <= physicsColumn(x, z).height) mark(x, z);
      }
  }
  skyRegion = region;
  skyLightLevels = next;
  eyeLightFrame = -1;
  return changed;
}
function currentEyeLight() {
  if (GB.state.active) {
    const o = GB.state.renderOrigin,
      p = cameraPosition.map((v, i) => Math.floor(v + o[i]));
    return [16 * (GB.hooks.fieldAt(...p, 'block') || 0), 16 * GB.hooks.sky(...p)];
  }
  if (eyeLightFrame === renderedFrameCounter) return eyeLight;
  eyeLightFrame = renderedFrameCounter;
  const x = Math.floor(cameraPosition[0]),
    y = Math.floor(cameraPosition[1]),
    z = Math.floor(cameraPosition[2]);
  const sky = skyLightAt(x, y, z) ?? 15,
    block = blockLightLevels.get(voxelKey(x, y, z)) || 0;
  eyeLight = [block * 16, sky * 16];
  return eyeLight;
}
let flying = false,
  grounded = false,
  verticalVelocity = 0,
  jumpRequested = false,
  lastSpacePress = -Infinity,
  miningHeld = false,
  nextMineTime = 0;
const voxelKey = (x, y, z) => `${x},${y},${z}`;
const DEBUG_VIEWS = [
  ['aus (normal)', 0, 0],
  ['Lichtvolumen (Floodfill RGB)', 0, 40000],
  ['Voxelkarte: rot=solide, gruen=Lichtquelle, blau=transluzent', 0, 40001],
  ['Floodfill-Alpha', 0, 40002],
  ['nur Vanilla-Blocklicht (ACT aus)', 40000, 0],
  ['Engine-Blocklicht roh (lmCoord.x, mit F3 ungefiltert)', 0, 40003],
  ['Engine-Himmelslicht roh (lmCoord.y, mit F3 ungefiltert)', 0, 40004],
  ['Vertex-AO roh (Vertexfarbe Alpha, mit F3 ungefiltert)', 0, 40005],
];
let debugView = 0;
document.addEventListener('keydown', event => {
  if (event.code !== 'F7' && event.code !== 'KeyV') return;
  event.preventDefault();
  debugView = (debugView + 1) % DEBUG_VIEWS.length;
  temporalHistoryValid = false;
  setStatus('Debug-Ansicht: ' + DEBUG_VIEWS[debugView][0] + ' · V/F7', 'good');
});
function physicsColumn(x, z) {
  const key = x + ',' + z;
  if (!worldColumnCache.has(key)) {
    const height = terrainHeight(x, z),
      slope = Math.max(
        ...[
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([dx, dz]) => Math.abs(height - terrainHeight(x + dx, z + dz))),
      );
    worldColumnCache.set(key, terrainColumn(x, z, height, slope));
  }
  return worldColumnCache.get(key);
}
function solidBlockAt(x, y, z) {
  if (GB.state.active) return GB.hooks.collides(GB.hooks.localVoxel(x, y, z));
  if (!(window.wgpuDimension === 'overworld')) {
    const type = netherBlockAt(x, y, z);
    return !!type && type !== 'lava' && type !== 'nether_portal' && type !== 'end_portal';
  }
  if (window.wgpuEndFrames?.has(x + ',' + y + ',' + z)) return true;
  if (placedBlocks.has(voxelKey(x, y, z))) return true;
  if (removedBlocks.has(voxelKey(x, y, z))) return false;
  if (y <= physicsColumn(x, z).height) return true;
  const cx = Math.floor(x / CHUNK_SIZE),
    cz = Math.floor(z / CHUNK_SIZE),
    key = cx + ',' + cz;
  if (!collisionTrees.has(key)) {
    if (collisionTrees.size > 32) collisionTrees.clear();
    collisionTrees.set(key, buildTreeBlocks(cx, cz, 1, physicsColumn));
  }
  return collisionTrees.get(key).has(voxelKey(x, y, z));
}
function playerCollides(position) {
  const feet = position[1] - PLAYER_EYE_HEIGHT,
    epsilon = 0.00001;
  for (let y = Math.floor(feet + epsilon); y <= Math.floor(feet + 1.8 - epsilon); y++)
    for (let x = Math.floor(position[0] - 0.3 + epsilon); x <= Math.floor(position[0] + 0.3 - epsilon); x++)
      for (let z = Math.floor(position[2] - 0.3 + epsilon); z <= Math.floor(position[2] + 0.3 - epsilon); z++)
        if (solidBlockAt(x, y, z)) return true;
  return false;
}
function movePlayerAxis(axis, distance) {
  if (!distance) return false;
  const start = cameraPosition[axis];
  cameraPosition[axis] += distance;
  if (!playerCollides(cameraPosition)) return false;
  let low = 0,
    high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    cameraPosition[axis] = start + distance * mid;
    if (playerCollides(cameraPosition)) high = mid;
    else low = mid;
  }
  cameraPosition[axis] = start + distance * low;
  return true;
}
function moveCamera(now) {
  if (GB.state.active && GB.state.follow) {
    frameDelta = Math.max(0, (now - previousFrame) / 1000);
    previousFrame = now;
    GB.hooks.applyCamera();
    return;
  }
  frameDelta = Math.max(0, (now - previousFrame) / 1000);
  const dt = Math.min(Math.max(frameDelta, 1 / 240), 0.05);
  previousFrame = now;
  if (canvas.ownerDocument.pointerLockElement !== canvas || !document.getElementById('shaderSettings').hidden) return;
  const sprint = pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight'),
    sneak = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
  let x = 0,
    z = 0;
  if (pressedKeys.has('KeyW')) {
    x += Math.sin(yaw);
    z -= Math.cos(yaw);
  }
  if (pressedKeys.has('KeyS')) {
    x -= Math.sin(yaw);
    z += Math.cos(yaw);
  }
  if (pressedKeys.has('KeyD')) {
    x += Math.cos(yaw);
    z += Math.sin(yaw);
  }
  if (pressedKeys.has('KeyA')) {
    x -= Math.cos(yaw);
    z -= Math.sin(yaw);
  }
  const length = Math.hypot(x, z) || 1,
    speed = flying ? (sprint ? 18 : 10.8) : sneak ? 1.3 : sprint ? 5.6 : 4.3;
  x = (x / length) * speed;
  z = (z / length) * speed;
  const water =
    physicsColumn(Math.floor(cameraPosition[0]), Math.floor(cameraPosition[2])).water &&
    cameraPosition[1] - PLAYER_EYE_HEIGHT < RIVER_LEVEL + 0.875;
  if (flying) verticalVelocity = (Number(pressedKeys.has('Space')) - Number(sneak)) * speed;
  else if (jumpRequested && grounded) verticalVelocity = 8.4;
  jumpRequested = false;
  const steps = Math.max(1, Math.ceil(dt / 0.008)),
    step = dt / steps;
  for (let i = 0; i < steps; i++) {
    if (!flying) {
      verticalVelocity = Math.max(water ? -3 : -50, verticalVelocity - (water ? 8 : 25) * step);
      if (water && pressedKeys.has('Space')) verticalVelocity = 3.5;
    }
    movePlayerAxis(0, x * step);
    movePlayerAxis(2, z * step);
    const downward = verticalVelocity < 0,
      hit = movePlayerAxis(1, verticalVelocity * step);
    grounded = hit && downward;
    if (hit) verticalVelocity = 0;
  }
  if (miningHeld && now >= nextMineTime) {
    mineBlock();
    nextMineTime = now + 180;
  }
}
function mineBlock() {
  if (GB.state.active) return;
  const cp = Math.cos(pitch),
    direction = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp],
    cell = cameraPosition.map(Math.floor),
    sign = direction.map(Math.sign);
  const delta = direction.map(value => (value ? Math.abs(1 / value) : Infinity)),
    next = direction.map((value, axis) =>
      value ? (cell[axis] + (value > 0 ? 1 : 0) - cameraPosition[axis]) / value : Infinity,
    );
  let distance = 0;
  while (distance <= 5) {
    const [x, y, z] = cell,
      key = voxelKey(x, y, z),
      chunkKey = Math.floor(x / CHUNK_SIZE) + ',' + Math.floor(z / CHUNK_SIZE),
      mesh = worldChunks.get(chunkKey);
    if (mineSpecialBlock(x, y, z)) return;
    if (placedBlocks.has(key)) {
      placedBlocks.delete(key);
      placedByChunk.get(chunkKey)?.delete(key);
      rebuildChunksAround(x, z);
      return;
    }
    if (!removedBlocks.has(key) && (mesh?.plants.has(key) || solidBlockAt(x, y, z))) {
      const removals = [key];
      if (mesh?.plants.has(key))
        for (const offset of [-1, 1]) {
          const other = voxelKey(x, y + offset, z);
          if (mesh.plants.has(other)) removals.push(other);
        }
      if (!removedByChunk.has(chunkKey)) removedByChunk.set(chunkKey, new Set());
      for (const removed of removals) {
        removedBlocks.add(removed);
        removedByChunk.get(chunkKey).add(removed);
      }
      rebuildChunksAround(x, z);
      return;
    }
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    distance = next[axis];
    cell[axis] += sign[axis];
    next[axis] += delta[axis];
  }
}
function rebuildBlockLighting() {
  const next = new Map(),
    queue = [],
    occupied = new Map(),
    changed = new Set();
  const directions = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const [key, type] of placedBlocks) {
    if (type !== 'glowstone' && type !== 'sea_lantern') continue;
    next.set(key, 15);
    queue.push([...key.split(',').map(Number), 15]);
  }
  if (window.wgpuDimension === 'overworld')
    for (const key of window.wgpuPortals?.overworldEnd || []) {
      next.set(key, 15);
      queue.push([...key.split(',').map(Number), 15]);
    }
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z, level] = queue[head];
    if (level <= 1) continue;
    for (const [dx, dy, dz] of directions) {
      const nx = x + dx,
        ny = y + dy,
        nz = z + dz,
        key = voxelKey(nx, ny, nz),
        value = level - 1;
      if ((next.get(key) || 0) >= value) continue;
      if (!occupied.has(key)) occupied.set(key, solidBlockAt(nx, ny, nz));
      if (occupied.get(key)) continue;
      next.set(key, value);
      queue.push([nx, ny, nz, value]);
    }
  }
  const mark = key => {
    const [x, , z] = key.split(',').map(Number);
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      changed.add(Math.floor((x + dx) / CHUNK_SIZE) + ',' + Math.floor((z + dz) / CHUNK_SIZE));
  };
  for (const [key, value] of next) if (blockLightLevels.get(key) !== value) mark(key);
  for (const key of blockLightLevels.keys()) if (!next.has(key)) mark(key);
  blockLightLevels = next;
  return changed;
}
const pendingChunkRebuilds = new Set();
let engineBlockLight = true;
document.addEventListener('keydown', event => {
  if (event.code !== 'F6') return;
  event.preventDefault();
  engineBlockLight = !engineBlockLight;
  for (const key of worldChunks.keys()) pendingChunkRebuilds.add(key);
  temporalHistoryValid = false;
  setStatus('Vanilla-Blocklicht (Lightmap) ' + (engineBlockLight ? 'an' : 'aus') + ' · F6', 'good');
});
function dropMeshJob(key) {
  if (meshJob && meshJob.key === key) meshJob = null;
}
function rebuildChunkNow(key) {
  dropMeshJob(key);
  const old = worldChunks.get(key);
  if (!old) return;
  const meshStart = performance.now();
  const replacement = createChunkMesh(old.chunkX, old.chunkZ);
  chunkMeshMs += performance.now() - meshStart;
  chunkMeshCount++;
  worldChunks.set(key, replacement);
  destroyChunkMesh(old);
}
function processChunkRebuilds(budgetMs = 4) {
  if (GB.state.active) {
    GB.hooks.queueRebuilds();
    return;
  }
  if (!pendingChunkRebuilds.size) return;
  const deadline = performance.now() + budgetMs;
  let done = false;
  for (const key of pendingChunkRebuilds) {
    pendingChunkRebuilds.delete(key);
    rebuildChunkNow(key);
    done = true;
    if (performance.now() > deadline) break;
  }
  if (done) refreshVisibleChunkMeshes();
}
function rebuildChunksAround(x, z) {
  collisionTrees.clear();
  const touched = rebuildBlockLighting();
  for (const key of rebuildSkyLighting(x, z)) touched.add(key);
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    touched.add(Math.floor((x + dx) / CHUNK_SIZE) + ',' + Math.floor((z + dz) / CHUNK_SIZE));
  const immediate = new Set();
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    immediate.add(Math.floor((x + dx) / CHUNK_SIZE) + ',' + Math.floor((z + dz) / CHUNK_SIZE));
  for (const key of touched) {
    if (immediate.has(key)) {
      pendingChunkRebuilds.delete(key);
      rebuildChunkNow(key);
    } else pendingChunkRebuilds.add(key);
  }
  refreshVisibleChunkMeshes();
  temporalHistoryValid = false;
}
function placeBlock() {
  if (pressEndButton()) return;
  const type = HOTBAR_ITEMS[hotbarSlot]?.type;
  if (!type) return;
  if (type === 'spawn_item') {
    useSpawnItem();
    return;
  }
  const cp = Math.cos(pitch),
    direction = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp],
    cell = cameraPosition.map(Math.floor),
    sign = direction.map(Math.sign);
  const delta = direction.map(value => (value ? Math.abs(1 / value) : Infinity)),
    next = direction.map((value, axis) =>
      value ? (cell[axis] + (value > 0 ? 1 : 0) - cameraPosition[axis]) / value : Infinity,
    );
  let distance = 0,
    previous = null;
  while (distance <= 5) {
    const [x, y, z] = cell,
      key = voxelKey(x, y, z),
      mesh = worldChunks.get(Math.floor(x / CHUNK_SIZE) + ',' + Math.floor(z / CHUNK_SIZE));
    const plantHere = !removedBlocks.has(key) && !placedBlocks.has(key) && mesh?.plants.has(key);
    if (plantHere || solidBlockAt(x, y, z)) {
      const target = plantHere ? [x, y, z] : previous;
      if (!target) return;
      const targetKey = voxelKey(...target);
      if (placedBlocks.has(targetKey) || (!removedBlocks.has(targetKey) && solidBlockAt(...target))) return;
      placedBlocks.set(targetKey, type);
      if (playerCollides(cameraPosition)) {
        placedBlocks.delete(targetKey);
        return;
      }
      const chunkKey = Math.floor(target[0] / CHUNK_SIZE) + ',' + Math.floor(target[2] / CHUNK_SIZE);
      if (!placedByChunk.has(chunkKey)) placedByChunk.set(chunkKey, new Set());
      placedByChunk.get(chunkKey).add(targetKey);
      rebuildChunksAround(target[0], target[2]);
      return;
    }
    previous = [x, y, z];
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    distance = next[axis];
    cell[axis] += sign[axis];
    next[axis] += delta[axis];
  }
}
