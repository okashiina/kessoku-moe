// Renders the packaging assets in build/ from the brand SVG and fonts:
//   icon.ico, icon.png            app + installer icon
//   installerSidebar.bmp          NSIS welcome/finish art (164x314)
//   installerHeader.bmp           NSIS page header (150x57)
//
// The outputs are committed, so this only runs when the art changes. Needs
// Playwright's Chromium and ImageMagick (`convert`) for the BMP step:
//   NODE_PATH=$(npm root -g) node scripts/render-assets.cjs
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const ICON_SVG = path.join(ROOT, '..', 'frontend', 'public', 'kessoku-moe-appicon.svg');
const FONTS = path.join(ROOT, 'renderer', 'fonts');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

// ICO with PNG-compressed entries (supported since Windows Vista).
const packIco = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
};

// Inlined as data URLs: a setContent page cannot load file:// fonts.
const fontUrl = (file) =>
  `data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, file)).toString('base64')}`;
const fontFaces = () => `
  @font-face { font-family: Comfortaa; font-weight: 400 700;
    src: url(${fontUrl('comfortaa-latin.woff2')}) format('woff2'); }
  @font-face { font-family: Nunito; font-weight: 400 800;
    src: url(${fontUrl('nunito-latin.woff2')}) format('woff2'); }`;

// The pick from the app icon, without its square background.
const pick = () => {
  const svg = fs.readFileSync(ICON_SVG, 'utf8');
  const defs = svg.match(/<linearGradient id="pick"[\s\S]*?<\/linearGradient>\s*<linearGradient id="shine"[\s\S]*?<\/linearGradient>/)[0];
  const group = svg.match(/<g transform[^>]*>([\s\S]*?)<\/g>/)[1];
  return `<svg viewBox="6 8 112 114" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${group}</svg>`;
};

const art = (width, height, inner) => `<!doctype html><html><head><style>
  ${fontFaces()}
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
  body { position: relative; background: #17141c; font-family: Nunito, sans-serif; color: #f4ecef; }
  .glow { position: absolute; border-radius: 50%; filter: blur(24px); }
  .word { font-family: Comfortaa; font-weight: 700; letter-spacing: -0.01em; }
  .word em { font-style: normal; background: linear-gradient(120deg, #ff7dc2, #ff4d8d 55%, #a24cf0);
    -webkit-background-clip: text; color: transparent; }
</style></head><body>${inner}</body></html>`;

const sidebar = () =>
  art(164, 314, `
  <div class="glow" style="left:-30px;top:40px;width:170px;height:170px;background:rgba(255,77,141,.38)"></div>
  <div class="glow" style="right:-60px;top:120px;width:150px;height:150px;background:rgba(162,76,240,.32)"></div>
  <div class="glow" style="left:10px;bottom:-60px;width:150px;height:120px;background:rgba(245,145,186,.16)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:86px">
    <div style="width:74px;height:74px;filter:drop-shadow(0 10px 18px rgba(155,59,224,.45))">${pick()}</div>
    <div class="word" style="margin-top:18px;font-size:19px">kessoku <em>moe</em></div>
    <div style="margin-top:8px;font-size:10.5px;font-weight:700;color:rgba(244,236,239,.6)">all your anime, one stage.</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:9px;font-weight:700;letter-spacing:.18em;color:rgba(244,236,239,.32)">DESKTOP</div>`);

// The header sits on the right of a white NSIS banner, so keep it light.
const header = () =>
  art(150, 57, `
  <style>body { background: #ffffff; color: #17141c; }</style>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-right:12px">
    <div class="word" style="font-size:14px">kessoku <em>moe</em></div>
    <div style="width:30px;height:30px">${pick()}</div>
  </div>`);

const toBmp = (png, out) => {
  const tmp = `${out}.png`;
  fs.writeFileSync(tmp, png);
  execFileSync('convert', [tmp, '-alpha', 'off', '-type', 'TrueColor', `BMP3:${out}`]);
  fs.unlinkSync(tmp);
};

(async () => {
  fs.mkdirSync(BUILD, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const iconSrc = `data:image/svg+xml;base64,${fs.readFileSync(ICON_SVG).toString('base64')}`;
  const renderIcon = async (size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img src="${iconSrc}" width="${size}" height="${size}" style="display:block"></body></html>`
    );
    return page.screenshot({ omitBackground: true });
  };

  const images = [];
  for (const size of ICO_SIZES) images.push({ size, png: await renderIcon(size) });
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), packIco(images));
  fs.writeFileSync(path.join(BUILD, 'icon.png'), await renderIcon(512));

  const shoot = async (html, width, height) => {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return page.screenshot();
  };
  toBmp(await shoot(sidebar(), 164, 314), path.join(BUILD, 'installerSidebar.bmp'));
  toBmp(await shoot(header(), 150, 57), path.join(BUILD, 'installerHeader.bmp'));

  await browser.close();
  console.log('assets written to build/');
})();
