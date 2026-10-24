// The benchmark page: ?lib=<adapter>&scene=<idle|content|move|scroll|many>&n=<glass count>
// Sets window.benchReady once the library has drawn, and runs the scene's animation from then on.
const q = new URLSearchParams(location.search);
const lib = q.get('lib'), scene = q.get('scene'), n = Number(q.get('n') || 4);
const scrolls = scene === 'scroll' || scene === 'many';
if (scrolls) document.body.classList.add('scrolls');

const root = document.createElement('div');
root.id = 'root';
document.body.append(root);
const img = Object.assign(document.createElement('img'), { className: 'bg', src: '../demo/assets/coast.jpg', alt: '' });
root.append(img);
const counter = Object.assign(document.createElement('div'), { className: 'counter', textContent: '0' });
counter.dataset.dynamic = '';
root.append(counter);
if (scrolls) {
  const article = document.createElement('div');
  article.className = 'article';
  const pics = ['ponds', 'alps', 'night', 'coast'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('p');
    p.textContent = 'Liquid glass bends what is behind it. As the page scrolls, every line of this text and every photo passes under the glass and bends at its rim. '.repeat(2);
    article.append(p);
    if (i % 3 === 0) article.append(Object.assign(document.createElement('img'), { src: `../demo/assets/${pics[(i / 3) % 4]}.jpg`, alt: '' }));
  }
  root.append(article);
}

// The glass: 4 panels of 300×160, radius 40 (the scenes from Libre Hub's measurements), or n capsules 200×64.
const boxes = [];
if (scene === 'many') {
  const cols = n > 10 ? 6 : 5;
  for (let i = 0; i < n; i++) boxes.push([40 + (i % cols) * 190, 60 + Math.floor(i / cols) * 120, 170, 64, 32]);
} else {
  for (const [x, y] of [[60, 80], [440, 80], [60, 420], [440, 420]]) boxes.push([x, y, 300, 160, 40]);
}
const glass = boxes.map(([x, y, w, h, r], i) => {
  const el = document.createElement('div');
  el.className = 'glass';
  if (i === boxes.length - 1 && scene === 'move') el.id = 'mover';
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${r}px` });
  el.dataset.radius = r;
  root.append(el);
  return el;
});

await img.decode();
await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
const adapter = (await import(`./adapters/${lib}.js`)).default;
const info = (await adapter(glass, { root, counter, scene })) ?? {};
window.benchInfo = info;
await new Promise((r) => setTimeout(r, 1500));

// the scenes
if (scene === 'content') {
  let i = 0;
  setInterval(() => (counter.textContent = String(++i)), 100);
}
if (scene === 'move') {
  const m = document.getElementById('mover');
  let t = 0;
  const f = () => {
    t += 1 / 60;
    m.style.transform = `translateX(${Math.sin(t) * 300}px)`;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
if (scrolls) {
  const max = document.documentElement.scrollHeight - innerHeight;
  let t = 0;
  const f = () => {
    t += 1 / 60;
    scrollTo(0, (0.5 - 0.5 * Math.cos(t * 0.6)) * max);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
window.benchReady = true;
