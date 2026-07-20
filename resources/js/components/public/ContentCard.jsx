import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { mediaUrl, shortDate } from '../../lib/utils';

export default function ContentCard({ item, kind = 'news' }) {
    const date = item.date ?? item.published_at ?? item.created_at;
    const image = mediaUrl(item.image_url ?? item.image);
    const content = item.excerpt ?? item.description ?? item.content;

    return (
        <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(70,28,54,.1)]">
            {image ? <div className="aspect-[16/10] overflow-hidden bg-rose-50"><img src={image} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" /></div> : <div className="grid aspect-[16/8] place-items-center bg-gradient-to-br from-plum-900 to-rose-700 text-white"><Icon name={kind === 'event' ? 'calendar' : 'content'} size={34} /></div>}
            <div className="flex flex-1 flex-col p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={kind === 'event' ? 'plum' : 'rose'}>{kind === 'event' ? 'Event' : 'News'}</Badge>
                    {date && <span className="text-[11px] font-bold text-stone-400">{shortDate(date)}</span>}
                </div>
                <h3 className="mt-3 font-display text-lg font-black leading-snug text-plum-950">{item.title}</h3>
                {content && <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{content}</p>}
                {item.location && <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-bold text-stone-500"><Icon name="map" size={14} />{item.location}</p>}
            </div>
        </article>
    );
}
