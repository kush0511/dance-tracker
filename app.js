const SHEET_ID = "1GNIUlLSlFTDkhrSnxI1LlMSjP72bmB3ggdLRjviJpFc";
const SHEET_EDIT_URL =
  "https://docs.google.com/spreadsheets/d/1GNIUlLSlFTDkhrSnxI1LlMSjP72bmB3ggdLRjviJpFc/edit?usp=sharing";

const elements = {
  list: document.querySelector("#dance-list"),
  search: document.querySelector("#dance-search"),
  stats: document.querySelector("#list-stats"),
  status: document.querySelector("#status"),
  editLink: document.querySelector(".edit-link"),
};

const state = {
  dances: [],
  filtered: [],
  query: "",
  activeId: "",
};

elements.editLink.href = SHEET_EDIT_URL;

loadDances();

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  applyFilter();
});

elements.list.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-dance-id]");
  if (!trigger) return;

  const nextId = trigger.dataset.danceId;
  state.activeId = state.activeId === nextId ? "" : nextId;
  renderList();
});

async function loadDances() {
  setStatus("Loading dances...");

  try {
    const table = await loadGoogleSheet(SHEET_ID);
    state.dances = normalizeTable(table);
    applyFilter();
  } catch (error) {
    setStatus(
      "Could not read the Google Sheet. Check that link sharing is enabled, then refresh."
    );
    elements.stats.textContent = "Offline";
    console.error(error);
  }
}

function loadGoogleSheet(sheetId) {
  return new Promise((resolve, reject) => {
    const callbackName = `__danceSheet_${Date.now()}_${Math.random()
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

    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
    document.head.append(script);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      delete window[callbackName];
    }
  });
}

function normalizeTable(table) {
  const headers = table.cols.map((column, index) => {
    return column.label || `Column ${index + 1}`;
  });

  const linkIndex = findHeaderIndex(headers, [
    "yt",
    "youtube",
    "video",
    "link",
    "url",
  ]);
  const titleIndex = findHeaderIndex(headers, [
    "song",
    "dance",
    "title",
    "name",
  ]);

  return table.rows
    .map((row, rowIndex) => {
      const values = headers.map((header, columnIndex) => {
        const cell = row.c?.[columnIndex];
        return {
          header,
          value: String(cell?.f ?? cell?.v ?? "").trim(),
        };
      });

      const firstTextIndex = values.findIndex((item, index) => {
        return item.value && index !== linkIndex;
      });
      const resolvedTitleIndex = titleIndex >= 0 ? titleIndex : firstTextIndex;
      const resolvedLinkIndex =
        linkIndex >= 0
          ? linkIndex
          : values.findIndex((item) => getYouTubeId(item.value));

      const title =
        values[resolvedTitleIndex]?.value || `Dance ${String(rowIndex + 1).padStart(2, "0")}`;
      const url = values[resolvedLinkIndex]?.value || "";
      const videoId = getYouTubeId(url);
      const fields = values.filter((item, index) => {
        return item.value && index !== resolvedTitleIndex && index !== resolvedLinkIndex;
      });

      return {
        id: `dance-${rowIndex + 1}`,
        number: rowIndex + 1,
        title,
        url,
        videoId,
        fields,
      };
    })
    .filter((dance) => dance.title || dance.videoId);
}

function findHeaderIndex(headers, needles) {
  return headers.findIndex((header) => {
    const normalized = header.toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
  });
}

function applyFilter() {
  const query = state.query;

  state.filtered = state.dances.filter((dance) => {
    const haystack = [dance.title, dance.url, ...dance.fields.map((field) => field.value)]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (state.activeId && !state.filtered.some((dance) => dance.id === state.activeId)) {
    state.activeId = "";
  }

  renderList();
}

function renderList() {
  elements.status.hidden = true;
  elements.list.hidden = false;

  if (!state.filtered.length) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <strong>No matching dances</strong>
        <span>Try a shorter search.</span>
      </div>
    `;
    updateStats();
    refreshIcons();
    return;
  }

  elements.list.innerHTML = state.filtered.map(renderDance).join("");
  updateStats();
  refreshIcons();
}

function renderDance(dance) {
  const isActive = dance.id === state.activeId;
  const videoLabel = dance.videoId ? "Inline video" : "Missing video";
  const extraFields = dance.fields
    .map((field) => {
      return `<span class="field-pill">${escapeHtml(field.header)}: ${escapeHtml(
        field.value
      )}</span>`;
    })
    .join("");

  return `
    <article class="dance-row ${isActive ? "is-active" : ""}">
      <button
        class="dance-summary"
        type="button"
        data-dance-id="${escapeHtml(dance.id)}"
        aria-expanded="${isActive ? "true" : "false"}"
      >
        <span class="row-number">${String(dance.number).padStart(2, "0")}</span>
        <span class="row-copy">
          <span class="row-title">${escapeHtml(dance.title)}</span>
          <span class="row-subline">
            <span>${videoLabel}</span>
            ${extraFields}
          </span>
        </span>
        <span class="row-action" aria-hidden="true">
          <i data-lucide="${isActive ? "pause" : "play"}"></i>
        </span>
      </button>
      ${isActive ? renderVideoPanel(dance) : ""}
    </article>
  `;
}

function renderVideoPanel(dance) {
  if (!dance.videoId) {
    return `
      <div class="video-panel">
        <div class="video-missing">
          This row needs a valid YouTube link in the sheet.
        </div>
      </div>
    `;
  }

  const src = new URL(`https://www.youtube-nocookie.com/embed/${dance.videoId}`);
  src.searchParams.set("rel", "0");
  src.searchParams.set("modestbranding", "1");
  src.searchParams.set("playsinline", "1");

  return `
    <div class="video-panel">
      <div class="video-frame">
        <iframe
          title="${escapeHtml(dance.title)} video"
          src="${src.toString()}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    </div>
  `;
}

function updateStats() {
  const visible = state.filtered.length;
  const total = state.dances.length;
  elements.stats.textContent =
    visible === total ? `${total} dances` : `${visible} of ${total}`;
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

      const embedMatch = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/);
      return embedMatch?.[1] || "";
    }
  } catch {
    const looseMatch = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return looseMatch?.[1] || "";
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
