import {
  $, getData, saveLocal, render, uid, isAdmin, isEditing, pageData,
  IDB_HERO, putHeroFile, delHeroFile, resetHeroPlay
} from './main.js';

let picked = new Set();
let cropItem;
let skipClickUntil = 0;

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
    if ($('login-pass').value !== getData().password) {
      $('login-err').hidden = false;
      return;
    }
    sessionStorage.setItem('admin', '1');
    sessionStorage.removeItem('preview');
    $('login-modal').hidden = true;
    render();
  };

  $('admin-bar').onclick = e => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.getAttribute('data-act');
    if (act && actions[act]) actions[act]();
  };

  document.addEventListener('click', e => {
    if (!isEditing()) return;
    if (Date.now() < skipClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const kill = e.target.closest('.kill');
    if (kill) {
      e.preventDefault();
      e.stopPropagation();
      removeThing(kill.dataset.kill, kill.dataset.killLayer);
      return;
    }
    if (e.target.closest('.admin-bar, .drawer, .modal, .hero-tools, .tint, .handle')) return;
    if (e.target.closest('#site-nav')) {
      if (e.target.closest('#sign-in')) return;
      e.preventDefault();
      drawerNav(e.target.closest('[data-nav]')?.dataset.nav);
      return;
    }
    const hit = e.target.closest('.box, .free-text, .btn-item');
    if (hit) {
      e.preventDefault();
      choose(hit.dataset.id, e.shiftKey);
      return;
    }
    if (e.target.closest('.hero-layer')) return;
    clearSelection();
  });

  document.addEventListener('focusout', e => {
    const el = e.target.closest('[contenteditable]');
    if (!el) return;
    const layer = el.closest('[data-layer]');
    if (layer) {
      const item = getData().hero.layers.find(i => i.id === layer.dataset.layer);
      if (item) item.text = el.innerText.trim();
      return;
    }
    const wrap = el.closest('[data-id]');
    const item = pageData().items.find(i => i.id === (wrap?.dataset.id || el.dataset.id));
    if (!item) return;
    if (item.type === 'text') item.body = el.innerText;
    else if (el.dataset.field) item[el.dataset.field] = el.innerText;
    else if (item.type === 'button') item.text = el.innerText.trim();
  });

  $('hero').addEventListener('click', e => {
    if (!isEditing()) return;
    if (e.target.id === 'hero-import') $('hero-file').click();
    if (e.target.id === 'hero-remove') removeHeroMedia();
    if (e.target.id === 'hero-add-text') addHeroText();
    const layer = e.target.closest('[data-layer]');
    if (layer) selectLayer(layer.dataset.layer);
    else if (!e.target.closest('.hero-tools, .kill')) selectLayer(null);
  });
  $('hero').addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    const layer = e.target.closest('[data-layer]');
    const item = getData().hero.layers.find(i => i.id === layer?.dataset.layer);
    if (!item) return;
    item.color = e.target.value;
    layer.style.color = item.color;
  });
  $('hero').addEventListener('dragover', e => { if (isEditing()) e.preventDefault(); });
  $('hero').addEventListener('drop', e => {
    if (!isEditing()) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) importHero(file);
  });
  const hf = $('hero-file');
  if (hf) hf.onchange = () => {
    const file = hf.files[0];
    hf.value = '';
    if (file) importHero(file);
  };
  const bf = $('box-file');
  if (bf) bf.onchange = async () => {
    const file = bf.files[0];
    bf.value = '';
    if (!file || !cropItem || !file.type.startsWith('image/')) return;
    cropItem.photo = await fileToData(file);
    cropItem.zoom = 1;
    cropItem.px = 50;
    cropItem.py = 50;
    saveLocal();
    render();
    choose(cropItem.id, false);
  };
  document.addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    const wrap = e.target.closest('.free-text, .btn-item');
    if (!wrap) return;
    const item = pageData().items.find(i => i.id === wrap.dataset.id);
    if (!item) return;
    item.color = e.target.value;
    if (wrap.classList.contains('btn-item')) wrap.style.background = item.color;
    else wrap.style.color = item.color;
  });

  document.addEventListener('pointerdown', e => {
    if (!isEditing()) return;
    if (e.target.closest('.kill, .tint, .admin-bar, .drawer, .modal, .nav')) return;
    const layer = e.target.closest('.hero-layer');
    if (layer) {
      const item = getData().hero.layers.find(i => i.id === layer.dataset.layer);
      if (!item) return;
      const stage = $('hero').getBoundingClientRect();
      selectLayer(item.id);
      if (e.target.closest('.handle')) resizeItem(e, layer, item, stage);
      else grab(e, layer, item, stage, true);
      return;
    }
    const hit = e.target.closest('.box, .free-text, .btn-item');
    if (!hit) return;
    const item = pageData().items.find(i => i.id === hit.dataset.id);
    if (!item) return;
    const stage = ($('site') || $('stage')).getBoundingClientRect();
    if (e.target.closest('.handle')) {
      choose(item.id, e.shiftKey);
      resizeItem(e, hit, item, stage);
      return;
    }
    if (e.target.closest('[contenteditable], input, label')) {
      choose(item.id, e.shiftKey);
      return;
    }
    e.preventDefault();
    grab(e, hit, item, stage, false);
  });
}

