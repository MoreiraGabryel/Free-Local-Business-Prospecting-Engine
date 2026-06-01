const form = document.getElementById("search-form");
const geoButton = document.getElementById("geo-button");
const locationQueryInput = document.getElementById("location-query");
const locationQueryButton = document.getElementById("location-query-button");
const searchButton = document.getElementById("search-button");
const statusMessage = document.getElementById("status-message");
const errorMessage = document.getElementById("error-message");
const resultsCount = document.getElementById("results-count");
const resultsBody = document.getElementById("results-body");
const activityPanel = document.getElementById("activity-panel");
const mapShell = document.querySelector(".map-shell");
const mapContainer = document.getElementById("map");
const mapPreview = document.getElementById("map-preview");
const mapStatus = document.getElementById("map-status");
const fitMapButton = document.getElementById("fit-map-button");

const historyList = document.getElementById("history-list");
const recentList = document.getElementById("recent-list");
const savedList = document.getElementById("saved-list");

const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const activityCards = Array.from(document.querySelectorAll(".activity-card"));

const STORAGE_KEYS = {
  history: "localrush_history",
  recent: "localrush_recent",
  saved: "localrush_saved",
  lastGeo: "localrush_last_geo",
};

const STORAGE_LIMITS = {
  history: 15,
  recent: 20,
  saved: 60,
};

const currentResultsById = new Map();
const currentMarkersById = new Map();
let currentResults = [];
let isLoading = false;

const DEFAULT_FALLBACK = {
  label: "São Paulo (Centro)",
  lat: -23.55052,
  lng: -46.633308,
};

const GEO_ATTEMPTS = [
  {
    enableHighAccuracy: false,
    timeout: 20000,
    maximumAge: 3600000,
  },
  {
    enableHighAccuracy: true,
    timeout: 35000,
    maximumAge: 0,
  },
];

const RADIUS_LEVELS = {
  small: 800,
  medium: 1500,
  high: 3000,
  max: 5000,
};

let searchMap = null;
let mapLayerGroup = null;
let mapInitRetries = 0;
let currentMapBounds = null;

const MAX_MAP_INIT_RETRIES = 12;

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[local-rush] Falha ao ler storage:", key, error);
    return [];
  }
}

function writeList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("[local-rush] Falha ao gravar storage:", key, error);
  }
}

