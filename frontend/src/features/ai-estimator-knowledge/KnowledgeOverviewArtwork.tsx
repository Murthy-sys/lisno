type OverviewSymbol = "unit" | "surfaces" | "plus" | "info";

export function KnowledgeOverviewIcon({ symbol }: { readonly symbol: OverviewSymbol }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {symbol === "unit" ? <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v9" /></> : null}
      {symbol === "surfaces" ? <><path d="m12 3 10 5-10 5L2 8l10-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : null}
      {symbol === "plus" ? <path d="M12 4v16M4 12h16" /> : null}
      {symbol === "info" ? <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="M12 11v6" stroke="#f4f7fc" /><circle cx="12" cy="7" r="1" fill="#f4f7fc" stroke="none" /></> : null}
    </svg>
  );
}

/** A generic spatial illustration, not a photograph or a catalogue identity. */
export function KnowledgeSurfaceArtwork() {
  return (
    <svg className="knowledge-overview-surfaces__artwork" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 19 34 6l26 12-27 14L4 19Z" fill="#d9d8cd" />
      <path d="M4 19v34l29 9V32L4 19Z" fill="#e6e5db" />
      <path d="M33 32 60 18v34L33 62V32Z" fill="#eeede5" />
      <path d="m13 19 21-8 17 8-18 8-20-8Z" fill="#e9e8e0" stroke="#c4c5b7" />
      <path d="M4 19 33 32l27-14M33 32v30M13 23v33M51 23v33M5 42l28 9 26-9" stroke="#c3c5b7" strokeWidth="1.2" />
      <path d="m19 29 8 3v19l-8-3V29Zm22 3 8-4v21l-8 3V32Z" fill="#faf9f3" />
      <ellipse cx="25" cy="24" rx="2.3" ry="1" fill="#b2b5a4" />
      <ellipse cx="42" cy="23" rx="2.3" ry="1" fill="#b2b5a4" />
    </svg>
  );
}

export function KnowledgeOverviewBackdrop() {
  return (
    <div className="knowledge-overview__backdrop" aria-hidden="true">
      <svg viewBox="0 0 760 590" fill="none" stroke="currentColor" strokeWidth="1.5" focusable="false">
        <path d="m190 205 570-197v190L360 343 190 205ZM0 262l77-38 319 111 364-125v39L385 388 0 262Z" />
        <path d="m385 388 1 202M303 360v230M622 300v290M685 278v312" />
        <path d="m237 178 496-166M222 231l145 83 393-140" />
        <ellipse cx="467" cy="183" rx="13" ry="6" transform="rotate(-13 467 183)" />
        <ellipse cx="617" cy="229" rx="13" ry="6" transform="rotate(-13 617 229)" />
        <ellipse cx="122" cy="281" rx="9" ry="3.5" transform="rotate(15 122 281)" />
        <ellipse cx="179" cy="303" rx="9" ry="3.5" transform="rotate(15 179 303)" />
        <ellipse cx="236" cy="323" rx="9" ry="3.5" transform="rotate(15 236 323)" />
        <path d="M610 590v-157m0 68c-33-7-51-31-53-55 31 4 49 24 53 55Zm0-31c21-19 34-42 29-67-23 16-31 37-29 67Zm0 66c38-6 58-31 64-53-33 3-53 22-64 53Zm0 31c-31-4-49-23-53-43 30 2 47 20 53 43ZM610 434c-15-21-14-43-2-66 17 22 18 43 2 66Z" />
      </svg>
    </div>
  );
}