const actions = {
  add() {
    $('admin-bar').classList.toggle('add-open');
  },
  box() { addItem({ type: 'box', w: 22, h: 22, text: 'Box', href: '/', linkOn: false, photo: '', zoom: 1, px: 50, py: 50 }); },
  button() { addItem({ type: 'button', w: 16, h: 7, text: 'Button', href: '/', linkOn: true, color: '#e3292e' }); },
  text() { addItem({ type: 'text', w: 28, h: 8, body: 'Text', color: '#ffffff' }); },
  section() {
    pageData().items.push({ id: uid(), type: 'section', title: 'Section', body: '' });
    closeAdd();
    saveLocal();
    render();
  },
  nav() { closeAdd(); drawerNav(); },
  group() {
    if (picked.size < 2) return;
    const gid = uid();
    pageData().items.forEach(i => { if (picked.has(i.id)) i.group = gid; });
    render();
    picked.forEach(id => document.querySelector(`[data-id="${id}"]`)?.classList.add('selected'));
  },
  ungroup() {
    pageData().items.forEach(i => { if (picked.has(i.id)) delete i.group; });
    render();
  },
  hero() { closeAdd(); drawerHero(); },
  'hero-add'() {
    const h = getData().hero;
    h.on = true;
    if (!h.layers?.length) {
      h.layers = [
        { id: 'title', kind: 'title', text: getData().site || 'Title', x: 10, y: 36, w: 80, h: 18, color: '#ffffff' },
        { id: 'cta', kind: 'cta', text: 'See my work', href: '/work', x: 38, y: 58, w: 24, h: 9, color: '#ffffff' }
      ];
    }
    closeAdd();
    saveLocal();
    render();
  },
  'hero-remove'() {
    getData().hero.on = false;
    closeAdd();
    saveLocal();
    render();
  },
  preview() {
    if (!isAdmin()) return;
    if (isEditing()) sessionStorage.setItem('preview', '1');
    else sessionStorage.removeItem('preview');
    $('drawer').hidden = true;
    picked.clear();
    closeAdd();
    render();
  },
  toggle() {
    const bar = $('admin-bar');
    bar.classList.toggle('min');
    sessionStorage.setItem('adminBarMin', bar.classList.contains('min') ? '1' : '0');
    $('bar-toggle').textContent = bar.classList.contains('min') ? 'Open' : 'Minimize';
  },
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
    sessionStorage.removeItem('preview');
    $('drawer').hidden = true;
    render();
  }
};

function closeAdd() {
  $('admin-bar')?.classList.remove('add-open');
}

function addItem(extra) {
  const n = pageData().items.filter(i => i.type !== 'section').length;
  const underHero = getData().hero.on !== false ? 80 : 8;
  const item = {
    id: uid(),
    x: 4 + (n % 5) * 8,
    y: underHero + (n % 5) * 6,
    ...extra
  };
  pageData().items.push(item);
  $('drawer').hidden = true;
  closeAdd();
  skipClickUntil = Date.now() + 400;
  saveLocal();
  render().then(() => choose(item.id, false));
}

