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
  const [elevation, setElevation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // 1. Pobieranie danych z bazy przy wejściu
  useEffect(() => {
    async function getData() {
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

      if (point === 'center') {
        if (streetData.geom) setCoords(streetData.geom);
        if (streetData.kod_pocztowy) setPostalCode(streetData.kod_pocztowy);
      } else {
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

  // 2. Efekt do pobierania Wysokości n.p.m.
  useEffect(() => {
    async function fetchElevation() {
        if (!coords) return;
        try {
            const [lat, lon] = coords.split(',').map(s => s.trim());
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data && data.elevation) {
                setElevation(data.elevation[0].toFixed(1));
            }
        } catch (err) {
            console.error("Błąd pobierania wysokości:", err);
        }
    }
    fetchElevation();
  }, [coords]);

  // 3. Geokodowanie
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

  // 4. Pobieranie pojedynczego pliku CSV (Z LINKIEM)
  const handleDownloadSingle = () => {
      if (!location || !coords) return;
      
      const googleLink = `https://www.google.com/maps?q=${coords.replace(' ', '')}`;

      const headers = "Województwo;Miejscowość;Ulica;Numer;Kod Pocztowy;Wysokość n.p.m.;Współrzędne;Link do Mapy\n";
      const row = `${location.wojewodztwo};${location.miejscowosc};${location.ulica};${point === 'center' ? 'Środek' : point};${postalCode || 'Brak'};${elevation ? elevation + ' m' : 'Brak'};${coords};${googleLink}`;
      
      const csvContent = "\uFEFF" + headers + row;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dane_${location.ulica}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // 5. Dodawanie do raportu (LocalStorage) (Z LINKIEM)
  const handleAddToReport = () => {
    if (!location || !coords) return;

    // Generujemy link do Google Maps
    const googleLink = `https://www.google.com/maps?q=${coords.replace(' ', '')}`;

    const newItem = {
      id: `${id}-${point}`,
      wojewodztwo: location.wojewodztwo,
      miejscowosc: location.miejscowosc,
      ulica: location.ulica,
      numer: point === 'center' ? 'Środek' : point,
      kod: postalCode || 'Brak',
      wysokosc: elevation ? `${elevation} m` : 'Brak',
      wspolrzedne: coords,
      link_mapy: googleLink, // NOWE POLA
      data_dodania: new Date().toLocaleString()
    };

    const existingReport = JSON.parse(localStorage.getItem('my_report') || '[]');
    const exists = existingReport.find(item => item.id === newItem.id);
    
    if (exists) {
      alert("To miejsce jest już w Twoim raporcie!");
      return;
    }

    const newReport = [...existingReport, newItem];
    localStorage.setItem('my_report', JSON.stringify(newReport));
    alert(`Dodano do raportu! Masz już ${newReport.length} pozycji.`);
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
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
              {postalCode && (
                  <div className="info-badge postal-badge">
                      <span className="badge-label">Kod Pocztowy</span>
                      <span className="badge-value">{postalCode}</span>
                  </div>
              )}
              {elevation && (
                  <div className="info-badge elevation-badge">
                      <span className="badge-label">Wysokość n.p.m.</span>
                      <span className="badge-value">{elevation} m</span>
                  </div>
              )}
          </div>

          <strong style={{ display: 'block', marginBottom: '10px', color: '#555', marginTop: '20px' }}>
            Współrzędne GPS:
          </strong>
          
          {coords ? (
            <span style={{ color: '#27ae60', fontFamily: 'monospace', fontSize: '1.4em', background: '#e8f6f3', padding: '10px 20px', borderRadius: '5px' }}>
              {coords}
            </span>
          ) : (
            <span style={{ color: '#e74c3c' }}>Brak danych (wymaga pobrania)</span>
          )}
        </div>

        <div className="action-buttons">
            {coords ? (
            <>
                <a 
                    href={`https://www.google.com/maps?q=${coords}`} 
                    target="_blank" rel="noreferrer"
                    className="btn-search" style={{ backgroundColor: '#2980b9' }}>
                    Mapa 🗺️
                </a>

                <button 
                    onClick={handleAddToReport}
                    className="btn-add-report">
                    + Dodaj do raportu
                </button>

                <button 
                    onClick={handleDownloadSingle}
                    className="btn-download">
                    Pobierz ten plik 📥
                </button>
            </>
            ) : (
            <button className="btn-search" onClick={handleGeocode} disabled={processing}>
                {processing ? 'Pobieranie...' : `📍 Pobierz pozycję i Dane`}
            </button>
            )}
        </div>
      </div>
    </div>
  );
}

export default Details;