import { $, getData, saveLocal, render, uid, isAdmin, pageData } from './main.js';

let selected;

export function initAdmin() {
  $('sign-in').onclick = () => {
    if (isAdmin()) return;
    $('login-err').hidden = true;
    $('login-modal').hidden = false;
    $('login-pass').focus();
  };
  $('login-cancel').onclick = () => { $('login-modal').hidden = true; };
  $('login-form').onsubmit = e => {
    e.preventDefault();
    const data = getData();
    if ($('login-pass').value !== data.password) {
      $('login-err').hidden = false;
      return;
    }
    sessionStorage.setItem('admin', '1');
    $('login-modal').hidden = true;
    render();
  };

  $('admin-bar').onclick = e => {
    const act = e.target.dataset.act;
    if (act) actions[act]();
  };

  document.addEventListener('focusout', e => {
    const el = e.target.closest('[contenteditable]');
    if (!el) return;
    const item = pageData().items.find(i => i.id === el.dataset.id);
    if (item) item[el.dataset.field] = el.innerText;
  });

  document.addEventListener('click', e => {
    if (!isAdmin()) return;
    const box = e.target.closest('.box');
    if (box) {
      e.preventDefault();
      select(box.dataset.id);
    }
  });

  document.addEventListener('pointerdown', e => {
    if (!isAdmin()) return;
    const box = e.target.closest('.box');
    if (!box) return;
    const item = pageData().items.find(i => i.id === box.dataset.id);
    const stage = $('stage').getBoundingClientRect();
    if (e.target.classList.contains('handle')) {
      resize(e, box, item, stage);
      return;
    }
    drag(e, box, item, stage);
  });
}

const actions = {
  box() {
    pageData().items.push({
      id: uid(), type: 'box', x: 8, y: 8, w: 28, h: 42,
      photo: '', text: 'New box', href: '/'
    });
    render();
    select(pageData().items.at(-1).id);
  },
  text() {
    pageData().items.push({ id: uid(), type: 'text', body: 'Text' });
    render();
  },
  section() {
    pageData().items.push({ id: uid(), type: 'section', title: 'Section', body: '' });
    render();
  },
  hero() { drawerHero(); },
  save() {
    saveLocal();
    $('save-msg').textContent = 'Saved in this browser';
    setTimeout(() => { $('save-msg').textContent = ''; }, 2000);
  },
  export() {
    saveLocal();
    const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    a.click();
  },
  logout() {
    sessionStorage.removeItem('admin');
    $('drawer').hidden = true;
    render();
  }
};

function select(id) {
  selected = id;
  document.querySelectorAll('.box').forEach(b => b.classList.toggle('selected', b.dataset.id === id));
  const item = pageData().items.find(i => i.id === id);
  if (item) drawerBox(item);
}

function drawerBox(item) {
  const d = $('drawer');
  d.hidden = false;
  d.innerHTML = `
    <h3>Box</h3>
    <label>Photo path</label>
    <input id="f-photo" value="${attr(item.photo)}">
    <label>Text</label>
    <input id="f-text" value="${attr(item.text)}">
    <label>Link path</label>
    <input id="f-href" value="${attr(item.href)}" placeholder="/work">
    <div class="row">
      <button type="button" id="f-apply">Apply</button>
      <button type="button" class="ghost" id="f-del">Delete</button>
    </div>`;
  d.querySelector('#f-apply').onclick = () => {
    item.photo = d.querySelector('#f-photo').value.trim();
    item.text = d.querySelector('#f-text').value;
    item.href = d.querySelector('#f-href').value.trim() || '/';
    const slug = item.href.replace(/^\/+/, '');
    const data = getData();
    if (slug && slug !== 'home' && !data.pages[slug]) data.pages[slug] = { items: [] };
    render();
    select(item.id);
  };
  d.querySelector('#f-del').onclick = () => {
    const p = pageData();
    p.items = p.items.filter(i => i.id !== item.id);
    d.hidden = true;
    render();
  };
}

function drawerHero() {
  const h = getData().hero;
  const s = getData();
  const d = $('drawer');
  d.hidden = false;
  d.innerHTML = `
    <h3>Site & hero</h3>
    <label>Site name</label>
    <input id="h-site" value="${attr(s.site)}">
    <label>Admin password</label>
    <input id="h-pass" type="password" value="${attr(s.password)}">
    <label>Headline</label>
    <input id="h-title" value="${attr(h.title)}">
    <label>Subtext</label>
    <input id="h-sub" value="${attr(h.sub)}">
    <label>Button text</label>
    <input id="h-cta" value="${attr(h.cta)}">
    <label>Button path</label>
    <input id="h-ctaHref" value="${attr(h.ctaHref)}">
    <label>Media type</label>
    <select id="h-type">
      <option value="image"${h.type === 'image' ? ' selected' : ''}>Image</option>
      <option value="video"${h.type === 'video' ? ' selected' : ''}>Video (max 15s)</option>
    </select>
    <label>Media path (put files in /media)</label>
    <input id="h-src" value="${attr(h.src)}" placeholder="media/hero.mp4">
    <div class="row"><button type="button" id="h-apply">Apply</button></div>`;
  d.querySelector('#h-apply').onclick = () => {
    s.site = d.querySelector('#h-site').value.trim() || s.site;
    s.password = d.querySelector('#h-pass').value;
    h.title = d.querySelector('#h-title').value;
    h.sub = d.querySelector('#h-sub').value;
    h.cta = d.querySelector('#h-cta').value;
    h.ctaHref = d.querySelector('#h-ctaHref').value;
    const type = d.querySelector('#h-type').value;
    const src = d.querySelector('#h-src').value.trim();
    if (h.type !== type || h.src !== src) $('hero').dataset.src = '';
    h.type = type;
    h.src = src;
    render();
  };
}

function drag(e, el, item, stage) {
  if (e.target.closest('.handle')) return;
  e.preventDefault();
  const ox = e.clientX - el.getBoundingClientRect().left;
  const oy = e.clientY - el.getBoundingClientRect().top;
  const move = ev => {
    item.x = clamp(((ev.clientX - ox - stage.left) / stage.width) * 100, 0, 100 - item.w);
    item.y = clamp(((ev.clientY - oy - stage.top) / stage.height) * 100, 0, 100 - item.h);
    el.style.left = item.x + '%';
    el.style.top = item.y + '%';
  };
  up(move);
}

function resize(e, el, item, stage) {
  e.preventDefault();
  e.stopPropagation();
  const move = ev => {
    item.w = clamp(((ev.clientX - el.getBoundingClientRect().left) / stage.width) * 100, 8, 100 - item.x);
    item.h = clamp(((ev.clientY - el.getBoundingClientRect().top) / stage.height) * 100, 8, 100 - item.y);
    el.style.width = item.w + '%';
    el.style.height = item.h + '%';
  };
  up(move);
}

function up(move) {
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function attr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
