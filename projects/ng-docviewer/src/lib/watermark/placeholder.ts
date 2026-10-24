import { WatermarkContext } from './watermark.model';

/**
 * Ersetzt `{name}`-Platzhalter. Eingebaut: `{date}`, `{time}`, `{datetime}`.
 * Unbekannte Platzhalter bleiben unverändert stehen, damit Konfigurationsfehler sichtbar sind.
 */
export function resolvePlaceholders(template: string, context: WatermarkContext = {}, locale?: string, now = new Date()): string {
  const builtIns: WatermarkContext = {
    date: now.toLocaleDateString(locale),
    time: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    datetime: `${now.toLocaleDateString(locale)} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`,
  };
  const values = { ...builtIns, ...context };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}
