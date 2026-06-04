const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://127.0.0.1:8000';
const outDir = path.resolve('qa-output');
fs.mkdirSync(outDir, { recursive: true });

const fixedApiSearchBody = {
  lat: -23.55052,
  lng: -46.633308,
  radius: 1500,
  category: 'restaurant',
  limit: 5,
  only_with_site: false,
};

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const responses = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url === baseUrl + '/') {
      let body = null;
      try { body = await res.text(); } catch (e) { body = `<unreadable: ${e.message}>`; }
      responses.push({ method: res.request().method(), url, status: res.status(), body });
    }
  });

  const result = { startedAt: new Date().toISOString(), environment: { baseUrl, outDir }, tests: [], consoleMessages, pageErrors, responses, screenshots: {} };
  const add = (name, pass, evidence, observations=[]) => result.tests.push({ name, verdict: pass ? 'PASS' : 'FAIL', evidence, observations });

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('.app-frame', { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, '01-load-desktop.png'), fullPage: true });
  result.screenshots.desktopLoad = path.join(outDir, '01-load-desktop.png');
  const loadState = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim(),
    appFrame: !!document.querySelector('.app-frame'),
    sidebar: !!document.querySelector('.sidebar'),
    visiblePanels: Array.from(document.querySelectorAll('.panel')).length,
    bodyTheme: document.body.dataset.theme,
    mapShellClass: document.querySelector('.map-shell')?.className,
    mapRect: document.querySelector('.map-shell')?.getBoundingClientRect().toJSON?.() || null,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  add('Carregamento visual desktop', loadState.appFrame && loadState.sidebar && loadState.visiblePanels >= 3 && !loadState.horizontalOverflow, loadState, loadState.horizontalOverflow ? ['Há overflow horizontal na tela desktop.'] : []);

  const tabResults = [];
  for (const tab of ['search','history','recent','saved']) {
    await page.click(`.tab-button[data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    tabResults.push(await page.evaluate((tab) => ({
      tab,
      activeButton: document.querySelector(`.tab-button[data-tab="${tab}"]`)?.classList.contains('is-active'),
      activeCard: document.querySelector(`.activity-card[data-list="${tab}"]`)?.classList.contains('is-active'),
      activeTitle: document.querySelector(`.activity-card[data-list="${tab}"] h3`)?.textContent?.trim(),
    }), tab));
  }
  add('Abas da sidebar', tabResults.every(x => x.activeButton && x.activeCard), tabResults);

  // Theme toggle + persistence
  await page.evaluate(() => { localStorage.setItem('localrush_theme', 'dark'); document.body.dataset.theme = 'dark'; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#theme-toggle');
  const beforeTheme = await page.evaluate(() => ({ theme: document.body.dataset.theme, label: document.querySelector('#theme-toggle-label')?.textContent, stored: localStorage.getItem('localrush_theme') }));
  await page.click('#theme-toggle');
  await page.waitForTimeout(150);
  const lightTheme = await page.evaluate(() => ({ theme: document.body.dataset.theme, label: document.querySelector('#theme-toggle-label')?.textContent, stored: localStorage.getItem('localrush_theme'), pressed: document.querySelector('#theme-toggle')?.getAttribute('aria-pressed') }));
  await page.screenshot({ path: path.join(outDir, '02-theme-light.png'), fullPage: true });
  result.screenshots.themeLight = path.join(outDir, '02-theme-light.png');
  await page.click('#theme-toggle');
  await page.waitForTimeout(150);
  const darkTheme = await page.evaluate(() => ({ theme: document.body.dataset.theme, label: document.querySelector('#theme-toggle-label')?.textContent, stored: localStorage.getItem('localrush_theme'), pressed: document.querySelector('#theme-toggle')?.getAttribute('aria-pressed') }));
  await page.reload({ waitUntil: 'networkidle' });
  const afterReloadTheme = await page.evaluate(() => ({ theme: document.body.dataset.theme, label: document.querySelector('#theme-toggle-label')?.textContent, stored: localStorage.getItem('localrush_theme'), pressed: document.querySelector('#theme-toggle')?.getAttribute('aria-pressed') }));
  add('Tema claro/escuro e persistência após reload', lightTheme.theme === 'light' && lightTheme.stored === 'light' && darkTheme.theme === 'dark' && darkTheme.stored === 'dark' && afterReloadTheme.theme === 'dark' && afterReloadTheme.stored === 'dark', { beforeTheme, lightTheme, darkTheme, afterReloadTheme });

  // Search UI actual API
  await page.selectOption('select[name="category"]', 'restaurant');
  await page.fill('input[name="limit"]', '5');
  await page.selectOption('select[name="radius_level"]', 'medium');
  await page.fill('input[name="lat"]', String(fixedApiSearchBody.lat));
  await page.fill('input[name="lng"]', String(fixedApiSearchBody.lng));
  const searchResponsePromise = page.waitForResponse(resp => resp.url().includes('/api/search') && resp.request().method() === 'POST', { timeout: 70000 });
  await page.click('#search-button');
  const searchResponse = await searchResponsePromise;
  const searchJson = await searchResponse.json().catch(async () => ({ raw: await searchResponse.text() }));
  await page.waitForSelector('#results-body tr[data-company-id]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '03-search-results.png'), fullPage: true });
  result.screenshots.searchResults = path.join(outDir, '03-search-results.png');

  const searchUiState = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#results-body tr[data-company-id]'));
    const firstRow = rows[0];
    const firstLinks = firstRow ? Array.from(firstRow.querySelectorAll('a')).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), className: a.className })) : [];
    const badges = Array.from(document.querySelectorAll('#results-body .badge')).map(b => ({ text: b.textContent.trim(), className: b.className, bg: getComputedStyle(b).backgroundImage || getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color }));
    return {
      statusMessage: document.querySelector('#status-message')?.textContent?.trim(),
      errorMessage: document.querySelector('#error-message')?.textContent?.trim(),
      resultsCount: document.querySelector('#results-count')?.textContent?.trim(),
      rowCount: rows.length,
      mapShellClass: document.querySelector('.map-shell')?.className,
      mapStatus: document.querySelector('#map-status')?.textContent?.trim(),
      leafletMarkers: document.querySelectorAll('.leaflet-marker-icon').length,
      fallbackIframeSrc: document.querySelector('#map-preview')?.getAttribute('src'),
      firstRowText: firstRow?.innerText,
      firstLinks,
      badges,
      historyCount: JSON.parse(localStorage.getItem('localrush_history') || '[]').length,
      recentCount: JSON.parse(localStorage.getItem('localrush_recent') || '[]').length,
    };
  });
  const searchPass = searchResponse.status() === 200 && searchJson.total >= 1 && searchUiState.rowCount >= 1 && searchUiState.badges.length >= 1 && searchUiState.firstLinks.some(l => /mapa/i.test(l.text || '') && /^https:\/\/www\.openstreetmap\.org/.test(l.href || ''));
  add('Busca simples: mapa, resultados, score e links', searchPass, { apiRequest: fixedApiSearchBody, apiStatus: searchResponse.status(), apiBody: searchJson, ui: searchUiState });

  // Click first row to validate map sync/selection
  await page.click('#results-body tr[data-company-id] td:first-child strong');
  await page.waitForTimeout(400);
  const selectedState = await page.evaluate(() => {
    const row = document.querySelector('#results-body tr[data-company-id]');
    return { className: row?.className, ariaSelected: row?.getAttribute('aria-selected'), mapStatus: document.querySelector('#map-status')?.textContent?.trim(), iframeSrc: document.querySelector('#map-preview')?.getAttribute('src') };
  });
  add('Seleção de resultado sincroniza com mapa', selectedState.className?.includes('is-map-selected') && selectedState.ariaSelected === 'true', selectedState);

  // Mobile viewport/layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '04-mobile.png'), fullPage: true });
  result.screenshots.mobile = path.join(outDir, '04-mobile.png');
  const mobileState = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const tabs = document.querySelector('.tabs');
    const appFrame = document.querySelector('.app-frame');
    const sidebarStyle = getComputedStyle(sidebar);
    const tabsStyle = getComputedStyle(tabs);
    const bodyOverflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      appDisplay: getComputedStyle(appFrame).display,
      sidebarPosition: sidebarStyle.position,
      sidebarFlexDirection: sidebarStyle.flexDirection,
      sidebarOverflowX: sidebarStyle.overflowX,
      sidebarRect: sidebar.getBoundingClientRect().toJSON(),
      tabsDisplay: tabsStyle.display,
      tabsMinWidth: tabsStyle.minWidth,
      tabsScrollWidth: tabs.scrollWidth,
      tabsClientWidth: tabs.clientWidth,
      docClientWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      hasPageHorizontalOverflow: bodyOverflowX,
      tabButtons: Array.from(document.querySelectorAll('.tab-button')).map(b => ({ tab: b.dataset.tab, rect: b.getBoundingClientRect().toJSON(), textVisible: getComputedStyle(b.querySelector('span')).display !== 'none' }))
    };
  });
  const mobilePass = mobileState.appDisplay === 'block' && mobileState.sidebarFlexDirection === 'row' && mobileState.sidebarOverflowX === 'auto' && !mobileState.hasPageHorizontalOverflow;
  add('Mobile: sidebar vira barra superior rolável sem quebrar layout', mobilePass, mobileState, mobileState.hasPageHorizontalOverflow ? ['Página tem overflow horizontal global em mobile.'] : []);

  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'qa-result.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
