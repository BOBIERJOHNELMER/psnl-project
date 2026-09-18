import {
  $, getData, saveLocal, publishLive, render, uid, isAdmin, isEditing, pageData, getHeroes, applyTheme,
  IDB_LOGO, putLogoFile, getLogoFile, delLogoFile,
  putMedia, delMedia, resetHeroPlay, HERO_H, contentBottom, photoStyle,
  overlap, findSpot, go
} from './main.js';

let picked = new Set();
let cropItem;
let fileItem;
let skipClickUntil = 0;
let storeTab = 'bin';
let imageEdit = null;

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
  $('reset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const a = $('reset-pass').value;
    const b = $('reset-ok').value;
    const err = $('reset-err');
    if (a.length < 4 || a !== b) {
      err.hidden = false;
      err.textContent = a !== b ? 'Passwords do not match.' : 'Use at least 4 characters.';
      return;
    }
    getData().password = a;
    getData().resetToken = '';
    saveLocal();
    history.replaceState(null, '', location.pathname);
    $('reset-modal').hidden = true;
  });
  $('reset-cancel')?.addEventListener('click', () => {
    $('reset-modal').hidden = true;
    history.replaceState(null, '', location.pathname);
  });

  $('admin-bar').onclick = e => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.getAttribute('data-act');
    if (act && actions[act]) actions[act]();
  };
  $('sel-bar').onclick = e => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.getAttribute('data-act');
    if (act && actions[act]) actions[act]();
  };

  document.addEventListener('click', e => {
    if (!isEditing()) return;
    if (Date.now() < skipClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      const hit = e.target.closest('.box, .free-text, .btn-item, .file-card, .shape-item');
      if (hit?.dataset.id) choose(hit.dataset.id, addKey(e));
      else if (picked.size) openSelectionDrawer();
      return;
    }
    const kill = e.target.closest('.kill');
    if (kill) {
      e.preventDefault();
      e.stopPropagation();
      removeThing(kill.dataset.kill, kill.dataset.killLayer);
      return;
    }
    if (hitPath(e, '.admin-bar, .sel-bar, .drawer, .modal, .hero-tools, .handle')) return;
    if (imageEdit && !e.target.closest('.img-edit')) {
      endImageCrop();
      return;
    }
    if (e.target.closest('#site-nav')) {
      if (e.target.closest('#sign-in') || e.target.closest('#theme-toggle')) return;
      e.preventDefault();
      drawerNav(e.target.closest('[data-nav]')?.dataset.nav);
      return;
    }
    const hit = e.target.closest('.box, .free-text, .btn-item, .file-card, .shape-item');
    if (hit) {
      if (e.target.closest('.file-actions')) return;
      e.preventDefault();
      choose(hit.dataset.id, addKey(e));
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
      const found = findLayer(layer.dataset.layer);
      if (found) found.layer.text = el.innerText.trim();
      return;
    }
    const wrap = el.closest('[data-id]');
    const item = pageData().items.find(i => i.id === (wrap?.dataset.id || el.dataset.id));
    if (!item) return;
    if (item.type === 'text') item.body = el.innerText;
    else if (el.dataset.field) item[el.dataset.field] = el.innerText;
    else if (item.type === 'button') item.text = el.innerText.trim();
  });

  $('heroes')?.addEventListener('click', e => {
    if (!isEditing()) return;
    const heroEl = e.target.closest('.hero');
    const hid = heroEl?.dataset.hero;
    if (e.target.closest('[data-hero-import]')) {
      $('hero-file').dataset.hero = hid || e.target.getAttribute('data-hero-import');
      $('hero-file').click();
      return;
    }
    if (e.target.closest('[data-hero-add-text]')) {
      addHeroText(e.target.getAttribute('data-hero-add-text') || hid);
      return;
    }
    if (e.target.closest('[data-hero-media-off]')) {
      removeHeroMedia(e.target.getAttribute('data-hero-media-off') || hid);
      return;
    }
    if (e.target.closest('[data-hero-del]')) {
      removeHeroBanner(e.target.getAttribute('data-hero-del') || hid);
      return;
    }
    if (e.target.closest('.hero-move')) return;
    const layer = e.target.closest('[data-layer]');
    if (layer) selectLayer(layer.dataset.layer);
    else if (!e.target.closest('.hero-tools, .kill')) selectLayer(null);
  });
  $('heroes')?.addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    const layer = e.target.closest('[data-layer]');
    const found = findLayer(layer?.dataset.layer);
    if (!found) return;
    found.layer.color = e.target.value;
    layer.style.color = found.layer.color;
  });
  $('heroes')?.addEventListener('dragover', e => { if (isEditing()) e.preventDefault(); });
  $('heroes')?.addEventListener('drop', e => {
    if (!isEditing()) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const hid = e.target.closest('.hero')?.dataset.hero;
    if (file) importHero(file, hid);
  });
  const hf = $('hero-file');
  if (hf) hf.onchange = () => {
    const file = hf.files[0];
    const hid = hf.dataset.hero;
    hf.value = '';
    hf.dataset.hero = '';
    if (file) importHero(file, hid);
  };
  const bf = $('box-file');
  if (bf) bf.onchange = async () => {
    const file = bf.files[0];
    bf.value = '';
    if (!file || !cropItem || !file.type.startsWith('image/')) return;
    cropItem.photo = await fileToData(file);
    cropItem.zoom = 1.2;
    cropItem.px = 50;
    cropItem.py = 50;
    saveLocal();
    render();
    choose(cropItem.id, false);
  };
  const lf = $('logo-file');
  if (lf) lf.onchange = async () => {
    const file = lf.files[0];
    lf.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const s = getData();
    if (!s.brand) s.brand = { mode: 'logo', logo: '', links: 'left' };
    await putLogoFile(file);
    s.brand.mode = 'logo';
    s.brand.logo = IDB_LOGO;
    saveLocal();
    await render();
    drawerNav();
  };
  const wf = $('widget-file');
  if (wf) wf.onchange = async () => {
    const file = wf.files[0];
    wf.value = '';
    if (!file || !fileItem) return;
    const prev = fileItem.fileId;
    const key = 'file:' + uid();
    await putMedia(key, file);
    fileItem.fileId = key;
    fileItem.fileName = file.name;
    fileItem.fileType = file.type || '';
    fileItem.fileSize = file.size;
    if (prev) await purgeFile({ type: 'file', fileId: prev, id: fileItem.id });
    if (!fileItem.title || fileItem.title === 'File') fileItem.title = file.name.replace(/\.[^.]+$/, '');
    saveLocal();
    await render();
    choose(fileItem.id, false);
  };
  document.addEventListener('pointerdown', e => {
    if (!isEditing()) return;
    if (e.target.closest('.kill, .admin-bar, .sel-bar, .drawer, .modal, .nav')) return;
    const heroMove = e.target.closest('.hero-move');
    if (heroMove) {
      e.preventDefault();
      const hid = heroMove.getAttribute('data-hero-move') || heroMove.closest('.hero')?.dataset.hero;
      const h = getHeroes().find(x => x.id === hid);
      const el = heroMove.closest('.hero');
      if (h && el) grabHero(e, el, h);
      return;
    }
    const layer = e.target.closest('.hero-layer');
    if (layer) {
      const found = findLayer(layer.dataset.layer);
      if (!found) return;
      const stage = layer.closest('.hero').getBoundingClientRect();
      selectLayer(found.layer.id);
      if (e.target.closest('.handle')) resizeItem(e, layer, found.layer, stage);
      else grab(e, layer, found.layer, stage, true);
      return;
    }
    const cropBox = e.target.closest('.img-edit');
    if (cropBox && imageEdit) {
      e.preventDefault();
      panImage(e, imageEdit.item, cropBox);
      return;
    }
    const hit = e.target.closest('.box, .free-text, .btn-item, .file-card, .shape-item');
    if (!hit) return;
    if (e.target.closest('.file-actions')) return;
    const item = pageData().items.find(i => i.id === hit.dataset.id);
    if (!item) return;
    const stage = ($('site') || $('stage')).getBoundingClientRect();
    const add = addKey(e);
    if (e.target.closest('.handle')) {
      choose(item.id, add);
      skipClickUntil = Date.now() + 600;
      resizeItem(e, hit, item, stage);
      return;
    }
    if (add || !e.target.closest('[contenteditable], input, label')) e.preventDefault();
    choose(item.id, add);
    skipClickUntil = Date.now() + 600;
    if (!add && e.target.closest('[contenteditable], input, label')) return;
    grab(e, hit, item, stage, false);
  });
  document.addEventListener('dblclick', e => {
    if (!isEditing()) return;
    const hit = e.target.closest('.box, .shape-item');
    if (!hit || e.target.closest('.kill, .handle, .drawer, .admin-bar')) return;
    const item = pageData().items.find(i => i.id === hit.dataset.id);
    if (!item?.photo) return;
    e.preventDefault();
    startImageCrop(item, hit);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && imageEdit) endImageCrop();
  });
  document.addEventListener('wheel', e => {
    if (!isEditing() || !imageEdit) return;
    if (!e.target.closest('.img-edit')) return;
    e.preventDefault();
    const item = imageEdit.item;
    item.zoom = clamp((Number(item.zoom) || 1) + (e.deltaY > 0 ? -0.1 : 0.1), 1, 5);
    paintPhoto(item);
    const root = document.querySelector(`#drawer [data-gid="${item.id}"]`) || $('drawer');
    const z = field(root, 'zoom');
    if (z) z.value = item.zoom;
  }, { passive: false });
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
  store() { closeAdd(); drawerStore(); },
  nav() { closeAdd(); drawerNav(); },
  group() {
    if (picked.size < 2) return;
    const gid = uid();
    pageData().items.forEach(i => { if (picked.has(i.id)) i.group = gid; });
    saveLocal();
    keepDrawer();
    openSelectionDrawer();
    restorePicked();
  },
  ungroup() {
    pageData().items.forEach(i => { if (picked.has(i.id)) delete i.group; });
    saveLocal();
    keepDrawer();
    openSelectionDrawer();
    restorePicked();
  },
  password() { closeAdd(); drawerHero(); },
  hero() { closeAdd(); drawerHero(); },
  theme() {
    const next = (sessionStorage.getItem('theme') || getData().theme || 'dark') === 'light' ? 'dark' : 'light';
    getData().theme = next;
    sessionStorage.setItem('theme', next);
    saveLocal();
    applyTheme();
    render();
  },
  'hero-add'() {
    const list = getHeroes();
    const y = contentBottom() > 4 ? contentBottom() + 2 : 0;
    list.push({
      id: uid(),
      type: 'image',
      src: '',
      on: true,
      y,
      h: HERO_H,
      layers: [
        { id: uid(), kind: 'title', text: getData().site || 'Title', x: 10, y: 36, w: 80, h: 18, color: '#ffffff' }
      ]
    });
    closeAdd();
    saveLocal();
    resetHeroPlay();
    render();
  },
  'hero-remove'() {
    const list = getHeroes();
    const live = list.filter(h => h.on !== false);
    const last = live[live.length - 1];
    if (last) last.on = false;
    closeAdd();
    saveLocal();
    render();
  },
  preview() {
    if (!isAdmin()) return;
    if (isEditing()) sessionStorage.setItem('preview', '1');
    else sessionStorage.removeItem('preview');
    hideDrawer();
    picked.clear();
    closeAdd();
    updateSelBar();
    render();
  },
  toggle() {
    const bar = $('admin-bar');
    bar.classList.toggle('min');
    sessionStorage.setItem('adminBarMin', bar.classList.contains('min') ? '1' : '0');
    $('bar-toggle').textContent = bar.classList.contains('min') ? 'Open' : 'Minimize';
  },
  async save() {
    saveLocal();
    $('save-msg').textContent = 'Publishing…';
    try {
      await publishLive();
      $('save-msg').textContent = 'Live for everyone';
    } catch (err) {
      $('save-msg').textContent = err.status === 413
        ? 'Too large to publish. Use a smaller photo.'
        : 'Could not publish live';
    }
    setTimeout(() => { $('save-msg').textContent = ''; }, 4000);
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
    hideDrawer();
    render();
  }
};

