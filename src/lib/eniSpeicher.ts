import { supabase } from './supabase'
import { raeumeChatDateien } from './eniAnhang'
import type { EniAnhang } from './eniAnhang'
import { addDays, startOfWeek, toKey } from './dates'
import { lokalePunktquellen } from './lokal'
import { tafelAusZeilen } from '../../supabase/functions/_shared/duellPunkte'
import type { Punktetafel } from '../../supabase/functions/_shared/duellPunkte'
import type { UserId } from './types'

export type DuellKontext = {
  ich: UserId
  gegner: UserId
  ichName: string
  gegnerName: string
  wocheIch: number
  wocheEr: number
  diff: number
  statusText?: string
  offeneAufgaben?: string[]
}

export type EniRolle = 'eni' | 'mensch'

export type EniZeile = {
  id: string
  rolle: EniRolle
  text: string
  /** ISO-zeitpunkt, für die trennlinien im verlauf */
  erstellt: string
  /**
   * was mit der vorlage ging: bilder und dateien. nur an eigenen zeilen und nur
   * im supabase-verlauf; ohne konto gibt es keinen bucket, in dem ein bild
   * liegen könnte.
   */
  anhaenge?: EniAnhang[]
}

export type EniChat = {
  id: string
  titel: string
  /** ISO-zeitpunkt der letzten nachricht */
  zuletzt: string
}

/**
 * der verlauf ist das gedächtnis von ENI. er liegt in supabase, aber anders als
 * alles andere in dieser app nur bei einer person: erijon sieht korays chats
 * nie und umgekehrt. der zwei-personen-vergleich endet an der tür zu ENI.
 *
 * die schnittstelle hat zwei fassungen, wie backend auch: supabase für den
 * ernstfall, localStorage für den prototyp ohne anmeldung.
 */
export type EniSpeicher = {
  art: 'supabase' | 'lokal'
  /**
   * die uuid des kontos, oder null ohne anmeldung. sie steht hier, weil der
   * pfad eines bildanhangs mit ihr anfängt und die policy im bucket genau das
   * prüft. `person()` hilft dafür nicht: 'erijon' ist ein name, kein konto.
   */
  kontoId: string | null
  person: () => Promise<UserId>
  chats: () => Promise<EniChat[]>
  nachrichten: (chatId: string) => Promise<EniZeile[]>
  /** legt den chat mit dem titel an, den die erste vorlage ihm gibt */
  neuerChat: (titel: string) => Promise<EniChat>
  schreibe: (chatId: string, rolle: EniRolle, text: string) => Promise<EniZeile>
  /** ersetzt eine eigene Vorlage und verwirft den Verlauf danach atomar */
  bearbeite: (chatId: string, nachrichtId: string, text: string) => Promise<EniZeile>
  loesche: (chatId: string) => Promise<void>
  duellStand?: () => Promise<DuellKontext | null>
}

/** der titel eines chats ist seine erste vorlage, gekürzt auf eine zeile */
export function chatTitel(ersteVorlage: string): string {
  const sauber = ersteVorlage.trim().replace(/\s+/g, ' ')
  if (sauber.length <= 48) return sauber || 'ohne titel'
  return `${sauber.slice(0, 47).trimEnd()}…`
}

export class EniSpeicherfehler extends Error {
  constructor(was: string, ursache?: unknown) {
    super(was)
    this.name = 'EniSpeicherfehler'
    this.cause = ursache
  }
}

