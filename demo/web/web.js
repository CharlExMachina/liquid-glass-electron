// The glass in any browser: every glass element here names the picture behind it (backdropSource). Chromium doesn't
// need it and bends whatever is behind; Safari and Firefox bend that picture with a shader (src/webgl.ts).
import { autoGlass, glassOf, setEnvironment } from '../../dist/liquid-glass.js';

const $ = (id) => document.getElementById(id);
const photo = $('photo'), film = $('film');
let source = photo;
setEnvironment({ dark: true });
document.documentElement.dataset.glassTheme = 'dark';
autoGlass('[data-glass]', { backdropSource: source });

const glasses = () => [...document.querySelectorAll('[data-glass]')].map((el) => glassOf(el)).filter(Boolean);
const shader = () => !!document.querySelector('canvas[data-lg-layer="backdrop"]');
const say = () => { $('how').textContent = shader() ? 'bent by a shader, over the named picture' : 'bent by the compositor'; };
requestAnimationFrame(() => requestAnimationFrame(say));

$('source').onclick = async () => {
  const video = source === photo;
  source = video ? film : photo;
  film.hidden = !video;
  photo.hidden = video;
  if (video) await film.play().catch(() => {});
  else film.pause();
  for (const g of glasses()) g.set({ backdropSource: source });
  $('source').textContent = video ? 'Photo' : 'Video';
};
$('variant').onclick = () => {
  const card = document.querySelector('.card'), clear = card.dataset.glass === 'regular';
  card.dataset.glass = clear ? 'clear' : 'regular';
  $('variant').textContent = clear ? 'Regular' : 'Clear';
};
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.glassTheme !== 'dark';
  document.documentElement.dataset.glassTheme = dark ? 'dark' : 'light';
  setEnvironment({ dark });
  $('theme').textContent = dark ? 'Light' : 'Dark';
};
