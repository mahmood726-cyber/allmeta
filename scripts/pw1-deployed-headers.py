"""Read-only deployment probe; prints public headers and service-worker source."""
import json
import re
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import ProxyHandler, build_opener

BASE = "https://mahmood726-cyber.github.io/allmeta/"
HEADERS = (
    "content-type", "cross-origin-opener-policy", "cross-origin-embedder-policy",
    "cross-origin-resource-policy", "access-control-allow-origin",
    "service-worker-allowed", "location",
)
# Do not inspect environment or proxy credentials.
opener = build_opener(ProxyHandler({}))


class PageMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.service_worker_dir = None
        self.base_href = None
        self.script_sources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("name") == "shinylive:serviceworker_dir":
            self.service_worker_dir = attrs.get("content", "")
        if tag == "base" and "href" in attrs and self.base_href is None:
            self.base_href = attrs["href"]
        if tag == "script" and "src" in attrs:
            self.script_sources.append(attrs["src"])


page = None
page_base = None
urls = [
    urljoin(BASE, "r-shiny/annualised-plot/"),
    urljoin(BASE, "r-shiny/shinylive/webr/webr-worker.js"),
    # This loader was observed in the page by the first probe. Inspect its
    # registration target instead of assuming serviceworker.js is that target.
    urljoin(BASE, "r-shiny/shinylive/load-shinylive-sw.js"),
]
seen = set()
for url in urls:
    if url in seen:
        continue
    seen.add(url)
    try:
        try:
            response = opener.open(url, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            body = response.read().decode("utf-8", errors="replace")
            result = {"url": url, "final_url": response.url, "status": response.status,
                      "headers": {name: response.headers.get(name) for name in HEADERS}}
            if url.endswith("/"):
                page = PageMetadata()
                page.feed(body)
                page_base = urljoin(response.url, page.base_href or "")
                result["script_sources"] = page.script_sources
                result["service_worker_dir_meta"] = page.service_worker_dir
            if url.endswith("load-shinylive-sw.js"):
                result["loader_source"] = body[:20000]
                # Follow the observed loader's directory + suffix expression.
                # Its quoted "/shinylive-sw.js" is not a standalone root URL.
                known_loader = all(fragment in body for fragment in (
                    'serviceWorkerDir = shinyliveMetaTag.content;',
                    'serviceWorkerDir = dirname(currentScriptDir());',
                    'serviceWorkerDir + "/shinylive-sw.js"',
                ))
                if page is not None and known_loader:
                    if page.service_worker_dir is None:
                        worker_url = urljoin(response.url, "../shinylive-sw.js")
                        basis = "loader directory parent (no meta override)"
                    else:
                        worker_url = urljoin(page_base, page.service_worker_dir.rstrip("/") + "/shinylive-sw.js")
                        basis = "document serviceworker_dir meta override"
                    result["registration_target_from_source"] = worker_url
                    result["registration_resolution"] = basis
                    if worker_url.startswith(BASE):
                        urls.append(worker_url)
                else:
                    result["registration_unverified"] = "page unavailable or loader changed"
            if url.endswith(".js") and "webr-worker.js" not in url and "load-shinylive-sw.js" not in url:
                result["isolation_lines"] = [
                    {"line": i, "text": line.strip()[:1200]}
                    for i, line in enumerate(body.splitlines(), 1)
                    if re.search(r"[Cc]ross-[Oo]rigin|require-corp|credentialless|webr-worker|scope|register|request\.mode|request\.destination|respondWith|headers\.set", line)
                ][:80]
                # Small workers are easier to audit with their fetch guards and
                # header changes in context. No response is written to disk.
                if len(body) <= 30000:
                    result["worker_source"] = body
                # A small registration worker can import its actual fetch handler.
                imports = sorted({urljoin(response.url, path) for path in re.findall(
                    r'''(?:from\s*|import\s*)["']([^"']+\.js)["']''', body
                )})
                result["worker_imports"] = imports
                urls.extend(path for path in imports if path.startswith(BASE)
                            and path not in seen and path not in urls and len(urls) < 8)
            print(json.dumps(result, indent=2))
    except (URLError, TimeoutError, OSError) as error:
        print(json.dumps({"url": url, "unverified": type(error).__name__}))
