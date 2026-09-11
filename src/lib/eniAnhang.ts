import { supabase } from './supabase'

/**
 * Was man ENI mitgibt, ausser Worten.
 *
 * Zwei Arten, und die Trennung faellt hier, auf dem Geraet, nicht auf dem
 * Server:
 *
 *   'bild'  wird auf 1280 Pixel heruntergerechnet und als JPEG in den Bucket
 *           gelegt. Das Modell sieht ein Bild ohnehin nur mit einem festen
 *           Tokenbetrag an; ein 12-Megapixel-Foto hochzuladen kostet Datenvolumen
 *           auf dem Telefon und bringt ENI kein Pixel mehr.
 *   'text'  wird gelesen und geht als Text mit. Eine .md oder .csv durch eine
 *           Bilderkennung zu schicken waere Unsinn: der Text steht schon da.
 *
 * Was hier nicht durchkommt, kommt nirgends durch. Die Grenze steht zusaetzlich
 * im Bucket und in der Edge Function, aber die erste und einzige, die dem
 * Menschen einen Satz sagen kann, ist diese.
 */

/** so viele anhaenge darf eine vorlage haben */
export const MAX_ANHAENGE = 4

/** laengste kante eines hochgeladenen bildes */
export const MAX_BILD_KANTE = 1280

/** so viel text nimmt ein dateianhang mit, der rest wird abgeschnitten */
export const MAX_TEXT_ZEICHEN = 20_000

/** groesser darf eine textdatei gar nicht erst sein, bevor sie gelesen wird */
export const MAX_TEXT_BYTE = 2 * 1024 * 1024

/** groesser darf ein bild nicht sein, bevor es heruntergerechnet wird */
export const MAX_BILD_BYTE = 25 * 1024 * 1024

const BILD_TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

/**
 * Endungen, hinter denen Text steht. Der MIME-Typ allein reicht nicht: Android
 * meldet fuer eine .md oder eine .ts gern `application/octet-stream`, und dann
 * waere eine Notiz nicht anhaengbar, obwohl sie nur Text ist.
 */
const TEXT_ENDUNGEN = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yml', 'yaml', 'xml', 'log',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'css', 'html', 'sql', 'py', 'sh', 'ini', 'toml', 'env',
]

export type AnhangArt = 'bild' | 'text'

/** ein anhang, wie er im verlauf steht */
export type EniAnhang = {
  id: string
  art: AnhangArt
  name: string
  /** bild: pfad im bucket */
  pfad?: string
  /** text: der ausgelesene inhalt */
  inhalt?: string
  groesse: number
}

/**
 * ein anhang, der noch nicht abgeschickt ist. `id` ist nur fuer React da,
 * `vorschau` eine object-URL, die beim entfernen wieder freigegeben wird.
 */
export type VorbereiteterAnhang = {
  id: string
  art: AnhangArt
  name: string
  groesse: number
  /** bild: was hochgeladen wird */
  blob?: Blob
  /** bild: object-URL fuer die vorschau im eingabefeld */
  vorschau?: string
  /** text: der gelesene inhalt */
  inhalt?: string
  /** ob beim lesen etwas abgeschnitten wurde */
  gekuerzt?: boolean
}

export class EniAnhangFehler extends Error {
  constructor(was: string) {
    super(was)
    this.name = 'EniAnhangFehler'
  }
}

function endung(name: string): string {
  const punkt = name.lastIndexOf('.')
  return punkt === -1 ? '' : name.slice(punkt + 1).toLowerCase()
}

/**
 * Was das hier ist. `null` heisst: nicht anhaengbar, und der Aufrufer sagt
 * warum.
 */
export function erkenneArt(typ: string, name: string): AnhangArt | null {
  const sauber = typ.split(';')[0]!.trim().toLowerCase()
  if (BILD_TYPEN.includes(sauber)) return 'bild'
  if (sauber.startsWith('text/')) return 'text'
  if (sauber === 'application/json' || sauber === 'application/xml') return 'text'
  // der typ hat nichts gesagt, also entscheidet die endung
  if (TEXT_ENDUNGEN.includes(endung(name))) return 'text'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(endung(name))) return 'bild'
  return null
}

/**
 * Die Zielmasse eines Bildes. Kleine Bilder bleiben, wie sie sind: ein
 * Screenshot vom Raster hochzurechnen macht ihn nicht lesbarer, nur groesser.
 */