function safeExternalUrl(rawValue) {
  if (!rawValue) {
    return "";
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

function normalizeCompany(rawCompany) {
  const lat = Number(rawCompany.lat);
  const lng = Number(rawCompany.lng);

  const safeName = String(rawCompany.name || "Sem nome").trim() || "Sem nome";
  const safeCategory = String(rawCompany.category || "-").trim() || "-";

  const computedId = [
    safeName.toLowerCase(),
    safeCategory.toLowerCase(),
    Number.isFinite(lat) ? lat.toFixed(6) : "",
    Number.isFinite(lng) ? lng.toFixed(6) : "",
  ].join("|");
  const providedId = typeof rawCompany.id === "string" ? rawCompany.id.trim() : "";
  const id = providedId || computedId;

  return {
    id,
    name: safeName,
    category: safeCategory,
    address: String(rawCompany.address || "Endereço não informado").trim() || "Endereço não informado",
    phone: String(rawCompany.phone || "").trim(),
    whatsapp: String(rawCompany.whatsapp || "").trim(),
    email: String(rawCompany.email || "").trim(),
    website: safeExternalUrl(rawCompany.website),
    maps_link: safeExternalUrl(rawCompany.maps_link),
    opening_hours: String(rawCompany.opening_hours || "").trim(),
    opportunity_score: String(rawCompany.opportunity_score || "Baixa").trim() || "Baixa",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Agora";
  }

  return date.toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavedCompanies() {
  return readList(STORAGE_KEYS.saved).filter(
    (item) => item && typeof item.id === "string",
  );
}

function getSavedIdSet() {
  return new Set(getSavedCompanies().map((item) => item.id));
}

function setLoading(loading) {
  isLoading = loading;
  searchButton.disabled = loading;
  geoButton.disabled = loading;
  if (locationQueryButton) {
    locationQueryButton.disabled = loading;
  }
  searchButton.textContent = loading ? "Buscando..." : "Buscar empresas";
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function setError(message) {
  errorMessage.textContent = message;
}

function clearMessages() {
  setStatus("");
  setError("");
}

function setMapStatus(message) {
  if (mapStatus) {
    mapStatus.textContent = message;
  }
}

function showEmptyResults(message) {
  resultsBody.textContent = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.className = "empty-state";
  cell.textContent = message;
  row.appendChild(cell);
  resultsBody.appendChild(row);
}

function createCompanyCell(company) {
  const td = document.createElement("td");

  const wrapper = document.createElement("div");
  wrapper.className = "company-main";

  const name = document.createElement("strong");
  name.textContent = company.name;

  const address = document.createElement("span");
  address.className = "company-address";
  address.textContent = company.address;

  wrapper.appendChild(name);
  wrapper.appendChild(address);
  td.appendChild(wrapper);

  return td;
}

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function createContactCell(company) {
  const td = document.createElement("td");
  const group = document.createElement("div");
  group.className = "contact-group";

  const hasContact = Boolean(
    company.phone || company.whatsapp || company.email || company.website,
  );

  if (!hasContact) {
    const span = document.createElement("span");
    span.textContent = "Sem contato";
    group.appendChild(span);
    td.appendChild(group);
    return td;
  }

  if (company.phone) {
    const link = document.createElement("a");
    link.textContent = `Telefone: ${company.phone}`;
    link.href = `tel:${company.phone.replace(/[^\d+]/g, "")}`;
    group.appendChild(link);
  }

  if (company.whatsapp) {
    const digits = company.whatsapp.replace(/\D/g, "");
    if (digits) {
      const link = document.createElement("a");
      link.textContent = "WhatsApp";
      link.href = `https://wa.me/${digits}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      group.appendChild(link);
    }
  }

  if (company.email) {
    const link = document.createElement("a");
    link.textContent = `Email: ${company.email}`;
    link.href = `mailto:${company.email}`;
    group.appendChild(link);
  }

  if (company.website) {
    const link = document.createElement("a");
    link.textContent = "Website";
    link.href = company.website;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    group.appendChild(link);
  }

  td.appendChild(group);
  return td;
}

function createScoreCell(score) {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge";

  if (score === "Alta") {
    badge.classList.add("badge-alta");
  } else if (score === "Média") {
    badge.classList.add("badge-media");
  } else {
    badge.classList.add("badge-baixa");
  }

  badge.textContent = score || "Baixa";
  td.appendChild(badge);
  return td;
}

function createMapCell(mapsLink) {
  const td = document.createElement("td");

  if (!mapsLink) {
    td.textContent = "Indisponível";
    return td;
  }

  const link = document.createElement("a");
  link.className = "map-link";
  link.href = mapsLink;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Abrir mapa";
  td.appendChild(link);
  return td;
}

function createActionCell(company, isSaved) {
  const td = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-action-button";

  if (isSaved) {
    button.classList.add("is-saved");
    button.textContent = "Remover salva";
    button.dataset.action = "remove-company";
  } else {
    button.textContent = "Salvar empresa";
    button.dataset.action = "save-company";
  }

  button.dataset.companyId = company.id;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleSaveOrRemoveCompany(
      company.id,
      button.dataset.action || "save-company",
      company,
    );
  });
  button.addEventListener("pointerup", (event) => {
    event.stopPropagation();
  });
  td.appendChild(button);
  return td;
}

function renderResults(results) {
  resultsBody.textContent = "";
  currentResultsById.clear();

  if (!results.length) {
    showEmptyResults("Nenhuma empresa encontrada para os filtros informados.");
    return;
  }

  const savedIds = getSavedIdSet();
  const fragment = document.createDocumentFragment();

  for (const company of results) {
    const row = document.createElement("tr");
    const normalized = normalizeCompany(company);

    currentResultsById.set(normalized.id, normalized);
    row.dataset.companyId = normalized.id;
    row.setAttribute("aria-selected", "false");
    row.tabIndex = 0;
    row.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a,button")) {
        return;
      }
      focusCompanyOnMap(normalized.id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      focusCompanyOnMap(normalized.id);
    });

    row.appendChild(createCompanyCell(normalized));
    row.appendChild(createCell(normalized.category));
    row.appendChild(createContactCell(normalized));
    row.appendChild(createScoreCell(normalized.opportunity_score));
    row.appendChild(createMapCell(normalized.maps_link));
    row.appendChild(createActionCell(normalized, savedIds.has(normalized.id)));

    fragment.appendChild(row);
  }

  resultsBody.appendChild(fragment);
}

function upsertSavedCompany(company) {
  const saved = getSavedCompanies();
  const exists = saved.some((item) => item.id === company.id);
  if (exists) {
    return false;
  }

  saved.unshift({ ...company, saved_at: new Date().toISOString() });
  writeList(STORAGE_KEYS.saved, saved.slice(0, STORAGE_LIMITS.saved));
  return true;
}

function removeSavedCompany(companyId) {
  const saved = getSavedCompanies();
  const filtered = saved.filter((item) => item.id !== companyId);

  if (filtered.length === saved.length) {
    return false;
  }

  writeList(STORAGE_KEYS.saved, filtered);
  return true;
}

function saveHistoryEntry(payload, total) {
  const history = readList(STORAGE_KEYS.history);

  history.unshift({
    when: new Date().toISOString(),
    category: payload.category,
    total,
    payload,
  });

  writeList(STORAGE_KEYS.history, history.slice(0, STORAGE_LIMITS.history));
}

function saveRecentEntries(results) {
  const existing = readList(STORAGE_KEYS.recent).filter(
    (item) => item && typeof item.id === "string",
  );

  const incoming = results.map((item) => ({
    ...normalizeCompany(item),
    seen_at: new Date().toISOString(),
  }));

  const merged = [];
  const seenIds = new Set();

  for (const item of [...incoming, ...existing]) {
    if (seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    merged.push(item);
  }

  writeList(STORAGE_KEYS.recent, merged.slice(0, STORAGE_LIMITS.recent));
}

function createEmptyActivityItem(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

function createActivityItem({ title, meta, actions }) {
  const li = document.createElement("li");
  li.className = "activity-item";

  const main = document.createElement("div");
  main.className = "activity-item-main";

  const titleNode = document.createElement("span");
  titleNode.className = "activity-title";
  titleNode.textContent = title;

  const metaNode = document.createElement("span");
  metaNode.className = "activity-meta";
  metaNode.textContent = meta;

  main.appendChild(titleNode);
  main.appendChild(metaNode);
  li.appendChild(main);

  if (actions.length) {
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "activity-item-actions";

    for (const action of actions) {
      if (action.type === "link") {
        const link = document.createElement("a");
        link.className = "mini-link";
        link.href = action.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = action.label;
        actionsWrap.appendChild(link);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mini-button";
        button.textContent = action.label;
        button.dataset.action = action.action;

        if (action.companyId) {
          button.dataset.companyId = action.companyId;
        }

        if (typeof action.historyIndex === "number") {
          button.dataset.historyIndex = String(action.historyIndex);
        }

        actionsWrap.appendChild(button);
      }
    }

    li.appendChild(actionsWrap);
  }

  return li;
}

function renderHistoryList() {
  const history = readList(STORAGE_KEYS.history);
  historyList.textContent = "";

  if (!history.length) {
    historyList.appendChild(createEmptyActivityItem("Nenhuma busca registrada."));
    return;
  }

  const fragment = document.createDocumentFragment();

  history.forEach((entry, index) => {
    fragment.appendChild(
      createActivityItem({
        title: `Busca ${entry.category || "-"}`,
        meta: `${formatDateTime(entry.when)} • ${entry.total || 0} resultado(s)`,
        actions: [
          {
            type: "button",
            label: "Carregar filtros",
            action: "apply-history",
            historyIndex: index,
          },
        ],
      }),
    );
  });

  historyList.appendChild(fragment);
}

function renderRecentList() {
  const recent = readList(STORAGE_KEYS.recent);
  const savedIds = getSavedIdSet();
  recentList.textContent = "";

  if (!recent.length) {
    recentList.appendChild(createEmptyActivityItem("Nenhuma empresa recente."));
    return;
  }

  const fragment = document.createDocumentFragment();

  recent.forEach((company) => {
    const actions = [];

    if (company.maps_link) {
      actions.push({ type: "link", label: "Mapa", href: company.maps_link });
    }

    if (savedIds.has(company.id)) {
      actions.push({
        type: "button",
        label: "Remover salva",
        action: "remove-company",
        companyId: company.id,
      });
    } else {
      actions.push({
        type: "button",
        label: "Salvar",
        action: "save-company",
        companyId: company.id,
      });
    }

    fragment.appendChild(
      createActivityItem({
        title: company.name || "Sem nome",
        meta: `${company.category || "-"} • score ${company.opportunity_score || "Baixa"}`,
        actions,
      }),
    );
  });

  recentList.appendChild(fragment);
}

function renderSavedList() {
  const saved = getSavedCompanies();
  savedList.textContent = "";

  if (!saved.length) {
    savedList.appendChild(createEmptyActivityItem("Nenhuma empresa salva."));
    return;
  }

  const fragment = document.createDocumentFragment();

  saved.forEach((company) => {
    const actions = [];

    if (company.maps_link) {
      actions.push({ type: "link", label: "Mapa", href: company.maps_link });
    }

    actions.push({
      type: "button",
      label: "Remover",
      action: "remove-company",
      companyId: company.id,
    });

    fragment.appendChild(
      createActivityItem({
        title: company.name || "Sem nome",
        meta: `${company.category || "-"} • salvo em ${formatDateTime(company.saved_at)}`,
        actions,
      }),
    );
  });

  savedList.appendChild(fragment);
}

function refreshActivityLists() {
  renderHistoryList();
  renderRecentList();
  renderSavedList();
}

function clearLocalData() {
  localStorage.removeItem(STORAGE_KEYS.history);
  localStorage.removeItem(STORAGE_KEYS.recent);
  localStorage.removeItem(STORAGE_KEYS.saved);
  localStorage.removeItem(STORAGE_KEYS.lastGeo);

  currentResults = [];
  currentResultsById.clear();
  resultsCount.textContent = "Nenhuma busca realizada.";
  showEmptyResults("Faça uma busca para listar empresas.");
  refreshActivityLists();
  setError("");
  setStatus("Dados locais foram limpos com sucesso.");
  updateMapFromFormSelection();
}

function activateTab(tabName) {
  for (const button of tabButtons) {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  }

  for (const card of activityCards) {
    card.classList.toggle("is-active", card.dataset.list === tabName);
  }
}

function setFieldValue(name, value) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
    field.value = String(value);
  }
}

function setFieldChecked(name, checked) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) {
    field.checked = Boolean(checked);
  }
}

function normalizeRadiusLevel(rawLevel) {
  const level = String(rawLevel || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RADIUS_LEVELS, level)) {
    return level;
  }
  return "medium";
}

function radiusFromLevel(rawLevel) {
  const level = normalizeRadiusLevel(rawLevel);
  return RADIUS_LEVELS[level];
}

function levelFromRadius(radius) {
  const value = Number(radius);
  if (!Number.isFinite(value) || value <= 0) {
    return "medium";
  }

  if (value <= 1000) {
    return "small";
  }

  if (value <= 2200) {
    return "medium";
  }

  if (value <= 3600) {
    return "high";
  }

  return "max";
}

function setMapModeFallback(enabled) {
  if (!mapShell) {
    return;
  }

  mapShell.classList.toggle("is-fallback", Boolean(enabled));
}

function ensureMapShellHeight() {
  if (!mapShell) {
    return;
  }

  const currentHeight = mapShell.getBoundingClientRect().height;
  if (currentHeight >= 120) {
    return;
  }

  mapShell.style.height = window.innerWidth <= 640 ? "320px" : "420px";
}

function buildEmbedMapUrl(lat, lng, radius) {
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  const safeRadius = Number(radius);

  if (
    !Number.isFinite(safeLat) ||
    !Number.isFinite(safeLng) ||
    !Number.isFinite(safeRadius) ||
    safeRadius <= 0
  ) {
    return "";
  }

  const latDelta = safeRadius / 111320;
  const cosLat = Math.cos((safeLat * Math.PI) / 180);
  const lngDelta = safeRadius / (111320 * Math.max(Math.abs(cosLat), 0.2));

  const minLat = safeLat - latDelta;
  const maxLat = safeLat + latDelta;
  const minLng = safeLng - lngDelta;
  const maxLng = safeLng + lngDelta;

  const bbox = [
    minLng.toFixed(6),
    minLat.toFixed(6),
    maxLng.toFixed(6),
    maxLat.toFixed(6),
  ].join("%2C");
  const marker = `${safeLat.toFixed(6)}%2C${safeLng.toFixed(6)}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

function updateMapPreview(lat, lng, radius) {
  if (!mapPreview) {
    return;
  }

  const nextSrc = buildEmbedMapUrl(lat, lng, radius);
  if (!nextSrc) {
    return;
  }

  if (mapPreview.src !== nextSrc) {
    mapPreview.src = nextSrc;
  }
}

function getRadiusFromForm() {
  const radiusField = form.elements.namedItem("radius_level");
  const rawLevel =
    radiusField instanceof HTMLSelectElement ? radiusField.value : "medium";
  return radiusFromLevel(rawLevel);
}

function clearMapLayers() {
  if (mapLayerGroup) {
    mapLayerGroup.clearLayers();
  }
  currentMarkersById.clear();
  currentMapBounds = null;
}

function clearSelectedCompany() {
  const selectedRows = resultsBody.querySelectorAll("tr.is-map-selected");
  for (const row of selectedRows) {
    row.classList.remove("is-map-selected");
    row.setAttribute("aria-selected", "false");
  }
}

function highlightCompanyRow(companyId) {
  clearSelectedCompany();

  const rows = Array.from(resultsBody.querySelectorAll("tr[data-company-id]"));
  const row = rows.find((item) => item.dataset.companyId === companyId);
  if (!row) {
    return;
  }

  row.classList.add("is-map-selected");
  row.setAttribute("aria-selected", "true");
  row.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

function focusCompanyOnMap(companyId) {
  highlightCompanyRow(companyId);
  const company = currentResultsById.get(companyId) || findCompanyById(companyId);
  if (!company) {
    setMapStatus("Empresa selecionada sem dados completos para abrir no mapa.");
    return;
  }

  if (!Number.isFinite(company.lat) || !Number.isFinite(company.lng)) {
    setMapStatus("Empresa selecionada sem coordenadas para centralizar no mapa.");
    return;
  }

  updateMapPreview(company.lat, company.lng, getRadiusFromForm());

  if (mapShell) {
    mapShell.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  const marker = currentMarkersById.get(companyId);
  if (!searchMap || !marker) {
    setMapStatus("Prévia atualizada para a empresa selecionada.");
    return;
  }

  searchMap.setView([company.lat, company.lng], Math.max(searchMap.getZoom(), 16), {
    animate: true,
  });
  marker.openPopup();
}

function fitMapToCurrentResults() {
  if (searchMap && currentMapBounds) {
    searchMap.fitBounds(currentMapBounds, {
      padding: [28, 28],
      maxZoom: 15,
    });
    searchMap.invalidateSize();
    return;
  }

  updateMapFromFormSelection();
}

function createResultPopupContent(company) {
  const wrapper = document.createElement("div");
  wrapper.className = "map-popup";

  const title = document.createElement("strong");
  title.textContent = company.name || "Sem nome";
  wrapper.appendChild(title);

  const address = document.createElement("p");
  address.textContent = company.address || "Endereço não informado";
  wrapper.appendChild(address);

  if (company.phone) {
    const phone = document.createElement("p");
    phone.textContent = `Telefone: ${company.phone}`;
    wrapper.appendChild(phone);
  }

  if (company.website) {
    const websiteLink = document.createElement("a");
    websiteLink.href = company.website;
    websiteLink.target = "_blank";
    websiteLink.rel = "noopener noreferrer";
    websiteLink.textContent = "Abrir website";
    wrapper.appendChild(websiteLink);
  }

  return wrapper;
}

function addResultMarkers(results, bounds) {
  if (!searchMap || !mapLayerGroup) {
    return 0;
  }

  let markerCount = 0;

  for (const rawItem of results) {
    const company = normalizeCompany(rawItem);
    if (!Number.isFinite(company.lat) || !Number.isFinite(company.lng)) {
      continue;
    }

    const marker = window.L.marker([company.lat, company.lng]);
    marker.bindPopup(createResultPopupContent(company));
    const selectMarkerCompany = () => {
      highlightCompanyRow(company.id);
      updateMapPreview(company.lat, company.lng, getRadiusFromForm());
      setMapStatus(`Empresa selecionada: ${company.name}.`);
    };
    marker.on("click", selectMarkerCompany);
    marker.on("popupopen", selectMarkerCompany);
    marker.addTo(mapLayerGroup);
    const markerElement = marker.getElement();
    if (markerElement) {
      markerElement.dataset.companyId = company.id;
      markerElement.addEventListener("click", selectMarkerCompany);
    }
    currentMarkersById.set(company.id, marker);
    bounds.extend([company.lat, company.lng]);
    markerCount += 1;
  }

  return markerCount;
}

function updateSearchMap(searchPayload, results = []) {
  const lat = Number(searchPayload?.lat);
  const lng = Number(searchPayload?.lng);
  const radius = Number(searchPayload?.radius);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1000;
  const center = [lat, lng];
  const safeResults = Array.isArray(results) ? results : [];
  const missingCoordinates = safeResults.filter((item) => {
    const company = normalizeCompany(item);
    return !Number.isFinite(company.lat) || !Number.isFinite(company.lng);
  }).length;

  updateMapPreview(lat, lng, safeRadius);

  if (!searchMap || !mapLayerGroup || !window.L) {
    setMapModeFallback(true);
    setMapStatus("Prévia do mapa carregada.");
    return;
  }

  setMapModeFallback(false);

  clearMapLayers();
  clearSelectedCompany();

  const circle = window.L.circle(center, {
    radius: safeRadius,
    color: "#1f7ae0",
    fillColor: "#3b82f6",
    fillOpacity: 0.14,
    weight: 2,
  }).addTo(mapLayerGroup);

  const centerMarker = window.L.marker(center).addTo(mapLayerGroup);
  centerMarker.bindPopup("Ponto central da busca");

  const bounds = circle.getBounds();
  const addedMarkers = addResultMarkers(safeResults, bounds);
  currentMapBounds = bounds;

  if (addedMarkers > 0) {
    searchMap.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 15,
    });
  } else {
    searchMap.fitBounds(circle.getBounds(), {
      padding: [24, 24],
    });
  }

  if (missingCoordinates > 0) {
    setMapStatus(
      `${addedMarkers} marcador(es) no mapa. ${missingCoordinates} resultado(s) sem coordenadas.`,
    );
  } else if (safeResults.length > 0) {
    setMapStatus(`${addedMarkers} marcador(es) no mapa.`);
  } else {
    setMapStatus("Centro e raio da busca no mapa.");
  }

  setTimeout(() => {
    if (searchMap) {
      searchMap.invalidateSize();
    }
  }, 80);
}

function updateMapFromFormSelection() {
  const latField = form.elements.namedItem("lat");
  const lngField = form.elements.namedItem("lng");
  if (!(latField instanceof HTMLInputElement) || !(lngField instanceof HTMLInputElement)) {
    return;
  }

  const lat = Number(latField.value);
  const lng = Number(lngField.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  updateSearchMap(
    {
      lat,
      lng,
      radius: getRadiusFromForm(),
    },
    [],
  );
}

function initMap() {
  if (!mapContainer) {
    return;
  }

  ensureMapShellHeight();
  updateMapPreview(DEFAULT_FALLBACK.lat, DEFAULT_FALLBACK.lng, getRadiusFromForm());

  if (!window.L || typeof window.L.map !== "function") {
    setMapModeFallback(true);
    mapInitRetries += 1;
    if (mapInitRetries <= MAX_MAP_INIT_RETRIES) {
      setTimeout(() => {
        initMap();
      }, 350);
    } else {
      console.warn("[local-rush] Leaflet indisponivel; usando pre-visualizacao do mapa.");
    }
    return;
  }

  if (searchMap) {
    setMapModeFallback(false);
    return;
  }

  try {
    searchMap = window.L.map(mapContainer, {
      zoomControl: true,
    });
    searchMap.setView([DEFAULT_FALLBACK.lat, DEFAULT_FALLBACK.lng], 13);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(searchMap);

    mapLayerGroup = window.L.layerGroup().addTo(searchMap);
    setMapModeFallback(false);

    updateSearchMap(
      {
        lat: DEFAULT_FALLBACK.lat,
        lng: DEFAULT_FALLBACK.lng,
        radius: getRadiusFromForm(),
      },
      [],
    );
  } catch (error) {
    console.warn("[local-rush] Falha ao iniciar Leaflet; mantendo pre-visualizacao.", error);
    searchMap = null;
    mapLayerGroup = null;
    setMapModeFallback(true);
  }
}

function applyCoordinates(lat, lng) {
  setFieldValue("lat", Number(lat).toFixed(6));
  setFieldValue("lng", Number(lng).toFixed(6));
  updateMapFromFormSelection();
}

function saveLastGeolocation(lat, lng) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.lastGeo,
      JSON.stringify({
        lat: Number(lat),
        lng: Number(lng),
        updated_at: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("[local-rush] Falha ao persistir última geolocalização:", error);
  }
}

function readLastGeolocation() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastGeo) || "null");
    if (!parsed) {
      return null;
    }

    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

function describeGeolocationError(error) {
  if (!error || typeof error !== "object") {
    return "Falha ao obter localização automática.";
  }

  switch (error.code) {
    case 1:
      return "Permissão de localização negada pelo navegador.";
    case 2:
      return "Posição indisponível no dispositivo agora.";
    case 3:
      return "Tempo excedido ao tentar localizar você.";
    default:
      return "Falha ao obter localização automática.";
  }
}

function requestCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function applyGeolocationFallback(reason) {
  const lastGeo = readLastGeolocation();

  if (lastGeo) {
    applyCoordinates(lastGeo.lat, lastGeo.lng);
    setFieldValue("location_query", "Ultima localizacao valida");
    setError("");
    setStatus(`${reason} Usando sua última localização válida salva.`);
    return;
  }

  applyCoordinates(DEFAULT_FALLBACK.lat, DEFAULT_FALLBACK.lng);
  setFieldValue("location_query", DEFAULT_FALLBACK.label);
  setError("");
  setStatus(
    `${reason} Aplicamos ${DEFAULT_FALLBACK.label} como ponto inicial. Se preferir, digite cidade/CEP e aplique o local informado.`,
  );
}

function loadHistoryPayload(index) {
  const history = readList(STORAGE_KEYS.history);
  const entry = history[index];

  if (!entry || !entry.payload) {
    return;
  }

  setFieldValue("lat", entry.payload.lat);
  setFieldValue("lng", entry.payload.lng);
  setFieldValue(
    "radius_level",
    normalizeRadiusLevel(entry.payload.radius_level || levelFromRadius(entry.payload.radius)),
  );
  setFieldValue("category", entry.payload.category);
  setFieldValue("limit", entry.payload.limit);
  setFieldChecked("only_with_site", entry.payload.only_with_site);
  setFieldValue("location_query", entry.payload.location_query || "");

  setError("");
  setStatus("Filtros do histórico carregados no formulário.");
  updateMapFromFormSelection();
}

function findCompanyById(companyId) {
  if (currentResultsById.has(companyId)) {
    return currentResultsById.get(companyId);
  }

  const fromCurrentResults = currentResults.find((item) => item.id === companyId);
  if (fromCurrentResults) {
    return fromCurrentResults;
  }

  const recent = readList(STORAGE_KEYS.recent);
  const fromRecent = recent.find((item) => item.id === companyId);
  if (fromRecent) {
    return fromRecent;
  }

  const saved = getSavedCompanies();
  return saved.find((item) => item.id === companyId) || null;
}

function syncAfterSavedUpdate(message) {
  setError("");
  setStatus(message);
  renderResults(currentResults);
  refreshActivityLists();
}

function handleSaveOrRemoveCompany(companyId, action, companyHint = null) {
  if (!companyId) {
    return;
  }

  if (action === "remove-company") {
    const removed = removeSavedCompany(companyId);
    if (removed) {
      syncAfterSavedUpdate("Empresa removida da lista de salvas.");
    }
    return;
  }

  const company = companyHint ? normalizeCompany(companyHint) : findCompanyById(companyId);
  if (!company) {
    setError("Empresa não encontrada para salvar.");
    return;
  }

  const inserted = upsertSavedCompany(company);
  if (inserted) {
    syncAfterSavedUpdate("Empresa salva com sucesso.");
  } else {
    setStatus("Essa empresa já está na lista de salvas.");
  }
}

async function handleLocationQuery() {
  if (isLoading) {
    return;
  }

  clearMessages();
  const rawQuery = String(form.elements.namedItem("location_query")?.value || "").trim();

  if (rawQuery.length < 3) {
    setError("Digite uma cidade, bairro ou CEP com pelo menos 3 caracteres.");
    return;
  }

  setLoading(true);
  setStatus("Procurando local informado...");

  try {
    const response = await fetch("/api/geocode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: rawQuery }),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : "Nao foi possivel localizar esse ponto agora.";
      throw new Error(detail);
    }

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Local encontrado sem coordenadas validas.");
    }

    applyCoordinates(lat, lng);
    saveLastGeolocation(lat, lng);
    setFieldValue("location_query", String(data.display_name || rawQuery));
    setStatus(`Local aplicado: ${String(data.display_name || rawQuery)}.`);
  } catch (error) {
    console.error("[local-rush] Erro ao resolver localizacao:", error);
    setError(error instanceof Error ? error.message : "Erro inesperado ao resolver local.");
  } finally {
    setLoading(false);
  }
}

function parsePayload() {
  const formData = new FormData(form);
  const radiusLevel = normalizeRadiusLevel(formData.get("radius_level"));

  return {
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    radius: radiusFromLevel(radiusLevel),
    radius_level: radiusLevel,
    location_query: String(formData.get("location_query") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    limit: Number(formData.get("limit")),
    only_with_site: formData.get("only_with_site") === "on",
  };
}

async function handleSubmit(event) {
  event.preventDefault();

  if (isLoading) {
    return;
  }

  clearMessages();
  const payload = parsePayload();
  const apiPayload = {
    lat: payload.lat,
    lng: payload.lng,
    radius: payload.radius,
    category: payload.category,
    limit: payload.limit,
    only_with_site: payload.only_with_site,
  };

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    setError("Defina uma localizacao valida antes de buscar.");
    return;
  }

  setLoading(true);
  setStatus("Consultando OpenStreetMap...");

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "Erro na busca.";
      throw new Error(detail);
    }

    const results = Array.isArray(data.results) ? data.results : [];
    currentResults = results.map((item) => normalizeCompany(item));

    renderResults(currentResults);
    updateSearchMap(
      {
        lat: payload.lat,
        lng: payload.lng,
        radius: payload.radius,
      },
      currentResults,
    );

    resultsCount.textContent = `${currentResults.length} empresa(s) encontrada(s).`;
    setStatus("Busca concluída com sucesso.");

    saveHistoryEntry(payload, currentResults.length);
    saveRecentEntries(currentResults);
    refreshActivityLists();
  } catch (error) {
    console.error("[local-rush] Erro na busca:", error);
    resultsCount.textContent = "Nenhuma busca válida no momento.";
    showEmptyResults("Não foi possível carregar resultados.");
    setError(error instanceof Error ? error.message : "Erro inesperado na busca.");
  } finally {
    setLoading(false);
  }
}

async function handleGeolocation() {
  clearMessages();

  if (!navigator.geolocation) {
    setError("Geolocalização não é suportada neste navegador.");
    applyGeolocationFallback("Sem suporte nativo de geolocalização.");
    return;
  }

  if (navigator.permissions && typeof navigator.permissions.query === "function") {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        applyGeolocationFallback(
          "Permissao de localizacao bloqueada no navegador.",
        );
        return;
      }
    } catch (error) {
      console.warn("[local-rush] Não foi possível consultar permissões:", error);
    }
  }

  setStatus("Buscando sua localização...");

  let lastError = null;

  for (let index = 0; index < GEO_ATTEMPTS.length; index += 1) {
    const options = GEO_ATTEMPTS[index];

    try {
      const position = await requestCurrentPosition(options);
      applyCoordinates(position.coords.latitude, position.coords.longitude);
      saveLastGeolocation(position.coords.latitude, position.coords.longitude);
      setFieldValue("location_query", "Minha localização atual");
      setStatus("Localização atual aplicada no formulário.");
      setError("");
      return;
    } catch (error) {
      lastError = error;

      if (error && error.code === 1) {
        applyGeolocationFallback(describeGeolocationError(error));
        return;
      }

      if (index === 0) {
        setStatus("Primeira tentativa sem sucesso. Tentando novamente...");
      }
    }
  }

  const reason = describeGeolocationError(lastError);
  applyGeolocationFallback(reason);
}

function handleResultsClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const button = target.closest("button[data-action]");
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.action;
    const companyId = button.dataset.companyId;
    handleSaveOrRemoveCompany(companyId, action);
    return;
  }

  if (target.closest("a")) {
    return;
  }

  const row = target.closest("tr[data-company-id]");
  if (row) {
    focusCompanyOnMap(row.dataset.companyId || "");
  }
}

function handleResultsKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const row = target ? target.closest("tr[data-company-id]") : null;
  if (!row) {
    return;
  }

  event.preventDefault();
  focusCompanyOnMap(row.dataset.companyId || "");
}

function handleResultsCaptureClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !resultsBody.contains(target)) {
    return;
  }

  const button = target.closest("button[data-action]");
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    handleSaveOrRemoveCompany(
      button.dataset.companyId || "",
      button.dataset.action || "save-company",
    );
    return;
  }

  if (target.closest("a")) {
    return;
  }

  const row = target.closest("tr[data-company-id]");
  if (row) {
    event.stopPropagation();
    focusCompanyOnMap(row.dataset.companyId || "");
  }
}

function handleActivityClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;

  if (action === "quick-location") {
    const lat = Number(button.dataset.lat);
    const lng = Number(button.dataset.lng);
    const label = String(button.dataset.label || "ponto rápido");

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      applyCoordinates(lat, lng);
      setFieldValue("location_query", label);
      setError("");
      setStatus(`Localização rápida aplicada: ${label}.`);
      activateTab("search");
    }
    return;
  }

  if (action === "retry-geolocation") {
    handleGeolocation();
    return;
  }

  if (action === "clear-local-data") {
    clearLocalData();
    return;
  }

  if (action === "apply-history") {
    const index = Number(button.dataset.historyIndex);
    if (Number.isInteger(index) && index >= 0) {
      loadHistoryPayload(index);
      activateTab("search");
    }
    return;
  }

  const companyId = button.dataset.companyId;
  handleSaveOrRemoveCompany(companyId, action);
}

