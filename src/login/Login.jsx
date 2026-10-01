import { useState } from 'react';
import { logIn } from '../lib/api';
import './Login.css';

const LINK_ERRORS = {
    401: 'That login link has the wrong token.',
    429: 'Too many failed logins. Try again in 15 minutes.',
};

// Asked for once per browser; the server then keeps the token in a cookie
// that page scripts can't read (DESIGN §4, Access).
export default function Login({ onLogin }) {
    const failed = new URLSearchParams(window.location.search).get('failed');
    const [token, setToken] = useState('');
    const [error, setError] = useState(failed ? (LINK_ERRORS[failed] ?? LINK_ERRORS[401]) : null);
    const [busy, setBusy] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await logIn(token.trim());
            onLogin();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <main className="login">
            <form className="login-panel" onSubmit={submit}>
                <h1>Dashboard</h1>
                <label htmlFor="token">Access token</label>
                <input
                    id="token"
                    type="password"
                    autoComplete="current-password"
                    value={token}
                    onChange={event => setToken(event.target.value)}
                    required
                    autoFocus
                />
                <button type="submit" disabled={busy || !token.trim()}>{busy ? 'Logging in…' : 'Log in'}</button>
                {error && <p className="login-error" role="alert">{error}</p>}
            </form>
        </main>
    );
}
