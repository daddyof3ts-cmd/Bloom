import { X } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-white/30 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900">Bloom — help</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-slate-700">
          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Inventory table</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Search by name, vendor, or category.</li>
              <li>Filter by program (Open-Hours / Grocery) and category, including uncategorized lines.</li>
              <li>
                <strong>Low stock</strong> shows a banner when any line is at or below the threshold; use the button to
                show only those rows.
              </li>
              <li>
                <strong>Missing details</strong> flags rows missing vendor, category, or pack weight; filter to focus on
                those lines.
              </li>
              <li>Edit quantity and pack weight inline; use actions to transfer, delete, or open history.</li>
              <li>
                <strong>Merge duplicates</strong> combines two lines; <strong>Rollover</strong> saves a checkpoint
                snapshot.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Add stock</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Voice</strong> — speak an intake line, then review the form before saving.
              </li>
              <li>
                <strong>Photo</strong> — restock or consume against a matched line (requires Gemini API key).
              </li>
              <li>
                <strong>Manual entry</strong> — full form with duplicate suggestions.
              </li>
              <li>
                <strong>Invoice OCR / Excel</strong> — batch add; imports are written in bulk for speed (not each line on
                the undo stack).
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Remove stock</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Photo consume subtracts from a matched line.</li>
              <li>Bulk remover matches pasted or spoken lists to inventory and subtracts quantities.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Guest mode & checkpoints</h3>
            <p>
              As a guest, inventory stays on this device. Rollover saves a local checkpoint. Sign in with Google to sync
              offline rows to Firestore when you are ready.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Undo & redo</h3>
            <p>
              Use the header buttons or <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Ctrl+Z</kbd>{' '}
              /{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Ctrl+Y</kbd> (or{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+Z</kbd> for redo). Covers
              edits, adds, deletes, and bulk quantity subtract — session only, cleared on reload. Merge and transfer are
              not included in v1.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Bloom AI chat</h3>
            <p>
              Floating assistant (bottom-right) answers questions about your current inventory snapshot. Requires{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">GEMINI_API_KEY</code>.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Google Sheets (optional)</h3>
            <p>
              If <code className="rounded bg-slate-100 px-1 font-mono text-xs">VITE_SHEETS_WEBHOOK_URL</code> is set,
              changes are queued and posted to your Apps Script webhook.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">Environment & troubleshooting</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Set <code className="rounded bg-slate-100 px-1 font-mono text-xs">GEMINI_API_KEY</code> in{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">.env</code> for AI features.
              </li>
              <li>Firebase client config lives in the project JSON; enable Google sign-in in the Firebase console.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
