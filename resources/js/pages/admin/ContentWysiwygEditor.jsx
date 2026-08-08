import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Table as TableExtension, TableCell as TableCellExtension, TableHeader as TableHeaderExtension, TableRow as TableRowExtension } from '@tiptap/extension-table';
import TextAlignExtension from '@tiptap/extension-text-align';
import UnderlineExtension from '@tiptap/extension-underline';
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Minus, Pilcrow, Quote, Table, Underline } from 'lucide-react';
import sanitizeHtml from '../../lib/sanitizeHtml';

function normalizeUrl(value) {
    const url = String(value ?? '').trim();
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith('#') || /^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return `https://${url}`;
}

function stripHtml(value) {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(value || '');
    return container.textContent || '';
}

function htmlFromPlainText(value) {
    return String(value ?? '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\n/g, '<br>')}</p>`)
        .join('');
}

export default function ContentWysiwygEditor({ label, value, onChange }) {
    const lastExternalValue = useRef(String(value ?? ''));
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ link: false }),
            LinkExtension.configure({
                autolink: true,
                defaultProtocol: 'https',
                openOnClick: false,
                protocols: ['http', 'https', 'mailto', 'tel'],
            }),
            ImageExtension.configure({ allowBase64: false, inline: false }),
            TableExtension.configure({ resizable: true }),
            TableRowExtension,
            TableHeaderExtension,
            TableCellExtension,
            TextAlignExtension.configure({ types: ['heading', 'paragraph'] }),
            UnderlineExtension,
        ],
        content: sanitizeHtml(value || ''),
        editorProps: {
            attributes: {
                class: 'content-prose min-h-[520px] w-full max-w-none bg-white p-5 text-base leading-8 text-bphq-espresso outline-none',
            },
        },
        immediatelyRender: true,
        onContentError: ({ editor: activeEditor }) => {
            activeEditor.commands.setContent(htmlFromPlainText(stripHtml(value || '')), { emitUpdate: false });
        },
        onUpdate: ({ editor: activeEditor }) => {
            const html = activeEditor.getHTML();
            lastExternalValue.current = html;
            onChange(html);
        },
    });

    const addLink = () => {
        const url = normalizeUrl(window.prompt('Enter link URL'));
        if (!url) return;
        editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const addImage = () => {
        const src = normalizeUrl(window.prompt('Enter image URL'));
        if (!src) return;
        const alt = String(window.prompt('Describe the image for SEO/accessibility') ?? '').trim() || 'Content image';
        editor?.chain().focus().setImage({ src, alt }).run();
    };

    const addTable = () => {
        editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
    };

    useEffect(() => {
        if (!editor) return;
        const nextValue = String(value ?? '');
        if (nextValue === lastExternalValue.current) return;
        if (nextValue !== editor.getHTML()) {
            editor.commands.setContent(sanitizeHtml(nextValue), { emitUpdate: false });
            lastExternalValue.current = nextValue;
        }
    }, [editor, value]);

    const active = (name, attributes = {}) => typeof name === 'object' ? editor?.isActive(name) : editor?.isActive(name, attributes);
    const canEditTable = editor?.isActive('table');
    const iconClass = 'size-4';
    const buttonClass = (isActive = false) => `grid size-9 place-items-center rounded-lg border text-bphq-espresso transition ${isActive ? 'border-bphq-coffee bg-bphq-beige' : 'border-bphq-chrome bg-white hover:bg-bphq-beige'}`;
    const tools = [
        { label: 'Bold', icon: <Bold className={iconClass} />, active: active('bold'), action: () => editor?.chain().focus().toggleBold().run() },
        { label: 'Italic', icon: <Italic className={iconClass} />, active: active('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
        { label: 'Underline', icon: <Underline className={iconClass} />, active: active('underline'), action: () => editor?.chain().focus().toggleUnderline().run() },
        { label: 'Bulleted list', icon: <List className={iconClass} />, active: active('bulletList'), action: () => editor?.chain().focus().toggleBulletList().run() },
        { label: 'Numbered list', icon: <ListOrdered className={iconClass} />, active: active('orderedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
        { label: 'Quote', icon: <Quote className={iconClass} />, active: active('blockquote'), action: () => editor?.chain().focus().toggleBlockquote().run() },
        { label: 'Align left', icon: <AlignLeft className={iconClass} />, active: active({ textAlign: 'left' }), action: () => editor?.chain().focus().setTextAlign('left').run() },
        { label: 'Align center', icon: <AlignCenter className={iconClass} />, active: active({ textAlign: 'center' }), action: () => editor?.chain().focus().setTextAlign('center').run() },
        { label: 'Align right', icon: <AlignRight className={iconClass} />, active: active({ textAlign: 'right' }), action: () => editor?.chain().focus().setTextAlign('right').run() },
        { label: 'Link', icon: <LinkIcon className={iconClass} />, active: active('link'), action: addLink },
        { label: 'Image', icon: <ImageIcon className={iconClass} />, action: addImage },
        { label: 'Table', icon: <Table className={iconClass} />, active: active('table'), action: addTable },
        { label: 'Divider', icon: <Minus className={iconClass} />, action: () => editor?.chain().focus().setHorizontalRule().run() },
    ];

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <span className="text-xs text-slate-400">Format visually. Content is cleaned safely before publishing.</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-bphq-chrome bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-bphq-chrome bg-bphq-ivory p-2">
                    <button aria-label="Paragraph" className={buttonClass(active('paragraph'))} onClick={() => editor?.chain().focus().setParagraph().run()} title="Paragraph" type="button"><Pilcrow className={iconClass} /></button>
                    <button aria-label="Heading 2" className={buttonClass(active('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" type="button"><Heading2 className={iconClass} /></button>
                    <button aria-label="Heading 3" className={buttonClass(active('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3" type="button"><Heading3 className={iconClass} /></button>
                    {tools.map((tool) => (
                        <button aria-label={tool.label} className={buttonClass(tool.active)} key={tool.label} onClick={tool.action} title={tool.label} type="button">
                            {tool.icon}
                        </button>
                    ))}
                    {canEditTable && (
                        <button aria-label="Delete table" className={buttonClass()} onClick={() => editor?.chain().focus().deleteTable().run()} title="Delete table" type="button">
                            <span className="text-[10px] font-bold">DEL</span>
                        </button>
                    )}
                </div>
                <EditorContent editor={editor} />
                <textarea className="sr-only" readOnly required tabIndex={-1} value={value ?? ''} />
            </div>
        </div>
    );
}
