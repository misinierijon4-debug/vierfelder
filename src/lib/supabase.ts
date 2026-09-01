import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { Anfangszustand, Backend, EinheitEreignis, Wetten } from './backend'
import { addDays, toKey } from './dates'
import { gewichtKey, tickKey } from './types'
import type {
  Aufenthalt,
  AreaId,
  Einheit,
  Einheiten,
  Gewichte,
  MessbarerBereich,
  Phase,
  Schlafnacht,
  UserId,
} from './types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hatSupabase = Boolean(url && key)

/**
 * wie weit zurueck die verlaeufe gleich mitkommen.
 *
 * Ein Verlauf ist rund drei Kilobyte je Nacht — bei zwei Personen also gut
 * zwei Megabyte im Jahr, die sonst bei jedem Start ueber das Mobilnetz gingen,
 * obwohl nur die geoeffnete Nacht sie braucht. Acht Wochen decken die Woche,
 * die man sieht, und das Blaettern der letzten Wochen ab; alles davor laedt
 * das Nachtdetail beim Oeffnen nach.
 */
const PHASEN_FENSTER_TAGE = 56

export const supabase = hatSupabase ? createClient(url!, key!) : null

type ProfilZeile = { id: string; person: UserId }
type EintragZeile = { user_id: string; bereich: AreaId; tag: string }
type WertZeile = { bereich: AreaId; tag: string; wert: number }
type EinheitZeile = {
  id: string
  user_id: string
  bereich: AreaId
  tag: string
  wert: number | null
  erfasst: string | null
}
/** zeile aus `schlafnaechte_ansicht`. numeric kommt je nach spalte als text */
type SchlafZeile = {
  user_id: string
  nacht: string
  schlaf_minuten: number | string
  einschlafzeit: string
  aufwachzeit: string | null
  bett_start: string | null
  bett_ende: string | null
  bett_minuten: number | string | null
  tief_minuten: number | string | null
  rem_minuten: number | string | null
  kern_minuten: number | string | null
  unspez_minuten: number | string | null
  wach_minuten: number | string | null
  schlafziel_minuten: number
  /** fehlt, wenn die spalte nicht angefragt wurde */
  phasen?: Phase[] | null
  nachtwert: number | null
  score_konfidenz: number | null
}

function zahl(wert: number | string | null | undefined): number {
  return wert === null || wert === undefined ? 0 : Number(wert)
}

/** numeric kommt aus postgrest als string, genau wie schlaf_minuten */
type GewichtZeile = { user_id: string; tag: string; kg: number | string }
type AufenthaltZeile = {
  user_id: string
  bereich: MessbarerBereich
  ort: string
  ankunft: string
  abgang: string | null
}
type WetteZeile = { woche: string; text: string }

export type Anmeldestatus = 'laden' | 'an' | 'aus'

