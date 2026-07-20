import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, StatusBadge, inputClass, useApiResource, useDebouncedValue } from '../../components/dashboard';
import VerifiedBadge from '../../components/ui/VerifiedBadge';

const normalize = (value) => Array.isArray(value) ? value : value?.users ?? value?.data ?? [];

export default function AdminUsersPage() {
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('all');
    const [state, setState] = useState('all');
    const [verification, setVerification] = useState('all');
    const search = useDebouncedValue(query);
    const resource = useApiResource('/admin/users', [], {
        params: {
            search: search || undefined,
            role: role === 'all' ? undefined : role,
            is_active: state === 'all' ? undefined : state === 'active' ? 1 : 0,
        },
    });

    const users = useMemo(() => normalize(resource.data).filter((user) => {
        const profile = user.provider_profile ?? user.providerProfile;
        if (verification === 'verified' && !profile?.verified) return false;
        if (verification === 'unverified' && profile?.verified) return false;
        return true;
    }), [resource.data, verification]);

    return (
        <div className="space-y-6">
            <PageHeader
                description="Open a user to manage account details, provider profile, directory status, and verification in one place."
                eyebrow="People"
                title="Users"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
                    <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" value={query} />
                    <select className={inputClass} onChange={(event) => setRole(event.target.value)} value={role}>
                        <option value="all">All roles</option>
                        <option value="provider">Providers</option>
                        <option value="customer">Customers</option>
                        <option value="admin">Admins</option>
                    </select>
                    <select className={inputClass} onChange={(event) => setState(event.target.value)} value={state}>
                        <option value="all">Any status</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                    <select className={inputClass} onChange={(event) => setVerification(event.target.value)} value={verification}>
                        <option value="all">Any verification</option>
                        <option value="verified">Verified</option>
                        <option value="unverified">Unverified</option>
                    </select>
                </div>

                {resource.loading ? (
                    <div className="mt-5"><LoadingBlock rows={6} /></div>
                ) : users.length ? (
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[860px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                    <th className="pb-3 font-bold">User</th>
                                    <th className="pb-3 font-bold">Role</th>
                                    <th className="pb-3 font-bold">Verification</th>
                                    <th className="pb-3 font-bold">Email</th>
                                    <th className="pb-3 font-bold">Account</th>
                                    <th className="pb-3 text-right font-bold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const profile = user.provider_profile ?? user.providerProfile;
                                    return (
                                        <tr className="border-b border-slate-50 last:border-0" key={user.id}>
                                            <td className="py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.name} size="sm" src={profile?.profile_photo ?? user.profile_photo} />
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="font-bold text-slate-900">{user.name}</p>
                                                            <VerifiedBadge show={Boolean(profile?.verified)} size="sm" />
                                                        </div>
                                                        <p className="text-xs text-slate-400">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3"><StatusBadge status={user.role} /></td>
                                            <td className="py-3">{profile ? <StatusBadge status={profile.verified ? 'verified' : 'pending'} /> : <span className="text-xs text-slate-400">Not provider</span>}</td>
                                            <td className="py-3"><StatusBadge status={user.email_verified_at ? 'confirmed' : 'pending'} /></td>
                                            <td className="py-3"><StatusBadge status={(user.is_active ?? true) ? 'active' : 'suspended'} /></td>
                                            <td className="py-3 text-right">
                                                <Link to={`/admin/users/${user.id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                                    Open details
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState description="Try changing your search or filters." icon="users" title="No users found" />
                )}
            </Card>
        </div>
    );
}
