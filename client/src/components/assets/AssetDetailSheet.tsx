import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, FileImage, Download, ExternalLink, Calendar, HardDrive, Tag } from "lucide-react";
import type { Asset } from "./AssetCard";

interface AssetDetailSheetProps {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssetDetailSheet({ asset, open, onOpenChange }: AssetDetailSheetProps) {
  if (!asset) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full border-l border-border shadow-2xl">
        <SheetHeader className="pb-6">
          <SheetTitle className="text-xl">{asset.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium uppercase tracking-wider">
              {asset.type}
            </span>
            <span className="text-muted-foreground">•</span>
            <span>{asset.size}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-6 -mr-6">
          {/* Preview */}
          <div className="bg-secondary/30 rounded-xl border border-border/50 overflow-hidden mb-8 flex items-center justify-center min-h-[300px]">
            {asset.type === "image" && asset.url ? (
              <img
                src={asset.url}
                alt={asset.name}
                className="w-full h-auto max-h-[400px] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                {asset.type === "document" ? (
                  <FileText className="w-24 h-24 mb-4 opacity-20" />
                ) : (
                  <FileImage className="w-24 h-24 mb-4 opacity-20" />
                )}
                <p>No preview available</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-6">
            <h3 className="font-semibold text-foreground">File Information</h3>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4" />
                  Uploaded
                </div>
                <p className="font-medium">
                  {asset.createdAt ? format(new Date(asset.createdAt), "MMMM d, yyyy") : "Unknown"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <HardDrive className="w-4 h-4" />
                  File Size
                </div>
                <p className="font-medium">{asset.size}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Tag className="w-4 h-4" />
                  Type
                </div>
                <p className="font-medium capitalize">{asset.type}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <ExternalLink className="w-4 h-4" />
                  Dimensions
                </div>
                <p className="font-medium">{asset.type === "image" ? "1920 × 1080" : "N/A"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 mt-auto">
          <Separator className="mb-6" />
          <div className="flex gap-3">
            <Button className="flex-1 gap-2 rounded-lg" size="lg">
              <Download className="w-4 h-4" />
              Download Asset
            </Button>
            <Button variant="outline" className="flex-1 gap-2 rounded-lg" size="lg">
              <ExternalLink className="w-4 h-4" />
              Share Link
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