function removeThing(id, layerId) {
  if (layerId) {
    const h = getData().hero;
    h.layers = h.layers.filter(l => l.id !== layerId);
  } else if (id) {
    const p = pageData();
    p.items = p.items.filter(i => i.id !== id);
    picked.delete(id);
  }
  $('drawer').hidden = true;
  saveLocal();
  render();
}

function clearSelection() {
  picked.clear();
  document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  $('drawer').hidden = true;
}

function choose(id, add) {
  if (!add) picked.clear();
  if (picked.has(id) && add) picked.delete(id);
  else picked.add(id);
  document.querySelectorAll('.box, .free-text, .btn-item, .hero-layer').forEach(b => {
    b.classList.toggle('selected', picked.has(b.dataset.id));
  });
  const item = pageData().items.find(i => i.id === id);
  if (!add && (item?.type === 'box' || item?.type === 'button')) drawerItem(item);
  else if (picked.size !== 1) $('drawer').hidden = true;
}

function drawerItem(item) {
  cropItem = item;
  const d = $('drawer');
  d.hidden = false;
  const photo = item.type === 'box' ? `
    <label>Photo</label>
    <div class="row">
      <button type="button" id="f-imp">Import</button>
      <button type="button" class="ghost" id="f-rm">Remove</button>
    </div>
    <label>Zoom</label>
    <input id="f-zoom" type="range" min="1" max="3" step="0.05" value="${item.zoom || 1}">
    <label>Crop X</label>
    <input id="f-px" type="range" min="0" max="100" value="${item.px || 50}">
    <label>Crop Y</label>
    <input id="f-py" type="range" min="0" max="100" value="${item.py || 50}">` : '';
  const color = item.type === 'button' ? `
    <label>Color</label>
    <input id="f-color" type="color" value="${attr(item.color || '#e3292e')}">` : '';
  d.innerHTML = `
    <h3>${item.type === 'button' ? 'Button' : 'Box'}</h3>
    <label>Name</label>
    <input id="f-text" value="${attr(item.text)}">
    ${photo}${color}
    <label class="check"><input id="f-linkon" type="checkbox"${item.linkOn ? ' checked' : ''}> Clickable link</label>
    <label>Link path</label>
    <input id="f-href" value="${attr(item.href)}" placeholder="/work"${item.linkOn ? '' : ' disabled'}>
    <div class="row">
      <button type="button" id="f-apply">Apply</button>
      <button type="button" class="ghost" id="f-del">Delete</button>
    </div>`;
  d.querySelector('#f-linkon').onchange = e => {
    d.querySelector('#f-href').disabled = !e.target.checked;
  };
  const img = () => document.querySelector(`.tile[data-id="${item.id}"] img`);
  const live = () => {
    const el = img();
    if (!el) return;
    el.style.transform = `scale(${item.zoom || 1})`;
    el.style.objectPosition = `${item.px || 50}% ${item.py || 50}%`;
  };
  d.querySelector('#f-zoom')?.addEventListener('input', e => { item.zoom = +e.target.value; live(); });
  d.querySelector('#f-px')?.addEventListener('input', e => { item.px = +e.target.value; live(); });
  d.querySelector('#f-py')?.addEventListener('input', e => { item.py = +e.target.value; live(); });
  d.querySelector('#f-imp')?.addEventListener('click', () => $('box-file').click());
  d.querySelector('#f-rm')?.addEventListener('click', () => {
    item.photo = '';
    render();
    choose(item.id, false);
  });
  d.querySelector('#f-apply').onclick = () => {
    item.text = d.querySelector('#f-text').value;
    item.linkOn = d.querySelector('#f-linkon').checked;
    item.href = d.querySelector('#f-href').value.trim() || '/';
    if (item.type === 'button') item.color = d.querySelector('#f-color').value;
    const slug = item.href.replace(/^\/+/, '');
    if (item.linkOn && slug && slug !== 'home' && !getData().pages[slug]) getData().pages[slug] = { items: [] };
    saveLocal();
    render();
    choose(item.id, false);
  };
  d.querySelector('#f-del').onclick = () => removeThing(item.id);
}

