import { useState } from 'react';

export default function SupportPage() {
  const [form, setForm] = useState({
    user_name: '',
    user_email: '',
    subject: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const r = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, priority: 'Medium', channel: 'email' }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to send ticket');
      setStatus('sent');
      setForm({ user_name: '', user_email: '', subject: '', message: '' });
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to send ticket');
    }
  }

  return (
    <div className="min-h-screen bg-[#080c10] text-white px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">Customer Support</h1>
        <p className="text-slate-400 mb-8">Send a ticket and our customer care team will handle it from the admin panel.</p>
        <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-white/5 p-6 grid gap-4">
          <input className="bg-black/30 border border-white/10 rounded-lg px-4 py-3 outline-none" placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} />
          <input className="bg-black/30 border border-white/10 rounded-lg px-4 py-3 outline-none" placeholder="Your email" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
          <input className="bg-black/30 border border-white/10 rounded-lg px-4 py-3 outline-none" placeholder="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
          <textarea className="bg-black/30 border border-white/10 rounded-lg px-4 py-3 outline-none min-h-40" placeholder="How can we help?" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required />
          <button disabled={status === 'sending'} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-lg px-4 py-3 font-bold uppercase tracking-wider">
            {status === 'sending' ? 'Sending...' : 'Submit Ticket'}
          </button>
          {status === 'sent' && <p className="text-green-400 text-sm">Ticket submitted successfully.</p>}
          {status === 'error' && <p className="text-red-400 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}