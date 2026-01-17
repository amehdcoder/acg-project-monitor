import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileImage, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface DashboardExportProps {
  dashboardName: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

const DashboardExport = ({ dashboardName, containerRef }: DashboardExportProps) => {
  const [exporting, setExporting] = useState(false);

  const sanitizeFilename = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  };

  const exportAsImage = async (format: "png" | "jpeg") => {
    if (!containerRef.current) {
      toast.error("Dashboard container not found");
      return;
    }

    setExporting(true);
    try {
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${sanitizeFilename(dashboardName)}-${Date.now()}.${format}`;
      link.href = canvas.toDataURL(`image/${format}`, 0.9);
      link.click();

      toast.success(`Dashboard exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export dashboard");
    } finally {
      setExporting(false);
    }
  };

  const exportAsPDF = async () => {
    if (!containerRef.current) {
      toast.error("Dashboard container not found");
      return;
    }

    setExporting(true);
    try {
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Determine orientation based on aspect ratio
      const isLandscape = imgWidth > imgHeight;
      const pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "px",
        format: [imgWidth, imgHeight],
      });

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`${sanitizeFilename(dashboardName)}-${Date.now()}.pdf`);

      toast.success("Dashboard exported as PDF");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export dashboard as PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportAsImage("png")}>
          <FileImage className="h-4 w-4 mr-2" />
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsImage("jpeg")}>
          <FileImage className="h-4 w-4 mr-2" />
          Export as JPEG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DashboardExport;
