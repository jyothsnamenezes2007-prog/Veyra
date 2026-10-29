import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';

export const SearchBar = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search by object, maker, or medium...',
  maxWidth = '460px',
  autoFocus = false,
  showSuggestions = true
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <form
      ref={containerRef}
      onSubmit={(e) => {
        e.preventDefault();
        setIsFocused(false);
        if (onSubmit) onSubmit(value);
      }}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth
      }}
    >
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsFocused(true);
        }}
        onFocus={() => setIsFocused(true)}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          height: '42px',
          paddingLeft: '38px',
          paddingRight: value ? '36px' : '12px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: '#FFFFFF',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color var(--transition-fast)'
        }}
      />
      <Search
        size={16}
        color="var(--text-secondary)"
        style={{ position: 'absolute', left: '12px', top: '13px' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            setIsFocused(false);
          }}
          aria-label="Clear search input"
          style={{
            position: 'absolute',
            right: '10px',
            top: '11px',
            color: 'var(--text-secondary)',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <X size={16} />
        </button>
      )}

      {showSuggestions && (
        <SearchSuggestionsDropdown
          query={value}
          isOpen={isFocused && Boolean(value && value.trim())}
          onClose={() => setIsFocused(false)}
          onSelectSuggestion={(selected) => {
            onChange(selected);
            setIsFocused(false);
          }}
        />
      )}
    </form>
  );
};
