/* * PLIK: server.cjs 
 * Moduł backendowy odpowiedzialny za ETL (Extract, Transform, Load) danych z rejestru TERYT.
 */

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

// Konfiguracja middleware: zwiększenie limitu payloadu dla przetwarzania dużych struktur danych
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// --- KONFIGURACJA KLIENTA BAZY DANYCH ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://twoj-url.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'twoj-klucz-service-role'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- FUNKCJE POMOCNICZE (UTILS) ---

/**
 * Algorytm rekurencyjnego przeszukiwania drzewa DOM obiektu JSON
 * w celu zlokalizowania właściwego węzła z danymi (row).
 */
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

/**
 * Normalizacja danych tekstowych: łączenie członów nazwy ulicy (cecha + nazwa2 + nazwa1)
 * oraz usuwanie zbędnych znaków białych.
 */
function formatStreetName(cecha, nazwa1, nazwa2) {
    const parts = [cecha, nazwa2, nazwa1];
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// --- ENDPOINT API: PROCES IMPORTU DANYCH ---

app.post('/api/update-teryt', async (req, res) => {
    console.log("\n🚀 [BACKEND] Inicjalizacja procesu aktualizacji bazy TERYT...");
    const startTime = Date.now();

    try {
        // Rejestracja zdarzenia w logach systemowych (Audyt)
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', 
            akcja: 'start_aktualizacji', 
            opis_szczegolowy: 'Rozpoczęcie procedury importu z lokalnego pliku ZIP.'
        }]);

        // 1. EXTRACT: Lokalizacja pliku źródłowego w systemie plików
        const files = fs.readdirSync(__dirname);
        const terytFileName = files.find(file => file.match(/\.zip$/i) && file.match(/ULIC/i));

        if (!terytFileName) {
            throw new Error(`Błąd IO: Nie znaleziono pliku archiwum ZIP w katalogu: ${__dirname}`);
        }

        const filePath = path.join(__dirname, terytFileName);
        console.log(`📦 Zidentyfikowano plik źródłowy: ${terytFileName}`);

        // 2. EXTRACT: Dekompresja danych w pamięci operacyjnej (In-Memory Unzip)
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        let xmlData = null;

        for (const entry of zipEntries) {
            if (entry.entryName.match(/\.xml$/i) && entry.entryName.match(/ULIC/i)) {
                console.log(`📄 Ekstrakcja pliku XML: ${entry.entryName}`);
                xmlData = entry.getData().toString('utf8');
                break;
            }
        }

        if (!xmlData) throw new Error("Błąd integralności: Brak pliku XML wewnątrz archiwum ZIP.");

        // 3. TRANSFORM: Deserializacja XML do struktury obiektu JSON
        console.log("🔍 Parsowanie struktury XML...");
        const parser = new xml2js.Parser({
            normalizeTags: true,    // Ujednolicenie wielkości liter tagów
            stripPrefix: true,      // Usunięcie przestrzeni nazw XML
            explicitArray: false    // Uproszczenie struktury tablic
        });

        const result = await parser.parseStringPromise(xmlData);
        let rows = findRowData(result);

        if (!rows) throw new Error("Błąd walidacji XML: Nieprawidłowa struktura pliku.");
        
        // Zapewnienie spójności typu danych (Array)
        if (!Array.isArray(rows)) rows = [rows];

        const totalRecords = rows.length;
        console.log(`📊 Wolumen danych do przetworzenia: ${totalRecords} rekordów.`);

        // 4. LOAD: Przetwarzanie wsadowe (Batch Processing) w celu optymalizacji wydajności
        const BATCH_SIZE = 2000; // Definicja rozmiaru okna transakcyjnego
        let processedCount = 0;
        // Iteracja po zbiorze danych z krokiem wielkości paczki
        for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
            // Segmentacja danych (Memory Slicing)
            const batchRaw = rows.slice(i, i + BATCH_SIZE);
            // Mapowanie modelu XML na model relacyjny bazy danych
            const batchPrepared = batchRaw.map(row => {
                const symUl = row.sym_ul;
                const sym = row.sym;
                
                // Walidacja kluczy obcych
                if (!symUl || !sym) return null;

                // Generowanie unikalnego klucza złożonego (Composite Key)
                const uniqueId = `${sym}-${symUl}`; 
                return {
                    id_teryt: uniqueId,
                    sym_ul: symUl,
                    sym_miejscowosci: sym,
                    // Transformacja atrybutów
                    ulica: formatStreetName(row.cecha, row.nazwa_1, row.nazwa_2),
                    wojewodztwo_kod: row.woj,
                    updated_at: new Date()
                };
            }).filter(item => item !== null); // Eliminacja rekordów uszkodzonych

            // Wykonanie operacji UPSERT (Idempotentny zapis do bazy)
            if (batchPrepared.length > 0) {
                const { error } = await supabase
                    .from('lokalizacje')
                    .upsert(batchPrepared, { 
                        onConflict: 'id_teryt', // Klucz unikalności
                        ignoreDuplicates: false // Tryb nadpisywania (aktualizacja)
                    });

                if (error) console.error(`❌ Błąd transakcji batch ${i}:`, error.message);
            }
            // Monitoring postępu procesu ETL
            processedCount += batchPrepared.length;
            if (processedCount % 10000 === 0) {
                console.log(`⏳ Status przetwarzania: ${processedCount} / ${totalRecords}`);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        // Finalizacja logowania operacji
        await supabase.from('logi_systemowe').insert([{
            rola: 'system', 
            akcja: 'koniec_aktualizacji', 
            opis_szczegolowy: `Proces zakończony pomyślnie. Przetworzono ${processedCount} rekordów w czasie ${duration}s.`
        }]);

        console.log(`✅ SUKCES! Zakończono import ${processedCount} rekordów.`);

        res.json({ 
            success: true, 
            message: `Przetworzono plik: ${terytFileName}`,
            stats: { processed: processedCount, duration: duration }
        });

    } catch (error) {
        console.error("❌ BŁĄD KRYTYCZNY:", error.message);
        
        // Obsługa błędów i logowanie awarii
        try {
            await supabase.from('logi_systemowe').insert([{
                rola: 'system', 
                akcja: 'blad_aktualizacji', 
                opis_szczegolowy: error.message
            }]);
        } catch (e) { /* Fallback w przypadku braku dostępu do bazy */ }

        res.status(500).json({ success: false, error: error.message });
    }
});

// Uruchomienie nasłuchiwania HTTP
app.listen(PORT, () => {
    console.log(`📡 Serwer aplikacji aktywny na porcie ${PORT}`);
    console.log(`📂 Oczekiwanie na plik źródłowy TERYT w katalogu: ${__dirname}`);
});