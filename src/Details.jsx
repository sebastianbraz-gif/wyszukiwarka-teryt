import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

// --- HELPERY COOKIES ---
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};
// -----------------------

function Details() {
  const { id, point } = useParams();
  const navigate = useNavigate();
  
  const [location, setLocation] = useState(null);
  const [coords, setCoords] = useState(null);
  const [postalCode, setPostalCode] = useState(null);
  const [elevation, setElevation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Rola i Edycja
  const [userRole, setUserRole] = useState(getCookie('user_role') || 'guest');
  const [isEditing, setIsEditing] = useState(false);
  const [newPostal, setNewPostal] = useState('');
  const [currentRecordInfo, setCurrentRecordInfo] = useState({ table: '', id: null });
  
  // Zgłoszenia błędów
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('kod');
  const [reportNote, setReportNote] = useState('');

  // --- NOTATKI ---
  const [notes, setNotes] = useState([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // 1. Pobieranie danych
  useEffect(() => {
    async function getData() {
      // Pobierz lokalizację
      const { data: streetData, error } = await supabase.from('lokalizacje').select('*').eq('id', id).single();
      if (error || !streetData) { setLoading(false); return; }
      if (streetData.czy_usuniety) { alert("Lokalizacja usunięta."); navigate('/'); return; }
      setLocation(streetData);

      // Ustal punkt (center lub numer)
      if (point === 'center') {
        if (streetData.geom) setCoords(streetData.geom);
        if (streetData.kod_pocztowy) setPostalCode(streetData.kod_pocztowy);
        setCurrentRecordInfo({ table: 'lokalizacje', id: streetData.id });
      } else {
        const { data: addressData } = await supabase.from('adresy').select('*').eq('lokalizacja_id', id).eq('numer_domu', point).single();
        if (addressData) {
          if (addressData.czy_usuniety) { alert("Adres usunięty."); navigate(`/select/${id}`); return; }
          if (addressData.geom) setCoords(addressData.geom);
          if (addressData.kod_pocztowy) setPostalCode(addressData.kod_pocztowy);
          setCurrentRecordInfo({ table: 'adresy', id: addressData.id });
        }
      }

      // Pobierz NOTATKI
      const { data: notesData } = await supabase
        .from('notatki')
        .select('*')
        .eq('lokalizacja_id', id)
        .eq('numer_domu', point)
        .order('data_dodania', { ascending: false });
      
      setNotes(notesData || []);
      setLoading(false);
    }
    getData();
  }, [id, point, navigate]);

  // 2. Wysokość
  useEffect(() => {
    if (!coords) return;
    const [lat, lon] = coords.split(',').map(x => x.trim());
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`)
      .then(res => res.json())
      .then(data => { 
          if(data.elevation && data.elevation.length > 0) setElevation(data.elevation[0].toFixed(1)); 
      })
      .catch(err => console.error("Błąd wysokości:", err));
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
          await supabase.from('lokalizacje').update({ geom: resultCoords, kod_pocztowy: resultPostCode }).eq('id', id);
        } else {
          const { data: newAddr } = await supabase.from('adresy').upsert({ 
              lokalizacja_id: id, numer_domu: point, geom: resultCoords, kod_pocztowy: resultPostCode 
          }, { onConflict: 'lokalizacja_id, numer_domu' }).select().single();
          if (newAddr) setCurrentRecordInfo({ table: 'adresy', id: newAddr.id });
        }
        setCoords(resultCoords); 
        if (resultPostCode) setPostalCode(resultPostCode);
      } else alert("Nie znaleziono współrzędnych.");
    } catch (e) { alert("Błąd połączenia."); } 
    finally { setProcessing(false); }
  };

  const startEditing = () => { setNewPostal(postalCode || ''); setIsEditing(true); };
  
  const savePostalCode = async () => {
      if (!currentRecordInfo.id) { alert("Brak rekordu. Najpierw pobierz dane."); return; }
      const { error } = await supabase.from(currentRecordInfo.table).update({ kod_pocztowy: newPostal }).eq('id', currentRecordInfo.id);
      if (!error) {
          await supabase.from('logi_systemowe').insert([{ 
              rola: userRole, akcja: 'zmiana_kodu', 
              opis_szczegolowy: `Zmiana kodu z ${postalCode} na ${newPostal}`, 
              tabela: currentRecordInfo.table, rekord_id: currentRecordInfo.id, poprzednie_dane: { kod_pocztowy: postalCode } 
          }]);
          setPostalCode(newPostal); setIsEditing(false); alert("Zapisano!");
      }
  };

  const handleDownloadSingle = () => {
      if (!location || !coords) return;
      const link = document.createElement('a'); link.href = `data:text/csv;charset=utf-8,\uFEFFAdres;${location.ulica} ${point}\nWspółrzędne;${coords}\nLink;http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`; link.download = 'dane.csv'; link.click();
  };

  const handleAddToReport = () => {
    const report = JSON.parse(localStorage.getItem('my_report') || '[]');
    report.push({ id: `${id}-${point}`, ulica: location.ulica, numer: point, kod: postalCode, coords: coords, link: `http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`, data: new Date().toLocaleString() });
    localStorage.setItem('my_report', JSON.stringify(report)); alert("Dodano do raportu!");
  };

  const openReportModal = () => { setReportType('kod'); setReportNote(''); setShowReportModal(true); };
  
  const submitReport = async () => {
      const desc = reportType === 'kod' ? `[BŁĄD KODU] Sugerowany: ${reportNote}` : `[ADRES NIE ISTNIEJE]`;
      await supabase.from('zgloszenia').insert([{ lokalizacja_id: id, numer_domu: point, opis: desc, status: 'oczekujace' }]);
      alert("Wysłano zgłoszenie!"); setShowReportModal(false);
  };

  // --- FUNKCJA ZGŁASZANIA NOTATKI ---
  const handleSuggestNote = async () => {
    if (!newNoteText.trim()) return;
    const desc = `[NOTATKA] ${newNoteText}`; // Specjalny prefiks
    
    const { error } = await supabase.from('zgloszenia').insert([{ 
        lokalizacja_id: id, 
        numer_domu: point, 
        opis: desc, 
        status: 'oczekujace' 
    }]);

    if (!error) {
        alert("Notatka wysłana do weryfikacji!");
        setNewNoteText('');
        setShowNoteInput(false);
    } else {
        alert("Błąd: " + error.message);
    }
  };

  const getLatLon = () => {
      if(!coords) return { lat: '-', lon: '-' };
      const parts = coords.split(',');
      return { lat: parts[0].trim(), lon: parts[1].trim() };
  };
  const { lat, lon } = getLatLon();

  if (loading) return <div className="App"><p style={{marginTop:'50px'}}>Ładowanie...</p></div>;
  
  return (
    <div className="App">
      {showReportModal && (
          <div className="login-modal-overlay">
              <div className="login-modal">
                  <h2>Co się nie zgadza?</h2>
                  <div className="report-options">
                      <label className={`report-card ${reportType === 'kod' ? 'selected' : ''}`} onClick={() => setReportType('kod')}>
                          <input type="radio" name="rtype" checked={reportType === 'kod'} onChange={() => setReportType('kod')} /> 
                          <span className="report-text">Błędny Kod Pocztowy</span>
                      </label>
                      <label className={`report-card ${reportType === 'brak' ? 'selected-danger' : ''}`} onClick={() => setReportType('brak')}>
                          <input type="radio" name="rtype" checked={reportType === 'brak'} onChange={() => setReportType('brak')} /> 
                          <span className="report-text danger">Ten adres nie istnieje</span>
                      </label>
                  </div>
                  {reportType === 'kod' && <input type="text" placeholder="Podaj poprawny kod" value={reportNote} onChange={(e) => setReportNote(e.target.value)} autoFocus />}
                  <div className="login-buttons"><button onClick={submitReport} className="btn-confirm-login">Wyślij</button><button onClick={() => setShowReportModal(false)} className="btn-cancel-login">Anuluj</button></div>
              </div>
          </div>
      )}

      <header className="app-header">
        <span className="header-subinfo">woj. {location.wojewodztwo}</span>
        <h1 className="header-city">{location.ulica} {point !== 'center' ? point : ''}</h1>
        <span className="header-subinfo">{location.miejscowosc}</span>
      </header>

      <div className="table-container">
        <Link to={`/select/${id}`} style={{color:'black', display:'block', marginBottom:'20px'}}>🠔 Wróć do wyboru</Link>

        <div className="data-grid">
            <div className="data-card info-section">
                <div className="info-row">
                    <span className="label">Kod Pocztowy:</span>
                    {isEditing ? (
                        <div className="edit-box">
                            <input value={newPostal} onChange={e=>setNewPostal(e.target.value)} />
                            <button onClick={savePostalCode}>💾</button>
                            <button onClick={()=>setIsEditing(false)} className="cancel">✖</button>
                        </div>
                    ) : (
                        <div className="value-box">
                            <strong>{postalCode || 'Brak'}</strong>
                            {(userRole==='operator'||userRole==='audytor') && <button onClick={startEditing} className="btn-edit-mini">✏️</button>}
                        </div>
                    )}
                </div>
                
                <div className="info-row" style={{marginTop:'15px', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                    <span className="label">Wysokość:</span>
                    <div className="value-box">
                        {elevation ? <strong style={{color:'#2980b9'}}>{elevation} m n.p.m.</strong> : <span style={{color:'#999'}}>Brak danych</span>}
                    </div>
                </div>
            </div>

            <div className="data-card coords-section">
                <div className="coords-header">Współrzędne Geograficzne</div>
                {coords ? (
                    <div className="coords-display">
                        <div className="coord-item">
                            <span className="coord-label">🌐 Szerokość (Lat)</span>
                            <span className="coord-val">{lat}</span>
                        </div>
                        <div className="coord-item">
                            <span className="coord-label">🧭 Długość (Lon)</span>
                            <span className="coord-val">{lon}</span>
                        </div>
                    </div>
                ) : (
                    <div className="no-coords">Brak danych GPS<br/>Kliknij "Pobierz dane"</div>
                )}
            </div>
        </div>

        <div className="action-buttons">
            {coords ? (
            <>
                <a href={`http://googleusercontent.com/maps.google.com/?q=${coords.replace(' ', '')}`} target="_blank" rel="noreferrer" className="btn-search">Mapa Google 🗺️</a>
                <button onClick={handleAddToReport} className="btn-add-report">+ Dodaj do raportu</button>
                <button onClick={handleDownloadSingle} className="btn-download">Pobierz CSV 📥</button>
            </>
            ) : (
            <button className="btn-search" onClick={handleGeocode} disabled={processing}>
                {processing ? 'Pobieranie...' : `📍 Pobierz pozycję i dane`}
            </button>
            )}
        </div>

        <div style={{marginTop:'30px'}}>
            <button onClick={openReportModal} className="btn-report-error">📢 Zgłoś błąd tego adresu</button>
        </div>

        {/* --- SEKCJA NOTATEK (Tutaj dodano zmiany) --- */}
        <div className="notes-container" style={{marginTop: '40px', borderTop: '2px dashed #ddd', paddingTop: '20px'}}>
            <h3 style={{color: '#f39c12'}}>📝 Notatki Społeczności</h3>
            
            {notes.length === 0 ? (
                <p style={{color: '#999', fontStyle: 'italic'}}>Brak notatek. Wiesz coś ciekawego? Dodaj!</p>
            ) : (
                <div className="notes-list">
                    {notes.map(note => (
                        <div key={note.id} className="note-card">
                            <p className="note-content">"{note.tresc}"</p>
                            <span className="note-meta">Dodano: {new Date(note.data_dodania).toLocaleDateString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {!showNoteInput ? (
                <button onClick={() => setShowNoteInput(true)} className="btn-suggest-note">
                    ➕ Dodaj informację (np. kod domofonu, firma)
                </button>
            ) : (
                <div className="note-input-box">
                    <textarea 
                        placeholder="Np. Kod do klatki 1 to 1234, na parterze jest Żabka..."
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                    />
                    <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                        <button onClick={handleSuggestNote} className="btn-confirm-login" style={{fontSize: '0.9em'}}>Wyślij do zatwierdzenia</button>
                        <button onClick={() => setShowNoteInput(false)} className="btn-cancel-login" style={{fontSize: '0.9em'}}>Anuluj</button>
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}
export default Details;