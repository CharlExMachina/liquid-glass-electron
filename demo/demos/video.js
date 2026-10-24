import { glass } from '../../dist/liquid-glass.js';
import { css, h, icon, ready, sleep } from './lib.js';

// Glass over video: the player's controls and a lens bend each frame as it plays. No capture: the compositor bends
// what it's drawing anyway.
export default {
  title: 'Over video',
  async render(stage) {
    css('video');
    const video = h('video.video-bg', { src: 'assets/orbit.webm', muted: true, loop: true, playsinline: true });
    video.muted = true;
    const fill = h('i'), time = h('time', { text: '0:00' });
    const play = h('button', { 'aria-label': 'Pause' }, icon('pause'));
    play.addEventListener('click', () => {
      if (video.paused) video.play();
      else video.pause();
      play.replaceChildren(icon(video.paused ? 'play' : 'pause'));
    });
    video.addEventListener('timeupdate', () => {
      fill.style.width = `${(video.currentTime / (video.duration || 1)) * 100}%`;
      time.textContent = `0:${String(Math.floor(video.currentTime)).padStart(2, '0')}`;
    });
    const player = h('div.player', {}, play, h('div.bar', {}, fill), time, h('button', { 'aria-label': 'Volume' }, icon('volume')));
    const title = h('div.video-title', {}, h('b', { text: 'Earth from the ISS' }), h('span', { text: 'NASA, High Definition Earth Viewing' }));
    const lens = h('div.lens-badge');
    stage.append(h('div.scene', {}, video, title, lens, player));
    await ready(video);
    video.play();
    const handles = [glass(player, { variant: 'regular', shape: 'capsule', zRadius: 26 }), glass(title, { variant: 'regular', cornerRadius: 20 }),
      glass(lens, { shape: 'circle', bevelMode: 1, refraction: 0.6, zRadius: 60 }), ...[...player.querySelectorAll('button')].map((b) => glass(b, { shape: 'circle', zRadius: 14, refraction: 0.4, interactive: true }))];
    return () => {
      video.pause();
      handles.forEach((g) => g.destroy());
    };
  },
  async play() {
    await sleep(6000);
  },
};
