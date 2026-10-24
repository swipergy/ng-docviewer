import { resolvePlaceholders } from './placeholder';

describe('resolvePlaceholders', () => {
  const now = new Date(2026, 9, 23, 14, 5);

  it('ersetzt eigene und eingebaute Platzhalter', () => {
    expect(resolvePlaceholders('{user} · {date} {time}', { user: 'max@firma.de' }, 'de-DE', now)).toBe('max@firma.de · 23.10.2026 14:05');
    expect(resolvePlaceholders('{datetime}', {}, 'de-DE', now)).toBe('23.10.2026 14:05');
  });

  it('erlaubt das Überschreiben eingebauter Werte und Zahlen', () => {
    expect(resolvePlaceholders('{date}/{id}', { date: 'heute', id: 42 }, 'de-DE', now)).toBe('heute/42');
  });

  it('lässt unbekannte Platzhalter stehen', () => {
    expect(resolvePlaceholders('{unbekannt} {user}', { user: undefined })).toBe('{unbekannt} {user}');
  });
});
