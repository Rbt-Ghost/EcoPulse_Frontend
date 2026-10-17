# EcoPulse · Frontend

Harta inteligentă a Iașului: rute calculate după nivelul de poluare, hazard-uri de infrastructură, zone în construcție și probleme raportate de utilizatori.

React 19 + TypeScript + Vite. Harta folosește **Google Maps** (`@vis.gl/react-google-maps`) când există o cheie API, altfel Leaflet + OpenStreetMap.

```bash
npm install
npm run dev
```

## Funcționalități

- **Tab Hartă**
  - Straturi distincte: heatmap de poluare + senzori AQI, hazard-uri (romburi), șantiere (poligoane hașurate), raportări utilizatori (pin + cerc de 500 m). Fiecare strat poate fi ascuns.
  - Plecare / destinație prin căutare (Nominatim) sau click pe hartă; deplasare pe jos, cu bicicleta sau cu mașina.
  - 3 trasee: **cel mai curat**, **echilibrat**, **cel mai rapid**.
  - **Export în Google Maps**: link cu puncte intermediare care păstrează forma traseului (tab nou pe desktop, aplicația Google Maps pe mobil).
  - Problemele raportate pot fi eliminate direct de autor sau după 3 confirmări de la alți utilizatori.
- **Tab Raportează**: chat (text sau speech-to-text, `ro-RO`) care trimite descrierea către LLM; issue-ul rezultat apare pe hartă la locația curentă, cu rază de 500 m.

## Backend

Toate datele vin de la [EcoPulse-Hackathon](../EcoPulse-Hackathon) (FastAPI), care trebuie să ruleze împreună cu worker-ul de sincronizare a surselor:

```bash
cd ../EcoPulse-Hackathon
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/python -m uvicorn app.main:app --port 8000   # API
.venv/Scripts/python -m app.workers.sync                    # senzori, OSM, meteo (proces separat)
```

Adresa implicită e `http://localhost:8000/api/v1`; pentru alta, setează `VITE_API_URL` în `.env.local`. Frontend-ul trebuie servit de pe `http://localhost:5173` (sau adaugă originea în `CORS_ORIGINS` din backend).

Clientul e împărțit în `src/services/http.ts` (sesiune, conturi), `src/services/api.ts` (hartă, raportări, asistent) și `src/services/backend.ts` (rutare, călătorii, mediu, administrare). Toate rutele backend-ului sunt folosite:

| Tab / funcție | Rute backend |
| --- | --- |
| **Cont**: cont anonim automat, autentificare, cont nou, delogare | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Stare server (punctul din bara laterală), oraș, atribuiri | `GET /health`, `GET /health/ready`, `GET /config` |
| **Hartă**: raportări (pin + cerc 500 m), senzori AQI, șantiere OSM, lucrări oficiale | `GET /reports`, `GET /environment/observations`, `GET /disruptions/features`, `GET /disruptions/planned` |
| Popup raportare: autor/vot, „s-a rezolvat” (3 → dispare), „încă există”, semnalare, închidere de autor, ascundere (admin) | `GET /reports/:id/feedback`, `POST /reports/:id/{dispute,confirm,flag,resolve}`, `POST /admin/reports/:id/hide` |
| Căutare adrese (cu rezervă directă la Nominatim) | `GET /geocoding/search` |
| Rute cu ora plecării și ocolirea incidentelor (când serverul are Valhalla; altfel OSRM local) | `POST /routes/alternatives` |
| Călătorii salvate: salvare, deschidere, redenumire, ștergere | `GET/POST /journeys`, `PUT/DELETE /journeys/:id` |
| **Raportează**: textul (scris sau dictat) devine direct un issue la locația curentă, rescris de LLM | `POST /reports/from-text` |
| **Date**: aer pe categorii de surse, meteo pe ore, stații, istoricul raportărilor cu filtre | `GET /environment/observations`, `GET /environment/weather`, `GET /environment/stations`, `GET /reports?status=&category=` |
| **Admin** (doar rol `admin`): stare surse, rulări de sincronizare, verificarea lucrărilor oficiale | `GET /admin/data-sources/status`, `GET /admin/data-sources/runs`, `GET /admin/works/review`, `PUT /admin/works/:id` |

Rolul de administrator se setează direct în baza de date a backend-ului (coloana `role` din tabelul `users`); nu există un endpoint pentru asta.

Chat-ul nu pune întrebări: trimite textul și locația GPS a browserului la `POST /reports/from-text`, iar backend-ul publică imediat issue-ul (rază 500 m). Dacă în backend e configurat un LLM (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`), acesta rescrie descrierea coerent și alege categoria și gravitatea; altfel se folosește o rescriere deterministă. Fără acces la GPS, utilizatorul alege locul pe hartă și confirmă cu „Adaugă aici”.

Fără Valhalla (`VALHALLA_BASE_URL` gol în backend), rutele vin de la OSRM public (`routing.openstreetmap.de`) și sunt evaluate local după expunerea la poluare (IDW între senzori) și obstacole (`src/services/routing.ts`).

## Google Maps

1. În [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) activează **Maps JavaScript API** și creează o cheie (restricționată la domeniile aplicației).
2. Pune-o în `.env.local`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=cheia-ta
   VITE_GOOGLE_MAPS_MAP_ID=   # opțional; implicit DEMO_MAP_ID
   ```
3. Repornește `npm run dev`.

Markerii folosesc Advanced Markers, care cer un Map ID. `DEMO_MAP_ID` merge pentru dezvoltare; pentru producție creează un Map ID propriu (poți alege și stilul hărții din consolă).

Fără cheie se folosește Leaflet cu tile-uri OpenStreetMap (configurabile prin `VITE_TILE_URL` / `VITE_TILE_ATTRIBUTION`).
