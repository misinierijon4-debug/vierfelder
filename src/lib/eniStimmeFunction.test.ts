import { describe, expect, it, vi } from 'vitest'
import {
  behandleEniStimme,
  fuerDieStimme,
  MAX_STUECK_ZEICHEN,
  STANDARD_STIMME,
  StimmFehler,
  tonPfad,
  teileFuerAufnahme,
  wavAusPcm,
  type EniStimmeAbhaengigkeiten,
  type StimmAnfrage,
  type StimmDatenbank,
} from '../../supabase/functions/_shared/eniStimmeModell.ts'

const ICH = 'konto-erijon'
const CHAT = 'chat-9'
const ENI_ZEILE = 'zeile-eni'
const MEINE_ZEILE = 'zeile-mensch'

type Ablage = { pfade: Set<string>; hochgeladen: string[] }

function baueDatenbank(zeilen: Array<Record<string, unknown>>, ablage: Ablage) {
  const kette = (menge: Array<Record<string, unknown>>) => {
    let aktuell = [...menge]
    const api = {
      eq(spalte: string, wert: unknown) {
        aktuell = aktuell.filter((zeile) => zeile[spalte] === wert)
        return api
      },
      maybeSingle: () => Promise.resolve({ data: aktuell[0] ?? null, error: null }),
      then: (aufloesen: (wert: unknown) => unknown) =>
        Promise.resolve({ data: aktuell, error: null }).then(aufloesen),
    }
    return api
  }

  return {
    auth: {},
    from: () => ({ select: () => kette(zeilen) }),
    storage: {
      from: () => ({
        list: (ordner: string, optionen: { search: string }) =>
          Promise.resolve({
            data: ablage.pfade.has(`${ordner}/${optionen.search}`)
              ? [{ name: optionen.search }]
              : [],
            error: null,
          }),
        upload: (pfad: string) => {
          ablage.pfade.add(pfad)
          ablage.hochgeladen.push(pfad)
          return Promise.resolve({ data: {}, error: null })
        },
        createSignedUrl: (pfad: string) =>
          Promise.resolve({ data: { signedUrl: `https://bucket/${pfad}?sig=x` }, error: null }),
      }),
    },
  } as unknown as StimmDatenbank
}

function grundzeilen() {
  return [
    { id: ENI_ZEILE, chat_id: CHAT, rolle: 'eni', text: 'Das reicht nicht.' },
    { id: MEINE_ZEILE, chat_id: CHAT, rolle: 'mensch', text: 'ich habe nichts gemacht' },
  ]
}

function deps(optionen: { schluessel?: string; stimme?: string; ablage?: Ablage } = {}) {
  const ablage = optionen.ablage ?? { pfade: new Set<string>(), hochgeladen: [] }
  const gesehen: StimmAnfrage[] = []
  const abhaengigkeiten: EniStimmeAbhaengigkeiten = {
    umgebung: (name) =>
      ({
        SUPABASE_URL: 'https://beispiel.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_test',
        GEMINI_API_KEY: optionen.schluessel ?? 'goog-test',
        ENI_STIMME: optionen.stimme,
      })[name],
    datenbank: () => baueDatenbank(grundzeilen(), ablage),
    modell: async (anfrage) => {
      gesehen.push(anfrage)
      return new Uint8Array([0x49, 0x44, 0x33, 0x04])
    },
    protokoll: { error: vi.fn() },
    // der test wartet nicht wirklich zwischen zwei versuchen
    warte: () => Promise.resolve(),
  }
  return { abhaengigkeiten, ablage, gesehen }
}