export function zielmasse(
  breite: number,
  hoehe: number,
  kante = MAX_BILD_KANTE
): { breite: number; hoehe: number } {
  const laengste = Math.max(breite, hoehe)
  if (laengste <= kante || laengste === 0) return { breite, hoehe }
  const faktor = kante / laengste
  return {
    breite: Math.max(1, Math.round(breite * faktor)),
    hoehe: Math.max(1, Math.round(hoehe * faktor)),
  }
}

/**
 * Text auf das erlaubte Mass bringen. Der Schnitt wird hingeschrieben, statt
 * still zu passieren: ENI ueber eine halbe Tabelle urteilen zu lassen, ohne
 * dass jemand es weiss, waere genau die Sorte Selbstbetrug, gegen die er redet.
 */
export function kuerzeText(
  roh: string,
  grenze = MAX_TEXT_ZEICHEN
): { inhalt: string; gekuerzt: boolean } {
  // \r\n und einsame \r kosten platz und sagen nichts
  const sauber = roh.replace(/\r\n?/g, '\n')
  if (sauber.length <= grenze) return { inhalt: sauber, gekuerzt: false }
  return { inhalt: `${sauber.slice(0, grenze)}\n[… hier war die datei zu ende für ENI]`, gekuerzt: true }
}

/**
 * Der Pfad im Bucket. Der erste Ordner ist die user-id, daran haengt die
 * Policy; der zweite der Chat, damit ein geloeschter Chat einen Ordner hat, den
 * man wegraeumen kann. Immer .jpg, weil hier nur ankommt, was durch das Canvas
 * gegangen ist. Der urspruengliche Dateiname steht in der Zeile, nicht im
 * Pfad: er koennte alles enthalten, was ein Dateisystem hergibt.
 */
export function anhangPfad(userId: string, chatId: string): string {
  return `${userId}/${chatId}/${crypto.randomUUID()}.jpg`
}

