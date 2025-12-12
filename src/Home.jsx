import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

// --- FUNKCJE POMOCNICZE DO CIASTECZEK (SESJA PRZEGLĄDARKI) ---
const setSessionCookie = (name, value) => {
  // Brak 'expires' oznacza, że ciastko żyje do zamknięcia przeglądarki
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`;
};
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};
const deleteCookie = (name) => {
  document.cookie = `${name}=; path=/; max-age=0`;
};
// -------------------------------------------------------------

function Home() {
  const [locations, setLocations] = useState([]);
  const [searchCity, setSearchCity] = useState('');    
  const [searchTerm, setSearchTerm] = useState('');    
  const [sortBy, setSortBy] = useState('miejscowosc');
  const [loading, setLoading] = useState(false);

  // Logowanie - COOKIES
  const [userRole, setUserRole] = useState(getCookie('user_role') || 'guest');
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const initiateLogin = (role) => {
    setTargetRole(role); setLoginForm({ login: '', password: '' }); setLoginError(''); setShowLogin(true);
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const { login, password } = loginForm;
    if (targetRole === 'audytor') {
        if (login === 'Audytor' && password === 'Inżynierka2025') finalizeLogin('audytor');
        else setLoginError('Błędny login lub hasło Audytora!');
    } else if (targetRole === 'operator') {
        if (login === 'operator' && password === 'operator') finalizeLogin('operator');
        else setLoginError('Błędne dane (spróbuj: operator / operator)');
    }
  };

  const finalizeLogin = (role) => {
    // ZAPIS DO CIASTECZKA SESYJNEGO
    setSessionCookie('user_role', role);
    setUserRole(role); 
    setShowLogin(false);
    alert(`Pomyślnie zalogowano jako: ${role.toUpperCase()}`);
  };

  const handleLogout = () => {
    if (window.confirm("Wylogować?")) { 
        // USUNIĘCIE CIASTECZKA
        deleteCookie('user_role');
        setUserRole('guest'); 
    }
  };

  const fetchLocations = async (city, street, sortMethod) => {
    setLoading(true);
    try {
      let query = supabase.from('lokalizacje').select('id, wojewodztwo, miejscowosc, ulica').eq('czy_usuniety', false);
      if (city.length > 0) query = query.ilike('miejscowosc', `%${city}%`);
      if (street.length > 0) query = query.ilike('ulica', `%${street}%`);
      
      if (sortMethod === 'wojewodztwo') query = query.order('wojewodztwo', { ascending: true }).order('miejscowosc', { ascending: true });
      else if (sortMethod === 'miejscowosc') query = query.order('miejscowosc', { ascending: true }).order('ulica', { ascending: true });
      else query = query.order('ulica', { ascending: true });

      query = query.limit(50);
      const { data, error } = await query;
      if (!error) setLocations(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleDownloadReport = () => {
    const savedData = JSON.parse(localStorage.getItem('my_report') || '[]');
    if (savedData.length === 0) { alert("Pusty raport!"); return; }
    const headers = "Województwo;Miejscowość;Ulica;Numer;Kod;Wysokość;Współrzędne;Link;Data\n";
    const rows = savedData.map(item => `${item.wojewodztwo};${item.miejscowosc};${item.ulica};${item.numer};${item.kod};${item.wysokosc};${item.wspolrzedne};${item.link_mapy};${item.data_dodania}`).join("\n");
    const blob = new Blob(["\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `RAPORT.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleClearReport = () => {
    if (window.confirm("Wyczyścić raport?")) { localStorage.removeItem('my_report'); alert("Wyczyszczono."); }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchLocations(searchCity, searchTerm, sortBy), 500);
    return () => clearTimeout(timer);
  }, [searchCity, searchTerm, sortBy]);

  return (
    <div className="App">
      {showLogin && (
          <div className="login-modal-overlay">
              <div className="login-modal">
                  <h2>Logowanie: {targetRole.toUpperCase()}</h2>
                  <form onSubmit={handleLoginSubmit}>
                      <input type="text" placeholder="Login" value={loginForm.login} onChange={(e) => setLoginForm({...loginForm, login: e.target.value})} autoFocus />
                      <input type="password" placeholder="Hasło" value={loginForm.password} onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} />
                      {loginError && <div className="login-error">{loginError}</div>}
                      <div className="login-buttons"><button type="submit" className="btn-confirm-login">Zaloguj</button><button type="button" onClick={() => setShowLogin(false)} className="btn-cancel-login">Anuluj</button></div>
                  </form>
              </div>
          </div>
      )}
      <header className="app-header">
        <div className="top-nav-bar">
            <div className="nav-left">
                {userRole === 'guest' ? (
                    <>
                        <button onClick={() => initiateLogin('audytor')} className="btn-role btn-auditor">🔐 Zaloguj: Audytor</button>
                        <button onClick={() => initiateLogin('operator')} className="btn-role btn-operator">🛠️ Zaloguj: Operator</button>
                    </>
                ) : (
                    <div className="user-info">Zalogowano: <strong>{userRole.toUpperCase()}</strong><button onClick={handleLogout} className="btn-logout">Wyloguj</button></div>
                )}
            </div>
            <div className="nav-right">
                {userRole === 'operator' && <button onClick={() => navigate('/reports')} className="btn-reports-nav">⚠️ Zgłoszenia</button>}
                {userRole === 'audytor' && <div style={{display: 'flex', gap: '10px'}}><button onClick={() => navigate('/audit')} className="btn-audit-nav">🔐 Panel Audytora</button><button onClick={() => navigate('/reports')} className="btn-reports-nav" style={{backgroundColor: '#f39c12'}}>⚠️ Zgłoszenia</button></div>}
            </div>
        </div>
        <h1>Wyszukiwarka Ulic TERYT</h1>
        <div className="report-panel"><button onClick={handleDownloadReport} className="btn-main-download">📂 Pobierz Raport</button><button onClick={handleClearReport} className="btn-clear">🗑️ Wyczyść</button></div>
      </header>
      
      {/* USUNIĘTO SEKCJĘ AKTUALIZACJI TERYT Z TEGO MIEJSCA */}

      <div className="search-bar-container">
        <input type="text" placeholder="Miejscowość..." value={searchCity} onChange={(e) => setSearchCity(e.target.value)} className="live-search-input city-input" />
        <input type="text" placeholder="Nazwa ulicy..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="live-search-input street-input" />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="miejscowosc">Sort: Miasto</option>
          <option value="wojewodztwo">Sort: Województwo</option>
          <option value="ulica">Sort: Ulica</option>
        </select>
      </div>
      <div className="table-container">
        {loading ? <p>Szukam...</p> : (
          <table>
            <thead><tr><th>Lokalizacja</th><th style={{width:'140px'}}>Akcja</th></tr></thead>
            <tbody>
              {locations.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="addr-subinfo">woj. {item.wojewodztwo}</span>
                    <span className="addr-city">{item.ulica}</span>
                    <span className="addr-subinfo">{item.miejscowosc}</span>
                  </td>
                  <td><Link to={`/select/${item.id}`}><button className="btn-search">Wybierz ➜</button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
export default Home;