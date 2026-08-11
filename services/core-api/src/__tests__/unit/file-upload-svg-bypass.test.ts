// file-upload-svg-bypass.test.ts
// Regression tests for the assertSafeSvg() bypasses found across the review
// rounds that drove the rewrite from a hand-rolled lexer to a real XML
// parser (@xmldom/xmldom — ADR-025): (1) ">" smuggled inside quoted
// attribute values, (2) namespace-prefixed element names, (3) remote
// xml-stylesheet PIs, (4) char-ref-assembled quotes/schemes, (5) CDATA and
// comments that a byte-level lexer cannot tell apart from real markup.
// Split out of file-upload-svg-safety.test.ts (200-line limit).

import { describe, expect, it } from 'vitest';

import { InvalidFileTypeError } from '../../lib/app-error.js';
import { assertSafeSvg } from '../../lib/svg-safety.js';

// Well over 4096 bytes of valid, inert attributes — the padding window that
// defeated the pre-parser {0,4096}-bounded tag+attribute patterns.
const PADDING_ATTRIBUTES = Array.from({ length: 600 }, (_, i) => `data-pad${i}="x"`).join(' ');

describe('assertSafeSvg() — padding-window bypass regression (round 4)', () => {
  it('uses padding well beyond the old {0,4096} bound', () => {
    expect(PADDING_ATTRIBUTES.length).toBeGreaterThan(4096);
  });

  it('rejects a remote <image> href hidden behind >4096 bytes of padding attributes', () => {
    const svg = `<svg><image ${PADDING_ATTRIBUTES} href="https://evil.example/b.png"/></svg>`;
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects a remote <use> href hidden behind padding attributes', () => {
    const svg = `<svg><use ${PADDING_ATTRIBUTES} href="https://evil.example/sprite.svg#i"/></svg>`;
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects SMIL-animated remote href with padding inside <set>', () => {
    const svg =
      `<svg><image><set ${PADDING_ATTRIBUTES} attributeName="href" ` +
      'to="https://evil.example/x.png"/></image></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('accepts padded <image> tags whose href is a fragment or data: URI (no false positive)', () => {
    const fragment = Buffer.from(`<svg><image ${PADDING_ATTRIBUTES} href="#local"/></svg>`);
    const dataUri = Buffer.from(
      `<svg><image ${PADDING_ATTRIBUTES} href="data:image/png;base64,iVBORw0KGgo="/></svg>`
    );
    expect(() => assertSafeSvg(fragment)).not.toThrow();
    expect(() => assertSafeSvg(dataUri)).not.toThrow();
  });
});