function closeAdd() {
  $('admin-bar')?.classList.remove('add-open');
}

function addItem(extra) {
  const n = pageData().items.filter(i => i.type !== 'section').length;
  const underHero = getHeroes().filter(h => h.on !== false).length * 80 || 8;
  const item = {
    id: uid(),
    x: 4 + (n % 5) * 8,
    y: underHero + (n % 5) * 6,
    ...extra
  };
  pageData().items.push(item);
  findSpot(item, pageData().items);
  hideDrawer();
  closeAdd();
  skipClickUntil = Date.now() + 400;
  saveLocal();
  render().then(() => choose(item.id, false));
}

function stash() {
  const s = getData();
  if (!s.store) s.store = { items: [], pages: [] };
  if (!s.store.items) s.store.items = [];
  if (!s.store.pages) s.store.pages = [];
  return s.store;
}

function linkedSlug(item) {
  if (!item?.linkOn && item?.kind !== 'cta') return '';
  const slug = String(item.href || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!slug || slug === 'home' || slug === 'index.html') return '';
  return slug;
}

function askStore(msg) {
  return new Promise(resolve => {
    const m = $('confirm-modal');
    $('confirm-msg').textContent = msg;
    m.hidden = false;
    const done = v => {
      m.hidden = true;
      resolve(v);
    };
    $('confirm-store').onclick = () => done('store');
    $('confirm-delete').onclick = () => done('delete');
    $('confirm-cancel').onclick = () => done('cancel');
  });
}

