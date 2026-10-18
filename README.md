# EcoPulse · Frontend

Harta inteligentă a Iașului: rute calculate după nivelul de poluare, zone în construcție și probleme raportate de utilizatori.

React 19 + TypeScript + Vite. Harta folosește **Google Maps** (`@vis.gl/react-google-maps`) când există o cheie API, altfel Leaflet + OpenStreetMap.

```bash
npm install
npm run dev
```

## Funcționalități

- **Tab Hartă**
  - Straturi distincte: heatmap de poluare + senzori AQI, șantiere (poligoane hașurate din `GET /disruptions/features` și lucrările oficiale), raportări utilizatori (pin + cerc de 100 m). Fiecare strat poate fi ascuns.
  - Plecare / destinație prin căutare (Nominatim) sau click pe hartă; deplasare pe jos, cu bicicleta sau cu mașina.
  - 3 trasee: **cel mai curat**, **echilibrat**, **cel mai rapid**.
  - **Export în Google Maps**: link cu puncte intermediare care păstrează forma traseului (tab nou pe desktop, aplicația Google Maps pe mobil).
  - Problemele raportate pot fi eliminate direct de autor sau după 3 confirmări de la alți utilizatori.
- **Panoul „Calitatea aerului”** (dreapta pe desktop, butonul „Aer 24h” pe hartă pe mobil):
  - acum: indicele RNMCA (1 Bun … 6 Extrem de rău, cel mai rău dintre PM2.5, PM10, NO₂), concentrațiile PM2.5 / PM10 / NO₂ cu nivelul fiecăruia, O₃, SO₂ și indicele european;
  - prognoza pe următoarele 24 de ore (CAMS): grafic pe poluant cu pragurile RNMCA, indicele general pe fiecare oră și tabel orar;
  - alertă (banner + notificare) când PM2.5 ajunge la „Moderat” sau mai rău, plus avertisment dacă prognoza urcă la acest nivel în următoarele 24 h;
  - datele se reîmprospătează la 10 minute cât timp pagina e deschisă.
- **Tab Raportează**: chat (text sau speech-to-text, `ro-RO`) care trimite descrierea către LLM; issue-ul rezultat apare pe hartă la locația curentă, cu rază de 100 m.

## Backend

Toate datele vin de la [EcoPulse-Hackathon](../EcoPulse-Hackathon) (FastAPI), care trebuie să ruleze împreună cu worker-ul de sincronizare a surselor:

```bash
cd ../EcoPulse-Hackathon
python -m venv .venv && .venv/bin/pip install -e ".[dev]"     # Windows: .venv/Scripts/...
.venv/bin/python -m uvicorn app.main:app --port 8000   # API
.venv/bin/python -m app.workers.sync                    # senzori, OSM, meteo (proces separat)
```

### Date istorice RNMCA (calitateaer.ro)

Rapoartele Excel (`.xls`) descărcate de pe [calitateaer.ro](https://www.calitateaer.ro) pentru stațiile IS-1, IS-2, IS-3 se importă cu:

```bash
cd ../EcoPulse-Hackathon
.venv/bin/python -m app.workers.import_rnmca Raport-2026-prezent.xls raport-indici-2026.xls --csv export/
```

- **Raport valori date**: valorile orare intră în baza de date (`OFFICIAL_MEASUREMENT` pentru poluanți, `WEATHER_CONTEXT` pentru stația meteo de la IS-2) și apar în `GET /environment/observations` și `GET /environment/stations`. Importul se poate repeta: rândurile existente se actualizează, nu se dublează.
- **Raport indici de calitate**: doar export CSV. Cu `--csv`, ambele tipuri se exportă complet (inclusiv mediile zilnice și anuale).
- Orele din rapoarte (01–24) sunt ora locală a Bucureștiului, cu ora de vară, și marchează sfârșitul intervalului; importul le salvează în UTC, ca început al orei.
- `--parameters pm25,pm10,no2,o3,so2` importă doar seriile alese (un an întreg are ~340.000 de valori orare); `--no-db` doar citește și exportă; `--stations fișier.json` înlocuiește coordonatele stațiilor (implicit geocodate după adresă, ±100 m).

Adresa implicită e `http://localhost:8000/api/v1`; pentru alta, setează `VITE_API_URL` în `.env.local`. Frontend-ul trebuie servit de pe `http://localhost:5173` (sau adaugă originea în `CORS_ORIGINS` din backend).

Tot accesul la backend e în `src/services/api.ts`. Rutele folosite:

| Funcție | Rute backend |
| --- | --- |
| Cont anonim per dispozitiv (creat și reînnoit automat, JWT) | `POST /auth/register`, `POST /auth/login` |
| **Hartă**: raportări (pin + cerc 100 m), senzori AQI recenți, șantiere OSM, lucrări oficiale active | `GET /reports`, `GET /environment/observations?category=&since=&until=`, `GET /disruptions/features`, `GET /disruptions/planned` |
| Popup raportare: autor/vot, „s-a rezolvat” (3 → dispare), închidere de autor sau admin | `GET /reports/:id/feedback`, `POST /reports/:id/dispute`, `POST /reports/:id/resolve` |
| **Raportează**: textul (scris sau dictat) devine direct un issue la locația curentă | `POST /reports/from-text` |
| **Calitatea aerului**: valori curente + prognoză orară (Open-Meteo / CAMS), clasificate RNMCA, cache 10 min în backend | `GET /air-quality` |

Chat-ul nu pune întrebări: trimite textul și locația GPS a browserului (dacă precizia e de cel mult 1 km) la `POST /reports/from-text`, iar backend-ul publică imediat issue-ul. Dacă în backend e configurat un LLM (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`), acesta rescrie descrierea și alege categoria și gravitatea; altfel (sau dacă LLM-ul nu răspunde) se folosește o clasificare deterministă. Fără GPS precis, utilizatorul alege locul pe hartă și confirmă cu „Adaugă aici”.

Un issue dispare de pe hartă când autorul îl închide sau după 3 confirmări „s-a rezolvat” de la alți utilizatori, dacă acestea sunt mai multe decât confirmările că problema există (`RESOLVE_DISPUTES` în `app/services/reports.py` din backend, expus în `GET /config`; `RESOLVE_THRESHOLD` din `api.ts` trebuie să aibă aceeași valoare).

Rutele sunt calculate în browser: OSRM public (`routing.openstreetmap.de`) generează trasee candidate, evaluate local după expunerea la poluare (IDW între senzori) și obstacole (`src/services/routing.ts`). Căutarea adreselor folosește direct Nominatim (`src/services/geocoding.ts`).

Rute ale backend-ului pe care interfața **nu** le folosește încă: `GET /auth/me`, `GET /config`, `GET /health`, `GET /health/ready`, `POST /reports` (raportare structurată), `GET /reports/:id`, `POST /reports/:id/{confirm,flag}`, `GET /geocoding/search`, `POST /routes/alternatives` (cere Valhalla), `GET /environment/weather`, `GET /environment/stations`, `GET/POST/PUT/DELETE /journeys`, `/assistant/conversations/*` și toate rutele `/admin/*`. Rolul de administrator se setează direct în baza de date a backend-ului (coloana `role` din tabelul `users`).

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
