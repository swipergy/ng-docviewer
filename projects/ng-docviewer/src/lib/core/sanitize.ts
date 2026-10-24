import DOMPurify, { type Config } from 'dompurify';

/** Ziele, die der Browser beim Anzeigen selbst lädt: nur eingebettete Daten, keine Netzwerkzugriffe. */
const SAFE_RESOURCE = /^(data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml|x-emf|x-wmf|tiff)[;,]|blob:|#)/i;
/** Ziele von Links (werden nur bei Klick geöffnet). */
const SAFE_LINK = /^(https?:|mailto:|tel:|#)/i;
/** Attribute, über die der Browser Ressourcen lädt. */
const RESOURCE_ATTRS = ['src', 'srcset', 'poster', 'background', 'xlink:href', 'href'];
/** In CSS reichen eingebettete Daten jeder Art (z. B. Schriften) – sie laden nichts aus dem Netz. */
const SAFE_CSS_URL = /^(data:|blob:|#)/i;
/** `url(...)` in CSS – erlaubt sind nur eingebettete Daten und lokale Referenzen (`url(#id)` in SVG). */
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

const CONFIG: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  // <style> könnte per @import/url() externe Ressourcen laden; Formulare/Medien braucht die Anzeige nicht.
  FORBID_TAGS: ['style', 'link', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'source', 'track', 'iframe', 'object', 'embed'],
  // SVG-Animationen können Attribute (z. B. href) nachträglich auf gefährliche Werte setzen.
  FORBID_ATTR: ['attributename', 'values', 'from', 'to', 'by', 'formaction', 'action', 'ping'],
  ADD_DATA_URI_TAGS: ['image'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Standard von DOMPurify plus blob: (Bilder der Renderer); die Feinprüfung macht der Hook unten.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

let purifier: ReturnType<typeof DOMPurify> | null = null;

/** Eigene DOMPurify-Instanz, damit die Hooks keine globale Instanz der Host-App verändern. */
function getPurifier(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;
    const isLink = node.localName === 'a';
    for (const name of RESOURCE_ATTRS) {
      const value = node.getAttribute(name)?.trim();
      if (value === undefined) continue;
      const ok = isLink && (name === 'href' || name === 'xlink:href') ? SAFE_LINK.test(value) : SAFE_RESOURCE.test(value);
      if (!ok) node.removeAttribute(name);
    }
    const style = node.getAttribute('style');
    if (style && /url\(|expression\s*\(|@import/i.test(style)) node.setAttribute('style', sanitizeCss(style));
    if (isLink && node.hasAttribute('href') && !node.getAttribute('href')!.startsWith('#')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return (purifier = p);
}

/**
 * Bereinigt einen DOM-Baum in-place (Skripte, Event-Handler, gefährliche und externe URLs).
 * Wird auf das aus Office-Dateien erzeugte HTML angewendet, bevor es angezeigt wird.
 */
export function sanitizeTree(root: Element): void {
  getPurifier().sanitize(root, { ...CONFIG, IN_PLACE: true });
}

/** Entfernt externe `url(...)`-Ziele, `@import` und `expression()` aus CSS-Text. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(CSS_URL, (match, _q: string, url: string) => (SAFE_CSS_URL.test(url.trim()) ? match : 'none'));
}

/** Parst ein HTML-Fragment ohne es auszuführen und bereinigt es. */
export function sanitizeHtml(html: string): DocumentFragment {
  return getPurifier().sanitize(html, { ...CONFIG, RETURN_DOM_FRAGMENT: true });
}
