import { useState, useMemo } from "react";
import { LEGO_SETS, LEGO_SET_CATEGORIES, type LegoSet } from "@/data/legoSets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, Package, ChevronDown, ChevronUp } from "lucide-react";

interface LegoSetSelectorProps {
  selectedSets: string[];
  onSelectionChange: (setIds: string[]) => void;
  allowExtras: boolean;
  onAllowExtrasChange: (allow: boolean) => void;
}

const LegoSetSelector = ({ selectedSets, onSelectionChange, allowExtras, onAllowExtrasChange }: LegoSetSelectorProps) => {
  const [search, setSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const filteredSets = useMemo(() => {
    if (!search.trim()) return LEGO_SETS;
    const q = search.toLowerCase();
    return LEGO_SETS.filter(
      s => s.name.toLowerCase().includes(q) || s.setNumber.includes(q) || s.category.includes(q)
    );
  }, [search]);

  const groupedSets = useMemo(() => {
    const groups: Record<string, LegoSet[]> = {};
    for (const set of filteredSets) {
      if (!groups[set.category]) groups[set.category] = [];
      groups[set.category].push(set);
    }
    return groups;
  }, [filteredSets]);

  const toggleSet = (setId: string) => {
    onSelectionChange(
      selectedSets.includes(setId)
        ? selectedSets.filter(id => id !== setId)
        : [...selectedSets, setId]
    );
  };

  const selectedSetObjects = LEGO_SETS.filter(s => selectedSets.includes(s.id));

  return (
    <div className="space-y-3">
      <label className="block font-heading font-semibold text-foreground">
        LEGO Sets to Build From <span className="text-muted-foreground font-normal text-sm">(optional, multi-select)</span>
      </label>

      {/* Selected sets pills */}
      {selectedSetObjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSetObjects.map(s => (
            <Badge key={s.id} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              <span className="text-xs">{s.setNumber} — {s.name}</span>
              <button
                type="button"
                onClick={() => toggleSet(s.id)}
                className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={() => onSelectionChange([])}
            className="text-xs text-muted-foreground hover:text-destructive underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sets by name or number..."
          className="pl-9"
        />
      </div>

      {/* Category accordion */}
      <div className="max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
        {LEGO_SET_CATEGORIES.map(cat => {
          const sets = groupedSets[cat.id];
          if (!sets?.length) return null;
          const isExpanded = expandedCategory === cat.id;

          return (
            <div key={cat.id}>
              <button
                type="button"
                onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-heading font-semibold text-foreground hover:bg-muted/50 transition-colors"
              >
                <span>{cat.emoji} {cat.label} ({sets.length})</span>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {isExpanded && (
                <div className="px-2 pb-2 space-y-1">
                  {sets.map(set => {
                    const selected = selectedSets.includes(set.id);
                    return (
                      <button
                        key={set.id}
                        type="button"
                        onClick={() => toggleSet(set.id)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          selected
                            ? "bg-brick-green/15 border border-brick-green/40 text-foreground"
                            : "hover:bg-muted/50 text-muted-foreground border border-transparent"
                        }`}
                      >
                        <Package className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">{set.setNumber}</span>
                          <span className="mx-1">—</span>
                          <span>{set.name}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({set.pieceCount} pcs)</span>
                        </div>
                        {selected && <span className="text-brick-green text-xs font-semibold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Allow extras toggle */}
      {selectedSets.length > 0 && (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allowExtras}
            onChange={e => onAllowExtrasChange(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-foreground">
            Allow extra pieces not in selected sets
          </span>
          <span className="text-xs text-muted-foreground">(extras will be flagged with sourcing info)</span>
        </label>
      )}
    </div>
  );
};

export default LegoSetSelector;
