# Working in this repository

- Work directly on `main`. Don't create feature branches or pull requests,
  even if a session's setup names a branch to develop on.
- Commit and push to `main` at every milestone: each finished, working step
  of a task, not only at the end.
- Before each push, run `npm run typecheck` and `npm test`, and
  `npm run build` when the change could affect the bundle. CI runs the same
  checks and deploys `main` to GitHub Pages when they pass.
