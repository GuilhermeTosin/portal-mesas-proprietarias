import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../data/gex_market.json');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
};

async function fetchStooqPrice(symbol) {
    const stooqSymbol = symbol === 'SPY' ? 'spy.us' : 'qqq.us';
    // Use a different Stooq URL format that is more reliable for simple GETs
    const url = `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlcv&h&e=csv`;

    try {
        console.log(`Tentando Stooq para ${symbol}...`);
        const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 10000 });
        const data = response.data;
        if (data && typeof data === 'string') {
            const lines = data.split('\n');
            if (lines.length > 1) {
                const parts = lines[1].split(',');
                const closePrice = parseFloat(parts[parts.length - 2]); // Close is the 2nd to last column in this CSV format
                if (!isNaN(closePrice)) return closePrice;
            }
        }
    } catch (error) {
        console.warn(`Stooq falhou para ${symbol}:`, error.message);
    }
    return null;
}

async function fetchGexData(symbol, targetSymbol) {
    console.log(`Buscando dados para ${symbol}...`);

    try {
        // Tentativa via Yahoo com Headers avançados
        const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
        const response = await axios.get(url, {
            headers: BROWSER_HEADERS,
            timeout: 15000
        });

        if (!response.data || !response.data.optionChain) {
            throw new Error("Resposta inválida do Yahoo");
        }

        const result = response.data.optionChain.result[0];
        const options = result.options[0];
        const quote = result.quote;

        let maxCallOI = 0;
        let callWall = 0;
        let maxPutOI = 0;
        let putWall = 0;

        options.calls.forEach(opt => {
            if (opt.openInterest > maxCallOI) {
                maxCallOI = opt.openInterest;
                callWall = opt.strike;
            }
        });

        options.puts.forEach(opt => {
            if (opt.openInterest > maxPutOI) {
                maxPutOI = opt.openInterest;
                putWall = opt.strike;
            }
        });

        if (symbol === 'SPY') {
            callWall *= 10;
            putWall *= 10;
        }

        const zeroGamma = (callWall + putWall) / 2;

        let lastPrice = quote.regularMarketPrice * (symbol === 'SPY' ? 10 : (symbol === 'QQQ' ? 40 : 1));
        if (!lastPrice) {
            const stooqPrice = await fetchStooqPrice(symbol);
            if (stooqPrice) lastPrice = stooqPrice * (symbol === 'SPY' ? 10 : (symbol === 'QQQ' ? 40 : 1));
        }

        const regime = lastPrice > zeroGamma ? 'Positive' : 'Negative';

        return {
            name: targetSymbol === 'ES=F' ? 'S&P 500' : 'Nasdaq 100',
            symbol: targetSymbol,
            lastPrice: parseFloat(lastPrice.toFixed(2)),
            gexTotal: parseFloat(((maxCallOI - maxPutOI) / 1000000).toFixed(2)),
            regime,
            zeroGamma: Math.round(zeroGamma),
            callWall: Math.round(callWall),
            putWall: Math.round(putWall),
            updatedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error(`Erro ao buscar ${symbol}: ${error.message}`);

        const partialPrice = await fetchStooqPrice(symbol);
        if (partialPrice) {
            const price = partialPrice * (symbol === 'SPY' ? 10 : (symbol === 'QQQ' ? 40 : 1));
            return { priceOnly: price };
        }

        return null;
    }
}

async function main() {
    let currentData = { spx: {}, nasdaq: {} };
    if (fs.existsSync(DATA_FILE)) {
        currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }

    const spxUpdated = await fetchGexData('SPY', 'ES=F');
    const ndxUpdated = await fetchGexData('QQQ', 'NQ=F');

    const newData = {
        spx: spxUpdated?.priceOnly ? { ...currentData.spx, lastPrice: spxUpdated.priceOnly, updatedAt: new Date().toISOString() } : (spxUpdated || currentData.spx),
        nasdaq: ndxUpdated?.priceOnly ? { ...currentData.nasdaq, lastPrice: ndxUpdated.priceOnly, updatedAt: new Date().toISOString() } : (ndxUpdated || currentData.nasdaq)
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
    console.log('\n\x1b[32m%s\x1b[0m', '✅ GEX Market Data finalizado.');

    if (!spxUpdated || !ndxUpdated || spxUpdated.priceOnly || ndxUpdated.priceOnly) {
        console.log('\x1b[33m%s\x1b[0m', '\n⚠️  Aviso: Alguns dados automáticos falharam.');
        console.log('\x1b[33m%s\x1b[0m', '💡 Dica: Se o bloqueio persistir, use o comando:');
        console.log('\x1b[33m%s\x1b[0m', '   npm run set-gex');
        console.log('\x1b[33m%s\x1b[0m', '   para inserir os níveis manualmente.\n');
    }
}

main();
