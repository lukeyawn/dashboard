import { useEffect, useState } from 'react';
import App from './App.jsx';
import Connect from './connect/Connect.jsx';
import Login from './login/Login.jsx';
import Manage from './manage/Manage.jsx';
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
                    // a sign-in waiting for approval stays where it was
                    if (window.location.pathname === '/login') window.history.replaceState(null, '', '/');
                    setNeedsLogin(false);
                }}
            />
        );
    }
    const connect = /^\/connect\/([\w-]+)$/.exec(window.location.pathname);
    if (connect) return <Connect id={connect[1]} />;
    return window.location.pathname === '/manage' ? <Manage /> : <App />;
}
