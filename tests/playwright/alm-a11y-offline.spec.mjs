// Accessibility (landmarks, accessible names, keyboard operability of custom
// controls) and offline/CSP behaviour for all three suite apps.
import { test, expect } from "@playwright/test";

const APPS = ["/screen/index.html", "/search/index.html", "/design/index.html"];

// ---- structural a11y: landmarks, accessible names, labelled controls ----
for (const app of APPS) {
  test(`a11y structure · ${app}`, async ({ page }) => {
    await page.goto(app);
    await page.waitForTimeout(150); // let a11y-landmarks.js run
    const audit = await page.evaluate(() => {
      const mains = document.querySelectorAll("main, [role=main]").length;
      // every visible button needs an accessible name
      const buttons = Array.from(document.querySelectorAll("button"));
      const namelessButtons = buttons.filter(b =>
        !(b.textContent.trim() || b.getAttribute("aria-label") || b.getAttribute("title"))).length;
      // every form control needs a programmatic label
      const fields = Array.from(document.querySelectorAll("input:not([type=hidden]), textarea, select"));
      const unlabelled = fields.filter(f =>
        !((f.labels && f.labels.length) || f.getAttribute("aria-label") || f.getAttribute("aria-labelledby"))).length;
      // the fixed hub-back link must sit inside a landmark (region fix)
      const back = document.getElementById("hub-back");
      const backInLandmark = back ? !!back.closest("nav,[role=navigation]") : true;
      return { mains, namelessButtons, unlabelled, backInLandmark };
    });
    expect(audit.mains).toBe(1);
    expect(audit.namelessButtons).toBe(0);
    expect(audit.unlabelled).toBe(0);
    expect(audit.backInLandmark).toBe(true);
  });
}

// ---- Screen: custom reason/label chips are keyboard operable (WCAG 2.1.1) ----
test("Screen reason chip is focusable and activates via Enter", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.locator("#btn-example").click();
  const chip = page.locator('#card-host [data-reason="0"]').first();
  await expect(chip).toHaveAttribute("tabindex", "0");
  await expect(chip).toHaveAttribute("role", "button");
  await chip.focus();
  await page.keyboard.press("Enter");
  const counts = await page.evaluate(() => window.__almScreenpro.counts());
  expect(counts.excluded).toBeGreaterThanOrEqual(1); // Enter applied an exclude+reason
});

test("Screen label chip is focusable and toggles via Space", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.locator("#btn-example").click();
  // add a label, fire input so the card re-renders with a label chip
  await page.evaluate(() => {
    const el = document.getElementById("f-labels");
    el.value = "key paper";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const chip = page.locator('#card-host [data-label="key paper"]').first();
  await expect(chip).toHaveAttribute("tabindex", "0");
  await chip.focus();
  await page.keyboard.press(" ");
  const pressed = await chip.getAttribute("aria-pressed");
  expect(pressed).toBe("true");
});

// ---- Search: result rows operable by keyboard (mock one source, no network) ----
test("Search result row with abstract is keyboard-expandable", async ({ page }) => {
  // Mock Europe PMC; disable the other three sources so no real network is hit.
  await page.route("**/europepmc/webservices/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ resultList: { result: [
      { title: "Synthetic heart failure trial fixture", abstractText: "Synthetic randomized trial description for keyboard testing." },
    ]}}),
  }));
  await page.goto("/search/index.html");
  await page.waitForFunction(() => !!window.__almSearch);
  for (const id of ["s-crossref", "s-openalex", "s-ctgov"]) {
    await page.locator("#" + id).uncheck();
  }
  await page.locator("#f-query").fill("dapagliflozin heart failure");
  await page.locator("#btn-search").click();
  const row = page.locator("#results tbody tr").first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("tabindex", "0");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(row).toHaveClass(/open/);
});

// ---- offline / CSP: no external origins loaded; local-first connect-src ----
for (const app of APPS) {
  test(`offline/CSP · ${app} loads only same-origin assets`, async ({ page }) => {
    const external = [];
    page.on("request", r => {
      const u = new URL(r.url());
      if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") external.push(r.url());
    });
    await page.goto(app);
    await page.waitForTimeout(200);
    expect(external, `unexpected external requests: ${external.join(", ")}`).toEqual([]);
    const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("frame-ancestors"); // removed: was a no-op in <meta> + console error
  });
}

