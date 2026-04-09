import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { Program } from '@/src/types';

interface ExcelImportProps {
  onExtracted: (items: any[]) => void;
}

export function ExcelImport({ onExtracted }: ExcelImportProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);
        
        const items = json.map(row => ({
          name: row.name || row.Name || row.Item || 'Unknown Item',
          vendor: row.vendor || row.Vendor || '',
          weight: row.weight || row.Weight || '',
          quantity: parseInt(row.quantity || row.Quantity || row.Qty || '1', 10) || 1,
          program: (row.program || row.Program || 'Grocery') as Program
        }));

        onExtracted(items);
        setIsProcessing(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Excel Import Error:', error);
      setIsProcessing(false);
      alert('Failed to parse Excel/CSV file.');
    }
  };

  return (
    <label className={cn(
      "w-full py-4 rounded-3xl font-bold text-lg wheat-grass-btn transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm",
      isProcessing && "opacity-50 cursor-not-allowed pointer-events-none"
    )}>
      <input type="file" className="hidden" onChange={handleFile} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
      {isProcessing ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Parsing File...</span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-6 h-6" />
          Import Excel / CSV
        </>
      )}
    </label>
  );
}
