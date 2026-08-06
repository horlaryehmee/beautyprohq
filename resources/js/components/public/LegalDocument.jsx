import Seo from '../Seo';

export default function LegalDocument({ eyebrow, title, description, updated, sections }) {
    return (
        <>
            <Seo title={title} description={description} />
            <section className="border-b border-stone-200 bg-[#F7F3ED]">
                <div className="page-container py-14 sm:py-20 lg:py-24">
                    <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#3A2A1F]">{eyebrow}</p>
                    <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight text-[#2A1D14] sm:text-6xl">{title}</h1>
                    <p className="mt-5 max-w-3xl text-base leading-8 text-[#3A2A1F]">{description}</p>
                    <p className="mt-6 text-xs font-bold uppercase tracking-wide text-[#3A2A1F]">Last updated: {updated}</p>
                </div>
            </section>

            <section className="bg-white py-12 sm:py-16">
                <div className="page-container grid gap-10 lg:grid-cols-[240px_minmax(0,760px)] lg:justify-center lg:gap-16">
                    <nav className="h-fit rounded-2xl border border-stone-200 bg-[#F7F3ED] p-5 lg:sticky lg:top-24" aria-label={`${title} sections`}>
                        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#3A2A1F]">On this page</p>
                        <ol className="mt-4 grid gap-2 text-sm font-bold text-[#3A2A1F]">
                            {sections.map((section, index) => (
                                <li key={section.title}>
                                    <a href={`#section-${index + 1}`} className="block rounded-lg px-2 py-1.5 transition hover:bg-white hover:text-[#2A1D14]">
                                        {index + 1}. {section.title}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </nav>

                    <article className="min-w-0">
                        {sections.map((section, index) => (
                            <section id={`section-${index + 1}`} key={section.title} className="scroll-mt-28 border-b border-stone-200 py-8 first:pt-0 last:border-0">
                                <h2 className="font-display text-2xl font-semibold text-[#2A1D14] sm:text-3xl">{index + 1}. {section.title}</h2>
                                <div className="mt-4 space-y-4 text-sm leading-7 text-[#3A2A1F] sm:text-base sm:leading-8">
                                    {section.content.map((paragraph, paragraphIndex) => (
                                        Array.isArray(paragraph) ? (
                                            <ul key={paragraphIndex} className="list-disc space-y-2 pl-6 marker:text-[#3A2A1F]">
                                                {paragraph.map((item) => <li key={item}>{item}</li>)}
                                            </ul>
                                        ) : <p key={paragraphIndex}>{paragraph}</p>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </article>
                </div>
            </section>
        </>
    );
}
