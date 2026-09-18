const KEY = 'psnl-content-v3';
const MAX_VIDEO = 15;
export const HERO_H = 78;
export const IDB_HERO = 'idb:hero';
export const IDB_LOGO = 'idb:logo';
let data;
let page = 'home';
let stayFrozen = false;
let blobUrl = '';
let logoBlobUrl = '';
const fileUrls = new Map();
const heroUrls = new Map();

const $ = id => document.getElementById(id);
const isAdmin = () => sessionStorage.getItem('admin') === '1';
const isEditing = () => isAdmin() && sessionStorage.getItem('preview') !== '1';
export const isTile = i => i.type === 'box' || i.type === 'button' || i.type === 'shape';
export const isSolid = i => i && (i.type === 'box' || i.type === 'button' || i.type === 'file' || i.type === 'shape');
export const isCanvas = i => isSolid(i) || i?.type === 'text';

const GAP = 1.2;

export function overlap(a, b) {
  if (!isSolid(a) || !isSolid(b) || a.id === b.id) return false;
  if (a.group && a.group === b.group) return false;
  return a.x < b.x + (b.w || 0) + GAP && b.x < a.x + (a.w || 0) + GAP &&
    a.y < b.y + (b.h || 0) + GAP && b.y < a.y + (a.h || 0) + GAP;
}

export function findSpot(item, items) {
  if (!isSolid(item)) return;
  const others = items.filter(i => isSolid(i) && i.id !== item.id);
  const fits = (x, y) => {
    const next = { ...item, x, y };
    return !others.some(o => overlap(next, o));
  };
  item.x = Number(item.x) || 0;
  item.y = Number(item.y) || 0;
  item.w = Number(item.w) || 16;
  item.h = Number(item.h) || 12;
  if (fits(item.x, item.y)) return;
  const maxX = Math.max(0, 100 - item.w);
  const startY = Math.max(0, item.y);
  for (let y = startY; y < startY + 240; y += 2) {
    const x0 = y === startY ? item.x : 0;
    for (let x = x0; x <= maxX; x += 2) {
      if (fits(x, y)) {
        item.x = x;
        item.y = y;
        return;
      }
    }
  }
  for (let y = 0; y < startY; y += 2) {
    for (let x = 0; x <= maxX; x += 2) {
      if (fits(x, y)) {
        item.x = x;
        item.y = y;
        return;
      }
    }
  }
}

export function pack(item, items) {
  findSpot(item, items);
}

function migrateTile(i) {
  if (!i || i.type === 'section') return;
  if (i.linkOn == null && isTile(i)) i.linkOn = false;
  if (i.x != null && i.w != null) {
    i.x = Number(i.x); i.y = Number(i.y); i.w = Number(i.w); i.h = Number(i.h);
    return;
  }
  if (isTile(i) && i.c != null) {
    i.x = (i.c / COLS) * 100;
    i.y = Math.max(0, (i.r || 0) * 8);
    i.w = Math.max(8, ((i.cw || 3) / COLS) * 100);
    i.h = Math.max(6, (i.ch || 3) * 8);
    return;
  }
  if (isTile(i)) {
    i.x = i.x ?? 8;
    i.y = i.y ?? 8;
    i.w = i.w ?? 22;
    i.h = i.h ?? 24;
  }
}

export function getData() { return data; }
export function slug() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index.html') return 'home';
  return decodeURIComponent(p.slice(1));
}
export async function go(href, e) {
  if (e) e.preventDefault();
  if (!href) return;
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) { location.href = href; return; }
  const next = slugFromPath(url.pathname);
  if (page === 'home' && next !== 'home') pauseHero(true);
  history.pushState(null, '', url.pathname === '/' ? '/' : url.pathname);
  await render();
}
function slugFromPath(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/' || p === '/index.html' ? 'home' : decodeURIComponent(p.slice(1));
}

