const KEY = 'psnl-content-v3';
const MAX_VIDEO = 15;
export const COLS = 12;
export const IDB_HERO = 'idb:hero';
let data;
let page = 'home';
let stayFrozen = false;
let blobUrl = '';

const $ = id => document.getElementById(id);
const isAdmin = () => sessionStorage.getItem('admin') === '1';
const isEditing = () => isAdmin() && sessionStorage.getItem('preview') !== '1';
export const isTile = i => i.type === 'box' || i.type === 'button';

export function overlap(a, b) {
  if (a?.c == null || b?.c == null) return false;
  return a.c < b.c + (b.cw || 1) && b.c < a.c + (a.cw || 1) && a.r < b.r + (b.ch || 1) && b.r < a.r + (a.ch || 1);
}

export function pack(item, items) {
  item.cw = Math.max(2, item.cw || 3);
  item.ch = Math.max(2, item.ch || 3);
  const others = items.filter(i => isTile(i) && i.id !== item.id);
  for (let r = 0; r < 60; r++) {
    for (let c = 0; c <= COLS - item.cw; c++) {
      item.c = c;
      item.r = r;
      if (!others.some(o => overlap(item, o))) return;
    }
  }
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
export function go(href, e) {
  if (e) e.preventDefault();
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) { location.href = href; return; }
  if (page === 'home' && slugFromPath(url.pathname) !== 'home') pauseHero(true);
  history.pushState(null, '', url.pathname);
  render();
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
  try {
    const local = localStorage.getItem(KEY);
    data = local && local.length < 1500000 ? JSON.parse(local) : null;
  } catch {
    data = null;
  }
  if (!data?.pages || !data.hero) {
    data = await fetch('data/content.json').then(r => r.json());
  }
  if (!data.hero) data.hero = { type: 'image', src: '', layers: [], on: true };
  if (data.hero.on == null) data.hero.on = true;
  if (!data.pages) data.pages = { home: { items: [] } };
  migrateHero(data.hero);
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
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function uid() {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

function pageData() {
  if (!data.pages[page]) data.pages[page] = { items: [] };
  return data.pages[page];
}

function nav() {
  document.title = data.site;
  const brand = document.querySelector('.brand');
  brand.textContent = data.site;
  $('nav-links').innerHTML = (data.nav || []).map((n, i) =>
    `<a href="${esc(n.href)}" data-link data-nav="${i}">${esc(n.label)}</a>`
  ).join('');
  $('sign-in').hidden = isAdmin();
  $('sign-in').textContent = 'Sign in';
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
    if (off) off.hidden = !(isEditing() && page === 'home' && data.hero.on !== false);
    const addHero = document.querySelector('[data-act="hero-add"]');
    if (addHero) addHero.hidden = data.hero.on !== false;
  }
}

function pauseHero(resetStay) {
  const v = $('hero').querySelector('video');
  if (v) v.pause();
  if (resetStay) stayFrozen = false;
}

export function resetHeroPlay() { stayFrozen = false; }

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

async function resolveSrc(h) {
  if (!h.src) return '';
  if (h.src !== IDB_HERO) return h.src;
  const file = await getHeroFile();
  if (!file) return '';
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(file);
  return blobUrl;
}

async function hero() {
  const el = $('hero');
  const home = page === 'home';
  const h = data.hero;
  const show = home && h.on !== false;
  document.body.classList.toggle('hero-on', show);
  if (!show) {
    el.hidden = true;
    pauseHero(true);
    return;
  }
  el.hidden = false;

  const src = await resolveSrc(h);
  const tools = isEditing() ? `
    <div class="hero-tools">
      <button type="button" id="hero-import">Import photo or video</button>
      <button type="button" id="hero-add-text">Add text</button>
      ${h.src ? '<button type="button" class="ghost" id="hero-remove">Remove media</button>' : ''}
    </div>` : '';
  const layers = `<div class="hero-layers">${(h.layers || []).map(layerMarkup).join('')}</div>`;
  const same = el.dataset.src === (h.src || '') && el.dataset.type === h.type && el.querySelector('.hero-layers');

  if (same) {
    const oldTools = el.querySelector('.hero-tools');
    if (oldTools) oldTools.outerHTML = tools;
    else el.insertAdjacentHTML('afterbegin', tools);
    el.querySelector('.hero-layers').outerHTML = layers;
    playOrFreeze(el.querySelector('video'));
    return;
  }

  const media = src
    ? (h.type === 'video'
      ? `<video class="hero-media" muted playsinline preload="auto" src="${esc(src)}"></video>`
      : `<img class="hero-media" alt="" src="${esc(src)}">`)
    : '';
  el.innerHTML = tools + media + layers;
  el.dataset.src = h.src || '';
  el.dataset.type = h.type;
  const video = el.querySelector('video');
  if (!video) return;
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= MAX_VIDEO) freezeVideo(video);
  });
  video.addEventListener('ended', () => freezeVideo(video));
  playOrFreeze(video);
}

