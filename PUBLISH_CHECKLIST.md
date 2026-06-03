# @agentvisa/widget — npm Publish Checklist

Use this checklist before publishing a new version of the widget.

---

## Pre-Publish

- [ ] All tests pass
- [ ] `npm run build` completes without errors
- [ ] `dist/` contains the following files:
  - [ ] `widget.js` (UMD)
  - [ ] `widget.esm.js` (ESM)
  - [ ] `index.d.ts` (TypeScript definitions)
- [ ] `README.md` is up to date
- [ ] `package.json` version is bumped (semantic versioning)
- [ ] `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` are present

## Dry Run (Recommended)

```bash
npm publish --dry-run
```

Review the output to confirm only the intended files are included.

## Actual Publish

```bash
npm publish --access public
```

## Post-Publish

- [ ] Verify the package appears on npm: https://www.npmjs.com/package/@agentvisa/widget
- [ ] Test installation in a fresh project
- [ ] Update any internal projects using the new version
- [ ] Create a GitHub release (optional but recommended)

---

**Tip:** Always run `npm publish --dry-run` first. Never publish directly without verifying the package contents.