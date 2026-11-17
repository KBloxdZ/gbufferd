const icons = __include('text', 'assets/icons.json');
const svg = name => icons[name] || '';
const keys = [
  ['Click', 'Capture mouse'],
  ['Esc', 'Release mouse'],
  ['W A S D', 'Move'],
  ['Ctrl', 'Sprint'],
  ['Space', 'Jump'],
  ['2× Space', 'Toggle flight'],
  ['Space / Shift', 'Fly up / down'],
  ['Left click', 'Break block'],
  ['Right click', 'Place block'],
  ['1–9 / Wheel', 'Hotbar'],
  ['F1', 'Toggle HUD'],
  ['F4', 'Pipeline info'],
  ['F8', 'Frame inspector'],
  ['F9', 'Shader errors'],
  ['V / F7', 'Lighting debug'],
  ['K', 'Cinema mode'],
  ['P', 'Save screenshot'],
  ['O', 'Upload shaderpack'],
  ['?', 'Controls'],
];

const root = document.createElement('div');
root.id = 'cx';
root.innerHTML = `
    <div class="cx-rail">
      <header class="cx-title">
        <div class="cx-brand">GBufferd</div>
        <div class="cx-file"><h1 class="cx-pack"></h1><div class="cx-meta"><span data-meta="profile" hidden></span><span data-meta="programs" hidden></span></div></div>
      </header>
      <div class="cx-hud" aria-label="Frame statistics">
        <span><b data-hud="fps">–</b><small>FPS</small></span>
        <span><b data-hud="ms">–</b><small>ms / frame</small></span>
        <span><b data-hud="time">–</b><small>World time</small></span>
        <span><b data-hud="frame">–</b><small>Frame counter</small></span>
      </div>
      <div class="cx-worm" aria-hidden="true"><i></i></div>
      <button type="button" class="cx-btn cx-upload" data-act="open" title="Upload shaderpack (O)">${svg('open')}<span>Upload shaderpack</span></button>
    </div>
    <nav class="cx-dock" aria-label="Viewer tools">
      <button type="button" class="cx-btn" data-act="settings" title="Shader settings">${svg('settings')}<span>Shader settings</span></button>
      <button type="button" class="cx-btn" data-act="time" title="Environment" aria-pressed="false" aria-controls="cx-world">${svg('time')}<span>Environment</span></button>
      <button type="button" class="cx-btn" data-act="pipeline" title="Pipeline info (F4)" aria-pressed="false" aria-controls="cx-passes">${svg('pipeline')}<span>Pipeline info</span></button>
      <details class="cx-more"><summary title="More" aria-label="More">${svg('more')}<span>More</span></summary><div class="cx-menu">
        ${window.GBufferd?.hasBuiltin === false ? '' : `<button type="button" data-act="builtin">${svg('builtin')} Load built-in pack</button><hr>`}
        <button type="button" data-act="photo">${svg('photo')} Save screenshot <kbd>P</kbd></button>
        <button type="button" data-act="film">${svg('film')} Cinema mode <kbd>K</kbd></button>
        <button type="button" data-act="record">${svg('film')} Record buffers (8 s)</button>
        <button type="button" data-act="full" aria-pressed="false">${svg('full')} Fullscreen</button><hr>
        <button type="button" data-act="inspector">${svg('inspector')} Frame inspector <kbd>F8</kbd></button>
        <button type="button" data-act="errors">${svg('errors')} Shader errors <kbd>F9</kbd></button>
        <button type="button" data-act="help" aria-controls="cx-help" aria-pressed="false">${svg('help')} Controls <kbd>?</kbd></button>
      </div></details>
    </nav>
    <div class="cx-status" data-kind=""><i class="cx-dot"></i><span class="cx-msg"></span><button type="button" class="cx-errbtn" hidden>Show errors</button></div>
    <section id="cx-world" class="cx-time cx-env cx-pop" hidden aria-label="Environment">
      <header><h2>Environment</h2><button class="cx-close" type="button" data-act="time" aria-label="Close environment">${svg('close')}</button></header>
      <div class="cx-env-body">
        <div><h3 class="cx-sec">Time</h3>
          <div class="cx-time-grid">
            <div class="cx-dial" role="slider" tabindex="0" aria-label="World time" aria-valuemin="0" aria-valuemax="23999" aria-valuenow="0">
              <div class="cx-dial-face"></div>
              <svg class="cx-dial-marks" viewBox="0 0 212 212" aria-hidden="true"><rect x="105" y="3" width="2" height="8" fill="#fff" opacity="0.75" transform="rotate(0 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(15 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(30 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(45 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(60 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(75 106 106)"/><rect x="105" y="3" width="2" height="8" fill="#fff" opacity="0.75" transform="rotate(90 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(105 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(120 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(135 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(150 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(165 106 106)"/><rect x="105" y="3" width="2" height="8" fill="#fff" opacity="0.75" transform="rotate(180 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(195 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(210 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(225 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(240 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(255 106 106)"/><rect x="105" y="3" width="2" height="8" fill="#fff" opacity="0.75" transform="rotate(270 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(285 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(300 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(315 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(330 106 106)"/><rect x="105" y="5" width="1" height="4" fill="#fff" opacity="0.35" transform="rotate(345 106 106)"/></svg>
              <div class="cx-knob"><i></i><svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><rect width="8" height="8" fill="#e4eaf6"/><rect x="1" y="1" width="1" height="1" fill="#bcc5d9"/><rect x="2" y="1" width="1" height="1" fill="#bcc5d9"/><rect x="1" y="2" width="1" height="1" fill="#a9b3ca"/><rect x="5" y="2" width="1" height="1" fill="#c7cfe0"/><rect x="4" y="4" width="1" height="1" fill="#b3bcd2"/><rect x="5" y="4" width="1" height="1" fill="#a3adc5"/><rect x="4" y="5" width="1" height="1" fill="#bcc5d9"/><rect x="1" y="5" width="1" height="1" fill="#c7cfe0"/><rect x="2" y="6" width="1" height="1" fill="#b3bcd2"/><rect x="6" y="6" width="1" height="1" fill="#c7cfe0"/></svg></div>
              <div class="cx-dial-center"><span class="cx-dial-clock" data-clock>06:00</span><span class="cx-dial-ticks"><span data-ticks>0</span> ticks</span><span class="cx-dial-phase" data-phase>Sunrise</span></div>
            </div>
            <div class="cx-scenes" role="group" aria-label="Time presets"><button type="button" class="cx-scene" data-time="0" aria-pressed="false" aria-label="Morning, 06:00"><img src="@@datauri:assets/images/morning-06-00.jpg@@" alt=""><span class="cx-cap"><b>Morning</b><small>06:00</small></span></button><button type="button" class="cx-scene" data-time="6000" aria-pressed="false" aria-label="Noon, 12:00"><img src="@@datauri:assets/images/noon-12-00.jpg@@" alt=""><span class="cx-cap"><b>Noon</b><small>12:00</small></span></button><button type="button" class="cx-scene" data-time="12000" aria-pressed="false" aria-label="Evening, 18:00"><img src="@@datauri:assets/images/evening-18-00.jpg@@" alt=""><span class="cx-cap"><b>Evening</b><small>18:00</small></span></button><button type="button" class="cx-scene" data-time="18000" aria-pressed="false" aria-label="Night, 00:00"><img src="@@datauri:assets/images/night-00-00.jpg@@" alt=""><span class="cx-cap"><b>Night</b><small>00:00</small></span></button></div>
          </div>
        </div>
        <div><h3 class="cx-sec">Weather</h3><div class="cx-weathers" role="group" aria-label="Weather"><button type="button" class="cx-wx" data-weather="clear" aria-pressed="true"><img src="@@datauri:assets/images/clear.jpg@@" alt=""><span class="cx-cap"><b>Clear</b><small>sun</small></span></button><button type="button" class="cx-wx" data-weather="rain" aria-pressed="false"><img src="@@datauri:assets/images/rain.jpg@@" alt=""><span class="cx-cap"><b>Rain</b><small>showers</small></span></button><button type="button" class="cx-wx" data-weather="thunder" aria-pressed="false"><img src="@@datauri:assets/images/thunder.jpg@@" alt=""><span class="cx-cap"><b>Thunder</b><small>storm</small></span></button></div></div>
      </div>
    </section>
    <aside id="cx-passes" class="cx-drawer cx-pop" hidden aria-label="Pipeline info">
      <header><h2>Pipeline info</h2><div class="cx-panel-actions"><button type="button" class="cx-reset" data-reset>Enable all</button><button class="cx-close" type="button" data-act="pipeline" aria-label="Close pipeline">${svg('close')}</button></div></header>
      <div class="cx-performance"><span>GPU <b data-perf="gpu">–</b> ms</span><span>CPU <b data-perf="cpu">–</b> ms</span><span><b data-perf="draws">–</b> draws</span></div>
      <p class="cx-note" data-profile-note></p>
      <div class="cx-pass-scroll"><table class="cx-pass-table"><thead><tr><th scope="col">Pass</th><th scope="col">GPU ms</th><th scope="col">CPU ms</th><th scope="col">On</th></tr></thead><tbody data-pass-rows></tbody></table></div>
      <details class="cx-costs" open><summary>CPU frame breakdown</summary><div data-cpu-rows></div></details>
      <details class="cx-costs"><summary>GPU transfers & auxiliary passes</summary><div data-overhead-rows></div></details>
      <details class="cx-costs"><summary>Compilation</summary><div class="cx-sum"></div><div class="cx-list"></div></details>
      <p class="cx-note">CPU per pass measures command encoding. Passes may depend on earlier results.</p>
    </aside>
    <section id="cx-help" class="cx-sheet" hidden role="dialog" aria-label="Controls">
      <header><h2>Controls</h2><button class="cx-close" type="button" data-act="help" aria-label="Close controls">${svg('close')}</button></header>
      <div class="cx-keys">${keys.map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join('')}</div>
    </section>
    <aside class="cx-insp" hidden aria-label="Frame inspector"><header>${svg('inspector')}<h2>Frame Inspector</h2><kbd>F8</kbd><button class="cx-close" type="button" data-insp-close aria-label="Close frame inspector">${svg('close')}</button></header><div class="cx-insp-list"></div><div class="cx-dbg-bar" hidden></div></aside>
    <div class="cx-insp-modes" hidden role="group" aria-label="Channel"></div>
    <section class="cx-insp-info" hidden aria-live="polite"></section>
    <div class="cx-insp-cross" hidden></div>
    <div class="cx-dbg-pick" hidden></div><canvas class="cx-dbg-lens" width="165" height="200" hidden></canvas><section class="cx-dbg" hidden aria-label="Pixel debugger"></section><div class="cx-dbg-tip" hidden></div>
    <div class="cx-drop"><strong>Drop a shader ZIP here</strong></div>
    <div class="cx-toast" role="status"></div>`;
document.body.append(root);
const bars = document.createElement('div');
bars.className = 'cx-bars';
bars.innerHTML = '<i></i><i></i>';
document.body.append(bars);
const fpsEl = document.createElement('div');
fpsEl.id = 'cx-fps';
fpsEl.setAttribute('aria-hidden', 'true');
document.body.append(fpsEl);
const filmHint = document.createElement('div');
filmHint.id = 'cx-filmhint';
filmHint.textContent = 'K or Esc to exit cinema mode';
document.body.append(filmHint);
