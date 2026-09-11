import { useCallback, useEffect, useRef, useState } from "react";
import {
  ladeWissen,
  loescheWissen,
  speichereWissen,
  WISSENS_ARTEN,
} from "../../lib/eniWissen";
import type { Erinnerung, WissensEntwurf } from "../../lib/eniWissen";
import { useScrollSperre } from "../../lib/scrollsperre";
import { IconX } from "./EniSymbole";

const LEER: WissensEntwurf = {
  text: "",
  art: "profil",
  gemeinsam: false,
  bis: null,
  erledigt: false,
};
const FELD =
  "min-h-11 w-full border border-linie bg-grund px-3 py-2 text-base text-kreide";
const KNOPF =
  "min-h-11 px-3 text-sm underline underline-offset-4 disabled:opacity-40";
const API = {
  laden: ladeWissen,
  speichern: speichereWissen,
  loeschen: loescheWissen,
};
type Props = {
  offen: boolean;
  kontoId: string | null;
  start?: { text: string; art: Erinnerung["art"] };
  onSchliessen: () => void;
  api?: typeof API;
};

export function EniWissenDialog({
  offen,
  kontoId,
  start,
  onSchliessen,
  api = API,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [liste, setListe] = useState<Erinnerung[]>([]);
  const [entwurf, setEntwurf] = useState<WissensEntwurf>(LEER);
  const [bearbeitet, setBearbeitet] = useState<Erinnerung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const ladeNr = useRef(0);
  const [loeschen, setLoeschen] = useState<string | null>(null);
  useScrollSperre(offen);

  const laden = useCallback(async () => {
    const nr = ++ladeNr.current;
    setLaedt(true);
    setFehler(null);
    try {
      const neu = await api.laden();
      if (nr === ladeNr.current) setListe(neu);
    } catch (e) {
      if (nr === ladeNr.current) setFehler((e as Error).message);
    } finally {
      if (nr === ladeNr.current) setLaedt(false);
    }
  }, [api]);

  useEffect(() => {
    if (offen) {
      dialog.current?.showModal();
      setListe([]);
      setEntwurf({ ...LEER, ...start });
      setBearbeitet(null);
      setLoeschen(null);
      setStatus("");
      if (kontoId) void laden();
    } else dialog.current?.close();
    return () => {
      ladeNr.current++;
    };
  }, [offen, kontoId, start, laden]);

  async function aendere(arbeit: () => Promise<void>, meldung: string) {
    if (arbeitet) return;
    setArbeitet(true);
    setFehler(null);
    try {
      await arbeit();
      setStatus(meldung);
      await laden();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setArbeitet(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Das weiß ENI über mich"
      onCancel={(e) => {
        e.preventDefault();
        if (!arbeitet) onSchliessen();
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-grund p-0 text-kreide backdrop:bg-grund/80"
    >
      {offen && (
        <div className="vollbild-safe-x flex h-full flex-col pb-[calc(var(--app-safe-bottom)+1rem)] pt-[calc(var(--app-safe-top)+1rem)]">
          <header className="mx-auto flex w-full max-w-[560px] items-center justify-between border-b border-linie pb-3">
            <h2 className="display text-lg font-bold">
              Das weiß ENI über mich
            </h2>
            <button
              className="flex size-11 shrink-0 items-center justify-center"
              aria-label="Gedächtnis schließen"
              disabled={arbeitet}
              onClick={onSchliessen}
            >
              <IconX size={18} />
            </button>
          </header>
          <div className="mx-auto w-full max-w-[560px] min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-4">
            <p className="text-sm text-kreide-60">
              Du bestimmst, was ENI in späteren Chats berücksichtigen darf.
              Privat, solange du einen Eintrag nicht ausdrücklich teilst.
              Passende Einträge gehen mit deiner Frage an das gewählte Modell.
              Änderungen gelten für künftige Antworten; bereits geschriebene
              Chats bleiben bestehen.
            </p>
            {!kontoId ? (
              <p role="status">
                Melde dich an, um dein persönliches Gedächtnis zu nutzen.
              </p>
            ) : (
              <>
                <form
                  className="space-y-3 border-b border-linie pb-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void aendere(async () => {
                      await api.speichern(
                        kontoId,
                        entwurf,
                        bearbeitet?.id,
                        bearbeitet?.geaendert,
                      );
                      setEntwurf(LEER);
                      setBearbeitet(null);
                    }, "Gespeichert. ENI kann den Eintrag ab deiner nächsten Frage berücksichtigen.");
                  }}
                >
                  <h3 className="text-base font-semibold">
                    {bearbeitet ? "Eintrag bearbeiten" : "Was soll ENI wissen?"}
                  </h3>
                  <label className="block space-y-1 text-sm">
                    Bereich
                    <select
                      className={FELD}
                      value={entwurf.art}
                      disabled={arbeitet}
                      onChange={(e) =>
                        setEntwurf({
                          ...entwurf,
                          art: e.target.value as Erinnerung["art"],
                          gemeinsam:
                            e.target.value === "stil"
                              ? false
                              : entwurf.gemeinsam,
                        })
                      }
                    >
                      {Object.entries(WISSENS_ARTEN).map(([key, text]) => (
                        <option key={key} value={key}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1 text-sm">
                    Deine Angabe
                    <textarea
                      className={`${FELD} min-h-28`}
                      required
                      maxLength={1000}
                      value={entwurf.text}
                      disabled={arbeitet}
                      onChange={(e) =>
                        setEntwurf({ ...entwurf, text: e.target.value })
                      }
                      placeholder={
                        entwurf.art === "stil"
                          ? "Zum Beispiel: Direkt, aber bei persönlichen Sorgen erst zuhören. Erklärungen mit Beispielen."
                          : entwurf.art === "aufgabe"
                            ? "Zum Beispiel: Am Montag 20 Minuten Matheaufgaben üben."
                            : "Mein Ziel ist … Im Alltag hilft mir … Gerade beschäftigt mich …"
                      }
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    {entwurf.art === "aufgabe"
                      ? "Fällig am (optional)"
                      : "Gültig bis (optional)"}
                    <input
                      className={FELD}
                      type="date"
                      value={entwurf.bis ?? ""}
                      disabled={arbeitet}
                      onChange={(e) =>
                        setEntwurf({ ...entwurf, bis: e.target.value || null })
                      }
                    />
                  </label>
                  {entwurf.art !== "stil" && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-5 shrink-0"
                        checked={entwurf.gemeinsam}
                        disabled={arbeitet}
                        onChange={(e) =>
                          setEntwurf({
                            ...entwurf,
                            gemeinsam: e.target.checked,
                          })
                        }
                      />
                      Für uns beide freigeben. Dein Duellpartner und sein ENI
                      können diesen Eintrag lesen.
                    </label>
                  )}
                  {entwurf.art === "aufgabe" && (
                    <p className="text-sm text-kreide-60">
                      Wird als Aufgabe gespeichert. Es wird keine
                      Benachrichtigung versendet und kein Trackerpunkt
                      eingetragen.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="min-h-11 bg-kreide px-4 text-sm font-semibold text-grund disabled:opacity-40"
                      disabled={arbeitet || !entwurf.text.trim()}
                    >
                      {arbeitet ? "Speichert …" : "Bewusst speichern"}
                    </button>
                    {bearbeitet && (
                      <button
                        type="button"
                        className={KNOPF}
                        disabled={arbeitet}
                        onClick={() => {
                          setBearbeitet(null);
                          setEntwurf(LEER);
                        }}
                      >
                        Bearbeitung verwerfen
                      </button>
                    )}
                  </div>
                </form>
                {fehler && (
                  <p role="alert" className="text-sm">
                    {fehler}
                  </p>
                )}
                {status && (
                  <p role="status" className="text-sm">
                    {status}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">
                    Deine Einträge und Freigaben
                  </h3>
                  <button
                    className={KNOPF}
                    disabled={laedt || arbeitet}
                    onClick={() => void laden()}
                  >
                    Neu laden
                  </button>
                </div>
                {laedt ? (
                  <p role="status">Lädt …</p>
                ) : liste.length === 0 ? (
                  <p className="text-sm text-kreide-60">
                    Noch keine Einträge. Beginne mit einem Ziel oder damit, wie
                    ENI mit dir sprechen soll.
                  </p>
                ) : (
                  <ul className="divide-y divide-linie">
                    {liste.map((eintrag) => (
                      <li key={eintrag.id} className="space-y-2 py-4">
                        <p className="text-xs text-kreide-60">
                          {WISSENS_ARTEN[eintrag.art]} ·{" "}
                          {eintrag.user_id !== kontoId
                            ? "Vom Duellpartner geteilt"
                            : eintrag.gemeinsam
                              ? "Für euch beide"
                              : "Nur für dich"}
                          {eintrag.erledigt ? " · Erledigt" : ""}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-base">
                          {eintrag.text}
                        </p>
                        <p className="text-xs text-kreide-60">
                          Stand:{" "}
                          {new Date(eintrag.geaendert).toLocaleDateString(
                            "de-DE",
                          )}
                          {eintrag.bis
                            ? ` · ${eintrag.art === "aufgabe" ? "Fällig" : "Gültig bis"}: ${eintrag.bis}`
                            : ""}
                        </p>
                        {eintrag.user_id === kontoId && (
                          <div className="flex flex-wrap gap-1">
                            <button
                              className={KNOPF}
                              disabled={arbeitet}
                              onClick={() => {
                                setBearbeitet(eintrag);
                                setEntwurf({
                                  text: eintrag.text,
                                  art: eintrag.art,
                                  gemeinsam: eintrag.gemeinsam,
                                  bis: eintrag.bis,
                                  erledigt: eintrag.erledigt,
                                });
                                dialog.current
                                  ?.querySelector("textarea")
                                  ?.focus();
                              }}
                            >
                              Bearbeiten
                            </button>
                            {eintrag.art === "aufgabe" && (
                              <button
                                className={KNOPF}
                                disabled={arbeitet}
                                onClick={() =>
                                  void aendere(
                                    () =>
                                      api.speichern(
                                        kontoId,
                                        {
                                          ...eintrag,
                                          erledigt: !eintrag.erledigt,
                                        },
                                        eintrag.id,
                                        eintrag.geaendert,
                                      ),
                                    eintrag.erledigt
                                      ? "Aufgabe wieder offen."
                                      : "Aufgabe erledigt.",
                                  )
                                }
                              >
                                {eintrag.erledigt
                                  ? "Wieder öffnen"
                                  : "Als erledigt markieren"}
                              </button>
                            )}
                            {loeschen === eintrag.id ? (
                              <>
                                <button
                                  className={KNOPF}
                                  disabled={arbeitet}
                                  onClick={() =>
                                    void aendere(
                                      () => api.loeschen(kontoId, eintrag.id),
                                      "Eintrag gelöscht. Bereits geschriebene Chats bleiben bestehen.",
                                    )
                                  }
                                >
                                  Endgültig löschen
                                </button>
                                <button
                                  className={KNOPF}
                                  onClick={() => setLoeschen(null)}
                                >
                                  Behalten
                                </button>
                              </>
                            ) : (
                              <button
                                className={KNOPF}
                                disabled={arbeitet}
                                onClick={() => setLoeschen(eintrag.id)}
                              >
                                Löschen
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
