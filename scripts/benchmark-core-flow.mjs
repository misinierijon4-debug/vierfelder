import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function startStaticServer(dir, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        let filePath = join(dir, urlPath.replace(/^\//, ''));
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          filePath = join(dir, 'index.html');
        }
        const ext = extname(filePath);
        const data = readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve(server));
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        } else if (data.method) {
          const listeners = this.eventListeners.get(data.method) || [];
          for (const l of listeners) l(data.params);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, []);
    this.eventListeners.get(method).push(callback);
  }

  async close() {
    this.ws.close();
  }
}

async function run() {
  const PORT = 5198;
  const distDir = join(process.cwd(), 'dist');
  if (!existsSync(distDir)) {
    console.error('dist directory does not exist! Run build first.');
    process.exit(1);
  }

  const server = await startStaticServer(distDir, PORT);

  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-bench-'));
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=' + tempDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=430,932',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (!versionData) throw new Error('Could not connect to Chrome CDP');

    const newTabRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
    const tabData = await newTabRes.json();
    const cdp = new CDP(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    const appUrl = 'http://127.0.0.1:' + PORT + '/?prototyp=1';
    await cdp.send('Page.navigate', { url: appUrl });

    // Wait for initial render
    await new Promise(r => setTimeout(r, 1200));

    const loadMetrics = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint');
        return {
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
          loadEvent: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
          fcp: fcp ? Math.round(fcp.startTime) : null,
          duration: nav ? Math.round(nav.duration) : null,
        };
      })()`,
      returnByValue: true
    });

    const perfMetricsBefore = await cdp.send('Performance.getMetrics');

    // Inject interaction & frame stutter tracker
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        window.__bench = {
          longTasks: [],
          frameDurations: [],
          stutters: 0,
          interactions: [],
          rafActive: true
        };

        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__bench.longTasks.push({
              duration: Math.round(entry.duration),
              startTime: Math.round(entry.startTime)
            });
          }
        });
        try { po.observe({ entryTypes: ['longtask'] }); } catch (e) {}

        let lastTime = performance.now();
        function loop(now) {
          if (!window.__bench.rafActive) return;
          const delta = now - lastTime;
          lastTime = now;
          if (delta > 20) {
            window.__bench.frameDurations.push(Math.round(delta));
            if (delta > 33.3) window.__bench.stutters++;
          }
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      })()`
    });

    // Comprehensive Core flow:
    // 1. Habit toggle & step adjustment on tracker tab
    // 2. Open Calendar modal, navigate week, close calendar
    // 3. Tab switch to Duell
    // 4. Tab switch to Schlaf, click night bar to view detail
    // 5. Tab switch to Noten, click subject to view detail modal, close modal
    // 6. Return to Tracker tab
    const flowExpression = `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const nextPaint = () => new Promise((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      });
      const record = async (name, fn) => {
        const t0 = performance.now();
        fn();
        await nextPaint();
        const t1 = performance.now();
        window.__bench.interactions.push({ name, duration: Math.round(t1 - t0) });
        await sleep(50);
      };

      const findTab = (name) => {
        const els = Array.from(document.querySelectorAll('button, nav button, [role="tab"]'));
        return els.find(e => (e.textContent || '').toLowerCase().includes(name.toLowerCase()));
      };

      // Action 1: Toggle habit area (first habit button)
      const habitBtns = Array.from(document.querySelectorAll('section[aria-label*="heute"] button'));
      if (habitBtns.length > 0) {
        await record('habit_toggle', () => habitBtns[0].click());
      }

      // Action 2: Calendar open, select, close
      const calOpenBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && !b.textContent);
      if (calOpenBtn) {
        await record('cal_open', () => calOpenBtn.click());
        await sleep(50);
        const calDays = Array.from(document.querySelectorAll('div[role="dialog"] button, button[aria-label*="Woche"], button[class*="p-"]'));
        if (calDays.length > 2) {
          await record('cal_select_day', () => calDays[1].click());
        }
      }

      // Action 3: Switch to Duell tab
      await record('tab_duell', () => {
        const btn = findTab('duell');
        if (btn) btn.click();
      });

      // Action 4: Switch to Schlaf tab and click night bar
      await record('tab_schlaf', () => {
        const btn = findTab('schlaf');
        if (btn) btn.click();
      });
      const nightBars = Array.from(document.querySelectorAll('button[aria-label*="Schlaf"], button[class*="col"]'));
      if (nightBars.length > 2) {
        await record('schlaf_select_night', () => nightBars[1].click());
      }

      // Action 5: Switch to Noten tab and open subject detail
      await record('tab_noten', () => {
        const btn = findTab('noten');
        if (btn) btn.click();
      });
      const fachRows = Array.from(document.querySelectorAll('ul li button, [aria-labelledby*="faecher"] button'));
      if (fachRows.length > 0) {
        await record('noten_open_subject', () => fachRows[0].click());
        await sleep(60);
        const closeBtn = document.querySelector('button[aria-label*="schließen"], button[aria-label*="Schließen"], [role="dialog"] button');
        if (closeBtn) {
          await record('noten_close_subject', () => closeBtn.click());
        }
      }

      // Action 6: Return to Tracker tab
      await record('tab_tracker_return', () => {
        const btn = findTab('tracker');
        if (btn) btn.click();
      });

      window.__bench.rafActive = false;
      await sleep(30);

      const totalLongTaskDuration = window.__bench.longTasks.reduce((acc, t) => acc + t.duration, 0);
      const maxLongTask = window.__bench.longTasks.reduce((max, t) => Math.max(max, t.duration), 0);
      const avgInteraction = window.__bench.interactions.length
        ? Math.round(window.__bench.interactions.reduce((acc, i) => acc + i.duration, 0) / window.__bench.interactions.length)
        : 0;
      const maxInteraction = window.__bench.interactions.reduce((max, i) => Math.max(max, i.duration), 0);

      return {
        interactionsCount: window.__bench.interactions.length,
        avgInteractionMs: avgInteraction,
        maxInteractionMs: maxInteraction,
        longTasksCount: window.__bench.longTasks.length,
        totalLongTaskMs: totalLongTaskDuration,
        maxLongTaskMs: maxLongTask,
        stutterCount: window.__bench.stutters,
        delayedFramesCount: window.__bench.frameDurations.length,
        interactions: window.__bench.interactions
      };
    })()`;

    const flowRes = await cdp.send('Runtime.evaluate', {
      expression: flowExpression,
      awaitPromise: true,
      returnByValue: true
    });

    const flowData = (flowRes && flowRes.result && flowRes.result.value) ? flowRes.result.value : {};
    const perfMetricsAfter = await cdp.send('Performance.getMetrics');

    const metricsMapBefore = new Map(perfMetricsBefore.metrics.map(m => [m.name, m.value]));
    const metricsMapAfter = new Map(perfMetricsAfter.metrics.map(m => [m.name, m.value]));

    const jsHeapBefore = (metricsMapBefore.get('JSHeapUsedSize') / (1024 * 1024)).toFixed(2);
    const jsHeapAfter = (metricsMapAfter.get('JSHeapUsedSize') / (1024 * 1024)).toFixed(2);
    const jsHeapTotal = (metricsMapAfter.get('JSHeapTotalSize') / (1024 * 1024)).toFixed(2);
    const taskDuration = Math.round((metricsMapAfter.get('TaskDuration') - metricsMapBefore.get('TaskDuration')) * 1000);
    const scriptDuration = Math.round((metricsMapAfter.get('ScriptDuration') - metricsMapBefore.get('ScriptDuration')) * 1000);
    const layoutDuration = Math.round((metricsMapAfter.get('LayoutDuration') - metricsMapBefore.get('LayoutDuration')) * 1000);
    const recalcStyleDuration = Math.round((metricsMapAfter.get('RecalcStyleDuration') - metricsMapBefore.get('RecalcStyleDuration')) * 1000);

    const report = {
      load: loadMetrics.result ? loadMetrics.result.value : null,
      responsiveness: {
        avgInteractionMs: flowData.avgInteractionMs || 0,
        maxInteractionMs: flowData.maxInteractionMs || 0,
        totalLongTaskMs: flowData.totalLongTaskMs || 0,
        longTasksCount: flowData.longTasksCount || 0,
        maxLongTaskMs: flowData.maxLongTaskMs || 0,
      },
      cpu: {
        taskDurationMs: taskDuration,
        scriptDurationMs: scriptDuration,
        layoutDurationMs: layoutDuration,
        recalcStyleDurationMs: recalcStyleDuration,
      },
      memory: {
        jsHeapInitialMB: parseFloat(jsHeapBefore),
        jsHeapFinalMB: parseFloat(jsHeapAfter),
        jsHeapTotalMB: parseFloat(jsHeapTotal),
      },
      stutters: {
        stutterFramesCount: flowData.stutterCount || 0,
        delayedFramesCount: flowData.delayedFramesCount || 0,
      },
      interactionsDetail: flowData.interactions || [],
    };

    console.log('BENCHMARK_RESULT:' + JSON.stringify(report, null, 2));

    await cdp.close();
  } finally {
    chrome.kill();
    server.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
