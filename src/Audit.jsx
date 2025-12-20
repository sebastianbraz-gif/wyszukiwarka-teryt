import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

// --- HELPERY COOKIES ---
const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
};
// -----------------------

function Audit() {
    const [deletedItems, setDeletedItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const [updatingTeryt, setUpdatingTeryt] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportData, setReportData] = useState(null);

    // --- CECHY ---
    const [features, setFeatures] = useState([]);
    const [newFeatureName, setNewFeatureName] = useState('');

    const navigate = useNavigate();

    useEffect(() => {
        // CZYTAMY Z CIASTECZKA
        const role = getCookie('user_role');
        if (role !== 'audytor') {
            alert("Brak dostępu! Panel tylko dla Audytora.");
            navigate('/');
        }
    }, [navigate]);

    const fetchData = async () => {
        setLoading(true);
        const { data: trash } = await supabase.from('adresy').select(`*, lokalizacje ( ulica )`).eq('czy_usuniety', true);
        const { data: sl } = await supabase.from('logi_systemowe').select('*').order('data_akcji', { ascending: false }).limit(50);
        const { data: feats } = await supabase.from('cechy_definicje').select('*').order('created_at', { ascending: false });

        setDeletedItems(trash || []);
        setLogs(sl || []);
        setFeatures(feats || []);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const handleRestore = async (item) => {
        if (!window.confirm("Przywrócić adres?")) return;
        await supabase.from('adresy').update({ czy_usuniety: false }).eq('id', item.id);
        await supabase.from('logi_systemowe').insert([{ rola: 'audytor', akcja: 'przywrocenie', opis_szczegolowy: `Przywrócono ID ${item.id}` }]);
        fetchData();
    };

    const handleUndoChange = async (log) => {
        if (!window.confirm("Cofnąć zmianę?")) return;
        await supabase.from(log.tabela).update(log.poprzednie_dane).eq('id', log.rekord_id);
        await supabase.from('logi_systemowe').insert([{ rola: 'audytor', akcja: 'cofniecie', opis_szczegolowy: `Cofnięto log #${log.id}` }]);
        fetchData();
    };

    const handleUpdateTeryt = async () => {
        if (!window.confirm("Rozpocząć aktualizację bazy TERYT?")) return;
        setUpdatingTeryt(true);

        try {
            const res = await fetch('http://127.0.0.1:3001/api/update-teryt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) throw new Error(`Błąd HTTP: ${res.status}`);
            const json = await res.json();

            if (json.success) {
                setReportData(json.stats);
                setShowReportModal(true);
                fetchData();
            } else {
                alert("Błąd serwera: " + json.error);
            }
        } catch (e) {
            alert(`Błąd połączenia z backendem: ${e.message}.`);
        } finally {
            setUpdatingTeryt(false);
        }
    };

    const handleAddFeature = async () => {
        if (!newFeatureName.trim()) return;
        const { error } = await supabase.from('cechy_definicje').insert([{ nazwa: newFeatureName.trim() }]);
        if (error) alert("Błąd: " + error.message);
        else {
            setNewFeatureName('');
            fetchData();
        }
    };

    const handleDeleteFeature = async (id) => {
        if (!window.confirm("Usunąć definicję cechy? (Zostanie usunięta też z adresów!)")) return;
        const { error } = await supabase.from('cechy_definicje').delete().eq('id', id);
        if (error) alert("Błąd: " + error.message);
        else fetchData();
    };

    return (
        <div className="App">

            {showReportModal && reportData && (
                <div className="login-modal-overlay">
                    <div className="login-modal" style={{ textAlign: 'center' }}>
                        <h2 style={{ color: '#27ae60' }}>✅ Aktualizacja Zakończona</h2>
                        <div style={{ margin: '20px 0', textAlign: 'left', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
                            <p><strong>Plik źródłowy:</strong> {reportData.fileName}</p>
                            <p><strong>Znaleziono w pliku:</strong> {reportData.totalFound} rekordów</p>
                            <p><strong>Zaktualizowano (Demo):</strong> {reportData.processed} rekordów</p>
                            <p><strong>Czas trwania:</strong> {reportData.duration} s</p>
                            <p><strong>Data:</strong> {reportData.date}</p>
                        </div>
                        <button onClick={() => setShowReportModal(false)} className="btn-confirm-login">Zamknij Raport</button>
                    </div>
                </div>
            )}

            <header className="app-header" style={{ backgroundColor: '#8e44ad' }}>
                <h1>Panel Audytora 🔐</h1>
                <div style={{ marginTop: '10px' }}>
                    <Link to="/" style={{ color: 'white', marginRight: '20px' }}>Strona Główna</Link>
                    <Link to="/reports" style={{ color: '#f1c40f', fontWeight: 'bold' }}>Przejdź do Zgłoszeń ➜</Link>
                </div>
            </header>

            <div className="table-container" style={{ maxWidth: '1200px' }}>

                <div className="audit-section" style={{ backgroundColor: '#eafaf1', padding: '20px', borderRadius: '8px', border: '1px solid #2ecc71', marginBottom: '40px' }}>
                    <h2 style={{ color: '#27ae60', marginTop: 0 }}>✨ Zarządzanie Cechami (Dynamiczne)</h2>
                    <p>Tutaj możesz definiować nowe cechy (np. "Numer telefonu", "Złe psy"), które Operatorzy będą mogli przypisywać do adresów.</p>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <input
                            type="text"
                            placeholder="Nazwa nowej cechy..."
                            value={newFeatureName}
                            onChange={e => setNewFeatureName(e.target.value)}
                            style={{ padding: '10px', flex: 1 }}
                        />
                        <button onClick={handleAddFeature} className="btn-confirm-login">➕ Dodaj Cechę</button>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        {features.length === 0 ? <p style={{ color: '#999' }}>Brak zdefiniowanych cech.</p> : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {features.map(f => (
                                    <div key={f.id} style={{ background: 'white', padding: '10px 15px', borderRadius: '20px', border: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <strong>{f.nazwa}</strong>
                                        <button onClick={() => handleDeleteFeature(f.id)} style={{ border: 'none', background: 'transparent', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="audit-section" style={{ backgroundColor: '#f4f6f7', padding: '20px', borderRadius: '8px', border: '1px solid #bdc3c7', marginBottom: '40px' }}>
                    <h2 style={{ color: '#2c3e50', marginTop: 0 }}>🌍 Aktualizacja Danych (TERYT)</h2>
                    <p>Pobierz najnowsze dane z GUS. Lokalne zmiany (współrzędne) zostaną zachowane.</p>
                    <button onClick={handleUpdateTeryt} className="btn-teryt-update" disabled={updatingTeryt} style={{ marginTop: '15px' }}>
                        {updatingTeryt ? 'Pobieranie danych...' : '🔄 Uruchom Aktualizację (Port 3001)'}
                    </button>
                </div>

                <div className="audit-section">
                    <h2 style={{ color: '#c0392b' }}>🗑️ Kosz (Usunięte)</h2>
                    {deletedItems.length === 0 ? <p>Pusto.</p> : (
                        <table className="audit-table">
                            <thead><tr><th>Adres</th><th>Akcja</th></tr></thead>
                            <tbody>
                                {deletedItems.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.lokalizacje?.ulica} {item.numer_domu}</td>
                                        <td><button onClick={() => handleRestore(item)} className="btn-restore">Przywróć</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="audit-section">
                    <h2 style={{ color: '#2c3e50' }}>📜 Logi</h2>
                    <table className="logs-table">
                        <thead><tr><th>Data</th><th>Rola</th><th>Akcja</th><th>Szczegóły</th><th>Opcje</th></tr></thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td>{new Date(log.data_akcji).toLocaleString()}</td>
                                    <td><span className={`tag-${log.rola}`}>{log.rola}</span></td>
                                    <td>{log.akcja}</td>
                                    <td>{log.opis_szczegolowy}</td>
                                    <td>{log.akcja === 'zmiana_kodu' && <button onClick={() => handleUndoChange(log)} className="btn-undo-change">Cofnij</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default Audit;