export async function load() {
  try {
    localStorage.removeItem('psnl-content');
    localStorage.removeItem('psnl-content-v2');
  } catch {}
  let published = null;
  try {
    const r = await fetch('/api/content', { cache: 'no-store' });
    if (r.ok) published = await r.json();
  } catch {}
  if (!published?.pages) {
    try {
      published = await fetch('data/content.json', { cache: 'no-store' }).then(r => r.json());
    } catch {
      published = null;
    }
  }
  let local = null;
  try {
    const raw = localStorage.getItem(KEY);
    local = raw && raw.length < 1500000 ? JSON.parse(raw) : null;
  } catch {
    local = null;
  }
  const hasLive = Number(published?.publishedAt) > 0;
  const localDraft = isAdmin() && local?.pages && (!hasLive || (Number(local.updatedAt) || 0) > Number(published.publishedAt));
  data = localDraft ? local : (published?.pages ? published : local);
  if (!data?.pages) {
    data = await fetch('data/content.json', { cache: 'no-store' }).then(r => r.json());
  }
  if (published?.heroes?.length && data?.heroes) {
    published.heroes.forEach(pub => {
      if (!pub?.id || !/^https?:\/\//.test(pub.src || '')) return;
      const h = data.heroes.find(x => x.id === pub.id);
      if (!h) return;
      if (!h.src || h.src.startsWith('idb:')) {
        h.src = pub.src;
        if (pub.type) h.type = pub.type;
      }
    });
  }
  if (published?.media && !localDraft) await hydrateMedia(published.media);
  if (data) delete data.media;
  migrateHeroes(data);
  if (!data.store) data.store = { items: [], pages: [] };
  if (!data.store.items) data.store.items = [];
  if (!data.store.pages) data.store.pages = [];
  if (!data.brand) data.brand = { mode: 'name', logo: '', links: 'left' };
  if (data.brand.mode !== 'logo') data.brand.mode = 'name';
  if (!['left', 'center', 'right'].includes(data.brand.links)) data.brand.links = 'left';
  if (data.theme !== 'light') data.theme = 'dark';
  Object.values(data.pages).forEach(p => {
    (p.items || []).forEach(migrateTile);
  });
  if (!(data.layout >= 2)) {
    Object.values(data.pages).forEach(p => {
      (p.items || []).forEach(i => {
        if (i.y != null) i.y += 72;
      });
    });
    data.layout = 2;
  }
  Object.values(data.pages).forEach(p => {
    (p.items || []).forEach(i => { if (isSolid(i)) findSpot(i, p.items || []); });
  });
}

export function getHeroes() {
  migrateHeroes(data);
  return data.heroes;
}

function migrateHeroes(d) {
  if (!d) return;
  if (!Array.isArray(d.heroes) || !d.heroes.length) {
    const h = d.hero || { type: 'image', src: '', layers: [], on: true };
    d.heroes = [{ ...h, id: h.id || 'h1', on: h.on !== false }];
  }
  d.heroes.forEach((h, i) => {
    if (!h.id) h.id = 'h' + (i + 1);
    if (h.on == null) h.on = true;
    if (!h.layers) h.layers = [];
    if (h.h == null) h.h = HERO_H;
    if (h.y == null) h.y = i * (h.h || HERO_H);
    migrateHero(h);
  });
  d.hero = d.heroes[0];
}

function migrateHero(h) {
  if (h.layers?.length) return;
  h.layers = [
    { id: 'title', kind: 'title', text: h.title || data.site || '', x: 10, y: 36, w: 80, h: 18, color: '#ffffff' }
  ];
  if (h.sub) h.layers.push({ id: 'sub', kind: 'text', text: h.sub, x: 15, y: 54, w: 70, h: 8, color: '#e8e8e8' });
  if (h.cta) h.layers.push({ id: 'cta', kind: 'cta', text: h.cta, href: h.ctaHref || '/work', x: 38, y: 58, w: 24, h: 9, color: '#ffffff' });
}

export function saveLocal() {
  if (!data) return;
  data.updatedAt = Date.now();
  const copy = { ...data };
  delete copy.media;
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
  } catch {}
}

function blobToData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function dataUrlToFile(rec, key) {
  const dataUrl = rec.data || rec;
  const [head, body] = String(dataUrl).split(',');
  const mime = rec.type || (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const bin = atob(body || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], rec.name || key, { type: mime });
}

async function hydrateMedia(media) {
  if (!media) return;
  for (const [key, rec] of Object.entries(media)) {
    if (!rec || !(rec.data || typeof rec === 'string' && rec.startsWith('data:'))) continue;
    const file = dataUrlToFile(typeof rec === 'string' ? { data: rec } : rec, key);
    if (key === 'logo') await putLogoFile(file);
    else await putMedia(key, file);
  }
}

