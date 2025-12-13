/* PLIK: server.cjs */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const fs = require('fs'); // Przywracamy fs do czytania z dysku
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001;

// Zwiększamy limity dla JSON
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// --- DANE SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kkxuqokpvjmiyjsxqws.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'TWOJ_KLUCZ_SUPABASE'; // Upewnij się, że masz tu klucz

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- POMOCNIKI ---

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

function formatStreetName(cecha, nazwa1, nazwa2) {
    const parts = [cecha, nazwa2, nazwa1];
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// --- ENDPOINT (Bez Multera, szuka pliku lokalnie) ---
app.post('/api/update-teryt', async (req, res) => {
    console.log("\n🚀 [BACKEND] Szukam pliku ZIP w folderze serwera...");
    const startTime = Date.now();

    try {
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', akcja: 'start_aktualizacji', opis_szczegolowy: 'Szukanie lokalnego pliku ZIP...'
        }]);

        // 1. Znajdź plik ZIP w katalogu bieżącym (__dirname)
        const files = fs.readdirSync(__dirname);
        // Szukamy pliku, który kończy się na .zip i (opcjonalnie) ma w nazwie ULIC
        // Jeśli plik nazywa się inaczej, np. "dane.zip", zmień 'ULIC' na co innego lub usuń ten warunek.
        const terytFileName = files.find(file => file.match(/\.zip$/i) && file.match(/ULIC/i));

        if (!terytFileName) {
            throw new Error(`Nie znaleziono pliku ZIP (z nazwą zawierającą 'ULIC') w folderze: ${__dirname}`);
        }

        const filePath = path.join(__dirname, terytFileName);
        console.log(`📦 Znaleziono plik: ${terytFileName}`);

        // 2. Rozpakuj z dysku
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        let xmlData = null;

        for (const entry of zipEntries) {
            if (entry.entryName.match(/\.xml$/i) && entry.entryName.match(/ULIC/i)) {
                console.log(`📄 Odczytano XML z ZIP: ${entry.entryName}`);
                xmlData = entry.getData().toString('utf8');
                break;
            }
        }

        if (!xmlData) throw new Error("Brak pliku ULIC*.xml wewnątrz archiwum ZIP.");

        // 3. Parsuj XML
        console.log("🔍 Parsowanie XML...");
        const parser = new xml2js.Parser({
            normalizeTags: true,
            stripPrefix: true,
            explicitArray: false
        });

        const result = await parser.parseStringPromise(xmlData);
        let rows = findRowData(result);

        if (!rows) throw new Error("Niepoprawna struktura XML (brak węzła row).");
        if (!Array.isArray(rows)) rows = [rows];

        const totalRecords = rows.length;
        console.log(`📊 Rekordów do przetworzenia: ${totalRecords}`);

        // 4. Batch Upsert
        const BATCH_SIZE = 2000;
        let processedCount = 0;

        for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
            const batchRaw = rows.slice(i, i + BATCH_SIZE);

            const batchPrepared = batchRaw.map(row => {
                const symUl = row.sym_ul;
                const sym = row.sym;
                
                if (!symUl || !sym) return null;

                const uniqueId = `${sym}-${symUl}`; 

                return {
                    id_teryt: uniqueId,
                    sym_ul: symUl,
                    sym_miejscowosci: sym,
                    ulica: formatStreetName(row.cecha, row.nazwa_1, row.nazwa_2),
                    wojewodztwo_kod: row.woj,
                    updated_at: new Date()
                };
            }).filter(item => item !== null);

            if (batchPrepared.length > 0) {
                const { error } = await supabase
                    .from('lokalizacje')
                    .upsert(batchPrepared, { onConflict: 'id_teryt', ignoreDuplicates: false });

                if (error) console.error(`❌ Błąd batch ${i}:`, error.message);
            }

            processedCount += batchPrepared.length;
            if (processedCount % 10000 === 0) console.log(`⏳ Postęp: ${processedCount} / ${totalRecords}`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', akcja: 'koniec_aktualizacji', opis_szczegolowy: `Zakończono: ${processedCount} rekordów w ${duration}s.`
        }]);

        console.log(`✅ SUKCES! Przetworzono ${processedCount} rekordów.`);

        res.json({ 
            success: true, 
            message: `Przetworzono plik lokalny: ${terytFileName}`,
            stats: { processed: processedCount, duration: duration }
        });

    } catch (error) {
        console.error("❌ BŁĄD:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`📡 Serwer działa na porcie ${PORT}`);
    console.log(`📂 Oczekuję pliku ZIP (z 'ULIC' w nazwie) w folderze: ${__dirname}`);
});