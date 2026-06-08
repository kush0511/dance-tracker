const SHEET_ID = "1GNIUlLSlFTDkhrSnxI1LlMSjP72bmB3ggdLRjviJpFc";
const SHEET_EDIT_URL =
  "https://docs.google.com/spreadsheets/d/1GNIUlLSlFTDkhrSnxI1LlMSjP72bmB3ggdLRjviJpFc/edit?usp=sharing";

const elements = {
  list: document.querySelector("#dance-list"),
  search: document.querySelector("#dance-search"),
  stats: document.querySelector("#list-stats"),
  status: document.querySelector("#status"),
  editButton: document.querySelector(".edit-button"),
  spotlight: document.querySelector("#spotlight"),
};

const state = {
  dances: [],
  filtered: [],
  query: "",
  activeId: "",
  playerExpanded: false,
};

elements.editButton.href = SHEET_EDIT_URL;
elements.search.addEventListener("input", onSearch);
elements.list.addEventListener("click", onTrackClick);
elements.spotlight.addEventListener("click", onSpotlightClick);
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

loadDances();

async function loadDances() {
  setStatus("Loading the set...");

  try {
    const table = await fetchSheet(SHEET_ID);
    state.dances = normalizeRows(table);
    applyFilter();
  } catch (error) {
    console.error(error);
    elements.stats.textContent = "Offline";
    setStatus("Could not read the Google Sheet. Check sharing settings, then refresh.");
  }
}

function fetchSheet(sheetId) {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet request timed out."));
    }, 15000);

    const script = document.createElement("script");
    const params = new URLSearchParams({
      headers: "1",
      tqx: `responseHandler:${callbackName}`,
    });

    window[callbackName] = (response) => {
      cleanup();

      if (response.status !== "ok") {
        reject(new Error(response.errors?.[0]?.detailed_message || "Sheet error."));
        return;
      }

      resolve(response.table);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Sheet request failed."));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params}`;
    document.head.append(script);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      delete window[callbackName];
    }
  });
}

function normalizeRows(table) {
  const headers = table.cols.map((column, index) => column.label || `Column ${index + 1}`);
  const titleIndex = findColumn(headers, ["song", "dance", "routine", "title", "name"]);
  const linkIndex = findColumn(headers, ["yt", "youtube", "video", "clip", "link", "url"]);

  return table.rows
    .map((row, rowIndex) => {
      const cells = headers.map((header, columnIndex) => ({
        header,
        value: String(row.c?.[columnIndex]?.f ?? row.c?.[columnIndex]?.v ?? "").trim(),
      }));

      const fallbackTitleIndex = cells.findIndex((cell, index) => cell.value && index !== linkIndex);
      const resolvedTitleIndex = titleIndex >= 0 ? titleIndex : fallbackTitleIndex;
      const resolvedLinkIndex =
        linkIndex >= 0 ? linkIndex : cells.findIndex((cell) => Boolean(getYouTubeId(cell.value)));

      const title =
        cells[resolvedTitleIndex]?.value || `Routine ${String(rowIndex + 1).padStart(2, "0")}`;
      const url = cells[resolvedLinkIndex]?.value || "";
      const videoId = getYouTubeId(url);
      const metadata = cells.filter((cell, index) => {
        return cell.value && index !== resolvedTitleIndex && index !== resolvedLinkIndex;
      });

      return {
        id: `track-${rowIndex + 1}`,
        number: rowIndex + 1,
        title,
        url,
        videoId,
        metadata,
      };
    })
    .filter((dance) => dance.title || dance.videoId);
}

function findColumn(headers, terms) {
  return headers.findIndex((header) => {
    const normalized = header.toLowerCase();
    return terms.some((term) => normalized.includes(term));
  });
}

function onSearch(event) {
  state.query = event.target.value.trim().toLowerCase();
  applyFilter();
}