function mediaExt(file, kind) {
  const t = (file?.type || '').toLowerCase();
  const n = String(file?.name || '').toLowerCase();
  if (t.includes('webm') || n.endsWith('.webm')) return 'webm';
  if (t.includes('quicktime') || n.endsWith('.mov')) return 'mov';
  if (t.includes('ogg') && t.startsWith('video')) return 'ogv';
  if (t.includes('png') || n.endsWith('.png')) return 'png';
  if (t.includes('webp') || n.endsWith('.webp')) return 'webp';
  if (t.includes('gif') || n.endsWith('.gif')) return 'gif';
  if (t.includes('jpeg') || t.includes('jpg') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
  if (t.includes('pdf') || n.endsWith('.pdf') || kind === 'pdf') return 'pdf';
  if (kind === 'video' || t.startsWith('video/')) return 'mp4';
  if (t.startsWith('image/')) return 'jpg';
  return 'bin';
}

async function uploadLiveFile(pathname, file, password) {
  const tokenRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password,
      pathname,
      contentType: file.type || 'application/octet-stream'
    })
  });
  const tokenOut = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenOut.uploadUrl) {
    throw new Error(tokenOut.error || 'Could not start media upload');
  }
  const put = await fetch(tokenOut.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'x-content-type': file.type || 'application/octet-stream'
    }
  });
  if (!put.ok) throw new Error('Media upload failed');
  const info = await put.json().catch(() => ({}));
  return info.url || tokenOut.publicUrl;
}

async function collectMedia() {
  return {};
}