function drawerNav(focusIndex) {
  const s = getData();
  if (!s.nav) s.nav = [];
  const d = $('drawer');
  d.hidden = false;
  const rows = s.nav.map((n, i) => `
    <div class="nav-row">
      <div>
        <label>Label</label>
        <input data-nav-label="${i}" value="${attr(n.label)}">
      </div>
      <div>
        <label>Link</label>
        <input data-nav-href="${i}" value="${attr(n.href)}" placeholder="/about">
      </div>
      <button type="button" class="ghost" data-nav-del="${i}">×</button>
    </div>`).join('');
  d.innerHTML = `
    <h3>Navbar</h3>
    <label>Site name</label>
    <input id="n-site" value="${attr(s.site)}">
    ${rows || '<p class="err">No links yet</p>'}
    <div class="row">
      <button type="button" id="n-add">Add link</button>
      <button type="button" id="n-apply">Apply</button>
    </div>`;
  const applyFields = () => {
    s.site = d.querySelector('#n-site').value.trim() || s.site;
    s.nav.forEach((n, i) => {
      const label = d.querySelector(`[data-nav-label="${i}"]`);
      const href = d.querySelector(`[data-nav-href="${i}"]`);
      if (label) n.label = label.value.trim() || n.label;
      if (href) {
        n.href = href.value.trim() || '/';
        const slug = n.href.replace(/^\/+/, '');
        if (slug && slug !== 'home' && !s.pages[slug]) s.pages[slug] = { items: [] };
      }
    });
  };
  d.querySelector('#n-add').onclick = () => {
    applyFields();
    s.nav.push({ label: 'Link', href: '/' });
    saveLocal();
    drawerNav(s.nav.length - 1);
  };
  d.querySelectorAll('[data-nav-del]').forEach(btn => {
    btn.onclick = () => {
      applyFields();
      s.nav.splice(+btn.dataset.navDel, 1);
      saveLocal();
      drawerNav();
    };
  });
  d.querySelector('#n-apply').onclick = () => {
    applyFields();
    saveLocal();
    render();
    drawerNav();
  };
  const focus = d.querySelector(`[data-nav-label="${focusIndex}"]`);
  if (focus) focus.focus();
}

function selectLayer(id) {
  picked.clear();
  document.querySelectorAll('.box, .free-text, .btn-item').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.hero-layer').forEach(b => b.classList.toggle('selected', b.dataset.layer === id));
  if (!id) $('drawer').hidden = true;
}

function addHeroText() {
  getData().hero.layers.push({
    id: uid(), kind: 'text', text: 'Text', x: 20, y: 20, w: 40, h: 10, color: '#ffffff'
  });
  saveLocal();
  render();
}

function drawerHero() {
  const h = getData().hero;
  const s = getData();
  const cta = h.layers.find(l => l.kind === 'cta');
  const d = $('drawer');
  d.hidden = false;
  d.innerHTML = `
    <h3>Site & hero</h3>
    <label>Site name</label>
    <input id="h-site" value="${attr(s.site)}">
    <label>Admin password</label>
    <input id="h-pass" type="password" value="${attr(s.password)}">
    <label>Button path</label>
    <input id="h-ctaHref" value="${attr(cta?.href || '/work')}">
    <label>Or media URL / path</label>
    <input id="h-src" value="${h.src === IDB_HERO ? '' : attr(h.src)}" placeholder="media/hero.mp4">
    <div class="row"><button type="button" id="h-apply">Apply</button></div>`;
  d.querySelector('#h-apply').onclick = () => {
    s.site = d.querySelector('#h-site').value.trim() || s.site;
    s.password = d.querySelector('#h-pass').value;
    if (cta) cta.href = d.querySelector('#h-ctaHref').value.trim() || '/';
    const src = d.querySelector('#h-src').value.trim();
    if (src) {
      h.src = src;
      h.type = /\.(mp4|webm|mov)(\?|$)/i.test(src) ? 'video' : 'image';
      $('hero').dataset.src = '';
      resetHeroPlay();
    }
    saveLocal();
    render();
  };
}

