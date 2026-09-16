/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { lokalerEniSpeicher } from '../../lib/eniSpeicher'
import type { EniSpeicher } from '../../lib/eniSpeicher'
import { EniModellFehler } from '../../lib/eniAntwort'
import type { AnbieterInfo, Modellstand } from '../../lib/eniAntwort'
import { EniApp } from './EniApp'

// jsdom bringt showModal nicht mit. dieselbe kleine kruecke wie im kalender.
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

function zeigeEni(speicher: EniSpeicher = lokalerEniSpeicher('erijon')) {
  const onZurueck = vi.fn()
  const ergebnis = render(<EniApp speicher={speicher} onZurueck={onZurueck} />)
  return { ...ergebnis, speicher, onZurueck }
}

function feld() {
  return screen.getByLabelText('was du ENI vorlegst')
}

/**
 * Ein anbieter, so wie die function ihn anbietet. `denkbar` ist die Vorgabe,
 * weil alle drei echten Zeilen vordenken koennen; wer das Gegenteil pruefen
 * will, setzt es ausdruecklich.
 */
function anbieterInfo(id: string, name: string): AnbieterInfo {
  return {
    id,
    name,
    modell: `modell/${id}`,
    denkbar: true,
    denkHinweis: 'langsamer, dafür gründlicher.',
  }
}

/** das kopfmenue auf: dahinter liegen verlauf, vorlesen und gedaechtnis */
function oeffneMenue() {
  fireEvent.click(screen.getByRole('button', { name: 'menü' }))
}

/** ist die modellwahl zugeklappt? der knopf weiss es, das DOM blendet nur aus */
function zu() {
  return screen.getByRole('button', { name: /modell wählen/i })
    .getAttribute('aria-expanded') === 'false'
}

function oeffneVerlauf() {
  oeffneMenue()
  fireEvent.click(screen.getByRole('menuitem', { name: 'verlauf' }))
}

