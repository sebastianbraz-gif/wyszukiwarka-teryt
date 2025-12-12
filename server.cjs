/* PLIK: server.cjs */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001; 

app.use(cors());
app.use(express.json());

// --- DANE SUPABASE ---
const SUPABASE_URL = 'https://kkxuqokpvjmiyjsxqws.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreHVxb2twdmptaXloanN4cXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NzczNTYsImV4cCI6MjA3ODU1MzM1Nn0.H_eH1J9Xaiz_XZTYoiS61GuOCbiCFbBFjue2CWbQwyM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- FUNKCJA SZPERACZ ---
function findRowData(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.row) return obj.row;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const found = findRowData(obj[key]);
            if (found) return found;
        }
    }
    return null;
}

app.post('/api/update-teryt', async (req, res) => {
    console.log("\n🚀 [BACKEND] Rozpoczynam aktualizację...");
    const startTime = Date.now();
    
    try {
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', akcja: 'start_aktualizacji', opis_szczegolowy: 'Przetwarzanie lokalnego pliku...'
        }]);

        // 1. Znajdź plik ZIP
        const files = fs.readdirSync(__dirname);
        const terytFileName = files.find(file => file.match(/^ULIC.*\.zip$/i));

        if (!terytFileName) throw new Error("Błąd: Nie znaleziono pliku ZIP (ULIC...) w folderze projektu.");
        
        const filePath = path.join(__dirname, terytFileName);
        console.log(`📦 Plik: ${terytFileName}`);
        
        // 2. Rozpakuj
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        let xmlData = null;

        zipEntries.forEach((entry) => {
            if (entry.entryName.match(/\.xml$/i) && entry.entryName.match(/ULIC/i)) {
                xmlData = entry.getData().toString('utf8');
            }
        });

        if (!xmlData) throw new Error("Brak pliku XML wewnątrz ZIP.");

        // 3. Parsuj XML
        console.log("🔍 Parsowanie XML...");
        const parser = new xml2js.Parser({
            normalizeTags: true,
            stripPrefix: true,
            explicitArray: false 
        });
        
        const result = await parser.parseStringPromise(xmlData);
        
        // 4. WYCIĄGNIJ DANE
        let rows = findRowData(result);

        if (!rows) {
            console.log("Struktura pliku:", Object.keys(result));
            throw new Error("Nie znaleziono danych 'row' w pliku XML. Format nieznany.");
        }

        if (!Array.isArray(rows)) rows = [rows];
        console.log(`📊 Znaleziono ${rows.length} rekordów.`);

        // 5. Zapisz do bazy (Demo 50 sztuk)
        const sampleUpdates = rows.slice(0, 50).map(row => {
            const cecha = row.cecha || '';
            const nazwa1 = row.nazwa_1 || '';
            const nazwa2 = row.nazwa_2 || ''; 
            const symUl = row.sym_ul;

            if (!symUl) return null;

            const nazwaPelna = `${cecha} ${nazwa2} ${nazwa1}`.trim();
            
            return {
                sym_ul: symUl, 
                miejscowosc: nazwa1, 
                ulica: nazwaPelna,
                wojewodztwo: 'mazowieckie',
                updated_at: new Date()
            };
        }).filter(item => item !== null);

        const { error } = await supabase.from('lokalizacje').upsert(sampleUpdates, { onConflict: 'sym_ul', ignoreDuplicates: false });
        if (error) throw error;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', akcja: 'koniec_aktualizacji', opis_szczegolowy: `Sukces: ${sampleUpdates.length} rekordów w ${duration}s.`
        }]);

        console.log("✅ SUKCES!");
        res.json({ success: true, stats: { totalFound: rows.length, processed: sampleUpdates.length, fileName: terytFileName, duration: duration, date: new Date().toLocaleString() }});

    } catch (error) {
        console.error("❌ Błąd:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`📡 Serwer backendowy działa na porcie ${PORT}`);
});