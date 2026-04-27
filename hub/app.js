(function () {
  const projects = Array.isArray(window.HTML_APPS_PROJECTS) ? window.HTML_APPS_PROJECTS.slice() : [];

  // Inline-SVG thumbnail set. Offline-first (no CDN), CSP-friendly.
  // Each icon is 40x40 with a viewBox of 0 0 40 40 and uses currentColor so the
  // CSS .project-thumb-* gradient backgrounds render through. Pick by
  // subcategory first, then category, then default.
  const THUMBS = {
    "pooling":     '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><line x1="20" y1="6" x2="20" y2="34" stroke="currentColor" stroke-width="1" opacity="0.4"/><line x1="8" y1="11" x2="32" y2="11" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="11" r="2.5" fill="currentColor"/><line x1="11" y1="20" x2="29" y2="20" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="20" r="2.5" fill="currentColor"/><line x1="6" y1="29" x2="34" y2="29" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="29" r="2.5" fill="currentColor"/></svg>',
    "heterogeneity": '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="10" cy="14" r="2.4" fill="currentColor"/><circle cx="18" cy="9"  r="2.4" fill="currentColor"/><circle cx="22" cy="20" r="2.4" fill="currentColor"/><circle cx="14" cy="24" r="2.4" fill="currentColor"/><circle cx="29" cy="16" r="2.4" fill="currentColor"/><circle cx="32" cy="29" r="2.4" fill="currentColor"/><circle cx="20" cy="32" r="2.4" fill="currentColor"/><circle cx="8"  cy="30" r="2.4" fill="currentColor"/></svg>',
    "pubbias":     '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><polygon points="20,6 6,34 34,34" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="20" y1="6" x2="20" y2="34" stroke="currentColor" stroke-width="0.8" opacity="0.5"/><circle cx="20" cy="14" r="1.6" fill="currentColor"/><circle cx="16" cy="22" r="1.6" fill="currentColor"/><circle cx="24" cy="22" r="1.6" fill="currentColor"/><circle cx="13" cy="29" r="1.6" fill="currentColor"/><circle cx="27" cy="29" r="1.6" fill="currentColor"/></svg>',
    "nma":         '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><line x1="20" y1="8" x2="32" y2="20" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="8" x2="8"  y2="20" stroke="currentColor" stroke-width="1.4"/><line x1="32" y1="20" x2="26" y2="32" stroke="currentColor" stroke-width="1.4"/><line x1="8"  y1="20" x2="14" y2="32" stroke="currentColor" stroke-width="1.4"/><line x1="14" y1="32" x2="26" y2="32" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="8"  x2="14" y2="32" stroke="currentColor" stroke-width="0.8" opacity="0.6"/><circle cx="20" cy="8"  r="3.2" fill="currentColor"/><circle cx="32" cy="20" r="3.2" fill="currentColor"/><circle cx="26" cy="32" r="3.2" fill="currentColor"/><circle cx="14" cy="32" r="3.2" fill="currentColor"/><circle cx="8"  cy="20" r="3.2" fill="currentColor"/></svg>',
    "dta":         '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="6" y="6" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/><line x1="6" y1="20" x2="34" y2="20" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><line x1="20" y1="6" x2="20" y2="34" stroke="currentColor" stroke-width="0.8" opacity="0.4"/><path d="M 6 34 Q 14 18 22 14 Q 30 11 34 6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="14" r="1.8" fill="currentColor"/></svg>',
    "rob":         '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="14" y="5" width="12" height="30" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="20" cy="11" r="3.2" fill="currentColor" opacity="0.85"/><circle cx="20" cy="20" r="3.2" fill="currentColor" opacity="0.55"/><circle cx="20" cy="29" r="3.2" fill="currentColor" opacity="0.25"/></svg>',
    "reporting":   '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="9" y="6" width="22" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="13" y1="13" x2="27" y2="13" stroke="currentColor" stroke-width="1.4"/><line x1="13" y1="19" x2="27" y2="19" stroke="currentColor" stroke-width="1.4"/><line x1="13" y1="25" x2="22" y2="25" stroke="currentColor" stroke-width="1.4"/><circle cx="11" cy="13" r="0.9" fill="currentColor"/><circle cx="11" cy="19" r="0.9" fill="currentColor"/><circle cx="11" cy="25" r="0.9" fill="currentColor"/></svg>',
    "screening":   '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="7" y="7" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="23" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><polyline points="9,12 12,15 19,9" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="9" y1="28" x2="19" y2="28" stroke="currentColor" stroke-width="1.4"/><line x1="9" y1="31" x2="16" y2="31" stroke="currentColor" stroke-width="1.4"/><polyline points="26,12 30,16 34,12" fill="none" stroke="currentColor" stroke-width="1.4"/><polyline points="26,28 30,32 34,28" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    "search":      '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="17" cy="17" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="24" y1="24" x2="33" y2="33" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    "planning":    '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="7"  y1="20" x2="33" y2="20" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="7"  x2="20" y2="33" stroke="currentColor" stroke-width="1.4"/><circle cx="20" cy="20" r="2.2" fill="currentColor"/></svg>',
    "rwasm":       '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="6" y="9" width="28" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="6" y1="14" x2="34" y2="14" stroke="currentColor" stroke-width="1.2"/><polyline points="11,21 14,24 11,27" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="18" y1="27" x2="26" y2="27" stroke="currentColor" stroke-width="1.6"/></svg>',
    "trial":       '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><polyline points="6,32 6,24 14,24 14,16 22,16 22,10 30,10 30,6 34,6" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="6" y1="34" x2="34" y2="34" stroke="currentColor" stroke-width="1.2" opacity="0.5"/></svg>',
    "qualitative": '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="9" y="11" width="18" height="22" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.55"/><rect x="13" y="7" width="18" height="22" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="17" y1="13" x2="27" y2="13" stroke="currentColor" stroke-width="1.2"/><line x1="17" y1="18" x2="27" y2="18" stroke="currentColor" stroke-width="1.2"/><line x1="17" y1="23" x2="23" y2="23" stroke="currentColor" stroke-width="1.2"/></svg>',
    "living":      '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M 32 14 A 12 12 0 1 0 33 25" fill="none" stroke="currentColor" stroke-width="1.8"/><polyline points="33,8 33,14 27,14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><polyline points="13,26 17,21 22,24 28,17" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    "hta":         '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="12" x2="20" y2="20" stroke="currentColor" stroke-width="1.4"/><line x1="11" y1="20" x2="29" y2="20" stroke="currentColor" stroke-width="1.4"/><circle cx="11" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="20" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="29" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="11" y1="20" x2="11" y2="23" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="20" x2="20" y2="23" stroke="currentColor" stroke-width="1.4"/><line x1="29" y1="20" x2="29" y2="23" stroke="currentColor" stroke-width="1.4"/></svg>',
    "productivity": '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="22" r="11" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="20" y1="22" x2="20" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="22" x2="26" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="6" x2="24" y2="6" stroke="currentColor" stroke-width="1.6"/><line x1="20" y1="6" x2="20" y2="10" stroke="currentColor" stroke-width="1.6"/></svg>',
    "default":     '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><polyline points="6,30 13,22 19,26 27,14 34,20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="34" cy="20" r="2" fill="currentColor"/></svg>'
  };

  // Map (subcategory || category) → thumb key.
  const SUB_TO_THUMB = {
    "Pooling": "pooling",
    "Heterogeneity": "heterogeneity",
    "Publication bias": "pubbias",
    "Effect-size tools": "default",
    "Sensitivity": "default",
    "Reporting": "reporting"
  };
  const CAT_TO_THUMB = {
    "Network Meta-Analysis": "nma",
    "Diagnostic Test Accuracy": "dta",
    "Risk of Bias": "rob",
    "Reporting": "reporting",
    "Screening & Extraction": "screening",
    "Search": "search",
    "Planning": "planning",
    "R / WASM": "rwasm",
    "Trial Design": "trial",
    "Qualitative Synthesis": "qualitative",
    "Living Meta-Analysis": "living",
    "Health Technology Assessment": "hta",
    "Productivity": "productivity",
    "Research Notes": "qualitative",
    "Clinical Prediction": "default",
    "Clinical Dashboard": "default",
    "Evidence Synthesis": "pooling"
  };

  function getThumbKey(project) {
    if (project.subcategory && SUB_TO_THUMB[project.subcategory]) return SUB_TO_THUMB[project.subcategory];
    if (project.category && CAT_TO_THUMB[project.category]) return CAT_TO_THUMB[project.category];
    return "default";
  }

  function makeThumb(project, sizeClass) {
    const key = getThumbKey(project);
    const wrap = document.createElement("span");
    wrap.className = "project-thumb project-thumb-" + key + (sizeClass ? " " + sizeClass : "");
    wrap.setAttribute("aria-hidden", "true");
    // SVG content is hardcoded per key (no project data interpolated) — innerHTML
    // is safe here. project.name reaches the page via textContent in the head.
    wrap.innerHTML = THUMBS[key] || THUMBS.default;
    return wrap;
  }

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

  // Safe scheme prefixes for launch links. Rejects javascript:, data:, vbscript:,
  // about:, etc. file: is intentionally accepted at the resolved-URL stage so the
  // hub still works when index.html is opened directly from disk (offline-first
  // design). External (http(s)) links are also accepted via the same gate.
  const SAFE_SCHEMES = /^(https?:|\.|\/|#)/i;

  function safeHref(path) {
    if (typeof path !== "string" || !path) return "#";
    // V9-E04: reject protocol-relative URLs (//evil.com/x). The leading-slash
    // branch of SAFE_SCHEMES is intentional for /-rooted relative paths, but
    // // would resolve to a cross-origin URL via the URL constructor.
    if (path.startsWith("//")) return "#";
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
      // D1-P2-01: pluralisation — "1 tool" not "1 tools".
      const filterCount = countForFilter(label);
      button.setAttribute("aria-label", label + ", " + filterCount + (filterCount === 1 ? " tool" : " tools"));
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
      bar = document.createElement("nav");
      bar.id = "subcategory-bar";
      bar.className = "filters subfilters";
      bar.setAttribute("aria-label", "Subcategory filter");
      // No aria-live here — re-announcing 6-12 chips on every category change is
      // verbose. The existing #results-summary live region announces the
      // post-filter result count, which is the actionable signal.
    }
    // Always re-position next to filterBar so re-runs of createFilterButtons
    // can't leave the bar orphaned (P1-01 idempotency).
    if (bar.previousElementSibling !== filterBar) {
      filterBar.parentNode.insertBefore(bar, filterBar.nextSibling);
    }
    bar.replaceChildren();
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
      const subCount = countForSubcategory(activeFilter, sub);
      btn.setAttribute("aria-label", sub + ", " + subCount + (subCount === 1 ? " tool" : " tools"));
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
    head.appendChild(makeThumb(project));
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
    // Featured cards render in array order, but `featuredRank` (lower first)
    // overrides — lets us pin the canonical anchor app at position 1 without
    // having to physically move it in projects.js.
    const featured = projects
      .filter((p) => p.featured && p.mode !== "server")
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ra = (a.p.featuredRank == null) ? 99 : a.p.featuredRank;
        const rb = (b.p.featuredRank == null) ? 99 : b.p.featuredRank;
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      })
      .map((x) => x.p);
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
      card.appendChild(makeThumb(p, "project-thumb-lg"));
      const cardBody = document.createElement("span");
      cardBody.className = "featured-card-body";
      const cardName = document.createElement("strong");
      cardName.className = "featured-card-name";
      cardName.textContent = p.name;
      cardBody.appendChild(cardName);
      const cardCat = document.createElement("span");
      cardCat.className = "featured-card-cat";
      cardCat.textContent = p.category;
      cardBody.appendChild(cardCat);
      card.appendChild(cardBody);
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
    // V9-E13: use the .hidden attribute consistently (was previously mixing
    // .hidden in renderFeaturedStrip with style.display here, which created a
    // potential race where a filter-clear couldn't unhide if .hidden=true).
    if (featuredStrip) {
      const filtering = activeFilter !== "All" || !!query;
      const noFeatured = !projects.some((p) => p.featured);
      featuredStrip.hidden = filtering || noFeatured;
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
  // E6: clear pending timer on pagehide so we don't fire after navigation away.
  window.addEventListener("pagehide", function () {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  });
})();
