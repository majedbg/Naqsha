export default function IconButton({ children, onClick, disabled, title, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
