import { useState } from 'react';

function isLightMode() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

export default function ThemeToggle() {
  const [light, setLight] = useState(isLightMode);

  function toggle() {
    const next = !light;
    if (next) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    }
    setLight(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {light ? '☾' : '☀'}
    </button>
  );
}