/** byte, wie sie unter dem dateinamen stehen */
export function lesbareGroesse(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Ein Bild auf Mass bringen. Bewusst ueber `createImageBitmap` und ein Canvas
 * statt ueber eine Bibliothek: beides steht in jedem Browser, der diese App
 * ueberhaupt anzeigt, und das Bundle hier hat kein Kilobyte fuer eine
 * Bildbibliothek uebrig.
 *
 * Nebenwirkung mit Absicht: das Canvas wirft EXIF weg. Damit geht der
 * GPS-Punkt, an dem ein Foto entstanden ist, gar nicht erst auf die Reise.
 */
async function rechneBildHerunter(datei: File): Promise<Blob> {
  const bitmap = await createImageBitmap(datei)
  try {
    const mass = zielmasse(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = mass.breite
    canvas.height = mass.hoehe
    const stift = canvas.getContext('2d')
    if (!stift) throw new EniAnhangFehler('dieses gerät kann das bild nicht vorbereiten.')
    stift.drawImage(bitmap, 0, 0, mass.breite, mass.hoehe)

    const blob = await new Promise<Blob | null>((fertig) =>
      canvas.toBlob(fertig, 'image/jpeg', 0.82)
    )
    if (!blob) throw new EniAnhangFehler('das bild konnte nicht vorbereitet werden.')
    return blob
  } finally {
    bitmap.close()
  }
}

/**
 * Eine ausgewaehlte Datei zu einem Anhang machen. Wirft mit einem Satz, den man
 * jemandem zeigen kann, statt mit einem Code.
 */
export async function bereiteVor(datei: File): Promise<VorbereiteterAnhang> {
  const art = erkenneArt(datei.type, datei.name)
  if (!art) {
    throw new EniAnhangFehler(
      endung(datei.name) === 'pdf'
        ? 'ein pdf kann ENI nicht lesen. mach einen screenshot davon.'
        : 'das kann ENI nicht lesen. bilder und textdateien gehen.'
    )
  }

  if (art === 'text') {
    if (datei.size > MAX_TEXT_BYTE) {
      throw new EniAnhangFehler('die datei ist zu groß. bis zwei megabyte text gehen.')
    }
    const { inhalt, gekuerzt } = kuerzeText(await datei.text())
    if (inhalt.trim() === '') throw new EniAnhangFehler('die datei ist leer.')
    return {
      id: crypto.randomUUID(),
      art: 'text',
      name: datei.name,
      groesse: datei.size,
      inhalt,
      gekuerzt,
    }
  }

  if (datei.size > MAX_BILD_BYTE) {
    throw new EniAnhangFehler('das bild ist zu groß.')
  }
  const blob = await rechneBildHerunter(datei)
  return {
    id: crypto.randomUUID(),
    art: 'bild',
    name: datei.name,
    groesse: datei.size,
    blob,
    vorschau: URL.createObjectURL(blob),
  }
}

/** die vorschau eines entfernten anhangs wieder freigeben */
export function gibVorschauFrei(anhang: VorbereiteterAnhang) {
  if (anhang.vorschau) URL.revokeObjectURL(anhang.vorschau)
}

/**
 * Was die Edge Function ueber einen Anhang erfaehrt. Bewusst nicht der ganze
 * `VorbereiteterAnhang`: der Blob ist da schon hochgeladen, und die Vorschau
 * ist eine Adresse, die es nur in diesem Tab gibt.
 */
export type AnhangVorlage = {
  art: AnhangArt
  name: string
  pfad?: string
  inhalt?: string
  groesse: number
}

/**
 * Bilder in den Bucket legen und die Vorlagen bauen, die mit der Nachricht
 * gehen. Laeuft vor dem Aufruf der Function: was ENI zu sehen bekommt, liegt
 * dann schon, und ein abgebrochener Upload erzeugt keine halbe Nachricht.
 */
export async function ladeHoch(
  anhaenge: VorbereiteterAnhang[],
  userId: string,
  chatId: string
): Promise<AnhangVorlage[]> {
  const klient = supabase
  if (anhaenge.length === 0) return []
  if (!klient) throw new EniAnhangFehler('ohne konto gibt es keine anhänge.')

  return Promise.all(
    anhaenge.map(async (anhang): Promise<AnhangVorlage> => {
      if (anhang.art === 'text') {
        return {
          art: 'text',
          name: anhang.name,
          inhalt: anhang.inhalt ?? '',
          groesse: anhang.groesse,
        }
      }
      const pfad = anhangPfad(userId, chatId)
      const { error } = await klient.storage
        .from('eni-anhaenge')
        .upload(pfad, anhang.blob!, { contentType: 'image/jpeg', upsert: false })
      if (error) throw new EniAnhangFehler('das bild wurde nicht hochgeladen.')
      return { art: 'bild', name: anhang.name, pfad, groesse: anhang.groesse }
    })
  )
}

/**
 * Adressen, unter denen der Browser die Bilder eines Verlaufs anzeigen kann.
 * Der Bucket ist nicht oeffentlich, also braucht jedes Bild eine signierte
 * Adresse. Eine Stunde reicht fuer einen Chat, den man gerade liest, und ist
 * kurz genug, dass eine kopierte Adresse morgen nichts mehr hergibt.
 */
export async function bildAdressen(pfade: string[]): Promise<Map<string, string>> {
  const klient = supabase
  const adressen = new Map<string, string>()
  if (!klient || pfade.length === 0) return adressen

  const { data, error } = await klient.storage
    .from('eni-anhaenge')
    .createSignedUrls(pfade, 3600)
  if (error || !data) return adressen

  for (const eintrag of data) {
    if (eintrag.signedUrl && eintrag.path) adressen.set(eintrag.path, eintrag.signedUrl)
  }
  return adressen
}

/**
 * Die Bilddateien eines geloeschten Chats wegraeumen.
 *
 * Das kann kein `on delete cascade`: der Bucket ist keine Tabelle. Es laeuft
 * deshalb hier, direkt nach dem Loeschen des Chats, und es darf scheitern, ohne
 * dass der Mensch etwas davon merkt. Der Chat ist dann weg, die Zeilen sind
 * weg, und was liegen bleibt, ist eine Datei, die niemand mehr adressieren
 * kann, weil kein Pfad mehr auf sie zeigt.
 */
export async function raeumeChatDateien(userId: string, chatId: string): Promise<void> {
  const klient = supabase
  if (!klient) return
  const ordner = `${userId}/${chatId}`
  const { data } = await klient.storage.from('eni-anhaenge').list(ordner, { limit: 200 })
  const namen = (data ?? []).map((eintrag) => `${ordner}/${eintrag.name}`)
  if (namen.length > 0) await klient.storage.from('eni-anhaenge').remove(namen)
}