async function publishHostedFiles(payload) {
  const password = data.password;
  for (const h of payload.heroes || []) {
    if (h.src && /^https?:\/\//.test(h.src)) continue;
    const key = heroMediaKey(h);
    const file = key
      ? await getMedia(key).catch(() => null) || (key === 'hero' ? await getHeroFile().catch(() => null) : null)
      : null;
    if (!file) continue;
    try {
      const pathname = `psnl/hero/${h.id}.${mediaExt(file, h.type)}`;
      const url = await uploadLiveFile(pathname, file, password);
      if (!url) continue;
      h.src = url;
      const live = (data.heroes || []).find(x => x.id === h.id);
      if (live) live.src = url;
    } catch {}
  }
  for (const page of Object.values(payload.pages || {})) {
    for (const item of page.items || []) {
      if (item.type !== 'file' || !item.fileId) continue;
      if (item.fileUrl && /^https?:\/\//.test(item.fileUrl)) continue;
      const file = await getMedia(item.fileId).catch(() => null);
      if (!file) continue;
      try {
        const pathname = `psnl/file/${item.id}.${mediaExt(file)}`;
        const url = await uploadLiveFile(pathname, file, password);
        if (!url) continue;
        item.fileUrl = url;
        const live = findItemById(item.id);
        if (live) live.fileUrl = url;
      } catch {}
    }
  }
}

export async function publishLive() {
  saveLocal();
  const payload = JSON.parse(JSON.stringify(data));
  delete payload.media;
  await publishHostedFiles(payload);
  let body = JSON.stringify({ password: data.password, data: payload });
  if (body.length > 4000000) {
    Object.values(payload.pages || {}).forEach(p => {
      (p.items || []).forEach(i => {
        if (typeof i.photo === 'string' && i.photo.length > 200000) i.photo = '';
      });
    });
    body = JSON.stringify({ password: data.password, data: payload });
  }
  const r = await fetch('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) {
    const err = new Error(out.error || 'Publish failed');
    err.status = r.status;
    throw err;
  }
  data.publishedAt = out.publishedAt || Date.now();
  saveLocal();
  return out;
}

export function uid() {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

function pageData() {
  if (!data.pages[page]) data.pages[page] = { items: [] };
  return data.pages[page];
}

async function resolveLogo(brand) {
  if (brand?.mode !== 'logo' || !brand.logo) return '';
  if (brand.logo !== IDB_LOGO) return brand.logo;
  const file = await getLogoFile();
  if (!file) return '';
  if (logoBlobUrl) URL.revokeObjectURL(logoBlobUrl);
  logoBlobUrl = URL.createObjectURL(file);
  return logoBlobUrl;
}

async function nav() {
  document.title = data.site;
  const brand = data.brand || { mode: 'name', logo: '', links: 'left' };
  const align = ['left', 'center', 'right'].includes(brand.links) ? brand.links : 'left';
  const bar = $('site-nav');
  if (bar) bar.dataset.links = align;
  const el = document.querySelector('.brand');
  const logoSrc = await resolveLogo(brand);
  if (brand.mode === 'logo' && logoSrc) {
    el.classList.add('has-logo');
    el.innerHTML = `<img alt="${esc(data.site)}" src="${esc(logoSrc)}">`;
  } else {
    el.classList.remove('has-logo');
    el.textContent = data.site;
  }
  const stored = new Set((data.store?.pages || []).map(p => p.slug));
  $('nav-links').innerHTML = (data.nav || []).map((n, i) => {
    const slug = String(n.href || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (slug && stored.has(slug)) return '';
    const href = n.href && String(n.href).trim() ? n.href : '/';
    const label = (n.label && String(n.label).trim()) || 'Link';
    return `<a href="${esc(href)}" data-link data-nav="${i}">${esc(label)}</a>`;
  }).join('');
  $('sign-in').hidden = isAdmin();
  $('sign-in').textContent = 'Sign in';
  const themeBtn = $('theme-toggle');
  if (themeBtn) themeBtn.textContent = currentTheme() === 'light' ? 'Dark' : 'Light';
  applyTheme();
  document.body.classList.toggle('is-owner', isAdmin());
  document.body.classList.toggle('is-admin', isEditing());
  $('admin-bar').hidden = !isAdmin();
  if (isAdmin()) {
    $('admin-bar').classList.toggle('min', sessionStorage.getItem('adminBarMin') === '1');
    const btn = $('bar-toggle');
    if (btn) btn.textContent = $('admin-bar').classList.contains('min') ? 'Open' : 'Minimize';
    const peek = $('preview-toggle');
    if (peek) peek.textContent = isEditing() ? 'View site' : 'Edit site';
    const off = $('hero-off');
    if (off) off.hidden = !(isEditing() && page === 'home' && getHeroes().some(h => h.on !== false));
    const addHero = document.querySelector('[data-act="hero-add"]');
    if (addHero) addHero.hidden = false;
  }
}

function currentTheme() {
  return sessionStorage.getItem('theme') || data?.theme || 'dark';
}

export function applyTheme() {
  const light = currentTheme() === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  document.body.classList.toggle('theme-light', light);
  document.documentElement.classList.toggle('theme-dark', !light);
  document.body.classList.toggle('theme-dark', !light);
}

export function contentBottom() {
  const items = pageData().items || [];
  const itemBot = items.reduce((m, i) => Math.max(m, (Number(i.y) || 0) + (Number(i.h) || 0)), 0);
  const heroBot = getHeroes().filter(h => h.on !== false).reduce((m, h) => Math.max(m, (Number(h.y) || 0) + (Number(h.h) || HERO_H)), 0);
  return Math.max(itemBot, heroBot);
}

function pauseHero(resetStay) {
  document.querySelectorAll('#heroes video').forEach(v => v.pause());
  if (resetStay) stayFrozen = false;
}

export function resetHeroPlay() { stayFrozen = false; }

function heroMediaKey(h) {
  if (!h?.src) return '';
  if (h.src === IDB_HERO || h.src === 'idb:hero') return 'hero';
  if (h.src.startsWith('idb:hero:')) return 'hero:' + h.src.slice('idb:hero:'.length);
  return '';
}

async function resolveSrc(h) {
  if (!h.src) return '';
  const key = heroMediaKey(h);
  if (!key) return h.src;
  const file = await getMedia(key).catch(() => null) || (key === 'hero' ? await getHeroFile().catch(() => null) : null);
  if (!file) return '';
  const prev = heroUrls.get(h.id);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(file);
  heroUrls.set(h.id, url);
  return url;
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('psnl', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('media');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function putHeroFile(file) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').put(file, 'hero');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function getHeroFile() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const q = db.transaction('media').objectStore('media').get('hero');
    q.onsuccess = () => resolve(q.result || null);
    q.onerror = () => reject(q.error);
  });
}
export async function delHeroFile() {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').delete('hero');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function putLogoFile(file) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').put(file, 'logo');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function getLogoFile() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const q = db.transaction('media').objectStore('media').get('logo');
    q.onsuccess = () => resolve(q.result || null);
    q.onerror = () => reject(q.error);
  });
}
export async function delLogoFile() {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').delete('logo');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function putMedia(key, file) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').put(file, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function getMedia(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const q = db.transaction('media').objectStore('media').get(key);
    q.onsuccess = () => resolve(q.result || null);
    q.onerror = () => reject(q.error);
  });
}
export async function delMedia(key) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function hero() {
  const wrap = $('heroes');
  if (!wrap) return;
  const home = page === 'home';
  const all = getHeroes().filter(h => h.on !== false);
  const show = home && all.length;
  document.body.classList.toggle('hero-on', !!show);
  wrap.hidden = !show;
  if (!show) {
    wrap.innerHTML = '';
    pauseHero(true);
    return;
  }
  const parts = [];
  for (const h of all) {
    const src = await resolveSrc(h);
    const tools = isEditing() ? `
      <button type="button" class="hero-move" data-hero-move="${esc(h.id)}">Move banner</button>
      <div class="hero-tools">
        <button type="button" data-hero-import="${esc(h.id)}">Import photo or video</button>
        <button type="button" data-hero-add-text="${esc(h.id)}">Add text</button>
        ${h.src ? `<button type="button" class="ghost" data-hero-media-off="${esc(h.id)}">Remove media</button>` : ''}
        <button type="button" class="ghost" data-hero-del="${esc(h.id)}">Remove banner</button>
      </div>` : '';
    const layers = `<div class="hero-layers">${(h.layers || []).map(l => layerMarkup(l, h.id)).join('')}</div>`;
    const media = src
      ? (h.type === 'video'
        ? `<video class="hero-media" muted autoplay playsinline webkit-playsinline preload="auto" crossorigin="anonymous" src="${esc(src)}"></video>`
        : `<img class="hero-media" alt="" src="${esc(src)}">`)
      : '';
    parts.push(`<section class="hero" data-hero="${esc(h.id)}" data-src="${esc(h.src || '')}" data-type="${esc(h.type || 'image')}" style="top:${Number(h.y) || 0}vh;height:${Number(h.h) || HERO_H}vh">${tools}${media}${layers}</section>`);
  }
  wrap.innerHTML = parts.join('');
  wrap.querySelectorAll('video').forEach(video => {
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= MAX_VIDEO) freezeVideo(video);
    });
    video.addEventListener('ended', () => freezeVideo(video));
    playOrFreeze(video);
  });
}

