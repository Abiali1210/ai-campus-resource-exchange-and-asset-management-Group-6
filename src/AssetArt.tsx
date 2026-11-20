import type { ReactNode } from "react";
import type { AssetView } from "./types";
import {
  assetIllustration,
  illustrationLabels,
  type AssetIllustration,
} from "./assetIllustrations";

// Representative vector artwork, not photographs of the actual inventory.
// Shared by catalogue cards and asset records so they always agree.
const illustrations: Record<AssetIllustration, ReactNode> = {
  chair: (
    <>
      <path
        d="M61 50V17q0-8 8-8h40q8 0 8 8v33"
        fill="#bcae91"
        stroke="#6d725b"
        strokeWidth="2"
      />
      <path
        d="M56 58h67l5 15H51Z"
        fill="#c7bca0"
        stroke="#6d725b"
        strokeWidth="2"
      />
      <path
        d="m59 74-8 44m69-44 9 44M65 73l2 40m46-40-2 40"
        stroke="#6d725b"
        strokeWidth="4"
      />
      <path d="M70 23h37M70 34h37" stroke="#d8d1ba" strokeWidth="2" />
    </>
  ),
  projector: (
    <>
      <path
        d="m39 52 94-9 18 20-4 36-111 2Z"
        fill="#d4dcd1"
        stroke="#6c7c69"
        strokeWidth="2"
      />
      <path
        d="m38 53 109 10M39 81h38M44 88h31"
        stroke="#92a28a"
        strokeWidth="2"
      />
      <ellipse cx="119" cy="79" rx="19" ry="16" fill="#55735b" />
      <ellipse cx="119" cy="79" rx="11" ry="9" fill="#aec8bb" />
      <path d="M48 103v6m86-9v7" stroke="#6c7c69" strokeWidth="4" />
    </>
  ),
  monitor: (
    <>
      <rect
        x="31"
        y="11"
        width="118"
        height="79"
        rx="4"
        fill="#466550"
        stroke="#36543e"
        strokeWidth="2"
      />
      <rect x="37" y="17" width="106" height="65" rx="1" fill="#cfddc6" />
      <path d="m38 69 40-33 33 24 32-22v44H38Z" fill="#b6c9a9" />
      <path
        d="M80 91v19m19-19v19M66 114h48"
        stroke="#55734e"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="132" cy="28" r="6" fill="#e8eecb" />
    </>
  ),
  extinguisher: (
    <>
      <path
        d="M112 39q28 4 22 43"
        fill="none"
        stroke="#456253"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="m130 78 15 15-10 9-12-18Z" fill="#456253" />
      <rect
        x="66"
        y="35"
        width="46"
        height="83"
        rx="17"
        fill="#ad7563"
        stroke="#765b4b"
        strokeWidth="2"
      />
      <path d="M75 117h28" stroke="#765b4b" strokeWidth="4" />
      <path
        d="M80 34V22h23v14M83 20l24-8"
        fill="none"
        stroke="#456253"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle
        cx="107"
        cy="28"
        r="7"
        fill="#f1ead5"
        stroke="#456253"
        strokeWidth="2"
      />
      <path d="m107 28 3-3" stroke="#456253" strokeWidth="2" />
      <rect x="74" y="61" width="30" height="34" rx="3" fill="#f1ead5" />
      <path
        d="M89 85c-11-6-3-12-1-17 0 6 10 8 6 14-1 2-3 3-5 3Z"
        fill="#ad7563"
      />
    </>
  ),
  laptop: (
    <>
      <rect
        x="42"
        y="22"
        width="96"
        height="68"
        rx="5"
        fill="#466550"
        stroke="#36543e"
        strokeWidth="2"
      />
      <path d="M48 29h84v53H48Z" fill="#cfddc6" />
      <path d="m48 72 32-25 22 17 30-23v41H48Z" fill="#b6c9a9" />
      <path
        d="m42 91-19 18q0 5 8 5h118q8 0 8-5l-19-18Z"
        fill="#becbb9"
        stroke="#55735b"
        strokeWidth="2"
      />
      <path d="M75 101h30l4 6H71Z" fill="#8ca185" />
    </>
  ),
  computer: (
    <>
      <rect
        x="35"
        y="16"
        width="70"
        height="98"
        rx="5"
        fill="#c5cdbf"
        stroke="#56705a"
        strokeWidth="2"
      />
      <path d="M45 32h50M45 42h50M45 54h50" stroke="#8fa085" strokeWidth="4" />
      <circle cx="70" cy="78" r="9" fill="#476650" />
      <circle cx="70" cy="78" r="3" fill="#cbdabb" />
      <rect x="119" y="38" width="27" height="76" rx="4" fill="#6e856a" />
      <path
        d="M127 50h11M127 60h11M127 98h11"
        stroke="#bdcbb3"
        strokeWidth="3"
      />
    </>
  ),
  printer: (
    <>
      <path
        d="M57 13h66v42H57Z"
        fill="#f3f1e6"
        stroke="#819078"
        strokeWidth="2"
      />
      <rect
        x="31"
        y="45"
        width="118"
        height="58"
        rx="8"
        fill="#bdcbb5"
        stroke="#55735b"
        strokeWidth="2"
      />
      <path d="M47 79h86v20H47Z" fill="#466550" />
      <path
        d="M58 80h64v38H58Z"
        fill="#f3f1e6"
        stroke="#819078"
        strokeWidth="2"
      />
      <path d="M68 94h43M68 103h34" stroke="#a7b496" strokeWidth="3" />
      <circle cx="132" cy="59" r="4" fill="#edf1cf" />
    </>
  ),
  keyboard: (
    <>
      <path
        d="m33 36 119 2 12 53q0 7-8 7H25q-7 0-6-7Z"
        fill="#c8d0bf"
        stroke="#56705a"
        strokeWidth="2"
      />
      <path
        d="M40 49h105M36 61h112M32 74h120"
        stroke="#72896a"
        strokeWidth="7"
        strokeDasharray="9 5"
      />
      <path d="M55 87h72" stroke="#72896a" strokeWidth="7" />
    </>
  ),
  mouse: (
    <>
      <path
        d="M91 30V14q0-10 20-9"
        fill="none"
        stroke="#72896a"
        strokeWidth="3"
      />
      <path
        d="M58 70q0-41 33-41t33 41v12q0 33-33 33T58 82Z"
        fill="#c3d0b8"
        stroke="#56705a"
        strokeWidth="2"
      />
      <path
        d="M91 30v33M60 64h62"
        fill="none"
        stroke="#819b75"
        strokeWidth="2"
      />
      <rect x="87" y="41" width="8" height="15" rx="4" fill="#587252" />
    </>
  ),
  desk: (
    <>
      <path
        d="m27 39 117-4 18 15H19Z"
        fill="#c3b494"
        stroke="#7a775d"
        strokeWidth="2"
      />
      <path
        d="M28 51v62M149 51v62M30 61h118"
        fill="none"
        stroke="#7a775d"
        strokeWidth="5"
      />
      <path
        d="M111 59h31v38h-31Z"
        fill="#c3b494"
        stroke="#7a775d"
        strokeWidth="2"
      />
      <path d="M113 78h27M123 68h8M123 87h8" stroke="#8e876b" strokeWidth="2" />
    </>
  ),
  cabinet: (
    <>
      <rect
        x="48"
        y="13"
        width="84"
        height="102"
        rx="3"
        fill="#c4cbb6"
        stroke="#637759"
        strokeWidth="2"
      />
      <path d="M90 16v96M55 115v7M125 115v7" stroke="#637759" strokeWidth="3" />
      <path
        d="M80 52v20M100 52v20"
        stroke="#718365"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  ),
  bookshelf: (
    <>
      <path
        d="M42 10h96v109H42Z"
        fill="#c7b999"
        stroke="#7c7b5e"
        strokeWidth="3"
      />
      <path d="M49 18h82v42H49ZM49 68h82v43H49Z" fill="#ece8d9" />
      <path
        d="M57 24v30M70 22v32M83 28v26M97 23l10 31M59 76v28M75 74v30M90 80v24M107 77l10 27"
        stroke="#809476"
        strokeWidth="8"
      />
    </>
  ),
  book: (
    <>
      <path
        d="M90 35Q61 17 27 27v72q33-9 63 9 30-18 63-9V27q-34-10-63 8Z"
        fill="#f0ecdb"
        stroke="#77816a"
        strokeWidth="2"
      />
      <path
        d="M90 35v73M39 43q20-5 37 5M39 58q20-5 37 5M39 73q20-5 37 5M104 48q17-10 37-5M104 63q17-10 37-5M104 78q17-10 37-5"
        fill="none"
        stroke="#a6b196"
        strokeWidth="3"
      />
    </>
  ),
  microscope: (
    <>
      <path
        d="M98 35q42 18 19 56-6 10-24 10"
        fill="none"
        stroke="#647c61"
        strokeWidth="13"
      />
      <path
        d="m79 18 17 8-18 42-17-8Z"
        fill="#c7d2bc"
        stroke="#56705b"
        strokeWidth="2"
      />
      <path d="m82 12 18 8M62 67l11 5" stroke="#476650" strokeWidth="7" />
      <path
        d="M49 82h57M80 89v21M52 113h76"
        stroke="#647c61"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle
        cx="117"
        cy="58"
        r="9"
        fill="#c7d2bc"
        stroke="#56705b"
        strokeWidth="2"
      />
    </>
  ),
  tools: (
    <>
      <path
        d="M41 49h99v62H41Z"
        fill="#c5b392"
        stroke="#7e795d"
        strokeWidth="2"
      />
      <path
        d="M71 48V35h38v13M41 72h99"
        fill="none"
        stroke="#7e795d"
        strokeWidth="4"
      />
      <rect
        x="82"
        y="66"
        width="17"
        height="15"
        rx="2"
        fill="#ede7d2"
        stroke="#7e795d"
        strokeWidth="2"
      />
      <path
        d="m53 48-7-26 11-8 9 9-4 25M122 47l6-31"
        fill="none"
        stroke="#668063"
        strokeWidth="7"
      />
    </>
  ),
  whiteboard: (
    <>
      <rect
        x="26"
        y="14"
        width="128"
        height="80"
        rx="3"
        fill="#f1f2e9"
        stroke="#7b9276"
        strokeWidth="4"
      />
      <path
        d="M54 96v23M128 96v23M25 95h131"
        stroke="#7b9276"
        strokeWidth="4"
      />
      <path
        d="M43 38h44M43 51h72M43 64h56"
        stroke="#a8bb9a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="m116 71 13-17 8 7"
        fill="none"
        stroke="#6c896b"
        strokeWidth="3"
      />
    </>
  ),
  trolley: (
    <>
      <path
        d="M42 23h18v70h79M60 70h79"
        fill="none"
        stroke="#647c61"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M77 39h50v29H77ZM83 9h38v28H83Z"
        fill="#c7b999"
        stroke="#7c7b5e"
        strokeWidth="2"
      />
      <path d="M101 10v13M102 40v12" stroke="#e9dfc4" strokeWidth="5" />
      <circle
        cx="69"
        cy="106"
        r="9"
        fill="#819475"
        stroke="#56705b"
        strokeWidth="2"
      />
      <circle
        cx="132"
        cy="106"
        r="9"
        fill="#819475"
        stroke="#56705b"
        strokeWidth="2"
      />
    </>
  ),
  generic: (
    <>
      <path
        d="m90 24 54 23v58l-54 23-54-23V47Z"
        transform="translate(0 -9)"
        fill="#c8d3bb"
        stroke="#698363"
        strokeWidth="2"
      />
      <path
        d="m36 38 54 25 54-25M90 63v56M63 26l54 24v19"
        fill="none"
        stroke="#698363"
        strokeWidth="2"
      />
      <path d="M51 83l24 11" stroke="#e6ebd9" strokeWidth="5" />
    </>
  ),
};

export function AssetArt({
  asset,
}: {
  asset: Pick<AssetView, "name" | "categoryName" | "qty" | "trackingMode">;
}) {
  const kind = assetIllustration(asset.name, asset.categoryName);
  return (
    <div className={`asset-art ${kind}`}>
      <div className="art-grid" aria-hidden="true" />
      <span className="category-label">
        {asset.categoryName || "Uncategorized"}
      </span>
      <svg
        viewBox="0 0 180 130"
        role="img"
        aria-label={`${illustrationLabels[kind]} illustration`}
      >
        {illustrations[kind]}
      </svg>
      <span className="qty-label">
        {asset.qty} {asset.qty === 1 ? "unit" : "units"} ·{" "}
        {asset.trackingMode === "batch" ? "batch" : "individual"}
      </span>
    </div>
  );
}
