import { InventoryItem } from '@/src/types';

// IMPORTANT: Replace this URL with your deployed Google Apps Script Web App URL
// Instructions for Apps Script:
// 1. Go to script.google.com and create a new project
// 2. Paste the following code:
/*
  function doPost(e) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    sheet.appendRow([new Date(), data.action, data.item.name, data.item.program, data.item.quantity, data.item.vendor]);
    return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
  }
*/
// 3. Deploy as Web App -> Execute as "Me" -> Who has access "Anyone"
// 4. Paste the Web App URL below
const SHEETS_WEBHOOK_URL = ''; 

export const syncToSheets = async (action: 'ADD' | 'UPDATE' | 'DELETE' | 'TRANSFER', item: Partial<InventoryItem> | any) => {
  if (!SHEETS_WEBHOOK_URL) return; // Silent return if not configured

  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors', // Necessary to avoid CORS issues when posting to simple AppScripts from client
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        timestamp: new Date().toISOString(),
        item
      })
    });
    console.log('[SheetsSync] Request dispatched to Google Sheets for:', action, item.name);
  } catch (error) {
    console.error('[SheetsSync] Failed to dispatch to Google Sheets', error);
  }
};