function layerMarkup(l, heroId) {
  const style = `left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%;color:${esc(l.color || '#fff')}`;
  const href = l.kind === 'cta' && !isEditing() ? ` href="${esc(l.href || '/')}" data-link` : '';
  const tag = l.kind === 'cta' && !isEditing() ? 'a' : 'div';
  const edit = isEditing() ? ' contenteditable="true"' : '';
  const ui = isEditing() ? `<i class="handle"></i><button type="button" class="kill" data-kill-layer="${l.id}">×</button>` : '';
  return `<${tag} class="hero-layer ${l.kind || 'text'}" data-layer="${l.id}" data-hero="${esc(heroId || '')}" style="${style}"${href}>
    <span${edit}>${esc(l.text)}</span>${ui}
  </${tag}>`;
}

function freezeVideo(video) {
  const end = Math.min(video.duration || MAX_VIDEO, MAX_VIDEO);
  if (Number.isFinite(end) && end > 0.05) video.currentTime = end - 0.05;
  video.pause();
  stayFrozen = true;
}

function playOrFreeze(video) {
  if (!video) return;
  const start = () => {
    if (stayFrozen) {
      freezeVideo(video);
      return;
    }
    video.muted = true;
    const run = video.play();
    if (run && run.catch) run.catch(() => {});
  };
  if (stayFrozen) {
    if (video.readyState >= 1) freezeVideo(video);
    else video.addEventListener('loadedmetadata', () => freezeVideo(video), { once: true });
    return;
  }
  if (video.readyState >= 2) start();
  else {
    video.addEventListener('canplay', start, { once: true });
    video.addEventListener('loadeddata', start, { once: true });
    try { video.load(); } catch {}
  }
}

async function items() {
  const app = $('app');
  const list = pageData().items;
  list.forEach(place);
  const flow = list.filter(i => i.type === 'section').map(itemMarkup).join('');
  const canvas = list.filter(i => i.type === 'box' || i.type === 'text' || i.type === 'button' || i.type === 'file' || i.type === 'shape').map(itemMarkup).join('');
  const bottom = Math.max(100, contentBottom() + 10, 100);
  app.className = 'page' + (page === 'home' ? ' home' : '');
  app.style.minHeight = page === 'home' ? `${bottom}vh` : '';
  const site = $('site');
  if (site) site.style.minHeight = page === 'home' ? `max(calc(100vh - var(--nav-h)), ${bottom}vh)` : '';
  app.innerHTML = `
    <div class="flow">${flow}</div>
    <div class="stage" id="stage" style="min-height:${bottom}vh">${canvas}</div>`;
  await hydrateFiles(list);
}

