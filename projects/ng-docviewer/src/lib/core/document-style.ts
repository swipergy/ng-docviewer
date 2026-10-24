/**
 * Grundtypografie für Office-Inhalte – im Shadow-Root der Anzeige und in den iframes für Druck und
 * PDF identisch, damit Umbrüche überall gleich ausfallen. Setzt geerbte Werte der Host-App
 * (z. B. deren `line-height`) zurück; was das Dokument selbst festlegt, hat weiterhin Vorrang.
 */
export const DOCUMENT_TYPOGRAPHY = `
  /* Feste Zeilenhöhe statt normal: normal hängt von Schriftmetriken ab und rastert minimal anders. */
  font: 14px/1.2 system-ui, sans-serif;
  color: #000;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: start;
  text-indent: 0;
  text-transform: none;
  text-shadow: none;
  white-space: normal;
  font-variant: normal;
`;
