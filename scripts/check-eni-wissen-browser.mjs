import { fileURLToPath } from 'node:url'
// Local component smoke with explicitly synthetic data; never accesses a real account.
// Needs a running dev server: `npx vite --port 5201`, then `node scripts/check-eni-wissen-browser.mjs`.
import { createRequire } from 'node:module'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ENI_PLAYWRIGHT || 'playwright')
const basis = process.env.ENI_TEST_URL || 'http://localhost:5201'
const harness = new URL('../src/eni-smoke-harness.tmp.tsx', import.meta.url)
const bild = (name) => fileURLToPath(new URL(`../test-screenshots/eni-wissen-${name}.png`, import.meta.url))
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ENI_CHROMIUM ? { executablePath: process.env.ENI_CHROMIUM } : {}),
})
try {
  await writeFile(harness, `import React from 'react';
import {createRoot} from 'react-dom/client';
import {EniWissenDialog} from './components/eni/EniWissenDialog';
import './index.css';
const heute = new Date();
const tag = (n) => { const d = new Date(heute); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let rows = [
 {id:'test-1',user_id:'test-erijon',text:'Test: Nach der Schule helfen mir kurze Lernblöcke.',art:'erfahrung',gemeinsam:false,bis:null,erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
 {id:'test-2',user_id:'test-erijon',text:'Test: Direkt, aber erst zuhören.',art:'stil',gemeinsam:false,bis:null,erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
 {id:'test-3',user_id:'test-koray',text:'Test: Geteiltes Ziel vom anderen.',art:'profil',gemeinsam:true,bis:null,erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
 {id:'test-4',user_id:'test-erijon',text:'Test: Urlaub ist vorbei.',art:'aktuell',gemeinsam:false,bis:tag(-3),erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
 {id:'test-5',user_id:'test-erijon',text:'Test: Ich mache Abi 2027.',art:'profil',gemeinsam:true,bis:null,erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
 {id:'test-6',user_id:'test-erijon',text:'Test: Boxhandschuhe waschen.',art:'aufgabe',gemeinsam:false,bis:tag(-1),erledigt:false,erstellt:'2026-09-11',geaendert:'2026-09-11'},
];
const api = {
 laden: async()=>structuredClone(rows),
 speichern:async(user_id,values,id)=>{const row={...values,user_id,id:id||crypto.randomUUID(),erstellt:'2026-09-11',geaendert:new Date().toISOString()};rows=id?rows.map(r=>r.id===id?row:r):[row,...rows]},
 loeschen:async(_,id)=>{rows=rows.filter(r=>r.id!==id)}
};
createRoot(document.getElementById('root')!).render(<EniWissenDialog offen kontoId="test-erijon" me="erijon" api={api} onSchliessen={()=>{}}/>);`, 'utf8')
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
    await page.screenshot({ path: bild(`${breite}`) })

    // neu merken: unten schreiben, bereich wählen, privat bleibt voreingestellt
    await page.getByRole('button', { name: 'was soll ENI sich merken?' }).click()
    await page.getByRole('textbox').fill('Test: Am Montag 20 Minuten Mathe üben.')
    await page.getByRole('radio', { name: 'mein nächster schritt' }).click()
    await page.getByRole('radio', { name: 'bis sonntag' }).click()
    assert.equal(await page.getByRole('checkbox', { name: /mit koray teilen/ }).isChecked(), false)
    await page.waitForTimeout(250)
    await page.screenshot({ path: bild(`${breite}-neu`) })
    // mit offener tastatur bleibt wenig platz: „merken" muss trotzdem zu sehen sein
    await page.setViewportSize({ width: breite, height: 460 })
    await page.waitForTimeout(100)
    const knopf = await page.getByRole('button', { name: 'merken', exact: true }).boundingBox()
    assert.ok(knopf && knopf.y >= 0 && knopf.y + knopf.height <= 460, 'merken liegt im bild')
    await page.screenshot({ path: bild(`${breite}-neu-eng`) })
    await page.setViewportSize({ width: breite, height: 844 })
    await page.getByRole('button', { name: 'merken', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'gemerkt' }).waitFor()

    // abhaken mit einem tipp, der schritt bleibt an seinem platz
    const marke = page.getByRole('checkbox', { name: 'erledigt: Test: Am Montag 20 Minuten Mathe üben.' })
    await marke.click()
    await page.waitForFunction(() => document.querySelector('[aria-label="erledigt: Test: Am Montag 20 Minuten Mathe üben."]')?.getAttribute('aria-checked') === 'true')

    // was ENI nicht mehr liest, liegt unter „ruht"
    assert.equal(await page.getByText('Test: Urlaub ist vorbei.').count(), 0)
    await page.getByRole('button', { name: /ruht/ }).click()
    await page.getByText('Test: Urlaub ist vorbei.').waitFor()

    // an ort und stelle bearbeiten
    await page.getByRole('button', { name: 'bearbeiten: Test: Direkt, aber erst zuhören.' }).click()
    assert.equal(await page.getByRole('checkbox', { name: /teilen/ }).count(), 0, 'der ton bleibt privat')
    await page.screenshot({ path: bild(`${breite}-bearbeiten`), fullPage: true })

    assert.equal(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true)
    assert.equal(
      await page.locator('dialog [class*="overflow-y-auto"]').first().evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    )
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('PASS: synthetic browser smoke at 390/1280px: private default, create and complete a step, resting entries, inline edit, no overflow or JS errors.')
} finally {
  await browser.close()
  await unlink(harness).catch(() => {})
}
