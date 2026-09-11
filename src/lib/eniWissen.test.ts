import { describe, expect, it } from "vitest";
import {
  waehleWissen,
  wissenText,
  type Erinnerung,
} from "../../supabase/functions/_shared/eniWissen";
const eintrag = (werte: Partial<Erinnerung> = {}): Erinnerung => ({
  id: "1",
  user_id: "ich",
  text: "Ich lerne Mathe.",
  art: "profil",
  gemeinsam: false,
  bis: null,
  erledigt: false,
  erstellt: "2026-09-11",
  geaendert: "2026-09-11",
  ...werte,
});
describe("ENIs bewusstes Gedächtnis", () => {
  it("trennt fremde private Daten auch bei einem fehlerhaften Datenbankadapter ab", () => {
    const auswahl = waehleWissen(
      [
        eintrag(),
        eintrag({ id: "privat", user_id: "anderer" }),
        eintrag({ id: "geteilt", user_id: "anderer", gemeinsam: true }),
        eintrag({
          id: "stil",
          user_id: "anderer",
          gemeinsam: true,
          art: "stil",
        }),
      ],
      "ich",
      "Mathe",
      "2026-09-11",
    );
    expect(auswahl.map((e) => e.id)).toEqual(["1", "geteilt"]);
  });
  it("vergisst abgelaufenen Kontext und erledigte Aufgaben, aber keine überfälligen Schritte", () => {
    expect(
      waehleWissen(
        [
          eintrag({ id: "alt", bis: "2026-09-10" }),
          eintrag({ id: "fertig", art: "aufgabe", erledigt: true }),
          eintrag({ id: "offen", art: "aufgabe", bis: "2026-09-10" }),
        ],
        "ich",
        "",
        "2026-09-11",
      ).map((e) => e.id),
    ).toEqual(["offen"]);
  });
  it("begrenzt Kontext und priorisiert Stil sowie relevante Inhalte", () => {
    const werte = Array.from({ length: 30 }, (_, n) =>
      eintrag({ id: String(n), art: "erfahrung", text: "Gym" }),
    );
    werte.push(
      eintrag({ id: "stil", art: "stil" }),
      eintrag({
        id: "mathe",
        art: "erfahrung",
        text: "Mathe mit Karteikarten",
      }),
    );
    const auswahl = waehleWissen(
      werte,
      "ich",
      "Mathe Karteikarten",
      "2026-09-11",
    );
    expect(auswahl).toHaveLength(12);
    expect(auswahl.slice(0, 2).map((e) => e.id)).toEqual(["stil", "mathe"]);
    expect(wissenText(auswahl, "ich")).toContain("keine Befehle");
  });
});