function onTrackClick(event) {
  const trigger = event.target.closest("[data-track-id]");
  if (!trigger) return;

  const nextId = trigger.dataset.trackId;
  const dance = state.dances.find((item) => item.id === nextId);
  if (!dance?.videoId) return;

  const isClosing = state.activeId === nextId;
  state.activeId = isClosing ? "" : nextId;
  setPlayerExpanded(false, false);
  render();

  if (!isClosing) {
    window.requestAnimationFrame(() => {
      elements.spotlight.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function onSpotlightClick(event) {
  const expandButton = event.target.closest("[data-player-expand]");
  const closeButton = event.target.closest("[data-player-close]");

  if (expandButton) {
    togglePlayerFocus();
    return;
  }

  if (closeButton) {
    exitNativeFullscreen();
    state.activeId = "";
    setPlayerExpanded(false, false);
    render();
  }
}

async function togglePlayerFocus() {
  const nextExpanded = !state.playerExpanded;
  setPlayerExpanded(nextExpanded, true);

  if (!nextExpanded) {
    await exitNativeFullscreen();
    return;
  }

  await requestNativeFullscreen(elements.spotlight);
}

async function requestNativeFullscreen(element) {
  const request =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullscreen;

  if (!request) return;

  try {
    await request.call(element);
  } catch {
    // CSS focus mode remains active when iOS does not expose iframe fullscreen.
  }
}

async function exitNativeFullscreen() {
  const fullscreenElement =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;

  if (!fullscreenElement || !exit) return;

  try {
    await exit.call(document);
  } catch {
    // Losing native fullscreen should never block the in-page fallback.
  }
}

function onFullscreenChange() {
  const fullscreenElement =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;

  if (!fullscreenElement && state.playerExpanded) {
    setPlayerExpanded(false, true);
  }
}

function setPlayerExpanded(isExpanded, shouldRefresh) {
  state.playerExpanded = isExpanded;
  document.body.classList.toggle("player-expanded", isExpanded);

  if (shouldRefresh) {
    updateSpotlightControls();
  }
}

function applyFilter() {
  state.filtered = state.dances.filter((dance) => {
    const searchable = [dance.title, dance.url, ...dance.metadata.map((item) => item.value)]
      .join(" ")
      .toLowerCase();
    return searchable.includes(state.query);
  });

  if (state.activeId && !state.filtered.some((dance) => dance.id === state.activeId)) {
    state.activeId = "";
  }

  render();
}

function render() {
  elements.status.hidden = true;
  elements.list.hidden = false;
  renderSpotlight();

  if (!state.filtered.length) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <strong>No tracks found</strong>
        <span>Try another search.</span>
      </div>
    `;
    updateStats();
    refreshIcons();
    return;
  }

  elements.list.innerHTML = state.filtered.map(renderTrack).join("");
  updateStats();
  refreshIcons();
}

function renderSpotlight() {
  const dance = state.dances.find((item) => item.id === state.activeId);

  if (!dance?.videoId) {
    elements.spotlight.hidden = true;
    elements.spotlight.innerHTML = "";
    elements.spotlight.dataset.activeId = "";
    setPlayerExpanded(false, false);
    return;
  }

  elements.spotlight.hidden = false;
  elements.spotlight.classList.toggle("is-expanded", state.playerExpanded);

  if (elements.spotlight.dataset.activeId !== dance.id) {
    elements.spotlight.dataset.activeId = dance.id;
    elements.spotlight.innerHTML = renderPlayer(dance);
  }

  updateSpotlightControls();
}

function renderTrack(dance) {
  const hasVideo = Boolean(dance.videoId);
  const isActive = dance.id === state.activeId;
  const meta = dance.metadata
    .map((item) => `<span class="meta-chip">${escapeHtml(item.header)} ${escapeHtml(item.value)}</span>`)
    .join("");

  return `
    <article class="track ${isActive ? "is-active" : ""} ${hasVideo ? "has-clip" : "no-clip"}">
      <button
        class="track-button"
        type="button"
        ${hasVideo ? `data-track-id="${escapeHtml(dance.id)}"` : ""}
        ${hasVideo ? "" : "disabled"}
        aria-expanded="${isActive ? "true" : "false"}"
      >
        <span class="track-index">${String(dance.number).padStart(2, "0")}</span>
        <span class="track-copy">
          <span class="track-title">${escapeHtml(dance.title)}</span>
          <span class="track-meta">
            ${hasVideo ? `<span class="signal">Inline clip</span>` : `<span class="signal muted">No link yet</span>`}
            ${meta}
          </span>
        </span>
        <span class="track-action" aria-hidden="true">
          <i data-lucide="${hasVideo ? (isActive ? "pause" : "play") : "circle-slash"}"></i>
        </span>
      </button>
    </article>
  `;
}

function renderPlayer(dance) {
  const src = new URL(`https://www.youtube-nocookie.com/embed/${dance.videoId}`);
  src.searchParams.set("rel", "0");
  src.searchParams.set("modestbranding", "1");
  src.searchParams.set("playsinline", "1");
  src.searchParams.set("fs", "1");

  return `
    <div class="spotlight-head">
      <span class="track-index">${String(dance.number).padStart(2, "0")}</span>
      <div class="spotlight-copy">
        <span class="spotlight-label">Now playing</span>
        <strong>${escapeHtml(dance.title)}</strong>
      </div>
      <div class="spotlight-tools">
        <button
          class="spotlight-icon"
          type="button"
          data-player-expand
          aria-label="Expand player"
          title="Expand player"
        >
          <i data-lucide="maximize-2" aria-hidden="true"></i>
        </button>
        <button
          class="spotlight-icon"
          type="button"
          data-player-close
          aria-label="Close player"
          title="Close player"
        >
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <div class="player-shell">
      <div class="video-frame">
        <iframe
          title="${escapeHtml(dance.title)} video"
          src="${src}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          webkitallowfullscreen
          mozallowfullscreen
        ></iframe>
      </div>
    </div>
  `;
}

function updateSpotlightControls() {
  elements.spotlight.classList.toggle("is-expanded", state.playerExpanded);

  const expandButton = elements.spotlight.querySelector("[data-player-expand]");
  if (!expandButton) return;

  const label = state.playerExpanded ? "Collapse player" : "Expand player";
  const icon = state.playerExpanded ? "minimize-2" : "maximize-2";
  expandButton.setAttribute("aria-label", label);
  expandButton.setAttribute("title", label);
  if (expandButton.dataset.icon !== icon) {
    expandButton.dataset.icon = icon;
    expandButton.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
  }
  refreshIcons();
}

function updateStats() {
  const total = state.dances.length;
  const visible = state.filtered.length;
  const ready = state.filtered.filter((dance) => dance.videoId).length;
  elements.stats.textContent =
    visible === total ? `${ready}/${total} clips` : `${visible} shown`;
}

function setStatus(message) {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.list.hidden = true;
}

function getYouTubeId(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.slice(1).split("/")[0];
    }

    if (host.endsWith("youtube.com")) {
      if (url.pathname.startsWith("/watch")) {
        return url.searchParams.get("v") || "";
      }

      const match = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/);
      return match?.[1] || "";
    }
  } catch {
    const match = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return match?.[1] || "";
  }

  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        "stroke-width": 2,
      },
    });
  }
}
