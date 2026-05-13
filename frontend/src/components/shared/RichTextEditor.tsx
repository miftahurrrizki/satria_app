/**
 * RichTextEditor — TipTap-based rich text editor
 *
 * Usage:
 *   <RichTextEditor
 *     value={doc}                         // TipTap JSON document atau null
 *     onChange={(doc) => setDoc(doc)}     // dipanggil tiap perubahan
 *     onBlur={() => saveNow()}            // optional, untuk auto-save trigger
 *     placeholder="Tulis catatan…"
 *     minHeight={150}
 *   />
 *
 * Toolbar minimal: Bold, Italic, Underline, Strike, H1-H3, Bullet, Numbered, Blockquote, Link, Undo/Redo
 * Output: TipTap JSON document (siap disimpan ke kolom JSONB).
 */
import { useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Link as LinkIcon, Undo2, Redo2, Minus,
} from 'lucide-react';

export type RichTextDoc = unknown; // TipTap JSON (object with type/content)

interface Props {
  value: RichTextDoc | null;
  onChange: (doc: RichTextDoc | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
  className?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Tulis di sini…',
  minHeight = 150,
  readOnly = false,
  className = '',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable extensions yang tidak kita pakai
        codeBlock: false,
        code: false,
        horizontalRule: { HTMLAttributes: { class: 'my-3 border-slate-200' } },
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 underline hover:text-primary-700',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      // Treat empty doc as null biar database clean
      const isEmpty = editor.isEmpty;
      onChange(isEmpty ? null : json);
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none px-3 py-2.5 ' +
          '[&_p]:my-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-2 ' +
          '[&_h2]:text-base [&_h2]:font-bold [&_h2]:my-2 ' +
          '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-1.5 ' +
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 ' +
          '[&_a]:text-primary-600 [&_a]:underline',
        style: `min-height: ${minHeight}px;`,
      },
    },
  });

  // Sync external value changes (mis. setelah load dari API)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    // Avoid infinite loop: only set kalau berbeda
    if (JSON.stringify(current) !== JSON.stringify(value ?? { type: 'doc', content: [] })) {
      editor.commands.setContent(value ?? '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className={`border border-slate-200 rounded-lg bg-white focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400 transition-all ${className}`}>
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    [
      'p-1.5 rounded-md transition-colors',
      active
        ? 'bg-primary-100 text-primary-700'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    ].join(' ');

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL tautan:', previousUrl ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))} title="Bold (Ctrl+B)">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))} title="Italic (Ctrl+I)">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive('underline'))} title="Underline (Ctrl+U)">
        <UnderlineIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btn(editor.isActive('strike'))} title="Strikethrough">
        <Strikethrough className="w-3.5 h-3.5" />
      </button>

      <span className="w-px h-5 bg-slate-200 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={btn(editor.isActive('heading', { level: 1 }))} title="Heading 1">
        <Heading1 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive('heading', { level: 2 }))} title="Heading 2">
        <Heading2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive('heading', { level: 3 }))} title="Heading 3">
        <Heading3 className="w-3.5 h-3.5" />
      </button>

      <span className="w-px h-5 bg-slate-200 mx-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))} title="Bullet List">
        <List className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))} title="Numbered List">
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btn(editor.isActive('blockquote'))} title="Quote">
        <Quote className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btn(false)} title="Horizontal Rule">
        <Minus className="w-3.5 h-3.5" />
      </button>

      <span className="w-px h-5 bg-slate-200 mx-1" />

      <button type="button" onClick={setLink}
        className={btn(editor.isActive('link'))} title="Link">
        <LinkIcon className="w-3.5 h-3.5" />
      </button>

      <span className="ml-auto flex items-center gap-0.5">
        <button type="button" onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={btn(false) + ' disabled:opacity-30 disabled:cursor-not-allowed'} title="Undo">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={btn(false) + ' disabled:opacity-30 disabled:cursor-not-allowed'} title="Redo">
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </span>
    </div>
  );
}

/**
 * Read-only renderer untuk TipTap JSON.
 * Pakai untuk preview / display tanpa toolbar.
 */
export function RichTextView({ value, className = '' }: { value: RichTextDoc | null; className?: string }) {
  return <RichTextEditor value={value} onChange={() => {}} readOnly className={className} />;
}