function fileIdUsed(fileId, exceptId) {
  if (!fileId) return false;
  const s = getData();
  const lists = [...Object.values(s.pages || {}).map(p => p.items || []), s.store?.items || []];
  for (const pg of s.store?.pages || []) lists.push(pg.data?.items || []);
  return lists.some(arr => arr.some(i => i.fileId === fileId && i.id !== exceptId));
}

async function purgeFile(item) {
  if (item?.type === 'file' && item.fileId && !fileIdUsed(item.fileId, item.id)) {
    await delMedia(item.fileId);
  }
}

async function removeThing(id, layerId) {
  if (layerId) {
    getHeroes().forEach(h => {
      h.layers = (h.layers || []).filter(l => l.id !== layerId);
    });
    hideDrawer();
    saveLocal();
    render();
    return;
  }
  if (!id) return;
  const p = pageData();
  const item = p.items.find(i => i.id === id);
  if (!item) return;
  const slug = linkedSlug(item);
  const pageExists = slug && getData().pages[slug];
  const msg = pageExists
    ? 'Do you want to store this item and its page instead of deleting them?'
    : 'Do you want to store this item instead of deleting it?';
  const choice = await askStore(msg);
  if (choice === 'cancel') return;
  if (choice === 'store') storeItem(item, slug);
  else {
    await purgeFile(item);
    wipeItem(item, slug);
  }
  picked.delete(id);
  hideDrawer();
  saveLocal();
  render();
}

function storeItem(item, slug) {
  const bin = stash();
  const p = pageData();
  p.items = p.items.filter(i => i.id !== item.id);
  bin.items.push({ ...JSON.parse(JSON.stringify(item)), _from: slugFromHere() });
  if (slug) storePage(slug);
}

function wipeItem(item, slug) {
  const p = pageData();
  p.items = p.items.filter(i => i.id !== item.id);
  if (slug) wipePage(slug);
}

function slugFromHere() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  return p === '/' || p === '/index.html' ? 'home' : decodeURIComponent(p.slice(1));
}

function storePage(slug) {
  if (!slug || slug === 'home') return;
  const s = getData();
  const page = s.pages[slug];
  if (!page) return;
  const bin = stash();
  if (!bin.pages.some(p => p.slug === slug)) {
    const label = (s.nav || []).find(n => n.href === '/' + slug || n.href === slug)?.label || slug;
    bin.pages.push({ slug, label, data: JSON.parse(JSON.stringify(page)) });
  }
  delete s.pages[slug];
  s.nav = (s.nav || []).filter(n => n.href !== '/' + slug && n.href !== slug);
}

function wipePage(slug) {
  if (!slug || slug === 'home') return;
  const s = getData();
  delete s.pages[slug];
  s.nav = (s.nav || []).filter(n => n.href !== '/' + slug && n.href !== slug);
  const bin = stash();
  bin.pages = bin.pages.filter(p => p.slug !== slug);
}

function restoreStoredItem(entry, x, y) {
  const item = JSON.parse(JSON.stringify(entry));
  delete item._from;
  item.id = uid();
  item.x = clamp(x, 0, 90);
  item.y = Math.max(0, y);
  pageData().items.push(item);
  findSpot(item, pageData().items);
}

function restoreStoredPage(entry) {
  const s = getData();
  s.pages[entry.slug] = JSON.parse(JSON.stringify(entry.data || { items: [] }));
  stash().pages = stash().pages.filter(p => p.slug !== entry.slug);
}

function drawerStore(tab) {
  if (tab) storeTab = tab;
  keepDrawer();
  const d = $('drawer');
  d.hidden = false;
  const bin = stash();
  const on = (ok, extra = 'ghost') => ok ? '' : extra;
  if (storeTab === 'template') {
    d.innerHTML = `
      <h3>Store</h3>
      <div class="row">
        <button type="button" id="store-bin" class="${on(false)}">Bin</button>
        <button type="button" id="store-tpl" class="${on(true)}">Template</button>
      </div>
      <p class="err" style="color:var(--muted)">Drag a template onto the page. It stays in Store so you can use it again.</p>
      <label>Feature templates</label>
      <div class="store-card tpl-card" data-tpl="file">
        <i class="tpl-mark">FILE</i>
        <div class="meta">
          <strong>File drop</strong>
          <span>Import a file. Viewers can open it on the page and download it.</span>
        </div>
      </div>
      <label>Shapes</label>
      ${['rect|Box', 'round|Round', 'circle|Circle', 'pill|Pill', 'diamond|Diamond', 'triangle|Triangle', 'hex|Hex'].map(pair => {
        const [id, name] = pair.split('|');
        return `<div class="store-card tpl-card" data-tpl="shape:${id}">
          <i class="tpl-shape s-${id}"></i>
          <div class="meta"><strong>${name}</strong><span>Color, photo, crop · drag onto the page</span></div>
        </div>`;
      }).join('')} `;
    d.querySelector('#store-bin').onclick = e => { e.stopPropagation(); drawerStore('bin'); };
    d.querySelector('#store-tpl').onclick = e => { e.stopPropagation(); drawerStore('template'); };
    d.querySelectorAll('[data-tpl]').forEach(card => {
      card.onpointerdown = e => startTplDrag(e, card.dataset.tpl);
    });
    return;
  }
  const items = bin.items.map((it, i) => {
    const name = it.text || it.body || it.title || it.fileName || it.type;
    const color = it.color || (it.type === 'button' ? '#e3292e' : it.type === 'file' ? '#e3292e' : '#333');
    return `<div class="store-card" data-store-item="${i}">
      <i class="swatch" style="background:${attr(color)}"></i>
      <div class="meta"><strong>${attr(name)}</strong><span>${attr(it.type)} · drag onto the page</span></div>
    </div>`;
  }).join('');
  const pages = bin.pages.map((pg, i) => `
    <div class="store-card" data-store-page="${i}">
      <div class="meta"><strong>${attr(pg.label || pg.slug)}</strong><span>page /${attr(pg.slug)}</span></div>
      <button type="button" class="ghost" data-restore-page="${i}">Restore</button>
    </div>`).join('');
  d.innerHTML = `
    <h3>Store</h3>
    <div class="row">
      <button type="button" id="store-bin" class="${on(true)}">Bin</button>
      <button type="button" id="store-tpl" class="${on(false)}">Template</button>
    </div>
    <p class="err" style="color:var(--muted)">Stored items are hidden from the site. Drag a box or button onto this page to use it again.</p>
    <label>Items</label>
    ${items || '<p class="err">No stored boxes or buttons</p>'}
    <label>Pages</label>
    ${pages || '<p class="err">No stored pages</p>'}`;
  d.querySelector('#store-bin').onclick = e => { e.stopPropagation(); drawerStore('bin'); };
  d.querySelector('#store-tpl').onclick = e => { e.stopPropagation(); drawerStore('template'); };
  d.querySelectorAll('[data-store-item]').forEach(card => {
    card.onpointerdown = e => startStoreDrag(e, +card.dataset.storeItem);
  });
  d.querySelectorAll('[data-restore-page]').forEach(btn => {
    btn.onclick = async ev => {
      ev.stopPropagation();
      const entry = stash().pages[+btn.dataset.restorePage];
      if (!entry) return;
      restoreStoredPage(entry);
      sessionStorage.removeItem('preview');
      saveLocal();
      await go('/' + entry.slug);
    };
  });
}

