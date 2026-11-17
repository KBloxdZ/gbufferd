# Embedding GBufferd

GBufferd runs in an iframe on your page. `gbufferd-embed.js` creates that iframe and gives you a small promise
based API to drive it: load packs, set time and weather, move the camera, take screenshots, listen to status.

## Quick start

Put `gbufferd-webgpu.html` and `gbufferd-embed.js` next to your page (both are in the repository root, or in
`dist/` after `node build.mjs`).

```html
<div id="viewer" style="width: 960px; height: 540px"></div>

<script src="gbufferd-embed.js"></script>
<script>
  const viewer = GBufferd.embed('#viewer', {
    src: 'gbufferd-webgpu.html',
    pack: 'packs/MyShaders.zip',
    ui: false,
  });

  viewer.on('status', status => console.log(status.message));
</script>
```

That's all. The viewer fills the element you give it, so size the element.

A complete page with buttons for every call is in [`examples/embed.html`](../examples/embed.html).

## Options

`GBufferd.embed(target, options)` takes an element or a CSS selector and returns a viewer.

| Option | Default | |
|---|---|---|
| `src` | `'gbufferd-webgpu.html'` | where the GBufferd page is, relative to your page or absolute |
| `pack` | none | a pack to load right away: URL, `File`, `Blob` or `ArrayBuffer`. `'builtin'` loads the built-in pack, if the build has one |
| `ui` | `true` | `false` hides the toolbar, the hotbar and the crosshair |
| `dimension` | `'overworld'` | `'overworld'`, `'nether'` or `'end'` |
| `time` | | world time in ticks at the start (0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight) |
| `weather` | `'clear'` | `'clear'`, `'rain'` or `'thunder'` |
| `yaw`, `pitch` | | start direction of the camera, in radians |
| `title` | `'GBufferd'` | title of the iframe, for screen readers |

Without `pack` the viewer starts with the vanilla look and waits.

## Methods

Every method returns a promise. Calls made before the viewer is ready wait for it.

| Method | Result | |
|---|---|---|
| `loadPack(source, label?)` | load result | `source` is a URL, `File`, `Blob`, `ArrayBuffer` or `Uint8Array`. URLs are fetched by your page, so packs from other servers work as long as they send CORS headers. The result has `ok`, `programs` and `failures` |
| `loadBuiltin()` | load result | loads the built-in pack; fails when the build has none |
| `setTime(ticks)` | ticks | world time, 0 to 23999 |
| `setWeather(kind)` | kind | `'clear'`, `'rain'`, `'thunder'`; rain fades in like in the game |
| `travel(dimension)` | dimension | `'overworld'`, `'nether'`, `'end'` |
| `getCamera()` | `{x, y, z, yaw, pitch}` | |
| `setCamera({x, y, z, yaw, pitch})` | camera | every field is optional; the camera switches to flying so it stays where you put it |
| `screenshot(type?)` | `Blob` | waits until the pack's pipelines are built, then returns a PNG (or `'image/jpeg'`, `'image/webp'`) |
| `showUI(show)` | `show` | toolbar, hotbar and crosshair on or off |
| `openSettings(open?)` | `open` | the pack's settings screen |
| `getState()` | state | see below |
| `destroy()` | | removes the iframe and rejects calls that are still running |

The state looks like this:

```js
{
  ready: true,
  busy: false,                 // a pack is loading
  pack: 'MyShaders.zip',
  status: { type: 'loaded', pack: 'MyShaders.zip', profile: 'HIGH', programs: 31, compute: 0, message: '...', kind: 'good' },
  programs: { ready: 31, total: 31, compute: 0, summary: '31/31 shader programs compiled', list: [{ name: 'gbuffers_terrain', state: 'ready' }, ...] },
  dimension: 'overworld',
  hasBuiltin: false,
}
```

## Events

`viewer.on(name, listener)` returns a function that removes the listener again (`viewer.off(name, listener)` works
too). Every detail is plain JSON.

| Event | Detail | When |
|---|---|---|
| `ready` | state (see above) | the renderer is up, calls go through from now on |
| `status` | a status object, see below | starting, loading, compiling, loaded, errors, toggled settings |
| `programs` | `{ready, total, compute, summary, list}` | the shader programs of the pack and their state |
| `pack` | label | a pack was loaded |
| `busy` | `true` / `false` | loading starts or ends |
| `error` | `Error` | the `pack` option failed to load |

### Status objects

Every status has `type`, `kind` (`''`, `'good'` or `'bad'`) and `message` (an English line for people). The other
fields depend on `type`:

| `type` | Fields | |
|---|---|---|
| `starting` | `step?` | WebGPU and the shader compiler start; `step: 'world-ready'` when the world is built |
| `idle` | | running, no pack loaded |
| `loading` | `step` | `'open'`, `'pack-textures'`, `'custom-textures'` |
| `compiling` | `step`, `program`, `detail`, `ready`, `total`, `cached`, `workers`, `maxWorkers` | one update per shader step. `step` is `'start'`, `'cache'`, `'shared'`, `'translate'`, `'compile'` or `'apply'`; `ready`/`total` count the pack's programs; `cached` how many came from the cache |
| `loaded` | `pack`, `profile`, `programs`, `compute` | the pack runs |
| `error` | `pack?`, `dimension?`, `fatal?` | something failed; `fatal: true` means the GPU is gone and the page has to reload |
| `notice` | `setting?`, `on?`, `value?` | a key toggled something (flying, debug view, shadow culling) |

A progress bar from it:

```js
viewer.on('status', status => {
  if (status.type === 'compiling' && status.total) bar.value = status.ready / status.total;
  if (status.type === 'loaded') bar.hidden = true;
  if (status.type === 'error') showError(status.message);
});
```

Program states in `programs.list` are `'waiting'`, `'compiling'`, `'ready'`, `'empty'`, `'skipped'` or `'failed'`.

## Examples

Load a pack the user picks:

```js
input.addEventListener('change', () => viewer.loadPack(input.files[0]));
```

A sunset screenshot:

```js
await viewer.loadPack('packs/MyShaders.zip');
await viewer.setTime(12000);
await viewer.setCamera({ x: 100, y: 80, z: 60, yaw: 4.7, pitch: -0.2 });
const png = await viewer.screenshot();
image.src = URL.createObjectURL(png);
```

Show loading progress:

```js
viewer.on('busy', busy => spinner.hidden = !busy);
viewer.on('status', status => label.textContent = status.message);
```

## Things to know

- The browser needs WebGPU (Chrome or Edge on desktop). Without it the status says so.
- Open your page over `http://` or `https://`, not as a `file://` page, or the iframe can't load.
- The first pack takes a few seconds: every shader is translated to WGSL in the browser. The same pack loads
  much faster the second time, because compiled shaders are cached.
- Clicking into the viewer captures the mouse (WASD to move, like in the game). Esc releases it.

## Deep integration for games

`gbufferd-embed.js` is for showing packs. A game that wants GBufferd to render *its own* world (blocks, entities,
camera, light) uses the host hooks in `src/host-api.js` instead: the game page sets `window.gbufferdHost` before the
GBufferd page loads (or the iframe's parent has it), and GBufferd calls the game's functions for geometry, collision,
sky light, fog and so on. Every hook has a default that does nothing, so a host only fills in what it needs. The
full list of hooks is the `defaults` object at the top of `src/host-api.js`.
