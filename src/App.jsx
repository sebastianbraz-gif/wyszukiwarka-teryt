import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import SelectMode from './SelectMode';
import Details from './Details';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Krok 1: Wyszukiwarka (Miasto + Ulica) */}
        <Route path="/" element={<Home />} />
        
        {/* Krok 2: Wybór trybu (Środek ulicy czy Numer?) */}
        <Route path="/select/:id" element={<SelectMode />} />
        
        {/* Krok 3: Mapa (Parametr :point to "center" lub konkretny numer) */}
        <Route path="/details/:id/:point" element={<Details />} />
      </Routes>
    </Router>
  );
}

export default App;