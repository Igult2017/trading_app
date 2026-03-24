import { useState } from "react";
import { useLocation } from "wouter";
import { Upload, ArrowLeft, Search } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { AssetCard, type Asset } from "@/components/assets/AssetCard";
import { AssetDetailSheet } from "@/components/assets/AssetDetailSheet";
import { AssetSidebar } from "@/components/assets/AssetSidebar";
import { AssetUploadDialog } from "@/components/assets/AssetUploadDialog";

const PLACEHOLDER_ASSETS: Asset[] = [
  {
    id: 1,
    name: "EURUSD London Breakout Setup",
    type: "image",
    size: "1.8 MB",
    url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=800",
    createdAt: new Date("2026-03-20"),
  },
  {
    id: 2,
    name: "GBPJPY Structure Analysis",
    type: "image",
    size: "2.3 MB",
    url: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=800",
    createdAt: new Date("2026-03-18"),
  },
  {
    id: 3,
    name: "Weekly Bias Report — March 2026",
    type: "document",
    size: "420 KB",
    url: null,
    createdAt: new Date("2026-03-17"),
  },
  {
    id: 4,
    name: "XAUUSD 4H Key Levels",
    type: "image",
    size: "3.1 MB",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
    createdAt: new Date("2026-03-15"),
  },
  {
    id: 5,
    name: "Trade Rules & Playbook v2",
    type: "document",
    size: "1.1 MB",
    url: null,
    createdAt: new Date("2026-03-10"),
  },
  {
    id: 6,
    name: "USDJPY Session Replay",
    type: "image",
    size: "2.7 MB",
    url: "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?auto=format&fit=crop&q=80&w=800",
    createdAt: new Date("2026-03-08"),
  },
];

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

export default function AssetsPage() {
  const [, navigate] = useLocation();
  const [assets, setAssets] = useState<Asset[]>(PLACEHOLDER_ASSETS);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = assets.filter((a) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "recent" && a.createdAt != null && new Date(a.createdAt) >= SEVEN_DAYS_AGO) ||
      a.type === filter;
    const matchesSearch = search === "" || a.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleAdd = (asset: Asset) => {
    setAssets((prev) => [asset, ...prev]);
  };

  const handleDelete = (id: number) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClick = (asset: Asset) => {
    setSelectedAsset(asset);
    setSheetOpen(true);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <AssetSidebar currentFilter={filter} onFilterChange={setFilter} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/journal")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Journal
            </button>
            <div className="w-px h-4 bg-border" />
            <h1 className="text-base font-semibold text-foreground">Asset Library</h1>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {assets.length} files
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 w-48 placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          </div>
        </header>

        {/* Grid */}
        <main className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <p className="text-sm">No assets found.</p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <AnimatePresence>
                {filtered.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onDelete={handleDelete}
                    onClick={handleClick}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>

      <AssetDetailSheet asset={selectedAsset} open={sheetOpen} onOpenChange={setSheetOpen} />
      <AssetUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onAdd={handleAdd} />
    </div>
  );
}
