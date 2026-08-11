// file-upload-svg-safety.test.ts
// Unit tests for assertSafeSvg() (lib/svg-safety.ts): the active-content
// scanner applied to SVG payloads, now built on a real XML parser
// (@xmldom/xmldom — ADR-025) instead of a hand-rolled lexer. Split out of
// file-upload-security.test.ts to keep both files under the 200-line limit.
// The namespace-prefix / smuggled-quote / xml-stylesheet / CDATA regressions
// and the malformed-XML fail-closed tests live in file-upload-svg-bypass.test.ts.

import { describe, expect, it } from 'vitest';

import { InvalidFileTypeError } from '../../lib/app-error.js';
import { assertSafeSvg } from '../../lib/svg-safety.js';

const LEGIT_SVG = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<circle cx="5" cy="5" r="4" fill="red"/></svg>'
);

// One malicious payload per detection rule.
const MALICIOUS_SVGS: Array<[string, string]> = [
  ['<script>', '<svg><script>alert(1)</script></svg>'],
  ['embedded content (iframe)', '<svg><iframe src="https://evil.example"></iframe></svg>'],
  [
    'animated href (<set>)',
    '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>',
  ],
  [
    'animated href (<animate>)',
    '<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>',
  ],
  ['event handler attribute', '<svg onload="alert(1)"><circle r="1"/></svg>'],
  ['javascript: URL', '<svg><a href="javascript:alert(1)"><circle r="1"/></a></svg>'],
  // &#106; decodes to 'j' during XML parsing: the DOM walker sees the live
  // javascript: URL that a literal byte scan never matched.
  ['javascript: URL via decimal char ref', '<svg><a href="&#106;avascript:alert(1)"/></svg>'],
  ['javascript: URL via hex char ref', '<svg><a href="&#x6a;avascript:alert(1)"/></svg>'],
  // &#9; is a char-ref tab: it survives XML attribute-value normalization and
  // the WHATWG URL parser strips it, yielding "javascript:".
  ['javascript: URL via tab char ref', '<svg><a href="java&#9;script:alert(1)"/></svg>'],
  // Passive beacons: fetched with no user interaction when the SVG is loaded.
  ['external <image> beacon', '<svg><image href="https://evil.example/beacon.png"/></svg>'],
  ['external <use> beacon', '<svg><use href="https://evil.example/sprite.svg#i"/></svg>'],
  ['external <feImage> beacon', '<svg><filter><feImage href="https://evil.example/x.png"/></filter></svg>'],
  ['protocol-relative <image> beacon', '<svg><image xlink:href="//evil.example/b.png"/></svg>'],
  // The WHATWG parser treats "\" as "/" for special schemes.
  ['backslash protocol-relative <image> beacon', '<svg><image href="\\\\evil.example/b.png"/></svg>'],
  // &#34; decodes to a quote INSIDE the attribute value; &#104; to 'h'.
  // Both are resolved by the parser before the safety rules ever run.
  [
    'char-ref quote + char-ref scheme',
    '<svg><image a="&#34;" href="&#104;ttps://evil.example/b.png"/></svg>',
  ],
  ['CSS @import', '<svg><style>@import url("https://evil.example/x.css");</style></svg>'],
  [
    'CSS @import inside CDATA in <style>',
    '<svg><style><![CDATA[@import url("https://evil.example/x.css");]]></style></svg>',
  ],
  [
    'XML entity declaration (XXE)',
    '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      '<svg>&xxe;</svg>',
  ],
  [
    'billion laughs (nested entity expansion)',
    '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "xx"><!ENTITY b "&a;&a;&a;&a;">]><svg>&b;</svg>',
  ],
  ['bare DOCTYPE (no DTDs allowed, flattened exports only)', '<?xml version="1.0"?><!DOCTYPE svg><svg/>'],
];

