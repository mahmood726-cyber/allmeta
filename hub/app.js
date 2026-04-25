(function () {
  const projects = Array.isArray(window.HTML_APPS_PROJECTS) ? window.HTML_APPS_PROJECTS.slice() : [];
  const searchInput = document.getElementById("search-input");
  const grid = document.getElementById("project-grid");
  const filterBar = document.getElementById("filter-bar");
  const resultsSummary = document.getElementById("results-summary");

  const counts = {
    launchable: document.getElementById("launchable-count"),
    server: document.getElementById("server-count"),
    added: document.getElementById("new-count"),
    categories: document.getElementById("category-count")
  };

  let activeFilter = "All";
  let filterButtons = [];

  // Safe scheme prefixes for launch links. Rejects javascript:, data:, file: (etc.)
  const SAFE_SCHEMES = /^(https?:|\.|\/|#)/i;

  function safeHref(path) {
    if (typeof path !== "string" || !path) return "#";
    if (!SAFE_SCHEMES.test(path) && !/^\.\.?\//.test(path)) return "#";
    try {
      const u = new URL(path, window.location.href);
      if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:") {
        return u.toString();
      }
      return "#";
    } catch (_) {
      return "#";
    }
  }

  function getFilters() {
    const categoryFilters = Array.from(new Set(projects.map((project) => project.category))).sort();
    return ["All", "Existing", "New"].concat(categoryFilters);
  }

  function updateMetrics() {
    const categories = new Set(projects.map((project) => project.category));
    counts.launchable.textContent = String(projects.filter((project) => project.mode === "file").length);
    counts.server.textContent = String(projects.filter((project) => project.mode === "url").length);
    counts.added.textContent = String(projects.filter((project) => project.collection === "new").length);
    counts.categories.textContent = String(categories.size);
  }

  function createFilterButtons() {
    filterBar.innerHTML = "";
    filterButtons = [];
    getFilters().forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      const isActive = label === activeFilter;
      button.className = `filter-chip${isActive ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.textContent = label;
      button.addEventListener("click", function () {
        activeFilter = label;
        filterButtons.forEach((b) => {
          const on = b.textContent === activeFilter;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        render();
      });
      filterBar.appendChild(button);
      filterButtons.push(button);
    });
  }

  function matchesFilter(project) {
    if (activeFilter === "All") return true;
    if (activeFilter === "Existing" || activeFilter === "New") {
      return project.collection === activeFilter.toLowerCase();
    }
    return project.category === activeFilter;
  }

  function matchesSearch(project, query) {
    if (!query) return true;
    const haystack = [
      project.name,
      project.summary,
      project.note,
      project.category,
      (project.tags || []).join(" ")
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function makeTag(text) {
    const span = document.createElement("span");
    span.className = "meta-tag";
    span.textContent = text;
    return span;
  }

  // DOM builder — never use innerHTML with user-controlled content. Projects.js is
  // developer-controlled but we treat it defensively per the P0-Sec5 review finding.
  function renderCard(project) {
    const article = document.createElement("article");
    article.className = "project-card";

    const head = document.createElement("div"); head.className = "project-head";
    const headText = document.createElement("div");
    const h3 = document.createElement("h3"); h3.textContent = project.name || "";
    headText.appendChild(h3);
    head.appendChild(headText);

    const isNew = project.collection === "new";
    const isServer = project.mode === "server";
    const pill = document.createElement("span");
    pill.className = "pill " + (isNew ? "pill-new" : isServer ? "pill-server" : "pill-ready");
    pill.textContent = isNew ? "New App" : isServer ? "Needs HTTP" : "Launchable";
    head.appendChild(pill);
    article.appendChild(head);

    const summary = document.createElement("p");
    summary.className = "project-summary";
    summary.textContent = project.summary || "";
    article.appendChild(summary);

    const tagRow = document.createElement("div");
    tagRow.className = "meta-row";
    [project.category].concat(project.tags || []).slice(0, 4).forEach((tag) => {
      if (tag) tagRow.appendChild(makeTag(tag));
    });
    article.appendChild(tagRow);

    if (project.note) {
      const note = document.createElement("div");
      note.className = "project-note";
      note.textContent = project.note;
      article.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "project-actions";
    const href = safeHref(project.path);
    const canLaunch = !isServer && href !== "#";
    const launch = document.createElement(canLaunch ? "a" : "span");
    launch.className = "project-link project-link-primary" + (canLaunch ? "" : " project-link-disabled");
    launch.textContent = canLaunch ? "Open App" : (isServer ? "Use Local Server" : "Unavailable");
    if (canLaunch) {
      launch.href = href;
      // WCAG 2.4.4 — link purpose disambiguated for screen readers
      launch.setAttribute("aria-label", "Open " + project.name);
      // Open external (URL-mode) cards in a new tab
      if (project.mode === "url") {
        launch.target = "_blank";
        launch.rel = "noopener noreferrer";
      }
    }
    actions.appendChild(launch);
    article.appendChild(actions);

    return article;
  }

  function render() {
    const query = (searchInput.value || "").trim().toLowerCase();
    const visible = projects.filter((project) => matchesFilter(project) && matchesSearch(project, query));

    grid.innerHTML = "";

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No projects match the current search and filter.";
      grid.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      visible.forEach((project) => frag.appendChild(renderCard(project)));
      grid.appendChild(frag);
    }

    resultsSummary.textContent = `${visible.length} project${visible.length === 1 ? "" : "s"} shown`;
  }

  updateMetrics();
  createFilterButtons();
  render();

  searchInput.addEventListener("input", render);
})();
