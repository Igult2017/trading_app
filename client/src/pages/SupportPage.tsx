export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#080c10] text-white px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">Customer Support</h1>
        <p className="text-slate-400 mb-8">Need help? Send us a message and the customer care team will review it.</p>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-slate-300 mb-2">Support access is handled through the admin customer care panel.</p>
          <p className="text-sm text-slate-500">If you are an admin, open the Admin Panel and choose Customer Care.</p>
        </div>
      </div>
    </div>
  );
}