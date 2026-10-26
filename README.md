# 🚨 SignalHub (`emergency-info-hub`)

> **Built collaboratively by our team for the Dual Use Hackathon for LA Tech Week.**
> An intelligent, dual-use public safety and situational awareness platform combining an interactive geospatial dashboard with an AI-powered voice hotline.

---

## 🎯 The Dual-Use Vision

SignalHub was created specifically around the theme of **Dual Use**—serving everyday civilian planning in normal times while instantly functioning as a vital crisis management lifeline during disasters:

1. **Everyday Civilian & Travel Planning (Interactive Web Map)**  
   In normal times, travelers and residents can use the interactive map and neighborhood analytics to research destinations, plan vacation spots, assess local weather or infrastructure disruptions, and understand crime and public safety in specific neighborhoods before visiting or moving.

2. **Crisis Response & Emergency Triage (AI Voice Hotline)**  
   During active emergencies (such as wildfires, earthquakes, severe storms, or power grid failures), the system transforms into a 911-supplemental emergency hotline. Powered by Retell AI, it provides callers with immediate, location-aware status updates and official safety instructions—dramatically reducing non-emergency call traffic into 911 dispatch centers so first responders can focus on life-threatening situations.

---

## 💡 Inspiration & Hackathon Mission

During major regional disasters, 911 call centers are regularly overwhelmed by thousands of non-dispatch calls from citizens asking *"What's happening near me?"*, *"Is that smoke an evacuation warning?"*, or *"Why is my power out?"*

Developed collaboratively in a fast-paced team setting during the **Dual Use Hackathon for LA Tech Week**, **SignalHub** bridges this gap. By synchronizing real-time federal, municipal, and citizen feeds across both a visual map interface and an accessible voice phone line, SignalHub ensures that every resident—whether browsing online or calling from a phone during an outage—has instant access to accurate, actionable emergency intelligence.

---

## 🤝 Built as a Team

This project was brought to life through tight cross-functional collaboration under hackathon time constraints. Our team split work across three core tracks that converged into a unified platform:

- **Geospatial UI & Interactive Mapping**: Designing a responsive, mobile-first Next.js interface featuring real-time location search, category filtering, incident detail drawers, and severity-weighted heatmap visualizations.
- **Multi-Source Data Aggregation Engine**: Engineering a resilient backend pipeline that queries, normalizes, geocodes, and caches live alerts from federal and municipal feeds (NWS, USGS, NASA EONET, and local CAD dispatch) with Haversine proximity ranking.
- **Conversational Voice AI Integration**: Building custom **Retell AI** inbound webhooks and function-calling tools capable of translating spoken caller locations and natural-language questions into concise, ready-to-speak emergency briefings with built-in 911 safety guardrails.

---

## ✨ Key Features

### 1. 🗺️ Interactive Live Map & Severity Heatmap
- **Automatic Geolocation & Place Search**: Automatically centers on the user's location (defaulting to the USC / Los Angeles metro area) and supports instant autocomplete search for any city, neighborhood, intersection, or ZIP code via OpenStreetMap Photon & Nominatim.
- **Severity-Weighted Heatmap**: Visualizes hazard intensity and estimated impact radius (`low`, `moderate`, `severe`, `extreme`) across the map.
- **Category Filtering & Incident Cards**: Filter active reports by **🔥 Fire**, **⛈️ Weather**, **⚡ Quake**, **⚠️ Utility**, or **🚨 Public Safety**, and inspect actionable safety instructions, affected zones, and emergency contact numbers.

### 2. 📞 Retell AI Voice Hotline Integration
- **Dynamic Inbound Call Briefings (`/api/retell/inbound`)**: Injects live regional incident counts and voice summaries directly into Retell AI's `dynamic_variables` the moment a citizen calls in.
- **Live Voice Tool Calling (`/api/retell/tool`)**: Allows the voice agent to dynamically look up emergencies for any spoken `caller_location` and handle two distinct inquiry modes:
  - **General Area Lookup (`inquiry_type: "general"`)**: Reads out the top active emergencies and critical alerts near the caller.
  - **Specific Incident Lookup (`inquiry_type: "specific"`)**: Uses keyword extraction, category synonym matching, and proximity scoring to answer targeted questions (e.g., *"Tell me about the brush fire in Hollywood Hills"* or *"Why is the power out on West Adams?"*).