// ---- export validity: RIS / CSV / JSON are well-formed (Screen) ----
test("Screen exports are well-formed (RIS records, CSV header, JSON schema)", async ({ page }) => {
  const logs = [];
  page.on("console", m => logs.push(m.text()));
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.locator("#btn-example").click();
  // include one record at title/abstract
  await page.locator('#card-host [data-dec="include"]').click();
  // Requirement: RIS exports FINAL (full-text) includes only. A title/abstract-only
  // include is not final, so the RIS export must produce no file and say why.
  const blobsBefore = await page.evaluate(() => {
    window.__risBlobs = 0;
    const o = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__risBlobs++; return o.call(URL, b); };
    document.getElementById("btn-export-ris").click();
    URL.createObjectURL = o;
    return window.__risBlobs;
  });
  expect(blobsBefore).toBe(0);
  expect(logs).toContain("No included records to export.");
  // Full text opens only once title/abstract is complete: exclude every other
  // non-duplicate record, then complete full-text screening for the included one
  // so the RIS export is non-empty.
  const pendingTA = () => page.evaluate(() => window.__almScreenpro.state().records.filter(r => !r.dup && !r.r1.d).length);
  for (let i = 0; i < 10 && await pendingTA() > 0; i++) {
    await page.locator("#nav-undec").click();
    await page.locator('#card-host [data-dec="exclude"]').click();
  }
  expect(await pendingTA()).toBe(0);
  await page.locator("#f-stage").selectOption("ft");
  await expect(page.locator("#f-stage")).toHaveValue("ft");
  await page.locator("#ft-retrieval").selectOption("retrieved");
  await page.locator("#ft-save").click();
  await page.locator('#card-host [data-dec="include"]').click();
  expect(await page.evaluate(() => window.__almScreenpro.state().records.filter(r => r.fullText.r1.d === "include").length)).toBe(1);
  const blobs = await page.evaluate(async () => {
    const captured = {};
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { const key = (b.type || "x"); captured[key] = captured[key] || []; return orig.call(URL, b); };
    function grab(id) {
      return new Promise(res => {
        const o = URL.createObjectURL;
        URL.createObjectURL = function (b) { b.text().then(t => res(t)); return o.call(URL, b); };
        document.getElementById(id).click();
      });
    }
    const json = await grab("btn-export-json");
    const csv = await grab("btn-export-csv");
    const ris = await grab("btn-export-ris");
    URL.createObjectURL = orig;
    return { json, csv, ris };
  });
  // JSON: parses, has records + counts
  const parsed = JSON.parse(blobs.json);
  expect(Array.isArray(parsed.records)).toBe(true);
  expect(parsed.counts).toBeTruthy();
  // CSV: header row present, quoted
  expect(blobs.csv.split("\n")[0]).toContain('"title"');
  // RIS: proper record delimiters
  expect(blobs.ris).toMatch(/^TY {2}- JOUR/m);
  expect(blobs.ris).toMatch(/^ER {2}- /m);
  // RIS carries exactly the one final (full-text) include, nothing excluded at title/abstract
  expect(blobs.ris.match(/^TY {2}- JOUR/gm)).toHaveLength(1);
  expect(blobs.ris).toContain("TI  - Synthetic demo: heart failure randomized trial");
});

// ---- CSV injection guard: dangerous prefixes neutralised, negatives preserved ----
test("Screen CSV neutralises formula-injection but keeps negative numbers intact", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const csv = await page.evaluate(async () => {
    window.__almScreenpro.setState({
      incTerms: ["safe"], excTerms: ["danger"],
      records: [
        { id: "x", title: "=cmd|' /C calc'!A1", abstract: "danger danger" }, // negative score, dangerous title
      ],
    });
    return new Promise(res => {
      const o = URL.createObjectURL;
      URL.createObjectURL = function (b) { b.text().then(t => { URL.createObjectURL = o; res(t); }); return o.call(URL, b); };
      document.getElementById("btn-export-csv").click();
    });
  });
  // dangerous "=..." title is prefixed with an apostrophe inside the quoted cell
  expect(csv).toContain(`"'=cmd`);
  // negative term_score (danger x2 = -4) must NOT be apostrophe-prefixed
  expect(csv).toMatch(/"-4"/);
  expect(csv).not.toContain(`"'-4"`);
});