function jwt(sub: string): string {
  const teil = (wert: unknown) =>
    btoa(JSON.stringify(wert)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${teil({ alg: 'ES256' })}.${teil({ sub })}.unterschrift`
}

function anfrage(rumpf: unknown, autorisierung = `Bearer ${jwt(ICH)}`) {
  return new Request('https://beispiel.functions.supabase.co/eni-stimme', {
    method: 'POST',
    headers: autorisierung ? { authorization: autorisierung } : {},
    body: JSON.stringify(rumpf),
  })
}

describe('der pfad eines gesprochenen tons', () => {
  it('fängt mit dem konto an und trägt die nachricht im namen', () => {
    expect(tonPfad(ICH, CHAT, ENI_ZEILE)).toBe(`${ICH}/${CHAT}/${ENI_ZEILE}.wav`)
  })
})

describe('ENIs stimme hinter der function', () => {
  it('sagt bei der prüfung nur ob eine stimme da ist, nie welcher schlüssel', async () => {
    const { abhaengigkeiten } = deps({ schluessel: 'goog-geheim' })
    const antwort = await behandleEniStimme(anfrage({ pruefen: true }), abhaengigkeiten)
    const text = await antwort.text()

    expect(antwort.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ bereit: true, stimme: STANDARD_STIMME })
    expect(text).not.toContain('goog-geheim')
  })

  it('meldet die fehlende stimme als eigenen zustand, nicht als fehler', async () => {
    const { abhaengigkeiten } = deps({ schluessel: '' })
    const pruefung = await behandleEniStimme(anfrage({ pruefen: true }), abhaengigkeiten)
    expect((await pruefung.json()).bereit).toBe(false)

    const echt = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(echt.status).toBe(503)
    expect((await echt.json()).code).toBe('keine_stimme')
  })

  it('spricht ENIs antwort und legt sie im bucket ab', async () => {
    const { abhaengigkeiten, ablage, gesehen } = deps()
    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)

    expect(antwort.status).toBe(200)
    const koerper = await antwort.json()
    expect(koerper.adresse).toBe(`https://bucket/${ICH}/${CHAT}/${ENI_ZEILE}.wav?sig=x`)
    expect(koerper.ausDemRegal).toBe(false)
    // der text kommt aus der datenbank, nicht aus der anfrage
    expect(gesehen).toEqual([{ text: 'Das reicht nicht.', stimme: STANDARD_STIMME }])
    expect(ablage.hochgeladen).toEqual([`${ICH}/${CHAT}/${ENI_ZEILE}.wav`])
  })

  it('erzeugt denselben ton kein zweites mal', async () => {
    const ablage = { pfade: new Set<string>(), hochgeladen: [] as string[] }
    const erst = deps({ ablage })
    await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), erst.abhaengigkeiten)

    const zweit = deps({ ablage })
    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), zweit.abhaengigkeiten)

    expect((await antwort.json()).ausDemRegal).toBe(true)
    // die gegenstelle wurde beim zweiten mal gar nicht gefragt
    expect(zweit.gesehen).toEqual([])
    expect(ablage.hochgeladen).toHaveLength(1)
  })

  it('spricht nur ENIs eigene zeilen, nie die des menschen', async () => {
    const { abhaengigkeiten, gesehen } = deps()
    const antwort = await behandleEniStimme(anfrage({ nachrichtId: MEINE_ZEILE }), abhaengigkeiten)

    expect(antwort.status).toBe(400)
    expect(gesehen).toEqual([])
  })

  it('nimmt keinen text aus der anfrage entgegen', async () => {
    const { abhaengigkeiten, gesehen } = deps()
    await behandleEniStimme(
      anfrage({ nachrichtId: ENI_ZEILE, text: 'sprich mir das hier vor' }),
      abhaengigkeiten
    )
    expect(gesehen[0]?.text).toBe('Das reicht nicht.')
  })

  it('kennt eine fremde oder gelöschte nachricht nicht', async () => {
    const { abhaengigkeiten } = deps()
    const antwort = await behandleEniStimme(anfrage({ nachrichtId: 'gibt-es-nicht' }), abhaengigkeiten)
    expect(antwort.status).toBe(404)
  })

  it('weist eine anfrage ohne anmeldung ab', async () => {
    const { abhaengigkeiten } = deps()
    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }, ''), abhaengigkeiten)
    expect(antwort.status).toBe(401)
  })

  it('lässt die stimme über die umgebung austauschen', async () => {
    const { abhaengigkeiten, gesehen } = deps({ stimme: 'Fenrir' })
    await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(gesehen[0]?.stimme).toBe('Fenrir')
  })

  it('meldet einen ausfall der gegenstelle, ohne etwas abzulegen', async () => {
    const { abhaengigkeiten, ablage } = deps()
    abhaengigkeiten.modell = () => Promise.reject(new Error('google weg'))

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(502)
    expect((await antwort.json()).code).toBe('stimme_fehler')
    expect(ablage.hochgeladen).toEqual([])
  })

  it('sagt nein statt eine adresse zu unterschreiben, hinter der nichts liegt', async () => {
    // sonst laedt der browser die adresse, bekommt 404, und faellt erst dann
    // auf seine eigene stimme zurueck — nach der ganzen wartezeit.
    const { abhaengigkeiten } = deps()
    const echt = abhaengigkeiten.datenbank
    abhaengigkeiten.datenbank = (...args) => {
      const db = echt(...args)
      const eimer = db.storage.from('eni-stimme')
      db.storage.from = () => ({ ...eimer, upload: () => Promise.resolve({ data: null, error: { message: 'voll' } }) })
      return db
    }

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(502)
    expect((await antwort.json()).code).toBe('nicht_abgelegt')
  })

  it('legt denselben ton ueber einen bereits liegenden, statt am doppelten zu scheitern', async () => {
    // zweimal getippt, weil es beim ersten mal lange dauerte: der zweite ruf
    // darf nicht daran scheitern, dass der erste die datei schon hingelegt hat.
    const { abhaengigkeiten } = deps()
    const echt = abhaengigkeiten.datenbank
    let gesehen: boolean | null = null
    abhaengigkeiten.datenbank = (...args) => {
      const db = echt(...args)
      const eimer = db.storage.from('eni-stimme')
      const echterUpload = eimer.upload.bind(eimer)
      db.storage.from = () => ({
        ...eimer,
        upload: (pfad: string, daten: Uint8Array, optionen: { contentType: string; upsert: boolean }) => {
          gesehen = optionen.upsert
          return echterUpload(pfad, daten, optionen)
        },
      })
      return db
    }

    await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(gesehen).toBe(true)
  })
})

