const rail = $('.cx-rail', root),
  dock = $('.cx-dock', root);
const layout = () => {
  const html = document.documentElement,
    dpr = devicePixelRatio || 1;
  const scale = typeof guiScale === 'function' ? guiScale(innerWidth * dpr, innerHeight * dpr) : 1;
  html.style.setProperty('--cx-hotbar-h', (23 * scale) / dpr + 'px');
  if (rail.offsetHeight) root.style.setProperty('--rail-h', rail.offsetHeight + 'px');
  const hotbar = $('#hotbar'),
    shown = hotbar && hotbar.getBoundingClientRect().width > 0 && getComputedStyle(hotbar).display !== 'none';
  const barLeft = innerWidth / 2 - (92 * scale) / dpr;
  const overlaps = () => shown && barLeft < dock.getBoundingClientRect().right;
  dock.classList.remove('cx-compact');
  if (overlaps()) dock.classList.add('cx-compact');
  root.style.setProperty('--dock-bottom', overlaps() ? 'var(--cx-hotbar-h,65px)' : 'env(safe-area-inset-bottom,0px)');
  if (dock.offsetHeight) root.style.setProperty('--dock-h', dock.offsetHeight + 'px');
  const menu = $('.cx-menu', root),
    anchor = more.getBoundingClientRect();
  menu.style.left = anchor.left + 245 > innerWidth - 10 ? 'auto' : '0';
  menu.style.right = anchor.left + 245 > innerWidth - 10 ? '0' : 'auto';
};
const layoutObserver = new ResizeObserver(layout);
layoutObserver.observe(rail);
layoutObserver.observe(dock);
if ($('#hotbar')) layoutObserver.observe($('#hotbar'));
addEventListener('resize', layout);
layout();
const badge = $('#testBadge');
if (badge && document.body.classList.contains('test-mode')) {
  badge.tabIndex = 0;
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-controls', 'cx');
  badge.setAttribute('aria-label', 'Toggle viewer tools');
  const syncTest = () => badge.setAttribute('aria-expanded', String(document.body.classList.contains('test-panel')));
  new MutationObserver(syncTest).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  syncTest();
  badge.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      badge.click();
    }
  });
}
let lastMessage = gbufferd.status?.message || '';
document.addEventListener('gbufferd-status', () => {
  const text = gbufferd.status?.message || '';
  if (document.pointerLockElement && text && text !== lastMessage && text.length < 60) toast(english(text));
  lastMessage = text;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) toastEl.style.opacity = '';
});