describe('assertSafeSvg() — rejects each active-content pattern', () => {
  it.each(MALICIOUS_SVGS)('rejects %s', (_label, svg) => {
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });

  it('accepts a legitimate SVG with only graphical markup', () => {
    expect(() => assertSafeSvg(LEGIT_SVG)).not.toThrow();
  });

  it('accepts local fragment references in URL-valued attributes (no false positive)', () => {
    const legit = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<defs><linearGradient id="gradient"><stop offset="0" stop-color="#fff"/>' +
        '</linearGradient></defs>' +
        '<rect fill="url(#gradient)" width="10" height="10"/>' +
        '<use href="#local-anchor" xlink:href="#gradient"/>' +
        '<a href="#local-anchor"><circle r="1"/></a></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts numeric character references used for graphics text (no false positive)', () => {
    const legit = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="9">&#65;&#x42;c &#38;d</text></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts an embedded raster image via data: URI (no false positive)', () => {
    const legit = Buffer.from(
      '<svg><image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts a ">" as path data inside an attribute value (valid XML, no false positive)', () => {
    const legit = Buffer.from('<svg><path d="M0 0 L10 10 z" data-note="1>0" stroke="#000"/></svg>');
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('accepts a SMIL animation of a non-URL attribute (no false positive)', () => {
    const legit = Buffer.from(
      '<svg><circle r="1"><animate attributeName="r" values="1;5;1"/></circle></svg>'
    );
    expect(() => assertSafeSvg(legit)).not.toThrow();
  });

  it('does not mutate the payload when rejecting (scanning is read-only)', () => {
    const raw = '<svg><a href="&#106;avascript:alert(1)"/></svg>';
    const payload = Buffer.from(raw);
    expect(() => assertSafeSvg(payload)).toThrow(InvalidFileTypeError);
    expect(payload.toString('utf8')).toBe(raw);
  });
});

describe('assertSafeSvg() — animated href in isolation (no javascript: involved)', () => {
  // These URLs would NOT trip the javascript: rule: they only fail because
  // attributeName targets *href on a SMIL element.
  const REMOTE_ANIMATED_HREFS: Array<[string, string]> = [
    ['<set> remote to=', '<svg><set attributeName="href" to="https://evil.example/x.png"/></svg>'],
    [
      '<animate> remote values=',
      '<svg><animate attributeName="href" values="https://evil.example/a.png"/></svg>',
    ],
    ['xlink:href target', '<svg><set attributeName="xlink:href" to="https://evil.example/x.png"/></svg>'],
    ['protocol-relative to=', '<svg><set attributeName="href" to="//evil.example/x.png"/></svg>'],
  ];
  it.each(REMOTE_ANIMATED_HREFS)('rejects %s', (_label, svg) => {
    expect(() => assertSafeSvg(Buffer.from(svg))).toThrow(InvalidFileTypeError);
  });
});

describe('assertSafeSvg() — performance regression (real parser, linear time)', () => {
  // The lexer-era patterns needed minutes on these inputs. With the parser
  // the malformed ones are rejected in single-digit milliseconds (fail
  // closed, no hang); the 2 s budget stays non-flaky on loaded CI runners.
  it('rejects a degenerate 2 MB buffer without ">" fast (fail closed, no scan hang)', () => {
    const size = 2_097_152; // LOGO_MAX_BYTES
    const prefix = '<set ';
    const unit = 'attributeName=';
    const filler = unit.repeat(Math.ceil((size - prefix.length) / unit.length)).slice(0, size - prefix.length);
    const degenerate = Buffer.from(prefix + filler, 'utf8');
    const start = Date.now();
    expect(() => assertSafeSvg(degenerate)).toThrow(InvalidFileTypeError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('rejects 2 MB of repeated unterminated "<image " prefixes fast', () => {
    const degenerate = Buffer.from('<image '.repeat(300_000)); // 2.1 MB, no ">"
    const start = Date.now();
    expect(() => assertSafeSvg(degenerate)).toThrow(InvalidFileTypeError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('accepts a well-formed 2 MB SVG with 60k elements fast', () => {
    const legit = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1" height="1" fill="#000"/>'.repeat(60_000) +
        '</svg>'
    );
    const start = Date.now();
    expect(() => assertSafeSvg(legit)).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
