// Headline language detection, on real headlines. Every string below was
// published — collected 2026-09-15 from the hunter's own logs and from Google
// News — because the failure this guards against lives in real wording: fighter
// names that read as another language, and short headlines with little to go on.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { foreignHeadlineLanguage } from "./language.js";

describe("foreignHeadlineLanguage", () => {
  // These reached the group untranslated: found through Google's English
  // edition, tagged "en", and so never offered to the translator.
  test("Spanish headlines are recognised as Spanish", () => {
    for (const headline of [
      "Un excampeón de la UFC alerta del peligro de la revancha entre Topuria y Gaethje",
      "¿Nuevo rival para Topuria? Usman Nurmagomedov, primo de Khabib",
      "Justin Gaethje explica el secreto para haber ganado a Topuria",
      "Dana White, sobre el futuro de Topuria: «Bendito problema»",
      "El equipo de Ilia Topuria frena el 'hype' sobre su regreso",
      "Topuria aprende a perder: la derrota que cambió su forma de entender la victoria",
    ]) {
      assert.equal(foreignHeadlineLanguage(headline), "es", headline);
    }
  });

  test("other Latin-script languages are named too, for the label", () => {
    assert.equal(foreignHeadlineLanguage("Ilia Topuria : son manager fait une annonce"), "fr");
    assert.equal(
      foreignHeadlineLanguage("Joe Rogan alerta Ilia Topuria sobre retorno precoce após nocaute no UFC Casa Branca"),
      "pt"
    );
  });

  // Name-heavy English is the hard case: unconstrained, the detector called
  // these Tagalog, Dutch and Slovenian.
  test("English headlines, name-heavy ones included, are not foreign", () => {
    for (const headline of [
      "Ilia Topuria's manager hints at Justin Gaethje fight",
      "Eddie Alvarez: Justin Gaethje vs. Ilia Topuria rematch is a mistake",
      "UFC Discussing Justin Gaethje vs. Ilia Topuria 2",
      "Joel Alvarez vs. Yaroslav Amosov Set for UFC 328",
      "Full Fight | Arman Tsarukyan vs Dan Hooker",
      "Belal Muhammad: Ilia Topuria quit vs. Justin Gaethje, doesn't deserve rematch",
      "Paddy Pimblett responds to rumored December Ilia Topuria fight",
    ]) {
      assert.equal(foreignHeadlineLanguage(headline), null, headline);
    }
  });

  // Short Ukrainian reads as Russian, so Cyrillic is left to the edition.
  test("Cyrillic headlines are never flagged", () => {
    assert.equal(foreignHeadlineLanguage("Донченко та Соріано провели битву поглядів"), null);
    assert.equal(foreignHeadlineLanguage("Амосов повернеться в UFC"), null);
  });

  test("a bare name or an empty headline says nothing", () => {
    assert.equal(foreignHeadlineLanguage("Yaroslav Amosov"), null);
    assert.equal(foreignHeadlineLanguage(""), null);
  });
});
