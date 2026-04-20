"""Debug DL calculation"""

import time
import os
import threading
import http.server
import socketserver

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
server = socketserver.TCPServer(("127.0.0.1", 8773), QuietHTTPHandler)
thread = threading.Thread(target=server.serve_forever)
thread.daemon = True
thread.start()
time.sleep(1)

from selenium import webdriver
from selenium.webdriver.edge.options import Options

options = Options()
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
options.add_argument("--user-data-dir=C:/temp/edge_debug_profile")

driver = webdriver.Edge(options=options)
driver.get("http://127.0.0.1:8773/index.html")
time.sleep(3)

# Debug DLEstimator
print("Testing DLEstimator...")
result = driver.execute_script("""
    try {
        console.log('DLEstimator:', typeof window.DLEstimator);
        console.log('calculate:', typeof window.DLEstimator?.calculate);

        if (typeof window.DLEstimator === 'undefined') {
            return {error: 'DLEstimator undefined'};
        }
        if (typeof window.DLEstimator.calculate !== 'function') {
            return {error: 'calculate not a function', type: typeof window.DLEstimator.calculate};
        }

        var r = window.DLEstimator.calculate([-0.5,-0.3,-0.7,-0.4,-0.6],[0.1,0.15,0.12,0.11,0.13]);
        return {
            result: r,
            hasEffect: r && r.effect !== undefined,
            effectValue: r ? r.effect : null,
            seValue: r ? r.se : null
        };
    } catch(e) {
        return {error: e.toString()};
    }
""")
print(f"Result: {result}")

driver.quit()
server.shutdown()
