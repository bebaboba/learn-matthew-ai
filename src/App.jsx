import { useState } from 'react';
import PersonaPicker from './components/PersonaPicker';
import Chat from './components/Chat';

export default function App() {
  const [persona, setPersona] = useState(null);

  return persona
    ? <Chat persona={persona} onBack={() => setPersona(null)} />
    : <PersonaPicker onSelect={setPersona} />;
}
