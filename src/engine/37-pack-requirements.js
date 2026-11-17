function commitPackSettings(settings) {
  packSettings = settings;
  propertySmooth.clear();
  propertyFrame = -1;
  irisFrame = -1;
  irisEyeSmooth = null;
  irisReloadCount++;
  irisSetupPending = true;
  gl.resetCenterDepth();
  gl.centerDepthRequested = [
    ...gbufferPrograms.values(),
    ...pipelinePrograms.values(),
    ...computePrograms.values(),
  ].some(program => program.activeSamplers?.some(sampler => sampler.name === 'iris_centerDepthSmooth'));
  SHADOW_DISTANCE = Number(activeRenderConstants.shadowDistance ?? 160);
  SUN_PATH_ROTATION = (Number(activeRenderConstants.sunPathRotation ?? 0) * Math.PI) / 180;
  SHADOW_INTERVAL_SIZE = Number(activeRenderConstants.shadowIntervalSize ?? 2);
  SHADOW_NEAR = Number(activeRenderConstants.shadowNearPlane ?? -100.05);
  SHADOW_FAR = Number(activeRenderConstants.shadowFarPlane ?? 156);
  SHADOW_RESOLUTION = Number(activeRenderConstants.shadowMapResolution ?? 1024);
  createShadowFramebuffer();
  temporalHistoryValid = false;
  renderSettingsMenu();
}
function packPropertiesText(path, files, defines, overrides) {
  return glslPreprocess(path, {
    files,
    defines,
    overrides,
    text: true,
    line(line, macros) {
      if (!/^\s*(?:uniform|variable|scale|size|image|bufferObject|texture|customTexture)\./.test(line)) return line;
      return line.replace(
        /=(.*)$/,
        (whole, expression) =>
          '=' +
          expression.replace(/\b[A-Za-z_]\w*\b/g, word => {
            const value = macros.get(word)?.body.join('');
            return value !== undefined && /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[fF]?\s*$/.test(value)
              ? value.trim().replace(/[fF]$/, '')
              : word;
          }),
      );
    },
  }).code;
}
function inspectShaderRequirements(settings, values = settings.values) {
  let packProperties = {};
  const key = JSON.stringify(Object.entries(values).sort());
  settings.requirementCache ??= new Map();
  if (settings.requirementCache.has(key)) return settings.requirementCache.get(key);
  const sources = settings.packSources || {},
    issues = [],
    resources = { images: [], buffers: [], compute: [] },
    add = (feature, file, detail) => {
      if (!issues.some(item => item.feature === feature && item.file === file)) issues.push({ feature, file, detail });
    };
  const defaults = Object.fromEntries(Object.entries(settings.options).map(([name, option]) => [name, option.value]));
  const overrides = { ...defaults, ...values };
  const packDefined = Object.fromEntries(
    (settings.packDefines || []).filter(name => !Object.hasOwn(overrides, name)).map(name => [name, '1']),
  );
  const makeMacros = () => ({
    ...packDefined,
    ...Object.fromEntries(
      Object.entries(overrides)
        .filter(([, v]) => v !== false)
        .map(([k, v]) => [k, v === true ? '1' : String(v)]),
    ),
    MC_VERSION: String(PACK_GAME_VERSION),
    IS_IRIS: '1',
    IRIS_VERSION: '10900',
    IRIS_FEATURE_CUSTOM_IMAGES: '1',
    IRIS_FEATURE_SSBO: '1',
    IRIS_FEATURE_COMPUTE: '1',
    IRIS_FEATURE_COMPUTE_SHADERS: '1',
    IRIS_FEATURE_PER_BUFFER_BLENDING: '1',
    IRIS_FEATURE_SEPARATE_HARDWARE_SAMPLERS: '1',
    IRIS_FEATURE_BLOCK_EMISSION_ATTRIBUTE: '1',
    IRIS_FEATURE_ENTITY_TRANSLUCENT: '1',
    IRIS_FEATURE_TESSELLATION_SHADERS: '1',
  });
  try {
    const propertyPath = Object.keys(sources).find(path => path === 'shaders/shaders.properties');
    const properties = propertyPath
      ? propertyMap(packPropertiesText(propertyPath, sources, makeMacros(), overrides))
      : settings.properties;
    packProperties = properties;
    const enabled = path => {
      const name = path.replace(/^shaders\/(?:world0\/)?/, '').replace(/\.(?:csh|vsh|fsh|gsh|tcs|tes)$/, '');
      return programEnabled(properties, name, { options: settings.options, values, packDefines: settings.packDefines });
    };
    const supported = new Set([
      'CUSTOM_IMAGES',
      'SSBO',
      'COMPUTE_SHADERS',
      'PER_BUFFER_BLENDING',
      'SEPARATE_HARDWARE_SAMPLERS',
      'CAN_DISABLE_WEATHER',
      'HIGHER_SHADOWCOLOR',
      'BLOCK_EMISSION_ATTRIBUTE',
      'ENTITY_TRANSLUCENT',
      'REVERSED_CULLING',
      'TESSELATION_SHADERS',
      'TESSELLATION_SHADERS',
    ]);
    for (const feature of String(properties['iris.features.required'] || '')
      .split(/\s+/)
      .filter(Boolean))
      if (!supported.has(feature.toUpperCase()))
        add(
          feature,
          'shaders.properties',
          'Diese Iris-Funktion ist im WebGPU-Backend noch nicht vollständig implementiert.',
        );
    for (const path of Object.keys(sources))
      if (/^shaders\/(?:world0\/)?[^/]+\.(?:gsh|tcs|tes)$/.test(path)) {
        const name = path.replace(/^shaders\//, '').replace(/\.(?:gsh|tcs|tes)$/, '');
        if (!enabled(path)) continue;
        if (!/\.gsh$/.test(path)) {
          if (!packWantsTessellation(properties))
            console.warn(
              'Tessellation-Stufe ignoriert (Pack fordert TESSELLATION_SHADERS nicht an, wie Iris): ' + path,
            );
          continue;
        }
      }
    for (const path of Object.keys(sources).filter(path => /^shaders\/(?:world0\/)?[^/]+\.csh$/.test(path))) {
      if (enabled(path)) resources.compute.push(path);
    }
    for (const [name, value] of Object.entries(properties)) {
      const macros = makeMacros(),
        number = token => {
          const resolved = Object.hasOwn(macros, token) ? macros[token] : token;
          const n = Number(resolved);
          if (!Number.isFinite(n)) throw new Error(name + ': Größe ' + token + ' ist keine Zahl');
          return n;
        };
      if (name.startsWith('image.')) {
        const tokens = String(value).trim().split(/\s+/);
        const relative = (tokens[5] || '').toLowerCase() === 'true';
        if (relative ? tokens.length < 8 : ![7, 8, 9].includes(tokens.length)) {
          console.warn('Iris: Unknown image type! ' + name.slice(6) + ' = ' + value);
          continue;
        }
        resources.images.push({
          name: name.slice(6),
          sampler: tokens[0],
          format: tokens[2].toLowerCase(),
          clear: tokens[4].toLowerCase() === 'true',
          relative,
          size: tokens.slice(6).map(number),
        });
      }
      if (name.startsWith('indirect.')) {
        const parts = String(value).split(' '),
          integer = text => (/^[+-]?\d+$/.test(text ?? '') ? Number(text) : NaN),
          buffer = integer(parts[0]),
          offset = integer(parts[1]);
        if (!Number.isInteger(buffer) || !Number.isInteger(offset)) {
          console.warn('Iris: Failed to parse indirect command for ' + name.slice(9) + '! ' + value);
          continue;
        }
        (resources.indirect ??= {})[name.slice(9)] = { buffer, offset };
      }
      if (name.startsWith('bufferObject.')) {
        const parts = String(value).split(' ');
        while (parts.length > 1 && parts.at(-1) === '') parts.pop();
        const integer = text => (/^[+-]?\d+$/.test(text ?? '') ? Number(text) : NaN),
          index = integer(name.slice(13)),
          size = integer(parts[0]);
        if (!Number.isInteger(index) || !Number.isInteger(size)) {
          console.warn('Iris: Number format exception parsing SSBO index/size (' + name + ')');
          continue;
        }
        if (parts.length > 2 && parts.length < 4) {
          console.warn('Iris: SSBO ' + name + ' not in the correct format');
          continue;
        }
        if (index > 12) {
          console.warn("Iris: SSBO's cannot use buffer numbers higher than 12 (" + name + ')');
          continue;
        }
        if (size < 1 || index < 0) continue;
        const long = parts.length > 2,
          scaleX = long ? Number(parts[2].replace(/[fFdD]$/, '')) : 1,
          scaleY = long ? Number(parts[3].replace(/[fFdD]$/, '')) : 1;
        if (long && !(Number.isFinite(scaleX) && Number.isFinite(scaleY))) {
          console.warn('Iris: Number format exception parsing SSBO scale (' + name + ')');
          continue;
        }
        resources.buffers.push({
          binding: index,
          size,
          relative: long && parts[1].toLowerCase() === 'true',
          scaleX,
          scaleY,
          file: !long && parts.length > 1 ? parts[1] : null,
        });
      }
    }
    if (!Object.keys(sources).length && settings.options.COLORED_LIGHTING)
      add(
        'Quellinformationen fehlen',
        'shaders/',
        'Die ursprünglichen Quellen fehlen; Anforderungen können nicht zuverlässig ermittelt werden.',
      );
  } catch (error) {
    add('Analyse unvollständig', 'shaders.properties', error.message);
  }
  issues.resources = resources;
  issues.properties = packProperties;
  settings.requirementCache.set(key, issues);
  return issues;
}
function settingsCapabilityError(settings, values = settings.values) {
  const issues = inspectShaderRequirements(settings, values);
  return issues.length
    ? 'Diese Einstellungen benötigen noch nicht angebundene Pack-Funktionen: ' +
        issues
          .slice(0, 4)
          .map(item => item.feature + ' (' + item.file + '): ' + item.detail)
          .join(' · ')
    : '';
}