function startTplDrag(e, kind) {
  e.preventDefault();
  const ghost = e.currentTarget;
  ghost.style.opacity = '0.5';
  listen(ev => {
    ghost.style.outline = '1px dashed #e3292e';
  }, async ev => {
    ghost.style.opacity = '';
    ghost.style.outline = '';
    const drawer = $('drawer')?.getBoundingClientRect();
    if (drawer && ev.clientX >= drawer.left - 8) {
      drawerStore('template');
      return;
    }
    const site = ($('site') || $('stage')).getBoundingClientRect();
    const x = ((ev.clientX - site.left) / Math.max(site.width, 1)) * 100;
    const y = ((ev.clientY - site.top) / Math.max(window.innerHeight, 1)) * 100;
    const item = kind === 'file' ? {
      id: uid(),
      type: 'file',
      title: 'File',
      fileId: '',
      fileName: '',
      fileType: '',
      fileSize: 0,
      x: clamp(x, 0, 72),
      y: Math.max(0, y),
      w: 28,
      h: 24
    } : {
      id: uid(),
      type: 'shape',
      shape: kind.replace('shape:', '') || 'rect',
      color: '#e3292e',
      photo: '',
      zoom: 1,
      px: 50,
      py: 50,
      x: clamp(x, 0, 80),
      y: Math.max(0, y),
      w: 20,
      h: 20
    };
    pageData().items.push(item);
    findSpot(item, pageData().items);
    saveLocal();
    await render();
    drawerStore('template');
    choose(item.id, false);
  });
}

function startStoreDrag(e, index) {
  e.preventDefault();
  const entry = stash().items[index];
  if (!entry) return;
  const ghost = e.currentTarget;
  ghost.style.opacity = '0.5';
  listen(ev => {
    ghost.style.outline = '1px dashed #3b82f6';
  }, async ev => {
    ghost.style.opacity = '';
    ghost.style.outline = '';
    const site = ($('site') || $('stage')).getBoundingClientRect();
    const x = ((ev.clientX - site.left) / Math.max(site.width, 1)) * 100;
    const y = ((ev.clientY - site.top) / Math.max(window.innerHeight, 1)) * 100;
    const drawer = $('drawer')?.getBoundingClientRect();
    if (drawer && ev.clientX >= drawer.left - 8) {
      drawerStore();
      return;
    }
    restoreStoredItem(entry, x, y);
    stash().items.splice(index, 1);
    saveLocal();
    await render();
    drawerStore();
  });
}

function clearSelection() {
  picked.clear();
  document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  hideDrawer();
  updateSelBar();
}

function addKey(e) {
  return !!(e.shiftKey || e.ctrlKey || e.metaKey);
}

function relatedIds(id) {
  const item = pageData().items.find(i => i.id === id);
  if (item?.group) return pageData().items.filter(i => i.group === item.group).map(i => i.id);
  return [id];
}

function paintSelection() {
  document.querySelectorAll('.box, .free-text, .btn-item, .file-card, .shape-item, .hero-layer').forEach(b => {
    b.classList.toggle('selected', picked.has(b.dataset.id));
  });
}

function updateSelBar() {
  const bar = $('sel-bar');
  if (!bar) return;
  const many = picked.size >= 2;
  bar.hidden = !isEditing() || !many;
  const grouped = pageData().items.some(i => picked.has(i.id) && i.group);
  const un = $('sel-ungroup');
  if (un) un.hidden = !grouped;
}

async function restorePicked() {
  await render();
  paintSelection();
  updateSelBar();
  if (picked.size) openSelectionDrawer();
}

function field(root, name) {
  return root?.querySelector(`[data-f="${name}"]`);
}

function openSelectionDrawer() {
  const d = $('drawer');
  if (!d || !isEditing()) return;
  const items = pageData().items.filter(i => picked.has(i.id));
  if (!items.length) {
    d.hidden = true;
    d.classList.remove('is-open');
    return;
  }
  keepDrawer();
  if (items.length === 1) drawerItem(items[0]);
  else drawerGroup(items);
}

function choose(id, add) {
  if (!id) return;
  const ids = relatedIds(id);
  if (!add) picked.clear();
  ids.forEach(x => picked.add(x));
  paintSelection();
  updateSelBar();
  openSelectionDrawer();
}

function typeLabel(item) {
  if (item.type === 'button') return 'Button';
  if (item.type === 'text') return 'Text';
  if (item.type === 'shape') return 'Shape';
  if (item.type === 'file') return 'File';
  return 'Box';
}

function itemHeading(item, i) {
  const name = item.text || item.body || item.title || item.fileName || '';
  const n = i + 1;
  return name ? `${typeLabel(item)} ${n} — ${name}` : `${typeLabel(item)} ${n}`;
}

function fieldsHtml(item) {
  if (item.type === 'file') {
    const has = !!item.fileId;
    return `
      <label>Title</label>
      <input data-f="text" value="${attr(item.title || '')}" placeholder="Press kit, resume, lookbook">
      <label>File</label>
      <div class="nav-logo-preview">${has ? `<span>${attr(item.fileName || 'File ready')} · saved</span>` : '<span>No file yet</span>'}</div>
      <div class="row">
        <button type="button" data-f="imp">Import</button>
        <button type="button" class="ghost" data-f="rm">Remove</button>
      </div>`;
  }
  const colorVal = item.color || (item.type === 'button' || item.type === 'shape' ? '#e3292e' : item.type === 'text' ? '#ffffff' : '#141414');
  const photo = (item.type === 'box' || item.type === 'shape') ? `
    <label>Photo</label>
    <div class="row">
      <button type="button" data-f="imp">Import</button>
      <button type="button" class="ghost" data-f="rm">Remove</button>
    </div>
    <label>Zoom</label>
    <input data-f="zoom" type="range" min="1" max="5" step="0.05" value="${item.zoom || 1}">
    <label>Crop X</label>
    <input data-f="px" type="range" min="0" max="100" value="${item.px == null ? 50 : item.px}">
    <label>Crop Y</label>
    <input data-f="py" type="range" min="0" max="100" value="${item.py == null ? 50 : item.py}">
    <p class="err" style="color:var(--muted)">Double-click the photo to drag, zoom, and crop it inside the box.</p>` : '';
  const shapePick = item.type === 'shape' ? `
    <label>Shape</label>
    <select data-f="shape">
      ${['rect', 'round', 'circle', 'pill', 'diamond', 'triangle', 'hex'].map(s =>
        `<option value="${s}"${item.shape === s ? ' selected' : ''}>${s}</option>`
      ).join('')}
    </select>` : '';
  const name = item.type === 'text' ? `
    <label>Text</label>
    <input data-f="text" value="${attr(item.body)}">` : item.type === 'shape' ? '' : `
    <label>Name</label>
    <input data-f="text" value="${attr(item.text)}">`;
  const link = (item.type === 'text' || item.type === 'shape') ? '' : linkFields(item);
  return `
    ${name}
    ${shapePick}
    <label>Color</label>
    <input data-f="color" type="color" value="${attr(colorVal)}">
    ${photo}
    ${link}`;
}

