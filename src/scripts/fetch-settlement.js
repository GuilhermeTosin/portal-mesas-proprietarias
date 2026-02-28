import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../data/settlements.json');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.cmegroup.com/',
    'Connection': 'keep-alive'
};

const CME_URLS = {
    spx: 'https://www.cmegroup.com/api/cme/v1/settlements/equities/sp/e-mini-sandp500.json',
    nasdaq: 'https://www.cmegroup.com/api/cme/v1/settlements/equities/nasdaq/e-mini-nasdaq-100.json'
};

async function fetchYahooSettlement(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    try {
        const response = await axios.get(url, { headers: BROWSER_HEADERS });
        const meta = response.data.chart.result[0].meta;
        return meta.chartPreviousClose || meta.previousClose;
    } catch (error) {
        console.warn(`Yahoo fallback falhou para ${symbol}:`, error.message);
        return null;
    }
}

async function fetchCmeSettlement(marketKey, symbol) {
    console.log(`Buscando settlement CME para ${marketKey}...`);
    try {
        const response = await axios.get(CME_URLS[marketKey], { headers: BROWSER_HEADERS, timeout: 10000 });
        const data = response.data;

        // A estrutura do JSON da CME pode variar, geralmente é uma lista de contratos
        // O primeiro contrato (front month) é o que buscamos
        if (data && data.settlements && data.settlements.length > 0) {
            const settle = parseFloat(data.settlements[0].settle);
            if (!isNaN(settle)) return settle;
        }
        throw new Error('Formato CME inesperado ou vazio');
    } catch (error) {
        console.error(`CME falhou para ${marketKey} (${error.message}). Usando Yahoo fallback...`);
        return await fetchYahooSettlement(symbol);
    }
}

async function main() {
    const spxSettle = await fetchCmeSettlement('spx', 'ES=F');
    const nasdaqSettle = await fetchCmeSettlement('nasdaq', 'NQ=F');

    const result = {
        spx: {
            settle: spxSettle,
            source: spxSettle ? 'CME' : 'NONE',
            updatedAt: new Date().toISOString()
        },
        nasdaq: {
            settle: nasdaqSettle,
            source: nasdaqSettle ? 'CME' : 'NONE',
            updatedAt: new Date().toISOString()
        }
    };

    // Ensure data directory exists
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2));
    console.log('Successfully updated settlements.json');
}

main();
