const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://127.0.0.1:8000';
const outDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(outDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getUiState(page, label) {
  return await page.evaluate((label) => {
    const activeButton = document.querySelector('.tab-button.is-active');
    const activePanel = document.querySelector('.view-panel.is-active');
    const panels = Array.from(document.querySelectorAll('.view-panel')).map(panel => ({
      view: panel.dataset.view || '',
      hidden: panel.hidden,
      className: panel.className,
      rect: (() => { const r = panel.getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, left: r.left }; })(),
    }));
    const map = document.querySelector('#map');
    const mapRect = map ? map.getBoundingClientRect() : null;
    const activeButtonRect = activeButton ? activeButton.getBoundingClientRect() : null;
    return {
      label,
      url: location.href,
      title: document.title,
      activeTab: activeButton?.dataset.tab || null,
      activeButtonText: activeButton?.textContent?.trim() || null,
      activeButtonAriaCurrent: activeButton?.getAttribute('aria-current') || null,
      activeButtonClass: activeButton?.className || null,
      activeButtonRect: activeButtonRect ? { width: activeButtonRect.width, height: activeButtonRect.height, top: activeButtonRect.top, left: activeButtonRect.left } : null,
      activePanel: activePanel?.dataset.view || null,
      activePanelHidden: activePanel?.hidden ?? null,
      header: {
        eyebrow: document.querySelector('#view-eyebrow')?.textContent?.trim() || null,
        title: document.querySelector('#view-title')?.textContent?.trim() || null,
        subtitle: document.querySelector('#view-subtitle')?.textContent?.trim() || null,
      },
      panels,
      map: {
        exists: Boolean(map),
        display: map ? getComputedStyle(map).display : null,
        visibility: map ? getComputedStyle(map).visibility : null,
        rect: mapRect ? { width: mapRect.width, height: mapRect.height, top: mapRect.top, left: mapRect.left } : null,
        status: document.querySelector('#map-status')?.textContent?.trim() || null,
        fallback: document.querySelector('.map-shell')?.classList.contains('is-fallback') || false,
        leafletLoaded: Boolean(window.L && window.L.map),
        leafletContainerCount: document.querySelectorAll('.leaflet-container').length,
        markerCount: document.querySelectorAll('.leaflet-marker-icon').length,
        tileCount: document.querySelectorAll('.leaflet-tile').length,
        center: window.__qaMapProbe ? window.__qaMapProbe() : null,
      },
      results: {
        countText: document.querySelector('#results-count')?.textContent?.trim() || null,
        rowCount: document.querySelectorAll('#results-body tr[data-company-id]').length,
        firstRowText: document.querySelector('#results-body tr[data-company-id]')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        selectedRows: Array.from(document.querySelectorAll('#results-body tr.is-map-selected')).map(r => ({ id: r.dataset.companyId, ariaSelected: r.getAttribute('aria-selected') })),
      },
      lists: {
        historyText: document.querySelector('#history-list')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        recentText: document.querySelector('#recent-list')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        savedText: document.querySelector('#saved-list')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        historyItems: document.querySelectorAll('#history-list li').length,
        recentItems: document.querySelectorAll('#recent-list li').length,
        savedItems: document.querySelectorAll('#saved-list li').length,
      },
      storage: {
        theme: localStorage.getItem('localrush_theme'),
        historyLength: JSON.parse(localStorage.getItem('localrush_history') || '[]').length,
        recentLength: JSON.parse(localStorage.getItem('localrush_recent') || '[]').length,
        savedLength: JSON.parse(localStorage.getItem('localrush_saved') || '[]').length,
      },
      theme: {
        html: document.documentElement.dataset.theme || null,
        body: document.body.dataset.theme || null,
        label: document.querySelector('#theme-toggle-label')?.textContent?.trim() || null,
        pressed: document.querySelector('#theme-toggle')?.getAttribute('aria-pressed') || null,
      },
      dimensions: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        docClientWidth: document.documentElement.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      },
      navEntry: performance.getEntriesByType('navigation').map(n => ({ type: n.type, domComplete: Math.round(n.domComplete), loadEventEnd: Math.round(n.loadEventEnd) })),
      resourceCount: performance.getEntriesByType('resource').length,
    };
  }, label);
}

async function clickTab(page, tab, label) {
  await page.click(`.tab-button[data-tab="${tab}"]`);
  await sleep(90);
  return await getUiState(page, label || `click ${tab}`);
}

