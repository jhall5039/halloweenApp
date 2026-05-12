// ─────────────────────────────────────────────────────────────────────────────
//  Haunt Your Hood — Azure Functions Backend
//  Runtime: Node.js 18+  |  Database: Azure Cosmos DB (NoSQL)
//  Deploy: Azure Functions v4 (isolated worker model)
// ─────────────────────────────────────────────────────────────────────────────

const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

// ── Cosmos DB client (configured via Application Settings) ──
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const db         = client.database(process.env.COSMOS_DB_NAME     || 'halloween');
const container  = db.container(process.env.COSMOS_CONTAINER_NAME || 'houses');

// ── CORS helper ──
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  OPTIONS — preflight handler
// ─────────────────────────────────────────────────────────────────────────────
app.http('options-houses', {
  methods: ['OPTIONS'],
  route: 'houses/{*rest}',
  authLevel: 'anonymous',
  handler: async () => ({ status: 204, headers: corsHeaders() })
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/houses  — list all houses for Heritage Point
// ─────────────────────────────────────────────────────────────────────────────
app.http('getHouses', {
  methods: ['GET'],
  route: 'houses',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('GET /api/houses');
    try {
      const { resources } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.neighborhood = @neighborhood ORDER BY c.createdAt DESC',
          parameters: [{ name: '@neighborhood', value: 'Heritage Pointe' }]
        })
        .fetchAll();

      return {
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify(resources)
      };
    } catch (err) {
      context.error('getHouses error:', err);
      return {
        status: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to fetch houses', detail: err.message })
      };
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/houses  — register a new participating house
// ─────────────────────────────────────────────────────────────────────────────
app.http('createHouse', {
  methods: ['POST'],
  route: 'houses',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log('POST /api/houses');
    try {
      const body = await request.json();

      // Validate required fields
      if (!body.address || typeof body.address !== 'string') {
        return {
          status: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'address is required' })
        };
      }

      // Sanitize & build document
      const house = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        address:      body.address.trim().substring(0, 100),
        name:         (body.name       || '').trim().substring(0, 60),
        generosity:   Math.min(5, Math.max(1, parseInt(body.generosity) || 3)),
        hours:        (body.hours      || '').trim().substring(0, 50),
        offers:       Array.isArray(body.offers) ? body.offers.filter(o => typeof o === 'string').slice(0, 10) : [],
        foodNote:     (body.foodNote   || '').trim().substring(0, 100),
        otherNote:    (body.otherNote  || '').trim().substring(0, 100),
        notes:        (body.notes      || '').trim().substring(0, 300),
        lat:          typeof body.lat === 'number' ? body.lat : null,
        lng:          typeof body.lng === 'number' ? body.lng : null,
        neighborhood: 'Heritage Pointe',
        city:         'Senoia',
        state:        'GA',
        createdAt:    new Date().toISOString(),
        // Partition key = neighborhood for efficient queries
        pk:           'Heritage Pointe'
      };

      const { resource } = await container.items.create(house);

      return {
        status: 201,
        headers: corsHeaders(),
        body: JSON.stringify(resource)
      };
    } catch (err) {
      context.error('createHouse error:', err);
      return {
        status: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to create house', detail: err.message })
      };
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/houses/{id}  — remove a house by id
// ─────────────────────────────────────────────────────────────────────────────
app.http('deleteHouse', {
  methods: ['DELETE'],
  route: 'houses/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const id = request.params.id;
    context.log(`DELETE /api/houses/${id}`);
    try {
      await container.item(id, 'Heritage Pointe').delete();
      return {
        status: 204,
        headers: corsHeaders()
      };
    } catch (err) {
      if (err.code === 404) {
        return { status: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };
      }
      context.error('deleteHouse error:', err);
      return {
        status: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to delete house' })
      };
    }
  }
});
