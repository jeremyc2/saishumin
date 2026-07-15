# Saishumin

<img width="1275" height="602" alt="image" src="https://github.com/user-attachments/assets/bd301b9c-83eb-4735-a036-c823d9d0e244" />

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
