import { InventoryItem } from '@/src/types';

export type SheetsAction =
  | 'ADD'
  | 'UPDATE'
  | 'DELETE'
  | 'TRANSFER'
  | 'ROLLOVER'
  | 'CHECKPOINT';

const QUEUE_KEY = 'bloom_sheets_queue';

type QueuedSync = {
  action: SheetsAction;
  timestamp: string;
  item: Partial<InventoryItem> | Record<string, unknown>;
};

function getWebhookUrl(): string {
  const v = import.meta.env.VITE_SHEETS_WEBHOOK_URL;
  return typeof v === 'string' ? v.trim() : '';
}

function loadQueue(): QueuedSync[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedSync[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedSync[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

/**
 * Best-effort flush. Uses `no-cors` to Apps Script; network errors keep the queue.
 * Call on app load and on `online` so offline mutations retry later.
 */
export async function flushSheetsQueue(): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;

  let q = loadQueue();
  while (q.length > 0) {
    const first = q[0];
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: first.action,
          timestamp: first.timestamp,
          item: first.item,
        }),
      });
      q = q.slice(1);
      saveQueue(q);
      console.log('[SheetsSync] Dispatched queued:', first.action);
    } catch (error) {
      console.error('[SheetsSync] Flush failed, will retry later', error);
      break;
    }
  }
}

/**
 * Silent sync: always append to local queue, then attempt immediate send when URL is set.
 *
 * Example Apps Script `doPost` (extend for ROLLOVER — e.g. copy active sheet to "Archive YYYY-MM"):
 *
 *   function doPost(e) {
 *     var ss = SpreadsheetApp.getActiveSpreadsheet();
 *     var data = JSON.parse(e.postData.contents);
 *     if (data.action === 'ROLLOVER') {
 *       var sh = ss.getActiveSheet();
 *       var archive = ss.insertSheet('Archive ' + new Date().toISOString().slice(0, 10));
 *       sh.copyTo(ss).setName('Baseline ' + new Date().toISOString().slice(0, 10)); // adjust to your workflow
 *       return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
 *     }
 *     var sheet = ss.getActiveSheet();
 *     var row = data.item.name ? [new Date(), data.action, data.item.name, data.item.program, data.item.quantity, data.item.vendor] : [new Date(), data.action, JSON.stringify(data.item)];
 *     sheet.appendRow(row);
 *     return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
 *   }
 *
 * Deploy Web App: Execute as Me, access Anyone
 */
export const syncToSheets = async (
  action: SheetsAction,
  item: Partial<InventoryItem> | Record<string, unknown>
) => {
  const entry: QueuedSync = {
    action,
    timestamp: new Date().toISOString(),
    item,
  };
  const q = loadQueue();
  q.push(entry);
  saveQueue(q);

  const url = getWebhookUrl();
  if (!url) {
    console.warn('[SheetsSync] VITE_SHEETS_WEBHOOK_URL not set; queued for later');
    return;
  }

  await flushSheetsQueue();
};
