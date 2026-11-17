// put gbufferd on any page: GBufferd.embed('#box', { pack: 'my-pack.zip' }). the renderer lives in an iframe,
// evry method here just sends a postMessage and waits for the answer
(() => {
  const CALL_TIMEOUT = 10 * 60 * 1000;

  class GBufferdViewer {
    constructor(target, options = {}) {
      const host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) throw new Error('GBufferd.embed: no element ' + target);
      this.options = { src: 'gbufferd-webgpu.html', ui: true, ...options };
      this.listeners = new Map();
      this.pending = new Map();
      this.nextId = 1;
      this.state = null;

      const url = new URL(this.options.src, location.href);
      url.searchParams.set('embed', '1');
      if (!this.options.ui) url.searchParams.set('noui', '1');
      for (const key of ['dimension', 'time', 'weather', 'yaw', 'pitch'])
        if (this.options[key] !== undefined) url.searchParams.set(key, String(this.options[key]));

      this.iframe = document.createElement('iframe');
      this.iframe.src = url.href;
      this.iframe.title = this.options.title || 'GBufferd';
      this.iframe.allow = 'fullscreen';
      this.iframe.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#090b0d';
      host.append(this.iframe);

      this.onMessage = event => {
        if (event.source !== this.iframe.contentWindow || !event.data?.gbufferd) return;
        const message = event.data;
        if (message.gbufferd === 'reply') {
          const call = this.pending.get(message.id);
          if (!call) return;
          this.pending.delete(message.id);
          clearTimeout(call.timer);
          if ('error' in message) call.reject(new Error(message.error));
          else call.resolve(message.result);
        } else if (message.gbufferd === 'event') {
          if (message.name === 'ready') {
            this.state = message.detail;
            this.resolveReady(message.detail);
          }
          this.emit(message.name, message.detail);
        }
      };
      addEventListener('message', this.onMessage);
      this.ready = new Promise(resolve => (this.resolveReady = resolve));

      const pack = this.options.pack;
      if (pack === 'builtin') this.ready.then(() => this.loadBuiltin()).catch(error => this.emit('error', error));
      else if (pack) this.loadPack(pack).catch(error => this.emit('error', error));
    }

    on(name, listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(listener);
      return () => this.off(name, listener);
    }
    off(name, listener) {
      this.listeners.get(name)?.delete(listener);
    }
    emit(name, detail) {
      for (const listener of this.listeners.get(name) || []) {
        try {
          listener(detail);
        } catch (error) {
          console.error(error);
        }
      }
    }

    async call(method, args = [], transfer = []) {
      await this.ready;
      if (!this.iframe) throw new Error('GBufferd viewer was destroyed');
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(method + ' timed out'));
        }, CALL_TIMEOUT);
        this.pending.set(id, { resolve, reject, timer });
        this.iframe.contentWindow.postMessage({ gbufferd: 'call', id, method, args }, '*', transfer);
      });
    }

    // url, File, Blob, ArrayBuffer or Uint8Array. urls get fetched here so cross origin packs work too
    async loadPack(source, label) {
      let bytes = source,
        name = label;
      if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok) throw new Error(source + ': HTTP ' + response.status);
        bytes = await response.arrayBuffer();
        name ??= decodeURIComponent(new URL(source, location.href).pathname.split('/').pop());
      } else if (source instanceof Blob) {
        name ??= source.name;
        bytes = await source.arrayBuffer();
      } else if (ArrayBuffer.isView(source)) {
        bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      }
      if (!(bytes instanceof ArrayBuffer)) throw new Error('loadPack: give it a url, File, Blob or ArrayBuffer');
      return this.call('loadPack', [bytes, name || 'Pack'], [bytes]);
    }
    loadBuiltin() {
      return this.call('loadBuiltin');
    }
    setTime(ticks) {
      return this.call('setTime', [ticks]);
    }
    setWeather(kind) {
      return this.call('setWeather', [kind]);
    }
    travel(dimension) {
      return this.call('travel', [dimension]);
    }
    getCamera() {
      return this.call('getCamera');
    }
    setCamera(camera) {
      return this.call('setCamera', [camera]);
    }
    screenshot(type = 'image/png') {
      return this.call('screenshot', [type]);
    }
    showUI(show = true) {
      return this.call('showUI', [show]);
    }
    openSettings(open = true) {
      return this.call('openSettings', [open]);
    }
    getState() {
      return this.call('getState');
    }
    destroy() {
      removeEventListener('message', this.onMessage);
      for (const call of this.pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error('GBufferd viewer was destroyed'));
      }
      this.pending.clear();
      this.iframe?.remove();
      this.iframe = null;
    }
  }

  window.GBufferd = window.GBufferd || {};
  window.GBufferd.embed = (target, options) => new GBufferdViewer(target, options);
  window.GBufferd.Viewer = GBufferdViewer;
})();
