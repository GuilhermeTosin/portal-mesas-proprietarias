import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/gex_market.json');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('\x1b[36m%s\x1b[0m', '--- Configuração Manual de Níveis GEX ---');

    let currentData = { spx: {}, nasdaq: {} };
    if (fs.existsSync(DATA_FILE)) {
        currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }

    const markets = [
        { key: 'spx', name: 'S&P 500' },
        { key: 'nasdaq', name: 'Nasdaq 100' }
    ];

    for (const market of markets) {
        console.log(`\nConfigurando ${market.name}:`);

        const lastPrice = await question(`Preço Atual (${currentData[market.key].lastPrice || '---'}): `);
        const callWall = await question(`Call Wall (${currentData[market.key].callWall || '---'}): `);
        const putWall = await question(`Put Wall (${currentData[market.key].putWall || '---'}): `);
        const zeroGamma = await question(`Zero Gamma (${currentData[market.key].zeroGamma || '---'}): `);
        const gexTotal = await question(`GEX Total em bn (${currentData[market.key].gexTotal || '---'}): `);

        if (lastPrice) currentData[market.key].lastPrice = parseFloat(lastPrice);
        if (callWall) currentData[market.key].callWall = parseFloat(callWall);
        if (putWall) currentData[market.key].putWall = parseFloat(putWall);
        if (zeroGamma) currentData[market.key].zeroGamma = parseFloat(zeroGamma);
        if (gexTotal) currentData[market.key].gexTotal = parseFloat(gexTotal);

        currentData[market.key].regime = currentData[market.key].lastPrice > currentData[market.key].zeroGamma ? 'Positive' : 'Negative';
        currentData[market.key].updatedAt = new Date().toISOString();
        currentData[market.key].name = market.name;
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));
    console.log('\n\x1b[32m%s\x1b[0m', '✅ Dados GEX atualizados com sucesso!');
    rl.close();
}

main().catch(err => {
    console.error('Erro:', err);
    rl.close();
});
