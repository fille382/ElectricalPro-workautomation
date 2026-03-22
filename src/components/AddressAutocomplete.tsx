import { useState, useEffect, useRef } from 'react';

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
  osm_id: number;
}

interface PhotonFeature {
  properties: PhotonProperties;
  geometry?: {
    coordinates: [number, number]; // [lon, lat]
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

function formatResult(p: PhotonProperties, userQuery?: string): string {
  // Extract user's house number (e.g. "9", "9b", "12A") from their query
  const userStreet = userQuery?.split(',')[0]?.trim() || '';
  const userHouseMatch = userStreet.match(/(\d+\s*[a-zA-Z]?)\s*$/);
  const userHouseNum = userHouseMatch?.[1];

  const houseNumber = userHouseNum || p.housenumber || '';
  const streetName = p.street || p.name || '';
  const street = streetName && houseNumber ? `${streetName} ${houseNumber}` : streetName;
  const city = p.city || p.town || p.village || p.municipality || '';
  const postcode = p.postcode || '';

  const parts = [street, postcode && city ? `${postcode} ${city}` : city || postcode].filter(Boolean);
  return parts.join(', ');
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onCoordinates?: (lat: number, lon: number) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({ value, onChange, onCoordinates, placeholder, className }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = (query: string) => {
    queryRef.current = query;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        // Strip house number suffix (e.g. "2b") for search — Photon handles street names better without it
        // We'll inject the house number back into the formatted result on select
        // Extract house number suffix if present (e.g. "2b" from "ernst ahlgensgatan 2b")
        const houseMatch = query.match(/\s+(\d+\s*[a-zA-Z]?)\s*$/);
        const searchQuery = houseMatch ? query.replace(/\s+\d+\s*[a-zA-Z]?\s*$/, '').trim() : query;

        const params = new URLSearchParams({
          q: searchQuery,
          limit: '5',
          lat: '62.0',
          lon: '15.0',
        });

        const res = await fetch(`https://photon.komoot.io/api/?${params}`);
        if (!res.ok) return;
        const data: PhotonResponse = await res.json();

        // Filter to Swedish results
        const isSwedish = (f: PhotonFeature) =>
          f.properties.country === 'Sweden' || f.properties.country === 'Sverige' || f.properties.state?.includes('County');
        const swedish = data.features.filter(isSwedish);
        const results = swedish.length > 0 ? swedish : data.features;

        setSuggestions(results.slice(0, 5));
        setShowDropdown(results.length > 0);
        setActiveIndex(-1);
      } catch {
        // Silently fail — user can still type manually
      }
    }, 300);
  };

  const handleSelect = (feature: PhotonFeature) => {
    onChange(formatResult(feature.properties, queryRef.current));
    if (onCoordinates && feature.geometry?.coordinates) {
      const [lon, lat] = feature.geometry.coordinates;
      onCoordinates(lat, lon);
    }
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((feature, i) => (
            <li
              key={`${feature.properties.osm_id}-${i}`}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onMouseDown={() => handleSelect(feature)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {formatResult(feature.properties, queryRef.current)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
