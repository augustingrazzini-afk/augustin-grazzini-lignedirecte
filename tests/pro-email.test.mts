import { test } from "node:test";
import assert from "node:assert/strict";

// Inscription réservée aux adresses professionnelles.
const { isPersonalEmail, emailDomain } = await import("../src/lib/pro-email");

test("adresses personnelles et jetables refusées", () => {
  for (const e of ["jean@gmail.com", "JEAN@Gmail.com ", "a@hotmail.fr", "a@outlook.com", "a@orange.fr", "a@wanadoo.fr", "a@free.fr", "a@laposte.net", "a@icloud.com", "a@proton.me", "a@yopmail.com"]) assert.equal(isPersonalEmail(e), true, e);
});

test("adresses d'entreprise acceptées", () => {
  for (const e of ["lea@atelier-morel.fr", "direction@solaris-energie.com", "a@gmail.entreprise.fr", "contact@free-energie.fr"]) assert.equal(isPersonalEmail(e), false, e);
  assert.equal(emailDomain(" Lea@Atelier-Morel.FR "), "atelier-morel.fr");
});
