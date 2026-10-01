import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import Root from './Root.jsx';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
