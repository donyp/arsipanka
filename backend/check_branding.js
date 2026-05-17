async function checkBranding() {
    const res = await fetch('https://ankaindonesia-arsip.hf.space/');
    const text = await res.text();
    if (text.includes('Pusat Arsip Anka')) {
        console.log("Branding: FOUND :)");
    } else {
        console.log("Branding: NOT FOUND (Still Arsip Digital) :(");
        const match = text.match(/<h1[^>]*>(.*?)<\/h1>/);
        console.log("Current H1:", match ? match[1] : "Not found");
    }
}
checkBranding();
