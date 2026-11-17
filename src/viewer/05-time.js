let dragging = false;
const clockText = ticks => {
  const hours = (Math.floor(ticks / 1000) + 6) % 24,
    minutes = Math.floor(((ticks % 1000) * 60) / 1000);
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
};
const scenes = [...root.querySelectorAll('.cx-scene')];
const wrapTicks = ticks => ((Math.round(ticks) % 24000) + 24000) % 24000;
const phaseName = t => (t >= 23000 || t < 1000 ? 'Sunrise' : t < 11000 ? 'Day' : t < 13000 ? 'Sunset' : 'Night');
const showTime = raw => {
  const ticks = wrapTicks(raw),
    night = ticks >= 12800 && ticks < 23200;
  $('[data-clock]', root).textContent = clockText(ticks);
  $('[data-ticks]', root).textContent = ticks;
  $('[data-phase]', root).textContent = phaseName(ticks);
  range.style.setProperty('--a', ((ticks - 6000) / 24000) * 360 + 'deg');
  range.dataset.night = String(night);
  range.setAttribute('aria-valuenow', String(ticks));
  range.setAttribute('aria-valuetext', clockText(ticks) + ', ' + ticks + ' ticks, ' + phaseName(ticks));
  for (const s of scenes) {
    const d = wrapTicks(ticks - Number(s.dataset.time));
    s.setAttribute('aria-pressed', String(d < 500 || d > 23500));
  }
};
const setTime = raw => {
  const ticks = wrapTicks(raw);
  try {
    engine()?.setWorldTime?.(ticks);
  } catch {}
  showTime(ticks);
};
const dialTicks = event => {
  const r = range.getBoundingClientRect(),
    x = event.clientX - (r.left + r.width / 2),
    y = event.clientY - (r.top + r.height / 2);
  let angle = (Math.atan2(x, -y) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return wrapTicks((angle / 360) * 24000 + 6000);
};
range.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  dragging = true;
  range.setPointerCapture(event.pointerId);
  range.focus();
  setTime(dialTicks(event));
  event.preventDefault();
});
range.addEventListener('pointermove', event => {
  if (dragging) setTime(dialTicks(event));
});
const release = () => {
  dragging = false;
};
range.addEventListener('pointerup', release);
range.addEventListener('pointercancel', release);
range.addEventListener('lostpointercapture', release);
range.addEventListener(
  'wheel',
  event => {
    event.preventDefault();
    setTime(Number(range.getAttribute('aria-valuenow')) + (event.deltaY > 0 ? -250 : 250));
  },
  { passive: false },
);
range.addEventListener('keydown', event => {
  const now = Number(range.getAttribute('aria-valuenow')),
    step = event.shiftKey ? 1000 : 100;
  const next = {
    ArrowRight: now + step,
    ArrowUp: now + step,
    ArrowLeft: now - step,
    ArrowDown: now - step,
    PageUp: now + 1000,
    PageDown: now - 1000,
    Home: 0,
    End: 18000,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  setTime(next);
});
for (const preset of scenes)
  preset.addEventListener('click', () => {
    setTime(Number(preset.dataset.time));
    preset.blur();
  });
