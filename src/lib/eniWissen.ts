import { supabase } from "./supabase";
import type { Erinnerung } from "../../supabase/functions/_shared/eniWissen";
export type { Erinnerung };
export type WissensEntwurf = Pick<
  Erinnerung,
  "text" | "art" | "gemeinsam" | "bis" | "erledigt"
>;
export const WISSENS_ARTEN = {
  profil: "Über mich",
  aktuell: "Gerade aktuell",
  erfahrung: "Was funktioniert",
  stil: "So spricht ENI mit mir",
  aufgabe: "Mein nächster Schritt",
} as const;

function db() {
  if (!supabase)
    throw new Error("Das persönliche Gedächtnis braucht eine Anmeldung.");
  return supabase;
}
/**
 * Jeder Ladefehler sah gleich aus: „gerade nicht erreichbar, bitte spaeter".
 * Der Satz stimmte nur fuer den einen Fall, in dem er nie zutraf — das
 * Gedaechtnis war nicht kurz weg, seine Tabelle war in dieser Umgebung nie
 * angelegt worden, und „spaeter erneut versuchen" hat daran nie etwas geaendert.
 * Ein Fehler, der seine Ursache verschweigt, kostet genau die Zeit, die man
 * braucht, um sie ohne ihn zu finden.
 */
function ladefehler(code: string | undefined, meldung: string): string {
  // PGRST205: PostgREST kennt die Tabelle nicht. 42P01: PostgreSQL auch nicht.
  if (code === "PGRST205" || code === "42P01")
    return "Das Gedächtnis ist in dieser Umgebung noch nicht angelegt. Die Migration eni_gedaechtnis fehlt in der Datenbank.";
  if (code === "42501" || code === "PGRST301")
    return "Kein Zugriff auf das Gedächtnis. Melde dich neu an.";
  return `Das Gedächtnis ist gerade nicht erreichbar: ${meldung}`;
}

export async function ladeWissen(): Promise<Erinnerung[]> {
  const { data, error } = await db()
    .from("eni_erinnerungen")
    .select("*")
    .order("geaendert", { ascending: false })
    .limit(200);
  if (error) throw new Error(ladefehler(error.code, error.message));
  return data as Erinnerung[];
}
export async function speichereWissen(
  userId: string,
  entwurf: WissensEntwurf,
  id?: string,
  version?: string,
): Promise<void> {
  const text = entwurf.text.trim();
  if (!text || text.length > 1000)
    throw new Error("Bitte zwischen 1 und 1000 Zeichen eingeben.");
  const werte = {
    art: entwurf.art,
    bis: entwurf.bis,
    erledigt: entwurf.erledigt,
    text,
    gemeinsam: entwurf.art === "stil" ? false : entwurf.gemeinsam,
  };
  const anfrage = id
    ? db()
        .from("eni_erinnerungen")
        .update(werte)
        .eq("id", id)
        .eq("user_id", userId)
        .eq("geaendert", version ?? "")
    : db()
        .from("eni_erinnerungen")
        .insert({ ...werte, user_id: userId });
  const { data, error } = await anfrage.select("id");
  if (error) throw new Error("Nicht gespeichert. Bitte erneut versuchen.");
  if (!data?.length)
    throw new Error("Der Eintrag wurde inzwischen geändert. Bitte neu laden.");
}
/**
 * Legt eine Erinnerung an, die ENI vorgeschlagen und die Person auf der Karte
 * bestaetigt hat. Die Id ist fest (aus Nachricht und Stelle): ein zweiter Tipp,
 * ein zweites Geraet oder ein Neuladen legen nichts doppelt an. Doppelt heisst
 * hier nicht Fehler, sondern: ist schon da.
 */
export async function legeErinnerungAn(
  userId: string,
  id: string,
  entwurf: Pick<Erinnerung, "art" | "text" | "bis">,
): Promise<void> {
  const { error } = await db().from("eni_erinnerungen").insert({
    id,
    user_id: userId,
    art: entwurf.art,
    text: entwurf.text.trim(),
    bis: entwurf.bis,
    gemeinsam: false,
    erledigt: false,
  });
  // 23505: die feste id gibt es schon, die Erinnerung steht also im Gedaechtnis
  if (error && error.code !== "23505")
    throw new Error(ladefehler(error.code, error.message));
}
export async function loescheWissen(userId: string, id: string): Promise<void> {
  const { data, error } = await db()
    .from("eni_erinnerungen")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error || !data?.length)
    throw new Error("Nicht gelöscht. Bitte neu laden und erneut versuchen.");
}
