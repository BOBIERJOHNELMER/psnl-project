const KEY = 'psnl-content';
const MAX_VIDEO = 15;
let data;
let page = 'home';
let stayFrozen = false;

const $ = id => document.getElementById(id);
const isAdmin = () => sessionStorage.getItem('admin') === '1';

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
  const local = localStorage.getItem(KEY);
  if (local) { data = JSON.parse(local); return; }
  data = await fetch('data/content.json').then(r => r.json());
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
  document.querySelector('.brand').textContent = data.site;
  $('nav-links').innerHTML = data.nav.map(n =>
    `<a href="${esc(n.href)}" data-link>${esc(n.label)}</a>`
  ).join('');
  $('sign-in').textContent = isAdmin() ? 'Editing' : 'Sign in';
  document.body.classList.toggle('is-admin', isAdmin());
  $('admin-bar').hidden = !isAdmin();
}

function pauseHero(resetStay) {
  const v = $('hero').querySelector('video');
  if (v) v.pause();
  if (resetStay) stayFrozen = false;
}

function hero() {
  const el = $('hero');
  const home = page === 'home';
  if (!home) {
    el.hidden = true;
    pauseHero(true);
    return;
  }
  el.hidden = false;

  const h = data.hero;
  const copy = `
    <div class="hero-copy">
      <h1>${esc(h.title)}</h1>
      ${h.sub ? `<p class="sub">${esc(h.sub)}</p>` : ''}
      ${h.cta ? `<a class="cta" href="${esc(h.ctaHref || '/')}" data-link>${esc(h.cta)}</a>` : ''}
    </div>`;
  const same = el.dataset.src === (h.src || '') && el.dataset.type === h.type && el.querySelector('.hero-copy');

  if (same) {
    el.querySelector('.hero-copy').outerHTML = copy;
    playOrFreeze(el.querySelector('video'));
    return;
  }

  const media = h.src
    ? (h.type === 'video'
      ? `<video class="hero-media" muted playsinline preload="auto" src="${esc(h.src)}"></video>`
      : `<img class="hero-media" alt="" src="${esc(h.src)}">`)
    : '';
  el.innerHTML = media + copy;
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
  const flow = list.filter(i => i.type !== 'box').map(itemMarkup).join('');
  const boxes = list.filter(i => i.type === 'box').map(itemMarkup).join('');
  app.className = 'page' + (page === 'home' ? ' home' : '');
  app.innerHTML = `
    <div class="flow">${flow}</div>
    <div class="stage" id="stage">${boxes}</div>`;
}

function itemMarkup(i) {
  if (i.type === 'section') {
    return `<section data-id="${i.id}">
      <h2 ${edit('title', i.id)}>${esc(i.title)}</h2>
      <p ${edit('body', i.id)}>${esc(i.body)}</p>
    </section>`;
  }
  if (i.type === 'text') {
    return `<p class="text-block" data-id="${i.id}" ${edit('body', i.id)}>${esc(i.body)}</p>`;
  }
  const style = `left:${i.x}%;top:${i.y}%;width:${i.w}%;height:${i.h}%`;
  const handle = isAdmin() ? `<i class="handle"></i>` : '';
  return `<a class="box" data-id="${i.id}" href="${esc(i.href || '/')}" style="${style}" data-link>
    ${i.photo ? `<img alt="" src="${esc(i.photo)}">` : ''}
    <span>${esc(i.text || '')}</span>${handle}
  </a>`;
}

function edit(field, id) {
  return isAdmin() ? `contenteditable="true" data-field="${field}" data-id="${id}"` : '';
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function render() {
  const next = slug();
  if (next !== page) $('drawer').hidden = true;
  page = next;
  nav();
  hero();
  items();
}

export { $, KEY, isAdmin, pageData };

window.addEventListener('popstate', () => {
  if (page === 'home' && slug() !== 'home') pauseHero(true);
  render();
});

document.addEventListener('click', e => {
  const a = e.target.closest('[data-link]');
  if (!a) return;
  if (isAdmin() && a.classList.contains('box')) return;
  go(a.getAttribute('href'), e);
});

load().then(async () => {
  const { initAdmin } = await import('./admin.js');
  initAdmin();
  render();
});
