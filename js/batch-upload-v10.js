// ============================================================
// Batch Upload Logic — v1.0
// Handles Excel parsing and row-by-row PDF attachments
// ============================================================

let batchData = [];
let zonas = [];
let tokos = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;

    await loadMappingData();
});

async function loadMappingData() {
    try {
        const { data: zData } = await supabase.from('zonas').select('*');
        const { data: tData } = await supabase.from('toko').select('*');
        zonas = zData || [];
        tokos = tData || [];
    } catch (err) {
        console.error('Failed to load mapping data:', err);
    }
}

async function handleDirectPDFUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Transition to mapping step
    batchData = files.map((file, index) => {
        const metadata = parseMetadataFromFilename(file.name);
        return {
            id: index,
            tanggal: metadata.tanggal || new Date().toISOString(),
            no_invoice: metadata.no_invoice || '-',
            total: metadata.total || 0,
            konsumen: metadata.toko || '-',
            metode: 'TUNAI',
            pdfFile: file,
            status: 'ready',
            errorMsg: '',
            _originalRow: {} // Empty for direct upload
        };
    });

    renderBatchTable();
    document.getElementById('excel-step').classList.add('hidden');
    document.getElementById('mapping-step').classList.remove('hidden');
}

function parseMetadataFromFilename(filename) {
    const name = filename.replace(/\.pdf$/i, '');
    let metadata = { toko: '', total: 0, tanggal: '', no_invoice: '', tipe_ppn: 'NON' };

    // 1. Extract Nominal (1.234.567)
    const priceMatch = name.match(/\d{1,3}(?:\.\d{3}){1,3}/);
    if (priceMatch) {
        metadata.total = parseFloat(priceMatch[0].replace(/\./g, '')) || 0;
    }

    // 2. Extract Type (PPN vs NON)
    if (name.toUpperCase().includes('PPN')) metadata.tipe_ppn = 'PPN';
    else if (name.toUpperCase().includes('NON')) metadata.tipe_ppn = 'NON';

    // 3. Extract Toko (Match against loaded tokos)
    const upperName = name.toUpperCase();
    const matchedToko = tokos.find(t => upperName.includes(t.nama.toUpperCase()));
    if (matchedToko) {
        metadata.toko = matchedToko.nama;
    }

    // 4. Extract Date (e.g. 03 MEI or 19-04-2026)
    const datePattern = /(\d{1,2})[-/\s]?(JAN|FEB|MAR|APR|MEI|JUN|JUL|AGU|SEP|OKT|NOV|DES|JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER|\d{1,2})[-/\s]?(\d{2,4})?/i;
    const dateMatch = name.match(datePattern);
    if (dateMatch) {
        metadata.tanggal = dateMatch[0];
    }

    return metadata;
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            console.log('Workbook Sheets:', workbook.SheetNames);

            let jsonData = [];

            // Loop through sheets to find one with data
            for (const sheetName of workbook.SheetNames) {
                const ws = workbook.Sheets[sheetName];
                // Use raw: false to get the formatted string EXACTLY as seen in Excel
                const tempJson = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
                if (tempJson && tempJson.length > 0) {
                    jsonData = tempJson;
                    console.log(`Found data in sheet: ${sheetName}`, jsonData.length, 'rows');
                    break;
                }
            }

            if (jsonData.length === 0) {
                throw new Error('File Excel terbaca kosong. Pastikan data ada di lembar pertama atau lembar yang berisi data.');
            }

            processExcelData(jsonData);
        } catch (err) {
            console.error('Excel Parsing Error:', err);
            Toast.error(err.message || 'Gagal memproses file Excel.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processExcelData(json) {
    if (!json || json.length === 0) {
        Toast.error('File Excel kosong atau tidak valid.');
        return;
    }

    // Map columns (Flexible mapping based on user request)
    batchData = json.map((row, index) => {
        const keys = Object.keys(row);

        // Exact match priority, then fuzzy pattern inclusion
        const findKey = (patterns) => {
            // 1. Try exact match first
            const exact = keys.find(k => patterns.some(p => k.toLowerCase() === p.toLowerCase()));
            if (exact) return exact;

            // 2. Try if column header CONTAINS any of our pattern keywords
            return keys.find(k => {
                const lowerK = k.toLowerCase();
                return patterns.some(p => lowerK.includes(p.toLowerCase()));
            });
        };

        const dateKey = findKey(['tanggal', 'date', 'tgl']);
        const invKey = findKey(['faktur', 'invoice', 'no inv', 'no_inv', 'nomor inv']);
        const totalKey = findKey(['total', 'nominal', 'amount', 'jumlah', 'tagihan', 'bayar', 'pembayaran']);
        const storeKey = findKey(['konsumen', 'nama toko', 'customer', 'customer name', 'toko', 'outlet']);
        const methodKey = findKey(['metode', 'payment', 'bayar', 'tunai', 'kredit']);

        const parseMoney = (val, filename) => {
            if (typeof val === 'number') return val;

            // --- PRIORITY 1: Filename Pattern (e.g. 15.370.000) ---
            if (filename) {
                // Better regex: look for at least one dot-group, e.g. 150.000 or 15.370.000
                const match = filename.match(/\d{1,3}(?:\.\d{3}){1,3}/);
                if (match) {
                    const sStr = match[0].replace(/\./g, '');
                    const n = parseFloat(sStr);
                    if (n > 0) {
                        console.log(`[Metadata Priority] Using filename nominal: ${n}`);
                        return n;
                    }
                }
            }

            // --- PRIORITY 2: Excel Value ---
            if (!val) return 0;
            let s = val.toString().replace(/[^0-9,.]/g, '');

            if (!s) return 0;

            const hasDot = s.includes('.');
            const hasComma = s.includes(',');

            if (hasDot && hasComma) {
                const lastDot = s.lastIndexOf('.');
                const lastComma = s.lastIndexOf(',');
                if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
                else s = s.replace(/,/g, '');
            } else if (hasComma) {
                const parts = s.split(',');
                if (parts[parts.length - 1].length === 3) s = s.replace(/,/g, '');
                else s = s.replace(',', '.');
            } else if (hasDot) {
                const parts = s.split('.');
                if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
            }

            return parseFloat(s) || 0;
        };

        // Trace found keys
        console.log(`[Excel Mapping] File: ${row.filename || index}`, {
            dateKey, invKey, totalKey, storeKey, methodKey
        });

        // Add parseMoney to the row object context for later re-use
        row._parseMoney = parseMoney;
        row._totalKey = totalKey;

        return {
            id: index,
            tanggal: row[dateKey] || '',
            no_invoice: row[invKey] || '',
            total: parseMoney(row[totalKey], ''),
            konsumen: row[storeKey] || '',
            metode: row[methodKey] || '',
            pdfFile: null,
            status: 'pending',
            errorMsg: '',
            _originalRow: row // Store original excel row data
        };
    });

    renderBatchTable();
    document.getElementById('excel-step').classList.add('hidden');
    document.getElementById('mapping-step').classList.remove('hidden');
}

function renderBatchTable() {
    const tbody = document.getElementById('batch-table-body');
    tbody.innerHTML = batchData.map(row => `
        <tr class="animate-fade-in group hover:bg-white/5 transition-colors">
            <td class="px-6 py-4">
                <span class="row-status-${row.status} flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    ${getStatusIcon(row.status)}
                    ${row.status === 'success' ? 'Selesai' : row.status === 'ready' ? 'Siap' : row.status === 'uploading' ? 'Proses' : row.status === 'error' ? 'Gagal' : 'Pending'}
                </span>
                ${row.errorMsg ? `<p class="text-[9px] text-red-500/80 mt-1 font-medium">${row.errorMsg}</p>` : ''}
            </td>
            <td class="px-6 py-4 text-sm font-medium text-gray-300">${row.tanggal || '-'}</td>
            <td class="px-6 py-4">
                <p class="text-sm font-bold text-white">${row.konsumen || '-'}</p>
                <p class="text-[10px] text-gray-500">${row.no_invoice || '-'}</p>
            </td>
            <td class="px-6 py-4 text-sm font-bold text-indigo-400 font-mono">${formatCurrency(row.total)}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <input type="file" id="pdf-${row.id}" accept="application/pdf" class="hidden" onchange="attachPDF(${row.id}, event)">
                    <label for="pdf-${row.id}" class="h-8 w-8 rounded-lg bg-white/5 hover:bg-indigo-500/20 flex items-center justify-center cursor-pointer transition-all border border-white/10">
                        <svg class="w-4 h-4 ${row.pdfFile ? 'text-indigo-400' : 'text-gray-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                    </label>
                    <div class="flex flex-col">
                        <span class="text-[11px] font-medium text-gray-400 truncate max-w-[120px]">${row.pdfFile ? row.pdfFile.name : 'Belum ada file'}</span>
                        ${row.pdfFile ? `<span class="text-[9px] text-gray-600 font-mono">${(row.pdfFile.size / 1024).toFixed(0)} KB</span>` : ''}
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function getStatusIcon(status) {
    if (status === 'success') return '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (status === 'uploading') return '<div class="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>';
    if (status === 'ready') return '<div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>';
    if (status === 'error') return '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<div class="w-2 h-2 rounded-full bg-gray-600"></div>';
}

function attachPDF(id, event) {
    const file = event.target.files[0];
    if (!file) return;

    const row = batchData.find(r => r.id === id);
    if (row) {
        row.pdfFile = file;
        row.status = 'ready';

        // Re-run nominal extraction - Filename takes priority now
        console.log(`[Metadata] Re-evaluating metadata for ${file.name}...`);
        const excelRow = row._originalRow;
        if (excelRow && excelRow._parseMoney) {
            row.total = excelRow._parseMoney(excelRow[excelRow._totalKey], file.name);
            console.log(`[Metadata] Final Nominal (Priority source applied): ${row.total}`);
        }

        renderBatchTable();
    }
}

function resetBatch() {
    showConfirmModal(
        'Batalkan Batch',
        'Apakah Anda yakin ingin membatalkan batch upload ini? Seluruh progres yang belum tersimpan akan hilang.',
        () => {
            batchData = [];
            document.getElementById('excel-step').classList.remove('hidden');
            document.getElementById('mapping-step').classList.add('hidden');
            const excelInput = document.getElementById('excel-input');
            if (excelInput) excelInput.value = '';
        },
        'Ya, Batalkan',
        'Kembali'
    );
}

async function uploadAllReady() {
    const readyRows = batchData.filter(r => r.status === 'ready');
    if (readyRows.length === 0) {
        Toast.error('Tidak ada data yang siap diupload (lampirkan PDF dulu).');
        return;
    }

    const btn = document.getElementById('btn-upload-all');
    btn.disabled = true;

    // Generate local UUID for this session (No pre-handshake needed)
    const currentBatchId = self.crypto.randomUUID ? self.crypto.randomUUID() : 'b_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    console.log(`[Batch] Session started locally: ${currentBatchId}`);

    let successCount = 0;
    for (const row of readyRows) {
        const ok = await uploadRow(row, currentBatchId);
        if (ok) successCount++;
    }

    // Update batch counters
    if (currentBatchId) {
        try {
            await API.put(`/api/batches/${currentBatchId}`, {
                total_files: readyRows.length,
                success_files: successCount
            });
        } catch (err) {
            console.warn('[Batch] Could not update batch counters:', err.message);
        }
    }

    btn.disabled = false;
    Toast.success(`Proses batch selesai. ${successCount}/${readyRows.length} file berhasil.`);
}

async function uploadRow(row, batchId) {
    row.status = 'uploading';
    renderBatchTable();

    try {
        const token = localStorage.getItem('jwt_token');
        const formData = new FormData();

        // Find Toko Mapping
        const mappedToko = tokos.find(t => t.nama.toLowerCase().includes(row.konsumen.toLowerCase()) || row.konsumen.toLowerCase().includes(t.nama.toLowerCase()));

        if (!mappedToko) {
            throw new Error(`Toko "${row.konsumen}" tidak ditemukan di database.`);
        }

        formData.append('zona_id', mappedToko.zona_id);
        formData.append('toko_id', mappedToko.id);
        formData.append('category', 'INVOICE');
        formData.append('tanggal_dokumen', formatDateToISO(row.tanggal));
        formData.append('no_invoice', row.no_invoice);
        formData.append('total_jual', row.total);
        if (row.tipe_ppn) formData.append('tipe_ppn', row.tipe_ppn);
        if (batchId) formData.append('batch_id', batchId);

        // IMPORTANT: Append file LAST so multer parses all text fields first
        formData.append('file', row.pdfFile);

        const response = await fetch(`${CONFIG.API_URL}/api/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Gagal upload.');
        }

        row.status = 'success';
        row.errorMsg = '';
        return true;
    } catch (err) {
        row.status = 'error';
        row.errorMsg = err.message;
        return false;
    } finally {
        renderBatchTable();
    }
}

// Helpers
function formatDateToISO(excelDate) {
    if (!excelDate) return new Date().toISOString();

    // SheetJS numeric date handling
    if (typeof excelDate === 'number') {
        try {
            const date = XLSX.SSF.parse_date_code(excelDate);
            return new Date(date.y, date.m - 1, date.d).toISOString();
        } catch (e) { }
    }

    // String handling
    const s = String(excelDate).trim();

    // Explicitly handle 19-04-2026 or 19/04/2026
    const indonesianMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (indonesianMatch) {
        const yearNum = parseInt(indonesianMatch[3]);
        const monthNum = parseInt(indonesianMatch[2]);
        const dayNum = parseInt(indonesianMatch[1]);
        const d = new Date(yearNum, monthNum - 1, dayNum);
        // Validate rollover
        if (d.getFullYear() === yearNum && d.getMonth() === monthNum - 1 && d.getDate() === dayNum) {
            return d.toISOString();
        }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();

    return new Date().toISOString();
}

function formatCurrency(val) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
}
