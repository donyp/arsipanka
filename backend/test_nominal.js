function extractMetadata(filename) {
    const name = filename.replace(/\.pdf$/i, '').toUpperCase();
    let meta = { total: 0, tipe_ppn: 'NON' };

    // 1. Context-Aware Nominal Extraction (Look for number after PPN/NON)
    const contextMatch = name.match(/(?:PPN|NON)\s+(\d{1,3}(?:\.\d{3})+|\d+|\b0\b)/);
    if (contextMatch) {
        meta.total = parseFloat(contextMatch[1].replace(/\./g, '')) || 0;
        console.log(`[TEST] Context-Match found: ${meta.total} in "${filename}"`);
    } else {
        // Fallback: Greedy Nominal Regex (legacy)
        const priceMatch = name.match(/\d{1,3}(?:\.\d{3})+|\d{5,10}/);
        if (priceMatch) {
            meta.total = parseFloat(priceMatch[0].replace(/\./g, '')) || 0;
            console.log(`[TEST] Fallback match: ${meta.total} in "${filename}"`);
        } else {
            console.log(`[TEST] NO MATCH in "${filename}"`);
        }
    }
    return meta;
}

const tests = [
    "[Karawang Timur] PPN 0 9 MEI",
    "[Alumunium Karawang] PPN 0 12 MEI",
    "[Store] PPN 5000 3 MEI",
    "[Sawangan] NON 15.370.000 3 MEI",
    "RANDOM 9 MEI"
];

tests.forEach(extractMetadata);