function applyFields(item, root) {
  const textEl = field(root, 'text');
  if (textEl) {
    if (item.type === 'text') item.body = textEl.value;
    else if (item.type === 'file') item.title = textEl.value.trim() || item.fileName || 'File';
    else item.text = textEl.value;
  }
  const color = field(root, 'color');
  if (color) item.color = color.value;
  const shape = field(root, 'shape');
  if (shape) item.shape = shape.value || item.shape;
  const zoom = field(root, 'zoom');
  if (zoom) item.zoom = +zoom.value;
  const px = field(root, 'px');
  if (px) item.px = +px.value;
  const py = field(root, 'py');
  if (py) item.py = +py.value;
  if (item.type !== 'text' && item.type !== 'shape' && item.type !== 'file') applyLinkFields(item, root);
}

function bindFields(item, root) {
  bindColor(item, field(root, 'color'));
  bindLinkFields(item, root);
  const live = () => {
    const el = document.querySelector(`.tile[data-id="${item.id}"] img`);
    if (el) el.style.cssText = photoStyle(item);
  };
  field(root, 'zoom')?.addEventListener('input', e => { item.zoom = +e.target.value; live(); });
  field(root, 'px')?.addEventListener('input', e => { item.px = +e.target.value; live(); });
  field(root, 'py')?.addEventListener('input', e => { item.py = +e.target.value; live(); });
  field(root, 'imp')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (item.type === 'file') {
      fileItem = item;
      $('widget-file').click();
    } else {
      cropItem = item;
      $('box-file').click();
    }
  });
  field(root, 'rm')?.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    if (item.type === 'file') {
      await purgeFile(item);
      item.fileId = '';
      item.fileName = '';
      item.fileType = '';
      item.fileSize = 0;
    } else item.photo = '';
    saveLocal();
    await render();
    openSelectionDrawer();
  });
}

function drawerGroup(items) {
  keepDrawer();
  const d = $('drawer');
  if (!d) return;
  d.hidden = false;
  d.classList.add('is-open');
  cropItem = items.find(i => i.type === 'box' || i.type === 'shape') || items[0];
  d.innerHTML = `
    <h3>Group</h3>
    <p class="err" style="color:var(--muted)">${items.length} grouped items. Each block is one item.</p>
    ${items.map((item, i) => `
      <section class="group-block" data-gid="${attr(item.id)}">
        <h4>${attr(itemHeading(item, i))}</h4>
        ${fieldsHtml(item)}
      </section>`).join('')}
    <div class="row">
      <button type="button" data-f="apply-all">Apply all</button>
    </div>`;
  items.forEach(item => {
    const root = d.querySelector(`[data-gid="${item.id}"]`);
    if (root) bindFields(item, root);
  });
  field(d, 'apply-all').onclick = () => {
    items.forEach(item => {
      const root = d.querySelector(`[data-gid="${item.id}"]`);
      if (root) applyFields(item, root);
    });
    saveLocal();
    render().then(() => openSelectionDrawer());
  };
}

function drawerItem(item) {
  if (item.type === 'file') return drawerFile(item);
  cropItem = item;
  const d = $('drawer');
  d.hidden = false;
  d.classList.add('is-open');
  d.innerHTML = `
    <h3>${typeLabel(item)}</h3>
    ${fieldsHtml(item)}
    <div class="row">
      <button type="button" data-f="apply">Apply</button>
      <button type="button" class="ghost" data-f="del">Delete</button>
    </div>`;
  bindFields(item, d);
  field(d, 'apply').onclick = () => {
    applyFields(item, d);
    saveLocal();
    render();
    choose(item.id, false);
  };
  field(d, 'del').onclick = () => removeThing(item.id);
}

function drawerFile(item) {
  fileItem = item;
  keepDrawer();
  const d = $('drawer');
  d.hidden = false;
  const has = !!item.fileId;
  d.innerHTML = `
    <h3>File</h3>
    <label>Title</label>
    <input id="f-text" value="${attr(item.title || '')}" placeholder="Press kit, resume, lookbook">
    <label>File</label>
    <div class="nav-logo-preview">${has ? `<span>${attr(item.fileName || 'File ready')} · saved</span>` : '<span>No file yet</span>'}</div>
    <div class="row">
      <button type="button" id="f-imp">Import</button>
      <button type="button" class="ghost" id="f-rm">Remove</button>
    </div>
    <p class="err" style="color:var(--muted)">Viewers can open this file on the page and download it. Import PDF, photo, video, or any other file.</p>
    <div class="row">
      <button type="button" id="f-apply">Apply</button>
      <button type="button" class="ghost" id="f-del">Delete</button>
    </div>`;
  d.querySelector('#f-imp').onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    $('widget-file').click();
  };
  d.querySelector('#f-rm').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    await purgeFile(item);
    item.fileId = '';
    item.fileName = '';
    item.fileType = '';
    item.fileSize = 0;
    saveLocal();
    await render();
    choose(item.id, false);
  };
  d.querySelector('#f-apply').onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    item.title = d.querySelector('#f-text').value.trim() || item.fileName || 'File';
    saveLocal();
    render().then(() => choose(item.id, false));
  };
  d.querySelector('#f-del').onclick = () => removeThing(item.id);
}

function pageList() {
  const stored = new Set((getData().store?.pages || []).map(p => p.slug));
  return Object.keys(getData().pages || {}).filter(k => k !== 'home' && !stored.has(k));
}

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
}

function uniqueSlug(base) {
  let slug = slugify(base);
  const pages = getData().pages;
  if (!pages[slug]) return slug;
  let n = 2;
  while (pages[`${slug}-${n}`]) n += 1;
  return `${slug}-${n}`;
}

function ensurePage(slug) {
  const s = getData();
  if (!slug || slug === 'home') return;
  if (!s.pages[slug]) s.pages[slug] = { items: [] };
}

function fillCreatedPath(d, href) {
  const input = field(d, 'href');
  if (input) input.value = href;
  const sel = field(d, 'page');
  if (!sel) return;
  if (![...sel.options].some(o => o.value === href)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${attr(href)}">${attr(href)}</option>`);
  }
  sel.value = href;
}

