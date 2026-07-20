import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { unwrap } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import OpportunityEnquiryModal from '../../components/public/OpportunityEnquiryModal';
import Seo from '../../components/Seo';
import { shortDate } from '../../lib/utils';

const typeLabels = {
    job: 'Brand collaboration',
    partnership: 'Partnership request',
    vendor_call: 'Vendor call',
    training: 'Training',
    event: 'Event opportunity',
    media: 'Media feature',
    speaking: 'Speaking opportunity',
};

function labelFor(type) {
    if (!type) return 'Opportunity';
    return typeLabels[type] ?? String(type).replaceAll('_', ' ');
}

function contactText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.text ?? value.email ?? value.url ?? '';
}

function contactInfo(value) {
    return typeof value === 'object' && value ? value : {};
}

export default function OpportunityDetailPage() {
    const { id } = useParams();
    const [opportunity, setOpportunity] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [contactOpen, setContactOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get(`/opportunities/${id}`);
            setOpportunity(unwrap(response));
        } catch (requestError) {
            setError(requestError?.response?.status === 404 ? 'This opportunity could not be found.' : 'Opportunity details could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) return <PageLoader label="Loading opportunity..." />;
    if (error || !opportunity) return <div className="page-container py-20"><EmptyState icon="briefcase" title="Opportunity unavailable" message={error} action={<Link to="/opportunities"><Button variant="secondary">Back to opportunities</Button></Link>} /></div>;

    const contact = contactText(opportunity.contact_info);
    const info = contactInfo(opportunity.contact_info);

    return (
        <>
            <Seo title={opportunity.title} description={opportunity.description} />
            <section className="bg-[#f4efe9] py-14 sm:py-20">
                <div className="page-container">
                    <Link to="/opportunities" className="inline-flex items-center gap-2 text-sm font-black text-[#7d2e3c]">
                        <Icon name="chevronLeft" size={15} /> Back to opportunities
                    </Link>
                    <div className="mt-8 max-w-4xl">
                        <span className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#8b4b59]">{labelFor(opportunity.type)}</span>
                        <h1 className="mt-5 font-display text-5xl font-normal leading-[.95] text-[#34231c] sm:text-7xl">{opportunity.title}</h1>
                        <p className="mt-6 max-w-2xl text-base leading-8 text-[#6f625b]">{opportunity.description}</p>
                    </div>
                </div>
            </section>

            <section className="bg-white py-12 sm:py-16">
                <div className="page-container grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
                        <p className="text-xs font-black uppercase tracking-[.18em] text-[#8b4b59]">Full details</p>
                        <div className="mt-5 whitespace-pre-line text-sm leading-8 text-[#5f524b]">{opportunity.description}</div>
                        {info.requirements && (
                            <div className="mt-8 rounded-[1.5rem] bg-[#f4efe9] p-5">
                                <h2 className="font-display text-2xl font-normal text-[#34231c]">Requirements</h2>
                                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#5f524b]">{info.requirements}</p>
                            </div>
                        )}
                        {(info.application_notes || contact) && <InlineAlert className="mt-7">{info.application_notes || contact}</InlineAlert>}
                    </article>

                    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                        <div className="rounded-[2rem] border border-stone-200 bg-[#fbf8f4] p-6">
                            <h2 className="font-display text-2xl font-normal text-[#34231c]">Opportunity summary</h2>
                            <div className="mt-5 space-y-3 text-sm text-[#6f625b]">
                                <div className="flex justify-between gap-4"><span>Type</span><span className="font-black text-[#34231c]">{labelFor(opportunity.type)}</span></div>
                                {opportunity.location && <div className="flex justify-between gap-4"><span>Location</span><span className="font-black text-[#34231c]">{opportunity.location}</span></div>}
                                {opportunity.deadline && <div className="flex justify-between gap-4"><span>Deadline</span><span className="font-black text-[#34231c]">{shortDate(opportunity.deadline)}</span></div>}
                                {opportunity.published_at && <div className="flex justify-between gap-4"><span>Published</span><span className="font-black text-[#34231c]">{shortDate(opportunity.published_at)}</span></div>}
                            </div>
                            <Button onClick={() => setContactOpen(true)} className="mt-6 w-full rounded-full bg-[#34231c] hover:bg-[#4a2f26]">
                                Apply / Send interest <Icon name="mail" size={15} />
                            </Button>
                        </div>
                    </aside>
                </div>
            </section>

            {contactOpen && <OpportunityEnquiryModal opportunity={opportunity} onClose={() => setContactOpen(false)} />}
        </>
    );
}