function layerMarkup(l) {
  const style = `left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%;color:${esc(l.color || '#fff')}`;
  const href = l.kind === 'cta' && !isEditing() ? ` href="${esc(l.href || '/')}" data-link` : '';
  const tag = l.kind === 'cta' && !isEditing() ? 'a' : 'div';
  const edit = isEditing() ? ' contenteditable="true"' : '';
  const ui = isEditing() ? `<label class="tint">Color <input type="color" value="${esc(l.color || '#ffffff')}"></label><i class="handle"></i><button type="button" class="kill" data-kill-layer="${l.id}">×</button>` : '';
  return `<${tag} class="hero-layer ${l.kind || 'text'}" data-layer="${l.id}" style="${style}"${href}>
    <span${edit}>${esc(l.text)}</span>${ui}
  </${tag}>`;
}

function freezeVideo(video) {
  const end = Math.min(video.duration || MAX_VIDEO, MAX_VIDEO);
  if (end > 0.05) video.currentTime = end - 0.05;
  video.pause();
  stayFrozen = true;
}

function playOrFreeze(video) {
  if (!video) return;
  if (stayFrozen) {
    if (video.readyState >= 1) freezeVideo(video);
    else video.addEventListener('loadedmetadata', () => freezeVideo(video), { once: true });
    return;
  }
  if (!video.paused) return;
  video.currentTime = 0;
  video.play().catch(() => freezeVideo(video));
}

function items() {
  const app = $('app');
  const list = pageData().items;
  list.forEach(place);
  const flow = list.filter(i => i.type === 'section').map(itemMarkup).join('');
  const canvas = list.filter(i => i.type === 'box' || i.type === 'text' || i.type === 'button').map(itemMarkup).join('');
  const bottom = Math.max(100, ...list.filter(i => i.y != null).map(i => (i.y || 0) + (i.h || 0) + 10), 100);
  app.className = 'page' + (page === 'home' ? ' home' : '');
  app.style.minHeight = page === 'home' ? `${bottom}vh` : '';
  const site = $('site');
  if (site) site.style.minHeight = page === 'home' ? `max(calc(100vh - var(--nav-h)), ${bottom}vh)` : '';
  app.innerHTML = `
    <div class="flow">${flow}</div>
    <div class="stage" id="stage" style="min-height:${bottom}vh">${canvas}</div>`;
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
  migrateTile(i);
}

function itemStyle(i) {
  return `left:${i.x}%;top:${i.y}vh;width:${i.w}%;height:${i.h}vh`;
}

function chrome(i) {
  if (!isEditing()) return '';
  return `<i class="handle"></i><button type="button" class="kill" data-kill="${i.id}">×</button>`;
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
    const tint = isEditing() ? `<label class="tint">Color <input type="color" value="${esc(i.color || '#ffffff')}"></label>` : '';
    return `<div class="free-text${grouped}" data-id="${i.id}" style="${style}">
      <span ${edit('body', i.id)}>${esc(i.body)}</span>${tint}${chrome(i)}
    </div>`;
  }
  if (i.type === 'button') {
    const href = !isEditing() && i.linkOn && i.href ? ` href="${esc(i.href)}" data-link` : '';
    const tag = href ? 'a' : 'div';
    const tint = isEditing() ? `<label class="tint">Color <input type="color" value="${esc(i.color || '#e3292e')}"></label>` : '';
    const label = isEditing() ? `<span ${edit('text', i.id)}>${esc(i.text || 'Button')}</span>` : `<span>${esc(i.text || 'Button')}</span>`;
    return `<${tag} class="tile btn-item${grouped}" data-id="${i.id}" style="${itemStyle(i)};background:${esc(i.color || '#e3292e')}"${href}>
      ${label}${tint}${chrome(i)}
    </${tag}>`;
  }
  const href = !isEditing() && i.linkOn && i.href ? ` href="${esc(i.href)}" data-link` : '';
  const tag = href ? 'a' : 'div';
  const img = i.photo && i.photo.length < 400000
    ? `<img alt="" src="${esc(i.photo)}" style="object-position:${i.px || 50}% ${i.py || 50}%;transform:scale(${i.zoom || 1})">`
    : '';
  return `<${tag} class="tile box${grouped}" data-id="${i.id}" style="${itemStyle(i)}"${href}>
    ${img}${chrome(i)}
  </${tag}>`;
}

function edit(field, id) {
  return isEditing() ? `contenteditable="true" data-field="${field}" data-id="${id}"` : '';
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function render() {
  const next = slug();
  if (next !== page) $('drawer').hidden = true;
  page = next;
  nav();
  await hero();
  items();
}

export { $, KEY, isAdmin, isEditing, pageData };

window.addEventListener('popstate', () => {
  if (page === 'home' && slug() !== 'home') pauseHero(true);
  render();
});

document.addEventListener('click', e => {
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
  try {
    const { initAdmin } = await import('./admin.js?v=7');
    initAdmin();
  } catch (err) {
    console.error(err);
  }
  await render();
}).catch(err => console.error(err));