function linkFields(item) {
  const pages = pageList().map(k =>
    `<option value="/${k}"${item.href === '/' + k ? ' selected' : ''}>/${k}</option>`
  ).join('');
  return `
    <label class="check"><input data-f="linkon" type="checkbox"${item.linkOn ? ' checked' : ''}> Clickable link</label>
    <div class="link-box" data-f="linkbox"${item.linkOn ? '' : ' hidden'}>
      <label>Existing page</label>
      <select data-f="page">
        <option value="">Custom path</option>
        ${pages}
      </select>
      <label>Link path</label>
      <input data-f="href" value="${attr(item.href)}" placeholder="/work">
      <label>Or create a new page</label>
      <input data-f="newpage" placeholder="Page name">
      <div class="row">
        <button type="button" data-f="create">Create page</button>
        <button type="button" class="ghost" data-f="open">Open page</button>
      </div>
    </div>`;
}

function bindLinkFields(item, d) {
  const box = field(d, 'linkbox');
  const on = field(d, 'linkon');
  if (!on || !box) return;
  on.onchange = () => { box.hidden = !on.checked; };
  field(d, 'page')?.addEventListener('change', e => {
    if (e.target.value) field(d, 'href').value = e.target.value;
  });
  field(d, 'create')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const name = field(d, 'newpage').value.trim() || item.text || item.body || 'Page';
    const slug = uniqueSlug(name);
    ensurePage(slug);
    item.linkOn = true;
    item.href = '/' + slug;
    on.checked = true;
    box.hidden = false;
    fillCreatedPath(d, item.href);
    const nameField = field(d, 'newpage');
    if (nameField) nameField.value = '';
    saveLocal();
  });
  field(d, 'open')?.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    applyLinkFields(item, d);
    const slug = (item.href || '').replace(/^\/+/, '');
    if (!slug || slug === 'home') return;
    ensurePage(slug);
    sessionStorage.removeItem('preview');
    saveLocal();
    await go('/' + slug);
  });
}

function applyLinkFields(item, d) {
  const on = field(d, 'linkon');
  if (!on) return;
  item.linkOn = on.checked;
  item.href = field(d, 'href')?.value.trim() || '/';
  const slug = item.href.replace(/^\/+/, '');
  if (item.linkOn && slug && slug !== 'home') ensurePage(slug);
}

function bindColor(item, input) {
  if (!input) return;
  input.addEventListener('input', () => {
    item.color = input.value;
    const node = item.kind
      ? document.querySelector(`[data-layer="${item.id}"]`)
      : document.querySelector(`[data-id="${item.id}"]`);
    if (!node) return;
    if (item.type === 'text' || item.kind) node.style.color = item.color;
    else node.style.background = item.color;
  });
}

function hitPath(e, sel) {
  if (e.target instanceof Element && e.target.closest(sel)) return true;
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  return path.some(n => n instanceof Element && n.matches(sel));
}

function hideDrawer() {
  const d = $('drawer');
  if (!d) return;
  d.hidden = true;
  d.classList.remove('is-open');
}

function keepDrawer() {
  skipClickUntil = Date.now() + 1200;
  const d = $('drawer');
  if (!d) return;
  d.hidden = false;
  d.classList.add('is-open');
}

let logoPreviewUrl = '';

function brandState(s) {
  if (!s.brand) s.brand = { mode: 'name', logo: '', links: 'left' };
  if (s.brand.mode !== 'logo') s.brand.mode = 'name';
  if (!['left', 'center', 'right'].includes(s.brand.links)) s.brand.links = 'left';
  return s.brand;
}

async function drawerNav(focusIndex) {
  keepDrawer();
  const s = getData();
  if (!s.nav) s.nav = [];
  const brand = brandState(s);
  const d = $('drawer');
  d.hidden = false;
  if (logoPreviewUrl) {
    URL.revokeObjectURL(logoPreviewUrl);
    logoPreviewUrl = '';
  }
  let logoUrl = '';
  if (brand.logo === IDB_LOGO) {
    const file = await getLogoFile();
    if (file) {
      logoPreviewUrl = URL.createObjectURL(file);
      logoUrl = logoPreviewUrl;
    }
  } else if (brand.logo) {
    logoUrl = brand.logo;
  }
  const on = (ok, extra = 'ghost') => ok ? '' : extra;
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
      <div class="nav-actions">
        <button type="button" data-nav-create="${i}">Create page</button>
        <button type="button" class="ghost" data-nav-open="${i}">Open page</button>
        <button type="button" class="ghost" data-nav-del="${i}">Remove</button>
      </div>
    </div>`).join('');
  d.innerHTML = `
    <h3>Navbar</h3>
    <label>Brand</label>
    <div class="row">
      <button type="button" id="n-brand-name" class="${on(brand.mode === 'name')}">Site name</button>
      <button type="button" id="n-brand-logo" class="${on(brand.mode === 'logo')}">Image logo</button>
    </div>
    <label>Site name</label>
    <input id="n-site" value="${attr(s.site)}">
    <label>Logo</label>
    <div class="nav-logo-preview">${logoUrl ? `<img alt="" src="${attr(logoUrl)}">` : '<span>No logo yet</span>'}</div>
    <div class="row">
      <button type="button" id="n-logo-imp">Import</button>
      <button type="button" class="ghost" id="n-logo-rm">Remove</button>
    </div>
    <label>Link position</label>
    <div class="row">
      <button type="button" data-nav-pos="left" class="${on(brand.links === 'left')}">Left</button>
      <button type="button" data-nav-pos="center" class="${on(brand.links === 'center')}">Center</button>
      <button type="button" data-nav-pos="right" class="${on(brand.links === 'right')}">Right</button>
    </div>
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
      if (href) n.href = href.value.trim() || '/';
    });
  };
  const refresh = async (focus) => {
    saveLocal();
    await render();
    await drawerNav(focus);
  };
  const slugOf = href => String(href || '').replace(/^\/+/, '').replace(/\/+$/, '');
  d.querySelector('#n-brand-name').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    brand.mode = 'name';
    await refresh(focusIndex);
  };
  d.querySelector('#n-brand-logo').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    brand.mode = 'logo';
    await refresh(focusIndex);
  };
  d.querySelector('#n-logo-imp').onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    $('logo-file').click();
  };
  d.querySelector('#n-logo-rm').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    brand.logo = '';
    brand.mode = 'name';
    await delLogoFile();
    await refresh(focusIndex);
  };
  d.querySelectorAll('[data-nav-pos]').forEach(btn => {
    btn.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      applyFields();
      brand.links = btn.dataset.navPos;
      await refresh(focusIndex);
    };
  });
  d.querySelector('#n-add').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    const used = new Set(s.nav.map(n => String(n.label || '').toLowerCase()));
    let label = 'Link';
    let n = 2;
    while (used.has(label.toLowerCase())) {
      label = 'Link ' + n;
      n += 1;
    }
    s.nav.push({ label, href: '/' });
    await refresh(s.nav.length - 1);
  };
  d.querySelectorAll('[data-nav-del]').forEach(btn => {
    btn.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      applyFields();
      s.nav.splice(+btn.dataset.navDel, 1);
      await refresh();
    };
  });
  d.querySelectorAll('[data-nav-create]').forEach(btn => {
    btn.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      applyFields();
      const i = +btn.dataset.navCreate;
      const n = s.nav[i];
      if (!n) return;
      let slug = slugOf(n.href);
      if (!slug || slug === 'home') slug = uniqueSlug(n.label || 'page');
      ensurePage(slug);
      n.href = '/' + slug;
      await refresh(i);
    };
  });
  d.querySelectorAll('[data-nav-open]').forEach(btn => {
    btn.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      applyFields();
      const n = s.nav[+btn.dataset.navOpen];
      if (!n) return;
      const slug = slugOf(n.href);
      saveLocal();
      if (!slug || slug === 'home') {
        await go('/');
        await drawerNav(+btn.dataset.navOpen);
        return;
      }
      ensurePage(slug);
      sessionStorage.removeItem('preview');
      await go('/' + slug);
    };
  });
  d.querySelector('#n-apply').onclick = async e => {
    e.preventDefault();
    e.stopPropagation();
    applyFields();
    s.nav.forEach(n => {
      n.label = (n.label || '').trim() || 'Link';
      n.href = (n.href || '').trim() || '/';
    });
    await refresh();
  };
  const focus = d.querySelector(`[data-nav-label="${focusIndex}"]`);
  if (focus) focus.focus();
}