export function supabaseEniSpeicher(kontoId: string): EniSpeicher {
  const klient = supabase
  if (!klient) throw new EniSpeicherfehler('ohne supabase gibt es keinen verlauf.')

  return {
    art: 'supabase',
    kontoId,

    async person() {
      const { data, error } = await klient
        .from('profile')
        .select('person')
        .eq('id', kontoId)
        .single()
      if (error) throw new EniSpeicherfehler('konto konnte nicht zugeordnet werden.', error)
      const person = (data as { person?: unknown }).person
      if (person !== 'erijon' && person !== 'koray') {
        throw new EniSpeicherfehler('konto gehört zu keiner bekannten person.')
      }
      return person
    },

    async chats() {
      const { data, error } = await klient
        .from('eni_chats')
        .select('id,titel,zuletzt')
        .order('zuletzt', { ascending: false })
        .limit(200)
      if (error) throw new EniSpeicherfehler('verlauf konnte nicht geladen werden.', error)
      return (data ?? []).map((zeile) => ({
        id: String(zeile.id),
        titel: String(zeile.titel),
        zuletzt: String(zeile.zuletzt),
      }))
    },

    async nachrichten(chatId) {
      const [zeilen, anhaenge] = await Promise.all([
        klient
          .from('eni_nachrichten')
          .select('id,rolle,text,erstellt')
          .eq('chat_id', chatId)
          .order('erstellt', { ascending: true }),
        klient
          .from('eni_anhaenge')
          .select('id,nachricht_id,art,name,pfad,inhalt,groesse')
          .eq('chat_id', chatId),
      ])
      if (zeilen.error) throw new EniSpeicherfehler('der chat konnte nicht geladen werden.', zeilen.error)

      const nachNachricht = new Map<string, EniAnhang[]>()
      for (const roh of anhaenge.data ?? []) {
        const anhang = leseAnhang(roh)
        const schluessel = String(roh.nachricht_id)
        nachNachricht.set(schluessel, [...(nachNachricht.get(schluessel) ?? []), anhang])
      }

      return (zeilen.data ?? []).map((zeile) => {
        const gelesen = leseZeile(zeile)
        const dazu = nachNachricht.get(gelesen.id)
        return dazu ? { ...gelesen, anhaenge: dazu } : gelesen
      })
    },

    async neuerChat(titel) {
      const { data, error } = await klient
        .from('eni_chats')
        .insert({ user_id: kontoId, titel })
        .select('id,titel,zuletzt')
        .single()
      if (error) throw new EniSpeicherfehler('der chat konnte nicht angelegt werden.', error)
      return {
        id: String(data.id),
        titel: String(data.titel),
        zuletzt: String(data.zuletzt),
      }
    },

    async schreibe(chatId, rolle, text) {
      const { data, error } = await klient
        .from('eni_nachrichten')
        .insert({ chat_id: chatId, user_id: kontoId, rolle, text })
        .select('id,rolle,text,erstellt')
        .single()
      if (error) throw new EniSpeicherfehler('die nachricht wurde nicht gespeichert.', error)
      return leseZeile(data)
    },

    async bearbeite(chatId, nachrichtId, text) {
      const { data, error } = await klient.rpc('eni_nachricht_bearbeiten', {
        p_chat_id: chatId,
        p_nachricht_id: nachrichtId,
        p_text: text,
      })
      if (error) throw new EniSpeicherfehler('die nachricht konnte nicht bearbeitet werden.', error)

      const ergebnis = data as {
        zeile?: Record<string, unknown>
        entfernte_pfade?: unknown
      } | null
      if (!ergebnis?.zeile) {
        throw new EniSpeicherfehler('die bearbeitete nachricht wurde nicht zurückgegeben.')
      }

      // Die Datenbank nimmt die späteren Anhang-Zeilen in derselben Transaktion
      // mit. Ihre privaten Bilddateien räumt der angemeldete Client danach auf;
      // ein Storage-Fehler darf den bereits sauber verzweigten Chat nicht
      // wieder als fehlgeschlagen darstellen.
      const pfade = Array.isArray(ergebnis.entfernte_pfade)
        ? ergebnis.entfernte_pfade.filter((pfad): pfad is string => typeof pfad === 'string')
        : []
      if (pfade.length > 0) {
        try {
          await klient.storage.from('eni-anhaenge').remove(pfade)
        } catch {
          /* verwaiste private Datei ist besser als ein falscher Chatstand */
        }
      }

      return leseZeile(ergebnis.zeile)
    },

    async loesche(chatId) {
      const { error } = await klient.from('eni_chats').delete().eq('id', chatId)
      if (error) throw new EniSpeicherfehler('der chat wurde nicht gelöscht.', error)
      try {
        await raeumeChatDateien(kontoId, chatId)
      } catch {
        /* der chat ist weg */
      }
    },

    async duellStand() {
      try {
        const zeit = duellZeitraum()
        const [profile, einheiten, aufenthalte, gewicht] = await Promise.all([
          klient.from('profile').select('id,person'),
          klient.from('einheiten').select('user_id,bereich,tag').gte('tag', zeit.montag),
          klient
            .from('aufenthalte')
            .select('user_id,bereich,ankunft,abgang')
            .gte('ankunft', `${zeit.vorMontag}T00:00:00Z`),
          klient.from('gewicht').select('user_id,tag').gte('tag', zeit.montag),
        ])

        const nachKonto = new Map(
          (profile.data ?? []).map((zeile) => [String(zeile.id), String(zeile.person)])
        )
        const person = nachKonto.get(kontoId)
        if (person !== 'erijon' && person !== 'koray') return null

        const tafel = tafelAusZeilen(
          { einheiten: einheiten.data, aufenthalte: aufenthalte.data, gewicht: gewicht.data },
          (id) => nachKonto.get(String(id)) ?? null,
          toKey,
          zeit.montag,
          zeit.heute
        )
        return baueDuellKontext(person, tafel)
      } catch {
        return null
      }
    },
  }
}

