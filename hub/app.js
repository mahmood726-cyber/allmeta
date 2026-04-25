(function () {
  const projects = Array.isArray(window.HTML_APPS_PROJECTS) ? window.HTML_APPS_PROJECTS.slice() : [];
  const searchInput = document.getElementById("search-input");
  const grid = document.getElementById("project-grid");
  const filterBar = document.getElementById("filter-bar");
  const resultsSummary = document.getElementById("results-summary");
  const featuredStrip = document.getElementById("featured-strip");

  const counts = {
    launchable: document.getElementById("launchable-count"),
    server: document.getElementById("server-count"),
    added: document.getElementById("new-count"),
    categories: document.getElementById("category-count")
  };

  let activeFilter = "All";
  let activeSubcategory = "All";
  let filterButtons = [];
  let subcategoryButtons = [];

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

  // Subcategory chips appear when a top-level category that has subcategorised
  // entries is selected. Currently only "Evidence Synthesis" uses subcategories.
  function getSubcategories(category) {
    if (!category || category === "All" || category === "Existing" || category === "New") return [];
    const subs = projects
      .filter((p) => p.category === category && typeof p.subcategory === "string" && p.subcategory)
      .map((p) => p.subcategory);
    if (!subs.length) return [];
    return ["All"].concat(Array.from(new Set(subs)).sort());
  }

  function countForFilter(label) {
    if (label === "All") return projects.length;
    if (label === "Existing" || label === "New") {
      return projects.filter((p) => p.collection === label.toLowerCase()).length;
    }
    return projects.filter((p) => p.category === label).length;
  }

  function countForSubcategory(category, sub) {
    if (sub === "All") return projects.filter((p) => p.category === category).length;
    return projects.filter((p) => p.category === category && p.subcategory === sub).length;
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
      button.dataset.filter = label;
      const labelSpan = document.createElement("span"); labelSpan.textContent = label;
      const count = document.createElement("span");
      count.className = "filter-chip-count";
      count.textContent = " (" + countForFilter(label) + ")";
      count.setAttribute("aria-hidden", "true"); // SR reads from labelSpan + aria-pressed
      button.appendChild(labelSpan);
      button.appendChild(count);
      button.setAttribute("aria-label", label + ", " + countForFilter(label) + " tools");
      button.addEventListener("click", function () {
        activeFilter = label;
        activeSubcategory = "All"; // top-level change resets subcategory
        filterButtons.forEach((b) => {
          const on = b.dataset.filter === activeFilter;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderSubcategoryBar();
        syncUrl();
        render();
      });
      filterBar.appendChild(button);
      filterButtons.push(button);
    });
    renderSubcategoryBar();
  }

  function renderSubcategoryBar() {
    let bar = document.getElementById("subcategory-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "subcategory-bar";
      bar.className = "filters subfilters";
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "Subcategory");
      filterBar.parentNode.insertBefore(bar, filterBar.nextSibling);
    }
    bar.innerHTML = "";
    subcategoryButtons = [];
    const subs = getSubcategories(activeFilter);
    if (!subs.length) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    subs.forEach((sub) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = sub === activeSubcategory;
      btn.className = `filter-chip filter-chip-sub${isActive ? " is-active" : ""}`;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.dataset.sub = sub;
      const labelSpan = document.createElement("span"); labelSpan.textContent = sub;
      const count = document.createElement("span");
      count.className = "filter-chip-count";
      count.textContent = " (" + countForSubcategory(activeFilter, sub) + ")";
      count.setAttribute("aria-hidden", "true");
      btn.appendChild(labelSpan);
      btn.appendChild(count);
      btn.setAttribute("aria-label", sub + ", " + countForSubcategory(activeFilter, sub) + " tools");
      btn.addEventListener("click", function () {
        activeSubcategory = sub;
        subcategoryButtons.forEach((b) => {
          const on = b.dataset.sub === activeSubcategory;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        syncUrl();
        render();
      });
      bar.appendChild(btn);
      subcategoryButtons.push(btn);
    });
  }

  function matchesFilter(project) {
    if (activeFilter === "All") return true;
    if (activeFilter === "Existing" || activeFilter === "New") {
      return project.collection === activeFilter.toLowerCase();
    }
    if (project.category !== activeFilter) return false;
    if (activeSubcategory && activeSubcategory !== "All") {
      return project.subcategory === activeSubcategory;
    }
    return true;
  }

  function matchesSearch(project, query) {
    if (!query) return true;
    const haystack = [
      project.name,
      project.summary,
      project.note,
      project.category,
      (project.tags || []).join(" "),
      (project.keywords || []).join(" ")
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
    if (project.featured) article.classList.add("project-card-featured");

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

    // Course cross-link — opens in new tab. Only rendered when project.course is set.
    if (typeof project.course === "string" && project.course) {
      const courseLink = document.createElement("a");
      courseLink.className = "project-link project-link-course";
      courseLink.href = project.course;
      courseLink.target = "_blank";
      courseLink.rel = "noopener noreferrer";
      courseLink.textContent = "Learn the theory →";
      courseLink.setAttribute("aria-label", "Companion course for " + project.name + " (opens in new tab)");
      actions.appendChild(courseLink);
    }

    article.appendChild(actions);

    return article;
  }

  function renderFeaturedStrip() {
    if (!featuredStrip) return;
    const featured = projects.filter((p) => p.featured && p.mode !== "server");
    if (!featured.length) {
      featuredStrip.hidden = true;
      featuredStrip.innerHTML = "";
      return;
    }
    featuredStrip.hidden = false;
    featuredStrip.innerHTML = "";

    const heading = document.createElement("h2");
    heading.className = "featured-strip-heading";
    heading.textContent = "Start here";
    featuredStrip.appendChild(heading);

    const sub = document.createElement("p");
    sub.className = "featured-strip-sub";
    sub.textContent = "The most-used tools — direct entry points for the common workflows.";
    featuredStrip.appendChild(sub);

    const row = document.createElement("div");
    row.className = "featured-strip-row";
    featured.forEach((p) => {
      const href = safeHref(p.path);
      const card = document.createElement("a");
      card.className = "featured-card";
      card.href = href;
      card.setAttribute("aria-label", "Open " + p.name);
      const cardName = document.createElement("strong");
      cardName.className = "featured-card-name";
      cardName.textContent = p.name;
      card.appendChild(cardName);
      const cardCat = document.createElement("span");
      cardCat.className = "featured-card-cat";
      cardCat.textContent = p.category;
      card.appendChild(cardCat);
      row.appendChild(card);
    });
    featuredStrip.appendChild(row);
  }

  function render() {
    const query = (searchInput.value || "").trim().toLowerCase();
    const visible = projects.filter((project) => matchesFilter(project) && matchesSearch(project, query));

    grid.innerHTML = "";

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No projects match the current search and filter. Try clearing one of them, or browse a workflow.";
      grid.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      visible.forEach((project) => frag.appendChild(renderCard(project)));
      grid.appendChild(frag);
    }

    resultsSummary.textContent = `${visible.length} project${visible.length === 1 ? "" : "s"} shown`;
    // Hide featured strip when actively filtering / searching — it's a "browse" affordance.
    if (featuredStrip) {
      const filtering = activeFilter !== "All" || !!query;
      featuredStrip.style.display = filtering ? "none" : "";
    }
  }

  // URL-state sync. ?q=foo&cat=Pairwise%20MA&sub=Pooling round-trips on share/refresh.
  function readUrlState() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q") || "";
      const cat = params.get("cat") || "All";
      const sub = params.get("sub") || "All";
      if (q && searchInput) searchInput.value = q;
      const valid = new Set(getFilters());
      activeFilter = valid.has(cat) ? cat : "All";
      const validSubs = new Set(getSubcategories(activeFilter));
      activeSubcategory = validSubs.has(sub) ? sub : "All";
    } catch (_) { /* malformed URL — ignore */ }
  }
  function syncUrl() {
    try {
      const params = new URLSearchParams();
      const q = (searchInput.value || "").trim();
      if (q) params.set("q", q);
      if (activeFilter && activeFilter !== "All") params.set("cat", activeFilter);
      if (activeSubcategory && activeSubcategory !== "All") params.set("sub", activeSubcategory);
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    } catch (_) { /* history API not available — ignore */ }
  }

  // Debounce search to avoid 71-card rebuilds on every keystroke (V4-P1-27).
  let searchTimer = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      syncUrl();
      render();
    }, 120);
  }

  readUrlState();
  updateMetrics();
  createFilterButtons();
  renderFeaturedStrip();
  render();

  searchInput.addEventListener("input", onSearchInput);
})();
