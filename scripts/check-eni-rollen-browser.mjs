// Synthetische Rollen: keine Anmeldung und keine produktiven Daten.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile, unlink } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ENI_PLAYWRIGHT || 'playwright')
const basis = process.env.ENI_TEST_URL || 'http://localhost:5207'
const harness = new URL('../src/eni-rollen-smoke.tmp.tsx', import.meta.url)
const browser = await chromium.launch({ headless: true,
  ...(process.env.ENI_CHROMIUM ? { executablePath: process.env.ENI_CHROMIUM, args: ['--no-sandbox'] } : {}),
})
try {
  await writeFile(harness, `import React from 'react';
import {createRoot} from 'react-dom/client';
import {EniRollenwahl} from './components/eni/EniRollenwahl';
import {STANDARD} from './lib/eniEinstellungen';
import './index.css';
let stand = {...STANDARD, rollen: Array.from({length:8}, (_,i)=>({id:'eigen-'+i,name:i===7?'Meine aktive Rolle':'Eigene Rolle '+i,thema:'Test',anweisung:'Test',aktiv:i===7}))};
const api={laden:async()=>structuredClone(stand),speichern:async(_,neu)=>{stand=structuredClone(neu)}};
createRoot(document.getElementById('root')!).render(<div style={{position:'fixed',bottom:20,left:120}}><EniRollenwahl kontoId={null} api={api}/></div>);`)
  for (const [width,height] of [[390,844],[430,932],[320,568],[390,400]]) {
    const page = await browser.newPage({ viewport:{width,height} })
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('https://**/*',route=>route.abort())
    await page.route('**/rollen-smoke',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/src/eni-rollen-smoke.tmp.tsx"></script></body></html>`}))
    await page.goto(basis+'/rollen-smoke')
    await page.getByRole('button',{name:/Rollen wählen/}).click()
    const menu=page.getByRole('menu',{name:'ENI-Rollen'})
    await menu.waitFor()
    await page.waitForTimeout(350)
    const kopf=page.getByText('Aktiv bei passenden Themen')
    const davor=await kopf.boundingBox()
    const liste=page.locator('[data-rollen-liste]')
    const daten=await liste.evaluate(el=>{
      el.scrollTop=el.scrollHeight
      return {scroll:el.scrollTop,breite:el.scrollWidth,innen:el.clientWidth,balken:getComputedStyle(el).scrollbarWidth}
    })
    assert.ok(daten.scroll>0,'Rollenliste bleibt scrollbar')
    assert.equal(daten.balken,'none','kein sichtbarer Scrollbalken')
    assert.ok(daten.breite<=daten.innen,'kein waagerechter Ueberlauf')
    assert.deepEqual(await kopf.boundingBox(),davor,'Kopf bleibt ausserhalb der scrollenden Rollen')
    const box=await menu.boundingBox()
    assert.ok(box.x>=15 && box.x+box.width<=width-15 && box.y>=15 && box.y+box.height<=height,'Popup bleibt im Bildschirm')
    const unten=await liste.boundingBox()
    assert.ok(unten.y>=davor.y+davor.height,'Rollen ueberdecken die Ueberschrift nicht')
    await page.getByRole('menuitemcheckbox',{name:'Meine aktive Rolle'}).click()
    await page.waitForFunction(()=>document.querySelector('[aria-label="Meine aktive Rolle"]')?.getAttribute('aria-checked')==='false')
    await page.getByRole('menuitemcheckbox',{name:'Meine aktive Rolle'}).press('Home')
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Ernährungsberater')
    assert.ok(await liste.evaluate(el=>el.scrollTop<5),'erste Rolle per Tastatur erreichbar')
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log('PASS: Rollenpopup bei vier mobilen Groessen, feste Ueberschrift, alle Rollen erreichbar, Scrollbalken unsichtbar, Auswahl und Tastatur funktionieren.')
} finally {
  await browser.close()
  await unlink(harness).catch(()=>{})
}