/**
 * Der Zeitraum des Wochenduells, in Ortszeit. `vorMontag` ist der Puffer fuer
 * die Messungen: eine Sitzung am Sonntagabend steht in UTC schon am Montag,
 * und ohne den Puffer fehlte sie. Die Tafel wirft danach weg, was nicht in die
 * Woche gehoert.
 */
function duellZeitraum(): { montag: string; vorMontag: string; heute: string } {
  const jetzt = new Date()
  const montag = startOfWeek(jetzt)
  return {
    montag: toKey(montag),
    vorMontag: toKey(addDays(montag, -1)),
    heute: toKey(jetzt),
  }
}

/**
 * Der Stand, wie der Begruessungsschirm ihn zeigt. Dieselbe Zaehlung wie die
 * LAGE und wie der Tracker: drei Quellen, ein Punkt je Person, Feld und Tag.
 * Vorher zaehlte hier nur die Tabelle `einheiten`, und der Schirm zeigte 1:1,
 * wo 5:3 stand.
 */
function baueDuellKontext(ich: UserId, tafel: Punktetafel): DuellKontext {
  const gegner: UserId = ich === 'koray' ? 'erijon' : 'koray'
  const wocheIch = tafel.anzahl(ich)
  const wocheEr = tafel.anzahl(gegner)
  return {
    ich,
    gegner,
    ichName: ich === 'koray' ? 'Koray' : 'Erijon',
    gegnerName: gegner === 'koray' ? 'Koray' : 'Erijon',
    wocheIch,
    wocheEr,
    diff: wocheIch - wocheEr,
  }
}

function leseZeile(zeile: Record<string, unknown>): EniZeile {
  const rolle = zeile.rolle === 'mensch' ? 'mensch' : 'eni'
  return {
    id: String(zeile.id),
    rolle,
    text: String(zeile.text),
    erstellt: String(zeile.erstellt),
  }
}

function leseAnhang(zeile: Record<string, unknown>): EniAnhang {
  const art = zeile.art === 'bild' ? 'bild' : 'text'
  return {
    id: String(zeile.id),
    art,
    name: String(zeile.name),
    ...(art === 'bild' ? { pfad: String(zeile.pfad) } : { inhalt: String(zeile.inhalt ?? '') }),
    groesse: Number(zeile.groesse ?? 0),
  }
}

const CHATS_KEY = 'vierfelder.eni.chats.v1'
const NACHRICHTEN_KEY = 'vierfelder.eni.nachrichten.v1'

/**
 * der prototyp ohne anmeldung. dieselbe schnittstelle, damit die oberfläche
 * nicht wissen muss, wo sie gerade läuft.
 */
