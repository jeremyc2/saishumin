# Saishumin

Saishumin is a browser game built with Effect, lit-html, Tailwind CSS, and
[Otaku](https://github.com/jeremyc2/otaku), a minimal frontend framework that
provides the project's state and hot-module replacement support.

## Development

Install dependencies and start Bun's development server:

```sh
bun otaku:update
bun install
bun dev
```

## Production build

Create a minified production build in `dist`:

```sh
bun run build
```

Run the type checker with `bun typecheck` and format or lint the project
with `bun check`.
