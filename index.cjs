const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());

let cache = '';
let lastUpdate = 0;

// --- GitHub OpenVPN sources ---
const GITHUB_OVPN_SOURCES = [
  {
    api: 'https://api.github.com/repos/hagezi/openvpn-list/contents/',
    raw: 'https://raw.githubusercontent.com/hagezi/openvpn-list/main/'
  },
  {
    api: 'https://api.github.com/repos/aztecrabbit/free-openvpn/contents/',
    raw: 'https://raw.githubusercontent.com/aztecrabbit/free-openvpn/main/'
  },
];


async function fetchOvpnFromGithub() {
  let servers = [];
  for (const src of GITHUB_OVPN_SOURCES) {
    try {
      console.log('Получаю список .ovpn с', src.api);
      const res = await axios.get(src.api, { timeout: 15000, headers: { 'User-Agent': 'vpn-app-bot' } });
      const files = res.data.filter(f => f.name.endsWith('.ovpn'));
      for (const file of files) {
        try {
          const rawUrl = src.raw + file.name;
          const ovpnRes = await axios.get(rawUrl, { timeout: 15000 });
          servers.push({
            name: file.name.replace('.ovpn', ''),
            ovpn: ovpnRes.data,
            source: rawUrl
          });
        } catch (e) {
          console.log('Ошибка загрузки ovpn:', file.name, e.message);
        }
      }
      console.log(`Добавлено ${files.length} .ovpn из ${src.api}`);
    } catch (e) {
      console.log('Ошибка получения списка .ovpn:', src.api, e.message);
    }
  }
  return servers;
}

async function updateCache() {
  try {
    const githubOvpn = await fetchOvpnFromGithub();
    if (githubOvpn.length > 0) {
      const header = 'HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64';
      const servers = [header];
      for (const s of githubOvpn) {
        const b64 = Buffer.from(s.ovpn, 'utf-8').toString('base64');
        servers.push([s.name, '', '', '', '', 'GitHub', 'GH', '', '', '', '', '', '', '', b64].join(','));
      }
      cache = ['*vpn_servers', ...servers].join('\n');
      lastUpdate = Date.now();
      console.log('Cache updated from GitHub OVPN only');
      return;
    }
    cache = '*vpn_servers\nHostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64';
    lastUpdate = Date.now();
    console.log('Нет доступных серверов GitHub');
  } catch (e) {
    console.error('Failed to update cache:', e.message);
    cache = '*vpn_servers\nHostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64';
    lastUpdate = Date.now();
  }
}

setInterval(updateCache, 30 * 60 * 1000);
updateCache();

app.get('/vpngate', (req, res) => {
  if (!cache) return res.status(503).send('No data');
  res.set('Content-Type', 'text/plain');
  res.send(cache);
});

app.get('/status', (req, res) => {
  res.json({
    hasCache: !!cache,
    lastUpdate: lastUpdate,
    cacheAge: Date.now() - lastUpdate
  });
});

app.get('/', (req, res) => res.send('GitHub OVPN Proxy API'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port', port));