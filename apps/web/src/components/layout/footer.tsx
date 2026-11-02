import * as React from 'react';
import Link from 'next/link';
import { Store } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2 text-foreground font-bold text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Store className="h-4 w-4" />
              </div>
              <span>
                Bid<span className="text-primary">Market</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The modern marketplace connecting individuals and businesses with real-time bidding,
              integrated negotiation, and milestone delivery.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Marketplace</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/listings" className="hover:text-foreground transition-colors">
                  Browse Listings
                </Link>
              </li>
              <li>
                <Link href="/listings/new" className="hover:text-foreground transition-colors">
                  Post a Request
                </Link>
              </li>
              <li>
                <Link href="/listings/new" className="hover:text-foreground transition-colors">
                  Offer a Service
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Account</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/messages" className="hover:text-foreground transition-colors">
                  Messages
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground transition-colors">
                  Create account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Legal & Safety</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="text-xs text-muted-foreground">Terms of Service</span>
              </li>
              <li>
                <span className="text-xs text-muted-foreground">Privacy Policy</span>
              </li>
              <li>
                <span className="text-xs text-muted-foreground">Community Guidelines</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} BidMarket. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">Built with Next.js 16, React 19 & Tailwind CSS</p>
        </div>
      </div>
    </footer>
  );
}
