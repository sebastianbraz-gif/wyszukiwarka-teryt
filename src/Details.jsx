import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

function Details() {
  const { id, point } = useParams();
  const navigate = useNavigate();
  
  const [location, setLocation] = useState(null);
  
  // Dane dynamiczne
  const [coords, setCoords] = useState(null);
  const [postalCode, setPostalCode] = useState(null);
  const [elevation, setElevation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // 1. Pobieranie danych z bazy przy wejściu (z zabezpieczeniem Soft Delete)
  useEffect(() => {
    async function getData() {
      // Pobierz dane ulicy
      const { data: streetData, error } = await supabase
        .from('lokalizacje')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error || !streetData) {
        console.error("Błąd pobierania ulicy:", error);
        setLoading(false);
        return;
      }

      // --- ZABEZPIECZENIE: CZY ULICA USUNIĘTA? ---
      if (streetData.czy_usuniety) {
          alert("Ta lokalizacja została usunięta z bazy przez Operatora.");
          navigate('/'); // Wyrzuć na stronę główną
          return;
      }

      setLocation(streetData);

      // SPRAWDZANIE PAMIĘCI (CACHE) DLA PUNKTU
      if (point === 'center') {
        if (streetData.geom) setCoords(streetData.geom);
        if (streetData.kod_pocztowy) setPostalCode(streetData.kod_pocztowy);

      } else {
        const { data: addressData } = await supabase
          .from('adresy')
          .select('*')
          .eq('lokalizacja_id', id)
          .eq('numer_domu', point)
          .single();

        if (addressData) {
          // --- ZABEZPIECZENIE: CZY ADRES USUNIĘTY? ---
          if (addressData.czy_usuniety) {
              alert(`Adres ${streetData.ulica} ${point} został usunięty przez Operatora.`);
              navigate(`/select/${id}`); // Wróć do wyboru numerów
              return;
          }

          if (addressData.geom) setCoords(addressData.geom);
          if (addressData.kod_pocztowy) setPostalCode(addressData.kod_pocztowy);
        }
      }
      setLoading(false);
    }
    getData();
  }, [id, point, navigate]);

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

  // 4. Pobieranie pojedynczego pliku CSV
  const handleDownloadSingle = () => {
      if (!location || !coords) return;
      
      const googleLink = `http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`;

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

  // 5. Dodawanie do raportu
  const handleAddToReport = () => {
    if (!location || !coords) return;

    const googleLink = `http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`;

    const newItem = {
      id: `${id}-${point}`,
      wojewodztwo: location.wojewodztwo,
      miejscowosc: location.miejscowosc,
      ulica: location.ulica,
      numer: point === 'center' ? 'Środek' : point,
      kod: postalCode || 'Brak',
      wysokosc: elevation ? `${elevation} m` : 'Brak',
      wspolrzedne: coords,
      link_mapy: googleLink,
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

  // 6. Zgłaszanie błędów
  const handleReportError = async () => {
    const reason = prompt("Opisz krótko błąd (np. 'Ten numer nie istnieje'):");
    if (!reason) return;

    try {
        const { error } = await supabase
            .from('zgloszenia')
            .insert([{
                lokalizacja_id: id,
                numer_domu: point,
                opis: reason,
                status: 'oczekujace'
            }]);

        if (error) throw error;
        alert("Dziękujemy! Zgłoszenie zostało wysłane do Operatora.");
    } catch (err) {
        alert("Błąd wysyłania: " + err.message);
    }
  };

  if (loading) return <div className="App"><p style={{marginTop:'50px'}}>Ładowanie...</p></div>;
  if (!location) return <div className="App"><p>Brak danych.</p></div>;

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
        {/* ZMIANA: Link powrotu na czarno */}
        <Link to={`/select/${id}`} style={{ color: 'black', marginBottom: '20px', textDecoration: 'none' }}>
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

        {/* --- PRZYCISKI AKCJI --- */}
        <div className="action-buttons">
            {coords ? (
            <>
                <a 
                    href={`http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`} 
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

        {/* Sekcja Zgłaszania Błędów */}
        <div style={{marginTop: '30px', padding: '15px', border: '1px dashed #e74c3c', borderRadius: '8px', backgroundColor: '#fdf2f2', width: '90%'}}>
            <p style={{color: '#c0392b', fontSize: '0.9em', margin: '0 0 10px 0'}}>Widzisz błąd w danych?</p>
            <button onClick={handleReportError} className="btn-report-error">
                📢 Zgłoś błąd tego adresu
            </button>
        </div>

      </div>
    </div>
  );
}

export default Details;