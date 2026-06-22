import { useState } from 'react';

import {
  ChevronDownIcon,
  ChevronUpIcon,
  LockClosedIcon,
} from '@heroicons/react/outline';

import {
  COMPANION_TONES,
  setMature,
  setTone,
  toneLabel,
  useCompanionPrefs,
  type CompanionTone,
} from '@utility/companionPrefs';

// The companion's persona-tone control, shared by the chat header AND the
// co-watch room composer so a viewer picks the same vibe (including the 18+
// "off the rails") wherever they call the companion in. State is the global
// companionPrefs store, so the choice carries across both surfaces. `placement`
// flips the menu above the trigger when it sits at the bottom of a panel (the
// room composer) instead of in a header.
const TonePicker: React.FC<{ placement?: 'bottom' | 'top' }> = ({
  placement = 'bottom',
}) => {
  const prefs = useCompanionPrefs();
  const [open, setOpen] = useState(false);
  const [confirmMature, setConfirmMature] = useState(false);

  const pickTone = (id: CompanionTone, mature?: boolean): void => {
    if (mature && !prefs.mature) {
      setConfirmMature(true);
      return;
    }
    setTone(id);
    setOpen(false);
    setConfirmMature(false);
  };

  const enableMature = (): void => {
    setMature(true);
    setTone('unhinged');
    setOpen(false);
    setConfirmMature(false);
  };

  const Caret = placement === 'top' ? ChevronUpIcon : ChevronDownIcon;
  const menuPos = placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirmMature(false);
        }}
        className="flex min-h-[44px] items-center gap-1 rounded-full border border-line/60 px-3 text-xs font-semibold text-muted transition [touch-action:manipulation] hover:border-accent/50 hover:text-fg active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {toneLabel(prefs.tone)}
        <Caret className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close tone menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
              setConfirmMature(false);
            }}
          />
          <div
            className={`absolute right-0 z-20 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-line/60 bg-canvas-2 p-1 shadow-lift ${menuPos}`}
            style={{ maxHeight: 'calc(85svh - 4.5rem)' }}
          >
            {COMPANION_TONES.map((t) => {
              const locked = Boolean(t.mature) && !prefs.mature;
              const active = prefs.tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTone(t.id, t.mature)}
                  className={`flex min-h-[44px] w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition [touch-action:manipulation] ${
                    active
                      ? 'bg-surface text-fg'
                      : 'text-muted hover:bg-surface/70 hover:text-fg'
                  }`}
                >
                  <span className="mt-0.5">
                    {locked ? (
                      <LockClosedIcon className="h-3.5 w-3.5 text-faint" />
                    ) : (
                      <span
                        className={`block h-2 w-2 rounded-full ${
                          active ? 'bg-accent' : 'bg-line'
                        }`}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-faint">
                      {t.blurb}
                    </span>
                  </span>
                </button>
              );
            })}

            {confirmMature && (
              <div className="m-1 rounded-lg border border-line/60 bg-surface/60 p-2.5">
                <p className="text-[11px] leading-snug text-muted">
                  Off the rails is 18+. It gets crude and sweary. Turn it on?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={enableMature}
                    className="min-h-[44px] rounded-full bg-aurora px-3 text-xs font-semibold text-accent-ink shadow-glow [touch-action:manipulation] active:scale-95 motion-reduce:active:scale-100"
                  >
                    Turn it on
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmMature(false)}
                    className="min-h-[44px] rounded-full px-3 text-xs font-semibold text-muted [touch-action:manipulation] hover:text-fg"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TonePicker;
