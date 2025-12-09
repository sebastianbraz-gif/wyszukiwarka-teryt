import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

function Details() {
  const { id, point } = useParams();
  const [location, setLocation] = useState(null);
  const [coords, setCoords] = useState(null);
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

      // 2. SPRAWDZANIE PAMIĘCI
      if (point === 'center') {
        // Czy w bazie jest już geom?
        if (streetData.geom) {
          console.log("Mamy to w bazie (środek):", streetData.geom);
          setCoords(streetData.geom);
        }
      } else {
        // Czy w bazie adresów jest ten numer?
        const { data: addressData } = await supabase
          .from('adresy')
          .select('geom')
          .eq('lokalizacja_id', id)
          .eq('numer_domu', point)
          .single();

        if (addressData && addressData.geom) {
          console.log("Mamy to w bazie (numer):", addressData.geom);
          setCoords(addressData.geom);
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
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data && data.length > 0) {
        const resultCoords = `${data[0].lat}, ${data[0].lon}`;
        
        // --- ZAPISUJEMY I SPRAWDZAMY BŁĘDY ---
        
        if (point === 'center') {
          // Zapis do LOKALIZACJE
          const { error } = await supabase
            .from('lokalizacje')
            .update({ geom: resultCoords, status: 'zgeokodowane', jakosc: 100 })
            .eq('id', id);

          if (error) {
            alert("Błąd zapisu do bazy! " + error.message);
            console.error(error);
          } else {
            setCoords(resultCoords); // Ustawiamy tylko jeśli zapis się udał (lub przeszedł bez błędu)
          }

        } else {
          // Zapis do ADRESY
          const { error } = await supabase
            .from('adresy')
            .upsert(
              { lokalizacja_id: id, numer_domu: point, geom: resultCoords }, 
              { onConflict: 'lokalizacja_id, numer_domu' }
            );
            
          if (error) {
            alert("Błąd zapisu adresu! " + error.message);
          } else {
            setCoords(resultCoords);
          }
        }
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

        <div style={{ margin: '30px 0', textAlign: 'center' }}>
          <strong style={{ display: 'block', marginBottom: '10px', color: '#555' }}>
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

        {coords ? (
           <a 
             href={`https://www.google.com/maps/search/?api=1&query=${coords}`} 
             target="_blank" rel="noreferrer"
             className="btn-search" style={{ backgroundColor: '#2980b9' }}>
             Pokaż na Google Maps 🗺️
           </a>
        ) : (
          <button className="btn-search" onClick={handleGeocode} disabled={processing}>
            {processing ? 'Pobieranie...' : `📍 Pobierz pozycję`}
          </button>
        )}
      </div>
    </div>
  );
}

export default Details;