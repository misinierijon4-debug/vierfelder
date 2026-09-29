// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EniWissenDialog } from "./EniWissenDialog";
import type { Erinnerung, WissensEntwurf } from "../../lib/eniWissen";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
// nur das datum steht still, zeitgeber und animationen laufen normal
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const zeile: Erinnerung = {
  id: "1",
  user_id: "ich",
  text: "Mathe üben",
  art: "aufgabe",
  gemeinsam: false,
  bis: null,
  erledigt: false,
  erstellt: "2026-09-11",
  geaendert: "2026-09-11",
};
/** ein kleiner speicher, der sich merkt, was geschrieben wurde */
function api(start: Erinnerung[] = []) {
  let liste = start.map((e) => ({ ...e }));
  return {
    laden: vi.fn(async () => liste.map((e) => ({ ...e }))),
    speichern: vi.fn(
      async (
        _konto: string,
        entwurf: WissensEntwurf,
        id?: string,
        _version?: string,
      ) => {
        liste = id
          ? liste.map((e) =>
              e.id === id ? { ...e, ...entwurf, geaendert: "2026-09-29" } : e,
            )
          : [{ ...zeile, ...entwurf, id: `neu-${liste.length}` }, ...liste];
      },
    ),
    loeschen: vi.fn(async (_konto: string, id: string) => {
      liste = liste.filter((e) => e.id !== id);
    }),
  };
}
async function zeige(
  dienst: ReturnType<typeof api>,
  weiter: Partial<Parameters<typeof EniWissenDialog>[0]> = {},
) {
  await act(async () => {
    render(
      <EniWissenDialog
        offen
        kontoId="ich"
        me="erijon"
        api={dienst}
        onSchliessen={() => {}}
        {...weiter}
      />,
    );
  });
}
async function klick(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}
describe("Das weiß ENI über mich", () => {
  it("speichert einen Chatentwurf erst nach ausdrücklicher Bestätigung und standardmäßig privat", async () => {
    const dienst = api();
    await zeige(dienst, { start: { text: "Mein Ziel", art: "profil" } });
    expect(dienst.speichern).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Mein Ziel");
    expect(
      screen.getByRole("checkbox", { name: /mit koray teilen/ }),
    ).not.toBeChecked();
    await klick(screen.getByRole("button", { name: "merken" }));
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.objectContaining({ text: "Mein Ziel", gemeinsam: false }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("gemerkt");
    expect(screen.getByText("Mein Ziel")).toBeInTheDocument();
  });

  it("zeigt fremde Freigaben ohne Bearbeitung, löscht ohne Umweg und holt zurück", async () => {
    const dienst = api([
      zeile,
      {
        ...zeile,
        id: "2",
        art: "profil",
        user_id: "anderer",
        gemeinsam: true,
        text: "Geteiltes Ziel",
      },
    ]);
    await zeige(dienst);
    const fremd = screen.getByText("Geteiltes Ziel").closest("li")!;
    expect(within(fremd).queryByRole("button")).toBeNull();
    expect(fremd).toHaveTextContent("von koray");

    await klick(screen.getByRole("button", { name: "bearbeiten: Mathe üben" }));
    await klick(screen.getByRole("button", { name: "löschen" }));
    expect(dienst.loeschen).toHaveBeenCalledWith("ich", "1");
    expect(screen.queryByText("Mathe üben")).toBeNull();

    await klick(screen.getByRole("button", { name: "rückgängig" }));
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.objectContaining({ text: "Mathe üben", art: "aufgabe" }),
    );
    expect(screen.getByText("Mathe üben")).toBeInTheDocument();
  });

  it("übergibt bei Änderungen die gelesene Version und behält Eingaben bei Fehlern", async () => {
    const dienst = api([zeile]);
    dienst.speichern.mockRejectedValueOnce(new Error("Inzwischen geändert"));
    await zeige(dienst);
    await klick(screen.getByRole("button", { name: "bearbeiten: Mathe üben" }));
    await klick(screen.getByRole("button", { name: "speichern" }));
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.anything(),
      "1",
      "2026-09-11",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Inzwischen geändert");
    expect(screen.getByRole("textbox")).toHaveValue("Mathe üben");
  });

  it("hakt einen Schritt mit einem Tipp ab und lässt ihn an seinem Platz stehen", async () => {
    const dienst = api([zeile]);
    await zeige(dienst);
    const marke = screen.getByRole("checkbox", { name: "erledigt: Mathe üben" });
    await klick(marke);
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.objectContaining({ erledigt: true }),
      "1",
      "2026-09-11",
    );
    expect(
      screen.getByRole("checkbox", { name: "erledigt: Mathe üben" }),
    ).toBeChecked();
    expect(screen.queryByRole("button", { name: /ruht/ })).toBeNull();
    expect(screen.getByRole("button", { name: "mein nächster schritt: 0" })).toBeInTheDocument();
  });

  it("nimmt einen gescheiterten Haken zurück", async () => {
    const dienst = api([zeile]);
    dienst.speichern.mockRejectedValueOnce(new Error("Nicht gespeichert."));
    await zeige(dienst);
    await klick(screen.getByRole("checkbox", { name: "erledigt: Mathe üben" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nicht gespeichert.");
    expect(
      screen.getByRole("checkbox", { name: "erledigt: Mathe üben" }),
    ).not.toBeChecked();
  });

  it("legt Abgelaufenes unter „ruht“, zählt es nicht mit und filtert über die Tafel", async () => {
    const dienst = api([
      { ...zeile, id: "a", art: "profil", text: "Abi 2027" },
      {
        ...zeile,
        id: "b",
        art: "aktuell",
        bis: "2026-09-14",
        text: "Urlaub in Kroatien",
      },
    ]);
    await zeige(dienst);
    expect(screen.getByRole("button", { name: "über mich: 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gerade aktuell: 0" })).toBeInTheDocument();
    expect(screen.queryByText("Urlaub in Kroatien")).toBeNull();

    await klick(screen.getByRole("button", { name: /ruht/ }));
    expect(screen.getByText("Urlaub in Kroatien")).toBeInTheDocument();
    expect(screen.getByText(/abgelaufen mo 14\.09\./)).toBeInTheDocument();

    await klick(screen.getByRole("button", { name: "gerade aktuell: 0" }));
    expect(screen.getByRole("button", { name: "gerade aktuell: 0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Abi 2027")).toBeNull();
    expect(screen.getByText("noch nichts in diesem bereich.")).toBeInTheDocument();
  });

  it("setzt ein Enddatum mit einem Tipp, in lokaler Zeit", async () => {
    const dienst = api();
    await zeige(dienst, { start: { text: "Klausurphase", art: "aktuell" } });
    await klick(screen.getByRole("radio", { name: "bis sonntag" }));
    await klick(screen.getByRole("button", { name: "merken" }));
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.objectContaining({ art: "aktuell", bis: "2026-10-04" }),
    );
  });

  it("bietet ohne Einträge Anfänge an, der Ton bleibt privat", async () => {
    const dienst = api();
    await zeige(dienst);
    expect(screen.getByText("ENI weiß noch nichts über dich.")).toBeInTheDocument();
    await klick(screen.getByRole("button", { name: /wie ENI mit dir reden soll/ }));
    expect(
      screen.getByRole("radio", { name: "so spricht eni mit mir" }),
    ).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /teilen/ })).toBeNull();
  });

  it("schließt mit Esc erst die Bearbeitung, dann das Blatt", async () => {
    const schliessen = vi.fn();
    const dienst = api([zeile]);
    await zeige(dienst, { onSchliessen: schliessen });
    await klick(screen.getByRole("button", { name: "bearbeiten: Mathe üben" }));
    const esc = () =>
      act(async () => {
        document
          .querySelector("dialog")!
          .dispatchEvent(new Event("cancel", { cancelable: true }));
      });
    await esc();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(schliessen).not.toHaveBeenCalled();
    await esc();
    expect(schliessen).toHaveBeenCalledTimes(1);
  });
});