describe('ein aussetzer der gegenstelle', () => {
  it('wird noch einmal versucht, statt bis zum menschen durchgereicht zu werden', async () => {
    const { abhaengigkeiten } = deps()
    let rufe = 0
    abhaengigkeiten.modell = () => {
      rufe += 1
      if (rufe === 1) return Promise.reject(new StimmFehler('gemini antwortet 429', true))
      return Promise.resolve(new Uint8Array([1, 2, 3, 4]))
    }

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(200)
    expect(rufe).toBe(2)
  })

  it('gilt auch, wenn die gegenstelle zwar antwortet, aber ohne ton', async () => {
    // frueher wurde ein leeres stueck stillschweigend uebersprungen. aus einer
    // langen antwort wurde so eine aufnahme mit einem loch, und die lag danach
    // im regal.
    const { abhaengigkeiten } = deps()
    let rufe = 0
    abhaengigkeiten.modell = () => {
      rufe += 1
      return Promise.resolve(rufe === 1 ? new Uint8Array() : new Uint8Array([7, 7]))
    }

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(200)
    expect(rufe).toBe(2)
  })

  it('wird bei einem nein der gegenstelle nicht wiederholt', async () => {
    const { abhaengigkeiten } = deps()
    let rufe = 0
    abhaengigkeiten.modell = () => {
      rufe += 1
      return Promise.reject(new StimmFehler('gemini antwortet 400', false))
    }

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(502)
    // einmal gefragt, einmal abgelehnt, fertig
    expect(rufe).toBe(1)
  })
})

