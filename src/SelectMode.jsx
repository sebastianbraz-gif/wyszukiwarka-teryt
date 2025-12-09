import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

function SelectMode() {
  const { id } = useParams();
  const [streetInfo, setStreetInfo] = useState(null);
  const [osmNumbers, setOsmNumbers] = useState([]);
  const [loadingOsm, setLoadingOsm] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    async function fetchStreet() {
      if (!id) return;
      const { data, error } = await supabase.from('lokalizacje').select('*').eq('id', id).single();
      if (!error) setStreetInfo(data);
    }
    fetchStreet();
  }, [id]);

  const fetchNumbers = async () => {
    if (!streetInfo) return;
    setLoadingOsm(true);
    setOsmNumbers([]);
    setDebugInfo('');
    
    // 1. Logika słów kluczowych
    let rawName = streetInfo.ulica
      .replace(/ul\.|al\.|pl\.|skwer|rondo|gen\.|sw\.|ks\./gi, '') 
      .replace(/[^a-zA-Z0-9żźćńółęąśŻŹĆŃÓŁĘĄŚ ]/g, '') 
      .trim();

    const words = rawName.split(/\s+/).filter(w => w.length > 2);
    let keyword = words.reduce((a, b) => a.length >= b.length ? a : b, "");
    if (!keyword) keyword = rawName;

    const city = streetInfo.miejscowosc;
    const isVillageStyle = keyword.toLowerCase() === city.toLowerCase() || streetInfo.ulica.includes(city);
    const logMsg = `Szukam obszaru: "${city}", ulica zawiera: "${keyword}"`;
    setDebugInfo(logMsg);

    // 2. Zapytanie OSM
    let query = '';
    if (isVillageStyle) {
      query = `[out:json][timeout:25]; area["name"="${city}"]->.searchArea; ( node(area.searchArea)["addr:housenumber"]; way(area.searchArea)["addr:housenumber"]; ); out body;`;
    } else {
      query = `[out:json][timeout:25]; area["name"="${city}"]->.searchArea; ( node(area.searchArea)["addr:street"~"${keyword}",i]["addr:housenumber"]; way(area.searchArea)["addr:street"~"${keyword}",i]["addr:housenumber"]; relation(area.searchArea)["addr:street"~"${keyword}",i]["addr:housenumber"]; ); out body;`;
    }

    try {
      // A. POBIERAMY Z MAPY
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      const nums = new Set();
      if (data.elements) {
        data.elements.forEach(el => {
          if (el.tags['addr:housenumber']) {
            const cleanNum = el.tags['addr:housenumber'].replace(';', ', ');
            nums.add(cleanNum);
          }
        });
      }

      // B. POBIERAMY USUNIĘTE Z SUPABASE
      const { data: deletedData } = await supabase
        .from('adresy')
        .select('numer_domu')
        .eq('lokalizacja_id', id)
        .eq('czy_usuniety', true);
      
      console.log("Znalezione usunięte w bazie:", deletedData);

      // Funkcja pomocnicza: usuwa spacje i zmienia na małe litery
      const normalize = (val) => String(val).toLowerCase().replace(/\s/g, '');

      // Tworzymy zbiór znormalizowanych "zakazanych" numerów
      const deletedSet = new Set(
          deletedData ? deletedData.map(d => normalize(d.numer_domu)) : []
      );

      // C. FILTRUJEMY
      const validNums = Array.from(nums).filter(num => {
          const normNum = normalize(num);
          const isDeleted = deletedSet.has(normNum);
          if (isDeleted) console.log(`Ukrywam usunięty numer: ${num}`);
          return !isDeleted;
      });

      // D. Sortowanie
      const sortedNums = validNums.sort((a, b) => 
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      setOsmNumbers(sortedNums);
      setHasSearched(true);

    } catch (err) {
      console.error(err);
      alert("Błąd połączenia z mapą OpenStreetMap.");
    } finally {
      setLoadingOsm(false);
    }
  };

  if (!streetInfo) return <div className="App"><p style={{marginTop:'50px'}}>Ładowanie...</p></div>;

  return (
    <div className="App">
      <header className="app-header">
        <span className="header-subinfo">woj. {streetInfo.wojewodztwo}</span>
        <h1 className="header-city">{streetInfo.ulica}</h1>
        <span className="header-subinfo">{streetInfo.miejscowosc}</span>
      </header>

      <div className="table-container">
        <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>Wybierz tryb szukania</h2>

        <div style={{ marginBottom: '30px', paddingBottom: '30px', borderBottom: '1px solid #eee' }}>
          <p style={{ color: '#666', marginBottom: '10px' }}>Nie znasz numeru lub chcesz zobaczyć całą ulicę?</p>
          <Link to={`/details/${id}/center`}>
            <button className="btn-search" style={{ fontSize: '1.1em', padding: '15px 40px' }}>
              📍 Pokaż środek ulicy
            </button>
          </Link>
        </div>

        <div>
          <p style={{ color: '#666', marginBottom: '10px' }}>Szukasz konkretnego adresu?</p>
          
          {osmNumbers.length === 0 ? (
            <div>
              <button 
                className="btn-search" 
                onClick={fetchNumbers} 
                disabled={loadingOsm}
                style={{ backgroundColor: '#e67e22' }}
              >
                {loadingOsm ? 'Przeszukuję mapę...' : '📡 Pobierz dostępne numery'}
              </button>
              
              {hasSearched && !loadingOsm && (
                <div style={{marginTop: '20px'}}>
                  <p style={{ color: '#e74c3c' }}>Nie znaleziono numerów (lub zostały usunięte).</p>
                  <p style={{ fontSize: '0.8em', color: '#999' }}>Diagnostyka: {debugInfo}</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: '20px', animation: 'fadeIn 0.5s' }}>
              <p style={{marginBottom: '15px', fontWeight: 'bold', color: '#27ae60'}}>Znaleziono {osmNumbers.length} budynków:</p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxWidth: '600px', margin: '0 auto' }}>
                {osmNumbers.map(num => (
                  <Link key={num} to={`/details/${id}/${num}`} style={{textDecoration: 'none'}}>
                    <div className="number-card" 
                      style={{
                        minWidth: '40px', padding: '10px 15px', backgroundColor: 'white',
                        border: '1px solid #ddd', borderRadius: '8px', color: '#333',
                        fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: '0.2s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#e0f2f1'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#27ae60'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#ddd'; }}
                    >
                      {num}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div style={{marginTop: '40px'}}>
           {/* ZMIANA: color ustawiony na black */}
           <Link to="/" style={{color: 'black', textDecoration: 'none', fontSize: '0.9em'}}>🠔 Wróć do listy ulic</Link>
        </div>
      </div>
    </div>
  );
}

export default SelectMode;