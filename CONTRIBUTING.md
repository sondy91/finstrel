# Contributing

## About

This application uses the official Wails React-TS template.

You can configure the project by editing `wails.json`. More information about the project settings can be found
[here at the docs](https://wails.io/docs/reference/project-config)

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on [localhost](http://localhost:34115). Connect
to this in your browser, and you can call your Go code from devtools.

## Building

To build a redistributable, production mode package, use `wails build -tags webkit2_41`.

> If you have the issue around libwebkit not being found related to Ubuntu 24.04, use the following command, see more about it in the `Troubleshooting` section below!

```zsh
wails dev -tags webkit2_41
```

## Troubleshooting

### Wails Dependency Installation

The following command will tell you what dependencies you need. I ran into an error with `libwebkit` not being found

```zsh
wails doctor
```

If you are on Ubuntu 24.04, when running you can use `libwebkit2gtk-4.1-dev`, check out the `Platform Specific Dependencies` [page](https://wails.io/docs/gettingstarted/installation) for more details.

## Local checks and Git hooks

Install Go, Node.js, pnpm, Python 3, pre-commit, and Gitleaks (for example, `brew install pre-commit gitleaks` on macOS), then run `pnpm install --frozen-lockfile` in `frontend`.
Enable the versioned hook once per clone:

```sh
git config core.hooksPath .githooks
```

The pre-commit framework checks staged secrets with Gitleaks, whitespace, final newlines, merge conflicts, large added files (over 1 MiB), and JSON, YAML, and TOML syntax. On its first run it downloads the pinned shared hook environment. The whitespace and final-newline hooks can modify files and stop the commit; review and stage the fixes before retrying. The hook then runs `gofmt`, Oxlint, and Oxfmt against staged source, and runs `go vet ./...` or `pnpm typecheck` when the relevant files change. The latter two inspect the working tree, so unstaged edits can affect their results. It does not modify or stage files. Run `pnpm lint` in `frontend` to lint all frontend source, and `pnpm format` to format it. Staged TypeScript files must be Oxfmt-formatted; existing code has not been reformatted wholesale. During the trial, `pnpm lint:legacy` and `pnpm format:legacy` retain the previous ESLint and Prettier commands for comparison or rollback. Run `go test ./...` and `pnpm test --run` (in `frontend`) before submitting changes.

Commit subjects use Conventional Commits, such as `feat(budget): add rollover` or `fix: correct total`. Feature and fix commits must include a Linear linking phrase and full issue identifier (for example, `Refs AS-46`); other commit types may omit it. Use `#46` only when referring to a GitHub issue or pull request, since it does not mean Linear issue `AS-46`.