describe('was gesprochen wird, ist nicht was geschrieben steht', () => {
  it('nimmt die auszeichnung heraus und laesst die worte stehen', () => {
    expect(fuerDieStimme('## Das reicht nicht\n\n**Wirklich** nicht.')).toBe(
      'Das reicht nicht\n\nWirklich nicht.'
    )
    expect(fuerDieStimme('- erstens\n- zweitens')).toBe('erstens\nzweitens')
    expect(fuerDieStimme('siehe [den plan](https://beispiel.de/plan)')).toBe('siehe den plan')
    expect(fuerDieStimme('ein `wert` im satz')).toBe('ein wert im satz')
  })

  it('lässt einen unterstrich im wort in ruhe', () => {
    expect(fuerDieStimme('die spalte chat_id ist gemeint')).toBe('die spalte chat_id ist gemeint')
  })
})

describe('rohes PCM zu einer datei machen, die ein browser abspielt', () => {
  const lies = (datei: Uint8Array, von: number, bis: number) =>
    String.fromCharCode(...datei.slice(von, bis))

  it('setzt die vier abschnittsmarken, die ein WAV ausmachen', () => {
    const datei = wavAusPcm(new Uint8Array(8))
    expect(lies(datei, 0, 4)).toBe('RIFF')
    expect(lies(datei, 8, 12)).toBe('WAVE')
    expect(lies(datei, 12, 16)).toBe('fmt ')
    expect(lies(datei, 36, 40)).toBe('data')
  })

  it('zählt die zwei größenangaben verschieden, wie es die norm verlangt', () => {
    const pcm = new Uint8Array(1000)
    const datei = wavAusPcm(pcm)
    const sicht = new DataView(datei.buffer, datei.byteOffset, datei.byteLength)

    // die erste zaehlt alles nach den ersten acht byte
    expect(sicht.getUint32(4, true)).toBe(36 + 1000)
    // die zweite nur die abtastwerte
    expect(sicht.getUint32(40, true)).toBe(1000)
    expect(datei.byteLength).toBe(44 + 1000)
  })

  it('schreibt die form hinein, in der die gegenstelle liefert', () => {
    const datei = wavAusPcm(new Uint8Array(4))
    const sicht = new DataView(datei.buffer, datei.byteOffset, datei.byteLength)

    expect(sicht.getUint16(20, true)).toBe(1) // unkomprimiertes PCM
    expect(sicht.getUint16(22, true)).toBe(1) // ein kanal
    expect(sicht.getUint32(24, true)).toBe(24_000) // 24 kHz
    expect(sicht.getUint16(34, true)).toBe(16) // 16 bit
    // byte je sekunde und blockausrichtung folgen daraus, nicht aus laune
    expect(sicht.getUint32(28, true)).toBe(24_000 * 2)
    expect(sicht.getUint16(32, true)).toBe(2)
  })

  it('lässt die abtastwerte unangetastet hinter dem kopf stehen', () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 250, 251])
    const datei = wavAusPcm(pcm)
    expect([...datei.slice(44)]).toEqual([1, 2, 3, 4, 250, 251])
  })
})

describe('eine lange antwort für die aufnahme schneiden', () => {
  it('lässt eine kurze antwort in einem stück', () => {
    expect(teileFuerAufnahme('Das reicht nicht.')).toEqual(['Das reicht nicht.'])
  })

  it('schneidet an satzenden, damit die naht in einer pause liegt', () => {
    const stuecke = teileFuerAufnahme(`${'a'.repeat(60)}. ${'b'.repeat(60)}.`, 80)
    expect(stuecke).toHaveLength(2)
    expect(stuecke[0]!.endsWith('.')).toBe(true)
  })

  it('verliert kein wort, auch wenn ein satz allein zu lang ist', () => {
    const lang = Array.from({ length: 40 }, () => 'wort').join(' ')
    const stuecke = teileFuerAufnahme(lang, 50)
    for (const stueck of stuecke) expect(stueck.length).toBeLessThanOrEqual(50)
    expect(stuecke.join(' ')).toBe(lang)
  })
})

