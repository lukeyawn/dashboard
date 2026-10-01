import { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './login/Login.jsx';
import { onUnauthorized } from './lib/api';

// Picks the page from the address, with no router library (DESIGN §2). Any
// request the server refuses with 401 switches to the login screen.
export default function Root() {
    const [needsLogin, setNeedsLogin] = useState(() => window.location.pathname === '/login');

    useEffect(() => onUnauthorized(() => setNeedsLogin(true)), []);

    if (needsLogin) {
        return (
            <Login
                onLogin={() => {
                    window.history.replaceState(null, '', '/');
                    setNeedsLogin(false);
                }}
            />
        );
    }
    return <App />;
}