async function importHero(file) {
  const video = file.type.startsWith('video/');
  if (!video && !file.type.startsWith('image/')) return;
  const h = getData().hero;
  h.type = video ? 'video' : 'image';
  if (!video && file.size < 1.2e6) {
    h.src = await fileToData(file);
    await delHeroFile();
  } else {
    await putHeroFile(file);
    h.src = IDB_HERO;
  }
  $('hero').dataset.src = '';
  resetHeroPlay();
  saveLocal();
  render();
}

async function removeHeroMedia() {
  getData().hero.src = '';
  getData().hero.type = 'image';
  await delHeroFile();
  $('hero').dataset.src = '';
  resetHeroPlay();
  saveLocal();
  render();
}

function fileToData(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function members(item) {
  return item.group ? pageData().items.filter(i => i.group === item.group) : [item];
}

function nodesOf(group) {
  return group.map(i => document.querySelector(`[data-id="${i.id}"]`)).filter(Boolean);
}

function listen(move, end) {
  const onMove = ev => {
    ev.preventDefault();
    move(ev);
  };
  const onEnd = ev => {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onEnd, true);
    document.removeEventListener('pointercancel', onEnd, true);
    end(ev);
  };
  document.addEventListener('pointermove', onMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onEnd, true);
  document.addEventListener('pointercancel', onEnd, true);
}

function grab(e, el, item, stage, isLayer) {
  const group = isLayer ? [item] : members(item);
  const nodes = isLayer ? [el] : nodesOf(group);
  const x0 = e.clientX;
  const y0 = e.clientY;
  const start = group.map(i => ({ id: i.id, x: i.x, y: i.y }));
  let dragging = false;
  listen(ev => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!dragging) {
      if (Math.hypot(dx, dy) < 6) return;
      dragging = true;
      nodes.forEach(n => {
        n.classList.add('dragging');
        n.style.zIndex = '80';
      });
    }
    nodes.forEach(n => {
      n.style.transform = `translate(${dx}px, ${dy}px)`;
    });
  }, async ev => {
    if (!dragging) {
      if (!isLayer) choose(item.id, e.shiftKey);
      return;
    }
    skipClickUntil = Date.now() + 500;
    const pw = Math.max(stage.width, 1);
    const yBase = isLayer ? Math.max(stage.height, 1) : Math.max(window.innerHeight, 1);
    const dx = ((ev.clientX - x0) / pw) * 100;
    const dy = ((ev.clientY - y0) / yBase) * 100;
    start.forEach(s => {
      const i = isLayer ? item : pageData().items.find(x => x.id === s.id);
      if (!i) return;
      i.x = clamp((s.x || 0) + dx, 0, 98);
      i.y = clamp((s.y || 0) + dy, 0, 400);
    });
    nodes.forEach(n => {
      n.classList.remove('dragging');
      n.style.transform = '';
      n.style.zIndex = '';
    });
    saveLocal();
    await render();
    if (!isLayer) choose(item.id, false);
  });
}

function resizeItem(e, el, item, stage) {
  e.preventDefault();
  e.stopPropagation();
  const rect = el.getBoundingClientRect();
  const sx = e.clientX;
  const sy = e.clientY;
  const minW = 36;
  const minH = 28;
  el.classList.add('dragging');
  listen(ev => {
    const wpx = Math.max(minW, rect.width + (ev.clientX - sx));
    const hpx = Math.max(minH, rect.height + (ev.clientY - sy));
    el.style.width = `${wpx}px`;
    el.style.height = `${hpx}px`;
  }, async ev => {
    skipClickUntil = Date.now() + 500;
    const wpx = Math.max(minW, rect.width + (ev.clientX - sx));
    const hpx = Math.max(minH, rect.height + (ev.clientY - sy));
    const pw = Math.max(stage.width, 1);
    const ph = item.kind ? Math.max(stage.height, 1) : Math.max(window.innerHeight, 1);
    item.w = clamp((wpx / pw) * 100, 2, 100);
    item.h = Math.max(2, (hpx / ph) * 100);
    el.classList.remove('dragging');
    saveLocal();
    await render();
    if (item.id && !item.kind) choose(item.id, false);
  });
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function attr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
