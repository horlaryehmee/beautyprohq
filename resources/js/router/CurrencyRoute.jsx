import { Outlet } from 'react-router-dom';
import { CurrencyProvider } from '../context/CurrencyContext';

export default function CurrencyRoute() {
    return <CurrencyProvider><Outlet /></CurrencyProvider>;
}