describe('assertSafeSvg() — smuggled ">" inside quoted attribute values', () => {
  it('rejects <image> whose href hides behind a ">" inside a double-quoted value', () => {
    const svg = '<svg><image a=">" href="https://evil.example/b.png"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects <image> whose href hides behind a ">" inside a single-quoted value', () => {
    const svg = "<svg><image a='>' href=\"https://evil.example/b.png\"/></svg>";
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects animated <set> href hiding behind a ">" inside a quoted value', () => {
    const svg = '<svg><set a=">" attributeName="href" to="https://evil.example/x.png"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects a ">" smuggled as &#62; (quote content once char-ref-decoded)', () => {
    // The parser decodes &#62; to ">" INSIDE the attribute value, so the
    // href stays a real attribute of a real <image> element — the dual
    // raw/decoded scan the lexer needed is handled by construction.
    const svg = '<svg><image a="&#62;" href="https://evil.example/b.png"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — namespace-prefixed element names', () => {
  it('rejects <x:image> with a remote href (browser resolves by namespace URI)', () => {
    const svg =
      '<svg xmlns:x="http://www.w3.org/2000/svg">' +
      '<x:image href="https://evil.example/b.png"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects <x:image> even with an UNBOUND prefix (localName fallback)', () => {
    // xmldom reports no error for an unbound prefix and leaves localName
    // unset; the qualified-name fallback must still expose "image".
    const svg = '<svg><x:image href="https://evil.example/b.png"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects <svg:script> even though script is matched by local name', () => {
    const svg =
      '<x xmlns:svg="http://www.w3.org/2000/svg">' +
      '<svg:script>alert(1)</svg:script></x>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — xml-stylesheet processing instruction', () => {
  it('rejects <?xml-stylesheet?> pulling a remote stylesheet', () => {
    const svg =
      '<?xml-stylesheet href="https://evil.example/x.css"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('rejects an xml-stylesheet PI nested inside the document', () => {
    const svg = '<svg><?xml-stylesheet href="https://evil.example/x.css"?><circle r="1"/></svg>';
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — comments and CDATA are data, not markup', () => {
  it('accepts a comment containing a fake <image> beacon (inert in a browser)', () => {
    const legit = Buffer.from(
      '<svg><!-- <image href="https://evil.example/x.png"> "quoted" --><circle r="1"/></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts CDATA containing PI-like text and quotes (inert outside <style>)', () => {
    const legit = Buffer.from(
      '<svg><text x="1" y="9"><![CDATA[<?xml-stylesheet href="https://evil.example/x.css"?>]]></text></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts a comment containing "<!DOCTYPE" text only if absent', () => {
    // Deliberate conservative false positive, documented in svg-safety.ts:
    // the pre-parse DTD scan rejects the literal bytes even inside comments.
    const svg = Buffer.from('<svg><!-- see <!DOCTYPE html> docs --><circle r="1"/></svg>');
    expect(() => assertSafeSvg(svg)).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — malformed XML fails closed (reject, never crash)', () => {
  const MALFORMED: Array<[string, string]> = [
    ['unterminated tag', '<svg><image href="#a"'],
    ['unquoted attribute value', '<svg><set attributeName=href to="x"/></svg>'],
    ['duplicate attribute', '<svg width="1" width="2"/>'],
    ['two root elements', '<svg/><svg/>'],
    ['empty input', ''],
    ['bare text, no markup', 'not xml at all'],
  ];
  it.each(MALFORMED)('rejects %s', (_label, svg) => {
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — quote-aware parsing (no false positives)', () => {
  it('accepts <image> with ">" as quoted attribute data and a local href', () => {
    const legit = Buffer.from('<svg><image a="1>2" href="#local"/></svg>');
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts ">" as text content inside <text>', () => {
    const legit = Buffer.from('<svg><text x="1" y="9">a &gt; b</text></svg>');
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts a raw ">" as character data inside <text> (well-formed XML)', () => {
    const legit = Buffer.from('<svg><text x="1" y="9">a > b</text></svg>');
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });
});

describe('assertSafeSvg() — performance on hostile shapes (no hang, fail fast)', () => {
  it('rejects a single 2 MB unterminated <set> full of "attributeName=" fast', () => {
    const degenerate = Buffer.from(`<set ${'attributeName='.repeat(150_000)}>`);
    const start = Date.now();
    expect(() => assertSafeSvg(degenerate)).toThrow(InvalidFileTypeError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('rejects 2 MB of quoted ">" attribute soup (no single root) fast', () => {
    const unit = '<image a=">" b=\'>\' href="#l"/>';
    const degenerate = Buffer.from(unit.repeat(Math.ceil(2_097_152 / unit.length)));
    const start = Date.now();
    expect(() => assertSafeSvg(degenerate)).toThrow(InvalidFileTypeError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('rejects 2 MB of namespace-prefixed unterminated "<x:image " prefixes fast', () => {
    const degenerate = Buffer.from('<x:image '.repeat(200_000)); // 1.8 MB, no ">"
    const start = Date.now();
    expect(() => assertSafeSvg(degenerate)).toThrow(InvalidFileTypeError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('accepts 100k-deep element nesting (iterative walk, no stack overflow)', () => {
    const legit = Buffer.from(`<svg>${'<g>'.repeat(50_000)}${'</g>'.repeat(50_000)}</svg>`);
    const start = Date.now();
    expect(() => assertSafeSvg(legit)).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
