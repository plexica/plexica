// svg-safety.ts
// Active-content scanner for SVG uploads, re-exported through file-upload.ts
// so importers do not need to know this module exists.
//
// Rewritten on top of a real XML parser (@xmldom/xmldom — ADR-025) after four
// review rounds produced consecutive bypasses against the previous hand-rolled
// lexer: ">" inside quoted attribute values truncating tag extraction,
// numeric character references smuggling "javascript:", namespace-prefixed
// element names evading the tag match, and >4096-byte padding windows.
// Reimplementing XML tokenisation by hand is a losing game — the document is
// now parsed once and every rule below is evaluated against the resulting
// DOM, where attribute values are already char-ref-decoded and namespace
// local names already resolved. The payload Buffer is only ever READ: the
// stored bytes are always the original ones.
//
// Rejects rather than rewrites: a sanitiser that silently strips markup gives
// the uploader a file that is not what they uploaded, and every HTML/XML
// rewriter is a new parser-differential surface. Refusing is safer and honest.
//
// Coverage boundary (accepted residual risk, unchanged from the lexer
// version): CSS url(https://...) paint references, remote media referenced by
// <audio>/<video>, and <a href="https://..."> links — all inert unless the
// SVG is opened directly and interacted with.

import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom';

import { InvalidFileTypeError } from './app-error.js';

// DOM nodeType constants (https://dom.spec.whatwg.org/#dom-node-nodetype) —
// the numeric values are fixed by the DOM standard.
const ELEMENT_NODE = 1;
const PROCESSING_INSTRUCTION_NODE = 7;

// Elements that make an SVG executable or embed foreign active content.
// Compared against the lowercased LOCAL name: a namespace-aware browser
// resolves <svg:script> by namespace URI, so a prefixed form is rejected
// exactly like the bare one.
const FORBIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'iframe',
  'embed',
  'object',
  'foreignobject',
  'handler',
]);

// Elements that fetch their href on load with no user interaction (passive
// beacon). Fragment ("#id") and data: hrefs stay allowed.
const REMOTE_FETCH_ELEMENTS: ReadonlySet<string> = new Set(['image', 'use', 'feimage']);

// URL-bearing attributes checked for a javascript: scheme on ANY element
// (from/to/values are the SMIL animation value slots animating href).
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src', 'from', 'to', 'values']);

// SMIL elements whose attributeName can redirect an href at runtime.
const SMIL_HREF_ELEMENTS: ReadonlySet<string> = new Set(['set', 'animate']);

function rejectSvg(label: string): never {
  throw new InvalidFileTypeError(
    `SVG contains active content (${label}) and cannot be stored. ` +
      'Export a flattened SVG without scripts or external references.'
  );
}

// Lowercased local name of an element/attribute node. xmldom leaves
// localName unset when the namespace prefix is not bound (and reports no
// error for it), so fall back to stripping the prefix from the qualified
// name — conservative: <x:image> is treated as <image> even when x is inert.
function localNameOf(node: Node): string {
  if (node.localName !== null && node.localName !== undefined) {
    return node.localName.toLowerCase();
  }
  const qName = node.nodeName;
  const colon = qName.lastIndexOf(':');
  return (colon === -1 ? qName : qName.slice(colon + 1)).toLowerCase();
}

// Mirrors the WHATWG URL parser: ASCII tab/LF/CR are stripped anywhere in a
// URL (a char-ref tab &#9; survives XML attribute-value normalisation and
// would otherwise split "javascript:" into two harmless-looking pieces),
// leading C0 controls/space are trimmed (xmldom does not reject &#1;-style
// control char-refs), and "\" counts as "/" for special schemes — so
// href="\\evil.example/x" IS protocol-relative.
function normalizeUrlValue(value: string): string {
  const collapsed = value.replace(/[\t\n\r]+/g, '');
  let start = 0;
  while (start < collapsed.length && collapsed.charCodeAt(start) <= 0x20) start++;
  return collapsed.slice(start).replace(/\\/g, '/').toLowerCase();
}

function isRemoteRef(normalizedUrl: string): boolean {
  return (
    normalizedUrl.startsWith('http:') ||
    normalizedUrl.startsWith('https:') ||
    normalizedUrl.startsWith('//')
  );
}

