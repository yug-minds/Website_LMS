"use client";

import { useState, useEffect } from "react";

interface LazyExcelExportProps {
  data: any[];
  filename: string;
  onExport?: () => void;
  children: (exportFn: () => Promise<void>, isLoading: boolean) => React.ReactNode;
}

export default function LazyExcelExport({
  data,
  filename,
  onExport,
  children
}: LazyExcelExportProps) {
  const [ExcelJS, setExcelJS] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Dynamically import exceljs only when component mounts
    import("exceljs")
      .then((module) => {
        setExcelJS(module.default || module);
      })
      .catch((err) => {
        console.error("Failed to load exceljs:", err);
      });
  }, []);

  const handleExport = async () => {
    if (!ExcelJS) {
      console.error("ExcelJS not loaded yet");
      return;
    }

    setIsLoading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sheet 1");

      // Add headers
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE0E0E0" }
        };

        // Add data rows
        data.forEach((row) => {
          worksheet.addRow(headers.map((header) => row[header]));
        });
      }

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      onExport?.();
    } catch (error) {
      console.error("Error exporting to Excel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return <>{children(handleExport, isLoading || !ExcelJS)}</>;
}


