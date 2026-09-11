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
export async function ladeWissen(): Promise<Erinnerung[]> {
  const { data, error } = await db()
    .from("eni_erinnerungen")
    .select("*")
    .order("geaendert", { ascending: false })
    .limit(200);
  if (error)
    throw new Error(
      "Das Gedächtnis ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    );
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
