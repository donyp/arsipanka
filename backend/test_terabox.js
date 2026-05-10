

// Cookie found from setup_alist.js
const cookieString = "ndus=Y4piXBPpeHuigyUmpSoRf1ZUwOP1po25lMqXjF4d";

async function testTeraboxAPI() {
    console.log("Emptying Terabox recycle bin...");

    try {
        // Terabox empty recycle bin endpoint
        const res = await fetch("https://www.terabox.com/api/recycle/clear?app_id=250528&web=1&clienttype=0", {
            method: 'POST',
            headers: {
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: ''
        });

        const data = await res.text();
        console.log("Response:", res.status);
        console.log("Data:", data);
    } catch (e) {
        console.error("Error:", e);
    }
}

testTeraboxAPI();
