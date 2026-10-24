# Using liquid-glass-electron in an Electron app

## Loading it

The library is one ES module with no dependencies, `dist/liquid-glass.js` (and `dist/liquid-glass.iife.js`, which sets
`window.LiquidGlass`, for a classic script tag). It runs in the renderer and needs nothing from Node, so it works in a
sandboxed, context-isolated renderer with no preload.

With a bundler (Vite, webpack, esbuild, electron-forge's templates):

```js
import { glass, autoGlass } from 'liquid-glass-electron';
```

Without one, point a module script at the file. From `src/renderer/index.html` in a project root:

```html
<script type="module">
  import { autoGlass } from '../../node_modules/liquid-glass-electron/dist/liquid-glass.js';
  autoGlass();
</script>
```

If the app is packaged with `node_modules` outside the renderer's reach (an `app://` protocol that only serves `src/`, or
an asar that leaves dev dependencies out), copy `dist/liquid-glass.js` next to your renderer files in the build step
instead.

## Content-Security-Policy

The library adds no inline scripts or `<style>` elements: it styles elements through the CSSOM and adds its few rules as a
constructed stylesheet, which `style-src 'self'` allows. Its maps and light are images in `data:` URLs, so `img-src` needs
`data:`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:">
```

The demo gallery runs under exactly this policy, sandboxed and context-isolated.

## The system's settings

The glass follows the page's `prefers-color-scheme`, `prefers-reduced-transparency`, `prefers-contrast` and
`prefers-reduced-motion`. Chromium reports what the OS tells it, which on Linux is little. The main process knows more:

```js
// main.js
import { ipcMain, nativeTheme, systemPreferences } from 'electron';
ipcMain.handle('glass-environment', () => ({
  dark: nativeTheme.shouldUseDarkColors,
  reduceTransparency: nativeTheme.prefersReducedTransparency,
  increaseContrast: nativeTheme.shouldUseHighContrastColors,
  reduceMotion: process.platform === 'win32' || process.platform === 'darwin'
    ? !systemPreferences.getAnimationSettings().shouldRenderRichAnimation : undefined,
}));
nativeTheme.on('updated', () => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('glass-environment-changed');
});
```

```js
// preload.js
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('glassEnvironment', {
  get: () => ipcRenderer.invoke('glass-environment'),
  onChange: (fn) => ipcRenderer.on('glass-environment-changed', fn),
});
```

```js
// renderer
import { setEnvironment } from 'liquid-glass-electron';
const sync = async () => setEnvironment(await window.glassEnvironment.get());
sync();
window.glassEnvironment.onChange(sync);
```

Apple's Clear/Tinted setting has no OS API to read on any platform, so an app offers it as its own setting:
`document.documentElement.dataset.glassAppearance = 'tinted'` (or `setEnvironment({ appearance: 'tinted' })`).

## Three CSS rules to design around

1. **Glass inside glass only sees the outer glass's own painting**, not what's behind it: the element with the backdrop
   filter is the inner one's backdrop root. Apple's rule is the same (don't stack glass on glass). Put controls on a glass
   bar as plain elements, or give them `refraction: 0` (light and fill, no bending).
2. **An ancestor with `opacity` below 1, a `filter`, a `mask`, `clip-path` or `mix-blend-mode` turns the bending off**
   inside it. Fade glass with its own opacity, not a wrapper's.
3. **The glass draws its light with `border-image`**, so a glass element's own border isn't drawn (its width still lays
   out). Use `edgeHighlight` instead of a border.

## Linux notes

- Video under glass: Chromium's hardware video decode crashed the GPU process on the Mesa (AMD) machine this was built on,
  which takes every backdrop filter with it. If you see that, `app.commandLine.appendSwitch('disable-accelerated-video-decode')`.
  It isn't specific to this library.
- To place test windows on a given monitor under Wayland, run Electron with `--ozone-platform=x11`.
