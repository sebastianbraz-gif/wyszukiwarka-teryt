import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Link } from 'react-router-dom';
import './App.css';

function Home() {
  const [locations, setLocations] = useState([]);
  
  // Stany dla dwóch pól wyszukiwania
  const [searchCity, setSearchCity] = useState('');   // Miejscowość
  const [searchTerm, setSearchTerm] = useState('');   // Ulica
  
  const [sortBy, setSortBy] = useState('miejscowosc');
  const [loading, setLoading] = useState(false);

  // Funkcja pobierająca dane
  const fetchLocations = async (city, street, sortMethod) => {
    setLoading(true);
    try {
      let query = supabase
        .from('lokalizacje')
        .select('id, wojewodztwo, miejscowosc, ulica');

      // Filtr Miejscowości
      if (city.length > 0) {
        query = query.ilike('miejscowosc', `%${city}%`);
      }

      // Filtr Ulicy
      if (street.length > 0) {
        query = query.ilike('ulica', `%${street}%`);
      }

      // Sortowanie
      if (sortMethod === 'wojewodztwo') {
        query = query.order('wojewodztwo', { ascending: true })
                     .order('miejscowosc', { ascending: true });
      } else if (sortMethod === 'miejscowosc') {
        query = query.order('miejscowosc', { ascending: true })
                     .order('ulica', { ascending: true });
      } else {
        query = query.order('ulica', { ascending: true });
      }

      query = query.limit(50);

      const { data, error } = await query;
      
      if (error) {
        console.error("Błąd pobierania:", error);
      } else {
        setLocations(data || []);
      }
    } catch (err) {
      console.error("Błąd krytyczny:", err);
    } finally {
      setLoading(false);
    }
  };

  // Live Search (reaguje na zmiany w polach)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLocations(searchCity, searchTerm, sortBy);
    }, 500); // 0.5 sekundy opóźnienia

    return () => clearTimeout(delayDebounceFn);
  }, [searchCity, searchTerm, sortBy]);

  return (
    <div className="App">
      <header className="app-header">
        <h1>Wyszukiwarka Ulic TERYT</h1>
      </header>

      {/* Pasek Wyszukiwania */}
      <div className="search-bar-container">
        
        {/* Pole 1: Miasto */}
        <input 
          type="text" 
          placeholder="Miejscowość..." 
          value={searchCity}
          onChange={(e) => setSearchCity(e.target.value)}
          className="live-search-input city-input"
        />

        {/* Pole 2: Ulica */}
        <input 
          type="text" 
          placeholder="Nazwa ulicy..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="live-search-input street-input"
        />

        {/* Pole 3: Sortowanie */}
        <select 
          className="sort-select" 
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="miejscowosc">Sort: Miasto</option>
          <option value="wojewodztwo">Sort: Województwo</option>
          <option value="ulica">Sort: Ulica</option>
        </select>

      </div>

      <div className="table-container">
        {loading ? (
          <p style={{ padding: '40px', color: '#999', fontStyle: 'italic' }}>Szukam...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lokalizacja</th>
                <th style={{ width: '140px' }}>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {locations.length > 0 ? (
                locations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="addr-subinfo">woj. {item.wojewodztwo}</span>
                      <span className="addr-city">Miejscowość {item.miejscowosc}</span>
                      <span className="addr-subinfo">{item.ulica}</span>
                    </td>
                    <td>
                      <Link to={`/select/${item.id}`}>
                        <button className="btn-search">Wybierz ➜</button>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" style={{ padding: '30px', color: '#999' }}>
                    {(searchCity || searchTerm) ? 'Brak wyników.' : 'Wpisz miasto lub ulicę.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Home;