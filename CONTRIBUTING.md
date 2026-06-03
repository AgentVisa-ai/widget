# Contributing to @agentvisa/widget

Thank you for your interest in contributing to the AgentVisa widget!

## How to Contribute

1. **Fork** the repository and clone it locally.
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes (keep the widget lightweight — target < 5KB gzipped).
4. Run the build:
   ```bash
   npm run build
   ```
5. Test your changes with the example pages in `examples/`.
6. Submit a **Pull Request** with a clear description of the change.

## Code Guidelines

- Keep the public API stable (`AgentVisa` class + `verify()` method).
- Prefer vanilla TypeScript — avoid adding runtime dependencies.
- Update `README.md` and types when changing the public interface.
- All contributions must be licensed under the MIT License.

## Reporting Issues

Please open an issue on GitHub with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior

Thank you for helping improve AgentVisa!