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

  function getFilters() {
    const categoryFilters = Array.from(new Set(projects.map((project) => project.category))).sort();
    return ["All", "Existing", "New"].concat(categoryFilters);
  }

  function updateMetrics() {
    const categories = new Set(projects.map((project) => project.category));
    counts.launchable.textContent = String(projects.filter((project) => project.mode === "file").length);
    counts.server.textContent = String(projects.filter((project) => project.mode === "server").length);
    counts.added.textContent = String(projects.filter((project) => project.collection === "new").length);
    counts.categories.textContent = String(categories.size);
  }

  function createFilterButtons() {
    filterBar.innerHTML = "";
    getFilters().forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-chip${label === activeFilter ? " is-active" : ""}`;
      button.textContent = label;
      button.addEventListener("click", function () {
        activeFilter = label;
        createFilterButtons();
        render();
      });
      filterBar.appendChild(button);
    });
  }

  function matchesFilter(project) {
    if (activeFilter === "All") {
      return true;
    }

    if (activeFilter === "Existing" || activeFilter === "New") {
      return project.collection === activeFilter.toLowerCase();
    }

    return project.category === activeFilter;
  }

  function matchesSearch(project, query) {
    if (!query) {
      return true;
    }

    const haystack = [
      project.name,
      project.folder,
      project.summary,
      project.note,
      project.category,
      (project.tags || []).join(" ")
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  }

  function resolveHref(path) {
    return new URL(path, window.location.href).toString();
  }

  function makeTag(text) {
    const span = document.createElement("span");
    span.className = "meta-tag";
    span.textContent = text;
    return span;
  }

  function renderCard(project) {
    const article = document.createElement("article");
    article.className = "project-card";

    const statusClass = project.collection === "new"
      ? "pill pill-new"
      : project.mode === "server"
        ? "pill pill-server"
        : "pill pill-ready";

    const statusLabel = project.collection === "new"
      ? "New App"
      : project.mode === "server"
        ? "Needs HTTP"
        : "Launchable";

    article.innerHTML = `
      <div class="project-head">
        <div>
          <h3>${project.name}</h3>
          <div class="project-folder">${project.folder}</div>
        </div>
        <span class="${statusClass}">${statusLabel}</span>
      </div>
      <p class="project-summary">${project.summary}</p>
      <div class="meta-row"></div>
      <div class="project-note">${project.note}</div>
      <div class="project-actions"></div>
    `;

    const tagRow = article.querySelector(".meta-row");
    [project.category].concat(project.tags || []).slice(0, 4).forEach((tag) => {
      tagRow.appendChild(makeTag(tag));
    });

    const actions = article.querySelector(".project-actions");
    const launch = document.createElement(project.mode === "server" ? "span" : "a");
    launch.className = `project-link project-link-primary${project.mode === "server" ? " project-link-disabled" : ""}`;
    launch.textContent = project.mode === "server" ? "Use Local Server" : "Open App";
    if (project.mode !== "server") {
      launch.href = resolveHref(project.path);
    }
    actions.appendChild(launch);

    const copyLink = document.createElement("a");
    copyLink.className = "project-link project-link-secondary";
    copyLink.textContent = "Open Folder Target";
    copyLink.href = resolveHref(project.path);
    actions.appendChild(copyLink);

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
      visible.forEach((project) => grid.appendChild(renderCard(project)));
    }

    resultsSummary.textContent = `${visible.length} project${visible.length === 1 ? "" : "s"} shown`;
  }

  updateMetrics();
  createFilterButtons();
  render();

  searchInput.addEventListener("input", render);
})();
