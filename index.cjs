const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(cors());

let cache = '';
let lastUpdate = 0;
const FILTER_COUNTRIES = ['Netherlands', 'Germany', 'Nederland', 'Deutschland', 'France', 'Canada'];

// --- Автоматическая загрузка свежего списка прокси ---
let PROXY_LIST = [];
const LOCAL_PROXY_LIST = [
  'http://103.149.162.195:80',
  'http://103.149.162.194:80',
  'http://103.149.162.193:80',
  'http://103.149.162.192:80',
  'http://103.149.162.191:80',
  'http://103.149.162.190:80',
  'http://103.149.162.189:80',
  'http://103.149.162.188:80',
  'http://103.149.162.187:80',
  'http://103.149.162.186:80',
  'http://103.149.162.185:80',
  'http://103.149.162.184:80',
  'http://103.149.162.183:80',
  'http://103.149.162.182:80',
  'http://103.149.162.181:80',
  'http://103.149.162.180:80',
];

async function fetchProxyList() {
  try {
    console.log('Загружаю свежий список прокси с GitHub...');
    const url = 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/http.txt';
    const res = await axios.get(url, { timeout: 10000 });
    const proxies = res.data.split('\n').map(x => x.trim()).filter(Boolean).map(x => 'http://' + x.replace(/^http:\/\//, ''));
    if (proxies.length > 0) {
      PROXY_LIST = proxies;
      console.log(`Загружено ${proxies.length} прокси.`);
    } else {
      throw new Error('Пустой список с GitHub');
    }
  } catch (e) {
    console.log('Не удалось загрузить прокси с GitHub, fallback на локальный список.');
    PROXY_LIST = LOCAL_PROXY_LIST;
  }
}

// Демо-сервера как fallback
const DEMO_SERVERS = `*vpn_servers\nHostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64\nvpn123456789.opengw.net,185.199.108.153,1234567,50,1000000,Netherlands,NL,100,1234567,1000,1000000000,1,OpenVPN,,\nvpn987654321.opengw.net,185.199.109.153,9876543,30,2000000,Germany,DE,150,9876543,1500,2000000000,1,OpenVPN,,\nvpn555666777.opengw.net,185.199.110.153,5556667,40,1500000,France,FR,120,5556667,1200,1500000000,1,OpenVPN,,`;

// Альтернативные источники серверов
const ALTERNATIVE_SOURCES = [
  'https://raw.githubusercontent.com/vpn-gate/vpn-gate.github.io/master/_data/servers.yml',
  'https://api.github.com/repos/vpn-gate/vpn-gate.github.io/contents/_data/servers.yml'
];

async function tryWithProxy(proxyUrl) {
  try {
    const proxy = {
      host: proxyUrl.split('://')[1].split(':')[0],
      port: parseInt(proxyUrl.split(':').pop()),
      protocol: proxyUrl.split('://')[0]
    };
    
    console.log(`Trying proxy: ${proxyUrl}`);
    const res = await axios.get('https://www.vpngate.net/api/iphone/', {
      timeout: 10000,
      proxy: proxy,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log(`Proxy ${proxyUrl} SUCCESS!`);
    return res.data;
  } catch (e) {
    console.log(`Proxy ${proxyUrl} failed: ${e.message}`);
    return null;
  }
}

async function tryMultipleProxies(proxyList, maxConcurrent = 5) {
  console.log(`Testing ${proxyList.length} proxies with max ${maxConcurrent} concurrent...`);
  
  for (let i = 0; i < proxyList.length; i += maxConcurrent) {
    const batch = proxyList.slice(i, i + maxConcurrent);
    const promises = batch.map(proxy => tryWithProxy(proxy));
    
    try {
      const results = await Promise.race(promises.map((promise, index) => 
        promise.then(result => ({ result, index: i + index }))
      ));
      
      if (results && results.result) {
        console.log(`Found working proxy at index ${results.index}: ${batch[results.index - i]}`);
        return results.result;
      }
    } catch (e) {
      console.log(`Batch ${i / maxConcurrent + 1} failed`);
    }
  }
  
  return null;
}

async function tryAlternativeSource(url) {
  try {
    console.log(`Trying alternative source: ${url}`);
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (url.includes('github.com')) {
      // GitHub API возвращает base64 контент
      const content = Buffer.from(res.data.content, 'base64').toString();
      return content;
    }
    return res.data;
  } catch (e) {
    console.log(`Alternative source ${url} failed:`, e.message);
    return null;
  }
}

async function updateCache() {
  try {
    console.log('Updating VPNGate cache...');
    
    // Сначала пробуем без прокси
    try {
      const res = await axios.get('https://www.vpngate.net/api/iphone/', { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const data = res.data;
      const lines = data.split('\n');
      const header = lines[1];
      const filtered = [header];
      for (const line of lines) {
        if (FILTER_COUNTRIES.some(c => line.includes(c))) filtered.push(line);
      }
      cache = [lines[0], ...filtered].join('\n');
      lastUpdate = Date.now();
      console.log('VPNGate cache updated (direct connection)');
      return;
    } catch (e) {
      console.log('Direct connection failed, trying proxies...');
    }
    
    // Если прямой доступ не работает, пробуем через прокси параллельно
    console.log('Trying proxies...');
    const proxyData = await tryMultipleProxies(PROXY_LIST, 10);
    if (proxyData) {
      const lines = proxyData.split('\n');
      const header = lines[1];
      const filtered = [header];
      for (const line of lines) {
        if (FILTER_COUNTRIES.some(c => line.includes(c))) filtered.push(line);
      }
      cache = [lines[0], ...filtered].join('\n');
      lastUpdate = Date.now();
      console.log('VPNGate cache updated via proxy');
      return;
    }
    
    // Если все прокси не работают, пробуем альтернативные источники
    for (const source of ALTERNATIVE_SOURCES) {
      const data = await tryAlternativeSource(source);
      if (data) {
        // Парсим альтернативный формат и конвертируем в формат VPNGate
        const servers = parseAlternativeFormat(data);
        if (servers.length > 0) {
          cache = servers.join('\n');
          lastUpdate = Date.now();
          console.log(`Cache updated via alternative source: ${source}`);
          return;
        }
      }
    }
    
    console.error('All sources failed, using demo servers');
    cache = DEMO_SERVERS;
    lastUpdate = Date.now();
  } catch (e) {
    console.error('Failed to update VPNGate cache:', e.message);
    cache = DEMO_SERVERS;
    lastUpdate = Date.now();
  }
}

function parseAlternativeFormat(data) {
  try {
    // Простой парсер для YAML или других форматов
    const lines = data.split('\n');
    const servers = [];
    
    for (const line of lines) {
      if (line.includes('server:') || line.includes('hostname:')) {
        // Извлекаем информацию о сервере
        const serverInfo = extractServerInfo(line);
        if (serverInfo) {
          servers.push(serverInfo);
        }
      }
    }
    
    return servers;
  } catch (e) {
    console.error('Failed to parse alternative format:', e.message);
    return [];
  }
}

function extractServerInfo(line) {
  // Простая экстракция информации о сервере
  // Можно расширить для разных форматов
  return null; // Пока возвращаем null, нужно реализовать парсинг
}

// В начале запускаем fetchProxyList, затем updateCache
(async () => {
  await fetchProxyList();
  await updateCache();
  setInterval(updateCache, 30 * 60 * 1000);
})();

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

app.get('/', (req, res) => res.send('VPNGate Proxy API'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port', port)); 