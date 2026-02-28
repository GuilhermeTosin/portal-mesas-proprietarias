import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../data/market_data.json');

async function scrapeCMESettle() {
    console.log('--- Iniciando extração CME Settlement via Deep Bypass ---');

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-http2', // Evita ERR_HTTP2_PROTOCOL_ERROR
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    });

    // Scripts de camuflagem manuais (Commonly used to bypass bot detect)
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const urls = {
        spx: 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.settlements.html',
        nasdaq: 'https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.settlements.html'
    };

    const results = {
        spx: null,
        nasdaq: null
    };

    try {
        const page = await context.newPage();

        // PASSO 1: Inicialização de Sessão (Visita Home para ganhar cookies/confiança)
        console.log('Iniciando sessão em cmegroup.com...');
        try {
            await page.goto('https://www.cmegroup.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(5000 + Math.random() * 5000); // Pausa humana
        } catch (e) {
            console.warn('Aviso na inicialização da home:', e.message);
        }

        // PASSO 2: Extração de Dados
        for (const [key, url] of Object.entries(urls)) {
            console.log(`Buscando dados para ${key.toUpperCase()} diretamente no CME...`);

            let success = false;
            let retries = 3; // Aumentado para 3 tentativas

            while (retries > 0 && !success) {
                let page = null;
                try {
                    page = await context.newPage();
                    // Timeout estendido para 90s para lidar com WAF lento
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

                    console.log(`Pagina carregada. Aguardando estabilização (15s)...`);
                    await page.waitForTimeout(15000);

                    const settleValue = await page.evaluate(() => {
                        const currentYear = new Date().getFullYear();
                        const yearSuffix = currentYear.toString().slice(-2);
                        const activeMonths = ['MAR', 'JUN', 'SEP', 'DEC'];

                        const rows = Array.from(document.querySelectorAll('tr'));

                        // Procura por contratos do ano atual ou próximo
                        for (const row of rows) {
                            const text = row.innerText.toUpperCase();
                            const hasActiveMonth = activeMonths.some(m => text.includes(m));
                            const hasYear = text.includes(yearSuffix);

                            if (hasActiveMonth && hasYear) {
                                const cells = row.querySelectorAll('td');
                                // Busca o primeiro valor que parece preço (geralmente SETTLE está no final)
                                for (let i = 4; i < cells.length; i++) {
                                    const val = cells[i].innerText.trim();
                                    if (val && !isNaN(parseFloat(val.replace(/,/g, '')))) {
                                        return val;
                                    }
                                }
                            }
                        }
                        return null;
                    });

                    if (settleValue) {
                        results[key] = parseFloat(settleValue.replace(/,/g, ''));
                        console.log(`✅ SUCESSO CME! ${key.toUpperCase()}: ${results[key]}`);
                        success = true;
                    } else {
                        console.log(`⚠️ Tentativa ${4 - retries}: Valor não encontrado. Analisando estrutura...`);
                        // Debug: Logar parte do HTML se falhar
                        const content = await page.content();
                        if (content.includes('Access Denied') || content.includes('Cloudflare') || content.includes('Pardon Our Interruption')) {
                            console.error(`❌ Bloqueio Detectado (WAF/Challenge): ${content.slice(0, 500)}...`);
                        } else {
                            console.log(`Estrutura da página parece limpa, mas os dados não foram encontrados.`);
                        }
                        throw new Error('Dados não encontrados no DOM');
                    }
                } catch (err) {
                    console.warn(`Tentativa ${4 - retries} falhou para ${key}: ${err.message}`);
                    retries--;
                    if (page) await page.close();
                    await new Promise(r => setTimeout(r, 10000)); // Espera 10s entre retries
                } finally {
                    if (page && !page.isClosed()) await page.close();
                }
            }

            // FALLBACK: Só entra se todas as 3 tentativas diretas falharem
            if (!success) {
                console.log(`🚨 CME Bloqueado permanentemente após retries. Tentando Fallback para ${key}...`);
                const subPage = await context.newPage();
                const invUrl = key === 'spx' ?
                    'https://br.investing.com/indices/us-spx-500-futures' :
                    'https://br.investing.com/indices/nq-100-futures';

                try {
                    await subPage.goto(invUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await subPage.waitForTimeout(5000);
                    const invValue = await subPage.evaluate(() => {
                        const el = document.querySelector('[data-test="prevClose"]');
                        return el ? el.innerText.trim() : null;
                    });

                    if (invValue) {
                        results[key] = parseFloat(invValue.replace(/\./g, '').replace(',', '.'));
                        console.log(`🏁 Fallback OK para ${key.toUpperCase()}: ${results[key]}`);
                    }
                } catch (err) {
                    console.error(`❌ Falha TOTAL para ${key}: ${err.message}`);
                } finally {
                    await subPage.close();
                }
            }
        }

        // Atualiza o JSON
        if (results.spx || results.nasdaq) {
            const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

            currentData.settlement = {
                spx: results.spx || currentData.settlement.spx,
                nasdaq: results.nasdaq || currentData.settlement.nasdaq,
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));
            console.log('--- Processo concluído e JSON atualizado ---');
        }

    } catch (error) {
        console.error('Erro fatal no processo de bypass:', error);
    } finally {
        await browser.close();
    }
}

scrapeCMESettle();
