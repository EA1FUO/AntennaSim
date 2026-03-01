# Contributing to AntennaSim

Thank you for your interest in contributing to AntennaSim! This guide will help you get started.

## Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Git](https://git-scm.com/)
- [Node.js 20+](https://nodejs.org/) (only needed for running checks locally)

### Getting Started

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/AntennaSim.git
cd AntennaSim
```

2. Create the environment file:

```bash
cp .env.example .env
```

3. Start the development environment:

```bash
./scripts/dev.sh
```

Or manually:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

4. Access the application:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

Source directories are volume-mounted, so changes are reflected immediately via hot-reload.

## Branch Naming

Create branches from `main` using the following prefixes:

| Prefix | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `chore/` | Maintenance, CI, tooling |
| `refactor/` | Code refactoring |

Example: `feat/horizontal-delta-loop`, `fix/simulation-timeout`

## Commit Messages

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(optional-scope): description
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring (no feature or fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependencies |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks |

### Examples

```
feat: add horizontal delta loop template
fix: resolve simulation timeout on large models
docs: update README with new screenshots
feat(templates): add EFHW antenna template
```

**Important:** PR titles must follow this format. When we squash-merge your PR, the title becomes the commit message on `main`.

## Pull Request Guidelines

### Before Opening a PR

1. Sync your branch with the latest `main`. Rebasing is preferred to keep the PR history clean, but merging is also fine since we squash-merge all PRs:

```bash
# Preferred: rebase
git fetch origin
git rebase origin/main

# Also acceptable: merge
git fetch origin
git merge origin/main
```

2. Run the checks locally:

```bash
cd frontend
npm run type-check    # tsc --noEmit
npm run lint          # eslint
npm run build         # tsc -b && vite build
```

3. Make sure all three pass before opening the PR.

### PR Description

Include the following in your PR description:

- **Summary** -- What changed and why (1-3 bullet points)
- **Testing** -- How you verified the changes work
- **Screenshots** -- If the PR includes UI changes

### Review Process

- All PRs are reviewed by a maintainer before merging.
- CI checks (type-check, lint, build) must pass.
- PR title must follow Conventional Commits format.
- PRs are squash-merged to keep `main` history clean.

## Common Contributions

### Adding a New Antenna Template

The most common contribution. See existing templates in `frontend/src/templates/` for reference (e.g., `delta-loop.ts`, `dipole.ts`).

1. Create `frontend/src/templates/your-antenna.ts` implementing the `AntennaTemplate` interface
2. Register it in `frontend/src/templates/index.ts` (import + add to the `templates` array) -- this automatically makes it available in the Simulator, Editor, and Library
3. Add your template ID to `relatedTemplates` arrays of related existing templates
4. Update `README.md` -- increment the template count and add to the templates table
5. Run `npm run type-check && npm run build` and test manually

### Frontend Features

- **Components** -- `frontend/src/components/` (charts, 3D viewport, panels, common UI)
- **Pages** -- `frontend/src/pages/` (Simulator, Editor, Library, Learn, About)
- **State management** -- `frontend/src/stores/` (Zustand stores for antenna, simulation, editor, UI)
- **Routing** -- React Router in `frontend/src/App.tsx`

Follow existing component patterns. Use TypeScript strict mode and type-only imports where possible.

### Backend Features

- **API endpoints** -- `backend/src/` (FastAPI)
- **Simulation engine** -- NEC2 runner, parsers, and result processing
- The backend runs inside Docker -- use `./scripts/dev.sh` for hot-reload development
- Test API changes via Swagger at `http://localhost:8000/docs`

### Bug Fixes

- Open an issue first describing the bug (unless one already exists)
- Reference the issue number in your PR (e.g., "Fixes #12")
- Include steps to reproduce in the PR description

## Code Style

- **TypeScript** -- All frontend code is TypeScript with strict mode
- **ESLint** -- Run `npm run lint` to check for issues
- **Formatting** -- Follow the existing code style in the project
- **Imports** -- Use type-only imports where possible (`import type { ... }`)
- **NEC2 conventions** -- Coordinates follow NEC2: X=east, Y=north, Z=up
- **Segmentation** -- Use `autoSegment()` from `../engine/segmentation` for wire segments

## Questions?

If you have questions about contributing, feel free to open an issue with the question label or start a discussion on the repository.
