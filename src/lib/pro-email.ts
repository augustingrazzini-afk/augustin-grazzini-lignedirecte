/**
 * Adresse professionnelle : celle d'une entreprise, pas d'une messagerie grand public ni d'une adresse jetable.
 * Utilisé à l'inscription d'une entreprise (pas pour les commerciaux invités, qui peuvent être freelances).
 */
const FREE = new Set([
  // Internationales
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.fr", "mail.com", "zoho.com", "yandex.com", "tutanota.com", "tuta.io", "hey.com",
  // Fournisseurs d'accès français
  "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr", "laposte.net", "numericable.fr", "club-internet.fr", "aliceadsl.fr", "cegetel.net", "9online.fr", "voila.fr", "noos.fr",
  // Jetables
  "yopmail.com", "yopmail.fr", "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "trashmail.com", "sharklasers.com", "getnada.com", "maildrop.cc", "dispostable.com", "throwawaymail.com", "mohmal.com",
]);

export const emailDomain = (email: string) => email.trim().toLowerCase().split("@")[1] || "";

/** Messagerie personnelle ou jetable (Gmail, Outlook, Orange, Yopmail…). */
export const isPersonalEmail = (email: string) => FREE.has(emailDomain(email));

export const PRO_EMAIL_MESSAGE = "Utilisez l'adresse email de votre entreprise (prenom@votre-entreprise.fr). Les adresses personnelles comme Gmail, Outlook ou Orange ne sont pas acceptées.";