function place(i) {
  if (i.type === 'text') {
    if (i.x == null) i.x = 10;
    if (i.y == null) i.y = 10;
    if (i.w == null) i.w = 32;
    if (i.h == null) i.h = 12;
    if (!i.color) i.color = '#ffffff';
    return;
  }
  if (i.type === 'file') {
    if (i.x == null) i.x = 8;
    if (i.y == null) i.y = 12;
    if (i.w == null) i.w = 28;
    if (i.h == null) i.h = 24;
    return;
  }
  if (i.type === 'shape') {
    if (i.x == null) i.x = 10;
    if (i.y == null) i.y = 12;
    if (i.w == null) i.w = 18;
    if (i.h == null) i.h = 18;
    if (!i.shape) i.shape = 'rect';
    if (!i.color) i.color = '#e3292e';
    return;
  }
  migrateTile(i);
}

function itemStyle(i) {
  return `left:${i.x}%;top:${i.y}vh;width:${i.w}%;height:${i.h}vh`;
}

function chrome(i) {
  if (!isEditing()) return '';
  return `<i class="handle"></i><button type="button" class="kill" data-kill="${i.id}">×</button>`;
}

export function photoStyle(i) {
  const z = Math.max(1, Number(i.zoom) || 1);
  const x = i.px == null ? 50 : Number(i.px);
  const y = i.py == null ? 50 : Number(i.py);
  return `width:${z * 100}%;height:${z * 100}%;max-width:none;left:${x}%;top:${y}%;transform:translate(-50%,-50%)`;
}

function itemMarkup(i) {
  if (i.type === 'section') {
    return `<section data-id="${i.id}">
      <h2 ${edit('title', i.id)}>${esc(i.title)}</h2>
      <p ${edit('body', i.id)}>${esc(i.body)}</p>
      ${isEditing() ? `<button type="button" class="kill" data-kill="${i.id}">×</button>` : ''}
    </section>`;
  }
  const grouped = i.group ? ' grouped' : '';
  if (i.type === 'text') {
    const style = `${itemStyle(i)};color:${esc(i.color || '#fff')}`;
    return `<div class="free-text${grouped}" data-id="${i.id}" style="${style}">
      <span ${edit('body', i.id)}>${esc(i.body)}</span>${chrome(i)}
    </div>`;
  }
  if (i.type === 'button') {
    const href = !isEditing() && i.linkOn && i.href ? ` href="${esc(i.href)}" data-link` : '';
    const tag = href ? 'a' : 'div';
    const label = isEditing() ? `<span ${edit('text', i.id)}>${esc(i.text || 'Button')}</span>` : `<span>${esc(i.text || 'Button')}</span>`;
    return `<${tag} class="tile btn-item${grouped}" data-id="${i.id}" style="${itemStyle(i)};background:${esc(i.color || '#e3292e')}"${href}>
      ${label}${chrome(i)}
    </${tag}>`;
  }
  if (i.type === 'file') return fileMarkup(i, grouped);
  if (i.type === 'shape') {
    const img = i.photo && i.photo.length < 400000
      ? `<img alt="" src="${esc(i.photo)}" style="${photoStyle(i)}">`
      : '';
    return `<div class="tile shape-item shape-${esc(i.shape || 'rect')}${grouped}" data-id="${i.id}" style="${itemStyle(i)};background:${esc(i.color || '#e3292e')}">
      ${img}${chrome(i)}
    </div>`;
  }
  const href = !isEditing() && i.linkOn && i.href ? ` href="${esc(i.href)}" data-link` : '';
  const tag = href ? 'a' : 'div';
  const img = i.photo && i.photo.length < 400000
    ? `<img alt="" src="${esc(i.photo)}" style="${photoStyle(i)}">`
    : '';
  const bg = i.color ? `;background:${esc(i.color)}` : '';
  return `<${tag} class="tile box${grouped}" data-id="${i.id}" style="${itemStyle(i)}${bg}"${href}>
    ${img}${chrome(i)}
  </${tag}>`;
}