form.addEventListener("submit", handleSubmit);
geoButton.addEventListener("click", handleGeolocation);
if (locationQueryButton) {
  locationQueryButton.addEventListener("click", handleLocationQuery);
}
if (locationQueryInput) {
  locationQueryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleLocationQuery();
    }
  });
}
resultsBody.addEventListener("click", handleResultsClick);
resultsBody.addEventListener("keydown", handleResultsKeydown);
document.addEventListener("click", handleResultsCaptureClick, true);

if (fitMapButton) {
  fitMapButton.addEventListener("click", fitMapToCurrentResults);
}

const radiusLevelField = form.elements.namedItem("radius_level");
if (radiusLevelField instanceof HTMLSelectElement) {
  radiusLevelField.addEventListener("change", () => {
    updateMapFromFormSelection();
  });
}

const latField = form.elements.namedItem("lat");
if (latField instanceof HTMLInputElement) {
  latField.addEventListener("change", () => {
    updateMapFromFormSelection();
  });
}

const lngField = form.elements.namedItem("lng");
if (lngField instanceof HTMLInputElement) {
  lngField.addEventListener("change", () => {
    updateMapFromFormSelection();
  });
}

if (activityPanel) {
  activityPanel.addEventListener("click", handleActivityClick);
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const nextTab = button.dataset.tab || "search";
    activateTab(nextTab);

    if (nextTab === "search") {
      const locationField = form.elements.namedItem("location_query");
      if (locationField instanceof HTMLInputElement) {
        locationField.focus();
      }
    }
  });
}

activateTab("search");
refreshActivityLists();
initMap();

window.addEventListener("resize", () => {
  ensureMapShellHeight();
  if (searchMap) {
    searchMap.invalidateSize();
  }
});
