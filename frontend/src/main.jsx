import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Note: StrictMode is intentionally omitted. It double-invokes effects in
// development, which would tear down and recreate our Socket.io / WebRTC
// connections mid-handshake. This app manages those connections imperatively.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