function fileKind(i) {
  const t = String(i.fileType || '').toLowerCase();
  const n = String(i.fileName || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(n)) return 'audio';
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  return 'file';
}

function fileExt(i) {
  const name = String(i.fileName || '');
  const ext = (name.includes('.') ? name.split('.').pop() : '') || i.ext || '';
  return (ext || 'FILE').toUpperCase().slice(0, 6);
}

function fileSize(n) {
  const x = Number(n) || 0;
  if (!x) return '';
  if (x < 1024) return x + ' B';
  if (x < 1048576) return (x / 1024).toFixed(1) + ' KB';
  return (x / 1048576).toFixed(1) + ' MB';
}

function fileMarkup(i, grouped) {
  const has = !!(i.fileId || i.fileUrl);
  const kind = fileExt(i);
  const name = i.title || i.fileName || (isEditing() ? 'Drop in a file' : 'File');
  const meta = has ? `${kind}${i.fileSize ? ' · ' + fileSize(i.fileSize) : ''}` : 'Viewers can open and download it';
  const actions = has ? `
    <div class="file-actions">
      <button type="button" data-file-view="${esc(i.id)}">View</button>
      <button type="button" data-file-dl="${esc(i.id)}">Download</button>
    </div>` : (isEditing() ? `<div class="file-actions"><span>Import from Store or the panel</span></div>` : '');
  return `<div class="tile file-card${grouped}${has ? ' has-file' : ''}" data-id="${i.id}" data-file-kind="${fileKind(i)}" style="${itemStyle(i)}">
    <div class="file-preview" data-file-preview></div>
    <div class="file-body">
      <span class="file-kind">${esc(has ? kind : 'FILE')}</span>
      <strong>${esc(name)}</strong>
      <em>${esc(meta)}</em>
      ${actions}
    </div>
    ${chrome(i)}
  </div>`;
}

function findItemById(id) {
  for (const p of Object.values(data.pages || {})) {
    const hit = (p.items || []).find(i => i.id === id);
    if (hit) return hit;
  }
  return null;
}

function fileGuessType(item, blob) {
  const t = String(item?.fileType || blob?.type || '').trim();
  if (t && t !== 'application/octet-stream') return t;
  const n = String(item?.fileName || '').toLowerCase();
  if (n.endsWith('.pdf') || fileKind(item) === 'pdf') return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.mp4')) return 'video/mp4';
  return t || 'application/octet-stream';
}

async function loadFileBlob(item) {
  if (!item) return null;
  if (item.fileId) {
    const local = await getMedia(item.fileId).catch(() => null);
    if (local) return local;
  }
  if (item.fileUrl && /^https?:\/\//.test(item.fileUrl)) {
    const r = await fetch(item.fileUrl);
    if (!r.ok) return null;
    const raw = await r.blob();
    return new File([raw], item.fileName || 'file', { type: fileGuessType(item, raw) });
  }
  return null;
}

async function fileBlobUrl(item) {
  if (!item) return '';
  if (fileUrls.has(item.id)) return fileUrls.get(item.id);
  const file = await loadFileBlob(item);
  if (!file) return '';
  const url = URL.createObjectURL(file);
  fileUrls.set(item.id, url);
  return url;
}

async function hydrateFiles(list) {
  fileUrls.forEach(url => URL.revokeObjectURL(url));
  fileUrls.clear();
  for (const i of list.filter(x => x.type === 'file' && x.fileId)) {
    const node = document.querySelector(`.file-card[data-id="${i.id}"]`);
    if (!node) continue;
    const url = await fileBlobUrl(i);
    if (!url) continue;
    const kind = fileKind(i);
    const preview = node.querySelector('[data-file-preview]');
    if (kind === 'image') preview.innerHTML = `<img alt="" src="${esc(url)}">`;
    else if (kind === 'video') preview.innerHTML = `<video src="${esc(url)}" muted playsinline loop></video>`;
    else if (kind === 'audio') preview.innerHTML = `<div class="file-wave"></div>`;
    node.classList.add('ready');
  }
}