export function useSession() {
  const [status, setStatus] = useState<Anmeldestatus>(hatSupabase ? 'laden' : 'aus')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!supabase) return
    let aktiv = true
    supabase.auth.getSession().then(({ data }) => {
      if (!aktiv) return
      setSession(data.session)
      setStatus(data.session ? 'an' : 'aus')
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setStatus(s ? 'an' : 'aus')
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { status, session }
}

export async function anmelden(email: string, passwort: string): Promise<string | null> {
  if (!supabase) return 'supabase ist nicht eingerichtet.'
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
  if (!error) return null
  if (error.message.toLowerCase().includes('invalid')) {
    return 'e-mail oder passwort stimmt nicht.'
  }
  return 'anmeldung fehlgeschlagen. prüfe die verbindung und versuch es nochmal.'
}

export async function abmelden() {
  await supabase?.auth.signOut()
}

export function supabaseBackend(eigeneId: string): Backend {
  if (!supabase) throw new Error('supabase ist nicht eingerichtet')
  const db = supabase
  /** uuid -> person. wird beim laden gefüllt und von realtime mitbenutzt */
  const personen = new Map<string, UserId>()

  /**
   * solange `einheiten` noch nicht eingespielt ist, liest und schreibt die app
   * weiter `eintraege` und `werte`. das hält sie am leben, wenn die migration
   * und der deploy nicht in derselben minute passieren.
   */
  let altbestand = false
  let wettenVerfuegbar = false
  let modusBekannt: () => void = () => {}
  const modus = new Promise<void>((r) => {
    modusBekannt = r
  })

  /** eine tageszeile aus dem altbestand, als einheit gelesen */
  const alteEinheit = (
    person: UserId,
    bereich: AreaId,
    tag: string,
    wert: number | null
  ): Einheit => ({
    id: `alt|${person}|${bereich}|${tag}`,
    user: person,
    area: bereich,
    tag,
    wert,
    erfasst: null,
  })

  const einordnen = (ziel: Einheiten, e: Einheit) => {
    const key = tickKey(e.user, e.area, e.tag)
    const liste = ziel[key]
    if (!liste) ziel[key] = [e]
    else if (!liste.some((x) => x.id === e.id)) liste.push(e)
  }

  const zeileZuEinheit = (z: EinheitZeile): Einheit | null => {
    const person = personen.get(z.user_id)
    if (!person) return null
    return {
      id: z.id,
      user: person,
      area: z.bereich,
      tag: z.tag,
      wert: z.wert === null ? null : Number(z.wert),
      erfasst: z.erfasst,
    }
  }

  /**
   * eine zeile aus `schlafnaechte_ansicht` als nacht. derselbe weg fuer das
   * laden und fuer realtime: sonst haette eine live eintreffende nacht andere
   * zahlen als dieselbe nacht nach einem neuladen.
   */
  const zeileZuSchlafnacht = (n: SchlafZeile): Schlafnacht | null => {
    const person = personen.get(n.user_id)
    if (!person) return null
    return {
      user: person,
      nacht: n.nacht,
      schlafMinuten: zahl(n.schlaf_minuten),
      einschlafzeit: n.einschlafzeit,
      aufwachzeit: n.aufwachzeit,
      bettStart: n.bett_start,
      bettEnde: n.bett_ende,
      bettMinuten: n.bett_minuten === null ? null : Number(n.bett_minuten),
      tiefMinuten: zahl(n.tief_minuten),
      remMinuten: zahl(n.rem_minuten),
      kernMinuten: zahl(n.kern_minuten),
      unspezMinuten: zahl(n.unspez_minuten),
      wachMinuten: zahl(n.wach_minuten),
      zielMinuten: n.schlafziel_minuten,
      // ohne die spalte im select bleibt `undefined` — das ist "nicht geladen"
      phasen: Array.isArray(n.phasen) ? n.phasen : n.phasen === null ? [] : null,
      nachtwert: n.nachtwert ?? null,
      scoreKonfidenz: n.score_konfidenz ?? null,
    }
  }

  const zeileZuAufenthalt = (a: AufenthaltZeile): Aufenthalt | null => {
    const person = personen.get(a.user_id)
    if (!person) return null
    return {
      user: person,
      bereich: a.bereich,
      ort: a.ort,
      ankunft: a.ankunft,
      abgang: a.abgang,
    }
  }

  return {
    art: 'supabase',

    async laden(): Promise<Anfangszustand> {
      const [
        profile,
        einheitZeilen,
        schlafZeilen,
        phasenZeilen,
        gewichtZeilen,
        aufenthaltZeilen,
        wetteZeilen,
      ] = await Promise.all([
          db.from('profile').select('id, person'),
          db.from('einheiten').select('id, user_id, bereich, tag, wert, erfasst'),
          db
            .from('schlafnaechte_ansicht')
            .select(
              'user_id, nacht, schlaf_minuten, einschlafzeit, aufwachzeit, bett_start, bett_ende, bett_minuten, tief_minuten, rem_minuten, kern_minuten, unspez_minuten, wach_minuten, schlafziel_minuten, nachtwert, score_konfidenz'
            )
            .order('nacht', { ascending: true }),
          // die verlaeufe der letzten wochen kommen mit: was man gleich
          // aufschlaegt, soll nicht erst nachladen. alles davor holt sich das
          // nachtdetail bei bedarf
          db
            .from('schlafnaechte_ansicht')
            .select('user_id, nacht, phasen')
            .gte('nacht', toKey(addDays(new Date(), -PHASEN_FENSTER_TAGE))),
          db.from('gewicht').select('user_id, tag, kg').order('tag', { ascending: true }),
          db
            .from('aufenthalte')
            .select('user_id, bereich, ort, ankunft, abgang')
            .order('ankunft', { ascending: true }),
          db.from('duell_wetten').select('woche, text'),
        ])

      if (profile.error) throw profile.error
      // Während Schema und Frontend getrennt veröffentlicht werden, darf eine
      // neue Ansicht oder Tabelle den bestehenden Tracker nicht lahmlegen.
      const fehltNoch = (code?: string) => code === '42P01' || code === 'PGRST205'
      if (einheitZeilen.error && !fehltNoch(einheitZeilen.error.code)) throw einheitZeilen.error
      if (schlafZeilen.error && !fehltNoch(schlafZeilen.error.code)) throw schlafZeilen.error
      if (phasenZeilen.error && !fehltNoch(phasenZeilen.error.code)) throw phasenZeilen.error
      if (gewichtZeilen.error && !fehltNoch(gewichtZeilen.error.code)) throw gewichtZeilen.error
      if (aufenthaltZeilen.error && !fehltNoch(aufenthaltZeilen.error.code)) {
        throw aufenthaltZeilen.error
      }
      if (wetteZeilen.error && !fehltNoch(wetteZeilen.error.code)) throw wetteZeilen.error
      wettenVerfuegbar = !wetteZeilen.error

      altbestand = Boolean(einheitZeilen.error)
      modusBekannt()

      // die beiden alten tabellen werden nur noch gelesen, wenn es sein muss
      const [eintraege, werteZeilen] = altbestand
        ? await Promise.all([
            db.from('eintraege').select('user_id, bereich, tag'),
            db.from('werte').select('bereich, tag, wert'),
          ])
        : [null, null]
      if (eintraege?.error) throw eintraege.error
      if (werteZeilen?.error) throw werteZeilen.error

      personen.clear()
      for (const p of (profile.data ?? []) as ProfilZeile[]) personen.set(p.id, p.person)

      const me = personen.get(eigeneId)
      if (!me) {
        throw new Error('kein profil für dieses konto. lege in der tabelle profile eine zeile an.')
      }

      const einheiten: Einheiten = {}
      if (altbestand) {
        // `werte` gehört nur dem eigenen konto, mehr als die eigenen minuten
        // gibt der altbestand nicht her.
        const werte = new Map<string, number>()
        for (const w of (werteZeilen?.data ?? []) as WertZeile[]) {
          werte.set(`${w.bereich}|${w.tag}`, w.wert)
        }
        for (const e of (eintraege?.data ?? []) as EintragZeile[]) {
          const person = personen.get(e.user_id)
          if (!person) continue
          const wert = person === me ? (werte.get(`${e.bereich}|${e.tag}`) ?? null) : null
          einordnen(einheiten, alteEinheit(person, e.bereich, e.tag, wert))
        }
      } else {
        for (const z of (einheitZeilen.data ?? []) as EinheitZeile[]) {
          const e = zeileZuEinheit(z)
          if (e) einordnen(einheiten, e)
        }
        // älteste zuerst; ohne zeitpunkt sind die übernommenen altbestände
        for (const liste of Object.values(einheiten)) {
          liste.sort((a, b) => {
            const x = a.erfasst ?? ''
            const y = b.erfasst ?? ''
            return x < y ? -1 : x > y ? 1 : 0
          })
        }
      }

      const verlaeufe = new Map<string, Phase[]>()
      for (const z of (phasenZeilen.data ?? []) as SchlafZeile[]) {
        verlaeufe.set(`${z.user_id}|${z.nacht}`, Array.isArray(z.phasen) ? z.phasen : [])
      }

      const schlaf: Schlafnacht[] = []
      for (const n of ((schlafZeilen.data ?? []) as SchlafZeile[])) {
        const nacht = zeileZuSchlafnacht(n)
        if (!nacht) continue
        const verlauf = verlaeufe.get(`${n.user_id}|${n.nacht}`)
        schlaf.push(verlauf === undefined ? nacht : { ...nacht, phasen: verlauf })
      }

      const gewichte: Gewichte = {}
      for (const z of (gewichtZeilen.data ?? []) as GewichtZeile[]) {
        const person = personen.get(z.user_id)
        if (!person) continue
        // Number(): numeric käme sonst als string und die summe im gleitenden
        // schnitt würde stillschweigend aneinandergehängt statt addiert.
        gewichte[gewichtKey(person, z.tag)] = Number(z.kg)
      }

      const aufenthalte: Aufenthalt[] = []
      for (const a of (aufenthaltZeilen.data ?? []) as AufenthaltZeile[]) {
        const aufenthalt = zeileZuAufenthalt(a)
        if (aufenthalt) aufenthalte.push(aufenthalt)
      }

      const wetten: Wetten = {}
      for (const w of (wetteZeilen.data ?? []) as WetteZeile[]) wetten[w.woche] = w.text

      return { me, einheiten, gewichte, schlaf, aufenthalte, wetten, altbestand }
    },

    async schreibeEinheit(e) {
      if (altbestand) {
        const { error } = await db
          .from('eintraege')
          .upsert(
            { user_id: eigeneId, bereich: e.area, tag: e.tag },
            { onConflict: 'user_id,bereich,tag' }
          )
        if (error) throw error
        if (e.wert !== null) await this.schreibeEinheitWert(e, e.wert)
        return
      }

      // ignoreDuplicates: dieselbe id zweimal zu senden — nach einem timeout,
      // aus einer wiederholung — legt keine zweite einheit an.
      const { error } = await db.from('einheiten').upsert(
        {
          id: e.id,
          user_id: eigeneId,
          bereich: e.area,
          tag: e.tag,
          wert: e.wert,
          erfasst: e.erfasst,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      if (error) throw error
    },

    async schreibeEinheitWert(e, wert) {
      if (altbestand) {
        if (wert === null || wert <= 0) {
          const { error } = await db
            .from('werte')
            .delete()
            .match({ user_id: eigeneId, bereich: e.area, tag: e.tag })
          if (error) throw error
          return
        }
        const { error } = await db
          .from('werte')
          .upsert(
            { user_id: eigeneId, bereich: e.area, tag: e.tag, wert },
            { onConflict: 'user_id,bereich,tag' }
          )
        if (error) throw error
        return
      }

      const { error } = await db
        .from('einheiten')
        .update({ wert })
        .match({ id: e.id, user_id: eigeneId })
      if (error) throw error
    },

    async loescheEinheit(e) {
      if (altbestand) return this.loescheTag([e])
      const { error } = await db.from('einheiten').delete().match({ id: e.id, user_id: eigeneId })
      if (error) throw error
    },

    async loescheTag(einheiten) {
      const erste = einheiten[0]
      if (!erste) return

      if (altbestand) {
        const treffer = { user_id: eigeneId, bereich: erste.area, tag: erste.tag }
        const eintrag = await db.from('eintraege').delete().match(treffer)
        if (eintrag.error) throw eintrag.error
        const wert = await db.from('werte').delete().match(treffer)
        if (wert.error) throw wert.error
        return
      }

      const { error } = await db
        .from('einheiten')
        .delete()
        .eq('user_id', eigeneId)
        .in('id', einheiten.map((e) => e.id))
      if (error) throw error
    },

    async schreibeGewicht(tag, kg) {
      if (kg <= 0) {
        const { error } = await db.from('gewicht').delete().match({ user_id: eigeneId, tag })
        if (error) throw error
      } else {
        const { error } = await db
          .from('gewicht')
          .upsert({ user_id: eigeneId, tag, kg }, { onConflict: 'user_id,tag' })
        if (error) throw error
      }
    },

    async schreibeWette(woche, text) {
      if (!wettenVerfuegbar) throw new Error('duell_wetten fehlt noch')
      const { error } = await db.from('duell_wetten').upsert(
        { woche, text, updated_by: eigeneId, updated_at: new Date().toISOString() },
        { onConflict: 'woche' }
      )
      if (error) throw error
    },

    async ladePhasen(user, nacht) {
      const id = [...personen.entries()].find(([, person]) => person === user)?.[0]
      if (!id) return []
      const { data, error } = await db
        .from('schlafnaechte_ansicht')
        .select('phasen')
        .eq('user_id', id)
        .eq('nacht', nacht)
        .maybeSingle()
      if (error) throw error
      return Array.isArray(data?.phasen) ? (data.phasen as Phase[]) : []
    },

    abonniere(cb) {
      // welcher kanal der richtige ist, steht erst nach dem laden fest.
      let kanal: ReturnType<typeof db.channel> | null = null
      let abgemeldet = false

      /**
       * schlaf, gewicht und aufenthalte hängen an denselben kanal wie die
       * ticks. sie kommen nicht aus der app, sondern vom kurzbefehl auf dem
       * iphone oder vom zweiten gerät — ohne diese drei bliebe eine offene
       * app so lange auf dem stand des ladens, bis jemand sie neu startet.
       *
       * `schlaf_updates` ist die projektion, nicht die quelltabelle: über den
       * kanal geht damit dieselbe datensparsame zeile wie über die ansicht,
       * und die rohsegmente bleiben, wo sie sind.
       */
      const mitGesundheit = (b: ReturnType<typeof db.channel>) =>
        b
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'schlaf_updates' },
            (p) => {
              const zeile = p.new as SchlafZeile | null
              if (!zeile?.user_id) return
              const nacht = zeileZuSchlafnacht(zeile)
              if (nacht) cb({ typ: 'schlaf', nacht })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'gewicht' },
            (p) => {
              // beim löschen trägt nur `old` die zeile, und zwar nur den
              // schlüssel — mehr braucht das entfernen nicht
              const zeile = (p.eventType === 'DELETE' ? p.old : p.new) as GewichtZeile | null
              if (!zeile?.user_id || !zeile.tag) return
              const person = personen.get(zeile.user_id)
              if (!person) return
              cb({
                typ: 'gewicht',
                user: person,
                tag: zeile.tag,
                kg: p.eventType === 'DELETE' ? null : Number(zeile.kg),
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'aufenthalte' },
            (p) => {
              const zeile = p.new as AufenthaltZeile | null
              if (!zeile?.user_id) return
              const aufenthalt = zeileZuAufenthalt(zeile)
              if (aufenthalt) cb({ typ: 'aufenthalt', aufenthalt })
            }
          )

      void modus.then(() => {
        if (abgemeldet) return

        if (altbestand) {
          const melde = (zeile: EintragZeile | null, art: 'neu' | 'weg') => {
            if (!zeile) return
            const person = personen.get(zeile.user_id)
            if (!person) return
            cb({ typ: 'einheit', art, einheit: alteEinheit(person, zeile.bereich, zeile.tag, null) })
          }

          let builder = db
            .channel('eintraege')
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'eintraege' },
              (p) => melde(p.new as EintragZeile, 'neu')
            )
            .on(
              'postgres_changes',
              { event: 'DELETE', schema: 'public', table: 'eintraege' },
              (p) => melde(p.old as EintragZeile, 'weg')
            )
          if (wettenVerfuegbar) {
            builder = builder.on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'duell_wetten' },
              (p) => {
                const w = p.new as WetteZeile | null
                if (w?.woche && typeof w.text === 'string') {
                  cb({ typ: 'wette', woche: w.woche, text: w.text })
                }
              }
            )
          }
          kanal = mitGesundheit(builder).subscribe()
          return
        }

        const melde = (zeile: EinheitZeile | null, art: EinheitEreignis['art']) => {
          if (!zeile) return
          const einheit = zeileZuEinheit(zeile)
          if (einheit) cb({ typ: 'einheit', art, einheit })
        }

        let builder = db
          .channel('einheiten')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'einheiten' },
            (p) => melde(p.new as EinheitZeile, 'neu')
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'einheiten' },
            (p) => melde(p.new as EinheitZeile, 'wert')
          )
          // `replica identity full` liefert hier die ganze zeile, nicht nur die id
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'einheiten' },
            (p) => melde(p.old as EinheitZeile, 'weg')
          )
        if (wettenVerfuegbar) {
          builder = builder.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'duell_wetten' },
            (p) => {
              const w = p.new as WetteZeile | null
              if (w?.woche && typeof w.text === 'string') {
                cb({ typ: 'wette', woche: w.woche, text: w.text })
              }
            }
          )
        }
        kanal = mitGesundheit(builder).subscribe()
      })

      return () => {
        abgemeldet = true
        if (kanal) db.removeChannel(kanal)
      }
    },
  }
}