// Applies the rule set to one element: its own name, then every attribute.
function checkElement(element: Element): void {
  const name = localNameOf(element);
  if (FORBIDDEN_ELEMENTS.has(name)) rejectSvg(`<${name}>`);
  for (const attr of Array.from(element.attributes)) {
    const attrLocal = localNameOf(attr);
    // Event handlers: the qualified name decides — a browser never wires an
    // event listener through a namespace-prefixed attribute.
    if (attr.name.toLowerCase().startsWith('on')) rejectSvg('event handler attribute');
    if (URL_ATTRIBUTES.has(attrLocal)) {
      const url = normalizeUrlValue(attr.value);
      // Script-capable schemes are rejected on ANY element, not just links:
      // javascript: (event/anchor handlers), vbscript: (legacy IE, same
      // class — CodeQL 2026-08-19: the check only considered javascript:),
      // and data: on anything but a remote-fetch href (an <image>/<use>
      // data: payload is rendered inert with scripting disabled; a data: URL
      // elsewhere — <a>, SMIL to=/values= — navigates a top-level document
      // where embedded HTML/SVG scripts execute).
      if (url.startsWith('javascript:') || url.startsWith('vbscript:')) {
        rejectSvg('scripted URL');
      }
      const isRemoteFetchHref = attrLocal === 'href' && REMOTE_FETCH_ELEMENTS.has(name);
      if (url.startsWith('data:') && !isRemoteFetchHref) {
        rejectSvg('data: URL');
      }
      if (isRemoteFetchHref && isRemoteRef(url)) {
        rejectSvg(`external resource (<${name}> remote href)`);
      }
    }
    // <set>/<animate> targeting any *href attribute hand the attacker a
    // writable URL slot — rejected regardless of to=/values=. endsWith
    // covers href/xlink:href (and any future "*:href") without rejecting
    // innocent names that merely contain "href" (e.g. glyphRef).
    if (
      SMIL_HREF_ELEMENTS.has(name) &&
      attrLocal === 'attributename' &&
      attr.value.trim().toLowerCase().endsWith('href')
    ) {
      rejectSvg('animated href');
    }
  }
  // @import is only honoured inside a <style> element (xml-stylesheet PIs
  // are rejected separately); presentation-attribute url() stays an accepted
  // residual risk, unchanged from the lexer version.
  if (name === 'style' && /@import/i.test(element.textContent ?? '')) {
    rejectSvg('CSS @import');
  }
}

/**
 * Throws InvalidFileTypeError when an SVG payload carries active content or
 * is not well-formed XML. Never mutates the payload: the stored bytes are
 * always the original ones.
 */
export function assertSafeSvg(content: Buffer): void {
  const text = content.toString('utf8');
  // No DTD, ever: kills the whole entity class (internal/external entity
  // expansion, XXE, billion laughs) deterministically, independent of parser
  // behaviour. xmldom 0.9 already refuses to expand DTD entities (it reports
  // "entity not found" and performs no I/O), but a raw scan BEFORE parsing
  // costs nothing and survives parser upgrades. Deliberately naive: the
  // literal "<!DOCTYPE" inside a comment or CDATA is rejected too — a
  // conservative false positive no real export produces.
  if (/<!doctype/i.test(text)) rejectSvg('DOCTYPE/entity declaration');

  // Fail closed on ANY parser diagnostic: xmldom reports as mere "warning"
  // constructs (e.g. unquoted attribute values) that a browser's XML parser
  // rejects as fatal, so every level aborts the parse — throwing from
  // onError is converted by xmldom into a ParseError that stops processing.
  let doc: Document;
  try {
    doc = new DOMParser({
      locator: false,
      onError: () => {
        throw new Error('malformed XML');
      },
    }).parseFromString(text, 'image/svg+xml');
  } catch {
    rejectSvg('malformed XML');
  }

  // Iterative DFS with an explicit stack: a 2 MB upload can nest elements
  // ~100k deep, which would overflow a recursive walk's call stack.
  const stack: Node[] = [doc];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.nodeType === ELEMENT_NODE) {
      checkElement(node as Element);
    } else if (
      node.nodeType === PROCESSING_INSTRUCTION_NODE &&
      node.nodeName.toLowerCase() === 'xml-stylesheet'
    ) {
      // Loads a remote stylesheet when the SVG is opened directly.
      rejectSvg('xml-stylesheet processing instruction');
    }
    for (const child of Array.from(node.childNodes)) stack.push(child);
  }
}
