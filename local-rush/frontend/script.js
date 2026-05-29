const form = document.getElementById("search-form");
const geoButton = document.getElementById("geo-button");
const searchButton = document.getElementById("search-button");
const statusMessage = document.getElementById("status-message");
const errorMessage = document.getElementById("error-message");
const resultsCount = document.getElementById("results-count");
const resultsBody = document.getElementById("results-body");

const historyList = document.getElementById("history-list");
const recentList = document.getElementById("recent-list");
const savedList = document.getElementById("saved-list");

const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const activityCards = Array.from(document.querySelectorAll(".activity-card"));

const STORAGE_KEYS = {
  history: "localrush_history",
  recent: "localrush_recent",
  saved: "localrush_saved",
};

let isLoading = false;

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
  localStorage.setItem(key, JSON.stringify(value));
}

function setLoading(loading) {
  isLoading = loading;
  searchButton.disabled = loading;
  geoButton.disabled = loading;

  if (loading) {
    searchButton.textContent = "Buscando...";
  } else {
    searchButton.textContent = "Buscar empresas";
  }
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

  const website = safeExternalUrl(company.website);
  if (website) {
    const link = document.createElement("a");
    link.textContent = "Website";
    link.href = website;
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
  const safeMapUrl = safeExternalUrl(mapsLink);

  if (!safeMapUrl) {
    td.textContent = "Indisponível";
    return td;
  }

  const link = document.createElement("a");
  link.className = "map-link";
  link.href = safeMapUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Abrir mapa";
  td.appendChild(link);
  return td;
}

function showEmptyResults(message) {
  resultsBody.textContent = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.className = "empty-state";
  cell.textContent = message;
  row.appendChild(cell);
  resultsBody.appendChild(row);
}

function renderResults(results) {
  resultsBody.textContent = "";

  if (!results.length) {
    showEmptyResults("Nenhuma empresa encontrada para os filtros informados.");
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const company of results) {
    const row = document.createElement("tr");

    row.appendChild(createCell(company.name || "Sem nome"));
    row.appendChild(createCell(company.category || "-"));
    row.appendChild(createContactCell(company));
    row.appendChild(createScoreCell(company.opportunity_score || "Baixa"));
    row.appendChild(createMapCell(company.maps_link || ""));

    fragment.appendChild(row);
  }

  resultsBody.appendChild(fragment);
}

function formatDateTime(isoString) {
  try {
    return new Date(isoString).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "Agora";
  }
}

function renderSimpleList(target, items, emptyText) {
  target.textContent = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    target.appendChild(li);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    fragment.appendChild(li);
  }
  target.appendChild(fragment);
}

function refreshActivityLists() {
  const history = readList(STORAGE_KEYS.history);
  const recent = readList(STORAGE_KEYS.recent);
  const saved = readList(STORAGE_KEYS.saved);

  renderSimpleList(
    historyList,
    history.map((entry) => `${entry.when} • ${entry.category} • ${entry.total} resultado(s)`),
    "Nenhuma busca registrada.",
  );

  renderSimpleList(
    recentList,
    recent.map((entry) => `${entry.name} (${entry.category})`),
    "Nenhuma empresa recente.",
  );

  renderSimpleList(
    savedList,
    saved.map((entry) => `${entry.name} (${entry.category})`),
    "Nenhuma empresa salva.",
  );
}

function saveHistoryEntry(payload, total) {
  const history = readList(STORAGE_KEYS.history);
  history.unshift({
    when: formatDateTime(new Date().toISOString()),
    category: payload.category,
    total,
  });
  writeList(STORAGE_KEYS.history, history.slice(0, 10));
}

function saveRecentEntries(results) {
  const mapped = results.slice(0, 10).map((item) => ({
    name: item.name || "Sem nome",
    category: item.category || "-",
  }));
  writeList(STORAGE_KEYS.recent, mapped);
}

function activateTab(tabName) {
  for (const button of tabButtons) {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  }

  for (const card of activityCards) {
    card.classList.toggle("is-active", card.dataset.list === tabName);
  }
}

function parsePayload() {
  const formData = new FormData(form);

  return {
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    radius: Number(formData.get("radius")),
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

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    setError("Preencha latitude e longitude com valores numéricos válidos.");
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
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "Erro na busca.";
      throw new Error(detail);
    }

    const results = Array.isArray(data.results) ? data.results : [];
    renderResults(results);

    resultsCount.textContent = `${results.length} empresa(s) encontrada(s).`;
    setStatus("Busca concluída com sucesso.");

    saveHistoryEntry(payload, results.length);
    saveRecentEntries(results);
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

function handleGeolocation() {
  clearMessages();

  if (!navigator.geolocation) {
    setError("Geolocalização não é suportada neste navegador.");
    return;
  }

  setStatus("Buscando sua localização...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latField = form.elements.namedItem("lat");
      const lngField = form.elements.namedItem("lng");

      if (latField instanceof HTMLInputElement) {
        latField.value = position.coords.latitude.toFixed(6);
      }

      if (lngField instanceof HTMLInputElement) {
        lngField.value = position.coords.longitude.toFixed(6);
      }

      setStatus("Localização aplicada no formulário.");
    },
    () => {
      setError("Não foi possível obter sua localização agora.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    },
  );
}

form.addEventListener("submit", handleSubmit);
geoButton.addEventListener("click", handleGeolocation);

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    activateTab(button.dataset.tab || "history");
  });
}

activateTab("history");
refreshActivityLists();
