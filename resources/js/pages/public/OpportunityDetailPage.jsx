import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { unwrap } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, PageLoader } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import OpportunityEnquiryModal from '../../components/public/OpportunityEnquiryModal';
import Seo from '../../components/Seo';
import { shortDate } from '../../lib/utils';

const typeLabels = {
    job: 'Job',
    partnership: 'Partnership',
    vendor_call: 'Vendor call',
    training: 'Training',
    media: 'Media feature',
    speaking: 'Speaking',
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

function plainText(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ');
}

function sanitizeHtml(value) {
    const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'I', 'LI', 'OL', 'P', 'STRONG', 'U', 'UL']);
    const template = document.createElement('template');
    template.innerHTML = String(value ?? '');
    template.content.querySelectorAll('*').forEach((node) => {
        if (!allowedTags.has(node.tagName)) {
            node.replaceWith(document.createTextNode(node.textContent ?? ''));
            return;
        }
        [...node.attributes].forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            if (node.tagName === 'A' && name === 'href') {
                const href = attribute.value;
                if (/^(https?:|mailto:|tel:)/i.test(href)) {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noreferrer');
                } else {
                    node.removeAttribute('href');
                }
            } else {
                node.removeAttribute(attribute.name);
            }
        });
    });
    return template.innerHTML;
}

function TextContent({ value }) {
    if (!value) return null;
    if (/<[a-z][\s\S]*>/i.test(value)) {
        return <div className="content-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />;
    }

    const lines = stripHtml(value).replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let list = null;

    const flushList = () => {
        if (list) {
            blocks.push(list);
            list = null;
        }
    };

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            return;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            flushList();
            blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
            return;
        }

        const quote = line.match(/^>\s+(.+)$/);
        if (quote) {
            flushList();
            blocks.push({ type: 'quote', text: quote[1] });
            return;
        }

        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) {
            if (!list || list.type !== 'ul') list = { type: 'ul', items: [] };
            list.items.push(bullet[1]);
            return;
        }

        const numbered = line.match(/^\d+\.\s+(.+)$/);
        if (numbered) {
            if (!list || list.type !== 'ol') list = { type: 'ol', items: [] };
            list.items.push(numbered[1]);
            return;
        }

        flushList();
        blocks.push({ type: 'p', text: line });
    });
    flushList();

    return (
        <div className="content-prose">
            {blocks.map((block, index) => {
                if (block.type === 'h1') return <h1 key={index}>{block.text}</h1>;
                if (block.type === 'h2') return <h2 key={index}>{block.text}</h2>;
                if (block.type === 'h3') return <h3 key={index}>{block.text}</h3>;
                if (block.type === 'h4') return <h4 key={index}>{block.text}</h4>;
                if (block.type === 'h5') return <h5 key={index}>{block.text}</h5>;
                if (block.type === 'h6') return <h6 key={index}>{block.text}</h6>;
                if (block.type === 'quote') return <blockquote key={index}>{block.text}</blockquote>;
                if (block.type === 'ul') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
                if (block.type === 'ol') return <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>;
                return <p key={index}>{block.text}</p>;
            })}
        </div>
    );
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

    const info = contactInfo(opportunity.contact_info);
    const contact = contactText(opportunity.contact_info);
    const intro = opportunity.short_description || info.short_description || plainText(opportunity.description);

    return (
        <>
            <Seo title={opportunity.title} description={intro} />
            <section className="bg-[#f4efe9] py-14 sm:py-20">
                <div className="page-container">
                    <Link to="/opportunities" className="inline-flex items-center gap-2 text-sm font-black text-[#7d2e3c]">
                        <Icon name="chevronLeft" size={15} /> Back to opportunities
                    </Link>
                    <div className="mt-8 max-w-4xl">
                        <span className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#8b4b59]">{labelFor(opportunity.type)}</span>
                        <h1 className="mt-5 font-display text-5xl font-normal leading-[.95] text-[#34231c] sm:text-7xl">{opportunity.title}</h1>
                        <p className="mt-6 max-w-2xl text-base leading-8 text-[#6f625b]">{intro}</p>
                    </div>
                </div>
            </section>

            <section className="bg-white py-12 sm:py-16">
                <div className="page-container grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <article className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                        <p className="px-2 text-xs font-black uppercase tracking-[.18em] text-[#8b4b59]">Full opportunity details</p>
                        <div className="mt-5 rounded-[1.5rem] border border-stone-200 bg-[#fffdf8] p-5 sm:p-7">
                            <TextContent value={opportunity.description} />
                            {contact && <p className="mt-7 rounded-2xl bg-white p-4 text-sm font-bold text-[#5f524b]">Contact: {contact}</p>}
                        </div>
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
