import { sanitizeCss, sanitizeHtml, sanitizeTree } from './sanitize';

describe('sanitizeHtml', () => {
  const html = (frag: DocumentFragment) => {
    const div = document.createElement('div');
    div.appendChild(frag);
    return div;
  };

  it('entfernt Skripte, iframes und Event-Handler', () => {
    const div = html(sanitizeHtml('<p onclick="x()">a<script>alert(1)</script><iframe src="https://x"></iframe><img src="data:image/png;base64,AA" onerror="x()"></p>'));
    expect(div.querySelector('script, iframe')).toBeNull();
    expect(div.querySelector('p')!.hasAttribute('onclick')).toBe(false);
    expect(div.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AA');
    expect(div.querySelector('img')!.hasAttribute('onerror')).toBe(false);
  });

  it('entfernt gefährliche URLs und sichert externe Links ab', () => {
    const div = html(sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="https://swipergy.com">y</a><a href="#s2">z</a><img src="data:text/html,<b>">'));
    const [bad, ext, anchor] = Array.from(div.querySelectorAll('a'));
    expect(bad.hasAttribute('href')).toBe(false);
    expect(ext.getAttribute('target')).toBe('_blank');
    expect(ext.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor.hasAttribute('target')).toBe(false);
    expect(div.querySelector('img')!.hasAttribute('src')).toBe(false);
  });

  it('entfernt javascript:-URLs in Styles', () => {
    const div = html(sanitizeHtml(`<div style="background:url('javascript:alert(1)')">x</div><div style="color:red">y</div>`));
    const [a, b] = Array.from(div.querySelectorAll('div'));
    expect(a.getAttribute('style') ?? '').not.toContain('javascript');
    expect(b.getAttribute('style')).toBe('color:red');
  });

  it('blockiert externe Ressourcen (keine Tracking-Pixel), Links bleiben', () => {
    const div = html(
      sanitizeHtml(
        `<img src="https://tracker.example/p.gif"><img src="blob:x"><div style="background:url(https://t.example/a.png); color:red">a</div>` +
          `<div style="background:url('data:image/png;base64,AA')">b</div><svg><image href="https://t.example/x.png"/><path d="M0 0" marker-end="url(#m1)"/></svg><a href="https://swipergy.com">c</a>`,
      ),
    );
    const [ext, blob] = Array.from(div.querySelectorAll('img'));
    expect(ext.hasAttribute('src')).toBe(false);
    expect(blob.getAttribute('src')).toBe('blob:x');
    const [a, b] = Array.from(div.querySelectorAll('div'));
    expect(a.getAttribute('style')).not.toContain('t.example');
    expect(a.getAttribute('style')).toContain('color:red');
    expect(b.getAttribute('style')).toContain('data:image/png');
    expect(div.querySelector('image')!.hasAttribute('href')).toBe(false);
    expect(div.querySelector('path')!.getAttribute('marker-end')).toBe('url(#m1)');
    expect(div.querySelector('a')!.getAttribute('href')).toBe('https://swipergy.com');
  });

  it('entfernt Styles, Formulare und SVG-Animationen', () => {
    const div = html(
      sanitizeHtml(
        `<style>@import url(https://x)</style><form><input></form>` +
          `<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a><set attributeName="onload" to="alert(1)"/></svg>`,
      ),
    );
    expect(div.querySelector('style, form, input')).toBeNull();
    for (const el of Array.from(div.querySelectorAll('animate, set'))) {
      expect(el.hasAttribute('values') || el.hasAttribute('to') || el.hasAttribute('attributeName')).toBe(false);
    }
  });

  it('bereinigt einen DOM-Baum in-place', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p onclick="x()">a</p><img src="http://x/y.png">';
    sanitizeTree(root);
    expect(root.querySelector('p')!.hasAttribute('onclick')).toBe(false);
    expect(root.querySelector('img')!.hasAttribute('src')).toBe(false);
  });
});

describe('sanitizeCss', () => {
  it('entfernt @import und externe url(), behält eingebettete Daten', () => {
    const css = sanitizeCss(`@import url(https://x/a.css); @font-face { src: url(data:font/woff2;base64,AA) } p { background: url("https://t/x.png") }`);
    expect(css).not.toContain('@import');
    expect(css).not.toContain('https://');
    expect(css).toContain('data:font/woff2');
  });
});
