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

  // Stany techniczne
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Stany do edycji
  const [userRole, setUserRole] = useState(localStorage.getItem('user_role') || 'guest');
  const [isEditing, setIsEditing] = useState(false);
  const [newPostal, setNewPostal] = useState('');
  
  // ID rekordu
  const [currentRecordInfo, setCurrentRecordInfo] = useState({ table: '', id: null });

  // Stany Zgłoszeń
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('kod');
  const [reportNote, setReportNote] = useState('');

  // 1. Pobieranie danych
  useEffect(() => {
    async function getData() {
      const { data: streetData, error } = await supabase
        .from('lokalizacje')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error || !streetData) {
        console.error("Błąd pobierania:", error);
        setLoading(false);
        return;
      }

      if (streetData.czy_usuniety) {
          alert("Lokalizacja usunięta.");
          navigate('/');
          return;
      }

      setLocation(streetData);

      if (point === 'center') {
        if (streetData.geom) setCoords(streetData.geom);
        if (streetData.kod_pocztowy) setPostalCode(streetData.kod_pocztowy);
        setCurrentRecordInfo({ table: 'lokalizacje', id: streetData.id });
      } else {
        const { data: addressData } = await supabase
          .from('adresy')
          .select('*')
          .eq('lokalizacja_id', id)
          .eq('numer_domu', point)
          .single();

        if (addressData) {
          if (addressData.czy_usuniety) {
              alert("Adres usunięty.");
              navigate(`/select/${id}`);
              return;
          }
          if (addressData.geom) setCoords(addressData.geom);
          if (addressData.kod_pocztowy) setPostalCode(addressData.kod_pocztowy);
          setCurrentRecordInfo({ table: 'adresy', id: addressData.id });
        }
      }
      setLoading(false);
    }
    getData();
  }, [id, point, navigate]);

  // 2. Wysokość
  useEffect(() => {
    async function fetchElevation() {
        if (!coords) return;
        try {
            const [lat, lon] = coords.split(',').map(s => s.trim());
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.elevation) setElevation(data.elevation[0].toFixed(1));
        } catch (err) { console.error(err); }
    }
    fetchElevation();
  }, [coords]);

  // 3. Geokodowanie
  const handleGeocode = async () => {
    if (!location) return;
    setProcessing(true);
    const cleanUlica = location.ulica.replace(/ul\.|al\.|pl\./g, '').trim();
    const query = point === 'center' 
        ? `${cleanUlica}, ${location.miejscowosc}, ${location.wojewodztwo}`
        : `${cleanUlica} ${point}, ${location.miejscowosc}, ${location.wojewodztwo}`;
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data && data.length > 0) {
        const resultCoords = `${data[0].lat}, ${data[0].lon}`;
        const resultPostCode = data[0].address?.postcode || null;
        
        if (point === 'center') {
          const updateData = { geom: resultCoords, status: 'zgeokodowane', jakosc: 100 };
          if (resultPostCode) updateData.kod_pocztowy = resultPostCode;
          await supabase.from('lokalizacje').update(updateData).eq('id', id);
          if (resultPostCode) setPostalCode(resultPostCode);
        } else {
          const upsertData = { lokalizacja_id: id, numer_domu: point, geom: resultCoords };
          if (resultPostCode) upsertData.kod_pocztowy = resultPostCode;
          const { data: newAddr } = await supabase.from('adresy')
            .upsert(upsertData, { onConflict: 'lokalizacja_id, numer_domu' })
            .select()
            .single();
            
          if (newAddr) setCurrentRecordInfo({ table: 'adresy', id: newAddr.id });
          if (resultPostCode) setPostalCode(resultPostCode);
        }
        setCoords(resultCoords);
      } else { alert("Nie znaleziono współrzędnych."); }
    } catch (err) { alert("Błąd połączenia."); } 
    finally { setProcessing(false); }
  };

  // 4. Edycja Kodu
  const startEditing = () => { setNewPostal(postalCode || ''); setIsEditing(true); };

  const savePostalCode = async () => {
      if (!currentRecordInfo.id) { alert("Brak rekordu. Najpierw pobierz dane."); return; }
      try {
          const { error } = await supabase
            .from(currentRecordInfo.table)
            .update({ kod_pocztowy: newPostal })
            .eq('id', currentRecordInfo.id);
          if (error) throw error;

          await supabase.from('logi_systemowe').insert([{
              rola: userRole,
              akcja: 'zmiana_kodu',
              opis_szczegolowy: `Zmiana kodu z "${postalCode}" na "${newPostal}" dla ${location.ulica} ${point}`,
              tabela: currentRecordInfo.table,
              rekord_id: currentRecordInfo.id,
              poprzednie_dane: { kod_pocztowy: postalCode }
          }]);
          setPostalCode(newPostal); setIsEditing(false); alert("Zapisano!");
      } catch (err) { alert("Błąd: " + err.message); }
  };

  // 5. Pobieranie / Raport (Z NAPRAWIONYM LINKIEM)
  const handleDownloadSingle = () => {
      if (!location || !coords) return;
      
      // POPRAWIONY LINK:
      const googleLink = `https://www.google.com/maps?q=${coords.replace(' ', '')}`;

      const headers = "Województwo;Miejscowość;Ulica;Numer;Kod Pocztowy;Wysokość;Współrzędne;Link\n";
      const row = `${location.wojewodztwo};${location.miejscowosc};${location.ulica};${point === 'center' ? 'Środek' : point};${postalCode || 'Brak'};${elevation};${coords};${googleLink}`;
      const blob = new Blob(["\uFEFF" + headers + row], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `dane.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleAddToReport = () => {
    if (!location || !coords) return;
    
    // POPRAWIONY LINK:
    const googleLink = `https://www.google.com/maps?q=${coords.replace(' ', '')}`;

    const newItem = {
      id: `${id}-${point}`,
      wojewodztwo: location.wojewodztwo, miejscowosc: location.miejscowosc, ulica: location.ulica, numer: point === 'center' ? 'Środek' : point,
      kod: postalCode || 'Brak', wysokosc: elevation ? `${elevation} m` : 'Brak', wspolrzedne: coords,
      link_mapy: googleLink,
      data_dodania: new Date().toLocaleString()
    };
    const report = JSON.parse(localStorage.getItem('my_report') || '[]');
    if (report.find(i => i.id === newItem.id)) { alert("Już jest w raporcie!"); return; }
    localStorage.setItem('my_report', JSON.stringify([...report, newItem]));
    alert("Dodano do raportu!");
  };

  // --- MODAL ZGŁOSZEŃ ---
  const openReportModal = () => {
      setReportType('kod');
      setReportNote('');
      setShowReportModal(true);
  };

  const submitReport = async () => {
      let finalDescription = '';

      if (reportType === 'kod') {
          if (!reportNote) { alert("Podaj poprawny kod pocztowy!"); return; }
          finalDescription = `[BŁĄD KODU] Użytkownik sugeruje zmianę na: ${reportNote}`;
      } else {
          finalDescription = `[ADRES NIE ISTNIEJE] Użytkownik zgłasza, że ten budynek nie istnieje.`;
      }

      try {
          const { error } = await supabase.from('zgloszenia').insert([{ 
              lokalizacja_id: id, 
              numer_domu: point, 
              opis: finalDescription, 
              status: 'oczekujace' 
          }]);

          if (error) throw error;
          alert("Zgłoszenie wysłane! Dziękujemy.");
          setShowReportModal(false);
      } catch (err) {
          alert("Błąd wysyłania: " + err.message);
      }
  };

  if (loading) return <div className="App"><p style={{marginTop:'50px'}}>Ładowanie...</p></div>;
  if (!location) return <div className="App"><p>Brak danych.</p></div>;

  return (
    <div className="App">
      
      {/* --- MODAL ZGŁOSZENIOWY --- */}
      {showReportModal && (
          <div className="login-modal-overlay">
              <div className="login-modal">
                  <h2>Co się nie zgadza?</h2>
                  
                  <div className="report-options">
                      <label 
                        className={`report-card ${reportType === 'kod' ? 'selected' : ''}`}
                        onClick={() => setReportType('kod')}
                      >
                          <input 
                            type="radio" 
                            name="rtype" 
                            checked={reportType === 'kod'} 
                            onChange={() => setReportType('kod')} 
                          /> 
                          <span className="report-text">Błędny Kod Pocztowy</span>
                      </label>

                      <label 
                        className={`report-card ${reportType === 'brak' ? 'selected-danger' : ''}`}
                        onClick={() => setReportType('brak')}
                      >
                          <input 
                            type="radio" 
                            name="rtype" 
                            checked={reportType === 'brak'} 
                            onChange={() => setReportType('brak')} 
                          /> 
                          <span className="report-text danger">Ten adres nie istnieje</span>
                      </label>
                  </div>

                  {reportType === 'kod' && (
                      <input 
                        type="text" 
                        placeholder="Podaj poprawny kod (np. 00-123)" 
                        value={reportNote}
                        onChange={(e) => setReportNote(e.target.value)}
                        autoFocus
                      />
                  )}

                  <div className="login-buttons">
                      <button onClick={submitReport} className="btn-confirm-login">Wyślij</button>
                      <button onClick={() => setShowReportModal(false)} className="btn-cancel-login">Anuluj</button>
                  </div>
              </div>
          </div>
      )}

      <header className="app-header">
        <span className="header-subinfo">woj. {location.wojewodztwo}</span>
        <h1 className="header-city">{location.ulica} {point !== 'center' ? point : ''}</h1>
        <span className="header-subinfo">{location.miejscowosc}</span>
      </header>

      <div className="table-container">
        <Link to={`/select/${id}`} style={{ color: 'black', marginBottom: '20px', textDecoration: 'none' }}>🠔 Wróć do wyboru</Link>

        <div style={{ margin: '30px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="info-badge postal-badge">
                  <span className="badge-label">Kod Pocztowy</span>
                  {isEditing ? (
                      <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                          <input type="text" value={newPostal} onChange={(e) => setNewPostal(e.target.value)} style={{width: '70px', padding: '2px'}}/>
                          <button onClick={savePostalCode} style={{cursor: 'pointer', background: '#27ae60', color:'white', border:'none'}}>OK</button>
                          <button onClick={() => setIsEditing(false)} style={{cursor: 'pointer', background: '#c0392b', color:'white', border:'none'}}>X</button>
                      </div>
                  ) : (
                      <>
                        <span className="badge-value">{postalCode || 'Brak'}</span>
                        {(userRole === 'operator' || userRole === 'audytor') && (
                            <button onClick={startEditing} className="btn-edit-small" title="Edytuj kod">✏️</button>
                        )}
                      </>
                  )}
              </div>
              {elevation && <div className="info-badge elevation-badge"><span className="badge-label">Wysokość n.p.m.</span><span className="badge-value">{elevation} m</span></div>}
          </div>

          <strong style={{ display: 'block', marginBottom: '10px', color: '#555', marginTop: '20px' }}>Współrzędne GPS:</strong>
          {coords ? <span style={{ color: '#27ae60', fontFamily: 'monospace', fontSize: '1.4em', background: '#e8f6f3', padding: '10px 20px', borderRadius: '5px' }}>{coords}</span> : <span style={{ color: '#e74c3c' }}>Brak danych</span>}
        </div>

        <div className="action-buttons">
            {coords ? (
            <>
                {/* POPRAWIONY LINK PONIŻEJ */}
                <a href={`https://www.google.com/maps?q=${coords.replace(' ', '')}`} target="_blank" rel="noreferrer" className="btn-search" style={{ backgroundColor: '#2980b9' }}>Mapa 🗺️</a>
                <button onClick={handleAddToReport} className="btn-add-report">+ Dodaj do raportu</button>
                <button onClick={handleDownloadSingle} className="btn-download">Pobierz ten plik 📥</button>
            </>
            ) : (
            <button className="btn-search" onClick={handleGeocode} disabled={processing}>{processing ? 'Pobieranie...' : `📍 Pobierz pozycję i Dane`}</button>
            )}
        </div>

        <div style={{marginTop: '30px', padding: '15px', border: '1px dashed #e74c3c', borderRadius: '8px', backgroundColor: '#fdf2f2', width: '90%'}}>
            <p style={{color: '#c0392b', fontSize: '0.9em', margin: '0 0 10px 0'}}>Widzisz błąd w danych?</p>
            <button onClick={openReportModal} className="btn-report-error">📢 Zgłoś błąd tego adresu</button>
        </div>
      </div>
    </div>
  );
}

export default Details;