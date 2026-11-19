"""Download pinned frontend dependencies into frontend/vendor/.

Uses only the Python standard library, so it runs anywhere Python does.
Run it again only when you change a version below; the downloaded files
are committed so the app works offline and without this script.

    python scripts/vendor_deps.py

Two kinds of dependency:
  DEPS   ES modules for the import map, fetched from esm.sh as single pre-bundled
         files. `react` is kept external everywhere so the page shares one React
         instance (the import map in frontend/index.html points "react" at vendor/react.js).
  FILES  Plain files saved byte-for-byte (browser builds that set a global, CSS),
         e.g. the map libraries, which frontend/js/lib/loadScript.js loads on demand.
"""

import re
import sys
import urllib.request
from pathlib import Path

ESM = "https://esm.sh"
TARGET = "es2022"  # pinned so output doesn't vary with the requesting User-Agent

# import-map specifier -> (esm.sh package path, output file, extra query)
DEPS = {
    "react":            ("react@18.3.1",            "react.js",            ""),
    "react-dom/client": ("react-dom@18.3.1/client", "react-dom-client.js", "&external=react"),
    "zustand":          ("zustand@4.5.2",           "zustand.js",          "&external=react"),
    "htm":              ("htm@3.1.1",               "htm.js",              ""),
}

# output file -> exact URL (pin versions in the URL)
FILES = {
    # three.js r128: the version the legacy map's 3D code was written against
    "three.min.js":     "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "maplibre-gl.js":   "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
    "maplibre-gl.css":  "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
}

# Bare imports a vendored file may still contain; each must be in the import map.
ALLOWED_BARE_IMPORTS = {"react"}

VENDOR_DIR = Path(__file__).resolve().parent.parent / "frontend" / "vendor"
# Matches real import/export-from statements (`import"x"`, `import{a}from"x"`,
# `export*from"x"`, `import("x")`), but not text inside strings like warning messages,
# because a statement must start the file or follow `;`, `}`, `)` or a newline.
IMPORT_RE = re.compile(
    r'(?:^|[;}\)\n])\s*(?:import\s*\(?\s*|(?:import|export)\b[\w\s{},*$]*?\bfrom\s*)["\']([^"\']+)["\']'
)


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vendor-deps-script"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def fetch(url: str) -> str:
    return fetch_bytes(url).decode("utf-8")


def vendor_file(out_name: str, url: str) -> None:
    data = fetch_bytes(url)
    if not data:
        raise RuntimeError(f"{out_name}: empty download from {url}")
    (VENDOR_DIR / out_name).write_bytes(data)
    print(f"  {out_name:<18} -> frontend/vendor/{out_name} ({len(data) // 1024} KB)")


def vendor(specifier: str, pkg: str, out_name: str, extra: str) -> None:
    # The entry URL returns a tiny stub that re-exports from the real bundle file.
    stub = fetch(f"{ESM}/{pkg}?bundle&target={TARGET}{extra}")
    bundle_paths = sorted({m for m in IMPORT_RE.findall(stub) if m.startswith("/")})
    if len(bundle_paths) != 1:
        raise RuntimeError(f"{specifier}: expected one bundle path in stub, got {bundle_paths}")

    code = fetch(ESM + bundle_paths[0])

    unexpected = {m for m in IMPORT_RE.findall(code) if m not in ALLOWED_BARE_IMPORTS}
    if unexpected:
        raise RuntimeError(f"{specifier}: bundle has imports the import map can't resolve: {unexpected}")

    header = f"/* {specifier} — vendored from {ESM}{bundle_paths[0]} by scripts/vendor_deps.py */\n"
    (VENDOR_DIR / out_name).write_text(header + code, encoding="utf-8")
    print(f"  {specifier:<18} -> frontend/vendor/{out_name} ({len(code) // 1024} KB)")


def main() -> int:
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Vendoring into {VENDOR_DIR}")
    try:
        for specifier, (pkg, out_name, extra) in DEPS.items():
            vendor(specifier, pkg, out_name, extra)
        for out_name, url in FILES.items():
            vendor_file(out_name, url)
    except Exception as e:  # noqa: BLE001 - surface any failure plainly
        print(f"Failed: {e}", file=sys.stderr)
        return 1
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
