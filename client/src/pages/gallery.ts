import { setState } from '../state';

const app = document.getElementById('app')!;

// HTML is built with safe DOM methods to avoid innerHTML XSS concerns
const pageDiv = document.createElement('div');
pageDiv.id = 'page-gallery';
pageDiv.style.cssText = 'min-height:100vh;background:var(--bg);padding:20px;';

const wrapper = document.createElement('div');
wrapper.style.cssText = 'max-width:1100px;margin:0 auto;';

// Header
const header = document.createElement('div');
header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
const title = document.createElement('h2');
title.style.cssText = 'font-size:24px;';
title.textContent = '画作画廊';
const backBtn = document.createElement('button');
backBtn.id = 'gallery-back-btn';
backBtn.className = 'secondary';
backBtn.textContent = '返回首页';
backBtn.addEventListener('click', () => setState({ page: 'home' }));
header.appendChild(title);
header.appendChild(backBtn);
wrapper.appendChild(header);

const catDiv = document.createElement('div');
catDiv.id = 'gallery-categories';
catDiv.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;';
wrapper.appendChild(catDiv);

const grid = document.createElement('div');
grid.id = 'gallery-grid';
grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;';
wrapper.appendChild(grid);

const emptyMsg = document.createElement('p');
emptyMsg.id = 'gallery-empty';
emptyMsg.className = 'text-muted';
emptyMsg.style.cssText = 'text-align:center;padding:40px;display:none;';
emptyMsg.textContent = '暂无展示画作';
wrapper.appendChild(emptyMsg);

const pgDiv = document.createElement('div');
pgDiv.id = 'gallery-pagination';
pgDiv.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:20px;';
wrapper.appendChild(pgDiv);

pageDiv.appendChild(wrapper);

// Lightbox
const lbOverlay = document.createElement('div');
lbOverlay.id = 'gallery-lightbox';
lbOverlay.className = 'overlay';
lbOverlay.style.display = 'none';
const lbInner = document.createElement('div');
lbInner.style.cssText = 'max-width:90vw;max-height:90vh;position:relative;';
const lbClose = document.createElement('button');
lbClose.id = 'lightbox-close';
lbClose.style.cssText = 'position:absolute;top:-40px;right:0;background:transparent;color:white;font-size:24px;border:none;cursor:pointer;';
lbClose.textContent = '\u00D7';
const lbImg = document.createElement('img');
lbImg.id = 'lightbox-img';
lbImg.style.cssText = 'max-width:90vw;max-height:85vh;border-radius:var(--radius);box-shadow:var(--shadow-lg);';
const lbInfo = document.createElement('p');
lbInfo.id = 'lightbox-info';
lbInfo.style.cssText = 'color:white;text-align:center;margin-top:8px;';
lbInner.appendChild(lbClose);
lbInner.appendChild(lbImg);
lbInner.appendChild(lbInfo);
lbOverlay.appendChild(lbInner);
pageDiv.appendChild(lbOverlay);

app.appendChild(pageDiv);

// Logic
let currentPage = 1;
let currentCategory = 0;

async function loadGallery() {
  const params = new URLSearchParams({ page: String(currentPage), category_id: String(currentCategory) });
  const res = await fetch('/api/gallery?' + params.toString());
  const data = await res.json();

  // Categories
  catDiv.textContent = '';
  function makeCatBtn(name: string, id: number) {
    const btn = document.createElement('button');
    btn.className = 'gallery-cat-btn' + (currentCategory === id ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => { currentCategory = id; currentPage = 1; loadGallery(); });
    catDiv.appendChild(btn);
  }
  makeCatBtn('全部', 0);
  (data.categories || []).forEach((c: any) => makeCatBtn(c.name, c.id));

  // Grid
  const drawings = data.drawings || [];
  grid.textContent = '';
  if (drawings.length === 0) {
    emptyMsg.style.display = '';
  } else {
    emptyMsg.style.display = 'none';
    drawings.forEach((d: any) => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const img = document.createElement('img');
      img.className = 'gallery-img';
      img.src = '/drawings/' + d.filename;
      img.loading = 'lazy';
      const info = document.createElement('div');
      info.className = 'gallery-card-info';
      const wordSpan = document.createElement('span');
      wordSpan.className = 'gallery-card-word';
      wordSpan.textContent = d.word;
      const drawerSpan = document.createElement('span');
      drawerSpan.className = 'gallery-card-drawer';
      drawerSpan.textContent = d.drawer_name || '未知';
      info.appendChild(wordSpan);
      info.appendChild(drawerSpan);
      card.appendChild(img);
      card.appendChild(info);
      card.addEventListener('click', () => {
        lbImg.src = '/drawings/' + d.filename;
        lbInfo.textContent = d.word + ' — ' + (d.drawer_name || '未知');
        lbOverlay.style.display = '';
      });
      grid.appendChild(card);
    });
  }

  // Pagination
  pgDiv.textContent = '';
  const totalPages = Math.ceil(data.total / 12);
  if (totalPages <= 1) return;
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = 'gallery-page-btn' + (i === currentPage ? ' active' : '');
    btn.textContent = String(i);
    btn.addEventListener('click', () => { currentPage = i; loadGallery(); });
    pgDiv.appendChild(btn);
  }
}

lbClose.addEventListener('click', () => { lbOverlay.style.display = 'none'; });
lbOverlay.addEventListener('click', (e) => {
  if (e.target === lbOverlay) { lbOverlay.style.display = 'none'; }
});

loadGallery();
