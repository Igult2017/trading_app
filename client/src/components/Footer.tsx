import { Link } from 'wouter';
import { Facebook, Instagram, Send } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-gray-100 text-gray-700 border-t border-gray-300 mt-12">
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">

        {/* Grid Layout for Links */}
        <div className="grid grid-cols-2 gap-y-10 gap-x-6 sm:grid-cols-4 lg:grid-cols-6 xl:gap-x-8">

          {/* Column 1: Markets & Data */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Markets & Data</h3>
            <ul role="list" className="space-y-3">
              <li><Link href="/" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Major Pairs</Link></li>
              <li><Link href="/stocks" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Stocks & Equities</Link></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Commodities</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Crypto Currencies</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">High Impact News</a></li>
            </ul>
          </div>

          {/* Column 2: Platform */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform</h3>
            <ul role="list" className="space-y-3">
              <li><Link href="/signals" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Signals & Alerts</Link></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Trading Strategies</a></li>
              <li><Link href="/analytics" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Analytics</Link></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">API Access</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Documentation</a></li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Company</h3>
            <ul role="list" className="space-y-3">
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">About Us</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Careers (We're Hiring)</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Our Team</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Blog</a></li>
            </ul>
          </div>

          {/* Column 4: Partners */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Partners</h3>
            <ul role="list" className="space-y-3">
              {/* Add future partner links here */}
            </ul>
          </div>

          {/* Column 5: Legal & Support */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Legal & Support</h3>
            <ul role="list" className="space-y-3">
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Terms of Service</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Privacy Policy</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Risk Disclaimer</a></li>
              <li><a href="#" className="text-sm text-gray-600 hover:text-blue-600 transition duration-150">Contact Us</a></li>
            </ul>
          </div>

          {/* Column 6: Branding & Social */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 border-t sm:border-t-0 pt-6 sm:pt-0 border-gray-300 lg:border-none">
            <div className="flex flex-wrap items-center mb-3">
              <span className="text-base font-extrabold text-bull-green">Find</span>
              <span className="text-base font-extrabold text-gray-900">Buy</span>
              <span className="text-base font-extrabold text-gray-900">and</span>
              <span className="text-base font-extrabold text-bear-red">Sell</span>
              <span className="text-base font-extrabold text-gray-900">Zones.com</span>
            </div>
            <p className="text-xs text-gray-500 mb-6">Less Charting. No worries. Only precision.</p>
            
            {/* Social Media Icons */}
            <div className="flex space-x-5 items-center">
              
              {/* Facebook */}
              <a href="#" className="text-[#1877F2] hover:opacity-80 transition duration-150" aria-label="Facebook">
                <Facebook className="w-6 h-6" fill="currentColor" />
              </a>
              
              {/* Instagram */}
              <a href="#" className="text-[#DD2A7B] hover:opacity-80 transition duration-150" aria-label="Instagram">
                <Instagram className="w-6 h-6" />
              </a>
              
              {/* Telegram */}
              <a href="#" className="text-[#26A5E4] hover:opacity-80 transition duration-150" aria-label="Telegram">
                <Send className="w-6 h-6" fill="currentColor" />
              </a>
              
              {/* TikTok */}
              <a href="#" className="hover:opacity-80 transition duration-150" aria-label="TikTok">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path fill="#010101" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
              </a>
            </div>
          </div>

        </div>

        {/* Separator Line */}
        <div className="mt-12 mb-8 border-t border-gray-300"></div>

        {/* Copyright */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            &copy; 2025 <span className="font-extrabold text-bull-green">Find</span>
            <span className="font-extrabold text-gray-900">Buy</span>
            <span className="font-extrabold text-gray-900">and</span>
            <span className="font-extrabold text-bear-red">Sell</span>
            <span className="font-extrabold text-gray-900">Zones.com</span>. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  );
}