function lege(text: string) {
  fireEvent.change(feld(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
}

/** einmal durch: laden, schreiben, takt, urteil */
async function laufeAn(text: string) {
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  lege(text)
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
}

describe('ENI als eigene oberflaeche', () => {
  it('nennt sich ENI in versalien und sagt die herkunft der fassung', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(screen.getAllByText('ENI').length).toBeGreaterThan(0)
    expect(screen.getByText(/lokale stimmenprobe/i)).toBeInTheDocument()
    expect(screen.getByText(/noch keine modellverbindung/i)).toBeInTheDocument()
  })

  it('fuehrt mit einem eigenen weg zurueck in die anzeigetafel', async () => {
    vi.useFakeTimers()
    const { onZurueck } = zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    fireEvent.click(screen.getByRole('button', { name: /zurück zum zweikampf/i }))
    expect(onZurueck).toHaveBeenCalledTimes(1)
  })

  it('bietet im leeren chat drei auftakte an und uebernimmt einen davon ins feld', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const auftakt = screen.getByRole('button', { name: 'wie stehe ich gegen koray' })
    fireEvent.click(auftakt)

    expect(feld()).toHaveValue('wie stehe ich gegen koray')
  })

  it('zeigt erst den takt und danach das urteil', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('ich gehe morgen statt heute ins gym')

    expect(screen.getByText('ich gehe morgen statt heute ins gym')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('ENI prüft')

    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    expect(screen.queryByRole('status')).toBeNull()
    // der satz steht in wort-spans, also wird der ganze strom befragt
    expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent(
      /Beim Zweikampf muss ich zwischen Aufschub/
    )
  })

  it('klappt die frisch eingetroffene antwort wort fuer wort auf', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('ich gehe morgen statt heute ins gym')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    const woerter = document.querySelectorAll<HTMLElement>('.eni-wort')
    expect(woerter.length).toBeGreaterThan(5)
    // der versatz waechst von wort zu wort, sonst stuende alles gleichzeitig da
    expect(woerter[0]?.style.animationDelay).toBe('0ms')
    expect(woerter[3]?.style.animationDelay).not.toBe('0ms')
    // und der text bleibt vollstaendig im dokument, nicht nur im auge
    expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent('Aufschub')
  })

  it('nimmt keine zweite vorlage an, solange ENI prueft', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('boxen steht')

    expect(feld()).toHaveValue('')
    fireEvent.change(feld(), { target: { value: 'und lesen auch' } })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeDisabled()
  })

  it('legt den chat erst mit der ersten vorlage an und benennt ihn danach', async () => {
    vi.useFakeTimers()
    const { speicher } = zeigeEni()
    await laufeAn('koray liegt vorne')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    const chats = await speicher.chats()
    expect(chats).toHaveLength(1)
    expect(chats[0]?.titel).toBe('koray liegt vorne')
    expect(await speicher.nachrichten(chats[0]!.id)).toHaveLength(2)
  })

  it('holt einen alten chat aus dem verlauf zurueck', async () => {
    vi.useFakeTimers()
    const speicher = lokalerEniSpeicher('erijon')
    const alt = await speicher.neuerChat('alte sache')
    await speicher.schreibe(alt.id, 'mensch', 'alte sache')
    await speicher.schreibe(alt.id, 'eni', 'das war vor einer woche.')

    zeigeEni(speicher)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    oeffneVerlauf()
    const verlauf = screen.getByRole('dialog', { name: 'verlauf' })
    fireEvent.click(within(verlauf).getByText('alte sache'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // ein alter chat wird gelesen, nicht empfangen: er steht sofort ganz da
    expect(screen.getByText('das war vor einer woche.')).toBeInTheDocument()
    expect(document.querySelectorAll('.eni-wort')).toHaveLength(0)
  })

  it('beginnt den chat nach einer bearbeiteten eigenen nachricht dort neu', async () => {
    vi.useFakeTimers()
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('alter plan')
    await speicher.schreibe(chat.id, 'mensch', 'ich trainiere heute')
    await speicher.schreibe(chat.id, 'eni', 'dann zieh es durch.')
    await speicher.schreibe(chat.id, 'mensch', 'danach esse ich nichts')
    await speicher.schreibe(chat.id, 'eni', 'das ist keine gute idee.')

    zeigeEni(speicher)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    oeffneVerlauf()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'verlauf' })).getByText('alter plan'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    fireEvent.click(screen.getAllByRole('button', { name: 'eigene nachricht bearbeiten' })[0]!)
    const bearbeiten = screen.getByRole('textbox', { name: 'eigene nachricht bearbeiten' })
    fireEvent.change(bearbeiten, { target: { value: 'ich trainiere morgen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Neu absenden' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })

    expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent('ich trainiere morgen')
    expect(screen.getByLabelText('dialog mit ENI')).not.toHaveTextContent('danach esse ich nichts')
    const gespeichert = await speicher.nachrichten(chat.id)
    expect(gespeichert).toHaveLength(2)
    expect(gespeichert[0]?.text).toBe('ich trainiere morgen')
    expect(gespeichert[1]?.rolle).toBe('eni')
  })

  it('loescht einen chat erst nach ausdruecklicher nachfrage', async () => {
    vi.useFakeTimers()
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('weg damit')
    await speicher.schreibe(chat.id, 'mensch', 'weg damit')

    zeigeEni(speicher)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    oeffneVerlauf()

    const verlauf = screen.getByRole('dialog', { name: 'verlauf' })
    fireEvent.click(within(verlauf).getByRole('button', { name: /chat weg damit löschen/i }))
    expect(await speicher.chats()).toHaveLength(1)

    fireEvent.click(within(verlauf).getByRole('button', { name: 'löschen' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(await speicher.chats()).toHaveLength(0)
  })

  it('haelt feld und knopf auf mindestens 44 pixeln trefferflaeche', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(feld().className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'vorlegen' }).className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'menü' }).className).toContain('size-11')
    expect(screen.getByRole('button', { name: 'neuer chat' }).className).toContain('size-11')
  })

  it('sagt es, wenn eine vorlage nicht gespeichert werden konnte', async () => {
    vi.useFakeTimers()
    const kaputt: EniSpeicher = {
      ...lokalerEniSpeicher('erijon'),
      neuerChat: () => Promise.reject(new Error('kein netz')),
    }
    zeigeEni(kaputt)
    await laufeAn('boxen steht')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    expect(screen.getByRole('alert')).toHaveTextContent(/nicht gespeichert/i)
    // der satz ist nicht verloren: er steht wieder im feld
    expect(feld()).toHaveValue('boxen steht')
  })

  it('behauptet erst dann eine modellverbindung, wenn sie geprüft ist', async () => {
    vi.useFakeTimers()
    const geber = {
      art: 'modell' as const,
      antworte: vi.fn(async () => ({
        mensch: { id: 'm1', rolle: 'mensch' as const, text: 'x', erstellt: new Date().toISOString() },
        eni: { id: 'e1', rolle: 'eni' as const, text: 'das reicht nicht.', erstellt: new Date().toISOString() },
      })),
    }
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => Promise.resolve({ bereit: true, anbieter: [] })}
        baueGeber={() => geber as unknown as any}
      />
    )

    expect(screen.getByText(/verbindung wird geprüft/i)).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(screen.queryByText(/lokale stimmenprobe/i)).toBeNull()
    expect(screen.getByText(/verlässt dein gerät/i)).toBeInTheDocument()
  })

  it('lässt das modell wechseln und schickt die wahl an den geber weiter', async () => {
    vi.useFakeTimers()
    const geber = {
      art: 'modell' as const,
      anbieter: null,
      denkt: false,
      antworte: vi.fn(),
    }
    const baue = vi.fn(() => geber as unknown as any)
    const modelle = [
      anbieterInfo('deepseek', 'deepseek'),
      anbieterInfo('ling', 'ling 3.0'),
      anbieterInfo('qwen-infron', 'qwen 3.8 unzensiert'),
    ]
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => Promise.resolve({ bereit: true, anbieter: modelle })}
        baueGeber={baue}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // ohne gemerkte wahl gilt der erste
    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'deepseek', false)
    expect(screen.getByText(/deepseek über supabase/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /modell wählen/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /ling 3\.0/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'ling', false)
    expect(screen.getByText(/ling 3\.0 über supabase/i)).toBeInTheDocument()
    // das menü ist wieder zu. das sagt der knopf, nicht das DOM: die hülle
    // blendet aus und haengt so lange noch im dokument.
    expect(zu()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /modell wählen/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /qwen 3\.8 unzensiert/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'qwen-infron', false)
    expect(screen.getByText(/qwen 3\.8 unzensiert über supabase/i)).toBeInTheDocument()
    expect(zu()).toBe(true)
  })

  it('legt das vordenken für jedes modell um und merkt es sich auf diesem gerät', async () => {
    vi.useFakeTimers()
    const baue = vi.fn(() => ({ art: 'modell', anbieter: null, denkt: false }) as unknown as any)
    const modelle = [
      anbieterInfo('deepseek', 'deepseek'),
      anbieterInfo('ling', 'ling 3.0'),
    ]
    const zeigen = () =>
      render(
        <EniApp
          speicher={lokalerEniSpeicher('erijon')}
          onZurueck={vi.fn()}
          pruefeModell={() => Promise.resolve({ bereit: true, anbieter: modelle })}
          baueGeber={baue}
        />
      )

    zeigen()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // aus ist die vorgabe: ENI ist eine haltung, keine rechenaufgabe
    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'deepseek', false)

    fireEvent.click(screen.getByRole('button', { name: /modell wählen/i }))
    const schalter = screen.getByRole('menuitemcheckbox', { name: /erst nachdenken/i })
    expect(schalter).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(schalter)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'deepseek', true)
    // das menü bleibt offen: man soll die sanduhr umspringen sehen
    expect(zu()).toBe(false)
    expect(screen.getByRole('menuitemcheckbox', { name: /erst nachdenken/i }))
      .toHaveAttribute('aria-checked', 'true')

    // und die stellung bleibt beim wechsel stehen — zwei fragen, zwei antworten
    fireEvent.click(screen.getByRole('menuitemradio', { name: /ling 3\.0/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'ling', true)
    // die zeile an der eingabe sagt es, ohne dass man das menü öffnen muss
    expect(screen.getByRole('button', { name: /modell wählen.*denkt vor/i })).toBeInTheDocument()

    // neu geöffnet steht die stellung noch
    cleanup()
    zeigen()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'ling', true)
  })

  it('übernimmt die alte denk-zeile als modell plus stellung', async () => {
    vi.useFakeTimers()
    // bis zum 14.09.2026 war das vordenken eine eigene zeile. wer sie gewählt
    // hatte, soll das denken behalten, statt still auf den ersten zu fallen.
    localStorage.setItem('eni.anbieter', 'ling-denkt')
    const baue = vi.fn(() => ({ art: 'modell', anbieter: null, denkt: false }) as unknown as any)
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() =>
          Promise.resolve({
            bereit: true,
            anbieter: [
              anbieterInfo('deepseek', 'deepseek'),
              anbieterInfo('ling', 'ling 3.0'),
            ],
          })
        }
        baueGeber={baue}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(baue).toHaveBeenLastCalledWith(true, expect.anything(), 'ling', true)
  })

  it('legt das wort am rückweg unter 416 pixeln ab, damit der kopf nicht überläuft', async () => {
    vi.useFakeTimers()
    zeigeEni(lokalerEniSpeicher('erijon'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const zurueck = screen.getByRole('button', { name: /zurück zum zweikampf/i })
    // der pfeil bleibt immer, das wort geht auf schmalen geräten
    expect(zurueck.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('zweikampf')).toHaveClass('max-[415px]:hidden')
  })

  it('zeigt keine modellwahl, wenn es nur einen anbieter gibt und der nicht denken kann', async () => {
    vi.useFakeTimers()
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() =>
          Promise.resolve({
            bereit: true,
            anbieter: [{ ...anbieterInfo('deepseek', 'deepseek'), denkbar: false }],
          })
        }
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // eine wahl mit einer möglichkeit ist keine wahl: dann steht sie gar nicht da
    expect(screen.queryByRole('button', { name: /modell wählen/i })).toBeNull()
  })

  it('stellt den umschalter auch hin, wenn nur ein anbieter da ist — aber einer, der denken kann', async () => {
    vi.useFakeTimers()
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() =>
          Promise.resolve({ bereit: true, anbieter: [anbieterInfo('ling', 'ling 3.0')] })
        }
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // bei einem einzigen schlüssel ist die stellung die einzige offene frage
    fireEvent.click(screen.getByRole('button', { name: /modell wählen/i }))
    expect(screen.getByRole('menuitemcheckbox', { name: /erst nachdenken/i })).toBeInTheDocument()
    // die liste selbst bleibt weg: eine wahl mit einer möglichkeit ist keine
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('trägt oben rechts nur noch das menü und den neuen chat', async () => {
    vi.useFakeTimers()
    zeigeEni(lokalerEniSpeicher('erijon'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const kopf = screen.getByRole('banner')
    expect(within(kopf).getAllByRole('button')).toHaveLength(3) // rückweg, menü, neuer chat
    expect(within(kopf).getByRole('button', { name: 'menü' })).toBeInTheDocument()
    expect(within(kopf).getByRole('button', { name: 'neuer chat' })).toBeInTheDocument()

    // verlauf, vorlesen und gedächtnis stehen nicht mehr offen in der leiste,
    // sondern ausgeschrieben im menü
    oeffneMenue()
    expect(screen.getByRole('menuitem', { name: 'verlauf' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /das weiß eni über mich/i })).toBeInTheDocument()
  })

  it('legt die modellwahl an die eingabe, nicht in den kopf', async () => {
    vi.useFakeTimers()
    const modelle = [
      anbieterInfo('deepseek', 'deepseek'),
      anbieterInfo('ling', 'ling 3.0'),
    ]
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => Promise.resolve({ bereit: true, anbieter: modelle })}
      />
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // oben steht, mit wem du redest; unten, womit er antwortet
    const wahl = screen.getByRole('button', { name: /modell wählen/i })
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /modell wählen/i }))
      .toBeNull()
    expect(wahl.closest('form')).not.toBeNull()
  })

  it('stellt ENIs namen wirklich in die mitte und nicht nur zwischen die nachbarn', async () => {
    vi.useFakeTimers()
    zeigeEni(lokalerEniSpeicher('erijon'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // gleich breite aussenspalten, sonst schiebt die breitere seite den namen weg
    const zeile = screen.getByRole('banner').querySelector('.grid')
    expect(zeile?.className).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
  })

  it('nimmt nichts an, solange die verbindung noch geprüft wird', async () => {
    vi.useFakeTimers()
    let loese: (stand: Modellstand) => void = () => {}
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => new Promise<Modellstand>((weiter) => { loese = weiter })}
      />
    )

    fireEvent.change(feld(), { target: { value: 'boxen steht' } })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeDisabled()

    await act(async () => {
      loese({ bereit: false, anbieter: [] })
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeEnabled()
  })
  describe('gezielte regressionstests', () => {
    it('erhaelt entwuerfe bei chatwechsel und ordnet sie korrekt zu', async () => {
      vi.useFakeTimers()
      const speicher = lokalerEniSpeicher('erijon')
      const c1 = await speicher.neuerChat('chat eins')
      await speicher.schreibe(c1.id, 'mensch', 'hallo eins')
      zeigeEni(speicher)
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // In neuem Chat etwas tippen
      fireEvent.change(feld(), { target: { value: 'entwurf fuer neuen chat' } })

      // Zu Chat 1 wechseln
      oeffneVerlauf()
      const verlauf = screen.getByRole('dialog', { name: 'verlauf' })
      fireEvent.click(within(verlauf).getByText('chat eins'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // In Chat 1 ist das Feld zunaechst leer
      expect(feld()).toHaveValue('')
      fireEvent.change(feld(), { target: { value: 'entwurf fuer chat eins' } })

      // Zurueck zu neuem Chat wechseln
      fireEvent.click(screen.getByRole('button', { name: 'neuer chat' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // Entwurf des neuen Chats ist wieder da
      expect(feld()).toHaveValue('entwurf fuer neuen chat')

      // Wieder zurueck zu Chat 1 wechseln
      oeffneVerlauf()
      fireEvent.click(within(screen.getByRole('dialog', { name: 'verlauf' })).getByText('chat eins'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // Entwurf von Chat 1 ist erhalten
      expect(feld()).toHaveValue('entwurf fuer chat eins')
    })

    it('ermoeglicht die wiederholung einer fehlgeschlagenen vorlage ohne nachrichten-duplikate', async () => {
      vi.useFakeTimers()
      let aufrufNr = 0
      const geber = {
        art: 'modell' as const,
        antworte: vi.fn(async () => {
          aufrufNr += 1
          if (aufrufNr === 1) {
            throw new Error('netzwerkfehler')
          }
          return {
            mensch: { id: 'm1', rolle: 'mensch' as const, text: 'mein versuch', erstellt: new Date().toISOString() },
            eni: { id: 'e1', rolle: 'eni' as const, text: 'jetzt hat es geklappt.', erstellt: new Date().toISOString() },
          }
        }),
      }

      render(
        <EniApp
          speicher={lokalerEniSpeicher('erijon')}
          onZurueck={vi.fn()}
          pruefeModell={() => Promise.resolve({ bereit: true, anbieter: [] })}
          baueGeber={() => geber as any}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      fireEvent.change(feld(), { target: { value: 'mein versuch' } })
      fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // Fehler wird gemeldet und Wiederholen-Button ist da
      expect(screen.getByRole('alert')).toBeInTheDocument()
      const wiederholenBtn = screen.getByRole('button', { name: 'wiederholen' })
      expect(wiederholenBtn).toBeInTheDocument()

      // Erneut versuchen
      fireEvent.click(wiederholenBtn)
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // Antwort ist da, keine doppelten Zeilen
      expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent(/jetzt hat es geklappt/)
      expect(within(screen.getByLabelText('dialog mit ENI')).getAllByText('mein versuch')).toHaveLength(1)
    })

    it('holt ENIs antwort nach, wenn die vorlage schon steht, statt sie zweimal zu schicken', async () => {
      vi.useFakeTimers()
      const mensch = {
        id: 'm1',
        rolle: 'mensch' as const,
        text: 'chill junge',
        erstellt: new Date().toISOString(),
      }
      // so kommt ein 429 beim client an: die vorlage steht, das urteil fehlt
      const geber = {
        art: 'modell' as const,
        anbieter: 'ling',
        antworte: vi.fn(() =>
          Promise.reject(
            new EniModellFehler(
              'ENI hat nicht geantwortet. versuch es gleich noch einmal.',
              mensch,
              'modell_fehler'
            )
          )
        ),
        nochmal: vi.fn(() =>
          Promise.resolve({
            mensch,
            eni: {
              id: 'e1',
              rolle: 'eni' as const,
              text: 'chillen kannst du, wenn es steht.',
              erstellt: new Date().toISOString(),
            },
          })
        ),
      }

      render(
        <EniApp
          speicher={lokalerEniSpeicher('erijon')}
          onZurueck={vi.fn()}
          pruefeModell={() => Promise.resolve({ bereit: true, anbieter: [] })}
          baueGeber={() => geber as any}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      fireEvent.change(feld(), { target: { value: 'chill junge' } })
      fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // die vorlage bleibt stehen, und es gibt einen weg zurueck
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent(/chill junge/)

      fireEvent.click(screen.getByRole('button', { name: 'wiederholen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // nachgeholt statt noch einmal geschickt, und die zeile steht nur einmal da
      expect(geber.nochmal).toHaveBeenCalledTimes(1)
      expect(geber.antworte).toHaveBeenCalledTimes(1)
      expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent(/chillen kannst du/)
      expect(
        within(screen.getByLabelText('dialog mit ENI')).getAllByText('chill junge')
      ).toHaveLength(1)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('bietet kein nachholen an, wenn mehr fehlt als nur ENIs antwort', async () => {
      vi.useFakeTimers()
      const mensch = {
        id: 'm1',
        rolle: 'mensch' as const,
        text: 'sieh dir das an',
        erstellt: new Date().toISOString(),
      }
      const geber = {
        art: 'modell' as const,
        anbieter: 'ling',
        // der anhang wurde nicht gespeichert: nachholen wuerde ENI blind antworten lassen
        antworte: vi.fn(() =>
          Promise.reject(
            new EniModellFehler(
              'der anhang wurde nicht gespeichert. versuch es noch einmal.',
              mensch,
              'anhang_nicht_gespeichert'
            )
          )
        ),
        nochmal: vi.fn(),
      }

      render(
        <EniApp
          speicher={lokalerEniSpeicher('erijon')}
          onZurueck={vi.fn()}
          pruefeModell={() => Promise.resolve({ bereit: true, anbieter: [] })}
          baueGeber={() => geber as any}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      fireEvent.change(feld(), { target: { value: 'sieh dir das an' } })
      fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'wiederholen' })).toBeNull()
      expect(geber.nochmal).not.toHaveBeenCalled()
    })

    it('leitet spaete antworten bei chatwechsel nicht in den falschen chat weiter', async () => {
      vi.useFakeTimers()
      let loeseAntwort: (res: { mensch: any; eni: any }) => void = () => {}
      const geber: any = {
        art: 'modell',
        antworte: vi.fn(async () => {
          return new Promise((resolve) => {
            loeseAntwort = resolve
          })
        }),
      }

      const speicher = lokalerEniSpeicher('erijon')
      const c1 = await speicher.neuerChat('chat a')
      await speicher.schreibe(c1.id, 'mensch', 'nachricht a')

      render(
        <EniApp
          speicher={speicher}
          onZurueck={vi.fn()}
          pruefeModell={() => Promise.resolve({ bereit: true, anbieter: [] })}
          baueGeber={() => geber}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // Wir starten im leeren Chat und senden etwas
      fireEvent.change(feld(), { target: { value: 'frage fuer chat b' } })
      fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(60) })

      // Waehrend Anfrage laeuft, wechseln wir zu Chat a
      oeffneVerlauf()
      fireEvent.click(within(screen.getByRole('dialog', { name: 'verlauf' })).getByText('chat a'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // Jetzt loesen wir die spaete Antwort von Chat b auf
      await act(async () => {
        loeseAntwort({
          mensch: { id: 'm-b', rolle: 'mensch', text: 'frage fuer chat b', erstellt: new Date().toISOString() },
          eni: { id: 'e-b', rolle: 'eni', text: 'antwort fuer chat b', erstellt: new Date().toISOString() },
        })
        await vi.advanceTimersByTimeAsync(100)
      })

      // Chat a darf die Antwort von Chat b NICHT anzeigen!
      expect(screen.queryByText('antwort fuer chat b')).toBeNull()
      expect(screen.getByText('nachricht a')).toBeInTheDocument()
    })

    it('ersetzt das feld beim startvorschlag sauber ohne zu stacken', async () => {
      vi.useFakeTimers()
      zeigeEni()
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      const auftakt1 = screen.getByRole('button', { name: 'wie stehe ich gegen koray' })
      fireEvent.click(auftakt1)
      expect(feld()).toHaveValue('wie stehe ich gegen koray')

      const auftakt2 = screen.getByRole('button', { name: 'was soll ich heute essen' })
      fireEvent.click(auftakt2)
      expect(feld()).toHaveValue('was soll ich heute essen')
    })

    it('zeigt bei Gleichstand Fuehrung uebernehmen statt Vorsprung ausbauen', async () => {
      vi.useFakeTimers()
      const speicher = lokalerEniSpeicher('erijon')
      render(
        <EniApp
          speicher={speicher}
          onZurueck={vi.fn()}
          initialDuellStand={{
            ich: 'erijon',
            gegner: 'koray',
            ichName: 'Erijon',
            gegnerName: 'Koray',
            wocheIch: 4,
            wocheEr: 4,
            diff: 0,
          }}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      expect(screen.getByText('führung übernehmen')).toBeInTheDocument()
      expect(screen.queryByText('vorsprung ausbauen')).toBeNull()
    })

    it('formatiert frische antworten mit Fettdruck ohne raw markdown und staffelt woerter', async () => {
      vi.useFakeTimers()
      const speicher = lokalerEniSpeicher('erijon')
      const baueGeber = () => ({
        art: 'modell' as const,
        anbieter: 'test',
        denkt: false,
        async antworte(chatId: string, text: string) {
          const mensch = await speicher.schreibe(chatId, 'mensch', text)
          const eni = await speicher.schreibe(chatId, 'eni', 'Hier ist **echter Einsatz** gefragt.')
          return { mensch, eni }
        },
        nochmal: () => Promise.reject(new Error('hier nicht gebraucht')),
      })

      render(
        <EniApp
          speicher={speicher}
          onZurueck={vi.fn()}
          pruefeModell={async () => ({ bereit: true, anbieter: [], gewaehlt: null })}
          baueGeber={baueGeber}
        />
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      fireEvent.change(feld(), { target: { value: 'mein plan' } })
      fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })

      // Keine raw Markdown-Sterne im gerenderten Text
      expect(screen.queryByText(/\*\*/)).toBeNull()
      const echter = screen.getByText('echter')
      expect(echter.closest('strong')).not.toBeNull()
      expect(echter.classList.contains('eni-wort')).toBe(true)
    })

    it('startet mit Audio standardmaessig aus und liest erst nach Einschalten vor', async () => {
      vi.useFakeTimers()
      const altSynth = window.speechSynthesis
      const altUtt = window.SpeechSynthesisUtterance
      window.speechSynthesis = {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: () => [],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as SpeechSynthesis
      window.SpeechSynthesisUtterance = function () {} as unknown as typeof SpeechSynthesisUtterance

      const speicher = lokalerEniSpeicher('erijon')
      render(<EniApp speicher={speicher} onZurueck={vi.fn()} />)
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })

      // das vorlesen liegt jetzt im kopfmenü, nicht mehr offen in der leiste
      oeffneMenue()
      const audioBtn = screen.getByRole('menuitemcheckbox', { name: 'antworten vorlesen' })
      expect(audioBtn).toHaveAttribute('aria-checked', 'false')

      // Einschalten — das menü bleibt offen, damit man das umspringen sieht
      fireEvent.click(audioBtn)
      expect(audioBtn).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByRole('menuitemcheckbox', { name: 'antworten vorlesen' })).toBeInTheDocument()

      window.speechSynthesis = altSynth
      window.SpeechSynthesisUtterance = altUtt
    })
  })
});
