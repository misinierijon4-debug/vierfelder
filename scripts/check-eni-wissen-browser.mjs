import { fileURLToPath } from 'node:url'
// Local component smoke with explicitly synthetic data; never accesses a real account.
import { createRequire } from 'node:module'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ENI_PLAYWRIGHT || 'playwright')
const basis = process.env.ENI_TEST_URL || 'http://localhost:5201'
const harness = new URL('../src/eni-smoke-harness.tmp.tsx', import.meta.url)
const browser = await chromium.launch({ headless: true })
try {
  await writeFile(harness, `import React from 'react';
import {createRoot} from 'react-dom/client';
import {EniWissenDialog} from './components/eni/EniWissenDialog';
import './index.css';
let rows = [{id:'test-1',user_id:'test-erijon',text:'Test: Nach der Schule helfen mir kurze Lernblöcke.',art:'profil',gemeinsam:false,bis:null,erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'}];
const api = {
 laden: async()=>structuredClone(rows),
 speichern:async(user_id,values,id)=>{const row={...values,user_id,id:id||crypto.randomUUID(),erstellt:'2026-09-11',geaendert:new Date().toISOString()};rows=id?rows.map(r=>r.id===id?row:r):[row,...rows]},
 loeschen:async(_,id)=>{rows=rows.filter(r=>r.id!==id)}
};
createRoot(document.getElementById('root')!).render(<EniWissenDialog offen kontoId="test-erijon" api={api} onSchliessen={()=>{}}/>);`, 'utf8')
  await mkdir(new URL('../test-screenshots/', import.meta.url), { recursive: true })
  for (const breite of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 844 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/eni-smoke', (route) => route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/src/eni-smoke-harness.tmp.tsx"></script></body></html>` }))
    // This harness has no backend client calls. Block external requests as a second boundary.
    await page.route('https://**/*', (route) => route.abort())
    await page.goto(`${basis}/eni-smoke`)
    await page.getByText('Test: Nach der Schule helfen mir kurze Lernblöcke.').waitFor()
    await page.getByRole('textbox', { name: 'Deine Angabe' }).fill('Test: Am Montag 20 Minuten Mathe üben.')
    await page.getByLabel('Bereich', { exact: false }).selectOption('aufgabe')
    assert.equal(await page.getByRole('checkbox').isChecked(), false)
    await page.getByRole('button', { name: 'Bewusst speichern' }).click()
    await page.getByRole('button', { name: 'Als erledigt markieren' }).click()
    await page.getByRole('button', { name: 'Wieder öffnen' }).waitFor()
    assert.equal(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true)
    await page.getByText('Was soll ENI wissen?', { exact: true }).evaluate((el) => { let p=el.parentElement; while(p){ if(p.scrollHeight>p.clientHeight && getComputedStyle(p).overflowY==='auto'){p.scrollTop=0;break}p=p.parentElement} })
    await page.screenshot({ path: fileURLToPath(new URL(`../test-screenshots/eni-wissen-${breite}.png`, import.meta.url)), fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('PASS: synthetic browser smoke at 390/1280px: private default, create task, complete task, no dialog overflow or JS errors.')
} finally {
  await browser.close()
  await unlink(harness).catch(() => {})
}
