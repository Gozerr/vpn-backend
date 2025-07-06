const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());

let cache = '';
let lastUpdate = 0;
const FILTER_COUNTRIES = ['Netherlands', 'Germany', 'Nederland', 'Deutschland', 'France', 'Canada'];

async function updateCache() {
  try {
    const res = await axios.get('https://www.vpngate.net/api/iphone/', { timeout: 10000 });
    const lines = res.data.split('\n');
    const header = lines[1];
    const filtered = [header];
    for (const line of lines) {
      if (FILTER_COUNTRIES.some(c => line.includes(c))) filtered.push(line);
    }
    cache = [lines[0], ...filtered].join('\n');
    lastUpdate = Date.now();
    console.log('VPNGate cache updated');
  } catch (e) {
    console.error('Failed to update VPNGate cache:', e.message);
  }
}

setInterval(updateCache, 30 * 60 * 1000);
updateCache();

app.get('/vpngate', (req, res) => {
  if (!cache) return res.status(503).send('No data');
  res.set('Content-Type', 'text/plain');
  res.send(cache);
});

app.get('/', (req, res) => res.send('VPNGate Proxy API'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port', port)); 