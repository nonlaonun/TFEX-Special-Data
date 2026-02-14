const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

let browser;

// 🔥 เปิด browser แค่ครั้งเดียว
async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--disable-default-apps'
            ]
        });
    }
    return browser;
}

// 🔥 ปิด resource ที่ไม่จำเป็น (ลด RAM เยอะมาก)
async function optimizePage(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'stylesheet' || type === 'font') {
            req.abort();
        } else {
            req.continue();
        }
    });
}

app.get('/price', async (req, res) => {
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await optimizePage(page);

        await page.goto(
            'https://www.tfex.co.th/th/products/currency/usd-thb-futures/market-data',
            { waitUntil: 'domcontentloaded', timeout: 60000 }
        );

        await page.waitForSelector('tbody.row-group.tb-group-body tr');

        const result = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody.row-group.tb-group-body tr');
            const data = [];

            const toNumber = (str) => {
                if (!str || str === '-') return null;
                const cleaned = str.replace(/,/g, '');
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : num;
            };

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length === 0) return;

                const values = Array.from(cells).map(c => c.innerText.trim());
                if (!/^USD[A-Z]\d{2}$/.test(values[0])) return;

                let change = null;
                let percentChange = null;

                if (values[8]) {
                    const match = values[8].match(/([+-]?\d+\.?\d*)/g);
                    if (match && match.length >= 2) {
                        change = parseFloat(match[0]);
                        percentChange = parseFloat(match[1]);
                    }
                }

                data.push({
                    ContractSymbol: values[0],
                    ExpireMonth: values[1],
                    Open: toNumber(values[2]),
                    High: toNumber(values[3]),
                    Low: toNumber(values[4]),
                    Bid: toNumber(values[5]),
                    Ask: toNumber(values[6]),
                    Last: toNumber(values[7]),
                    Change: change,
                    PercentChange: percentChange,
                    Volume: toNumber(values[9]),
                    OpenInterest: toNumber(values[10]),
                    LastSettlement: toNumber(values[11])
                });
            });

            return data;
        });

        await page.close();

        res.json({ count: result.length, data: result });

    } catch (err) {
        if (page) await page.close();
        res.status(500).json({ error: err.message });
    }
});

app.get('/margin', async (req, res) => {
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await optimizePage(page);

        await page.goto(
            'https://www.tfex.co.th/th/products/currency/usd-thb-futures/margin',
            { waitUntil: 'domcontentloaded', timeout: 60000 }
        );

        await page.waitForSelector('tbody tr');

        const result = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            const data = [];

            const toNumber = (str) => {
                if (!str || str === '-') return null;
                const cleaned = str.replace(/,/g, '');
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : num;
            };

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return;

                const values = Array.from(cells).map(td => td.innerText.trim());
                if (!/^USD[A-Z]\d{2}$/.test(values[0])) return;

                data.push({
                    ContractSymbol: values[0],
                    Position: values[1],
                    InitialMargin: toNumber(values[2]),
                    MaintenanceMargin: toNumber(values[3]),
                    ForceMargin: toNumber(values[4])
                });
            });

            return data;
        });

        await page.close();

        res.json({ count: result.length, data: result });

    } catch (err) {
        if (page) await page.close();
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