- **911 Dispatch Guardrail**: Automatically detects if a caller is trying to report a new life-threatening emergency and directs them to hang up and dial **911** immediately.

### 3. 🌐 Multi-Source Real-Time Aggregation
SignalHub unifies data in parallel from five public and municipal feeds:
1. **National Weather Service (NWS)** (`api.weather.gov`) — Active severe weather warnings, red flag fire conditions, flood watches, and official safety instructions.
2. **USGS Earthquake Hazards Program** (`earthquake.usgs.gov`) — Real-time localized and global seismic events, magnitudes, depths, and felt reports.
3. **NASA EONET** (`eonet.gsfc.nasa.gov`) — Active wildfires, severe storms, and natural hazards tracked by NASA Earth Observatory.
4. **Local 911 CAD & Municipal Dispatch** — Neighborhood-level structure fires, utility outages, water main breaks, and highway hazmat incidents.
5. **OpenStreetMap (Photon & Nominatim)** — Forward and reverse geocoding for search queries and spoken caller locations.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Frontend**: [React 19](https://react.dev/), TypeScript, [Tailwind CSS v4](https://tailwindcss.com/)
- **Mapping & Geospatial**: [Leaflet](https://leafletjs.com/) & [React-Leaflet v5](https://react-leaflet.js.org/)
- **Voice AI**: [Retell AI](https://www.retellai.com/) (Inbound Webhooks & Custom Function Calling)
- **External APIs**: NWS Active Alerts API, USGS GeoJSON Feed, NASA EONET v3 API, OpenStreetMap Photon & Nominatim

---

## 📂 Project Structure

```text
emergency-info-hub/
├── app/
│   ├── (home)/page.tsx              # Main interactive map view
│   ├── (map)/
│   │   ├── map-client.tsx           # Search, category filters, live polling & incident drawer
│   │   └── map.tsx                  # Leaflet map markers, impact circles & heatmap layer
│   ├── hub/page.tsx                 # Data sources & API documentation page
│   ├── components/navbar.tsx        # Bottom navigation bar
│   └── api/
│       ├── emergency-info/route.ts  # GET live aggregated emergencies / POST new incident reports
│       └── retell/
│           ├── inbound/route.ts     # Retell AI inbound call webhook for dynamic_variables
│           └── tool/route.ts        # Retell AI custom function-calling endpoint
└── lib/
    ├── emergency-data.ts            # Core types, severity weights, Haversine math & seed CAD data
    ├── aggregator.ts                # Multi-source fetcher (NWS, USGS, EONET, CAD), cache & geocoder
    └── retell-agent-service.ts      # Voice query scoring, specific/general lookup & speech formatter
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `v20+`
- **npm**, **yarn**, **pnpm**, or **bun**

### Installation & Local Development

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open the app in your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000) to explore the live emergency map, or visit [http://localhost:3000/hub](http://localhost:3000/hub) to view the connected data feeds.

---

## 🔌 API Endpoints

### `GET /api/emergency-info`
Returns aggregated emergencies, heatmap points, a synthesized `voiceBriefing`, and per-source health metadata.
- **Query Parameters**:
  - `lat` & `lng` *(optional)*: Target coordinates.
  - `location` *(optional)*: Place name, address, or ZIP code (auto-geocoded if `lat`/`lng` are omitted).
  - `radius` *(optional)*: Search radius in miles (default `75`).
  - `type` / `severity` / `source` / `q` *(optional)*: Filter criteria.

### `POST /api/emergency-info`
Adds a new runtime citizen or dispatch incident report to the live feed.

### `POST /api/retell/tool` (and `GET` for testing/schema)
Custom tool endpoint for the Retell AI voice agent.
- **Example Test Request**:
  ```bash
  curl "http://localhost:3000/api/retell/tool?caller_location=Hollywood+Hills&inquiry_type=specific&specific_event=brush+fire"
  ```
- Visiting `GET /api/retell/tool` with no parameters returns the ready-to-paste **Retell Custom Tool JSON Schema**.

### `POST /api/retell/inbound`
Retell AI Inbound Call Webhook that populates `dynamic_variables` (`active_emergencies_summary`, `total_active_incidents`, `critical_incident_count`, etc.) when a call connects.