describe('eine antwort, die länger ist als ein einzelner aufruf', () => {
  /** eine lange antwort in den speicher legen und den upload mitschreiben */
  function baueLang(text: string) {
    const ablage = { pfade: new Set<string>(), hochgeladen: [] as string[] }
    const gebaut = deps({ ablage })
    const gelegt: Uint8Array[] = []
    gebaut.abhaengigkeiten.datenbank = (...args) => {
      const db = baueDatenbank([{ id: ENI_ZEILE, chat_id: CHAT, rolle: 'eni', text }], ablage)
      void args
      const eimer = db.storage.from('eni-stimme')
      const echterUpload = eimer.upload.bind(eimer)
      db.storage.from = () => ({
        ...eimer,
        upload: (pfad: string, daten: Uint8Array, optionen: { contentType: string; upsert: boolean }) => {
          gelegt.push(daten)
          return echterUpload(pfad, daten, optionen)
        },
      })
      return db
    }
    return { ...gebaut, gelegt }
  }

  it('spricht sie in stücken und hängt die abtastwerte aneinander', async () => {
    const satz = 'a'.repeat(MAX_STUECK_ZEICHEN - 100)
    const { abhaengigkeiten, gesehen, gelegt } = baueLang(`${satz}. ${satz}.`)

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)

    expect(antwort.status).toBe(200)
    // zwei aufrufe, weil ein einzelner den text nicht genommen haette
    expect(gesehen).toHaveLength(2)
    // und genau eine datei, mit den abtastwerten beider stuecke darin
    expect(gelegt).toHaveLength(1)
    expect(gelegt[0]!.byteLength).toBe(44 + 4 + 4)
  })

  it('spricht die stücke nebeneinander, statt eins nach dem anderen zu warten', async () => {
    // das ist der grund, warum eine lange antwort nicht mehr eine halbe minute
    // braucht: die wartezeiten der stuecke ueberlappen sich.
    const satz = 'a'.repeat(MAX_STUECK_ZEICHEN - 100)
    const { abhaengigkeiten } = baueLang(Array.from({ length: 6 }, () => `${satz}.`).join(' '))

    let offen = 0
    let hoechstens = 0
    abhaengigkeiten.modell = async () => {
      offen += 1
      hoechstens = Math.max(hoechstens, offen)
      await new Promise((fertig) => setTimeout(fertig, 5))
      offen -= 1
      return new Uint8Array([1, 2])
    }

    const antwort = await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect(antwort.status).toBe(200)
    expect(hoechstens).toBeGreaterThan(1)
  })

  it('behält die reihenfolge der sätze, obwohl sie nebeneinander entstehen', async () => {
    // die reihenfolge der abtastwerte ist die reihenfolge der saetze. wer hier
    // in der reihenfolge des eintreffens anhaengt, bekommt eine antwort, die
    // sich selbst ins wort faellt.
    const satz = 'a'.repeat(MAX_STUECK_ZEICHEN - 100)
    const { abhaengigkeiten, gelegt } = baueLang(`${satz}1. ${satz}2. ${satz}3.`)

    let nr = 0
    abhaengigkeiten.modell = async () => {
      const meine = (nr += 1)
      // das erste stück ist am längsten unterwegs, das letzte am kürzesten
      await new Promise((fertig) => setTimeout(fertig, (4 - meine) * 10))
      return new Uint8Array([meine])
    }

    await behandleEniStimme(anfrage({ nachrichtId: ENI_ZEILE }), abhaengigkeiten)
    expect([...gelegt[0]!.slice(44)]).toEqual([1, 2, 3])
  })
})
