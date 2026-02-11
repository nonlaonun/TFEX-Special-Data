const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/price', async (req, res) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        await page.goto('https://www.tfex.co.th/th/products/currency/usd-thb-futures/market-data', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // รอให้ข้อมูลโหลด
        await new Promise(resolve => setTimeout(resolve, 8000));

        const result = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody.row-group.tb-group-body tr');
            const data = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                
                if (cells.length === 0 || row.querySelector('.placeholder')) {
                    return;
                }
                
                const values = Array.from(cells).map(cell => cell.innerText.trim());
                
                // ตรวจสอบว่ามีข้อมูล contract ที่เป็น USD code (USDG26, USDH26, ...)
                if (values[0] && /^USD[A-Z]\d{2}$/.test(values[0])) {
                    // ฟังก์ชันแปลง string เป็น number
                    const toNumber = (str) => {
                        if (!str || str === '-') return null;
                        // ลบ comma ออก แล้วแปลงเป็น number
                        const cleaned = str.replace(/,/g, '');
                        const num = parseFloat(cleaned);
                        return isNaN(num) ? null : num;
                    };
                    
                    // แยก change และ percentChange
                    let change = null;
                    let percentChange = null;
                    
                    if (values[8]) {
                        const changeMatch = values[8].match(/([+-]?\d+\.?\d*)/g);
                        if (changeMatch && changeMatch.length >= 2) {
                            change = parseFloat(changeMatch[0]);
                            percentChange = parseFloat(changeMatch[1]);
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
                }
            });
            
            return data;
        });

        await browser.close();

        res.status(200).json({
            count: result.length,
            data: result
        });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({
            message: 'Error',
            error: err.message
        });
    }
});

app.get('/margin', async (req, res) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        await page.goto(
            'https://www.tfex.co.th/th/products/currency/usd-thb-futures/margin',
            {
                waitUntil: 'networkidle2',
                timeout: 60000
            }
        );

        // รอ JS render ตาราง
        await new Promise(resolve => setTimeout(resolve, 8000));

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

                const values = Array.from(cells).map(td =>
                    td.innerText.trim()
                );

                const symbol = values[0];

                // เอาเฉพาะสัญญา Futures จริง (USDG26, USDH26, ...)
                if (!/^USD[A-Z]\d{2}$/.test(symbol)) return;

                data.push({
                    ContractSymbol: symbol,
                    Position: values[1],
                    InitialMargin: toNumber(values[2]),
                    MaintenanceMargin: toNumber(values[3]),
                    ForceMargin: toNumber(values[4])
                });
            });

            return data;
        });

        await browser.close();

        res.status(200).json({
            count: result.length,
            data: result
        });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({
            message: 'Error',
            error: err.message
        });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});