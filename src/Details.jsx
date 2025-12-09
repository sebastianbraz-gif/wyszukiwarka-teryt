import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

function Details() {
  const { id, point } = useParams();
  
  const [location, setLocation] = useState(null);
  
  // Dane dynamiczne
  const [coords, setCoords] = useState(null);
  const [postalCode, setPostalCode] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function getData() {
      // 1. Pobierz dane ulicy
      const { data: streetData, error } = await supabase
        .from('lokalizacje')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        console.error("Błąd pobierania ulicy:", error);
        setLoading(false);
        return;
      }
      setLocation(streetData);

      // 2. SPRAWDZANIE PAMIĘCI (CACHE)
      if (point === 'center') {
        // Środek ulicy
        if (streetData.geom) {
          setCoords(streetData.geom);
        }
        if (streetData.kod_pocztowy) {
           setPostalCode(streetData.kod_pocztowy);
        }

      } else {
        // Konkretny numer
        const { data: addressData } = await supabase
          .from('adresy')
          .select('geom, kod_pocztowy')
          .eq('lokalizacja_id', id)
          .eq('numer_domu', point)
          .single();

        if (addressData) {
          if (addressData.geom) setCoords(addressData.geom);
          if (addressData.kod_pocztowy) setPostalCode(addressData.kod_pocztowy);
        }
      }
      setLoading(false);
    }
    getData();
  }, [id, point]);

  const handleGeocode = async () => {
    if (!location) return;
    setProcessing(true);

    const cleanUlica = location.ulica.replace(/ul\.|al\.|pl\./g, '').trim();
    
    let query = "";
    if (point === 'center') {
      query = `${cleanUlica}, ${location.miejscowosc}, ${location.wojewodztwo}`;
    } else {
      query = `${cleanUlica} ${point}, ${location.miejscowosc}, ${location.wojewodztwo}`;
    }
    
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.length > 0) {
        const resultCoords = `${data[0].lat}, ${data[0].lon}`;
        const resultPostCode = data[0].address?.postcode || null;
        
        // --- ZAPIS DO BAZY ---
        if (point === 'center') {
          const updateData = { geom: resultCoords, status: 'zgeokodowane', jakosc: 100 };
          if (resultPostCode) updateData.kod_pocztowy = resultPostCode;

          await supabase.from('lokalizacje').update(updateData).eq('id', id);
        } else {
          const upsertData = { lokalizacja_id: id, numer_domu: point, geom: resultCoords };
          if (resultPostCode) upsertData.kod_pocztowy = resultPostCode;

          await supabase.from('adresy').upsert(upsertData, { onConflict: 'lokalizacja_id, numer_domu' });
        }

        setCoords(resultCoords);
        if (resultPostCode) setPostalCode(resultPostCode);

      } else {
        alert("Nie znaleziono współrzędnych.");
      }
    } catch (err) {
      console.error(err);
      alert("Błąd połączenia.");
    } finally {
      setProcessing(false);
    }
  };

  // NOWE: Funkcja pobierania pojedynczego pliku
  const handleDownloadSingle = () => {
      if (!location || !coords) return;

      // Tworzymy treść pliku CSV
      // \uFEFF to znacznik BOM, dzięki któremu Excel poprawnie czyta polskie znaki
      const headers = "Województwo;Miejscowość;Ulica;Numer;Kod Pocztowy;Współrzędne\n";
      const row = `${location.wojewodztwo};${location.miejscowosc};${location.ulica};${point === 'center' ? 'Środek' : point};${postalCode || 'Brak'};${coords}`;
      
      const csvContent = "\uFEFF" + headers + row;

      // Tworzenie pliku w przeglądarce
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Nazwa pliku np: raport_Marszalkowska_Warszawa.csv
      link.setAttribute('download', `dane_${location.ulica.replace(/\s/g, '_')}_${location.miejscowosc}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (loading) return <div className="App"><p style={{marginTop:'50px'}}>Ładowanie...</p></div>;

  return (
    <div className="App">
      <header className="app-header">
        <span className="header-subinfo">woj. {location.wojewodztwo}</span>
        <h1 className="header-city">
          {location.ulica} {point !== 'center' ? point : ''}
        </h1>
        <span className="header-subinfo">{location.miejscowosc}</span>
        
        <div style={{ marginTop: '10px', fontSize: '0.9em', background: 'rgba(255,255,255,0.1)', padding: '5px 15px', borderRadius: '20px' }}>
           Dokładność: {point === 'center' ? 'Środek Ulicy' : 'Konkretny Budynek'}
        </div>
      </header>

      <div className="table-container">
        <Link to={`/select/${id}`} style={{ color: '#7f8c8d', marginBottom: '20px', textDecoration: 'none' }}>
           🠔 Wróć do wyboru
        </Link>

        {/* --- SEKCJA WYNIKÓW --- */}
        <div style={{ margin: '30px 0', textAlign: 'center' }}>
          
          {postalCode && (
              <div className="postal-badge-container">
                  <span className="postal-label">Kod Pocztowy:</span>
                  <span className="postal-value">{postalCode}</span>
              </div>
          )}

          <strong style={{ display: 'block', marginBottom: '10px', color: '#555', marginTop: '20px' }}>
            Współrzędne GPS {point !== 'center' && `(numer ${point})`}:
          </strong>
          
          {coords ? (
            <span style={{ color: '#27ae60', fontFamily: 'monospace', fontSize: '1.4em', background: '#e8f6f3', padding: '10px 20px', borderRadius: '5px' }}>
              {coords}
            </span>
          ) : (
            <span style={{ color: '#e74c3c' }}>Brak danych (wymaga pobrania)</span>
          )}
        </div>

        {/* --- PRZYCISKI AKCJI --- */}
        <div className="action-buttons">
            {coords ? (
            <>
                {/* Przycisk Google Maps */}
                <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${coords}`} 
                    target="_blank" rel="noreferrer"
                    className="btn-search" style={{ backgroundColor: '#2980b9', marginRight: '10px' }}>
                    Pokaż na mapie 🗺️
                </a>

                {/* NOWE: Przycisk Pobierania */}
                <button 
                    onClick={handleDownloadSingle}
                    className="btn-download">
                    Pobierz dane 📥
                </button>
            </>
            ) : (
            <button className="btn-search" onClick={handleGeocode} disabled={processing}>
                {processing ? 'Pobieranie...' : `📍 Pobierz pozycję i Kod Pocztowy`}
            </button>
            )}
        </div>
      </div>
    </div>
  );
}

export default Details;