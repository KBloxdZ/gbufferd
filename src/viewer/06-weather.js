const weatherButtons = [...root.querySelectorAll('[data-weather]')];
const showWeather = kind => {
  for (const b of weatherButtons) b.setAttribute('aria-pressed', String(b.dataset.weather === kind));
};
for (const b of weatherButtons)
  b.addEventListener('click', () => {
    let kind = b.dataset.weather;
    try {
      kind = engine()?.setWeather?.(kind) ?? kind;
    } catch {}
    showWeather(kind);
    b.blur();
  });
try {
  showWeather(engine()?.weather?.target || 'clear');
} catch {}
