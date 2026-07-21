import { useState } from 'react';
import { PageHeader } from '../../components/dashboard';
import SecurityPage from '../dashboard/SecurityPage';

export default function CustomerSettingsPage() {
    const [tab, setTab] = useState('security');

    return (
        <div className="space-y-6">
            <PageHeader description="Manage your account preferences and security." eyebrow="Account" title="Settings" />
            <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                    ['security', 'Security'],
                ].map(([key, label]) => (
                    <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold ${tab === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>
                ))}
            </div>
            {tab === 'security' && <SecurityPage embedded />}
        </div>
    );
}