function findLayer(id) {
  if (!id) return null;
  for (const h of getHeroes()) {
    const layer = (h.layers || []).find(l => l.id === id);
    if (layer) return { hero: h, layer };
  }
  return null;
}

function selectLayer(id) {
  picked.clear();
  document.querySelectorAll('.box, .free-text, .btn-item, .shape-item, .file-card').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.hero-layer').forEach(b => b.classList.toggle('selected', b.dataset.layer === id));
  const found = findLayer(id);
  if (found) drawerLayer(found.layer);
  else hideDrawer();
}

function drawerLayer(item) {
  const d = $('drawer');
  keepDrawer();
  d.hidden = false;
  d.classList.add('is-open');
  if (item.kind === 'cta' && item.linkOn == null) item.linkOn = true;
  const link = item.kind === 'cta' ? linkFields(item) : '';
  d.innerHTML = `
    <h3>Hero ${item.kind === 'cta' ? 'button' : 'text'}</h3>
    <label>Text</label>
    <input id="f-text" value="${attr(item.text)}">
    <label>Color</label>
    <input id="f-color" type="color" value="${attr(item.color || '#ffffff')}">
    ${link}
    <div class="row">
      <button type="button" id="f-apply">Apply</button>
      <button type="button" class="ghost" id="f-del">Delete</button>
    </div>`;
  bindColor(item, d.querySelector('#f-color'));
  if (item.kind === 'cta') bindLinkFields(item, d);
  d.querySelector('#f-apply').onclick = () => {
    item.text = d.querySelector('#f-text').value;
    item.color = d.querySelector('#f-color').value;
    if (item.kind === 'cta') applyLinkFields(item, d);
    saveLocal();
    render();
    selectLayer(item.id);
  };
  d.querySelector('#f-del').onclick = () => removeThing(null, item.id);
}

function addHeroText(heroId) {
  const h = getHeroes().find(x => x.id === heroId) || getHeroes()[0];
  if (!h) return;
  if (!h.layers) h.layers = [];
  h.layers.push({
    id: uid(), kind: 'text', text: 'Text', x: 20, y: 20, w: 40, h: 10, color: '#ffffff'
  });
  saveLocal();
  render();
}

function drawerHero() {
  const list = getHeroes();
  const s = getData();
  const d = $('drawer');
  d.hidden = false;
  const theme = s.theme === 'light' ? 'light' : 'dark';
  d.innerHTML = `
    <h3>Settings</h3>
    <label>Site name</label>
    <input id="h-site" value="${attr(s.site)}">
    <label>Theme</label>
    <div class="row">
      <button type="button" id="h-dark" class="${theme === 'dark' ? '' : 'ghost'}">Dark</button>
      <button type="button" id="h-light" class="${theme === 'light' ? '' : 'ghost'}">Light</button>
    </div>
    <p class="err" style="color:var(--muted)">${list.filter(h => h.on !== false).length} hero banner(s). Drag Move banner to place it. New banners sit below existing items.</p>
    <label>Change password</label>
    <input id="h-pass-new" type="password" placeholder="New password" autocomplete="new-password">
    <input id="h-pass-ok" type="password" placeholder="Confirm new password" autocomplete="new-password">
    <p class="err" id="h-pass-err" hidden></p>
    <div class="row"><button type="button" id="h-pass">Change password</button></div>
    <p class="err" style="color:var(--muted)">This emails bobierjohnelmer525@gmail.com and  jebb2023-1748-13408@bicol-u.edu.ph, then logs you out.</p>
    <div class="row"><button type="button" id="h-apply">Apply</button></div>`;
  d.querySelector('#h-dark').onclick = () => { setTheme('dark'); drawerHero(); };
  d.querySelector('#h-light').onclick = () => { setTheme('light'); drawerHero(); };
  d.querySelector('#h-pass').onclick = () => changePassword();
  d.querySelector('#h-apply').onclick = () => {
    s.site = d.querySelector('#h-site').value.trim() || s.site;
    saveLocal();
    render();
    drawerHero();
  };
}

function drawerPassword() {
  keepDrawer();
  const d = $('drawer');
  d.hidden = false;
  d.innerHTML = `
    <h3>Change password</h3>
    <label>New password</label>
    <input id="h-pass-new" type="password" placeholder="New password" autocomplete="new-password">
    <label>Confirm</label>
    <input id="h-pass-ok" type="password" placeholder="Confirm new password" autocomplete="new-password">
    <p class="err" id="h-pass-err" hidden></p>
    <p class="err" style="color:var(--muted)">This emails bobierjohnelmer525@gmail.com and  jebb2023-1748-13408@bicol-u.edu.ph with the new password and a reset link, then logs you out.</p>
    <div class="row"><button type="button" id="h-pass">Change password</button></div>`;
  d.querySelector('#h-pass').onclick = () => changePassword();
}

function setTheme(mode) {
  getData().theme = mode;
  sessionStorage.setItem('theme', mode);
  saveLocal();
  applyTheme();
  const themeBtn = $('theme-toggle');
  if (themeBtn) themeBtn.textContent = mode === 'light' ? 'Dark' : 'Light';
}

