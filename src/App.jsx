import { useState } from 'react';
import PersonaPicker from './components/PersonaPicker';
import Chat from './components/Chat';
import ThemeToggle from './components/ThemeToggle';

export default function App() {
  const [persona, setPersona] = useState(null);

  return (
    <>
      <ThemeToggle />
      {persona
        ? <Chat persona={persona} onBack={() => setPersona(null)} />
        : <PersonaPicker onSelect={setPersona} />}
    </>
  );
}
