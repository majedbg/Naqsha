export default function IconButton({ children, onClick, disabled, title, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded text-ink-soft hover:text-ink hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
