# Bloodstream

An interactive, physiologically accurate visualisation of how blood moves
around the body and picks up and releases oxygen. It runs entirely in the
browser, on desktop and on phones.

Status: milestone 1, the simulation core with validation tests and a
diagnostics page. The 3D view is next. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, parameter
sources and emergent results.

```sh
npm install
npm run dev        # diagnostics page at http://localhost:5173
npm test           # physiology validation suite
npm run typecheck
npm run build
```
