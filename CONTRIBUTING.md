# Contributing

Thanks for improving Symphony Dashboard.

## Development

```bash
cp config/projects.example.json config/projects.json
npm run check
npm start
```

The project intentionally has no runtime dependencies. Prefer keeping changes small and dependency-free unless a dependency removes meaningful complexity.

## Pull Requests

Before opening a pull request:

```bash
npm run check
```

If you change dashboard behavior, include a short note about the Symphony API shape you tested against.

## Configuration

Do not commit `config/projects.json`; it is ignored because it may contain private local paths or tracker URLs.
