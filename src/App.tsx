import React, { JSX } from 'react';
import './App.css';
import Lotto from './Lotto';

function App(): JSX.Element {
  return (
    <div className="App">
      <header className="App-header">
        <Lotto />
      </header>
    </div>
  );
}

export default App;
