// ui starts here, all panels sit on top of the canvas and only poke the engine thru GBufferd
const params = new URLSearchParams(location.search);
const gbufferd = window.GBufferd;
if (!gbufferd || gbufferd.hosted) return;
gbufferd.viewerUI = true;
const $ = (selector, root = document) => root.querySelector(selector);
const settings = $('#shaderSettings');
const engine = () => window.GBufferd?.engine;
