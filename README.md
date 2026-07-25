# Lisno

Lisno is a role-based design operations platform with independent React and Node.js workspaces.

## Development

Start the API:

```bash
cd backend
npm install
npm run dev
```

Start the web application in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Each workspace also supports `npm test`, `npm run typecheck`, and `npm run build`.

## Health check

`GET /api/v1/health` returns `{ "data": { "status": "ok" } }`.
