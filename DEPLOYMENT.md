# Haunt Your Hood — Azure Deployment Guide
**Heritage Pointe, Senoia GA — Halloween Neighborhood App**

---

## Architecture Overview

```
Browser (index.html)
    │
    ├─ Leaflet.js map (OpenStreetMap tiles, free, no key)
    ├─ Nominatim geocoding (free, no key)
    │
    └─► Azure Static Web Apps (frontend hosting)
              │
              └─► Azure Functions v4 (Node 18, REST API)
                        │
                        └─► Azure Cosmos DB NoSQL (houses collection)
```

---

## Step 1 — Create Azure Resources

### Option A: Azure Portal (click-through)

1. **Resource Group**
   - Name: `rg-halloween-heritagepoint`
   - Region: `East US` (closest to GA)

2. **Cosmos DB Account**
   - API: NoSQL (Core SQL)
   - Account name: `cosmos-halloween-heritagepoint`
   - Capacity mode: **Serverless** (free tier, perfect for low traffic)
   - Enable Free Tier discount: ✅
   - Create Database: `halloween`
   - Create Container:
     - Container ID: `houses`
     - Partition key: `/pk`
     - (Partition key value will always be `"Heritage Pointe"`)

3. **Function App**
   - Name: `func-halloween-heritagepoint`
   - Runtime: Node.js 18
   - OS: Linux
   - Plan: **Consumption (Serverless)**
   - Region: `East US`

4. **Static Web App** (for the frontend)
   - Name: `swa-halloween-heritagepoint`
   - Plan: Free
   - Region: `East US 2`
   - Source: GitHub or manual deploy

### Option B: Azure CLI (faster)

```bash
# Variables
RG="rg-halloween-heritagepoint"
LOCATION="eastus"
COSMOS="cosmos-halloween-$(openssl rand -hex 4)"
FUNC="func-halloween-heritagepoint"
STORAGE="sthalloween$(openssl rand -hex 4)"

# Resource group
az group create --name $RG --location $LOCATION

# Cosmos DB (serverless, free tier)
az cosmosdb create \
  --name $COSMOS \
  --resource-group $RG \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --enable-free-tier true

az cosmosdb sql database create \
  --account-name $COSMOS \
  --resource-group $RG \
  --name halloween

az cosmosdb sql container create \
  --account-name $COSMOS \
  --database-name halloween \
  --resource-group $RG \
  --name houses \
  --partition-key-path /pk

# Storage (required for Function App)
az storage account create \
  --name $STORAGE \
  --resource-group $RG \
  --sku Standard_LRS

# Function App
az functionapp create \
  --name $FUNC \
  --resource-group $RG \
  --storage-account $STORAGE \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --os-type Linux
```

---

## Step 2 — Configure Application Settings

Get Cosmos DB connection string:
```bash
az cosmosdb keys list \
  --name $COSMOS \
  --resource-group $RG \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" -o tsv
```

Set Function App settings:
```bash
az functionapp config appsettings set \
  --name $FUNC \
  --resource-group $RG \
  --settings \
    COSMOS_CONNECTION_STRING="<paste-connection-string>" \
    COSMOS_DB_NAME="halloween" \
    COSMOS_CONTAINER_NAME="houses" \
    ALLOWED_ORIGIN="https://<your-static-web-app-url>"
```

---

## Step 3 — Deploy the API

```bash
cd api
npm install
npm install -g azure-functions-core-tools@4

# Deploy to Azure
func azure functionapp publish func-halloween-heritagepoint
```

---

## Step 4 — Deploy the Frontend

**Option A: Azure Static Web Apps (recommended)**
```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./  --app-name swa-halloween-heritagepoint \
               --resource-group rg-halloween-heritagepoint \
               --env production
```

**Option B: Azure Blob Storage (static website hosting)**
```bash
STORAGE_WEB="sthalloweenweb$(openssl rand -hex 4)"

az storage account create \
  --name $STORAGE_WEB \
  --resource-group $RG \
  --sku Standard_LRS \
  --kind StorageV2

az storage blob service-properties update \
  --account-name $STORAGE_WEB \
  --static-website \
  --index-document index.html

az storage blob upload \
  --account-name $STORAGE_WEB \
  --container-name '$web' \
  --name index.html \
  --file ./index.html \
  --content-type text/html
```

---

## Step 5 — Wire Frontend to API

In `index.html`, update this line with your deployed Function App URL:

```javascript
const API_BASE = window.HALLOWEEN_API_URL || 'https://YOUR-FUNCTION-APP.azurewebsites.net/api';
```

**Or** set it via Static Web App config (`staticwebapp.config.json`):
```json
{
  "globalHeaders": {},
  "navigationFallback": { "rewrite": "/index.html" }
}
```

And inject the URL at build time or hardcode it directly.

---

## Cost Estimate

| Resource | Tier | Est. Monthly Cost |
|---|---|---|
| Cosmos DB | Serverless + Free Tier | **$0** (under 1000 RU/s) |
| Azure Functions | Consumption | **$0** (1M free executions/mo) |
| Static Web App | Free | **$0** |
| Blob Storage (alt) | LRS | ~$0.02 |
| **Total** | | **~$0/month** |

This app will comfortably run within Azure's free tier.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/houses` | List all Heritage Pointe houses |
| `POST` | `/api/houses` | Register a new house |
| `DELETE` | `/api/houses/{id}` | Remove a house |

### POST /api/houses — Request Body
```json
{
  "address":    "123 Heritage Pointe Pkwy",
  "name":       "The Smiths",
  "generosity": 4,
  "hours":      "6:00 PM – 9:00 PM",
  "offers":     ["candy", "fullsize", "decorations"],
  "notes":      "Nut-free candy only",
  "lat":        33.3048,
  "lng":        -84.5515
}
```

---

## Cosmos DB Schema

```json
{
  "id":           "1698765432_a3b2c",
  "pk":           "Heritage Pointe",
  "address":      "123 Heritage Pointe Pkwy",
  "name":         "The Smiths",
  "generosity":   4,
  "hours":        "6:00 PM – 9:00 PM",
  "offers":       ["candy", "fullsize"],
  "notes":        "Nut-free candy",
  "lat":          33.3048,
  "lng":          -84.5515,
  "neighborhood": "Heritage Pointe",
  "city":         "Senoia",
  "state":        "GA",
  "createdAt":    "2025-10-31T18:00:00.000Z"
}
```

---

## Notes

- **Geocoding**: Uses Nominatim (OpenStreetMap) — free, no API key required. Rate limited to 1 req/sec, which is fine for this use case.
- **Auth**: No authentication is implemented. If you want to prevent abuse, add Azure API Management or a simple token check via Function App settings.
- **CORS**: Set `ALLOWED_ORIGIN` in Function App settings to your Static Web App URL in production.
- **Dev mode**: The frontend falls back to `localStorage` automatically if the API URL is not configured, so you can test locally without the backend.
