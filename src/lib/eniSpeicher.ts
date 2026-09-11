import { supabase } from './supabase'
import { raeumeChatDateien } from './eniAnhang'
import type { EniAnhang } from './eniAnhang'
import type { UserId } from './types'

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
  loesche: (chatId: string) => Promise<void>
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
      // zwei abfragen statt eines joins: der join haengte an jede nachricht die
      // spalten ihrer anhaenge, und `inhalt` einer textdatei sind bis zu 20000
      // zeichen. so kommt jede zeile genau einmal.
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

      // ein fehlgeschlagener anhang-abruf darf den chat nicht verschlucken:
      // die worte sind die hauptsache, die bilder haengen daran.
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

    async loesche(chatId) {
      const { error } = await klient.from('eni_chats').delete().eq('id', chatId)
      if (error) throw new EniSpeicherfehler('der chat wurde nicht gelöscht.', error)
      // die zeilen nimmt das cascade mit, die dateien im bucket nicht: der ist
      // keine tabelle. das hier ist der einzige ort, an dem noch bekannt ist,
      // welcher ordner zu diesem chat gehoerte.
      try {
        await raeumeChatDateien(kontoId, chatId)
      } catch {
        /* der chat ist weg. eine datei, auf die kein pfad mehr zeigt, ist kein
           grund, dem menschen zu sagen, das loeschen sei gescheitert. */
      }
    },
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
    async loesche(chatId) {
      schreibeRoh(CHATS_KEY, lies<EniChat[]>(CHATS_KEY, []).filter((chat) => chat.id !== chatId))
      const alle = alleNachrichten()
      delete alle[chatId]
      schreibeRoh(NACHRICHTEN_KEY, alle)
    },
  }
}

function neueId(): string {
  return crypto.randomUUID()
}
