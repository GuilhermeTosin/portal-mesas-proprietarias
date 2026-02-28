import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/market_data.json');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

const URLS = {
    spx: 'https://br.investing.com/indices/us-spx-500-futures',
    nasdaq: 'https://br.investing.com/indices/nq-100-futures'
};

async function fetchInvestingSettle(marketKey) {
    console.log(`Buscando settlement Investing.com para ${marketKey}...`);
    try {
        const response = await axios.get(URLS[marketKey], { headers: BROWSER_HEADERS, timeout: 15000 });
        const html = response.data;

        // Try to find the previous close using data-test attribute
        // Structure is usually: <dd data-test="prevClose" ...><span><span>5.875,00</span></span></dd>
        const regex = /data-test="prevClose"[^>]*>(?:<[^>]+>)*\s*([\d.,\s]+)\s*(?:<[^>]+>)*<\/dd>/i;
        const match = html.match(regex);

        if (match && match[1]) {
            let valueStr = match[1].trim();
            // Handle European/Brazilian format: 5.000,00 -> 5000.00
            // Remove dots (thousands separator) and replace comma with dot
            const cleaned = valueStr.replace(/\./g, '').replace(',', '.');
            const settle = parseFloat(cleaned);
            if (!isNaN(settle)) {
                console.log(`Sucesso ${marketKey}: ${settle}`);
                return settle;
            }
        }

        console.warn(`Aviso: Valor de settlement não encontrado no HTML para ${marketKey}.`);
        return null;
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.error('\x1b[31m%s\x1b[0m', `Acesso bloqueado pelo Investing.com para ${marketKey}. Verifique os Headers ou use um Proxy.`);
        } else {
            console.error(`Erro ao buscar ${marketKey}: ${error.message}`);
        }
        return null;
    }
}

async function main() {
    const spxSettle = await fetchInvestingSettle('spx');
    const nasdaqSettle = await fetchInvestingSettle('nasdaq');

    let currentMarketData = { settlement: {} };
    if (fs.existsSync(DATA_FILE)) {
        try {
            currentMarketData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            console.warn('market_data.json corrompido, resetando...');
        }
    }

    if (!currentMarketData.settlement) currentMarketData.settlement = {};

    currentMarketData.settlement = {
        spx: spxSettle || currentMarketData.settlement?.spx || 0,
        nasdaq: nasdaqSettle || currentMarketData.settlement?.nasdaq || 0,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(currentMarketData, null, 2));
    console.log('\n\x1b[32m%s\x1b[0m', '✅ market_data.json atualizado com sucesso.');
}

main();
