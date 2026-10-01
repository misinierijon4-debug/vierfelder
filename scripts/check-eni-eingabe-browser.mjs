// Synthetischer Eingabebereich ohne Konto. Braucht `npm run dev -- --port 5201`.
import { createRequire } from 'node:module'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ENI_PLAYWRIGHT || 'playwright')
const basis = process.env.ENI_TEST_URL || 'http://localhost:5201'
const harness = new URL('../src/eni-eingabe-smoke.tmp.tsx', import.meta.url)
const bilder = new URL('../test-screenshots/', import.meta.url)
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ENI_CHROMIUM ? { executablePath: process.env.ENI_CHROMIUM } : {}),
})
try {
  await writeFile(harness, `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EniEingabe} from './components/eni/EniEingabe';
import {EniRollenwahl} from './components/eni/EniRollenwahl';
import {EniModellwahl} from './components/eni/EniModellwahl';
import {STANDARD} from './lib/eniEinstellungen';
import './index.css';
window.SpeechRecognition = class {start(){} stop(){} abort(){}};
const api = {laden:async()=>({...STANDARD,rollen:[{id:'test',name:'Aajonus Vonderplanitz mit einem sehr langen Rollennamen',thema:'Ernährung',anweisung:'Test',aktiv:true}]}),speichern:async()=>{}};
function App(){
 const [wartet,setWartet]=useState(false);
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column',padding:16}}>
 <p style={{flex:1}}>ENI · Eingabevorschau mit Testdaten</p>
 <div style={{width:'100%',maxWidth:560,margin:'0 auto'}}>
 <EniEingabe gesperrt={wartet} onVorlegen={()=>setWartet(true)} onAbbrechen={wartet?()=>setWartet(false):undefined}
 anhaengenMoeglich anhaenge={[]} onAnhaengen={()=>{}} onAnhangEntfernen={()=>{}}
 rollenwahl={<EniRollenwahl kontoId={null} gesperrt={wartet} api={api}/>}
 modellwahl={<EniModellwahl anbieter={[{id:'test',name:'qwen 3.8 flash',denkbar:true,denkHinweis:'',warnung:''}]} gewaehlt="test" denkt offen={false} gesperrt={wartet} onUmschalten={()=>{}} onSchliessen={()=>{}} onWaehlen={()=>{}} onDenken={()=>{}}/>}/>
 </div></main>
}
createRoot(document.getElementById('root')!).render(<App/>);`)
  await mkdir(bilder, { recursive: true })
  for (const breite of [320, 375, 390, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 844 } })
    const fehler = []
    page.on('pageerror', (error) => fehler.push(error.message))
    await page.route('**/eni-eingabe-smoke', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/src/eni-eingabe-smoke.tmp.tsx"></script></body></html>`,
    }))
    await page.route('https://**/*', (route) => route.abort())
    await page.goto(`${basis}/eni-eingabe-smoke`)
    await page.getByRole('button', { name: /Rollen wählen, aktiv/ }).waitFor()
    const feld = page.getByRole('textbox', { name: 'was du ENI vorlegst' })
    for (const wartet of [false, true]) {
      if (wartet) {
        await feld.fill('Hi mein freund')
        await page.getByRole('button', { name: 'vorlegen' }).click()
      }
      for (const hoehe of [844, 460]) {
        await page.setViewportSize({ width: breite, height: hoehe })
        const bounds = await page.locator('.eni-eingabe-werkzeuge button').evaluateAll((buttons) =>
          buttons.map((b) => { const r = b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height} }))
        for (let i = 0; i < bounds.length; i++) {
          const b = bounds[i]
          assert.ok(b.w >= 44 && b.h >= 44, 'jede Aktion hat mindestens 44px Trefferfläche')
          assert.ok(b.x >= 0 && b.x + b.w <= breite && b.y >= 0 && b.y + b.h <= hoehe, 'Aktion liegt im Bild')
          if (i) assert.ok(bounds[i - 1].x + bounds[i - 1].w <= b.x, 'Aktionen überlappen nicht')
        }
        assert.equal(await page.locator('.eni-eingabe').evaluate((el) => el.scrollWidth <= el.clientWidth), true, 'Eingabe läuft nicht über')
        await page.screenshot({ path: new URL(`eni-eingabe-${breite}-${hoehe}-${wartet ? 'antwort' : 'bereit'}.png`, bilder).pathname })
      }
    }
    await feld.fill('Entwurf bleibt erhalten')
    await page.getByRole('button', { name: 'antwort abbrechen' }).click()
    assert.equal(await feld.inputValue(), 'Entwurf bleibt erhalten')
    assert.equal(await page.getByRole('button', { name: 'vorlegen' }).isEnabled(), true)
    await page.getByRole('button', { name: /Rollen wählen/ }).click()
    const menue = await page.getByRole('menu', { name: 'ENI-Rollen' }).boundingBox()
    assert.ok(menue && menue.x >= 0 && menue.x + menue.width <= breite && menue.y >= 0, 'Rollenmenü bleibt im Bild')
    assert.deepEqual(fehler, [])
    await page.close()
  }
  console.log('PASS: 320/375/390/430/1280px, 844/460px Höhe, lange Rolle, Mikrofon, Senden/Stoppen, Entwurf und Rollenmenü; keine Überlappung oder JS-Fehler.')
} finally {
  await browser.close()
  await unlink(harness).catch(() => {})
}
