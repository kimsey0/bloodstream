# Bloodstream

An interactive, physiologically accurate visualisation of how blood moves
around the body and picks up and releases oxygen. It runs entirely in the
browser, on desktop and on phones.

Status: milestone 4. A translucent 3D body with tracer red cells moving at
physiological speed, on top of a validated simulation core. You can follow
any cell to see its oxygen saturation, speed, circuit time and one of its
haemoglobin molecules, and zoom into capillary beds at true micrometre scale. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, parameter
sources and emergent results.

```sh
npm install
npm run dev        # 3D app at http://localhost:5173, diagnostics at /diagnostics.html
npm test           # physiology validation suite
npm run typecheck
npm run build
npm run artifact   # single-file build for publishing as a claude.ai Artifact
```
