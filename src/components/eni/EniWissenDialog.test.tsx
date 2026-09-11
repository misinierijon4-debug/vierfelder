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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EniWissenDialog } from "./EniWissenDialog";
import type { Erinnerung } from "../../lib/eniWissen";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
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
function api(liste: Erinnerung[] = []) {
  return {
    laden: vi.fn(async () => liste),
    speichern: vi.fn(async () => {}),
    loeschen: vi.fn(async () => {}),
  };
}
describe("Das weiß ENI über mich", () => {
  it("speichert einen Chatentwurf erst nach ausdrücklicher Bestätigung und standardmäßig privat", async () => {
    const dienst = api();
    await act(async () => {
      render(
        <EniWissenDialog
          offen
          kontoId="ich"
          api={dienst}
          start={{ text: "Mein Ziel", art: "profil" }}
          onSchliessen={() => {}}
        />,
      );
    });
    expect(dienst.speichern).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Bewusst speichern" }),
      );
    });
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.objectContaining({ text: "Mein Ziel", gemeinsam: false }),
      undefined,
      undefined,
    );
  });
  it("zeigt fremde Freigaben ohne Bearbeitung und bestätigt Löschungen", async () => {
    const dienst = api([
      zeile,
      {
        ...zeile,
        id: "2",
        user_id: "anderer",
        gemeinsam: true,
        text: "Geteiltes Ziel",
      },
    ]);
    await act(async () => {
      render(
        <EniWissenDialog
          offen
          kontoId="ich"
          api={dienst}
          onSchliessen={() => {}}
        />,
      );
    });
    const fremd = screen.getByText("Geteiltes Ziel").closest("li")!;
    expect(within(fremd).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(dienst.loeschen).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Endgültig löschen" }),
      );
    });
    expect(dienst.loeschen).toHaveBeenCalledWith("ich", "1");
  });
  it("übergibt bei Änderungen die gelesene Version und behält Eingaben bei Fehlern", async () => {
    const dienst = api([zeile]);
    dienst.speichern.mockRejectedValueOnce(new Error("Inzwischen geändert"));
    await act(async () => {
      render(
        <EniWissenDialog
          offen
          kontoId="ich"
          api={dienst}
          onSchliessen={() => {}}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Bewusst speichern" }),
      );
    });
    expect(dienst.speichern).toHaveBeenCalledWith(
      "ich",
      expect.anything(),
      "1",
      "2026-09-11",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Inzwischen geändert");
    expect(screen.getByRole("textbox")).toHaveValue("Mathe üben");
  });
});
