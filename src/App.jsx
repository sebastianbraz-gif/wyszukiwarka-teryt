import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import SelectMode from './SelectMode';
import Details from './Details';
import Reports from './Reports';
import Audit from './Audit'; // NOWE: Import panelu Audytora
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Strona główna */}
        <Route path="/" element={<Home />} />
        
        {/* Wybór numeru */}
        <Route path="/select/:id" element={<SelectMode />} />
        
        {/* Szczegóły i Zgłaszanie */}
        <Route path="/details/:id/:point" element={<Details />} />
        
        {/* Panel Operatora (dostępny też dla Audytora) */}
        <Route path="/reports" element={<Reports />} />
        
        {/* Panel Audytora (tylko dla Audytora) */}
        <Route path="/audit" element={<Audit />} />
      </Routes>
    </Router>
  );
}

export default App;