async function openFileModal(id) {
  const item = findItemById(id);
  const file = await loadFileBlob(item);
  if (!file) return;
  const kind = fileKind(item);
  const modal = $('file-modal');
  const body = $('file-modal-body');
  const title = $('file-modal-title');
  if (!modal || !body) return;
  closeFileModal(true);
  const url = URL.createObjectURL(file);
  title.textContent = item.title || item.fileName || 'File';
  if (kind === 'image') body.innerHTML = `<img alt="" src="${esc(url)}">`;
  else if (kind === 'video') body.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline></video>`;
  else if (kind === 'audio') body.innerHTML = `<audio src="${esc(url)}" controls autoplay></audio>`;
  else if (kind === 'pdf') body.innerHTML = `<iframe title="${esc(item.fileName || 'PDF')}" src="${esc(url)}"></iframe>`;
  else body.innerHTML = `<div class="file-fallback"><p>Preview is not available for this file type.</p><button type="button" data-file-dl="${esc(item.id)}">Download ${esc(item.fileName || 'file')}</button></div>`;
  modal.dataset.url = url;
  modal.hidden = false;
  if (history.state?.fileModal !== true) history.pushState({ fileModal: true }, '', location.pathname + location.search);
}

async function downloadFileItem(id) {
  const item = findItemById(id);
  const file = await loadFileBlob(item);
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.fileName || file.name || 'file';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function closeFileModal(fromHistory) {
  const modal = $('file-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const url = modal.dataset.url;
  $('file-modal-body').innerHTML = '';
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  modal.dataset.url = '';
  if (!fromHistory && history.state?.fileModal) history.back();
}

function bindFileModal() {
  const modal = $('file-modal');
  const close = $('file-modal-close');
  if (close) close.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    closeFileModal();
  };
  if (modal) modal.addEventListener('click', e => {
    if (e.target === modal) closeFileModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && !modal.hidden) closeFileModal();
  });
}

function edit(field, id) {
  return isEditing() ? `contenteditable="true" data-field="${field}" data-id="${id}"` : '';
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function knownPage(name) {
  if (!name || name === 'home') return true;
  if (data?.pages && Object.prototype.hasOwnProperty.call(data.pages, name)) return true;
  return (data.nav || []).some(n => slugFromPath(String(n.href || '')) === name);
}

export async function render() {
  const next = slug();
  const parked = (data.store?.pages || []).some(p => p.slug === next);
  if (parked && !data.pages[next] && !isEditing()) {
    history.replaceState(null, '', '/');
    page = 'home';
  } else if (next !== 'home' && !knownPage(next)) {
    history.replaceState(history.state, '', '/');
    page = 'home';
  } else {
    if (next !== page) hideDrawerSafe();
    page = next;
  }
  await nav();
  await hero();
  await items();
}

function hideDrawerSafe() {
  const d = $('drawer');
  if (d) {
    d.hidden = true;
    d.classList.remove('is-open');
  }
}

export { $, KEY, isAdmin, isEditing, pageData };

window.addEventListener('popstate', () => {
  const modal = $('file-modal');
  if (modal && !modal.hidden) {
    closeFileModal(true);
    return;
  }
  if (page === 'home' && slug() !== 'home') pauseHero(true);
  render();
});

document.addEventListener('click', e => {
  const view = e.target.closest('[data-file-view]');
  const dl = e.target.closest('[data-file-dl]');
  if (view || dl) {
    e.preventDefault();
    e.stopPropagation();
    const id = (view || dl).getAttribute(view ? 'data-file-view' : 'data-file-dl');
    if (view) openFileModal(id);
    else downloadFileItem(id);
    return;
  }
  if (e.target.id === 'theme-toggle') {
    e.preventDefault();
    e.stopPropagation();
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    sessionStorage.setItem('theme', next);
    if (isAdmin()) {
      data.theme = next;
      saveLocal();
    }
    applyTheme();
    render();
    return;
  }
  const a = e.target.closest('[data-link]');
  if (!a) return;
  if (isEditing() && a.closest('.nav')) {
    e.preventDefault();
    return;
  }
  if (isEditing() && (a.classList.contains('box') || a.classList.contains('btn-item') || a.classList.contains('hero-layer'))) return;
  go(a.getAttribute('href'), e);
});

load().then(async () => {
  applyTheme();
  const reset = new URLSearchParams(location.search).get('reset');
  if (reset && data?.resetToken && reset === data.resetToken) {
    sessionStorage.removeItem('admin');
    sessionStorage.removeItem('preview');
    $('reset-modal').hidden = false;
  }
  try {
    const { initAdmin } =   await import('./admin.js?v=30');
    initAdmin();
  } catch (err) {
    console.error(err);
  }
  bindFileModal();
  await render();
}).catch(err => console.error(err));