(async () => {
  const consoleMessages = [];
  const pageErrors = [];
  const responses = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text(), location: msg.location() }));
  page.on('pageerror', err => pageErrors.push(String(err.stack || err.message || err)));
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url === baseUrl + '/' || url.includes('/static/')) {
      let body = null;
      try { body = await res.text(); } catch (e) { body = `<unreadable: ${e.message}>`; }
      responses.push({ method: res.request().method(), url, status: res.status(), body });
    }
  });

  const result = { startedAt: new Date().toISOString(), baseUrl, screenshots: {}, consoleMessages, pageErrors, responses, states: {}, rapidClicks: [], apiDirect: {} };

  const navResponse = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
  result.initialNavigation = { status: navResponse ? navResponse.status() : null, url: navResponse ? navResponse.url() : null };
  await page.evaluate(() => {
    window.__qaMapProbe = () => {
      const el = document.querySelector('#map');
      if (!el || !el._leaflet_id || !window.L) return null;
      const maps = Object.values(window).filter(Boolean);
      // searchMap is module/global var in script scope; not on window. Use DOM markers and container classes as evidence.
      const selectedMarker = document.querySelector('.leaflet-marker-icon[style]');
      return { leafletId: el._leaflet_id || null, selectedMarkerStyle: selectedMarker?.getAttribute('style') || null };
    };
  });
  await page.waitForSelector('.tab-button[data-tab="dashboard"].is-active', { timeout: 10000 });
  await page.waitForSelector('.leaflet-container, .map-shell.is-fallback', { timeout: 15000 }).catch(() => null);
  await sleep(1000);
  result.states.initial = await getUiState(page, 'initial dashboard');
  result.screenshots.initial = path.join(screenshotsDir, '01-initial-dashboard.png');
  await page.screenshot({ path: result.screenshots.initial, fullPage: true });

  // Rapid alternation across tabs.
  const sequence = ['history', 'recent', 'saved', 'dashboard', 'history', 'recent', 'saved', 'dashboard'];
  for (let i = 0; i < sequence.length; i++) {
    result.rapidClicks.push(await clickTab(page, sequence[i], `rapid ${i + 1}: ${sequence[i]}`));
  }

  // Repeated same-tab clicks, should not reload/flicker/change resource count materially.
  result.states.sameTabBefore = await clickTab(page, 'history', 'same-tab before history');
  const beforeSameTabResourceCount = result.states.sameTabBefore.resourceCount;
  const beforeNavEntries = result.states.sameTabBefore.navEntry;
  const sameTabStates = [];
  for (let i = 0; i < 8; i++) {
    sameTabStates.push(await clickTab(page, 'history', `same history click ${i + 1}`));
  }
  result.sameTabHistory = {
    beforeResourceCount: beforeSameTabResourceCount,
    afterResourceCount: sameTabStates[sameTabStates.length - 1].resourceCount,
    beforeNavEntries,
    afterNavEntries: sameTabStates[sameTabStates.length - 1].navEntry,
    states: sameTabStates,
  };
  result.screenshots.historyAfterRepeatedClicks = path.join(screenshotsDir, '02-history-after-repeated-clicks.png');
  await page.screenshot({ path: result.screenshots.historyAfterRepeatedClicks, fullPage: true });

  // Back to dashboard and fit map.
  result.states.dashboardBeforeFit = await clickTab(page, 'dashboard', 'dashboard before fit');
  await page.click('#fit-map-button');
  await sleep(800);
  result.states.dashboardAfterFit = await getUiState(page, 'dashboard after fit-map-button');
  result.screenshots.dashboardAfterFit = path.join(screenshotsDir, '03-dashboard-after-fit.png');
  await page.screenshot({ path: result.screenshots.dashboardAfterFit, fullPage: true });

  // API direct probe for search before UI flow.
  const searchPayload = { lat: -23.55052, lng: -46.633308, radius: 800, category: 'restaurant', limit: 2, only_with_site: false };
  result.apiDirect.searchRequest = { method: 'POST', url: `${baseUrl}/api/search`, json: searchPayload };
  const apiResp = await page.request.post(`${baseUrl}/api/search`, { data: searchPayload, timeout: 90000 });
  result.apiDirect.searchResponse = { status: apiResp.status(), body: await apiResp.text() };

  // UI search.
  await page.selectOption('select[name="radius_level"]', 'small');
  await page.selectOption('select[name="category"]', 'restaurant');
  await page.fill('input[name="limit"]', '2');
  await page.fill('input[name="lat"]', '-23.550520');
  await page.fill('input[name="lng"]', '-46.633308');
  await page.fill('#location-query', 'São Paulo Centro QA');
  await page.click('#search-button');
  await page.waitForFunction(() => !document.querySelector('#search-button')?.disabled, null, { timeout: 120000 });
  await sleep(1600);
  result.states.afterSearch = await getUiState(page, 'after UI search');
  result.screenshots.afterSearch = path.join(screenshotsDir, '04-after-search.png');
  await page.screenshot({ path: result.screenshots.afterSearch, fullPage: true });

  // Select first row to verify map synchronization.
  const hasRows = await page.locator('#results-body tr[data-company-id]').count();
  if (hasRows > 0) {
    await page.click('#results-body tr[data-company-id] td:first-child strong');
    await sleep(800);
    result.states.afterFirstRowSelect = await getUiState(page, 'after first row select');
  }

  // Save/remove from results and validate lists/localStorage.
  const actionButtonCount = await page.locator('#results-body button[data-action="save-company"], #results-body button[data-action="remove-company"]').count();
  result.saveRemove = { hasRows, actionButtonCount };
  if (actionButtonCount > 0) {
    const beforeSaveStorage = await page.evaluate(() => localStorage.getItem('localrush_saved') || '[]');
    await page.click('#results-body button[data-action="save-company"], #results-body button[data-action="remove-company"]');
    await sleep(600);
    const afterSaveStorage = await page.evaluate(() => localStorage.getItem('localrush_saved') || '[]');
    const afterSaveState = await getUiState(page, 'after save from results');
    await clickTab(page, 'saved', 'saved tab after save');
    const savedTabAfterSave = await getUiState(page, 'saved tab content after save');
    const savedRemoveCount = await page.locator('#saved-list button[data-action="remove-company"]').count();
    let afterRemoveStorage = null;
    let savedTabAfterRemove = null;
    if (savedRemoveCount > 0) {
      await page.click('#saved-list button[data-action="remove-company"]');
      await sleep(600);
      afterRemoveStorage = await page.evaluate(() => localStorage.getItem('localrush_saved') || '[]');
      savedTabAfterRemove = await getUiState(page, 'saved tab after remove');
    }
    result.saveRemove = { ...result.saveRemove, beforeSaveStorage, afterSaveStorage, afterSaveState, savedTabAfterSave, savedRemoveCount, afterRemoveStorage, savedTabAfterRemove };
  }

  // Validate recent and history after search.
  await clickTab(page, 'recent', 'recent tab after search');
  result.states.recentAfterSearch = await getUiState(page, 'recent tab content after search');
  await clickTab(page, 'history', 'history tab after search');
  result.states.historyAfterSearch = await getUiState(page, 'history tab content after search');

  // Theme toggle light/dark and persistence after reload.
  await clickTab(page, 'dashboard', 'dashboard before theme');
  const themeBefore = await getUiState(page, 'theme before');
  await page.click('#theme-toggle');
  await sleep(500);
  const themeAfterFirstToggle = await getUiState(page, 'theme after first toggle');
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
  await sleep(1000);
  const themeAfterReload = await getUiState(page, 'theme after reload');
  await page.click('#theme-toggle');
  await sleep(500);
  const themeAfterSecondToggle = await getUiState(page, 'theme after second toggle');
  result.theme = { themeBefore, themeAfterFirstToggle, themeAfterReload, themeAfterSecondToggle };
  result.screenshots.themeAfterToggle = path.join(screenshotsDir, '05-theme-after-toggle.png');
  await page.screenshot({ path: result.screenshots.themeAfterToggle, fullPage: true });

  // Mobile quick viewport overflow smoke after all operations.
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(800);
  result.states.mobile390 = await getUiState(page, 'mobile 390x844 after tests');
  result.screenshots.mobile390 = path.join(screenshotsDir, '06-mobile-390x844.png');
  await page.screenshot({ path: result.screenshots.mobile390, fullPage: true });

  result.finishedAt = new Date().toISOString();
  result.summary = {
    jsErrors: pageErrors.length,
    consoleErrorCount: consoleMessages.filter(m => m.type === 'error').length,
    consoleWarningCount: consoleMessages.filter(m => m.type === 'warning').length,
    apiResponseCount: responses.length,
    searchRowsAfterUi: result.states.afterSearch?.results?.rowCount ?? null,
    savedLengthAfterSave: result.saveRemove?.afterSaveState?.storage?.savedLength ?? null,
    savedLengthAfterRemove: result.saveRemove?.savedTabAfterRemove?.storage?.savedLength ?? null,
    mobileOverflow: result.states.mobile390?.dimensions?.hasHorizontalOverflow ?? null,
  };

  const jsonPath = path.join(outDir, 'localrush-tab-regression-result.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, jsonPath, summary: result.summary, screenshots: result.screenshots }, null, 2));
  await browser.close();
})().catch(async (err) => {
  const fail = { ok: false, error: String(err.stack || err.message || err) };
  const failPath = path.join(outDir, 'localrush-tab-regression-failure.json');
  fs.writeFileSync(failPath, JSON.stringify(fail, null, 2), 'utf8');
  console.error(JSON.stringify(fail, null, 2));
  process.exit(1);
});
