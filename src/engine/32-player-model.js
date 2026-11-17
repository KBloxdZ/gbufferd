let playerMesh = null;
const PLAYER_PARTS = [
  [0, 0, 24, 32, 8, 8, 24, 1],
  [0, 0, 12, 24, 8, 4, 24, 0],
  [-6, 0, 12, 24, 4, 4, 23, 2],
  [6, 0, 12, 24, 4, 4, 23, 3],
  [-2, 0, 0, 12, 4, 4, 12, 4],
  [2, 0, 0, 12, 4, 4, 12, 5],
];
let limbSwing = 0,
  limbAmount = 0,
  lastPlayerX = null,
  lastPlayerZ = null;
function destroyPlayerMesh() {
  if (playerMesh) {
    gl.deleteVertexArray(playerMesh.vao);
    gl.deleteBuffer(playerMesh.vertexBuffer);
    gl.deleteBuffer(playerMesh.indexBuffer);
    playerMesh = null;
  }
}
function playerLimbAngles() {
  const ticks = Math.max(frameDelta, 1 / 240) * 20;
  const moved = lastPlayerX === null ? 0 : Math.hypot(cameraPosition[0] - lastPlayerX, cameraPosition[2] - lastPlayerZ);
  lastPlayerX = cameraPosition[0];
  lastPlayerZ = cameraPosition[2];
  const target = Math.min(1, (moved / ticks) * 4);
  limbAmount += (target - limbAmount) * Math.min(1, 0.4 * ticks);
  limbSwing += limbAmount * 1.5 * ticks;
  const phase = limbSwing * 0.6662;
  return [
    0,
    pitch,
    Math.cos(phase + Math.PI) * limbAmount,
    Math.cos(phase) * limbAmount,
    Math.cos(phase) * 1.4 * limbAmount,
    Math.cos(phase + Math.PI) * 1.4 * limbAmount,
  ];
}
function writePlayerMesh() {
  const stride = 35,
    scale = 1.8 / 32,
    data = playerMesh.data,
    angles = playerLimbAngles();
  const slot = ATLAS_SLOTS.stone || Object.values(ATLAS_SLOTS)[0];
  const uvAt = (u, v) => [
    (slot[0] * ATLAS_CELL + ATLAS_PADDING + u * 16) / ATLAS_WIDTH,
    (slot[1] * ATLAS_CELL + ATLAS_PADDING + (1 - v) * 16) / ATLAS_HEIGHT,
  ];
  const mid = uvAt(0.5, 0.5);
  let at = 0;
  const put = (x, y, z, nx, ny, nz, u, v) => {
    data[at++] = x;
    data[at++] = y;
    data[at++] = z;
    data[at++] = 1;
    data[at++] = nx;
    data[at++] = ny;
    data[at++] = nz;
    data[at++] = u;
    data[at++] = v;
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 8;
    data[at++] = 8;
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = mid[0];
    data[at++] = mid[1];
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
  };
  for (const [cx, cz, y0, y1, w, d, pivotY, limb] of PLAYER_PARTS) {
    const angle = angles[limb] || 0,
      ca = Math.cos(angle),
      sa = Math.sin(angle),
      py = pivotY * scale;
    const turn = (x, y, z) => {
      const dy = y - py;
      return [x, py + dy * ca - z * sa, dy * sa + z * ca];
    };
    const turnN = (x, y, z) => [x, y * ca - z * sa, y * sa + z * ca];
    const x0 = (cx - w / 2) * scale,
      x1 = (cx + w / 2) * scale,
      z0 = (cz - d / 2) * scale,
      z1 = (cz + d / 2) * scale,
      b0 = y0 * scale,
      b1 = y1 * scale;
    const faces = [
      [
        [x0, b1, z0],
        [x0, b1, z1],
        [x1, b1, z1],
        [x1, b1, z0],
        [0, 1, 0],
      ],
      [
        [x0, b0, z1],
        [x0, b0, z0],
        [x1, b0, z0],
        [x1, b0, z1],
        [0, -1, 0],
      ],
      [
        [x0, b0, z1],
        [x1, b0, z1],
        [x1, b1, z1],
        [x0, b1, z1],
        [0, 0, 1],
      ],
      [
        [x1, b0, z0],
        [x0, b0, z0],
        [x0, b1, z0],
        [x1, b1, z0],
        [0, 0, -1],
      ],
      [
        [x1, b0, z1],
        [x1, b0, z0],
        [x1, b1, z0],
        [x1, b1, z1],
        [1, 0, 0],
      ],
      [
        [x0, b0, z0],
        [x0, b0, z1],
        [x0, b1, z1],
        [x0, b1, z0],
        [-1, 0, 0],
      ],
    ];
    for (const [a, b, c, e, n] of faces) {
      const m = turnN(n[0], n[1], n[2]);
      const uv = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      [a, b, c, e].forEach((corner, index) => {
        const t = turn(corner[0], corner[1], corner[2]);
        const texture = uvAt(uv[index][0], uv[index][1]);
        put(t[0], t[1], t[2], m[0], m[1], m[2], texture[0], texture[1]);
      });
    }
  }
  gl.bindVertexArray(playerMesh.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, playerMesh.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}
function buildPlayerMesh() {
  const stride = 35,
    quads = PLAYER_PARTS.length * 6,
    indices = [];
  for (let quad = 0; quad < quads; quad++) {
    const base = quad * 4;
    indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
  }
  const data = new Float32Array(quads * 4 * stride);
  const vao = gl.createVertexArray(),
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
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  playerMesh = { vao, vertexBuffer, indexBuffer, indexCount: indices.length, data };
}
let packEntityIds = new Map();
function packEntityId(name) {
  return packEntityIds.get(String(name).replace(/^minecraft:/, '')) ?? 0;
}
function playerShadowEnabled() {
  return (
    String(activePackProperties.shadowPlayer ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  );
}
function playerShadowProgram(fallback) {
  return pipelinePrograms.get('shadow_entities') || fallback;
}
function drawPlayerShadow(program, eye, now) {
  if (GB.state.active) return;
  if (!playerShadowEnabled()) return;
  if (!playerMesh) buildPlayerMesh();
  writePlayerMesh();
  const entityProgram = playerShadowProgram(program);
  if (entityProgram !== program) {
    const targets = activePassTargets[programNames.get(entityProgram)] || [0];
    attachShadowTargets(targets, shadowColorTextures, true);
    gl.viewport(0, 0, SHADOW_RESOLUTION, SHADOW_RESOLUTION);
    gl.drawBuffers(targets.map((_, index) => gl.COLOR_ATTACHMENT0 + index));
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    program = entityProgram;
    gl.useProgram(program);
  }
  const c = Math.cos(-yaw),
    s = Math.sin(-yaw);
  const turn = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  const place = M4.translation(eye[0], eye[1] - PLAYER_EYE_HEIGHT, eye[2]);
  const model = M4.multiply(shadowGeometryViewMatrix, M4.multiply(place, turn));
  setUniforms(program, model, shadowProjectionMatrix, eye, now);
  u1i(program, 'renderStage', 11);
  u1i(
    program,
    'entityId',
    packEntityIds.has('current_player') ? packEntityId('current_player') : packEntityId('player'),
  );
  gl.bindVertexArray(playerMesh.vao);
  gl.drawElements(gl.TRIANGLES, playerMesh.indexCount, gl.UNSIGNED_SHORT, 0);
}
const HELD_ITEMS = {
  glowstone: { id: 44010, light: 15, material: 10412 },
  sea_lantern: { id: 44018, light: 15, material: 10448 },
  gold_block: { id: 0, light: 0, material: 10312 },
  white_concrete: { id: 0, light: 0, material: 10460 },
};
const heldItem = () => HELD_ITEMS[HOTBAR_ITEMS[hotbarSlot]?.type] || null;
function heldItemIdValue() {
  if (GB.state.active) return GB.hooks.heldLightUniforms().heldItemId;
  return irisItemIds.get(HOTBAR_ITEMS[hotbarSlot]?.type) ?? -1;
}
function heldBlockLight() {
  if (GB.state.active) return GB.hooks.heldLightUniforms().heldBlockLightValue;
  return heldItem()?.light || 0;
}

let handMesh = null,
  handSwing = 0,
  handSwingActive = false,
  handEquip = 0,
  handSlot = -1;
function destroyHandMesh() {
  if (handMesh) {
    gl.deleteVertexArray(handMesh.vao);
    gl.deleteBuffer(handMesh.vertexBuffer);
    gl.deleteBuffer(handMesh.indexBuffer);
    handMesh = null;
  }
}
canvas.addEventListener('mousedown', event => {
  if (canvas.ownerDocument.pointerLockElement === canvas && event.button !== 1) handSwingActive = true;
});
function advanceHandAnimation() {
  const ticks = Math.max(frameDelta, 1 / 240) * 20;
  if (handSwing > 0 || handSwingActive) {
    handSwing += ticks / 6;
    if (handSwing >= 1) {
      handSwing = handSwingActive ? 0 : 0;
      handSwingActive = miningHeld;
    }
  }
  if (handSlot !== hotbarSlot) {
    handSlot = hotbarSlot;
    handEquip = 1;
  }
  handEquip = Math.max(0, handEquip - ticks / 6);
}
function buildHandMesh() {
  const stride = 35,
    quads = 2 * 6,
    indices = [];
  for (let quad = 0; quad < quads; quad++) {
    const base = quad * 4;
    indices.push(base, base + 2, base + 1, base + 2, base, base + 3);
  }
  const data = new Float32Array(quads * 4 * stride);
  const vao = gl.createVertexArray(),
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
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  handMesh = { vao, vertexBuffer, indexBuffer, indexCount: indices.length, data };
}
function writeHandMesh() {
  const stride = 35,
    data = handMesh.data,
    light = currentEyeLight();
  const item = HOTBAR_ITEMS[hotbarSlot]?.type || 'white_concrete';
  const slot = ATLAS_SLOTS[item] || ATLAS_SLOTS.stone;
  const skinSlot = ATLAS_SLOTS.stone;
  const uvIn = (which, u, v) => [
    (which[0] * ATLAS_CELL + ATLAS_PADDING + u * 16) / ATLAS_WIDTH,
    (which[1] * ATLAS_CELL + ATLAS_PADDING + (1 - v) * 16) / ATLAS_HEIGHT,
  ];
  let at = 0;
  const put = (p, n, uv, mid, color, material) => {
    data[at++] = p[0];
    data[at++] = p[1];
    data[at++] = p[2];
    data[at++] = 1;
    data[at++] = n[0];
    data[at++] = n[1];
    data[at++] = n[2];
    data[at++] = uv[0];
    data[at++] = uv[1];
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = light[0] + 8;
    data[at++] = light[1] + 8;
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = color[0];
    data[at++] = color[1];
    data[at++] = color[2];
    data[at++] = 1;
    data[at++] = material;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = mid[0];
    data[at++] = mid[1];
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 1;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 1;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
    data[at++] = 0;
  };
  const box = (size, place, which, color, material) => {
    const [sx, sy, sz] = size,
      mid = uvIn(which, 0.5, 0.5);
    const corners = [
      [-sx, -sy, -sz],
      [sx, -sy, -sz],
      [sx, sy, -sz],
      [-sx, sy, -sz],
      [-sx, -sy, sz],
      [sx, -sy, sz],
      [sx, sy, sz],
      [-sx, sy, sz],
    ];
    const faces = [
      [3, 2, 6, 7, [0, 1, 0]],
      [0, 4, 5, 1, [0, -1, 0]],
      [4, 7, 6, 5, [0, 0, 1]],
      [1, 5, 6, 2, [1, 0, 0]],
      [0, 3, 7, 4, [-1, 0, 0]],
      [0, 1, 2, 3, [0, 0, -1]],
    ];
    for (const [a, b, c, d, n] of faces) {
      const uv = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      [a, b, c, d].forEach((index, corner) =>
        put(place(corners[index]), place(n, true), uvIn(which, uv[corner][0], uv[corner][1]), mid, color, material),
      );
    }
  };
  const swing = handSwing,
    root = Math.sqrt(swing);
  const swayX = -Math.sin(root * Math.PI) * 0.4,
    swayY = Math.sin(root * Math.PI * 2) * 0.2,
    swayZ = -Math.sin(swing * swing * Math.PI) * 0.2;
  const drop = handEquip * -0.6;
  const spin = Math.PI / 4 + root * -0.35,
    tilt = root * -1.0;
  const compose = (ox, oy, oz) => {
    const cy = Math.cos(spin),
      sy = Math.sin(spin),
      cx = Math.cos(tilt),
      sx = Math.sin(tilt);
    return (p, direction) => {
      let [x, y, z] = p;
      let y1 = y * cx - z * sx,
        z1 = y * sx + z * cx;
      let x2 = x * cy + z1 * sy,
        z2 = -x * sy + z1 * cy;
      if (direction) return [x2, y1, z2];
      return [x2 + ox + swayX, y1 + oy + swayY + drop, z2 + oz + swayZ];
    };
  };
  box(
    [0.2, 0.2, 0.2],
    compose(0.56, -0.52, -0.72),
    slot,
    [1, 1, 1],
    packBlockId(item, HELD_ITEMS[item]?.material || 0),
  );
  box([0.09, 0.32, 0.09], compose(0.78, -0.95, -0.62), skinSlot, [0.94, 0.73, 0.6], 0);
  gl.bindVertexArray(handMesh.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, handMesh.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}
function handWritesGbuffer() {
  if (GB.state.active) return GB.hooks.handWritesGbuffer();
  return !!resolveIrisProgram(gbufferPrograms, 'gbuffers_hand');
}
function renderHand(eye, now) {
  if (GB.state.active) return GB.hooks.drawShaderEntities('hand', eye, now);
  // F1 hides the hand too, same as in the game
  if (document.body.classList.contains('hide-ui')) return;
  const resolved = resolveIrisProgram(gbufferPrograms, 'gbuffers_hand'),
    program = resolved?.program;
  if (!program) return;
  const targets = activePassTargets[resolved.name] || [0];
  advanceHandAnimation();
  if (!handMesh) buildHandMesh();
  writeHandMesh();
  attachColorTargets(targets, colortexCurrent, true);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.useProgram(program);
  setUniforms(program, M4.identity(), handProjectionMatrix, eye, now);
  u1i(program, 'renderStage', 16);
  u1i(program, 'currentRenderedItemId', irisUniformState(eye, now).heldItemId);
  gl.bindVertexArray(handMesh.vao);
  gl.drawElements(gl.TRIANGLES, handMesh.indexCount, gl.UNSIGNED_SHORT, 0);
  inspectorCapture('gbuffers_hand');
  copyDepthSnapshots(framebuffer, depthCopyFramebuffer, [sceneDepthTextures[0], sceneDepthTextures[1]], width, height);
}
