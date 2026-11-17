// ui starts here, all panels sit on top of the canvas and only poke the engine thru GBufferd
const params = new URLSearchParams(location.search);
if (window.GBufferd?.hosted || params.has('classic')) return;
const $ = (selector, root = document) => root.querySelector(selector);
const message = $('#message'),
  dot = $('#dot'),
  retry = $('#retry'),
  zipInput = $('#zipInput'),
  settingsToggle = $('#settingsToggle');
const programSummary = $('#programSummary'),
  programList = $('#programList'),
  panelTitle = $('.panel h1'),
  settings = $('#shaderSettings');
if (!message || !dot || !retry || !zipInput || !settingsToggle) return;
const engine = () => window.GBufferd?.engine;
