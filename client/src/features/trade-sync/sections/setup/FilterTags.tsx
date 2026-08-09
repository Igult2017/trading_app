import { Icon } from "../../components/Icon";
import { INSTRUMENTS, SESSIONS } from "../../data/dashboard";
import type { CopySetup } from "../../hooks/useCopySetup";

interface FilterTagsProps {
  setup: CopySetup;
}

interface TagGroupProps {
  icon: string;
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

function TagGroup({ icon, label, options, selected, onToggle }: TagGroupProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="text-on-surface-variant text-[15px]" />
        <span className="font-label-xs text-on-surface-variant uppercase">{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={s}
            className={`ct-tag-btn px-4 py-1.5 rounded border border-surface-container-highest font-body-md ${
              selected.includes(s) ? "active" : ""
            }`}
            onClick={() => onToggle(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** When the engine is allowed to copy, and what it's allowed to copy. */
export function FilterTags({ setup }: FilterTagsProps) {
  const { sessions, setSessions, instruments, setInstruments, toggleFrom } = setup;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <TagGroup
        icon="schedule"
        label="Allowed sessions"
        options={SESSIONS}
        selected={sessions}
        onToggle={(s) => toggleFrom(sessions, setSessions, s)}
      />
      <TagGroup
        icon="public"
        label="Allowed instruments"
        options={INSTRUMENTS}
        selected={instruments}
        onToggle={(s) => toggleFrom(instruments, setInstruments, s)}
      />
    </div>
  );
}
