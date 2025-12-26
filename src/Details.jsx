/* PLIK: Details.jsx 
 * Główny komponent widoku szczegółów lokalizacji.
 * Realizuje logikę wyświetlania danych, geokodowania oraz zarządzania cechami dynamicznymi.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';

// --- HELPERY (Funkcje pomocnicze) ---
// Pobieranie ciasteczka do weryfikacji roli użytkownika (prosta autoryzacja)
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

function Details() {
  // Pobranie parametrów z adresu URL (np. id ulicy i numer domu)
  const { id, point } = useParams();
  const navigate = useNavigate();

  // --- ZARZĄDZANIE STANEM APLIKACJI (React Hooks) ---
  const [location, setLocation] = useState(null);       // Dane ogólne ulicy (z tabeli lokalizacje)
  const [coords, setCoords] = useState(null);           // Współrzędne (geom)
  const [postalCode, setPostalCode] = useState(null);   // Kod pocztowy
  const [elevation, setElevation] = useState(null);     // Wysokość n.p.m.
  const [loading, setLoading] = useState(true);         // Status ładowania danych
  const [processing, setProcessing] = useState(false);  // Status przetwarzania (np. geokodowania)

  // Stan uprawnień i edycji
  const [userRole, setUserRole] = useState(getCookie('user_role') || 'guest');
  const [isEditing, setIsEditing] = useState(false);
  const [newPostal, setNewPostal] = useState('');
  
  // Przechowuje informację, na której tabeli aktualnie operujemy (adresy czy lokalizacje)
  const [currentRecordInfo, setCurrentRecordInfo] = useState({ table: '', id: null });

  // Stan dla modułu zgłoszeń (Crowdsourcing)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('kod');
  const [reportNote, setReportNote] = useState('');

  // Stan dla notatek społeczności
  const [notes, setNotes] = useState([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // --- CECHY DYNAMICZNE (Logika atrybutów) ---
  const [assignedFeatures, setAssignedFeatures] = useState([]);   // Cechy przypisane do tego adresu
  const [availableFeatures, setAvailableFeatures] = useState([]); // Lista wszystkich dostępnych definicji cech
  const [showFeatureInput, setShowFeatureInput] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [featureValue, setFeatureValue] = useState('');
  const [editingFeatureId, setEditingFeatureId] = useState(null);

  // Funkcja generująca bezpieczny link do Google Maps na podstawie współrzędnych
  const getGoogleMapsLink = (query) => {
    if (!query) return '#';
    return `http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(query)}`;
  };

  // --- EFEKT 1: INICJALIZACJA DANYCH ---
  // Pobiera dane o ulicy i konkretnym punkcie adresowym przy wejściu na stronę
  useEffect(() => {
    async function getData() {
      // 1. Pobranie danych bazowych ulicy
      const { data: streetData, error } = await supabase.from('lokalizacje').select('*').eq('id', id).single();
      if (error || !streetData) { setLoading(false); return; }
      
      // Sprawdzenie flagi Soft Delete
      if (streetData.czy_usuniety) { alert("Lokalizacja usunięta."); navigate('/'); return; }
      setLocation(streetData);

      // 2. Rozróżnienie logiki: Centrum ulicy vs Konkretny numer domu
      if (point === 'center') {
        // Jesteśmy na widoku ogólnym ulicy
        if (streetData.geom) setCoords(streetData.geom);
        if (streetData.kod_pocztowy) setPostalCode(streetData.kod_pocztowy);
        setCurrentRecordInfo({ table: 'lokalizacje', id: streetData.id });
      } else {
        // Jesteśmy na konkretnym numerze - szukamy w tabeli 'adresy'
        const { data: addressData } = await supabase.from('adresy').select('*').eq('lokalizacja_id', id).eq('numer_domu', point).single();
        if (addressData) {
          if (addressData.czy_usuniety) { alert("Adres usunięty."); navigate(`/select/${id}`); return; }
          if (addressData.geom) setCoords(addressData.geom);
          if (addressData.kod_pocztowy) setPostalCode(addressData.kod_pocztowy);
          setCurrentRecordInfo({ table: 'adresy', id: addressData.id });
        }
      }

      // 3. Pobranie notatek społeczności dla tego punktu
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

  // --- EFEKT 1b: POBIERANIE CECH DYNAMICZNYCH ---
  // Uruchamia się tylko gdy mamy zidentyfikowany konkretny rekord ID
  useEffect(() => {
    if (!currentRecordInfo.id) return;
    async function getFeatures() {
      // Pobranie cech przypisanych (JOIN z definicjami cech)
      const { data: myFeats } = await supabase
        .from('adresy_cechy')
        .select(`id, wartosc, cecha_id, cechy_definicje ( id, nazwa )`)
        .eq('adres_id', currentRecordInfo.id);

      // Pobranie słownika wszystkich dostępnych cech (do listy rozwijanej)
      const { data: allDefs } = await supabase.from('cechy_definicje').select('*');

      setAssignedFeatures(myFeats || []);
      setAvailableFeatures(allDefs || []);
    }
    getFeatures();
  }, [currentRecordInfo.id]);

  // --- OBSŁUGA CRUD DLA CECH (Create, Update, Delete) ---
  
  const handleAddFeature = async () => {
    // Walidacja danych wejściowych
    if (!selectedFeatureId || !featureValue.trim()) return;

    // Sprawdzenie duplikatów (czy cecha już istnieje)
    if (assignedFeatures.some(af => af.cecha_id === selectedFeatureId)) {
      alert("Ta cecha jest już przypisana do tego adresu!");
      return;
    }

    // Insert do tabeli łączącej (Relacja wiele-do-wielu)
    const { error } = await supabase.from('adresy_cechy').insert([{
      adres_id: currentRecordInfo.id,
      cecha_id: selectedFeatureId,
      wartosc: featureValue.trim()
    }]);

    if (error) alert("Błąd: " + error.message);
    else {
      alert("Dodano cechę!");
      setShowFeatureInput(false);
      setFeatureValue('');
      // Odświeżenie listy cech po dodaniu
      const { data } = await supabase.from('adresy_cechy').select(`id, wartosc, cecha_id, cechy_definicje(id, nazwa)`).eq('adres_id', currentRecordInfo.id);
      setAssignedFeatures(data || []);
    }
  };

  const handleUpdateFeature = async (recordId, newValue) => {
    const { error } = await supabase.from('adresy_cechy').update({ wartosc: newValue }).eq('id', recordId);
    if (!error) {
      setEditingFeatureId(null);
      // Aktualizacja stanu lokalnego (Optymistyczne UI)
      setAssignedFeatures(prev => prev.map(f => f.id === recordId ? { ...f, wartosc: newValue } : f));
    } else alert(error.message);
  };

  const handleDeleteFeature = async (recordId) => {
    if (!window.confirm("Usunąć cechę?")) return;
    const { error } = await supabase.from('adresy_cechy').delete().eq('id', recordId);
    if (!error) {
      setAssignedFeatures(prev => prev.filter(f => f.id !== recordId));
    }
  };

  // --- EFEKT 2: INTEGRACJA Z API WYSOKOŚCIOWYM (Open-Meteo) ---
  // Nasłuchuje zmian współrzędnych (coords). Gdy się pojawią, pobiera wysokość.
  useEffect(() => {
    if (!coords) return;
    const [lat, lon] = coords.split(',').map(x => x.trim());
    
    // Fetch do zewnętrznego API
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`)
      .then(res => res.json())
      .then(data => {
        if (data.elevation && data.elevation.length > 0) setElevation(data.elevation[0].toFixed(1));
      })
      .catch(err => console.error("Błąd wysokości:", err));
  }, [coords]);

  // --- GEOKODOWANIE (Nominatim API) ---
  const handleGeocode = async () => {
    if (!location) return;
    setProcessing(true);
    
    // Normalizacja nazwy ulicy dla lepszych wyników wyszukiwania
    const cleanUlica = location.ulica.replace(/ul\.|al\.|pl\./g, '').trim();
    
    // Budowanie zapytania zależnie od kontekstu (centrum ulicy vs numer domu)
    const query = point === 'center'
      ? `${cleanUlica}, ${location.miejscowosc}, ${location.wojewodztwo}`
      : `${cleanUlica} ${point}, ${location.miejscowosc}, ${location.wojewodztwo}`;

    try {
      // Zapytanie do Nominatim
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const resultCoords = `${data[0].lat}, ${data[0].lon}`;
        const resultPostCode = data[0].address?.postcode || null;

        if (point === 'center') {
          // Aktualizacja rekordu ulicy
          await supabase.from('lokalizacje').update({ geom: resultCoords, kod_pocztowy: resultPostCode }).eq('id', id);
        } else {
          // UPSERT adresu: Jeśli istnieje -> aktualizuj, jeśli nie -> stwórz nowy
          const { data: newAddr } = await supabase.from('adresy').upsert({
            lokalizacja_id: id, numer_domu: point, geom: resultCoords, kod_pocztowy: resultPostCode
          }, { onConflict: 'lokalizacja_id, numer_domu' }).select().single();
          
          if (newAddr) setCurrentRecordInfo({ table: 'adresy', id: newAddr.id });
        }
        
        // Aktualizacja stanu widoku
        setCoords(resultCoords);
        if (resultPostCode) setPostalCode(resultPostCode);
      } else alert("Nie znaleziono współrzędnych.");
    } catch (e) { alert("Błąd połączenia."); }
    finally { setProcessing(false); }
  };

  // --- MODUŁ EDYCJI RĘCZNEJ (Kod Pocztowy) ---
  const startEditing = () => { setNewPostal(postalCode || ''); setIsEditing(true); };

  const savePostalCode = async () => {
    if (!currentRecordInfo.id) { alert("Brak rekordu. Najpierw pobierz dane."); return; }
    
    const { error } = await supabase.from(currentRecordInfo.table).update({ kod_pocztowy: newPostal }).eq('id', currentRecordInfo.id);
    if (!error) {
      // Logowanie audytowe (kto zmienił, co i kiedy)
      await supabase.from('logi_systemowe').insert([{
        rola: userRole, akcja: 'zmiana_kodu',
        opis_szczegolowy: `Zmiana kodu z ${postalCode} na ${newPostal}`,
        tabela: currentRecordInfo.table, rekord_id: currentRecordInfo.id, poprzednie_dane: { kod_pocztowy: postalCode }
      }]);
      setPostalCode(newPostal); setIsEditing(false); alert("Zapisano!");
    }
  };

  // --- GENEROWANIE RAPORTU CSV (Client-Side) ---
  const handleDownloadSingle = () => {
    if (!location || !coords) return;
    const safeLink = getGoogleMapsLink(coords);
    
    // Budowanie treści pliku CSV wiersz po wierszu
    let csvContent = `Adres;${location.ulica} ${point}\n`;
    csvContent += `Miejscowość;${location.miejscowosc}\n`;
    csvContent += `Województwo;${location.wojewodztwo}\n`;
    csvContent += `Kod Pocztowy;${postalCode || 'Brak'}\n`;
    csvContent += `Współrzędne;${coords}\n`;
    csvContent += `Wysokość;${elevation ? elevation + ' m' : '-'}\n`;
    csvContent += `Link do Mapy;${safeLink}\n`;
    csvContent += `Data pobrania;${new Date().toLocaleString()}\n`;

    // Dodanie cech dynamicznych do pliku
    if (assignedFeatures.length > 0) {
        csvContent += `\n--- CECHY DODATKOWE ---\n`;
        assignedFeatures.forEach(f => {
            csvContent += `${f.cechy_definicje?.nazwa};${f.wartosc}\n`;
        });
    }

    // Tworzenie obiektu Blob z kodowaniem UTF-8 (BOM)
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Lokalizacja_${location.miejscowosc}_${point}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- KOSZYK RAPORTOWY (LocalStorage) ---
  const handleAddToReport = () => {
    const report = JSON.parse(localStorage.getItem('my_report') || '[]');
    
    const featuresString = assignedFeatures.length > 0 
        ? assignedFeatures.map(f => `${f.cechy_definicje?.nazwa}: ${f.wartosc}`).join(' | ')
        : '-';

    const newItem = {
      id: `${id}-${point}`,
      wojewodztwo: location.wojewodztwo,
      miejscowosc: location.miejscowosc,
      ulica: location.ulica,
      numer: point,
      kod: postalCode,
      wysokosc: elevation ? `${elevation} m` : '-',
      coords: coords,
      link: getGoogleMapsLink(coords),
      data: new Date().toLocaleString(),
      cechy: featuresString
    };

    report.push(newItem);
    localStorage.setItem('my_report', JSON.stringify(report));
    alert("Dodano do raportu (razem z cechami)!");
  };

  // --- OBSŁUGA ZGŁOSZEŃ (System partycypacyjny) ---
  const openReportModal = () => { setReportType('kod'); setReportNote(''); setShowReportModal(true); };

  const submitReport = async () => {
    const desc = reportType === 'kod' ? `[BŁĄD KODU] Sugerowany: ${reportNote}` : `[ADRES NIE ISTNIEJE]`;
    await supabase.from('zgloszenia').insert([{ lokalizacja_id: id, numer_domu: point, opis: desc, status: 'oczekujace' }]);
    alert("Wysłano zgłoszenie!"); setShowReportModal(false);
  };

  const handleSuggestNote = async () => {
    if (!newNoteText.trim()) return;
    const desc = `[NOTATKA] ${newNoteText}`;
    const { error } = await supabase.from('zgloszenia').insert([{ lokalizacja_id: id, numer_domu: point, opis: desc, status: 'oczekujace' }]);
    if (!error) { alert("Notatka wysłana do weryfikacji!"); setNewNoteText(''); setShowNoteInput(false); } else { alert("Błąd: " + error.message); }
  };

  const getLatLon = () => {
    if (!coords) return { lat: '-', lon: '-' };
    const parts = coords.split(',');
    return { lat: parts[0].trim(), lon: parts[1].trim() };
  };
  const { lat, lon } = getLatLon();

  if (loading) return <div className="App"><p style={{ marginTop: '50px' }}>Ładowanie...</p></div>;

  // --- RENDEROWANIE INTERFEJSU (JSX) ---
  return (
    <div className="App">
      {/* Modal zgłaszania błędów */}
      {showReportModal && (
        <div className="login-modal-overlay">
          <div className="login-modal">
            <h2>Co się nie zgadza?</h2>
            {/* ... zawartość modala ... */}
            <div className="report-options">
              <label className={`report-card ${reportType === 'kod' ? 'selected' : ''}`} onClick={() => setReportType('kod')}><input type="radio" name="rtype" checked={reportType === 'kod'} onChange={() => setReportType('kod')} /> <span className="report-text">Błędny Kod Pocztowy</span></label>
              <label className={`report-card ${reportType === 'brak' ? 'selected-danger' : ''}`} onClick={() => setReportType('brak')}><input type="radio" name="rtype" checked={reportType === 'brak'} onChange={() => setReportType('brak')} /> <span className="report-text danger">Ten adres nie istnieje</span></label>
            </div>
            {reportType === 'kod' && <input type="text" placeholder="Podaj poprawny kod" value={reportNote} onChange={(e) => setReportNote(e.target.value)} autoFocus />}
            <div className="login-buttons"><button onClick={submitReport} className="btn-confirm-login">Wyślij</button><button onClick={() => setShowReportModal(false)} className="btn-cancel-login">Anuluj</button></div>
          </div>
        </div>
      )}

      {/* Nagłówek strony */}
      <header className="app-header">
        <span className="header-subinfo">woj. {location.wojewodztwo}</span>
        <h1 className="header-city">{location.ulica} {point !== 'center' ? point : ''}</h1>
        <span className="header-subinfo">{location.miejscowosc}</span>
      </header>

      <div className="table-container">
        <Link to={`/select/${id}`} style={{ color: 'black', display: 'block', marginBottom: '20px' }}>🠔 Wróć do wyboru</Link>

        {/* --- UKŁAD SIATKI: LEWA STRONA (Info) | PRAWA STRONA (Cechy) --- */}
        <div className="data-grid">
          
          {/* KOLUMNA LEWA: Główne dane adresowe */}
          <div className="data-card info-section">
            <div className="info-row">
              <span className="label">Kod Pocztowy:</span>
              {/* Renderowanie warunkowe: tryb edycji vs tryb podglądu */}
              {isEditing ? (
                <div className="edit-box"><input value={newPostal} onChange={e => setNewPostal(e.target.value)} /><button onClick={savePostalCode}>💾</button><button onClick={() => setIsEditing(false)} className="cancel">✖</button></div>
              ) : (
                <div className="value-box"><strong>{postalCode || 'Brak'}</strong>{(userRole === 'operator' || userRole === 'audytor') && <button onClick={startEditing} className="btn-edit-mini">✏️</button>}</div>
              )}
            </div>
            
            <div className="info-row" style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <span className="label">Wysokość:</span>
              <div className="value-box">{elevation ? <strong style={{ color: '#2980b9' }}>{elevation} m n.p.m.</strong> : <span style={{ color: '#999' }}>Brak danych</span>}</div>
            </div>

            <div style={{ marginTop: '20px', borderTop: '2px solid #eee', paddingTop: '15px' }}>
                <div className="coords-header">Współrzędne Geograficzne</div>
                {coords ? (
                    <div className="coords-display">
                        <div className="coord-item"><span className="coord-label">🌐 Szerokość (Lat)</span><span className="coord-val">{lat}</span></div>
                        <div className="coord-item"><span className="coord-label">🧭 Długość (Lon)</span><span className="coord-val">{lon}</span></div>
                    </div>
                ) : (
                    <div className="no-coords">Brak danych GPS<br />Kliknij "Pobierz dane"</div>
                )}
            </div>
          </div>

          {/* KOLUMNA PRAWA: Lista Cech Dynamicznych */}
          <div className="data-card coords-section">
            <div>
              <h4 style={{ margin: '0 0 15px 0', color: '#16a085', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>📋 Cechy Dodatkowe</h4>

              {assignedFeatures.length === 0 && <p style={{ fontSize: '0.85em', color: '#999' }}>Brak przypisanych cech.</p>}

              <div className="features-list">
                {assignedFeatures.map(af => (
                  <div key={af.id} className="feature-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', padding: '8px', marginBottom: '5px', borderRadius: '4px', fontSize: '0.9em' }}>
                    <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{af.cechy_definicje?.nazwa}:</span>

                    {/* Edycja cechy w miejscu (Inline Editing) */}
                    {editingFeatureId === af.id ? (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <input defaultValue={af.wartosc} id={`edit-feat-${af.id}`} style={{ width: '80px', padding: '2px' }} />
                        <button onClick={() => handleUpdateFeature(af.id, document.getElementById(`edit-feat-${af.id}`).value)} className="btn-save-mini">💾</button>
                        <button onClick={() => setEditingFeatureId(null)} className="btn-cancel-mini">✖</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span>{af.wartosc}</span>
                        {(userRole === 'operator' || userRole === 'audytor') && (
                          <>
                            <button onClick={() => setEditingFeatureId(af.id)} style={{ cursor: 'pointer', border: 'none', background: 'none' }}>✏️</button>
                            {userRole === 'audytor' && <button onClick={() => handleDeleteFeature(af.id)} style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'red' }}>🗑️</button>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Formularz dodawania nowej cechy */}
              {(userRole === 'operator' || userRole === 'audytor') && (
                !showFeatureInput ? (
                  <button onClick={() => setShowFeatureInput(true)} style={{ fontSize: '0.8em', marginTop: '10px', background: '#eafaf1', border: '1px solid #2ecc71', color: '#27ae60', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>+ Dodaj cechę</button>
                ) : (
                  <div style={{ marginTop: '10px', background: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px' }}>
                    <select
                      value={selectedFeatureId}
                      onChange={e => setSelectedFeatureId(e.target.value)}
                      style={{ width: '100%', padding: '5px', marginBottom: '5px' }}
                    >
                      <option value="">-- Wybierz cechę --</option>
                      {availableFeatures.map(def => <option key={def.id} value={def.id}>{def.nazwa}</option>)}
                    </select>
                    <input
                      placeholder="Wartość (np. 123-456)"
                      value={featureValue}
                      onChange={e => setFeatureValue(e.target.value)}
                      style={{ width: '100%', padding: '5px', marginBottom: '5px' }}
                    />
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={handleAddFeature} className="btn-confirm-login" style={{ flex: 1, fontSize: '0.8em' }}>Zapisz</button>
                      <button onClick={() => setShowFeatureInput(false)} className="btn-cancel-login" style={{ flex: 1, fontSize: '0.8em' }}>Anuluj</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Przyciski akcji (Pobranie danych, Eksport, Mapa) */}
        <div className="action-buttons">
          {coords ? (
            <>
              <a
                href={getGoogleMapsLink(coords)}
                target="_blank"
                rel="noreferrer"
                className="btn-search"
              >
                Mapa Google 🗺️
              </a>
              <button onClick={handleAddToReport} className="btn-add-report">+ Dodaj do raportu</button>
              <button onClick={handleDownloadSingle} className="btn-download">Pobierz CSV 📥</button>
            </>
          ) : (
            <button className="btn-search" onClick={handleGeocode} disabled={processing}>{processing ? 'Pobieranie...' : `📍 Pobierz pozycję i dane`}</button>
          )}
        </div>

        <div style={{ marginTop: '30px' }}><button onClick={openReportModal} className="btn-report-error">📢 Zgłoś błąd tego adresu</button></div>

        {/* Sekcja Notatek Społeczności */}
        <div className="notes-container" style={{ marginTop: '40px', borderTop: '2px dashed #ddd', paddingTop: '20px' }}>
          <h3 style={{ color: '#f39c12' }}>📝 Notatki Społeczności</h3>
          {notes.length === 0 ? <p style={{ color: '#999', fontStyle: 'italic' }}>Brak notatek. Wiesz coś ciekawego? Dodaj!</p> : (
            <div className="notes-list">{notes.map(note => (<div key={note.id} className="note-card"><p className="note-content">"{note.tresc}"</p><span className="note-meta">Dodano: {new Date(note.data_dodania).toLocaleDateString()}</span></div>))}</div>
          )}
          {!showNoteInput ? (
            <button onClick={() => setShowNoteInput(true)} className="btn-suggest-note">➕ Dodaj informację (np. kod domofonu, firma)</button>
          ) : (
            <div className="note-input-box">
              <textarea placeholder="Np. Kod do klatki 1 to 1234..." value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}><button onClick={handleSuggestNote} className="btn-confirm-login" style={{ fontSize: '0.9em' }}>Wyślij do zatwierdzenia</button><button onClick={() => setShowNoteInput(false)} className="btn-cancel-login" style={{ fontSize: '0.9em' }}>Anuluj</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default Details;