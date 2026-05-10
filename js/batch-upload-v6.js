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

            let s = '';
            if (val) {
                s = val.toString().replace(/[^0-9,.]/g, '');
            }

            // Fallback: If no value, try to extract from filename (e.g., "1.234.567")
            if (!s || s === '0') {
                const match = filename.match(/\d{1,3}(\.\d{3})+/);
                if (match) {
                    s = match[0].replace(/\./g, '');
                    console.log(`[Metadata Fallback] Extracted nominal from filename: ${s}`);
                }
            }

            if (!s) return 0;

            const hasDot = s.includes('.');
            const hasComma = s.includes(',');

            if (hasDot && hasComma) {
                const lastDot = s.lastIndexOf('.');
                const lastComma = s.lastIndexOf(',');
                if (lastComma > lastDot) {
                    s = s.replace(/\./g, '').replace(',', '.');
                } else {
                    s = s.replace(/,/g, '');
                }
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

        return {
            id: index,
            tanggal: row[dateKey] || '',
            no_invoice: row[invKey] || '',
            total: parseMoney(row[totalKey], row.filename || ''),
            konsumen: row[storeKey] || '',
            metode: row[methodKey] || '',
            pdfFile: null,
            status: 'pending', // pending, ready, uploading, success, error
            errorMsg: ''
        };
    });

    renderBatchTable();
    document.getElementById('excel-step').classList.add('hidden');
    document.getElementById('mapping-step').classList.remove('hidden');
}

function renderBatchTable() {
    const tbody = document.getElementById('batch-table-body');
    tbody.innerHTML = batchData.map(row => `
        <tr class="animate-fade-in">
            <td class="px-5 py-4">
                <span class="row-status-${row.status} flex items-center gap-2 text-xs font-medium uppercase">
                    ${getStatusIcon(row.status)}
                    ${row.status === 'success' ? 'Berhasil' : row.status === 'ready' ? 'Siap' : row.status === 'uploading' ? 'Proses' : row.status === 'error' ? 'Gagal' : 'Pending'}
                </span>
                ${row.errorMsg ? `<p class="text-[10px] text-red-400 mt-1">${row.errorMsg}</p>` : ''}
            </td>
            <td class="px-5 py-4 text-sm text-gray-300">${row.tanggal || '-'}</td>
            <td class="px-5 py-4 text-sm font-mono text-indigo-300 font-medium">${row.no_invoice || '-'}</td>
            <td class="px-5 py-4 text-sm text-gray-400">${row.konsumen || '-'}</td>
            <td class="px-5 py-4 text-sm text-gray-300">${formatCurrency(row.total)}</td>
            <td class="px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">${row.metode || '-'}</td>
            <td class="px-5 py-4">
                <div class="flex items-center gap-2">
                    <input type="file" id="pdf-${row.id}" accept="application/pdf" class="hidden" onchange="attachPDF(${row.id}, event)">
                    <label for="pdf-${row.id}" class="btn-ghost px-3 py-1.5 rounded-lg text-xs cursor-pointer flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        ${row.pdfFile ? 'Ganti PDF' : 'Pilih PDF'}
                    </label>
                    ${row.pdfFile ? `<span class="text-[10px] text-indigo-400 font-medium truncate max-w-[100px]">${row.pdfFile.name}</span>` : ''}
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
