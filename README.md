# Lisno

Lisno is a role-based design operations platform with independent React and Node.js workspaces.

## Development

Task, history, audit, and evaluation writes use MongoDB transactions. Local
MongoDB must therefore run as a replica set (or use a transaction-capable
MongoDB Atlas URI). One local setup is:

```bash
mkdir -p .local/mongo-rs0
mongod --dbpath .local/mongo-rs0 --replSet rs0 --bind_ip 127.0.0.1
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Set `MONGODB_URI=mongodb://127.0.0.1:27017/lisno?replicaSet=rs0`. A standalone
MongoDB server is not sufficient for the atomic workflow APIs.

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
