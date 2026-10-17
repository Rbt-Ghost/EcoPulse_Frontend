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

Fără `VITE_API_URL`, aplicația rulează în **mod demo**: datele sunt mock (`src/data/mockData.ts`), raportările se păstrează în `localStorage`, iar LLM-ul e simulat de `src/services/mockIssueAgent.ts`.

Pentru conectarea backend-ului, copiază `.env.example` în `.env.local` și setează `VITE_API_URL`. Contractul așteptat (tipurile sunt în `src/types.ts`, clientul în `src/services/api.ts`):

| Metodă | Rută | Răspuns |
| --- | --- | --- |
| `GET` | `/map-data` | `MapData` (`sensors`, `hazards`, `constructionZones`, `issues`) |
| `DELETE` | `/issues/:id` (header `X-User-Id`) | `204`, doar autorul |
| `POST` | `/issues/:id/resolve` (header `X-User-Id`) | `{ issue: UserIssue \| null }` (`null` = eliminat) |
| `POST` | `/issues/report-chat` | `{ reply: string, issue?: UserIssue }` |

Body pentru `report-chat`: `{ message, history: {role, text}[], location: {lat, lng}, userId }`. Backend-ul apelează LLM-ul (ex. Gemini) și creează issue-ul cu `radius: 500`.

Rutarea folosește OSRM public (`routing.openstreetmap.de`) pentru trasee candidate, evaluate local după expunerea la poluare (IDW între senzori) și obstacole (`src/services/routing.ts`). Poate fi mutată ulterior în backend.

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
