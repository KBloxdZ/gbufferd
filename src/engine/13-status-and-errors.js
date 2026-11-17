let shadowViewMatrix = identityMatrix,
  shadowGeometryViewMatrix = identityMatrix,
  shadowProjectionMatrix = identityMatrix;
const programNames = new WeakMap();
const colortexFormatLabels = [];
let shaderFailures = [],
  shaderFailureSettings = null;
const failureBox = document.createElement('div');
failureBox.id = 'shaderFailures';
failureBox.hidden = true;
const failureText = document.createElement('pre');
const failureTools = document.createElement('div');
failureTools.className = 'failure-tools';
const failureCopy = document.createElement('button');
failureCopy.type = 'button';
failureCopy.textContent = 'Copy (C)';
const failureSave = document.createElement('button');
failureSave.type = 'button';
failureSave.textContent = 'Save file (S)';
failureTools.append(failureCopy, failureSave);
failureBox.append(failureTools, failureText);
document.body.append(failureBox);
async function copyShaderFailures() {
  const text = failureText.textContent;
  let okay = false;
  try {
    await navigator.clipboard.writeText(text);
    okay = true;
  } catch {}
  if (!okay) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area);
    area.focus();
    area.select();
    try {
      okay = document.execCommand('copy');
    } catch {}
    area.remove();
  }
  failureCopy.textContent = okay ? 'Copied' : 'Copy failed — select text';
  setTimeout(() => (failureCopy.textContent = 'Copy (C)'), 2000);
}
function saveShaderFailures() {
  const blob = new Blob([failureText.textContent], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'shader-errors.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
failureCopy.addEventListener('click', copyShaderFailures);
failureSave.addEventListener('click', saveShaderFailures);
function showShaderFailures() {
  if (!shaderFailures.length) {
    failureBox.hidden = true;
    return;
  }
  const lines = ['§ SHADER ERRORS    F9 close    ' + shaderFailures.length + ' programs', ''];
  for (const entry of shaderFailures) {
    const stage = /Vertex/.test(entry.message)
      ? 'Vertex shader'
      : /Fragment/.test(entry.message)
        ? 'Fragment shader'
        : /Compute/.test(entry.message)
          ? 'Compute shader'
          : /Link|Binding/.test(entry.message)
            ? 'Linking / bindings'
            : 'Unknown stage';
    lines.push('  ' + entry.name);
    lines.push('    Stage:    ' + stage);
    lines.push('    Message:  ' + entry.message);
    if (entry.files?.fsh) lines.push('    Files:    ' + [entry.files.vsh, entry.files.fsh].filter(Boolean).join('  '));
    lines.push('');
  }
  if (shaderFailureSettings) {
    lines.push('  Active settings');
    lines.push('    Pack:   ' + shaderFailureSettings.pack);
    lines.push('    Profile: ' + shaderFailureSettings.profil);
    const values = Object.entries(shaderFailureSettings.werte).map(([key, value]) => key + '=' + value);
    for (let index = 0; index < values.length; index += 4)
      lines.push('    ' + values.slice(index, index + 4).join('  '));
  }
  lines.push('');
  lines.push('  Environment');
  lines.push('    Time:    ' + new Date().toISOString());
  lines.push('    Display: ' + width + 'x' + height);
  lines.push('    Browser: ' + navigator.userAgent);
  failureText.textContent = lines.join('\n');
  failureBox.hidden = false;
}
document.addEventListener('keydown', event => {
  if (event.code === 'F9') {
    event.preventDefault();
    if (!shaderFailures.length) {
      setStatus('No recorded shader errors', 'good');
      return;
    }
    if (failureBox.hidden) showShaderFailures();
    else failureBox.hidden = true;
    return;
  }
  if (failureBox.hidden || canvas.ownerDocument.pointerLockElement) return;
  if (event.code === 'KeyC') {
    copyShaderFailures();
    event.preventDefault();
  } else if (event.code === 'KeyS') {
    saveShaderFailures();
    event.preventDefault();
  }
});

const FALLBACK_VS = `#version 300 es
precision highp float;
in vec4 mc_Vertex;
in vec3 mc_Normal;
in vec4 mc_MultiTexCoord0;
in vec4 mc_Color;
uniform mat4 mc_ModelViewProjectionMatrix;
uniform mat3 mc_NormalMatrix;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorld;
out vec4 vColor;
out vec2 texCoord;
out vec4 glColorRaw;
void main() {
  vNormal = normalize(mc_Normal);
  vUV = mc_MultiTexCoord0.xy;
  vWorld = mc_Vertex.xyz;
  vColor = mc_Color;
  texCoord = mc_MultiTexCoord0.xy;
  glColorRaw = mc_Color;
  gl_Position = mc_ModelViewProjectionMatrix * mc_Vertex;
}`;

const FALLBACK_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorld;
in vec4 vColor;
uniform sampler2D tex;
layout(location=0) out vec4 outColor0;
layout(location=1) out vec4 outColor1;
layout(location=2) out vec4 outColor2;
void main() {
  vec3 n = normalize(vNormal);
  vec3 sun = normalize(vec3(-0.42, 0.84, 0.34));
  float diffuse = max(dot(n, sun), 0.0);
  float ao = 0.82 + 0.18 * smoothstep(-0.2, 0.8, n.y);
  vec4 texel = texture(tex, vUV);
  if (texel.a < 0.1) discard;
  vec3 dirt = texel.rgb * vColor.rgb;
  vec3 lit = dirt * (0.28 + 0.72 * diffuse) * ao;
  outColor0 = vec4(lit, 1.0);
  outColor1 = vec4(0.14, 0.0, ao, 1.0);
  outColor2 = vec4(n * 0.5 + 0.5, 1.0);
}`;

const PRESENT_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 uv;
void main() { vec2 p=P[gl_VertexID]; uv=p*.5+.5; gl_Position=vec4(p,0,1); }`;

const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform int displayMode;
uniform float nearPlane;
uniform float farPlane;
out vec4 color;
void main() {
  vec4 sampleValue=texture(image,uv);
  vec3 c=sampleValue.rgb;
  if(displayMode==1){
    c=pow(max(c,vec3(0.0))/(1.0+max(c,vec3(0.0))),vec3(1.0/2.2));
  }else if(displayMode==2){
    c=clamp(c*0.5+0.5,0.0,1.0);
  }else if(displayMode==3){
    float z=sampleValue.r*2.0-1.0;
    float linearDepth=(2.0*nearPlane*farPlane)/(farPlane+nearPlane-z*(farPlane-nearPlane));
    c=vec3(clamp(linearDepth/farPlane,0.0,1.0));
  }else{
    c=clamp(c,0.0,1.0);
  }
  if(displayMode==4)c=vec3(sampleValue.r);
  else if(displayMode==5)c=vec3(sampleValue.g);
  else if(displayMode==6)c=vec3(sampleValue.b);
  else if(displayMode==7)c=vec3(sampleValue.a);
  else if(displayMode==8)c=abs(sampleValue.rgb)*10.0;
  else if(displayMode==9)c=abs(sampleValue.rgb)*100.0;
  color=vec4(c,1.0);
}`;

const testParams = new URLSearchParams(location.search);
const testState = {
  label: null,
  status: '',
  kind: '',
  busy: false,
  ok: null,
  ms: null,
  programs: null,
  failures: [],
  fps: 0,
  chunksPending: null,
};
function reportTestState(patch) {
  Object.assign(testState, patch);
  if (parent !== window)
    parent.postMessage(
      {
        type: 'shader-test',
        state: {
          ...testState,
          uniformErrors: (packSettings?.uniforms || [])
            .filter(entry => entry.error || entry.lastError)
            .slice(0, 40)
            .map(entry => entry.name + ': ' + (entry.error || entry.lastError)),
        },
      },
      '*',
    );
}
function setStatus(text, kind = '', info = {}) {
  reportTestState({ status: text, kind });
  document.getElementById('testText').textContent =
    testState.label && !text.startsWith(testState.label) ? testState.label + ' · ' + text : text;
  document.getElementById('testDot').className = 'dot' + (kind ? ' ' + kind : '');
  GB.status = { type: kind === 'bad' ? 'error' : 'notice', ...info, message: text, kind };
  announce('status', GB.status);
  const progress = document.querySelector('#shaderSettings .gui-warning');
  if (progress && shaderLoadBusy) progress.textContent = text;
}
function setProgramSummary(text, counts = {}) {
  Object.assign(GB.programs, { ready: null, total: null, compute: 0 }, counts, { summary: text });
  announce('programs', GB.programs);
}

function showProgramStates(states = new Map()) {
  GB.hooks.noteCompilation(states, displayedProgramNames);
  GB.programs.list = [...displayedProgramNames].map(name => ({ name, state: states.get(name) || 'waiting' }));
  announce('programs', GB.programs);
}
