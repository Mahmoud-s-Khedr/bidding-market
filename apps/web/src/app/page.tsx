import Link from 'next/link';
import { ArrowRight, CheckCircle2, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="flex flex-col flex-1">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 md:py-24 border-b border-border bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-6">
            <Zap className="h-3.5 w-3.5" />
            <span>Next-Generation Bidding & Negotiation</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground mb-6">
            Where Requests Meet Offers, with <span className="text-primary">Real-Time Bidding</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Publish what you need or what you offer. Compare competitive bids, negotiate in
            real-time, and track milestones to project completion.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/listings" className="w-full sm:w-auto">
                Browse Marketplace
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/listings/new" className="w-full sm:w-auto">
                Post Request or Offer
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-16 md:py-20 container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Built for Transparent & Trustworthy Transactions
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            Everything you need from initial proposal to successful milestone delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Zap className="h-5 w-5" />
              </div>
              <CardTitle>Dual Marketplace</CardTitle>
              <CardDescription>
                Post service requests or product offers. Bidders can negotiate price and delivery
                terms directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Fixed, range, or negotiable pricing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Counter-offers & revisions thread</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <MessageSquare className="h-5 w-5" />
              </div>
              <CardTitle>Integrated Real-time Chat</CardTitle>
              <CardDescription>
                Collaborate with 1:1 messaging, attachments, voice notes, and read receipts built
                into every agreement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Live presence & typing indicators</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>File & voice message sharing</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>Milestones & Reviews</CardTitle>
              <CardDescription>
                Track deliverables, confirm milestone completions, and leave verified ratings and
                reviews.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Dual confirmation completion</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Transparent user rating history</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