async function changePassword() {
  const s = getData();
  const next = $('h-pass-new')?.value || '';
  const ok = $('h-pass-ok')?.value || '';
  const err = $('h-pass-err');
  if (next.length < 4) {
    err.hidden = false;
    err.textContent = 'Use at least 4 characters.';
    return;
  }
  if (next !== ok) {
    err.hidden = false;
    err.textContent = 'Passwords do not match.';
    return;
  }
  s.password = next;
  s.resetToken = uid() + uid();
  saveLocal();
  const reset = location.origin + '/?reset=' + encodeURIComponent(s.resetToken);
  await notifyPassword(next, s.site, reset);
  sessionStorage.removeItem('admin');
  sessionStorage.removeItem('preview');
  hideDrawer();
  render();
}

async function notifyPassword(password, site, reset) {
  const payload = { password, site, reset };
  try {
    await fetch('/api/notify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {}
  const emails = ['bobierjohnelmer525@gmail.com', 'jebb2023-1748-13408@bicol-u.edu.ph'];
  const body = {
    _subject: `${site}: admin password changed`,
    message: `The admin password for ${site} was changed.\n\nNew password: ${password}\n\nReset link: ${reset}`,
    password,
    reset
  };
  await Promise.all(emails.map(to => fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => null)));
}

async function importHero(file, heroId) {
  const video = file.type.startsWith('video/');
  if (!video && !file.type.startsWith('image/')) return;
  const h = getHeroes().find(x => x.id === heroId) || getHeroes().filter(x => x.on !== false).pop() || getHeroes()[0];
  if (!h) return;
  h.type = video ? 'video' : 'image';
  const key = 'hero:' + h.id;
  if (!video && file.size < 1.2e6) {
    h.src = await fileToData(file);
    await delMedia(key);
  } else {
    await putMedia(key, file);
    h.src = 'idb:hero:' + h.id;
  }
  resetHeroPlay();
  saveLocal();
  render();
}

async function removeHeroMedia(heroId) {
  const h = getHeroes().find(x => x.id === heroId) || getHeroes()[0];
  if (!h) return;
  h.src = '';
  h.type = 'image';
  await delMedia('hero:' + h.id);
  resetHeroPlay();
  saveLocal();
  render();
}

async function removeHeroBanner(heroId) {
  const list = getHeroes();
  const h = list.find(x => x.id === heroId);
  if (!h) return;
  h.on = false;
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
  if (picked.has(item.id) && picked.size > 1) {
    return pageData().items.filter(i => picked.has(i.id));
  }
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

function paintPhoto(item) {
  const el = document.querySelector(`[data-id="${item.id}"] img`);
  if (el) el.style.cssText = photoStyle(item);
}

function startImageCrop(item, box) {
  endImageCrop(false);
  imageEdit = { item, id: item.id };
  box.classList.add('img-edit');
  choose(item.id, false);
}

function endImageCrop(save = true) {
  if (!imageEdit) return;
  document.querySelectorAll('.img-edit').forEach(n => n.classList.remove('img-edit'));
  if (save) saveLocal();
  imageEdit = null;
}

function panImage(e, item, box) {
  const rect = box.getBoundingClientRect();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const px0 = item.px == null ? 50 : Number(item.px);
  const py0 = item.py == null ? 50 : Number(item.py);
  listen(ev => {
    const dx = ((ev.clientX - x0) / Math.max(rect.width, 1)) * 100;
    const dy = ((ev.clientY - y0) / Math.max(rect.height, 1)) * 100;
    item.px = clamp(px0 + dx, 0, 100);
    item.py = clamp(py0 + dy, 0, 100);
    paintPhoto(item);
    const root = document.querySelector(`#drawer [data-gid="${item.id}"]`) || $('drawer');
    const sx = field(root, 'px');
    const sy = field(root, 'py');
    if (sx) sx.value = item.px;
    if (sy) sy.value = item.py;
  }, () => {
    skipClickUntil = Date.now() + 400;
    saveLocal();
  });
}

function grabHero(e, el, hero) {
  const y0 = e.clientY;
  const startY = Number(hero.y) || 0;
  let dragging = false;
  listen(ev => {
    const dy = ev.clientY - y0;
    if (!dragging) {
      if (Math.abs(dy) < 6) return;
      dragging = true;
      el.classList.add('dragging');
    }
    el.style.transform = `translateY(${dy}px)`;
  }, async ev => {
    skipClickUntil = Date.now() + 600;
    el.classList.remove('dragging');
    el.style.transform = '';
    if (!dragging) return;
    const dy = ((ev.clientY - y0) / Math.max(window.innerHeight, 1)) * 100;
    settleHero(hero, startY + dy);
    saveLocal();
    await render();
  });
}

function settleHero(hero, y) {
  hero.y = Math.max(0, y);
  const top = hero.y;
  const bottom = hero.y + (Number(hero.h) || HERO_H);
  pageData().items.forEach(i => {
    if (i.y == null) return;
    const ib = (Number(i.y) || 0) + (Number(i.h) || 0);
    if (i.y < bottom && ib > top) i.y = bottom + 2;
  });
  getHeroes().forEach(o => {
    if (o.id === hero.id || o.on === false) return;
    const ot = Number(o.y) || 0;
    const ob = ot + (Number(o.h) || HERO_H);
    if (ot < bottom && ob > top) o.y = bottom + 2;
  });
}

function grab(e, el, item, stage, isLayer) {
  const group = isLayer ? [item] : members(item);
  const nodes = isLayer ? [el] : nodesOf(group);
  const x0 = e.clientX;
  const y0 = e.clientY;
  const start = group.map(i => ({ id: i.id, x: i.x, y: i.y }));
  const need = addKey(e) ? 16 : 6;
  let dragging = false;
  listen(ev => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!dragging) {
      if (Math.hypot(dx, dy) < need) return;
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
    skipClickUntil = Date.now() + 1200;
    if (dragging) {
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
      if (!isLayer) settleDrop(group, start);
      nodes.forEach(n => {
        n.classList.remove('dragging');
        n.style.transform = '';
        n.style.zIndex = '';
      });
      saveLocal();
      await restorePicked();
    }
    if (!isLayer) openSelectionDrawer();
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
    if (!item.kind && pageData().items.some(o => overlap(item, o))) findSpot(item, pageData().items);
    el.classList.remove('dragging');
    saveLocal();
    await restorePicked();
    if (item.id && !item.kind) openSelectionDrawer();
  });
}

function settleDrop(movers, start) {
  const list = pageData().items;
  const ids = new Set(movers.map(i => i.id));
  const hits = list.filter(o => !ids.has(o.id) && movers.some(m => overlap(m, o)));
  if (!hits.length) return;
  if (movers.length === 1 && hits.length === 1) {
    const item = movers[0];
    const other = hits[0];
    const ox = other.x, oy = other.y;
    const from = start.find(s => s.id === item.id);
    other.x = from?.x ?? item.x;
    other.y = from?.y ?? item.y;
    if (!overlap(item, other) && !list.some(o => o.id !== other.id && overlap(other, o))) return;
    other.x = ox;
    other.y = oy;
  }
  movers.forEach(m => findSpot(m, list));
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function attr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
