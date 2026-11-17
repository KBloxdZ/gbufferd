# GBufferd

Iris shader packs in the browser, rendered with WebGPU.

Drop a shader pack zip onto the page and it runs the way Iris runs it: gbuffers, shadow, deferred and composite
passes, compute shaders, geometry and tessellation shaders, SSBOs, custom images and textures, the pack's own
settings screen. Without a pack you get the vanilla look.

## What's in it

- The Iris pipeline on WebGPU: GLSL goes through glslang and naga to WGSL, with the pack's `shaders.properties`,
  block and entity IDs, render target formats, blending, flips and mipmaps.
- A small world to look at: overworld with a river, the Nether, the End with the dragon, weather and time of day.
- **Frame inspector (F8)**: every pass and every buffer it writes, channel views, switching single passes or
  single buffer writes off, and the triangle edges of a pass.
- **Pixel debugger**: pause the frame, pick a pixel and step through the pass's GLSL line by line. Hover variables,
  textures (with the texel that was read) and SSBO contents.
- An API for embedding the renderer in another page (`src/host-api.js`).

## Build

```bash
node build.mjs
```

The result is one self-contained file, `dist/gbufferd-webgpu.html`. It needs Node 18 or newer and nothing else.
Open the file in a browser with WebGPU (Chrome, Edge).

## Layout

| Folder | |
|---|---|
| `src/index.html` | the page, with placeholders the build fills in |
| `src/engine/` | the renderer, in order: world, dimensions, debugger, GLSL conversion, the WebGPU layer, render targets, uniforms, pack loading |
| `src/viewer/` | the toolbar, environment panel, frame inspector and pixel debugger |
| `src/glsl-preprocessor.js` | the GLSL preprocessor (`#include`, `#if`, macros) |
| `assets/` | textures, images and the GUI font |
| `vendor/` | the bundled shader compiler (glslang, naga) and its license notices |

The build joins the `.js` files of a folder in name order. Placeholders in the sources:

| Placeholder | Becomes |
|---|---|
| `@@text:path@@` | the file's text (placeholders inside it are filled in too) |
| `@@concat:folder@@` | all `.js` files of the folder |
| `@@datauri:path@@` | the file as a `data:` URI |
| `@@base64:path@@` | the file as base64, empty when the file is missing |
| `@@jsonstring:path@@` | the file's text as a JSON string |

## Built-in pack

The page can load a built-in pack from `assets/packs/builtin-pack.zip`. That file is not part of the repository,
because shader packs come with their own licenses. Put a pack there before building if you want one.

## Third-party code

The shader compiler in `vendor/` contains glslang, naga and their dependencies; their licenses are in
`vendor/third-party-notices.json` and are shipped inside the built page. Icons are from Font Awesome Free
(CC BY 4.0). JSZip and CodeMirror are loaded from a CDN.