export function lokalerEniSpeicher(me: UserId): EniSpeicher {
  const lies = <T,>(schluessel: string, ersatz: T): T => {
    try {
      const roh = localStorage.getItem(schluessel)
      return roh ? (JSON.parse(roh) as T) : ersatz
    } catch {
      return ersatz
    }
  }
  const schreibeRoh = (schluessel: string, wert: unknown) => {
    try {
      localStorage.setItem(schluessel, JSON.stringify(wert))
    } catch (ursache) {
      throw new EniSpeicherfehler('der speicher des browsers ist voll.', ursache)
    }
  }
  const alleNachrichten = () => lies<Record<string, EniZeile[]>>(NACHRICHTEN_KEY, {})

  return {
    art: 'lokal',
    kontoId: null,
    async person() {
      return me
    },
    async chats() {
      return lies<EniChat[]>(CHATS_KEY, []).sort((a, b) => b.zuletzt.localeCompare(a.zuletzt))
    },
    async nachrichten(chatId) {
      return alleNachrichten()[chatId] ?? []
    },
    async neuerChat(titel) {
      const chat: EniChat = { id: neueId(), titel, zuletzt: new Date().toISOString() }
      schreibeRoh(CHATS_KEY, [chat, ...lies<EniChat[]>(CHATS_KEY, [])])
      return chat
    },
    async schreibe(chatId, rolle, text) {
      const zeile: EniZeile = { id: neueId(), rolle, text, erstellt: new Date().toISOString() }
      const alle = alleNachrichten()
      alle[chatId] = [...(alle[chatId] ?? []), zeile]
      schreibeRoh(NACHRICHTEN_KEY, alle)
      schreibeRoh(
        CHATS_KEY,
        lies<EniChat[]>(CHATS_KEY, []).map((chat) =>
          chat.id === chatId ? { ...chat, zuletzt: zeile.erstellt } : chat
        )
      )
      return zeile
    },
    async bearbeite(chatId, nachrichtId, text) {
      const alle = alleNachrichten()
      const bisher = alle[chatId] ?? []
      const stelle = bisher.findIndex((zeile) => zeile.id === nachrichtId)
      const ziel = bisher[stelle]
      if (stelle < 0 || !ziel || ziel.rolle !== 'mensch') {
        throw new EniSpeicherfehler('nur eine eigene nachricht kann bearbeitet werden.')
      }
      const bearbeitet: EniZeile = { ...ziel, text }
      alle[chatId] = [...bisher.slice(0, stelle), bearbeitet]
      schreibeRoh(NACHRICHTEN_KEY, alle)
      const jetzt = new Date().toISOString()
      schreibeRoh(
        CHATS_KEY,
        lies<EniChat[]>(CHATS_KEY, []).map((chat) =>
          chat.id === chatId ? { ...chat, zuletzt: jetzt } : chat
        )
      )
      return bearbeitet
    },
    async loesche(chatId) {
      schreibeRoh(CHATS_KEY, lies<EniChat[]>(CHATS_KEY, []).filter((chat) => chat.id !== chatId))
      const alle = alleNachrichten()
      delete alle[chatId]
      schreibeRoh(NACHRICHTEN_KEY, alle)
    },
    async duellStand() {
      try {
        const zeit = duellZeitraum()
        const quellen = lokalePunktquellen()
        const tafel = tafelAusZeilen(
          {
            einheiten: quellen.einheiten.map((einheit) => ({
              user_id: einheit.user,
              bereich: einheit.area,
              tag: einheit.tag,
            })),
            aufenthalte: quellen.aufenthalte.map((aufenthalt) => ({
              user_id: aufenthalt.user,
              bereich: aufenthalt.bereich,
              ankunft: aufenthalt.ankunft,
              abgang: aufenthalt.abgang,
            })),
            // der schluessel eines gewichts ist `person|tag`, ein tag je zeile
            gewicht: Object.keys(quellen.gewichte).map((schluessel) => {
              const [user, tag] = schluessel.split('|')
              return { user_id: user, tag }
            }),
          },
          // ohne konten ist die person schon der schluessel
          (id) => (id === 'erijon' || id === 'koray' ? String(id) : null),
          toKey,
          zeit.montag,
          zeit.heute
        )
        return baueDuellKontext(me, tafel)
      } catch {
        return null
      }
    },
  }
}

function neueId(): string {
  return crypto.randomUUID()
}
