"use strict";

const state = {
  report: null,
  trialFilter: "core",
  publicationFilter: "oa",
};

const $ = (id) => document.getElementById(id);

function formatDate(value) {
  if (!value) return "Not reported";
  return String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "Not reported";
  return Number(value).toLocaleString();
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).length === 4 ? `${value}-01-01` : String(value).length === 7 ? `${value}-01` : String(value);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSinceAnchor(value) {
  const report = state.report;
  if (!report) return false;
  const anchor = parseDate(report.topic.surveillance_anchor);
  const observed = parseDate(value);
  return Boolean(anchor && observed && observed >= anchor);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function appendTermValue(list, term, value) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (value instanceof Node) {
    dd.append(value);
  } else {
    dd.textContent = value;
  }
  list.append(dt, dd);
}

function badge(text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function filterTrials() {
  const trials = state.report.trials.slice();
  switch (state.trialFilter) {
    case "results":
      return trials.filter((trial) => trial.relevance === "core" && trial.has_results);
    case "active":
      return trials.filter((trial) => trial.relevance === "core" && ["RECRUITING", "ACTIVE_NOT_RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"].includes(trial.status));
    case "all":
      return trials;
    case "core":
    default:
      return trials.filter((trial) => trial.relevance === "core");
  }
}

function filterPublications() {
  const publications = state.report.publications.slice();
  switch (state.publicationFilter) {
    case "all":
      return publications;
    case "recent":
      return publications.filter((publication) => isSinceAnchor(publication.publication_date));
    case "oa":
    default:
      return publications.filter((publication) => publication.is_oa);
  }
}

function renderTrial(trial) {
  const template = $("trial-template");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = trial.title;
  const sourceLink = node.querySelector(".source-link");
  sourceLink.href = trial.ctgov_url;
  sourceLink.textContent = trial.nct_id;

  const list = node.querySelector("dl");
  const relevance = badge(trial.relevance === "core" ? "core" : "adjacent", trial.relevance === "core" ? "badge-core" : "badge-open");
  appendTermValue(list, "Relevance", relevance);
  appendTermValue(list, "Status", trial.status);
  appendTermValue(list, "Phase", trial.phase);
  appendTermValue(list, "Enrollment", `${formatNumber(trial.enrollment)} (${trial.enrollment_type})`);
  appendTermValue(list, "Sponsor", `${trial.sponsor} (${trial.sponsor_class})`);
  appendTermValue(list, "Results", trial.has_results ? "posted" : "not posted");
  appendTermValue(list, "Randomized", trial.is_randomized ? "yes" : "no");
  appendTermValue(list, "Completion", formatDate(trial.completion_date));
  appendTermValue(list, "Last update", formatDate(trial.last_update_posted));
  appendTermValue(list, "Registry refs", formatNumber(trial.registry_references.length));

  const outcomes = node.querySelector(".outcomes");
  const outcomeText = trial.primary_outcomes.length ? trial.primary_outcomes.slice(0, 2).join(" | ") : "No primary outcome text reported.";
  outcomes.textContent = `Primary outcome: ${outcomeText}`;
  return node;
}

function renderPublication(publication) {
  const template = $("publication-template");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = publication.title || "Untitled publication";
  const sourceLink = node.querySelector(".source-link");
  sourceLink.href = publication.doi || publication.oa_url || publication.id;
  sourceLink.textContent = publication.doi ? "DOI" : "OpenAlex";

  const list = node.querySelector("dl");
  appendTermValue(list, "Source", publication.source || "Not reported");
  appendTermValue(list, "Published", formatDate(publication.publication_date));
  appendTermValue(list, "Open access", publication.is_oa ? `${publication.oa_status || "yes"}` : "no");
  appendTermValue(list, "Cited by", formatNumber(publication.cited_by_count));
  appendTermValue(list, "OpenAlex", publication.id || "Not reported");
  return node;
}

function renderRecords() {
  const trialList = $("trial-list");
  const publicationList = $("publication-list");
  trialList.replaceChildren(...filterTrials().map(renderTrial));
  publicationList.replaceChildren(...filterPublications().map(renderPublication));
  setText("trial-count", `${trialList.children.length} shown`);
  setText("publication-count", `${publicationList.children.length} shown`);
}

function renderDisclosure() {
  const host = $("disclosure-list");
  const nodes = state.report.hardcode_disclosure.map((item) => {
    const node = document.createElement("article");
    node.className = "disclosure-item";
    const title = document.createElement("h3");
    title.textContent = `${item.item}: ${item.status}`;
    const reason = document.createElement("p");
    reason.textContent = item.reason;
    node.append(title, reason);
    return node;
  });
  host.replaceChildren(...nodes);
}

function renderSummary() {
  const { report } = state;
  const summary = report.summary;
  setText("verdict", summary.verdict);
  setText("verdict-detail", summary.verdict_detail);
  setText("receipt-hash", report.truthcert.payload_hash);
  setText("clinical-question", report.topic.clinical_question);
  setText("source-policy", report.topic.source_policy);
  setText("surveillance-anchor", report.topic.surveillance_anchor);
  setText("metric-core", summary.core_trials);
  setText("metric-randomized", summary.randomized_trials);
  setText("metric-results", summary.completed_with_results);
  setText("metric-active", summary.active_trials);
  setText("metric-publications", summary.publication_candidates);
  setText("metric-oa", summary.oa_publication_candidates);
  setText("gate-trials", summary.new_trial_updates_since_anchor);
  setText("gate-publications", summary.new_publications_since_anchor);
  setText("gate-ready", summary.meta_ready ? "ready" : "not ready");
  setText("gate-state", summary.verdict);
  renderDisclosure();
  renderRecords();
}

function attachControls() {
  $("trial-filter").addEventListener("change", (event) => {
    state.trialFilter = event.target.value;
    renderRecords();
  });
  $("publication-filter").addEventListener("change", (event) => {
    state.publicationFilter = event.target.value;
    renderRecords();
  });
}

async function loadReport() {
  const response = await fetch("./data/report.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load report: ${response.status}`);
  }
  state.report = await response.json();
  if (state.report.schema !== "evidenceos.report.v0.1") {
    throw new Error(`Unsupported report schema: ${state.report.schema}`);
  }
  renderSummary();
}

attachControls();
loadReport().catch((error) => {
  setText("verdict", "Report load failed");
  setText("verdict-detail", error.message);
});
