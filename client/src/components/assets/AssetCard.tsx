import { FileText, FileImage, MoreVertical, Download, Trash2, Maximize2 } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { motion } from "framer-motion";

export interface Asset {
  id: number;
  name: string;
  type: string;
  size: string;
  url?: string | null;
  createdAt?: Date | string | null;
}

interface AssetCardProps {
  asset: Asset;
  onDelete: (id: number) => void;
  onClick: (asset: Asset) => void;
}

export function AssetCard({ asset, onDelete, onClick }: AssetCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const getIcon = () => {
    switch (asset.type) {
      case "image":
        return asset.url ? (
          <img
            src={asset.url}
            alt={asset.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary">
            <FileImage className="w-12 h-12 opacity-50" />
          </div>
        );
      case "document":
        return (
          <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary">
            <FileText className="w-12 h-12 opacity-50" />
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
            <FileText className="w-12 h-12 opacity-50" />
          </div>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative bg-card rounded-xl border border-border/60 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onClick(asset)}
    >
      {/* Preview Area */}
      <div className="aspect-[4/3] w-full overflow-hidden border-b border-border/40 relative">
        {getIcon()}
        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-2 transition-opacity duration-200 ${isHovered ? "opacity-100" : "opacity-0"}`}>
          <button className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {asset.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold bg-secondary px-1.5 py-0.5 rounded">
                {asset.type}
              </span>
              <span className="text-xs text-muted-foreground">{asset.size}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              {asset.createdAt ? format(new Date(asset.createdAt), "MMM d, yyyy") : "Unknown date"}
            </p>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-1 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground focus:outline-none">
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onClick(asset)}>
                  <Maximize2 className="mr-2 h-4 w-4" /> Preview
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => onDelete(asset.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
