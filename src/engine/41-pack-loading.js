// unzip, read the properties, translate all shaders, swap the pipeline only when evrything compiled
let vanillaFallbackLoading = false;
async function loadZipData(data, label, requestedSettings) {
  if (!GB.state.active && !(data instanceof JSZip))
    try {
      window.wgpuLastPack = { data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data).slice(), label };
    } catch {}
  packLoading = true;
  const framebufferBefore = { count: colortexCount, storage: colortexStorageTargets, sizes: colortexSizes };
  try {
    return await loadPackZipData(data, label, requestedSettings);
  } catch (error) {
    if (
      colortexCount !== framebufferBefore.count ||
      colortexStorageTargets !== framebufferBefore.storage ||
      colortexSizes !== framebufferBefore.sizes
    ) {
      colortexCount = framebufferBefore.count;
      colortexStorageTargets = framebufferBefore.storage;
      colortexSizes = framebufferBefore.sizes;
      createFramebuffer();
    }
    throw error;
  } finally {
    packLoading = false;
    temporalHistoryValid = false;
  }
}
async function applyDimensionFolders(zip) {
  const propertiesPath = Object.keys(zip.files).find(path => path === 'shaders/dimension.properties');
  if (!propertiesPath) return zip;
  const root = propertiesPath.slice(0, -'dimension.properties'.length);
  if (Object.keys(zip.files).some(path => path.startsWith(root + 'world0/'))) return zip;
  let wildcard = null,
    explicit = null;
  for (const [key, value] of Object.entries(propertyMap(await zip.file(propertiesPath).async('string')))) {
    const match = /^dimension\.([\w-]+)$/.exec(key);
    if (!match) continue;
    const ids = String(value).split(/\s+/);
    if (ids.includes('minecraft:overworld')) explicit = match[1];
    else if (ids.includes('*')) wildcard = match[1];
  }
  const folder = explicit || wildcard;
  if (!folder || folder === 'world0') return zip;
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir || !path.startsWith(root + folder + '/')) continue;
    zip.file(root + 'world0/' + path.slice(root.length + folder.length + 1), await zip.file(path).async('uint8array'));
  }
  const shaderProperties = zip.file(root + 'shaders.properties');
  if (shaderProperties) {
    const text = await shaderProperties.async('string');
    zip.file(root + 'shaders.properties', text.split('.' + folder + '/').join('.world0/'));
  }
  return zip;
}
function irisShaderpackZip(zip) {
  const names = Object.keys(zip.files);
  let root = null;
  if (names.some(name => name.startsWith('shaders/'))) root = 'shaders/';
  else {
    let depth = Infinity;
    for (const name of names) {
      const segments = name.split('/').slice(0, -1),
        at = segments.indexOf('shaders');
      if (at >= 0 && at < depth) {
        depth = at;
        root = segments.slice(0, at + 1).join('/') + '/';
      }
    }
  }
  if (!root) return zip;
  for (const name of names) {
    const entry = zip.files[name];
    delete zip.files[name];
    if (!name.startsWith(root) || (name === root && root !== 'shaders/')) continue;
    entry.name = 'shaders/' + name.slice(root.length);
    zip.files[entry.name] = entry;
  }
  return zip;
}
async function loadPackZipData(data, label, requestedSettings) {
  if (!window.JSZip)
    throw new Error('JSZip konnte nicht geladen werden. Bitte die Seite mit Internetzugriff neu laden.');
  GB.hooks.setCompilePhase('unpack', 'Entpacke ZIP');
  setStatus('Opening the shader zip …', '', { type: 'loading', step: 'open' });
  let zip = await GB.hooks.prepareShaderZip(
      await applyDimensionFolders(
        await applyNetherFolder(irisShaderpackZip(data instanceof JSZip ? data : await JSZip.loadAsync(data))),
      ),
    ),
    programFiles = discoverShaderPrograms(Object.keys(zip.files));
  for (const path of Object.keys(zip.files))
    if (
      /^shaders\/(?:world[^/]*\/)?(?:composite|deferred|prepare|begin|shadowcomp|final)\d*(?:_[a-z])?\.fsh$/.test(
        path,
      ) &&
      !zip.files[path.replace(/\.fsh$/, '.vsh')]
    ) {
      const coordinates = [
        ...new Set(
          [...(await zip.file(path).async('string')).matchAll(/\b(?:varying|in)\s+vec2\s+(\w+)\s*;/g)].map(
            match => match[1],
          ),
        ),
      ];
      zip.file(
        path.replace(/\.fsh$/, '.vsh'),
        '#version 120\n' +
          coordinates.map(name => 'varying vec2 ' + name + ';\n').join('') +
          'void main(){\n  gl_Position=ftransform();\n  gl_TexCoord[0]=gl_TextureMatrix[0]*gl_MultiTexCoord0;\n' +
          coordinates.map(name => '  ' + name + '=gl_TexCoord[0].xy;\n').join('') +
          '}\n',
      );
      programFiles = discoverShaderPrograms(Object.keys(zip.files));
    }
  window.wgpuPackBlockProgram = [
    'gbuffers_block',
    'gbuffers_terrain',
    'gbuffers_terrain_solid',
    'gbuffers_textured_lit',
    'gbuffers_textured',
    'gbuffers_basic',
  ].some(name => programFiles[name]);
  if (
    Object.keys(zip.files).some(path => path.startsWith('shaders/')) &&
    ![
      'gbuffers_terrain',
      'gbuffers_terrain_solid',
      'gbuffers_textured_lit',
      'gbuffers_textured',
      'gbuffers_basic',
      'clrwl_gbuffers',
    ].some(name => programFiles[name])
  ) {
    const root = '';
    zip.file(
      root + 'shaders/gbuffers_terrain.vsh',
      '#version 120\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nuniform mat4 gbufferModelViewInverse;\nuniform float wgpuFogRenderStart;\nuniform float wgpuFogRenderEnd;\nvoid main(){\n  gl_Position=ftransform();\n  texcoord=(gl_TextureMatrix[0]*gl_MultiTexCoord0).xy;\n  lmcoord=(gl_TextureMatrix[1]*gl_MultiTexCoord1).xy;\n  glcolor=gl_Color;\n  fogDistance=length((gl_ModelViewMatrix*gl_Vertex).xyz);\n  vec3 wgpuRel=(gbufferModelViewInverse*(gl_ModelViewMatrix*gl_Vertex)).xyz;\n  fogCylinder=max(length(wgpuRel.xz),abs(wgpuRel.y));\n}\n',
    );
    zip.file(
      root + 'shaders/gbuffers_terrain.fsh',
      '#version 120\nuniform sampler2D texture;\nuniform sampler2D lightmap;\nuniform vec3 fogColor;\nuniform float fogStart;\nuniform float fogEnd;\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nuniform mat4 gbufferModelViewInverse;\nuniform float wgpuFogRenderStart;\nuniform float wgpuFogRenderEnd;\nvoid main(){\n  vec4 color=texture2D(texture,texcoord)*glcolor;\n  if(color.a<0.1)discard;\n  color.rgb*=texture2D(lightmap,lmcoord).rgb;\n  float fogValue=max(fogDistance<=fogStart?0.0:fogDistance>=fogEnd?1.0:(fogDistance-fogStart)/(fogEnd-fogStart),fogCylinder<=wgpuFogRenderStart?0.0:fogCylinder>=wgpuFogRenderEnd?1.0:(fogCylinder-wgpuFogRenderStart)/(wgpuFogRenderEnd-wgpuFogRenderStart));\n  color.rgb=mix(color.rgb,fogColor,fogValue);\n  /* DRAWBUFFERS:0 */\n  gl_FragData[0]=color;\n}\n',
    );
    programFiles = discoverShaderPrograms(Object.keys(zip.files));
  }
  if (window.wgpuPackBlockProgram === false && Object.keys(zip.files).some(path => path.startsWith('shaders/'))) {
    zip.file(
      'shaders/gbuffers_block.vsh',
      '#version 120\nuniform mat4 gbufferModelViewInverse;\nvarying vec4 texProj0;\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nvoid main(){\n  gl_Position=ftransform();\n  vec4 projection=gl_Position*0.5;\n  texProj0=vec4(projection.x+projection.w,projection.y+projection.w,gl_Position.zw);\n  texcoord=(gl_TextureMatrix[0]*gl_MultiTexCoord0).xy;\n  lmcoord=(gl_TextureMatrix[1]*gl_MultiTexCoord1).xy;\n  glcolor=gl_Color;\n  fogDistance=length((gl_ModelViewMatrix*gl_Vertex).xyz);\n  vec3 rel=(gbufferModelViewInverse*(gl_ModelViewMatrix*gl_Vertex)).xyz;\n  fogCylinder=max(length(rel.xz),abs(rel.y));\n}\n',
    );
    zip.file(
      'shaders/gbuffers_block.fsh',
      '#version 120\n/* Vanilla 1.21.11: rendertype_end_portal (PORTAL_LAYERS 15), entity_cutout_no_cull and rendertype_text, apply_fog */\nuniform sampler2D texture;\nuniform sampler2D lightmap;\nuniform vec3 fogColor;\nuniform float fogStart;\nuniform float fogEnd;\nuniform float wgpuFogRenderStart;\nuniform float wgpuFogRenderEnd;\nuniform int wgpuEndPortal;\nuniform int wgpuVanillaMode;\nuniform vec4 wgpuOverlay;\nvarying vec4 texProj0;\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nconst vec3 COLORS[16]=vec3[16](vec3(0.022087, 0.098399, 0.110818),vec3(0.011892, 0.095924, 0.089485),vec3(0.027636, 0.101689, 0.100326),vec3(0.046564, 0.109883, 0.114838),vec3(0.064901, 0.117696, 0.097189),vec3(0.063761, 0.086895, 0.123646),vec3(0.084817, 0.111994, 0.166380),vec3(0.097489, 0.154120, 0.091064),vec3(0.106152, 0.131144, 0.195191),vec3(0.097721, 0.110188, 0.187229),vec3(0.133516, 0.138278, 0.148582),vec3(0.070006, 0.243332, 0.235792),vec3(0.196766, 0.142899, 0.214696),vec3(0.047281, 0.315338, 0.321970),vec3(0.204675, 0.390010, 0.302066),vec3(0.080955, 0.314821, 0.661491));\nconst mat4 SCALE_TRANSLATE=mat4(0.5,0.0,0.0,0.25, 0.0,0.5,0.0,0.25, 0.0,0.0,1.0,0.0, 0.0,0.0,0.0,1.0);\nmat2 mat2_rotate_z(float radians){return mat2(cos(radians),-sin(radians),sin(radians),cos(radians));}\nmat4 end_portal_layer(float layer,float gameTime){\n  mat4 translate=mat4(1.0,0.0,0.0,17.0/layer, 0.0,1.0,0.0,(2.0+layer/1.5)*(gameTime*1.5), 0.0,0.0,1.0,0.0, 0.0,0.0,0.0,1.0);\n  mat2 rotate=mat2_rotate_z(radians((layer*layer*4321.0+layer*9.0)*2.0));\n  mat2 scale=mat2((4.5-layer/4.0)*2.0);\n  return mat4(scale*rotate)*translate*SCALE_TRANSLATE;\n}\n/* Sampler0 (end_sky.png) is the left half, Sampler1 (end_portal.png, repeating) the right half. */\nvec3 sampler0Proj(vec4 q){vec2 uv=q.xy/q.w;return texture2D(texture,vec2(fract(uv.x)*0.5,fract(uv.y))).rgb;}\nvec3 sampler1Proj(vec4 q){vec2 uv=q.xy/q.w;return texture2D(texture,vec2(0.5+fract(uv.x)*0.5,fract(uv.y))).rgb;}\nfloat linearFog(float d,float s,float e){return d<=s?0.0:d>=e?1.0:(d-s)/(e-s);}\n/* wgpuVanillaMode (the Ender Dragon): 2 rendertype_entity_alpha, 3 rendertype_entity_decal, 4 eyes (entity EMISSIVE NO_OVERLAY\n   NO_CARDINAL_LIGHTING), 5 rendertype_lightning, 6 entity with ALPHA_CUTOUT 0.1 and the overlay; the lighting is in glcolor. */\nvoid main(){\n  vec4 color;\n  float fog=max(linearFog(fogDistance,fogStart,fogEnd),linearFog(fogCylinder,wgpuFogRenderStart,wgpuFogRenderEnd));\n  if(wgpuEndPortal==1){\n    vec3 portal=sampler0Proj(texProj0)*COLORS[0];\n    for(int i=0;i<15;i++){\n      portal+=sampler1Proj(texProj0*end_portal_layer(float(i+1),texcoord.x))*COLORS[i];\n    }\n    color=vec4(portal,1.0);\n    color.rgb=mix(color.rgb,fogColor,fog);\n  }else if(wgpuVanillaMode==2){\n    color=texture2D(texture,texcoord);\n    if(color.a<glcolor.a)discard;\n  }else if(wgpuVanillaMode==5){\n    color=glcolor*(1.0-fog);\n  }else if(wgpuVanillaMode==4){\n    color=texture2D(texture,texcoord)*glcolor;\n    color.rgb=mix(color.rgb,fogColor,fog);\n  }else if(wgpuVanillaMode==3){\n    color=texture2D(texture,texcoord);\n    if(color.a<0.1)discard;\n    color.rgb=mix(wgpuOverlay.rgb,color.rgb,wgpuOverlay.a);\n    color*=glcolor;\n    color.rgb*=texture2D(lightmap,lmcoord).rgb;\n    color.rgb=mix(color.rgb,fogColor,fog);\n  }else if(wgpuVanillaMode==6){\n    color=texture2D(texture,texcoord);\n    if(color.a<0.1)discard;\n    color*=glcolor;\n    color.rgb=mix(wgpuOverlay.rgb,color.rgb,wgpuOverlay.a);\n    color.rgb*=texture2D(lightmap,lmcoord).rgb;\n    color.rgb=mix(color.rgb,fogColor,fog);\n  }else{\n    color=texture2D(texture,texcoord)*glcolor;\n    if(color.a<0.1)discard;\n    color.rgb*=texture2D(lightmap,lmcoord).rgb;\n    color.rgb=mix(color.rgb,fogColor,fog);\n  }\n  /* DRAWBUFFERS:0 */\n  gl_FragData[0]=color;\n}\n',
    );
    programFiles = discoverShaderPrograms(Object.keys(zip.files));
  }
  if (
    Object.keys(zip.files).some(path => path.startsWith('shaders/')) &&
    !['gbuffers_hand', 'gbuffers_textured_lit', 'gbuffers_textured', 'gbuffers_basic'].some(name => programFiles[name])
  ) {
    const root = '';
    zip.file(
      root + 'shaders/gbuffers_textured_lit.vsh',
      '#version 120\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nuniform mat4 gbufferModelViewInverse;\nuniform float wgpuFogRenderStart;\nuniform float wgpuFogRenderEnd;\nvoid main(){\n  gl_Position=ftransform();\n  texcoord=(gl_TextureMatrix[0]*gl_MultiTexCoord0).xy;\n  lmcoord=(gl_TextureMatrix[1]*gl_MultiTexCoord1).xy;\n  glcolor=gl_Color;\n  fogDistance=length((gl_ModelViewMatrix*gl_Vertex).xyz);\n  vec3 wgpuRel=(gbufferModelViewInverse*(gl_ModelViewMatrix*gl_Vertex)).xyz;\n  fogCylinder=max(length(wgpuRel.xz),abs(wgpuRel.y));\n}\n',
    );
    zip.file(
      root + 'shaders/gbuffers_textured_lit.fsh',
      '#version 120\nuniform sampler2D texture;\nuniform sampler2D lightmap;\nuniform vec3 fogColor;\nuniform float fogStart;\nuniform float fogEnd;\nvarying vec2 texcoord;\nvarying vec2 lmcoord;\nvarying vec4 glcolor;\nvarying float fogDistance;\nvarying float fogCylinder;\nuniform mat4 gbufferModelViewInverse;\nuniform float wgpuFogRenderStart;\nuniform float wgpuFogRenderEnd;\nvoid main(){\n  vec4 color=texture2D(texture,texcoord)*glcolor;\n  if(color.a<0.1)discard;\n  color.rgb*=texture2D(lightmap,lmcoord).rgb;\n  float fogValue=max(fogDistance<=fogStart?0.0:fogDistance>=fogEnd?1.0:(fogDistance-fogStart)/(fogEnd-fogStart),fogCylinder<=wgpuFogRenderStart?0.0:fogCylinder>=wgpuFogRenderEnd?1.0:(fogCylinder-wgpuFogRenderStart)/(wgpuFogRenderEnd-wgpuFogRenderStart));\n  color.rgb=mix(color.rgb,fogColor,fogValue);\n  /* DRAWBUFFERS:0 */\n  gl_FragData[0]=color;\n}\n',
    );
    programFiles = discoverShaderPrograms(Object.keys(zip.files));
  }
  if (
    Object.keys(zip.files).some(path => path.startsWith('shaders/')) &&
    !programFiles.gbuffers_skybasic &&
    !programFiles.gbuffers_basic
  ) {
    const root = '';
    zip.file(root + 'shaders/gbuffers_skybasic.vsh', '#version 120\nvoid main(){\n  gl_Position=ftransform();\n}\n');
    zip.file(
      root + 'shaders/gbuffers_skybasic.fsh',
      '#version 120\nuniform float viewWidth;\nuniform float viewHeight;\nuniform mat4 gbufferModelView;\nuniform mat4 gbufferProjectionInverse;\nuniform vec3 fogColor;\nuniform vec3 skyColor;\nvoid main(){\n  vec4 view=gbufferProjectionInverse*vec4(gl_FragCoord.xy/vec2(viewWidth,viewHeight)*2.0-1.0,1.0,1.0);\n  float up=max(dot(normalize(view.xyz),gbufferModelView[1].xyz),0.0);\n  /* DRAWBUFFERS:0 */\n  gl_FragData[0]=vec4(mix(skyColor,fogColor,0.25/(up*up+0.25)),1.0);\n}\n',
    );
    programFiles = discoverShaderPrograms(Object.keys(zip.files));
  }
  if (programFiles.gbuffers_basic && !programFiles.gbuffers_skybasic)
    programFiles.gbuffers_skybasic = { ...programFiles.gbuffers_basic };
  packEntityIds = new Map();
  const entityPath = Object.keys(zip.files).find(path => /(^|\/)shaders\/entity\.properties$/.test(path));
  if (entityPath)
    for (const [key, value] of Object.entries(propertyMap(await zip.file(entityPath).async('string')))) {
      const match = /^entity\.(\d+)$/.exec(key);
      if (!match) continue;
      for (const entity of value.split(/\s+/)) packEntityIds.set(entity.replace(/^minecraft:/, ''), Number(match[1]));
    }
  const nextItemIds = new Map(),
    itemPath = Object.keys(zip.files).find(path => /(^|\/)shaders\/item.properties$/.test(path));
  if (itemPath)
    for (const [key, value] of Object.entries(propertyMap(await zip.file(itemPath).async('string')))) {
      const match = /^item\.(\d+)$/.exec(key);
      if (!match) continue;
      for (const item of value.split(/\s+/)) nextItemIds.set(item.replace(/^minecraft:/, ''), Number(match[1]));
    }
  nextRenderTargets = await readRenderTargetDirectives(zip);
  const nextShadowTargets = [];
  gl.setUnfilterableTargets(unfilterableTargetNames(nextRenderTargets));
  const shaderSources = await readShaderSources(zip);
  for (const source of shaderSources)
    collectRenderTargetDirectives(
      source
        .replace(/\b(colortex\d+|gcolor|gdepth|gnormal|composite|gaux[1-4])/g, 'ignored_$1')
        .replace(/\bshadowcolor(\d+)/g, 'colortex$1'),
      nextShadowTargets,
    );
  const propertiesPath = Object.keys(zip.files).find(path => /(^|\/)shaders\/shaders\.properties$/.test(path));
  const unfilterableCustom = [];
  if (propertiesPath)
    for (const [key, value] of Object.entries(propertyMap(await zip.file(propertiesPath).async('string')))) {
      const match = /^(?:customTexture\.(\w+)|texture\.\w+\.(\w+?)(?:\.\d+)?)$/.exec(key),
        tokens = String(value).trim().split(/\s+/);
      if (!match || tokens.length < 5) continue;
      const type = tokens.at(-1).toUpperCase();
      if (
        (type === 'UNSIGNED_SHORT' && (tokens[1] || '').toUpperCase() !== 'TEXTURE_3D') ||
        ((type === 'UNSIGNED_SHORT' || type === 'FLOAT') && !gl.device.features.has('float32-filterable'))
      )
        unfilterableCustom.push(match[1] || match[2]);
    }
  gl.setUnfilterableTargets([
    ...unfilterableTargetNames(nextRenderTargets),
    ...unfilterableTargetNames(nextShadowTargets)
      .filter(name => name.startsWith('colortex'))
      .map(name => name.replace('colortex', 'shadowcolor')),
    ...unfilterableCustom,
  ]);
  const wantedCount = colortexCountFor(shaderSources),
    wantedStorage = colorImageTargetsFor(shaderSources);
  if (wantedCount !== colortexCount || !sameTargets(wantedStorage, colortexStorageTargets)) {
    colortexCount = wantedCount;
    colortexStorageTargets = wantedStorage;
    createFramebuffer();
  }
  if (!Object.keys(programFiles).length)
    throw new Error(
      'Keine Iris-Shader gefunden. Bitte ein ZIP mit shaders/*.vsh und *.fsh oder shaders/world0/ auswählen.',
    );
  const nextSettings = await readPackSettings(zip, label, requestedSettings);
  {
    let message = null;
    try {
      const failures = irisPackIncludeFailures(nextSettings.packSources);
      if (failures.length) message = failures.join('\n');
    } catch (error) {
      message = error.message;
    }
    if (message) {
      message = 'Failed to load the shaderpack "' + label + '"!\n' + message;
      console.error(message);
      shaderFailures = [{ name: 'Shaderpack', message }];
      shaderFailureSettings = {
        pack: label,
        profil: nextSettings.profile || 'Benutzerdefiniert',
        werte: nextSettings.values || {},
      };
      showShaderFailures();
      setProgramSummary('Shader pack not applied');
      throw new Error('Failed to load the shaderpack "' + label + '"! · F9 zeigt die Details');
    }
  }
  const nextBlockIds = readBlockProperties(nextSettings);
  const capabilityError = settingsCapabilityError(nextSettings);
  if (capabilityError) throw new Error(capabilityError);
  const packRequirements = inspectShaderRequirements(nextSettings);
  const baseResources = packRequirements.resources || { images: [], buffers: [], compute: [] };
  const atomicImages = atomicImageSpecs(
    shaderSources,
    baseResources,
    packRequirements.properties || nextSettings.properties,
  );
  {
    const wantedSizes = colortexSizesFor(packRequirements.properties || nextSettings.properties);
    for (const spec of atomicImages)
      if (spec.colorTarget !== undefined)
        wantedSizes.set(spec.colorTarget, [
          { absolute: true, value: 1 },
          { absolute: true, value: 1 },
        ]);
    if (!sameSizes(wantedSizes, colortexSizes)) {
      colortexSizes = wantedSizes;
      createFramebuffer();
    }
  }
  let packResources = atomicImages.length
    ? { ...baseResources, buffers: [...baseResources.buffers, ...atomicImages.map(spec => spec.buffer)] }
    : baseResources;
  {
    const spills = planSharedSpills(
      baseResources.compute || [],
      nextSettings,
      new Set(packResources.buffers.map(buffer => buffer.binding)),
      width,
      height,
    );
    activeSharedSpills = spills.plans;
    if (spills.buffers.length)
      packResources = { ...packResources, buffers: [...packResources.buffers, ...spills.buffers] };
  }
  for (const buffer of packResources.buffers)
    if (buffer.file) {
      const wanted = buffer.file.replace(/^\//, ''),
        path = Object.keys(zip.files).find(path => path === 'shaders/' + wanted);
      if (!path) throw new Error('bufferObject.' + buffer.binding + ': Datei ' + buffer.file + ' fehlt');
      buffer.content = await zip.file(path).async('uint8array');
    }
  const previousResources = activePackResources;
  try {
    gl.configurePackResources(packResources, width, height);
  } catch (error) {
    gl.configurePackResources(previousResources, width, height);
    throw error;
  }
  const imageFormats = Object.fromEntries(packResources.images.map(image => [image.name, image.format]));
  const nextComputePrograms = new Map();
  const packProperties = packRequirements.properties || nextSettings.properties;
  nextSettings.uniforms = compilePropertyUniforms(withSdvUniforms(packProperties, nextSettings.packSources));
  const disabledPrograms = Object.keys(programFiles).filter(
    name => !programEnabled(packProperties, name, nextSettings),
  );
  for (const name of disabledPrograms) delete programFiles[name];
  const names = Object.keys(programFiles),
    nextPrograms = new Map(),
    nextPipelinePrograms = new Map(),
    nextTargets = {},
    states = new Map(),
    failures = [];
  if (
    !names.some(name =>
      [
        'gbuffers_terrain',
        'gbuffers_terrain_solid',
        'gbuffers_textured_lit',
        'gbuffers_textured',
        'gbuffers_basic',
        'clrwl_gbuffers',
      ].includes(name),
    )
  )
    throw new Error('Das Pack enthält keinen unterstützten Terrain-G-Buffer.');
  displayedProgramNames = names;
  GB.hooks.setCompilePhase('compile', null);
  GB.hooks.noteCompilation(states, names);
  try {
    gl.shaderCompiler.beginBatch(names.length);
    let nextIndex = 0;
    const compileLane = async () => {
      while (nextIndex < names.length) {
        const name = names[nextIndex++],
          files = programFiles[name];
        let createdProgram = null;
        states.set(name, 'compiling');
        showProgramStates(states);
        try {
          if (!files.vsh || !files.fsh) throw new Error('Vertex- oder Fragmentshader fehlt');
          let [vs, fs, gs, tess] = packProgramSources(
            files,
            name,
            nextSettings,
            packRequirements.properties || nextSettings.properties,
            atomicImages,
          );
          if (typeof window.wgpuShaderPatch === 'function') {
            vs = window.wgpuShaderPatch(name, 'vertex', vs);
            fs = window.wgpuShaderPatch(name, 'fragment', fs);
            if (gs) gs = window.wgpuShaderPatch(name, 'geometry', gs);
            if (tess)
              tess = {
                ...tess,
                control: window.wgpuShaderPatch(name, 'tessControl', tess.control),
                evaluation: window.wgpuShaderPatch(name, 'tessEval', tess.evaluation),
              };
          }
          createdProgram = await createProgram(vs, fs, name, {
            formats: imageFormats,
            ...(gs ? { geometry: gs } : {}),
            ...(tess ? { tessControl: tess.control, tessEval: tess.evaluation } : {}),
          });
          const reported = createdProgram.renderTargets;
          const usable =
            reported?.length &&
            reported.length <= maxColorAttachments &&
            reported.every(value => Number.isInteger(value) && value >= 0 && value < colortexCurrent.length);
          nextTargets[name] = usable ? reported : getPackTargets(name, fs);
          gl.useProgram(createdProgram);
          bindSamplers(createdProgram);
          (isSceneStage(name) ? nextPrograms : nextPipelinePrograms).set(name, createdProgram);
          createdProgram = null;
          states.set(name, 'ready');
        } catch (error) {
          if (createdProgram) gl.deleteProgram(createdProgram);
          if (!isSceneStage(name) && /Missing entry point/.test(error.message)) {
            console.warn('Programm ohne main() übersprungen: ' + name);
            states.set(name, 'empty');
          } else {
            states.set(name, 'failed');
            failures.push({ name, message: error.message, files: programFiles[name] });
          }
        } finally {
          gl.shaderCompiler.programDone();
          showProgramStates(states);
        }
        await shaderYield();
      }
    };
    try {
      const lanes = await Promise.allSettled(
        Array.from({ length: Math.min(names.length, gl.shaderCompiler.concurrency) }, () => compileLane()),
      );
      for (const result of lanes)
        if (result.status === 'rejected')
          failures.push({ name: 'Ladevorgang', message: result.reason?.message || String(result.reason) });
    } finally {
      gl.shaderCompiler.endBatch();
    }
    for (const [name, state] of states)
      if (state === 'leer' && names.includes(name)) names.splice(names.indexOf(name), 1);
    const irisGbuffers =
      /^gbuffers_(?:basic|line|textured|textured_lit|skybasic|skytextured|clouds|terrain|terrain_solid|terrain_cutout|terrain_cutout_mip|damagedblock|block|block_translucent|beaconbeam|item|entities|entities_translucent|entities_glowing|lightning|particles|particles_translucent|armor_glint|spidereyes|hand|hand_water|weather|water)$/;
    const allNames = new Set([...nextPrograms.keys(), ...failures.map(failure => failure.name)]);
    const drawn = new Set(
      [
        'gbuffers_terrain',
        'gbuffers_terrain_solid',
        'gbuffers_water',
        'gbuffers_skybasic',
        'gbuffers_skytextured',
        'gbuffers_clouds',
        'gbuffers_hand',
      ]
        .map(name => {
          const seen = new Set();
          while (name && !seen.has(name)) {
            if (allNames.has(name)) return name;
            seen.add(name);
            name = IRIS_PROGRAM_FALLBACKS[name];
          }
          return null;
        })
        .filter(Boolean),
    );
    if (
      [
        'gbuffers_terrain',
        'gbuffers_terrain_solid',
        'gbuffers_textured_lit',
        'gbuffers_textured',
        'gbuffers_basic',
      ].some(name => nextPrograms.has(name))
    ) {
      for (let index = failures.length - 1; index >= 0; index--) {
        const name = failures[index].name;
        if (
          typeof name !== 'string' ||
          !(
            name.startsWith('clrwl_') ||
            (name.startsWith('gbuffers_') && (!irisGbuffers.test(name) || !drawn.has(name)))
          )
        )
          continue;
        console.warn('Colorwheel-Programm übersprungen: ' + name + ' · ' + failures[index].message);
        failures.splice(index, 1);
        names.splice(names.indexOf(name), 1);
      }
    }

    if (!failures.length) {
      const computePaths = packResources.compute.filter(path => !/\/world(?:-1|[1-9]\d*)\//.test(path));
      const byName = new Map();
      for (const path of computePaths) {
        const name = path
          .split('/')
          .pop()
          .replace(/\.csh$/, '');
        if (!byName.has(name) || path.includes('/world0/')) byName.set(name, path);
      }
      await Promise.all(
        [...byName].map(async ([name, path]) => {
          states.set(name, 'compiling');
          showProgramStates(states);
          try {
            const source = packComputeSource(path, nextSettings, atomicImages);
            const unbound = [...source.matchAll(/\bimageAtomic\w+\s*\(\s*(\w+)/g)].find(
              match => !/colorimg\d/.test(match[1]) && !packResources.images.some(image => image.name === match[1]),
            );
            if (unbound) throw new Error('Image ohne Format: ' + unbound[1]);
            const program = await gl.createShaderProgram('', '', name, false, {
              compute: GB.hooks.adaptShaderSource(source, name),
              formats: imageFormats,
            });
            programNames.set(program, name);
            nextComputePrograms.set(name, program);
            states.set(name, 'ready');
          } catch (error) {
            if (/Image ohne Format/.test(error.message) || name.startsWith('clrwl_')) {
              console.warn('Compute-Programm übersprungen: ' + name + ' · ' + error.message);
              states.set(name, 'skipped');
            } else {
              states.set(name, 'failed');
              failures.push(name + ': ' + error.message);
            }
          }
          showProgramStates(states);
        }),
      );
    }
    if (failures.length) {
      shaderFailures = failures.map(entry => (typeof entry === 'string' ? { name: '?', message: entry } : entry));
      shaderFailureSettings = {
        pack: nextSettings.label,
        profil: nextSettings.profile || 'Benutzerdefiniert',
        werte: nextSettings.values,
      };
      showShaderFailures();
      throw new Error(failures.length + ' von ' + names.length + ' Programmen fehlgeschlagen · F9 zeigt die Details');
    }
  } catch (error) {
    for (const program of [...nextPrograms.values(), ...nextPipelinePrograms.values(), ...nextComputePrograms.values()])
      gl.deleteProgram(program);
    gl.configurePackResources(previousResources, width, height);
    setProgramSummary('Shader pack not applied');
    if (!GB.state.active && !vanillaFallbackLoading) {
      const failures = shaderFailures.slice(),
        failureSettings = shaderFailureSettings;
      vanillaFallbackLoading = true;
      try {
        const empty = new JSZip();
        empty.file('shaders/shaders.properties', '');
        await loadZipData(empty, label + ' · Shader deaktiviert');
      } catch (fallbackError) {
        console.warn('Vanilla fallback failed', fallbackError);
      } finally {
        vanillaFallbackLoading = false;
      }
      shaderFailures = failures;
      shaderFailureSettings = failureSettings;
      packSettings = nextSettings;
      throw new Error(
        'The shaderpack failed to load! Please report the error to the shader developer. · ' +
          error.message +
          ' · Shader deaktiviert (Vanilla)',
      );
    }
    throw new Error(error.message + ' · Das bisherige Pack bleibt aktiv.');
  }
  shaderFailures = [];
  reportTestState({ failures: [] });
  setStatus('Reading pack textures …', '', { type: 'loading', step: 'pack-textures' });
  const nextTextures = await readPackTextures(zip, packProperties);
  disposePackTextures(activePackTextures);
  activePackTextures = nextTextures;
  const oldPrograms = [...gbufferPrograms.values(), ...pipelinePrograms.values()];
  for (const program of computePrograms.values()) gl.deleteProgram(program);
  irisItemIds = nextItemIds;
  activeFlipOverrides = flipOverridesFor(packProperties);
  gbufferPrograms = nextPrograms;
  pipelinePrograms = nextPipelinePrograms;
  activePassTargets = nextTargets;
  computePrograms = nextComputePrograms;
  activePackResources = packResources;
  activePackProperties = packRequirements.properties || {};
  destroyPlayerMesh();
  destroyHandMesh();
  const terrainName =
    (
      resolveIrisProgram(gbufferPrograms, 'gbuffers_terrain') ||
      resolveIrisProgram(gbufferPrograms, 'gbuffers_terrain_solid')
    )?.name || 'clrwl_gbuffers';
  activeProgram = gbufferPrograms.get(terrainName);
  activeTerrainTargets = nextTargets[terrainName];
  {
    const cutout = resolveIrisProgram(gbufferPrograms, 'gbuffers_terrain_cutout');
    activeCutoutProgram = cutout && cutout.name !== terrainName ? cutout.program : null;
    activeCutoutTargets = cutout ? nextTargets[cutout.name] : null;
  }
  skyProgram = resolveIrisProgram(gbufferPrograms, 'gbuffers_skybasic')?.program || null;
  activePreOrder = irisStageOrder(names, Array.from(computePrograms.keys()), ['begin', 'prepare']);
  activePostOrder = irisStageOrder(names, Array.from(computePrograms.keys()), ['deferred', 'composite']);
  for (const program of oldPrograms) gl.deleteProgram(program);
  activeRenderConstants = Object.assign(
    {},
    ...names.map(name => (nextPrograms.get(name) || nextPipelinePrograms.get(name))?.constants || {}),
  );
  packShadowTargets = nextShadowTargets;
  shadowStorageTargets = new Set(
    shaderSources.flatMap(source => [...source.matchAll(/\bshadowcolorimg(\d+)\b/g)].map(match => Number(match[1]))),
  );
  setStatus('Reading custom textures …', '', { type: 'loading', step: 'custom-textures' });
  applyCustomTextures(await readCustomTextures(zip, packRequirements.properties || nextSettings.properties));
  resetStageWrittenTargets();
  for (const program of [...nextPrograms.values(), ...nextPipelinePrograms.values()]) {
    gl.useProgram(program);
    bindSamplers(program);
  }
  {
    const lines = [];
    const describe = texture =>
      (texture.depth > 1 ? '3D ' : '2D ') +
      texture.width +
      '×' +
      texture.height +
      (texture.depth > 1 ? '×' + texture.depth : '') +
      ' ' +
      texture.format;
    for (const [name, texture] of activeCustomTextures.global) lines.push('  ' + name + ' · ' + describe(texture));
    for (const [stage, map] of activeCustomTextures.stages)
      for (const [name, texture] of map) lines.push('  ' + stage + '.' + name + ' · ' + describe(texture));
    for (const note of activeCustomTextures.skipped || []) lines.push('  ÜBERSPRUNGEN ' + note);
    console.info('Pack-Texturen:\n' + (lines.length ? lines.join('\n') : '  keine'));
  }
  GB.pipeline.reset();
  commitPackSettings(nextSettings);
  applyRenderTargetDirectives(nextRenderTargets);
  applyPackBlockIds(nextBlockIds);
  resetColortexState();
  clearDepthSnapshots(sceneDepthTextures, width, height, depthCopyFramebuffer);
  clearDepthSnapshots(shadowDepthTextures, SHADOW_RESOLUTION, SHADOW_RESOLUTION, shadowDepthCopyFramebuffer);
  gbufferDebugView = 0;
  GB.packLabel = label;
  announce('pack', label);
  document.title = label + ' - GBufferd';
  setProgramSummary(
    `${names.length + nextComputePrograms.size}/${names.length + nextComputePrograms.size} shader programs compiled${nextComputePrograms.size ? ', ' + nextComputePrograms.size + ' compute' : ''}`,
    {
      ready: names.length + nextComputePrograms.size,
      total: names.length + nextComputePrograms.size,
      compute: nextComputePrograms.size,
    },
  );
  setStatus(`${label} · ${nextSettings.profile || 'custom'} · ${names.length} programs active`, 'good', {
    type: 'loaded',
    pack: label,
    profile: nextSettings.profile || 'custom',
    programs: names.length,
    compute: nextComputePrograms.size,
  });
}
