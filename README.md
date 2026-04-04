# query-ninjas

Go API (`invoiceSys`) with the **invoice-frontend** React app in `invoice-frontend/`.

## Backend (API)

- **Module:** see `go.mod`
- **Run locally:** from repo root, set `DB_*` (and other) env vars or use `.env`, then:

  ```bash
  go run .
  ```

- Listens on `PORT` (default `8080`).

## Frontend (React)

- **Location:** `invoice-frontend/`
- **Run locally from repo root** (uses root `package.json` scripts):

  ```bash
  npm install
  npm start
  ```

  First `npm install` runs `postinstall`, which installs dependencies inside `invoice-frontend/`.

- **Or** from `invoice-frontend/` directly:

  ```bash
  cd invoice-frontend
  npm ci
  npm start
  ```

- **Production build:** `npm run build` → output in `invoice-frontend/build/`
- Point the app at your API with `REACT_APP_API_URL` (see `invoice-frontend/src/services/api.js`).

## Deploy (e.g. Render)

- **API:** Web Service, repo root, `go build -o server .` / `./server` (see `render.yaml`).
- **Static site:** second service, **root directory** `invoice-frontend`, build `npm ci && npm run build`, publish `build`.
