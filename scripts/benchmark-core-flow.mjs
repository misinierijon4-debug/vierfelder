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

function startStaticServer(dir) {
  return new Promise((resolve, reject) => {
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
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Der lokale Benchmark-Server hat keinen TCP-Port erhalten'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readDevToolsPort(tempDir, chrome, timeoutMs = 10_000) {
  const activePortFile = join(tempDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (chrome.spawnError) throw chrome.spawnError;
    if (chrome.exitCode !== null || chrome.signalCode !== null) {
      throw new Error('Chrome wurde beendet, bevor DevToolsActivePort bereit war');
    }
    try {
      const [portLine, browserPath] = readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/);
      const port = Number(portLine);
      if (
        Number.isInteger(port)
        && port > 0
        && port <= 65_535
        && /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(browserPath || '')
      ) return port;
      lastError = new Error('DevToolsActivePort ist noch unvollstaendig oder ungueltig');
    } catch (error) {
      if (error?.code !== 'ENOENT') lastError = error;
    }
    await wait(100);
  }

  throw new Error(
    `Chrome hat keinen gueltigen DevTools-Port bereitgestellt${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function stopChrome(chrome) {
  if (!chrome || chrome.spawnError || chrome.exitCode !== null || chrome.signalCode !== null) return;

  const waitForExit = (timeoutMs) => {
    if (chrome.exitCode !== null || chrome.signalCode !== null) return true;
    return new Promise((resolve) => {
      const finish = (exited) => {
        clearTimeout(timer);
        chrome.off('exit', onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      chrome.once('exit', onExit);
    });
  };

  chrome.kill();
  if (await waitForExit(5_000)) return;
  chrome.kill('SIGKILL');
  if (!await waitForExit(2_000)) {
    throw new Error('Chrome konnte fuer das Benchmark-Cleanup nicht beendet werden');
  }
}

function stopStaticServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
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
  const distDir = join(process.cwd(), 'dist');
  if (!existsSync(distDir)) {
    console.error('dist directory does not exist! Run build first.');
    process.exit(1);
  }

  const { server, port } = await startStaticServer(distDir);
  let tempDir = null;
  let chrome = null;
  let cdp = null;
  let runError = null;

  try {
    tempDir = mkdtempSync(join(tmpdir(), 'chrome-bench-'));
    const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!existsSync(chromePath)) {
      throw new Error(`Chrome wurde nicht gefunden: ${chromePath}`);
    }
    chrome = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + tempDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--window-size=430,932',
      'about:blank'
    ], { stdio: 'ignore' });
    chrome.spawnError = null;
    chrome.once('error', (error) => {
      chrome.spawnError = error;
    });

    // Port 0 verhindert Kollisionen. Die einzige Quelle fuer den tatsaechlich
    // gestarteten Debug-Port ist das Profil dieser konkreten Chrome-Instanz.
    const debugPort = await readDevToolsPort(tempDir, chrome);

    const newTabRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
    if (!newTabRes.ok) {
      throw new Error(`Chrome-CDP-Tab konnte nicht erstellt werden: HTTP ${newTabRes.status}`);
    }
    const tabData = await newTabRes.json();
    if (typeof tabData.webSocketDebuggerUrl !== 'string') {
      throw new Error('Chrome-CDP-Tab enthaelt keine WebSocket-URL');
    }
    const tabWebSocket = new URL(tabData.webSocketDebuggerUrl);
    if (Number(tabWebSocket.port) !== debugPort || !tabWebSocket.pathname.startsWith('/devtools/page/')) {
      throw new Error('Chrome-CDP-Tab gehoert nicht zum gestarteten Debug-Port');
    }
    cdp = new CDP(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    // `benchmark:core` baut zuvor bewusst im Sites-Prototypmodus. So kann
    // dieser schreibende Core-Flow niemals versehentlich Produktivdaten treffen.
    const appUrl = 'http://127.0.0.1:' + port + '/';
    await cdp.send('Page.navigate', { url: appUrl });

    // Wait for initial render
    await new Promise(r => setTimeout(r, 1200));

    const loadMetrics = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        const fcp = paint.find(p => p.name === 'first-contentful-paint');
        return {
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
          loadEvent: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
          fcp: fcp ? Math.round(fcp.startTime) : null,
          duration: nav ? Math.round(nav.duration) : null,
          resourceCount: resources.length,
          scriptRequests: resources.filter((entry) => entry.initiatorType === 'script').length,
          transferredBytes: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
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
        await fn();
        await nextPaint();
        const t1 = performance.now();
        window.__bench.interactions.push({ name, duration: Math.round(t1 - t0) });
        await sleep(50);
      };

      const click = async (name, element) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error('Benchmark-Ziel fehlt: ' + name);
        }
        await record(name, () => element.click());
      };

      const waitForTarget = async (name, find, timeout = 3000) => {
        const start = performance.now();
        while (performance.now() - start < timeout) {
          const element = find();
          if (element instanceof HTMLElement) return element;
          await sleep(20);
        }
        throw new Error('Benchmark-Ziel fehlt: ' + name);
      };

      const clickAndWait = async (name, element, find) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error('Benchmark-Ziel fehlt: ' + name);
        }
        let ziel;
        await record(name, async () => {
          element.click();
          ziel = await waitForTarget(name, find);
        });
        return ziel;
      };

      const findTab = (name) => {
        const els = Array.from(document.querySelectorAll('button, nav button, [role="tab"]'));
        return els.find(e => (e.textContent || '').toLowerCase().includes(name.toLowerCase()));
      };

      // Action 1: Toggle habit area (first habit button)
      await click('habit_toggle', document.querySelector('button[aria-label^="lernen, heute"]'));

      // Action 2: Calendar open, select, close
      await click('cal_open', document.querySelector('button[aria-label="kalender öffnen"]'));
      await sleep(50);
      const calDay = Array.from(document.querySelectorAll('dialog button[aria-label*=","]'))
        .find((element) => !element.disabled && element.getAttribute('aria-label') !== 'Kalender schließen');
      await click('cal_select_day', calDay);

      // Action 3: Switch to Duell tab
      await clickAndWait(
        'tab_duell',
        findTab('duell'),
        () => document.querySelector('section[aria-labelledby="fronten-titel"]')
      );

      // Action 4: Switch to Schlaf tab and click night bar
      const nacht = await clickAndWait(
        'tab_schlaf',
        findTab('schlaf'),
        () => document.querySelector('button[aria-label*="Schlafdaten anzeigen"]')
      );
      await click('schlaf_select_night', nacht);

      // Action 5: Switch to Noten tab and open subject detail
      const fach = await clickAndWait(
        'tab_noten',
        findTab('noten'),
        () => document.querySelector('section[aria-labelledby="faecher-titel"] button')
      );
      await click('noten_open_subject', fach);
      await sleep(60);
      const schliessen = await waitForTarget(
        'noten_close_subject',
        () => document.querySelector('button[aria-label="fach schließen"]')
      );
      await click('noten_close_subject', schliessen);

      // Action 6: Return to Tracker tab
      await clickAndWait(
        'tab_tracker_return',
        findTab('tracker'),
        () => document.querySelector('button[aria-label^="lernen, heute"]')
      );

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

    if (flowRes.exceptionDetails) {
      const text = flowRes.exceptionDetails.exception?.description || flowRes.exceptionDetails.text;
      throw new Error(`Core-Flow unvollständig: ${text}`);
    }

    const flowData = (flowRes && flowRes.result && flowRes.result.value) ? flowRes.result.value : {};
    if (flowData.interactionsCount !== 10) {
      throw new Error(`Core-Flow unvollständig: ${flowData.interactionsCount || 0}/10 Interaktionen`);
    }
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
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (cdp) {
      try { await cdp.close(); } catch (error) { cleanupErrors.push(error); }
    }
    try { await stopChrome(chrome); } catch (error) { cleanupErrors.push(error); }
    try { await stopStaticServer(server); } catch (error) { cleanupErrors.push(error); }
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length) {
      const cleanupError = new AggregateError(cleanupErrors, 'Benchmark-Cleanup unvollstaendig');
      if (runError) console.error(cleanupError);
      else throw cleanupError;
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
