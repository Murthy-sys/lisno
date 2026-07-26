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

## Demo authentication

Every seeded account uses the demo password `LisnoDemo2026!`. Representative
logins are:

- Designer: `ananya@lisno.example`
- Design manager: `aarav@lisno.example`
- Design head: `head@lisno.example`
- Client: `client@aurora.example`

## Health check

`GET /api/v1/health` returns `{ "data": { "status": "ok" } }`.
